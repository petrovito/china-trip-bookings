package services

import (
	"context"

	"github.com/google/uuid"
	"github.com/petrovito/china-trip-bookings/backend/internal/db"
)

func CreateTodo(ctx context.Context, title, category, assignee string, deadline *string, segmentID, bookingID *uuid.UUID) error {
	_, err := db.Pool.Exec(ctx, `
		INSERT INTO todos (title, category, assignee, deadline, segment_id, booking_id, done)
		VALUES ($1, $2, $3, $4, $5, $6, false)
	`, title, category, assignee, deadline, segmentID, bookingID)
	return err
}
