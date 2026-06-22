package services

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/petrovito/china-trip-bookings/backend/internal/db"
	"github.com/petrovito/china-trip-bookings/backend/internal/models"
)

var defaults = struct {
	Type, Currency, Travelers string
}{
	Type: "flight", Currency: "USD", Travelers: "both",
}

func pickPtr[T any](vals ...*T) *T {
	for _, v := range vals {
		if v != nil {
			return v
		}
	}
	return nil
}

func pickStr(def string, vals ...*string) string {
	for _, v := range vals {
		if v != nil && *v != "" {
			return *v
		}
	}
	return def
}

func pickFloat(vals ...*float64) *float64 {
	for _, v := range vals {
		if v != nil {
			return v
		}
	}
	return nil
}

func pickBool(def bool, vals ...*bool) bool {
	for _, v := range vals {
		if v != nil {
			return *v
		}
	}
	return def
}

func pickDetails(body, existing json.RawMessage) json.RawMessage {
	if body != nil {
		if string(body) == "null" {
			return nil
		}
		return body
	}
	if existing != nil && string(existing) != "null" {
		return existing
	}
	return nil
}

type BookingRequest struct {
	ID          *string         `json:"id"`
	Type        *string         `json:"type"`
	Name        *string         `json:"name"`
	Date        *string         `json:"date"`
	DateEnd     *string         `json:"date_end"`
	Time        *string         `json:"time"`
	TimeEnd     *string         `json:"time_end"`
	Origin      *string         `json:"origin"`
	Location    *string         `json:"location"`
	Destination *string         `json:"destination"`
	Price       *float64        `json:"price"`
	Currency    *string         `json:"currency"`
	Platform    *string         `json:"platform"`
	Reference   *string         `json:"reference"`
	Notes       *string         `json:"notes"`
	Travelers   *string         `json:"travelers"`
	PaidBy      *string         `json:"paid_by"`
	Settled     *bool           `json:"settled"`
	MapQuery    *string         `json:"map_query"`
	MapLat      *float64        `json:"map_lat"`
	MapLng      *float64        `json:"map_lng"`
	Details     json.RawMessage `json:"details"`

	Departs      *string `json:"departs"`
	Arrives      *string `json:"arrives"`
	CheckIn      *string `json:"check_in"`
	CheckOut     *string `json:"check_out"`
	CheckInTime  *string `json:"check_in_time"`
	CheckOutTime *string `json:"check_out_time"`

	Reminder         *bool   `json:"reminder"`
	ReminderType     *string `json:"reminder_type"`
	ReminderAssignee *string `json:"reminder_assignee"`
	Identity         *string `json:"identity"`
}

func baseFields(req BookingRequest, existing *models.Booking) models.Booking {
	return models.Booking{
		Name:      pickPtr(req.Name, existingName(existing)),
		Date:      pickPtr(req.Date, existingDate(existing)),
		DateEnd:   pickPtr(req.DateEnd, existingDateEnd(existing)),
		Time:      pickPtr(req.Time, existingTime(existing)),
		TimeEnd:   pickPtr(req.TimeEnd, existingTimeEnd(existing)),
		Origin:    pickPtr(req.Origin, existingOrigin(existing)),
		Location:  pickPtr(req.Location, existingLocation(existing)),
		Price:     pickFloat(req.Price, existingPrice(existing)),
		Currency:  pickStr(defaults.Currency, req.Currency, existingCurrency(existing)),
		Platform:  pickPtr(req.Platform, existingPlatform(existing)),
		Reference: pickPtr(req.Reference, existingReference(existing)),
		Notes:     pickPtr(req.Notes, existingNotes(existing)),
		Travelers: pickStr(defaults.Travelers, req.Travelers, existingTravelers(existing)),
		PaidBy:    pickPtr(req.PaidBy, existingPaidBy(existing)),
		MapQuery:  pickPtr(req.MapQuery, existingMapQuery(existing)),
		MapLat:    pickFloat(req.MapLat, existingMapLat(existing)),
		MapLng:    pickFloat(req.MapLng, existingMapLng(existing)),
		Details:   pickDetails(req.Details, existingDetails(existing)),
	}
}

