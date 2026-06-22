package services

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/petrovito/china-trip-bookings/backend/internal/db"
	"github.com/petrovito/china-trip-bookings/backend/internal/models"
)

// ── Shared DB helpers ─────────────────────────────────────────────────────────

const bookingSelectCols = `
	id, type, name, date::text, date_end::text, time, time_end, origin, location,
	price, currency, platform, reference, notes, travelers, paid_by,
	settled, segment_id, pass_code, pass_format, map_query, map_lat,
	map_lng, map_provider, map_place_id, details, created_at
`

func scanBooking(rows interface {
	Scan(dest ...any) error
}) (models.Booking, error) {
	var b models.Booking
	err := rows.Scan(
		&b.ID, &b.Type, &b.Name, &b.Date, &b.DateEnd, &b.Time, &b.TimeEnd,
		&b.Origin, &b.Location, &b.Price, &b.Currency, &b.Platform, &b.Reference,
		&b.Notes, &b.Travelers, &b.PaidBy, &b.Settled, &b.SegmentID, &b.PassCode,
		&b.PassFormat, &b.MapQuery, &b.MapLat, &b.MapLng, &b.MapProvider,
		&b.MapPlaceID, &b.Details, &b.CreatedAt,
	)
	return b, err
}

func FetchAllBookings(ctx context.Context) ([]models.Booking, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT `+bookingSelectCols+`
		FROM bookings ORDER BY date ASC NULLS LAST
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Booking
	for rows.Next() {
		b, err := scanBooking(rows)
		if err == nil {
			out = append(out, b)
		}
	}
	return out, nil
}

func FetchAllSegments(ctx context.Context) ([]models.Segment, error) {
	rows, err := db.Pool.Query(ctx,
		"SELECT id, location, sort_order, created_at FROM segments ORDER BY sort_order ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Segment
	for rows.Next() {
		var s models.Segment
		if err := rows.Scan(&s.ID, &s.Location, &s.SortOrder, &s.CreatedAt); err == nil {
			out = append(out, s)
		}
	}
	return out, nil
}

func FetchAllTodos(ctx context.Context) ([]models.Todo, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT id, title, category, assignee, done, deadline::text, segment_id, booking_id, created_at
		FROM todos ORDER BY category, created_at
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Todo
	for rows.Next() {
		var t models.Todo
		if err := rows.Scan(&t.ID, &t.Title, &t.Category, &t.Assignee, &t.Done,
			&t.Deadline, &t.SegmentID, &t.BookingID, &t.CreatedAt); err == nil {
			out = append(out, t)
		}
	}
	return out, nil
}

// ── Trip computation ──────────────────────────────────────────────────────────

// dayCurrencySummary returns a human-readable spend summary like "150 CNY + 25 USD".
func dayCurrencySummary(bks []models.Booking) string {
	byCur := map[string]float64{}
	for _, b := range bks {
		if b.Price != nil && b.Currency != "" {
			byCur[b.Currency] += *b.Price
		}
	}
	if len(byCur) == 0 {
		return ""
	}
	currencies := make([]string, 0, len(byCur))
	for c := range byCur {
		currencies = append(currencies, c)
	}
	sort.Strings(currencies)
	parts := make([]string, 0, len(currencies))
	for _, c := range currencies {
		parts = append(parts, fmt.Sprintf("%.0f %s", byCur[c], c))
	}
	return strings.Join(parts, " + ")
}

func buildTripSegment(seg models.Segment, bks []models.Booking, todos []models.Todo, today string) *models.TripSegment {
	ts := &models.TripSegment{
		ID:        seg.ID,
		Location:  seg.Location,
		SortOrder: seg.SortOrder,
		Todos:     todos,
		Days:      []models.TripDay{},
	}
	if ts.Todos == nil {
		ts.Todos = []models.Todo{}
	}

	if len(bks) == 0 {
		ts.MissingHotel = true
		return ts
	}

	// Date range from all bookings in segment
	var startDate, endDate string
	for _, b := range bks {
		if b.Date != nil && (startDate == "" || *b.Date < startDate) {
			startDate = *b.Date
		}
		end := ""
		if b.DateEnd != nil {
			end = *b.DateEnd
		} else if b.Date != nil {
			end = *b.Date
		}
		if end != "" && (endDate == "" || end > endDate) {
			endDate = end
		}
	}

	if startDate != "" {
		ts.StartDate = &startDate
	}
	if endDate != "" {
		ts.EndDate = &endDate
	}

	ts.IsPast = endDate != "" && endDate < today
	ts.IsActive = startDate != "" && endDate != "" && startDate <= today && today <= endDate

	// Hotel
	for i, b := range bks {
		if b.Type == "hotel" {
			ts.Hotel = &bks[i]
			break
		}
	}
	ts.MissingHotel = ts.Hotel == nil

	// Build days
	if startDate == "" || endDate == "" {
		return ts
	}
	cur, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return ts
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return ts
	}

	for !cur.After(end) {
		d := cur.Format("2006-01-02")
		var food, cityTransport, others []models.Booking

		for _, b := range bks {
			if b.Type == "hotel" || b.Type == "flight" || b.Type == "train" {
				continue
			}
			if b.Date == nil || *b.Date != d {
				continue
			}
			switch b.Type {
			case "food":
				food = append(food, b)
			case "city_transport":
				cityTransport = append(cityTransport, b)
			default:
				others = append(others, b)
			}
		}

		// Ensure non-nil slices in JSON
		if food == nil {
			food = []models.Booking{}
		}
		if cityTransport == nil {
			cityTransport = []models.Booking{}
		}
		if others == nil {
			others = []models.Booking{}
		}

		ts.Days = append(ts.Days, models.TripDay{
			Date:          d,
			IsToday:       d == today,
			OtherBookings: others,
			Food: models.TripDayGroup{
				Count:   len(food),
				Summary: dayCurrencySummary(food),
				Items:   food,
			},
			CityTransport: models.TripDayGroup{
				Count:   len(cityTransport),
				Summary: dayCurrencySummary(cityTransport),
				Items:   cityTransport,
			},
		})
		cur = cur.AddDate(0, 0, 1)
	}
	return ts
}

