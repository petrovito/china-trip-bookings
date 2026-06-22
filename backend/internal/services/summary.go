package services

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/petrovito/china-trip-bookings/backend/internal/models"
)

// ── Expense type set ──────────────────────────────────────────────────────────

// AllExpenseTypes lists booking types that count as expenses (in display order).
var AllExpenseTypes = []string{
	"flight", "hotel", "train", "ticket", "food", "city_transport", "shopping",
}

var expenseTypeSet = map[string]bool{
	"flight": true, "hotel": true, "train": true, "ticket": true,
	"food": true, "city_transport": true, "shopping": true,
}

// ── Exchange rate cache ───────────────────────────────────────────────────────

var (
	rateMu        sync.Mutex
	cachedRates   map[string]float64
	cachedRatesAt string
	ratesFetchedAt time.Time
)

// FetchRates returns DKK-base exchange rates, caching for 30 minutes.
// Returns stale data on error if available.
func FetchRates() (rates map[string]float64, ratesAt string, err error) {
	rateMu.Lock()
	defer rateMu.Unlock()

	if cachedRates != nil && time.Since(ratesFetchedAt) < 30*time.Minute {
		return cachedRates, cachedRatesAt, nil
	}

	client := &http.Client{Timeout: 6 * time.Second}
	resp, fetchErr := client.Get("https://open.er-api.com/v6/latest/DKK")
	if fetchErr != nil {
		return cachedRates, cachedRatesAt, fetchErr
	}
	defer resp.Body.Close()

	var result struct {
		Result         string             `json:"result"`
		TimeLastUpdate string             `json:"time_last_update_utc"`
		Rates          map[string]float64 `json:"rates"`
	}
	if decErr := json.NewDecoder(resp.Body).Decode(&result); decErr != nil {
		return cachedRates, cachedRatesAt, decErr
	}
	if result.Result == "success" && len(result.Rates) > 0 {
		cachedRates = result.Rates
		cachedRatesAt = result.TimeLastUpdate
		ratesFetchedAt = time.Now()
	}
	return cachedRates, cachedRatesAt, nil
}

// ── DKK conversion helpers ────────────────────────────────────────────────────

// toDKK converts an amount to DKK using DKK-base rates.
// Returns (0, false) if the currency rate is unavailable.
func toDKK(amount float64, currency string, rates map[string]float64) (float64, bool) {
	if rates == nil {
		return 0, false
	}
	if currency == "" || currency == "DKK" {
		return amount, true
	}
	rate, ok := rates[currency]
	if !ok || rate == 0 {
		return 0, false
	}
	return amount / rate, true
}

// ── Section builders ──────────────────────────────────────────────────────────

func filterByTravelers(bks []models.Booking, who string) []models.Booking {
	out := []models.Booking{}
	for _, b := range bks {
		switch who {
		case "": // collective = travelers is "both" or empty
			if b.Travelers == "both" || b.Travelers == "" {
				out = append(out, b)
			}
		default:
			if b.Travelers == who {
				out = append(out, b)
			}
		}
	}
	return out
}

func buildExpenseSection(bks []models.Booking, rates map[string]float64) models.ExpenseSection {
	byType := map[string]models.TypeExpenses{}
	section := models.ExpenseSection{ByType: byType}

	for _, t := range AllExpenseTypes {
		items := []models.Booking{}
		for _, b := range bks {
			if b.Type == t {
				items = append(items, b)
			}
		}
		if len(items) == 0 {
			continue
		}
		te := models.TypeExpenses{Items: items}
		for _, b := range items {
			if b.Price == nil {
				continue
			}
			dkk, ok := toDKK(*b.Price, b.Currency, rates)
			if !ok {
				te.Approx = true
				section.Approx = true
			} else {
				te.TotalDKK += dkk
				section.TotalDKK += dkk
			}
		}
		byType[t] = te
	}
	return section
}

