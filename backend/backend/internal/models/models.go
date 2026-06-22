package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Booking struct {
	ID          uuid.UUID       `json:"id"`
	Type        string          `json:"type"`
	Name        *string         `json:"name"`
	Date        *string         `json:"date"`
	DateEnd     *string         `json:"date_end"`
	Time        *string         `json:"time"`
	TimeEnd     *string         `json:"time_end"`
	Origin      *string         `json:"origin"`
	Location    *string         `json:"location"`
	Price       *float64        `json:"price"`
	Currency    string          `json:"currency"`
	Platform    *string         `json:"platform"`
	Reference   *string         `json:"reference"`
	Notes       *string         `json:"notes"`
	Travelers   string          `json:"travelers"`
	PaidBy      *string         `json:"paid_by"`
	Settled     bool            `json:"settled"`
	SegmentID   *uuid.UUID      `json:"segment_id"`
	PassCode    *string         `json:"pass_code"`
	PassFormat  *string         `json:"pass_format"`
	MapQuery    *string         `json:"map_query"`
	MapLat      *float64        `json:"map_lat"`
	MapLng      *float64        `json:"map_lng"`
	MapProvider *string         `json:"map_provider"`
	MapPlaceID  *string         `json:"map_place_id"`
	Details     json.RawMessage `json:"details"`
	CreatedAt   time.Time       `json:"created_at"`
}

type Segment struct {
	ID        uuid.UUID `json:"id"`
	Location  string    `json:"location"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}

type Todo struct {
	ID        uuid.UUID  `json:"id"`
	Title     string     `json:"title"`
	Category  string     `json:"category"`
	Assignee  string     `json:"assignee"`
	Done      bool       `json:"done"`
	Deadline  *string    `json:"deadline"`
	SegmentID *uuid.UUID `json:"segment_id"`
	BookingID *uuid.UUID `json:"booking_id"`
	CreatedAt time.Time  `json:"created_at"`
}
