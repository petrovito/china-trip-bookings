package services

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/petrovito/china-trip-bookings/backend/internal/db"
)

var TransitTypes = []string{"flight", "train"}

func offsetDate(dateStr string, days int) string {
	t, _ := time.Parse("2006-01-02", dateStr)
	t = t.AddDate(0, 0, days)
	return t.Format("2006-01-02")
}

func CreateNewSegment(ctx context.Context, loc string) (uuid.UUID, error) {
	var count int
	err := db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM segments").Scan(&count)
	if err != nil {
		return uuid.Nil, err
	}
	var id uuid.UUID
	err = db.Pool.QueryRow(ctx,
		"INSERT INTO segments (location, sort_order) VALUES ($1, $2) RETURNING id",
		loc, count+1,
	).Scan(&id)
	return id, err
}

func GetOrCreateSegment(ctx context.Context, bookingType string, location, bookingDate *string) (*uuid.UUID, error) {
	if location == nil || strings.TrimSpace(*location) == "" {
		return nil, nil
	}
	for _, t := range TransitTypes {
		if bookingType == t {
			return nil, nil
		}
	}
	loc := strings.TrimSpace(*location)

	rows, err := db.Pool.Query(ctx,
		"SELECT id FROM segments WHERE location = $1 ORDER BY sort_order ASC",
		loc,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var existing []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err == nil {
			existing = append(existing, id)
		}
	}

	if len(existing) == 0 {
		id, err := CreateNewSegment(ctx, loc)
		if err != nil {
			return nil, err
		}
		return &id, nil
	}
	if bookingDate == nil || *bookingDate == "" {
		return &existing[0], nil
	}

	for _, segID := range existing {
		rows2, err := db.Pool.Query(ctx,
			"SELECT date, date_end FROM bookings WHERE segment_id = $1 AND date IS NOT NULL",
			segID,
		)
		if err != nil {
			continue
		}
		var dates []string
		for rows2.Next() {
			var d, de *string
			if err := rows2.Scan(&d, &de); err == nil {
				if d != nil {
					dates = append(dates, *d)
				}
				if de != nil {
					dates = append(dates, *de)
				}
			}
		}
		rows2.Close()

		if len(dates) == 0 {
			return &segID, nil
		}

		minD, maxD := dates[0], dates[0]
		for _, d := range dates[1:] {
			if d < minD {
				minD = d
			}
			if d > maxD {
				maxD = d
			}
		}

		winMin := offsetDate(minD, -1)
		winMax := offsetDate(maxD, 1)
		if *bookingDate >= winMin && *bookingDate <= winMax {
			return &segID, nil
		}
	}

	id, err := CreateNewSegment(ctx, loc)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func ResolveSegmentStrict(ctx context.Context, bookingType string, location, date *string) (*uuid.UUID, error) {
	for _, t := range TransitTypes {
		if bookingType == t {
			return nil, nil
		}
	}
	if location == nil || strings.TrimSpace(*location) == "" {
		return nil, nil
	}
	seg, err := GetOrCreateSegment(ctx, bookingType, location, date)
	if err != nil {
		return nil, err
	}
	if seg == nil {
		return nil, nil
	}
	return seg, nil
}
