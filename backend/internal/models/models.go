package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ── Core DB models ────────────────────────────────────────────────────────────

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

// ── Trip response types ───────────────────────────────────────────────────────

// TripDayGroup groups food or city_transport bookings for a single day.
type TripDayGroup struct {
	Count   int       `json:"count"`
	Summary string    `json:"summary"` // e.g. "150 CNY + 25 USD"
	Items   []Booking `json:"items"`
}

// TripDay represents one calendar day within a segment.
type TripDay struct {
	Date          string       `json:"date"`
	IsToday       bool         `json:"is_today"`
	OtherBookings []Booking    `json:"other_bookings"` // non-food, non-transit bookings
	Food          TripDayGroup `json:"food"`
	CityTransport TripDayGroup `json:"city_transport"`
}

// TripSegment is a fully pre-computed segment for the trip tab.
type TripSegment struct {
	ID                   uuid.UUID `json:"id"`
	Location             string    `json:"location"`
	SortOrder            int       `json:"sort_order"`
	StartDate            *string   `json:"start_date"`
	EndDate              *string   `json:"end_date"`
	DisplayEndDate       *string   `json:"display_end_date"` // set from next transit's date
	IsPast               bool      `json:"is_past"`
	IsActive             bool      `json:"is_active"`
	MissingHotel         bool      `json:"missing_hotel"`
	MissingTransportNext bool      `json:"missing_transport_next"`
	Hotel                *Booking  `json:"hotel"`   // first hotel booking in this segment
	Days                 []TripDay `json:"days"`
	Todos                []Todo    `json:"todos"`
}

// TripItem is one entry in the trip timeline.
type TripItem struct {
	Kind    string       `json:"kind"` // "transit" | "segment"
	Booking *Booking     `json:"booking,omitempty"`
	Segment *TripSegment `json:"segment,omitempty"`
}

// TripResponse is the full /api/trip payload.
type TripResponse struct {
	Today    string     `json:"today"`
	Timeline []TripItem `json:"timeline"`
}

// ── Summary response types ────────────────────────────────────────────────────

// DKKAmount is a DKK total that may be approximate if some rates are missing.
type DKKAmount struct {
	TotalDKK float64 `json:"total_dkk"`
	Approx   bool    `json:"approx"`
}

// TypeExpenses is the itemised breakdown for one booking type in one section.
type TypeExpenses struct {
	Items    []Booking `json:"items"`
	TotalDKK float64   `json:"total_dkk"`
	Approx   bool      `json:"approx"`
}

// ExpenseSection is collective / peter / friend breakdown.
type ExpenseSection struct {
	ByType   map[string]TypeExpenses `json:"by_type"`
	TotalDKK float64                 `json:"total_dkk"`
	Approx   bool                    `json:"approx"`
}

// TypeSettlement is the settlement data for one booking type.
type TypeSettlement struct {
	Items          []Booking `json:"items"`
	OutstandingDKK float64   `json:"outstanding_dkk"` // positive = peter owes friend
	SettledDKK     float64   `json:"settled_dkk"`
	PeterOwes      bool      `json:"peter_owes"`
	FriendOwes     bool      `json:"friend_owes"`
	Approx         bool      `json:"approx"`
}

// SettlementData is the full settlement summary.
type SettlementData struct {
	NetOutstandingDKK float64                   `json:"net_outstanding_dkk"`
	NetSettledDKK     float64                   `json:"net_settled_dkk"`
	PeterOwes         bool                      `json:"peter_owes"`
	FriendOwes        bool                      `json:"friend_owes"`
	Approx            bool                      `json:"approx"`
	ByType            map[string]TypeSettlement `json:"by_type"`
}

// PerPersonTotals holds the total spend per traveller (personal + half of shared).
type PerPersonTotals struct {
	Peter  DKKAmount `json:"peter"`
	Friend DKKAmount `json:"friend"`
}

// SegmentExpenses holds per-type DKK totals for a single segment (for the ¥ costs panel).
type SegmentExpenses struct {
	ByType   map[string]DKKAmount `json:"by_type"`
	TotalDKK float64              `json:"total_dkk"`
	Approx   bool                 `json:"approx"`
}

// FullSummaryResponse is the full /api/summary payload.
type FullSummaryResponse struct {
	Rates      map[string]float64         `json:"rates"`      // nil if unavailable
	RatesAt    *string                    `json:"rates_at"`
	Collective ExpenseSection             `json:"collective"` // travelers = "both"
	Peter      ExpenseSection             `json:"peter"`      // travelers = "peter"
	Friend     ExpenseSection             `json:"friend"`     // travelers = "friend"
	PerPerson  PerPersonTotals            `json:"per_person"`
	Settlement SettlementData             `json:"settlement"`
	BySegment  map[string]SegmentExpenses `json:"by_segment"` // key: segment UUID string
}