func BuildPayloadForKind(kind string, req BookingRequest, existing *models.Booking, forInsert bool) *models.Booking {
	switch kind {
	case "transport":
		if req.Type == nil || *req.Type == "" {
			def := "flight"
			req.Type = &def
		}
		return buildTransportPayload(req, existing, forInsert)
	case "accommodation":
		def := "hotel"
		if req.Type == nil || *req.Type == "" {
			req.Type = &def
		}
		return buildAccommodationPayload(req, existing, forInsert)
	case "experience":
		if req.Type == nil || *req.Type == "" {
			def := "ticket"
			req.Type = &def
		}
		return buildExperiencePayload(req, existing, forInsert)
	default:
		typ := pickStr(defaults.Type, req.Type, existingType(existing))
		if typ == "flight" || typ == "train" {
			return buildTransportPayload(req, existing, forInsert)
		}
		if typ == "hotel" {
			return buildAccommodationPayload(req, existing, forInsert)
		}
		return buildExperiencePayload(req, existing, forInsert)
	}
}

func buildTransportPayload(req BookingRequest, existing *models.Booking, forInsert bool) *models.Booking {
	base := baseFields(req, existing)
	origin := pickPtr(req.Origin, existingOrigin(existing))
	loc := pickPtr(req.Location, req.Destination, existingLocation(existing))
	tm := pickPtr(req.Time, req.Departs, existingTime(existing))
	tmEnd := pickPtr(req.TimeEnd, req.Arrives, existingTimeEnd(existing))

	var name *string
	if req.Name != nil {
		name = req.Name
	} else if existing != nil && existing.Name != nil {
		name = existing.Name
	} else if origin != nil && loc != nil {
		n := fmt.Sprintf("%s → %s", *origin, *loc)
		name = &n
	} else if origin != nil || loc != nil {
		n := ""
		if origin != nil {
			n = *origin
		}
		if loc != nil {
			if n != "" {
				n += " → "
			}
			n += *loc
		}
		name = &n
	}

	return &models.Booking{
		Type:      pickStr(defaults.Type, req.Type, existingType(existing)),
		Name:      name,
		Origin:    origin,
		Location:  loc,
		Date:      base.Date,
		DateEnd:   base.DateEnd,
		Time:      tm,
		TimeEnd:   tmEnd,
		Price:     base.Price,
		Currency:  base.Currency,
		Platform:  base.Platform,
		Reference: base.Reference,
		Notes:     base.Notes,
		Travelers: base.Travelers,
		PaidBy:    base.PaidBy,
		Settled:   pickBool(!forInsert, req.Settled),
		MapQuery:  base.MapQuery,
		MapLat:    base.MapLat,
		MapLng:    base.MapLng,
		Details:   base.Details,
	}
}

func buildAccommodationPayload(req BookingRequest, existing *models.Booking, forInsert bool) *models.Booking {
	base := baseFields(req, existing)
	return &models.Booking{
		Type:      "hotel",
		Name:      pickPtr(req.Name, existingName(existing)),
		Location:  pickPtr(req.Location, existingLocation(existing)),
		Date:      pickPtr(req.Date, req.CheckIn, existingDate(existing)),
		DateEnd:   pickPtr(req.DateEnd, req.CheckOut, existingDateEnd(existing)),
		Time:      pickPtr(req.Time, req.CheckInTime, existingTime(existing)),
		TimeEnd:   pickPtr(req.TimeEnd, req.CheckOutTime, existingTimeEnd(existing)),
		Price:     base.Price,
		Currency:  base.Currency,
		Platform:  base.Platform,
		Reference: base.Reference,
		Notes:     base.Notes,
		Travelers: base.Travelers,
		PaidBy:    base.PaidBy,
		Settled:   pickBool(!forInsert, req.Settled),
		MapQuery:  base.MapQuery,
		MapLat:    base.MapLat,
		MapLng:    base.MapLng,
		Details:   base.Details,
	}
}

