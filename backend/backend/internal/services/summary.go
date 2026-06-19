package services

import (
	"sort"

	"github.com/petrovito/china-trip-bookings/backend/internal/models"
)

var ExpenseTypes = map[string]bool{
	"flight": true, "hotel": true, "train": true, "ticket": true, "food": true, "shopping": true,
}

func peterShare(b models.Booking) float64 {
	if b.Price == nil {
		return 0
	}
	p := *b.Price
	if b.Travelers == "peter" {
		return p
	}
	if b.Travelers == "friend" {
		return 0
	}
	return p / 2
}

type CurrencySummary struct {
	Currency     string             `json:"currency"`
	Total        float64            `json:"total"`
	PendingTotal float64            `json:"pendingTotal"`
	POwes        float64            `json:"pOwes"`
	Count        int                `json:"count"`
	PendingCount int                `json:"pendingCount"`
	SettledCount int                `json:"settledCount"`
	ByCategory   map[string]float64 `json:"byCategory"`
}

type SummaryResponse struct {
	Currencies []CurrencySummary `json:"currencies"`
}

func ComputeCurrencySummaries(bookings []models.Booking) *SummaryResponse {
	byCurrency := make(map[string]*CurrencySummary)

	for _, b := range bookings {
		if b.Price == nil || b.Currency == "" || !ExpenseTypes[b.Type] {
			continue
		}
		price := *b.Price
		cur := b.Currency

		if _, ok := byCurrency[cur]; !ok {
			byCurrency[cur] = &CurrencySummary{
				Currency:   cur,
				ByCategory: make(map[string]float64),
			}
		}
		bucket := byCurrency[cur]
		bucket.Total += price
		bucket.Count++
		bucket.ByCategory[b.Type] += price

		if b.PaidBy == nil {
			bucket.PendingTotal += price
			bucket.PendingCount++
			continue
		}
		if b.Settled {
			bucket.SettledCount++
		} else {
			fronted := 0.0
			if *b.PaidBy == "peter" {
				fronted = price
			}
			bucket.POwes += peterShare(b) - fronted
		}
	}

	currencies := make([]CurrencySummary, 0, len(byCurrency))
	for _, c := range byCurrency {
		currencies = append(currencies, *c)
	}
	sort.Slice(currencies, func(i, j int) bool {
		return currencies[i].Currency < currencies[j].Currency
	})
	return &SummaryResponse{Currencies: currencies}
}
