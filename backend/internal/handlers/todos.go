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

func ListTodos(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(r.Context(), `
		SELECT id, title, category, assignee, done, deadline, segment_id, booking_id, created_at
		FROM todos ORDER BY category, created_at
	`)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	var todos []models.Todo
	for rows.Next() {
		var t models.Todo
		if err := rows.Scan(&t.ID, &t.Title, &t.Category, &t.Assignee, &t.Done, &t.Deadline,
			&t.SegmentID, &t.BookingID, &t.CreatedAt); err == nil {
			todos = append(todos, t)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(todos)
}

func CreateTodo(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title     string     `json:"title"`
		Category  *string    `json:"category"`
		Assignee  *string    `json:"assignee"`
		Deadline  *string    `json:"deadline"`
		SegmentID *uuid.UUID `json:"segment_id"`
		BookingID *uuid.UUID `json:"booking_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, 400, err.Error())
		return
	}
	if body.Title == "" {
		writeJSONError(w, 400, "title required")
		return
	}
	cat := "do"
	if body.Category != nil {
		cat = *body.Category
	}
	assignee := "peter"
	if body.Assignee != nil {
		assignee = *body.Assignee
	}

	var t models.Todo
	err := db.Pool.QueryRow(r.Context(), `
		INSERT INTO todos (title, category, assignee, deadline, segment_id, booking_id, done)
		VALUES ($1, $2, $3, $4, $5, $6, false)
		RETURNING id, title, category, assignee, done, deadline, segment_id, booking_id, created_at
	`, body.Title, cat, assignee, body.Deadline, body.SegmentID, body.BookingID,
	).Scan(&t.ID, &t.Title, &t.Category, &t.Assignee, &t.Done, &t.Deadline,
		&t.SegmentID, &t.BookingID, &t.CreatedAt)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(t)
}

func PatchTodo(w http.ResponseWriter, r *http.Request) {
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

	allowed := map[string]bool{"title": true, "category": true, "assignee": true, "done": true, "deadline": true, "segment_id": true, "booking_id": true}
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
	query := fmt.Sprintf("UPDATE todos SET %s WHERE id = $%d RETURNING id, title, category, assignee, done, deadline, segment_id, booking_id, created_at", strings.Join(sets, ", "), i)
	var t models.Todo
	// FIX: use = not := (err already declared from uuid.Parse above)
	err = db.Pool.QueryRow(r.Context(), query, args...).Scan(
		&t.ID, &t.Title, &t.Category, &t.Assignee, &t.Done, &t.Deadline,
		&t.SegmentID, &t.BookingID, &t.CreatedAt,
	)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(t)
}

func DeleteTodo(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONError(w, 400, "invalid id")
		return
	}
	// FIX: use = not := (err already declared from uuid.Parse above)
	_, err = db.Pool.Exec(r.Context(), "DELETE FROM todos WHERE id = $1", id)
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}
