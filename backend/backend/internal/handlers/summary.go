package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/petrovito/china-trip-bookings/backend/internal/db"
	"github.com/petrovito/china-trip-bookings/backend/internal/models"
	"github.com/petrovito/china-trip-bookings/backend/internal/services"
)

func GetSummary(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(r.Context(), `
		SELECT id, type, name, date, date_end, time, time_end, origin, location,
		       price, currency, platform, reference, notes, travelers, paid_by,
		       settled, segment_id, pass_code, pass_format, map_query, map_lat,
		       map_lng, map_provider, map_place_id, details, created_at
		FROM bookings
	`)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(500)
		w.Write([]byte(`{"error":"` + err.Error() + `"}`))
		return
	}
	defer rows.Close()

	var bookings []models.Booking
	for rows.Next() {
		var b models.Booking
		if err := rows.Scan(
			&b.ID, &b.Type, &b.Name, &b.Date, &b.DateEnd, &b.Time, &b.TimeEnd,
			&b.Origin, &b.Location, &b.Price, &b.Currency, &b.Platform, &b.Reference,
			&b.Notes, &b.Travelers, &b.PaidBy, &b.Settled, &b.SegmentID, &b.PassCode,
			&b.PassFormat, &b.MapQuery, &b.MapLat, &b.MapLng, &b.MapProvider,
			&b.MapPlaceID, &b.Details, &b.CreatedAt,
		); err == nil {
			bookings = append(bookings, b)
		}
	}

	summary := services.ComputeCurrencySummaries(bookings)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}