// ComputeTrip builds the full trip timeline from DB data.
func ComputeTrip(ctx context.Context) (*models.TripResponse, error) {
	today := time.Now().Format("2006-01-02")

	bookings, err := FetchAllBookings(ctx)
	if err != nil {
		return nil, err
	}
	segments, err := FetchAllSegments(ctx)
	if err != nil {
		return nil, err
	}
	todos, err := FetchAllTodos(ctx)
	if err != nil {
		return nil, err
	}

	// Group todos by segment_id
	segTodos := map[uuid.UUID][]models.Todo{}
	for _, t := range todos {
		if t.SegmentID != nil {
			segTodos[*t.SegmentID] = append(segTodos[*t.SegmentID], t)
		}
	}

	// Group bookings by segment_id
	segBks := map[uuid.UUID][]models.Booking{}
	for _, b := range bookings {
		if b.SegmentID != nil {
			segBks[*b.SegmentID] = append(segBks[*b.SegmentID], b)
		}
	}

	// Transits (flights + trains, no segment)
	var transits []models.Booking
	for _, b := range bookings {
		if b.Type == "flight" || b.Type == "train" {
			transits = append(transits, b)
		}
	}

	// Build TripSegments
	tripSegs := make([]*models.TripSegment, 0, len(segments))
	for _, seg := range segments {
		ts := buildTripSegment(seg, segBks[seg.ID], segTodos[seg.ID], today)
		tripSegs = append(tripSegs, ts)
	}

	// Build timeline items (internal sort struct)
	type tItem struct {
		kind    string
		date    string
		bIdx    int // index into transits
		sIdx    int // index into tripSegs
	}
	items := make([]tItem, 0, len(transits)+len(tripSegs))
	for i := range tripSegs {
		d := ""
		if tripSegs[i].StartDate != nil {
			d = *tripSegs[i].StartDate
		}
		items = append(items, tItem{kind: "segment", date: d, sIdx: i})
	}
	for i := range transits {
		d := ""
		if transits[i].Date != nil {
			d = *transits[i].Date
		}
		items = append(items, tItem{kind: "transit", date: d, bIdx: i})
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].date != items[j].date {
			return items[i].date < items[j].date
		}
		// transits sort before segments on the same date
		if items[i].kind == "transit" && items[j].kind == "segment" {
			return true
		}
		if items[i].kind == "segment" && items[j].kind == "transit" {
			return false
		}
		return false
	})

	// Set display_end_date: for each segment, look for the next transit after it
	for i, item := range items {
		if item.kind != "segment" {
			continue
		}
		seg := tripSegs[item.sIdx]
		displayEnd := seg.EndDate
		for j := i + 1; j < len(items); j++ {
			next := items[j]
			if next.kind != "transit" {
				continue
			}
			nextDate := ""
			if transits[next.bIdx].Date != nil {
				nextDate = *transits[next.bIdx].Date
			}
			segStart := ""
			if seg.StartDate != nil {
				segStart = *seg.StartDate
			}
			if nextDate >= segStart {
				d := nextDate
				displayEnd = &d
			}
			break
		}
		seg.DisplayEndDate = displayEnd
	}

	// Set missing_transport_next: for each segment, check if there's a transit to the next segment
	for i, item := range items {
		if item.kind != "segment" {
			continue
		}
		seg := tripSegs[item.sIdx]
		// Only flag future segments
		nextStart := ""
		// Find the next segment in timeline
		for j := i + 1; j < len(items); j++ {
			if items[j].kind != "segment" {
				continue
			}
			nextSeg := tripSegs[items[j].sIdx]
			if nextSeg.StartDate != nil {
				nextStart = *nextSeg.StartDate
			}
			if nextStart == "" || nextStart < today {
				break
			}
			// Check if there's a transit to nextSeg.Location
			hasTransport := false
			for _, t := range transits {
				loc := ""
				if t.Location != nil {
					loc = strings.TrimSpace(*t.Location)
				}
				if strings.EqualFold(loc, strings.TrimSpace(nextSeg.Location)) {
					hasTransport = true
					break
				}
			}
			seg.MissingTransportNext = !hasTransport
			break
		}
	}

	// Build final TripItems
	timeline := make([]models.TripItem, 0, len(items))
	for _, item := range items {
		if item.kind == "transit" {
			b := transits[item.bIdx]
			timeline = append(timeline, models.TripItem{Kind: "transit", Booking: &b})
		} else {
			timeline = append(timeline, models.TripItem{Kind: "segment", Segment: tripSegs[item.sIdx]})
		}
	}

	return &models.TripResponse{
		Today:    today,
		Timeline: timeline,
	}, nil
}
