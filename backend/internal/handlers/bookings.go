package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/petrovito/china-trip-bookings/backend/internal/db"
	"github.com/petrovito/china-trip-bookings/backend/internal/models"
	"github.com/petrovito/china-trip-bookings/backend/internal/services"
)

func writeJSONError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write([]byte(fmt.Sprintf(`{"error":"%s"}`, strings.ReplaceAll(msg, `"`, `\"`))))
}

func parseUUIDParam(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		writeJSONError(w, 400, "invalid id")
		return uuid.Nil, false
	}
	return id, true
}

func ListBookings(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(r.Context(), `
		SELECT id, type, name, date, date_end, time, time_end, origin, location,
		       price, currency, platform, reference, notes, travelers, paid_by,
		       settled, segment_id, pass_code, pass_format, map_query, map_lat,
		       map_lng, map_provider, map_place_id, details, created_at
		FROM bookings ORDER BY date ASC NULLS LAST
	`)
	if err != nil {
		writeJSONError(w, 500, err.Error())
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bookings)
}

func CreateBooking(w http.ResponseWriter, r *http.Request) {
	var req services.BookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, 400, err.Error())
		return
	}
	b, err := services.CreateBookingRecord(r.Context(), req)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(b)
}

func UpdateBooking(w http.ResponseWriter, r *http.Request) {
	id, ok := parseUUIDParam(w, r, "id")
	if !ok {
		return
	}
	var req services.BookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, 400, err.Error())
		return
	}
	b, err := services.UpdateBookingRecord(r.Context(), id, req)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(b)
}

func PatchBooking(w http.ResponseWriter, r *http.Request) {
	id, ok := parseUUIDParam(w, r, "id")
	if !ok {
		return
	}
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, 400, err.Error())
		return
	}

	bodyBytes, _ := json.Marshal(body)
	var req services.BookingRequest
	json.Unmarshal(bodyBytes, &req)
	b, err := services.UpdateBookingRecord(r.Context(), id, req)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(b)
}

func DeleteBooking(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONError(w, 400, "invalid id")
		return
	}
	// FIX: use = not := (err already declared above)
	_, err = db.Pool.Exec(r.Context(), "DELETE FROM bookings WHERE id = $1", id)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

func ListTransport(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(r.Context(), `
		SELECT id, type, name, date, date_end, time, time_end, origin, location,
		       price, currency, platform, reference, notes, travelers, paid_by,
		       settled, segment_id, pass_code, pass_format, map_query, map_lat,
		       map_lng, map_provider, map_place_id, details, created_at
		FROM bookings WHERE type IN ('flight', 'train') ORDER BY date ASC NULLS LAST
	`)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	defer rows.Close()
	var bookings []models.Booking
	for rows.Next() {
		var b models.Booking
		if err := rows.Scan(&b.ID, &b.Type, &b.Name, &b.Date, &b.DateEnd, &b.Time, &b.TimeEnd, &b.Origin, &b.Location, &b.Price, &b.Currency, &b.Platform, &b.Reference, &b.Notes, &b.Travelers, &b.PaidBy, &b.Settled, &b.SegmentID, &b.PassCode, &b.PassFormat, &b.MapQuery, &b.MapLat, &b.MapLng, &b.MapProvider, &b.MapPlaceID, &b.Details, &b.CreatedAt); err == nil {
			bookings = append(bookings, b)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bookings)
}

func CreateTransport(w http.ResponseWriter, r *http.Request) {
	var req services.BookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, 400, err.Error())
		return
	}
	b, err := services.CreateBookingRecordForKind(r.Context(), "transport", req)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(b)
}

func UpdateTransport(w http.ResponseWriter, r *http.Request) {
	id, ok := parseUUIDParam(w, r, "id")
	if !ok {
		return
	}
	var req services.BookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, 400, err.Error())
		return
	}
	b, err := services.UpdateBookingRecordForKind(r.Context(), "transport", id, req)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(b)
}

func ListAccommodation(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(r.Context(), `
		SELECT id, type, name, date, date_end, time, time_end, origin, location,
		       price, currency, platform, reference, notes, travelers, paid_by,
		       settled, segment_id, pass_code, pass_format, map_query, map_lat,
		       map_lng, map_provider, map_place_id, details, created_at
		FROM bookings WHERE type = 'hotel' ORDER BY date ASC NULLS LAST
	`)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	defer rows.Close()
	var bookings []models.Booking
	for rows.Next() {
		var b models.Booking
		if err := rows.Scan(&b.ID, &b.Type, &b.Name, &b.Date, &b.DateEnd, &b.Time, &b.TimeEnd, &b.Origin, &b.Location, &b.Price, &b.Currency, &b.Platform, &b.Reference, &b.Notes, &b.Travelers, &b.PaidBy, &b.Settled, &b.SegmentID, &b.PassCode, &b.PassFormat, &b.MapQuery, &b.MapLat, &b.MapLng, &b.MapProvider, &b.MapPlaceID, &b.Details, &b.CreatedAt); err == nil {
			bookings = append(bookings, b)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bookings)
}

func CreateAccommodation(w http.ResponseWriter, r *http.Request) {
	var req services.BookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, 400, err.Error())
		return
	}
	b, err := services.CreateBookingRecordForKind(r.Context(), "accommodation", req)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(b)
}

func UpdateAccommodation(w http.ResponseWriter, r *http.Request) {
	id, ok := parseUUIDParam(w, r, "id")
	if !ok {
		return
	}
	var req services.BookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, 400, err.Error())
		return
	}
	b, err := services.UpdateBookingRecordForKind(r.Context(), "accommodation", id, req)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(b)
}

func ListExperiences(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(r.Context(), `
		SELECT id, type, name, date, date_end, time, time_end, origin, location,
		       price, currency, platform, reference, notes, travelers, paid_by,
		       settled, segment_id, pass_code, pass_format, map_query, map_lat,
		       map_lng, map_provider, map_place_id, details, created_at
		FROM bookings WHERE type IN ('ticket', 'food', 'activity', 'city_transport', 'shopping') ORDER BY date ASC NULLS LAST
	`)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	defer rows.Close()
	var bookings []models.Booking
	for rows.Next() {
		var b models.Booking
		if err := rows.Scan(&b.ID, &b.Type, &b.Name, &b.Date, &b.DateEnd, &b.Time, &b.TimeEnd, &b.Origin, &b.Location, &b.Price, &b.Currency, &b.Platform, &b.Reference, &b.Notes, &b.Travelers, &b.PaidBy, &b.Settled, &b.SegmentID, &b.PassCode, &b.PassFormat, &b.MapQuery, &b.MapLat, &b.MapLng, &b.MapProvider, &b.MapPlaceID, &b.Details, &b.CreatedAt); err == nil {
			bookings = append(bookings, b)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bookings)
}

func CreateExperience(w http.ResponseWriter, r *http.Request) {
	var req services.BookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, 400, err.Error())
		return
	}
	b, err := services.CreateBookingRecordForKind(r.Context(), "experience", req)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(b)
}

func UpdateExperience(w http.ResponseWriter, r *http.Request) {
	id, ok := parseUUIDParam(w, r, "id")
	if !ok {
		return
	}
	var req services.BookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, 400, err.Error())
		return
	}
	b, err := services.UpdateBookingRecordForKind(r.Context(), "experience", id, req)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(b)
}