func buildSettlement(bks []models.Booking, rates map[string]float64) models.SettlementData {
	sd := models.SettlementData{ByType: map[string]models.TypeSettlement{}}

	for _, t := range AllExpenseTypes {
		items := []models.Booking{}
		for _, b := range bks {
			if b.Type == t {
				items = append(items, b)
			}
		}
		if len(items) == 0 {
			continue
		}
		ts := models.TypeSettlement{Items: items}
		for _, b := range items {
			if b.Price == nil || b.PaidBy == nil {
				continue
			}
			dkk, ok := toDKK(*b.Price, b.Currency, rates)
			if !ok {
				ts.Approx = true
				sd.Approx = true
				continue
			}
			// positive contrib = peter owes friend; negative = friend owes peter
			var contrib float64
			if *b.PaidBy == "friend" {
				contrib = dkk / 2
			} else {
				contrib = -dkk / 2
			}
			if b.Settled {
				ts.SettledDKK += contrib
				sd.NetSettledDKK += contrib
			} else {
				ts.OutstandingDKK += contrib
				sd.NetOutstandingDKK += contrib
			}
		}
		ts.PeterOwes = ts.OutstandingDKK > 0.5
		ts.FriendOwes = ts.OutstandingDKK < -0.5
		sd.ByType[t] = ts
	}

	sd.PeterOwes = sd.NetOutstandingDKK > 0.5
	sd.FriendOwes = sd.NetOutstandingDKK < -0.5
	return sd
}

// ── Main entry point ──────────────────────────────────────────────────────────

// ComputeFullSummary builds the complete summary including DKK conversion.
func ComputeFullSummary(ctx context.Context) (*models.FullSummaryResponse, error) {
	bookings, err := FetchAllBookings(ctx)
	if err != nil {
		return nil, err
	}

	rates, ratesAt, _ := FetchRates() // ignore fetch error; nil rates → approx: true

	var ratesAtPtr *string
	if ratesAt != "" {
		s := ratesAt
		ratesAtPtr = &s
	}

	// Filter to expense bookings with a price
	var expBks []models.Booking
	for _, b := range bookings {
		if expenseTypeSet[b.Type] && b.Price != nil {
			expBks = append(expBks, b)
		}
	}

	collective := filterByTravelers(expBks, "")
	peterBks   := filterByTravelers(expBks, "peter")
	friendBks  := filterByTravelers(expBks, "friend")

	colSection := buildExpenseSection(collective, rates)
	petSection := buildExpenseSection(peterBks, rates)
	friSection := buildExpenseSection(friendBks, rates)

	// Per-person totals: personal + half of shared
	petTotal  := colSection.TotalDKK/2 + petSection.TotalDKK
	friTotal  := colSection.TotalDKK/2 + friSection.TotalDKK
	petApprox := colSection.Approx || petSection.Approx
	friApprox := colSection.Approx || friSection.Approx

	// Settlement from paid shared bookings
	var sharedPaid []models.Booking
	for _, b := range collective {
		if b.PaidBy != nil {
			sharedPaid = append(sharedPaid, b)
		}
	}
	settlement := buildSettlement(sharedPaid, rates)

	// Per-segment expense totals
	bySegment := map[string]models.SegmentExpenses{}
	for _, b := range expBks {
		if b.SegmentID == nil {
			continue
		}
		k := b.SegmentID.String()
		se := bySegment[k]
		if se.ByType == nil {
			se.ByType = map[string]models.DKKAmount{}
		}
		if b.Price == nil {
			bySegment[k] = se
			continue
		}
		dkk, ok := toDKK(*b.Price, b.Currency, rates)
		cur := se.ByType[b.Type]
		if !ok {
			cur.Approx = true
			se.Approx = true
		} else {
			cur.TotalDKK += dkk
			se.TotalDKK += dkk
		}
		se.ByType[b.Type] = cur
		bySegment[k] = se
	}

	return &models.FullSummaryResponse{
		Rates:   rates,
		RatesAt: ratesAtPtr,
		Collective: colSection,
		Peter:      petSection,
		Friend:     friSection,
		PerPerson: models.PerPersonTotals{
			Peter:  models.DKKAmount{TotalDKK: petTotal, Approx: petApprox},
			Friend: models.DKKAmount{TotalDKK: friTotal, Approx: friApprox},
		},
		Settlement: settlement,
		BySegment:  bySegment,
	}, nil
}
