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
)

func ListSegments(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(r.Context(), "SELECT id, location, sort_order, created_at FROM segments ORDER BY sort_order ASC")
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	var segments []models.Segment
	for rows.Next() {
		var s models.Segment
		if err := rows.Scan(&s.ID, &s.Location, &s.SortOrder, &s.CreatedAt); err == nil {
			segments = append(segments, s)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(segments)
}

func CreateSegment(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Location  string `json:"location"`
		SortOrder *int   `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, 400, err.Error())
		return
	}
	if strings.TrimSpace(body.Location) == "" {
		writeJSONError(w, 400, "location required")
		return
	}

	order := body.SortOrder
	if order == nil {
		var count int
		db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM segments").Scan(&count)
		o := count + 1
		order = &o
	}

	var s models.Segment
	err := db.Pool.QueryRow(r.Context(),
		"INSERT INTO segments (location, sort_order) VALUES ($1, $2) RETURNING id, location, sort_order, created_at",
		strings.TrimSpace(body.Location), *order,
	).Scan(&s.ID, &s.Location, &s.SortOrder, &s.CreatedAt)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(s)
}

func PatchSegment(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONError(w, 400, "invalid id")
		return
	}
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, 400, err.Error())
		return
	}

	allowed := map[string]bool{"location": true, "sort_order": true}
	var sets []string
	var args []interface{}
	i := 1
	for k, v := range body {
		if !allowed[k] {
			continue
		}
		sets = append(sets, fmt.Sprintf("%s = $%d", k, i))
		args = append(args, v)
		i++
	}
	if len(sets) == 0 {
		writeJSONError(w, 400, "no fields")
		return
	}
	args = append(args, id)
	query := fmt.Sprintf("UPDATE segments SET %s WHERE id = $%d RETURNING id, location, sort_order, created_at", strings.Join(sets, ", "), i)
	var s models.Segment
	// FIX: use = not := (err already declared from uuid.Parse above)
	err = db.Pool.QueryRow(r.Context(), query, args...).Scan(&s.ID, &s.Location, &s.SortOrder, &s.CreatedAt)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}

func DeleteSegment(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONError(w, 400, "invalid id")
		return
	}
	var count int
	db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM bookings WHERE segment_id = $1", id).Scan(&count)
	if count > 0 {
		writeJSONError(w, 409, fmt.Sprintf("Cannot delete: %d booking(s) still reference this segment.", count))
		return
	}
	// FIX: use = not := (err already declared from uuid.Parse above)
	_, err = db.Pool.Exec(r.Context(), "DELETE FROM segments WHERE id = $1", id)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}