func buildExperiencePayload(req BookingRequest, existing *models.Booking, forInsert bool) *models.Booking {
	base := baseFields(req, existing)
	typ := pickStr("ticket", req.Type, existingType(existing))
	return &models.Booking{
		Type:      typ,
		Name:      pickPtr(req.Name, existingName(existing)),
		Date:      base.Date,
		DateEnd:   base.DateEnd,
		Time:      base.Time,
		TimeEnd:   base.TimeEnd,
		Origin:    pickPtr(req.Origin, existingOrigin(existing)),
		Location:  pickPtr(req.Location, existingLocation(existing)),
		Price:     base.Price,
		Currency:  base.Currency,
		Platform:  base.Platform,
		Reference: base.Reference,
		Notes:     base.Notes,
		Travelers: base.Travelers,
		PaidBy:    base.PaidBy,
		Settled:   pickBool(!forInsert, req.Settled),
		MapQuery:  base.MapQuery,
		MapLat:    base.MapLat,
		MapLng:    base.MapLng,
		Details:   base.Details,
	}
}

func existingName(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return b.Name
}
func existingDate(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return b.Date
}
func existingDateEnd(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return b.DateEnd
}
func existingTime(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return b.Time
}
func existingTimeEnd(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return b.TimeEnd
}
func existingOrigin(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return b.Origin
}
func existingLocation(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return b.Location
}
func existingPrice(b *models.Booking) *float64 {
	if b == nil {
		return nil
	}
	return b.Price
}
func existingCurrency(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return &b.Currency
}
func existingPlatform(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return b.Platform
}
func existingReference(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return b.Reference
}
func existingNotes(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return b.Notes
}
func existingTravelers(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return &b.Travelers
}
func existingPaidBy(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return b.PaidBy
}
func existingMapQuery(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return b.MapQuery
}
func existingMapLat(b *models.Booking) *float64 {
	if b == nil {
		return nil
	}
	return b.MapLat
}
func existingMapLng(b *models.Booking) *float64 {
	if b == nil {
		return nil
	}
	return b.MapLng
}
func existingDetails(b *models.Booking) json.RawMessage {
	if b == nil {
		return nil
	}
	return b.Details
}
func existingType(b *models.Booking) *string {
	if b == nil {
		return nil
	}
	return &b.Type
}

func GetBookingByID(ctx context.Context, id uuid.UUID) (*models.Booking, error) {
	var b models.Booking
	err := db.Pool.QueryRow(ctx, `
		SELECT id, type, name, date, date_end, time, time_end, origin, location,
		       price, currency, platform, reference, notes, travelers, paid_by,
		       settled, segment_id, pass_code, pass_format, map_query, map_lat,
		       map_lng, map_provider, map_place_id, details, created_at
		FROM bookings WHERE id = $1
	`, id).Scan(
		&b.ID, &b.Type, &b.Name, &b.Date, &b.DateEnd, &b.Time, &b.TimeEnd,
		&b.Origin, &b.Location, &b.Price, &b.Currency, &b.Platform, &b.Reference,
		&b.Notes, &b.Travelers, &b.PaidBy, &b.Settled, &b.SegmentID, &b.PassCode,
		&b.PassFormat, &b.MapQuery, &b.MapLat, &b.MapLng, &b.MapProvider,
		&b.MapPlaceID, &b.Details, &b.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func CreateBookingRecord(ctx context.Context, req BookingRequest) (*models.Booking, error) {
	payload := BuildPayloadForKind("generic", req, nil, true)
	segID, err := GetOrCreateSegment(ctx, payload.Type, payload.Location, payload.Date)
	if err != nil {
		return nil, err
	}
	payload.SegmentID = segID

	var b models.Booking
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO bookings (type, name, date, date_end, time, time_end, origin, location,
			price, currency, platform, reference, notes, travelers, paid_by, settled,
			segment_id, map_query, map_lat, map_lng, details)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
		RETURNING id, type, name, date, date_end, time, time_end, origin, location,
			price, currency, platform, reference, notes, travelers, paid_by, settled,
			segment_id, map_query, map_lat, map_lng, details, created_at
	`, payload.Type, payload.Name, payload.Date, payload.DateEnd, payload.Time, payload.TimeEnd,
		payload.Origin, payload.Location, payload.Price, payload.Currency, payload.Platform,
		payload.Reference, payload.Notes, payload.Travelers, payload.PaidBy, payload.Settled,
		payload.SegmentID, payload.MapQuery, payload.MapLat, payload.MapLng, payload.Details,
	).Scan(
		&b.ID, &b.Type, &b.Name, &b.Date, &b.DateEnd, &b.Time, &b.TimeEnd,
		&b.Origin, &b.Location, &b.Price, &b.Currency, &b.Platform, &b.Reference,
		&b.Notes, &b.Travelers, &b.PaidBy, &b.Settled, &b.SegmentID, &b.MapQuery,
		&b.MapLat, &b.MapLng, &b.Details, &b.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if req.Reminder != nil && *req.Reminder {
		_ = CreateLinkedReminderTodos(ctx, &b, req)
	}
	return &b, nil
}

func UpdateBookingRecord(ctx context.Context, id uuid.UUID, req BookingRequest) (*models.Booking, error) {
	existing, err := GetBookingByID(ctx, id)
	if err != nil {
		return nil, err
	}

	payload := BuildPayloadForKind("generic", req, existing, false)
	segID, err := GetOrCreateSegment(ctx, payload.Type, payload.Location, payload.Date)
	if err != nil {
		return nil, err
	}
	payload.SegmentID = segID

	if req.Settled == nil {
		payload.Settled = existing.Settled
	}

	var b models.Booking
	err = db.Pool.QueryRow(ctx, `
		UPDATE bookings SET
			type = $1, name = $2, date = $3, date_end = $4, time = $5, time_end = $6,
			origin = $7, location = $8, price = $9, currency = $10, platform = $11,
			reference = $12, notes = $13, travelers = $14, paid_by = $15, settled = $16,
			segment_id = $17, map_query = $18, map_lat = $19, map_lng = $20, details = $21
		WHERE id = $22
		RETURNING id, type, name, date, date_end, time, time_end, origin, location,
			price, currency, platform, reference, notes, travelers, paid_by, settled,
			segment_id, map_query, map_lat, map_lng, details, created_at
	`, payload.Type, payload.Name, payload.Date, payload.DateEnd, payload.Time, payload.TimeEnd,
		payload.Origin, payload.Location, payload.Price, payload.Currency, payload.Platform,
		payload.Reference, payload.Notes, payload.Travelers, payload.PaidBy, payload.Settled,
		payload.SegmentID, payload.MapQuery, payload.MapLat, payload.MapLng, payload.Details,
		id,
	).Scan(
		&b.ID, &b.Type, &b.Name, &b.Date, &b.DateEnd, &b.Time, &b.TimeEnd,
		&b.Origin, &b.Location, &b.Price, &b.Currency, &b.Platform, &b.Reference,
		&b.Notes, &b.Travelers, &b.PaidBy, &b.Settled, &b.SegmentID, &b.MapQuery,
		&b.MapLat, &b.MapLng, &b.Details, &b.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if existing.PaidBy == nil && b.PaidBy != nil {
		_ = MarkLinkedTodosDone(ctx, id)
	}
	return &b, nil
}

func CreateBookingRecordForKind(ctx context.Context, kind string, req BookingRequest) (*models.Booking, error) {
	payload := BuildPayloadForKind(kind, req, nil, true)
	segID, err := GetOrCreateSegment(ctx, payload.Type, payload.Location, payload.Date)
	if err != nil {
		return nil, err
	}
	payload.SegmentID = segID

	var b models.Booking
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO bookings (type, name, date, date_end, time, time_end, origin, location,
			price, currency, platform, reference, notes, travelers, paid_by, settled,
			segment_id, map_query, map_lat, map_lng, details)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
		RETURNING id, type, name, date, date_end, time, time_end, origin, location,
			price, currency, platform, reference, notes, travelers, paid_by, settled,
			segment_id, map_query, map_lat, map_lng, details, created_at
	`, payload.Type, payload.Name, payload.Date, payload.DateEnd, payload.Time, payload.TimeEnd,
		payload.Origin, payload.Location, payload.Price, payload.Currency, payload.Platform,
		payload.Reference, payload.Notes, payload.Travelers, payload.PaidBy, payload.Settled,
		payload.SegmentID, payload.MapQuery, payload.MapLat, payload.MapLng, payload.Details,
	).Scan(
		&b.ID, &b.Type, &b.Name, &b.Date, &b.DateEnd, &b.Time, &b.TimeEnd,
		&b.Origin, &b.Location, &b.Price, &b.Currency, &b.Platform, &b.Reference,
		&b.Notes, &b.Travelers, &b.PaidBy, &b.Settled, &b.SegmentID, &b.MapQuery,
		&b.MapLat, &b.MapLng, &b.Details, &b.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if req.Reminder != nil && *req.Reminder {
		_ = CreateLinkedReminderTodos(ctx, &b, req)
	}
	return &b, nil
}

func UpdateBookingRecordForKind(ctx context.Context, kind string, id uuid.UUID, req BookingRequest) (*models.Booking, error) {
	existing, err := GetBookingByID(ctx, id)
	if err != nil {
		return nil, err
	}
	payload := BuildPayloadForKind(kind, req, existing, false)
	segID, err := GetOrCreateSegment(ctx, payload.Type, payload.Location, payload.Date)
	if err != nil {
		return nil, err
	}
	payload.SegmentID = segID
	if req.Settled == nil {
		payload.Settled = existing.Settled
	}
	var b models.Booking
	err = db.Pool.QueryRow(ctx, `
		UPDATE bookings SET
			type = $1, name = $2, date = $3, date_end = $4, time = $5, time_end = $6,
			origin = $7, location = $8, price = $9, currency = $10, platform = $11,
			reference = $12, notes = $13, travelers = $14, paid_by = $15, settled = $16,
			segment_id = $17, map_query = $18, map_lat = $19, map_lng = $20, details = $21
		WHERE id = $22
		RETURNING id, type, name, date, date_end, time, time_end, origin, location,
			price, currency, platform, reference, notes, travelers, paid_by, settled,
			segment_id, map_query, map_lat, map_lng, details, created_at
	`, payload.Type, payload.Name, payload.Date, payload.DateEnd, payload.Time, payload.TimeEnd,
		payload.Origin, payload.Location, payload.Price, payload.Currency, payload.Platform,
		payload.Reference, payload.Notes, payload.Travelers, payload.PaidBy, payload.Settled,
		payload.SegmentID, payload.MapQuery, payload.MapLat, payload.MapLng, payload.Details,
		id,
	).Scan(
		&b.ID, &b.Type, &b.Name, &b.Date, &b.DateEnd, &b.Time, &b.TimeEnd,
		&b.Origin, &b.Location, &b.Price, &b.Currency, &b.Platform, &b.Reference,
		&b.Notes, &b.Travelers, &b.PaidBy, &b.Settled, &b.SegmentID, &b.MapQuery,
		&b.MapLat, &b.MapLng, &b.Details, &b.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if existing.PaidBy == nil && b.PaidBy != nil {
		_ = MarkLinkedTodosDone(ctx, id)
	}
	return &b, nil
}

func CreateLinkedReminderTodos(ctx context.Context, booking *models.Booking, req BookingRequest) error {
	if booking == nil || booking.ID == uuid.Nil {
		return nil
	}
	assignees := []string{"peter"}
	if req.ReminderAssignee != nil {
		if *req.ReminderAssignee == "both" {
			assignees = []string{"peter", "friend"}
		} else if *req.ReminderAssignee == "peter" || *req.ReminderAssignee == "friend" {
			assignees = []string{*req.ReminderAssignee}
		}
	} else if req.Identity != nil {
		if *req.Identity == "peter" || *req.Identity == "friend" {
			assignees = []string{*req.Identity}
		}
	}

	base := booking.Name
	if base == nil || *base == "" {
		if req.Name != nil {
			base = req.Name
		} else {
			s := "Booking"
			base = &s
		}
	}
	title := fmt.Sprintf("Buy: %s", *base)
	if req.ReminderType != nil && *req.ReminderType == "prepare" {
		title = fmt.Sprintf("Prepare: %s", *base)
	}
	cat := "book"
	if req.ReminderType != nil && *req.ReminderType == "prepare" {
		cat = "pack"
	}
	deadline := booking.Date
	if req.Date != nil {
		deadline = req.Date
	}

	for _, assignee := range assignees {
		_, err := db.Pool.Exec(ctx, `
			INSERT INTO todos (title, category, assignee, booking_id, segment_id, deadline, done)
			VALUES ($1, $2, $3, $4, $5, $6, false)
		`, title, cat, assignee, booking.ID, booking.SegmentID, deadline)
		if err != nil {
			return err
		}
	}
	return nil
}

func MarkLinkedTodosDone(ctx context.Context, bookingID uuid.UUID) error {
	_, err := db.Pool.Exec(ctx, `
		UPDATE todos SET done = true WHERE booking_id = $1 AND done = false
	`, bookingID)
	return err
}
