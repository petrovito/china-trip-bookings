package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/petrovito/china-trip-bookings/backend/internal/db"
	"github.com/petrovito/china-trip-bookings/backend/internal/models"
	"github.com/petrovito/china-trip-bookings/backend/internal/services"
)

// ── MCP protocol types ────────────────────────────────────────────────────────

type mcpRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	} `json:"params"`
}

type mcpResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  interface{}     `json:"result,omitempty"`
	Err     *mcpRPCError    `json:"error,omitempty"`
}

type mcpRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type mcpToolResult struct {
	Content []mcpContent `json:"content"`
	IsError bool         `json:"isError,omitempty"`
}

type mcpContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type mcpTool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`
}

func mcpOK(text string) mcpToolResult {
	return mcpToolResult{Content: []mcpContent{{Type: "text", Text: text}}}
}

func mcpErrf(format string, a ...interface{}) mcpToolResult {
	return mcpToolResult{
		Content: []mcpContent{{Type: "text", Text: "Error: " + fmt.Sprintf(format, a...)}},
		IsError: true,
	}
}

// ── Tool registry ─────────────────────────────────────────────────────────────

var mcpTools = []mcpTool{
	{
		Name:        "add_transport",
		Description: "Add a flight or train to Peter's China Trip 2026 tracker",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"type":        {"type":"string","enum":["flight","train"]},
				"origin":      {"type":"string","description":"Departure city or airport code"},
				"destination": {"type":"string","description":"Arrival city or airport code"},
				"date":        {"type":"string","description":"Departure date YYYY-MM-DD"},
				"departs":     {"type":"string","description":"Departure time HH:MM"},
				"arrives":     {"type":"string","description":"Arrival time HH:MM"},
				"price":       {"type":"number"},
				"currency":    {"type":"string","enum":["USD","CNY","EUR","KRW","VND","DKK"]},
				"platform":    {"type":"string"},
				"reference":   {"type":"string"},
				"notes":       {"type":"string"},
				"travelers":   {"type":"string","enum":["peter","friend","both"]},
				"paid_by":     {"type":"string","enum":["peter","friend"]},
				"details":     {"type":"object","description":"Structured extras e.g. seat_peter, seat_friend, gate, car"}
			},
			"required": ["type","origin","destination"]
		}`),
	},
	{
		Name:        "add_accommodation",
		Description: "Add a hotel stay to Peter's China Trip 2026 tracker",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"name":           {"type":"string","description":"Hotel name"},
				"location":       {"type":"string","description":"City"},
				"check_in":       {"type":"string","description":"Check-in date YYYY-MM-DD"},
				"check_out":      {"type":"string","description":"Check-out date YYYY-MM-DD"},
				"check_in_time":  {"type":"string","description":"Check-in time HH:MM"},
				"check_out_time": {"type":"string","description":"Check-out time HH:MM"},
				"price":          {"type":"number"},
				"currency":       {"type":"string","enum":["USD","CNY","EUR","KRW","VND","DKK"]},
				"platform":       {"type":"string"},
				"reference":      {"type":"string"},
				"notes":          {"type":"string"},
				"travelers":      {"type":"string","enum":["peter","friend","both"]},
				"paid_by":        {"type":"string","enum":["peter","friend"]},
				"map_query":      {"type":"string","description":"Full Chinese street address for Amap"},
				"details":        {"type":"object","description":"Structured extras e.g. room, code, wifi"}
			},
			"required": ["name","location","check_in"]
		}`),
	},
	{
		Name:        "add_experience",
		Description: "Add a ticket, activity, food, city transport, or shopping entry to Peter's China Trip 2026 tracker",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"type":      {"type":"string","enum":["ticket","food","activity","city_transport","shopping"]},
				"name":      {"type":"string"},
				"location":  {"type":"string","description":"City or venue"},
				"date":      {"type":"string","description":"Date YYYY-MM-DD"},
				"time":      {"type":"string","description":"Start time HH:MM"},
				"time_end":  {"type":"string","description":"End time HH:MM"},
				"price":     {"type":"number"},
				"currency":  {"type":"string","enum":["USD","CNY","EUR","KRW","VND","DKK"]},
				"platform":  {"type":"string"},
				"reference": {"type":"string"},
				"notes":     {"type":"string","description":"For city_transport prefix with [taxi]/[bus]/[metro]/[other]"},
				"travelers": {"type":"string","enum":["peter","friend","both"]},
				"paid_by":   {"type":"string","enum":["peter","friend"]},
				"map_query": {"type":"string","description":"Full Chinese street address or place name for Amap"},
				"details":   {"type":"object","description":"Structured extras e.g. code, seat, gate"}
			},
			"required": ["type","name"]
		}`),
	},
	{
		Name:        "update_booking",
		Description: "Update any fields on an existing booking. Only specified fields are changed; everything else is preserved.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"id":             {"type":"string","description":"Booking UUID"},
				"type":           {"type":"string","enum":["flight","hotel","train","ticket","food","activity","city_transport","shopping"]},
				"name":           {"type":"string"},
				"date":           {"type":"string"},
				"date_end":       {"type":"string"},
				"time":           {"type":"string"},
				"time_end":       {"type":"string"},
				"origin":         {"type":"string"},
				"destination":    {"type":"string"},
				"location":       {"type":"string"},
				"departs":        {"type":"string","description":"Alias for time (transport)"},
				"arrives":        {"type":"string","description":"Alias for time_end (transport)"},
				"check_in":       {"type":"string","description":"Alias for date (hotel)"},
				"check_out":      {"type":"string","description":"Alias for date_end (hotel)"},
				"check_in_time":  {"type":"string","description":"Alias for time (hotel)"},
				"check_out_time": {"type":"string","description":"Alias for time_end (hotel)"},
				"price":          {"type":"number"},
				"currency":       {"type":"string","enum":["USD","CNY","EUR","KRW","VND","DKK"]},
				"platform":       {"type":"string"},
				"reference":      {"type":"string"},
				"notes":          {"type":"string"},
				"travelers":      {"type":"string","enum":["peter","friend","both"]},
				"paid_by":        {"type":"string","enum":["peter","friend"]},
				"settled":        {"type":"boolean"},
				"map_query":      {"type":"string","description":"Pass empty string to clear"},
				"map_lat":        {"type":"number","description":"GCJ-02 latitude"},
				"map_lng":        {"type":"number","description":"GCJ-02 longitude"},
				"details":        {"type":"object","description":"Pass null to clear"}
			},
			"required": ["id"]
		}`),
	},
	{
		Name:        "batch_update_bookings",
		Description: "Apply a different patch of fields to each of several bookings in one call. Each item needs id + the fields to change.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"bookings": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"id":          {"type":"string","description":"Booking UUID"},
							"name":        {"type":"string"},
							"date":        {"type":"string"},
							"date_end":    {"type":"string"},
							"time":        {"type":"string"},
							"time_end":    {"type":"string"},
							"location":    {"type":"string"},
							"price":       {"type":"number"},
							"currency":    {"type":"string"},
							"platform":    {"type":"string"},
							"reference":   {"type":"string"},
							"notes":       {"type":"string"},
							"travelers":   {"type":"string"},
							"paid_by":     {"type":"string"},
							"settled":     {"type":"boolean"},
							"map_query":   {"type":"string"},
							"map_lat":     {"type":"number"},
							"map_lng":     {"type":"number"},
							"details":     {"type":"object"}
						},
						"required": ["id"]
					}
				}
			},
			"required": ["bookings"]
		}`),
	},
	{
		Name:        "bulk_add_bookings",
		Description: "Insert multiple bookings in one call. Validates all items first, then inserts sequentially. Up to 50 items.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"bookings": {
					"type": "array",
					"maxItems": 50,
					"items": {
						"type": "object",
						"properties": {
							"type":        {"type":"string","enum":["flight","hotel","train","ticket","food","activity","city_transport","shopping"]},
							"name":        {"type":"string"},
							"origin":      {"type":"string"},
							"destination": {"type":"string"},
							"location":    {"type":"string"},
							"date":        {"type":"string"},
							"date_end":    {"type":"string"},
							"check_in":    {"type":"string"},
							"check_out":   {"type":"string"},
							"time":        {"type":"string"},
							"time_end":    {"type":"string"},
							"departs":     {"type":"string"},
							"arrives":     {"type":"string"},
							"price":       {"type":"number"},
							"currency":    {"type":"string"},
							"platform":    {"type":"string"},
							"reference":   {"type":"string"},
							"notes":       {"type":"string"},
							"travelers":   {"type":"string"},
							"paid_by":     {"type":"string"},
							"map_query":   {"type":"string"},
							"details":     {"type":"object"}
						},
						"required": ["type"]
					}
				}
			},
			"required": ["bookings"]
		}`),
	},
	{
		Name:        "list_bookings",
		Description: "List all bookings, optionally filtered by type. Returns a human-readable summary with IDs.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"type":  {"type":"string","enum":["flight","hotel","train","ticket","food","activity","city_transport","shopping"],"description":"Filter by type — omit for all"},
				"limit": {"type":"number","description":"Max results — defaults to 200"}
			}
		}`),
	},
	{
		Name:        "query_bookings",
		Description: "Flexible read with filters and optional field selection. Returns raw JSON rows. Use for audits, map checks, and data exports.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"type":       {"type":"string","description":"Exact type match"},
				"location":   {"type":"string","description":"Partial case-insensitive match on location"},
				"date_from":  {"type":"string","description":"YYYY-MM-DD inclusive start"},
				"date_to":    {"type":"string","description":"YYYY-MM-DD inclusive end"},
				"settled":    {"type":"boolean"},
				"paid_by":    {"type":"string","enum":["peter","friend"]},
				"travelers":  {"type":"string","enum":["peter","friend","both"]},
				"segment_id": {"type":"string","description":"Segment UUID or 'none' for unassigned bookings"},
				"has_map":    {"type":"boolean","description":"true = has any map data, false = missing all map data"},
				"ids":        {"type":"array","items":{"type":"string"},"description":"Filter to specific booking UUIDs"},
				"search":     {"type":"string","description":"Substring search across name, notes, location, reference"},
				"fields":     {"type":"array","items":{"type":"string"},"description":"Columns to return — omit for all columns"},
				"limit":      {"type":"number","description":"Max results — defaults to 500"}
			}
		}`),
	},
	{
		Name:        "settle_booking",
		Description: "Mark a specific booking as settled (expense balanced between travelers).",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"id": {"type":"string","description":"Booking UUID"}
			},
			"required": ["id"]
		}`),
	},
	{
		Name:        "delete_booking",
		Description: "Permanently delete a booking by ID.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"id": {"type":"string","description":"Booking UUID"}
			},
			"required": ["id"]
		}`),
	},
	{
		Name:        "set_pass",
		Description: "Store a boarding pass or QR code for a booking so it can be displayed offline in the app.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"id":          {"type":"string","description":"Booking UUID"},
				"pass_code":   {"type":"string","description":"Raw barcode or QR value"},
				"pass_format": {"type":"string","description":"Encoding format: qr, code128, aztec, pdf417 etc — defaults to qr"},
				"traveler":    {"type":"string","enum":["peter","friend"],"description":"Which traveler this pass belongs to (informational)"}
			},
			"required": ["id","pass_code"]
		}`),
	},
	{
		Name:        "list_segments",
		Description: "List all trip segments (city stays) with IDs, sort order, and booking counts.",
		InputSchema: json.RawMessage(`{"type":"object","properties":{}}`),
	},
	{
		Name:        "create_segment",
		Description: "Manually create a new trip segment (city stay).",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"location":   {"type":"string","description":"City name"},
				"sort_order": {"type":"number","description":"Position in trip timeline — auto-assigned if omitted"}
			},
			"required": ["location"]
		}`),
	},
	{
		Name:        "update_segment",
		Description: "Rename a segment or change its sort order (position in trip timeline).",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"id":         {"type":"string","description":"Segment UUID"},
				"location":   {"type":"string","description":"New city name"},
				"sort_order": {"type":"number","description":"New position"}
			},
			"required": ["id"]
		}`),
	},
	{
		Name:        "delete_segment",
		Description: "Delete an empty segment. Fails if any bookings still reference it.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"id": {"type":"string","description":"Segment UUID"}
			},
			"required": ["id"]
		}`),
	},
	{
		Name:        "assign_segment",
		Description: "Assign (or reassign) a booking to a segment. Use after add_experience when the segment was not auto-resolved.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"booking_id":  {"type":"string","description":"Booking UUID"},
				"segment_id":  {"type":"string","description":"Segment UUID — or 'none' to clear the assignment"}
			},
			"required": ["booking_id","segment_id"]
		}`),
	},
	{
		Name:        "add_todo",
		Description: "Add a todo item to the China trip checklist.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"title":      {"type":"string","description":"What needs to be done"},
				"category":   {"type":"string","enum":["do","buy","book","pack","check"],"description":"Defaults to 'do'"},
				"assignee":   {"type":"string","enum":["peter","friend","both"],"description":"Defaults to 'peter' — 'both' creates two rows"},
				"deadline":   {"type":"string","description":"Date YYYY-MM-DD"},
				"segment_id": {"type":"string","description":"Link to a trip segment UUID"},
				"booking_id": {"type":"string","description":"Link to a booking UUID"}
			},
			"required": ["title"]
		}`),
	},
	{
		Name:        "list_todos",
		Description: "List todo items from the China trip checklist.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"done": {"type":"boolean","description":"true = done only, false = pending only — omit for all"}
			}
		}`),
	},
	{
		Name:        "complete_todo",
		Description: "Mark a todo item as done.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"id": {"type":"string","description":"Todo UUID"}
			},
			"required": ["id"]
		}`),
	},
	{
		Name:        "delete_todo",
		Description: "Delete a todo item by ID.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"id": {"type":"string","description":"Todo UUID"}
			},
			"required": ["id"]
		}`),
	},
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

func MCPHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"name":    "china-trip-bookings",
			"version": "3.0.0",
		})
		return
	case http.MethodOptions:
		w.WriteHeader(204)
		return
	case http.MethodPost:
		// handled below
	default:
		w.WriteHeader(405)
		return
	}

	var req mcpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(mcpResponse{
			JSONRPC: "2.0",
			Err:     &mcpRPCError{Code: -32700, Message: "parse error"},
		})
		return
	}

	resp := mcpResponse{JSONRPC: "2.0", ID: req.ID}

	switch req.Method {
	case "initialize":
		resp.Result = map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"capabilities":    map[string]interface{}{"tools": map[string]interface{}{}},
			"serverInfo":      map[string]string{"name": "china-trip-bookings", "version": "3.0.0"},
		}
	case "notifications/initialized":
		w.WriteHeader(204)
		return
	case "tools/list":
		resp.Result = map[string]interface{}{"tools": mcpTools}
	case "tools/call":
		resp.Result = dispatchTool(r.Context(), req.Params.Name, req.Params.Arguments)
	default:
		resp.Err = &mcpRPCError{Code: -32601, Message: "method not found: " + req.Method}
	}

	json.NewEncoder(w).Encode(resp)
}

func dispatchTool(ctx context.Context, name string, args json.RawMessage) mcpToolResult {
	switch name {
	case "add_transport":
		return mcpAddTransport(ctx, args)
	case "add_accommodation":
		return mcpAddAccommodation(ctx, args)
	case "add_experience":
		return mcpAddExperience(ctx, args)
	case "update_booking":
		return mcpUpdateBooking(ctx, args)
	case "batch_update_bookings":
		return mcpBatchUpdateBookings(ctx, args)
	case "bulk_add_bookings":
		return mcpBulkAddBookings(ctx, args)
	case "list_bookings":
		return mcpListBookings(ctx, args)
	case "query_bookings":
		return mcpQueryBookings(ctx, args)
	case "settle_booking":
		return mcpSettleBooking(ctx, args)
	case "delete_booking":
		return mcpDeleteBooking(ctx, args)
	case "set_pass":
		return mcpSetPass(ctx, args)
	case "list_segments":
		return mcpListSegments(ctx)
	case "create_segment":
		return mcpCreateSegment(ctx, args)
	case "update_segment":
		return mcpUpdateSegment(ctx, args)
	case "delete_segment":
		return mcpDeleteSegment(ctx, args)
	case "assign_segment":
		return mcpAssignSegment(ctx, args)
	case "add_todo":
		return mcpAddTodo(ctx, args)
	case "list_todos":
		return mcpListTodos(ctx, args)
	case "complete_todo":
		return mcpCompleteTodo(ctx, args)
	case "delete_todo":
		return mcpDeleteTodo(ctx, args)
	default:
		return mcpErrf("unknown tool: %s", name)
	}
}

// ── Shared helpers ────────────────────────────────────────────────────────────

func kindForType(t string) string {
	switch t {
	case "flight", "train":
		return "transport"
	case "hotel":
		return "accommodation"
	default:
		return "experience"
	}
}

func ptrStr(s *string, def string) string {
	if s == nil || *s == "" {
		return def
	}
	return *s
}

func formatBooking(b *models.Booking) string {
	date := "—"
	if b.Date != nil {
		date = *b.Date
		if b.DateEnd != nil {
			date += " → " + *b.DateEnd
		}
	}
	price := "—"
	if b.Price != nil {
		price = fmt.Sprintf("%g %s", *b.Price, b.Currency)
	}
	seg := "none"
	if b.SegmentID != nil {
		seg = b.SegmentID.String()
	}
	loc := ""
	if b.Location != nil && *b.Location != "" {
		loc = " · " + *b.Location
	}
	return fmt.Sprintf("[%s] %s · %s · %s%s · seg:%s (id: %s)",
		strings.ToUpper(b.Type),
		ptrStr(b.Name, "—"),
		date, price, loc, seg,
		b.ID.String(),
	)
}

// ── Booking tools ─────────────────────────────────────────────────────────────

func mcpAddTransport(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var req services.BookingRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return mcpErrf(err.Error())
	}
	b, err := services.CreateBookingRecordForKind(ctx, "transport", req)
	if err != nil {
		return mcpErrf(err.Error())
	}
	return mcpOK("Added transport:\n" + formatBooking(b))
}

func mcpAddAccommodation(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var req services.BookingRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return mcpErrf(err.Error())
	}
	b, err := services.CreateBookingRecordForKind(ctx, "accommodation", req)
	if err != nil {
		return mcpErrf(err.Error())
	}
	return mcpOK("Added accommodation:\n" + formatBooking(b) +
		"\n\nℹ️  Set map_query/map_lat/map_lng via update_booking if not already provided.")
}

func mcpAddExperience(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var req services.BookingRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return mcpErrf(err.Error())
	}
	b, err := services.CreateBookingRecordForKind(ctx, "experience", req)
	if err != nil {
		return mcpErrf(err.Error())
	}
	msg := "Added experience:\n" + formatBooking(b)
	if b.SegmentID == nil {
		msg += "\n\n⚠️  No segment assigned — call assign_segment to link this to a city."
	}
	return mcpOK(msg)
}

func mcpUpdateBooking(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var idOnly struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &idOnly); err != nil || idOnly.ID == "" {
		return mcpErrf("id is required")
	}
	id, err := uuid.Parse(idOnly.ID)
	if err != nil {
		return mcpErrf("invalid id: %s", idOnly.ID)
	}
	var req services.BookingRequest
	if err = json.Unmarshal(raw, &req); err != nil {
		return mcpErrf(err.Error())
	}
	b, err := services.UpdateBookingRecord(ctx, id, req)
	if err != nil {
		return mcpErrf(err.Error())
	}
	return mcpOK("Updated:\n" + formatBooking(b))
}

func mcpBatchUpdateBookings(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		Bookings []json.RawMessage `json:"bookings"`
	}
	if err := json.Unmarshal(raw, &args); err != nil {
		return mcpErrf(err.Error())
	}
	if len(args.Bookings) == 0 {
		return mcpErrf("bookings must be a non-empty array")
	}

	var lines []string
	for i, item := range args.Bookings {
		var idOnly struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(item, &idOnly); err != nil || idOnly.ID == "" {
			return mcpErrf("item %d: id is required", i+1)
		}
		uid, err := uuid.Parse(idOnly.ID)
		if err != nil {
			return mcpErrf("item %d: invalid id %s", i+1, idOnly.ID)
		}
		var req services.BookingRequest
		if err = json.Unmarshal(item, &req); err != nil {
			return mcpErrf("item %d: %s", i+1, err.Error())
		}
		b, err := services.UpdateBookingRecord(ctx, uid, req)
		if err != nil {
			return mcpErrf("item %d [%s]: %s", i+1, idOnly.ID, err.Error())
		}
		lines = append(lines, formatBooking(b))
	}
	return mcpOK(fmt.Sprintf("Updated %d booking(s):\n\n%s", len(lines), strings.Join(lines, "\n")))
}

func mcpBulkAddBookings(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		Bookings []json.RawMessage `json:"bookings"`
	}
	if err := json.Unmarshal(raw, &args); err != nil {
		return mcpErrf(err.Error())
	}
	if len(args.Bookings) == 0 {
		return mcpErrf("bookings must be a non-empty array")
	}

	// Phase 1: parse and validate all items before touching the DB
	type item struct {
		req  services.BookingRequest
		kind string
	}
	items := make([]item, 0, len(args.Bookings))
	for i, raw := range args.Bookings {
		var req services.BookingRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return mcpErrf("item %d: %s", i+1, err.Error())
		}
		if req.Type == nil || *req.Type == "" {
			return mcpErrf("item %d: type is required", i+1)
		}
		items = append(items, item{req: req, kind: kindForType(*req.Type)})
	}

	// Phase 2: insert sequentially
	var inserted []*models.Booking
	for i, it := range items {
		b, err := services.CreateBookingRecordForKind(ctx, it.kind, it.req)
		if err != nil {
			return mcpErrf("item %d [%s]: %s — %d already inserted before this failure",
				i+1, *it.req.Type, err.Error(), len(inserted))
		}
		inserted = append(inserted, b)
	}

	lines := make([]string, len(inserted))
	for i, b := range inserted {
		lines[i] = formatBooking(b)
	}
	return mcpOK(fmt.Sprintf("Inserted %d booking(s):\n\n%s", len(inserted), strings.Join(lines, "\n")))
}

func mcpListBookings(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		Type  *string `json:"type"`
		Limit *int    `json:"limit"`
	}
	json.Unmarshal(raw, &args) // best-effort; no args is fine

	query := `SELECT id, type, name, date::text, date_end::text, time, time_end, origin, location,
		price, currency, platform, reference, notes, travelers, paid_by,
		settled, segment_id, pass_code, pass_format, map_query, map_lat,
		map_lng, map_provider, map_place_id, details, created_at
		FROM bookings`
	var qargs []interface{}
	if args.Type != nil {
		query += " WHERE type = $1"
		qargs = append(qargs, *args.Type)
	}
	query += " ORDER BY date ASC NULLS LAST"
	lim := 200
	if args.Limit != nil && *args.Limit > 0 {
		lim = *args.Limit
	}
	query += fmt.Sprintf(" LIMIT %d", lim)

	rows, err := db.Pool.Query(ctx, query, qargs...)
	if err != nil {
		return mcpErrf(err.Error())
	}
	defer rows.Close()

	var lines []string
	for rows.Next() {
		var b models.Booking
		if err := rows.Scan(
			&b.ID, &b.Type, &b.Name, &b.Date, &b.DateEnd, &b.Time, &b.TimeEnd,
			&b.Origin, &b.Location, &b.Price, &b.Currency, &b.Platform, &b.Reference,
			&b.Notes, &b.Travelers, &b.PaidBy, &b.Settled, &b.SegmentID,
			&b.PassCode, &b.PassFormat, &b.MapQuery, &b.MapLat, &b.MapLng,
			&b.MapProvider, &b.MapPlaceID, &b.Details, &b.CreatedAt,
		); err != nil {
			continue
		}
		line := formatBooking(&b)
		if b.PaidBy == nil {
			line += " [unpaid]"
		} else if !b.Settled {
			line += " [paid·unsettled]"
		}
		if b.PassCode != nil {
			line += " 🎫"
		}
		lines = append(lines, line)
	}
	if len(lines) == 0 {
		return mcpOK("No bookings found.")
	}
	return mcpOK(fmt.Sprintf("%d booking(s):\n\n%s", len(lines), strings.Join(lines, "\n")))
}

func mcpQueryBookings(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		Type      *string  `json:"type"`
		Location  *string  `json:"location"`
		DateFrom  *string  `json:"date_from"`
		DateTo    *string  `json:"date_to"`
		Settled   *bool    `json:"settled"`
		PaidBy    *string  `json:"paid_by"`
		Travelers *string  `json:"travelers"`
		SegmentID *string  `json:"segment_id"`
		HasMap    *bool    `json:"has_map"`
		IDs       []string `json:"ids"`
		Search    *string  `json:"search"`
		Fields    []string `json:"fields"`
		Limit     *int     `json:"limit"`
	}
	if err := json.Unmarshal(raw, &args); err != nil {
		return mcpErrf(err.Error())
	}

	// Whitelist: column name → SQL expression
	allowed := map[string]string{
		"id": "id", "type": "type", "name": "name",
		"date":        "date::text AS date",
		"date_end":    "date_end::text AS date_end",
		"time": "time", "time_end": "time_end",
		"origin": "origin", "location": "location",
		"price": "price", "currency": "currency",
		"platform": "platform", "reference": "reference",
		"notes": "notes", "travelers": "travelers",
		"paid_by": "paid_by", "settled": "settled",
		"segment_id":   "segment_id",
		"pass_code":    "pass_code",
		"pass_format":  "pass_format",
		"map_query":    "map_query",
		"map_lat":      "map_lat",
		"map_lng":      "map_lng",
		"map_provider": "map_provider",
		"map_place_id": "map_place_id",
		"details":      "details",
		"created_at":   "created_at",
	}

	var selCols []string
	if len(args.Fields) > 0 {
		seenID := false
		for _, f := range args.Fields {
			if expr, ok := allowed[f]; ok {
				selCols = append(selCols, expr)
				if f == "id" {
					seenID = true
				}
			}
		}
		if len(selCols) == 0 {
			return mcpErrf("no valid fields specified")
		}
		// always include id for usability
		if !seenID {
			selCols = append([]string{"id"}, selCols...)
		}
	} else {
		for _, expr := range allowed {
			selCols = append(selCols, expr)
		}
	}

	var where []string
	var qargs []interface{}
	n := 1

	if args.Type != nil {
		where = append(where, fmt.Sprintf("type = $%d", n))
		qargs = append(qargs, *args.Type)
		n++
	}
	if args.Location != nil {
		where = append(where, fmt.Sprintf("location ILIKE $%d", n))
		qargs = append(qargs, "%"+*args.Location+"%")
		n++
	}
	if args.DateFrom != nil {
		where = append(where, fmt.Sprintf("date >= $%d", n))
		qargs = append(qargs, *args.DateFrom)
		n++
	}
	if args.DateTo != nil {
		where = append(where, fmt.Sprintf("date <= $%d", n))
		qargs = append(qargs, *args.DateTo)
		n++
	}
	if args.Settled != nil {
		where = append(where, fmt.Sprintf("settled = $%d", n))
		qargs = append(qargs, *args.Settled)
		n++
	}
	if args.PaidBy != nil {
		where = append(where, fmt.Sprintf("paid_by = $%d", n))
		qargs = append(qargs, *args.PaidBy)
		n++
	}
	if args.Travelers != nil {
		where = append(where, fmt.Sprintf("travelers = $%d", n))
		qargs = append(qargs, *args.Travelers)
		n++
	}
	if args.SegmentID != nil {
		if *args.SegmentID == "none" {
			where = append(where, "segment_id IS NULL")
		} else {
			segUUID, err := uuid.Parse(*args.SegmentID)
			if err != nil {
				return mcpErrf("invalid segment_id")
			}
			where = append(where, fmt.Sprintf("segment_id = $%d", n))
			qargs = append(qargs, segUUID)
			n++
		}
	}
	if args.HasMap != nil {
		if *args.HasMap {
			where = append(where, "(map_query IS NOT NULL OR map_lat IS NOT NULL)")
		} else {
			where = append(where, "(map_query IS NULL AND map_lat IS NULL)")
		}
	}
	if len(args.IDs) > 0 {
		uuids := make([]uuid.UUID, 0, len(args.IDs))
		for _, s := range args.IDs {
			if u, err := uuid.Parse(s); err == nil {
				uuids = append(uuids, u)
			}
		}
		if len(uuids) > 0 {
			where = append(where, fmt.Sprintf("id = ANY($%d)", n))
			qargs = append(qargs, uuids)
			n++
		}
	}
	if args.Search != nil {
		s := "%" + *args.Search + "%"
		where = append(where, fmt.Sprintf(
			"(name ILIKE $%d OR notes ILIKE $%d OR location ILIKE $%d OR reference ILIKE $%d)",
			n, n, n, n,
		))
		qargs = append(qargs, s)
		n++
	}
	_ = n // consumed above

	whereSQL := ""
	if len(where) > 0 {
		whereSQL = "WHERE " + strings.Join(where, " AND ")
	}
	lim := 500
	if args.Limit != nil && *args.Limit > 0 {
		lim = *args.Limit
	}

	sql := fmt.Sprintf(
		"SELECT row_to_json(t) FROM (SELECT %s FROM bookings %s ORDER BY date ASC NULLS LAST LIMIT %d) t",
		strings.Join(selCols, ", "), whereSQL, lim,
	)

	rows, err := db.Pool.Query(ctx, sql, qargs...)
	if err != nil {
		return mcpErrf(err.Error())
	}
	defer rows.Close()

	var results []json.RawMessage
	for rows.Next() {
		var row json.RawMessage
		if err := rows.Scan(&row); err == nil {
			results = append(results, row)
		}
	}
	if len(results) == 0 {
		return mcpOK("0 booking(s): []")
	}
	out, _ := json.MarshalIndent(results, "", " ")
	return mcpOK(fmt.Sprintf("%d booking(s):\n\n%s", len(results), string(out)))
}

func mcpSettleBooking(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &args); err != nil || args.ID == "" {
		return mcpErrf("id is required")
	}
	id, err := uuid.Parse(args.ID)
	if err != nil {
		return mcpErrf("invalid id")
	}
	var name *string
	err = db.Pool.QueryRow(ctx,
		"UPDATE bookings SET settled = true WHERE id = $1 RETURNING name", id,
	).Scan(&name)
	if err != nil {
		return mcpErrf(err.Error())
	}
	return mcpOK(fmt.Sprintf("✓ Settled: %s (id: %s)", ptrStr(name, "—"), args.ID))
}

func mcpDeleteBooking(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &args); err != nil || args.ID == "" {
		return mcpErrf("id is required")
	}
	id, err := uuid.Parse(args.ID)
	if err != nil {
		return mcpErrf("invalid id")
	}
	var name *string
	err = db.Pool.QueryRow(ctx,
		"DELETE FROM bookings WHERE id = $1 RETURNING name", id,
	).Scan(&name)
	if err != nil {
		return mcpErrf(err.Error())
	}
	return mcpOK(fmt.Sprintf("Deleted: %s (id: %s)", ptrStr(name, "—"), args.ID))
}

func mcpSetPass(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		ID         string  `json:"id"`
		PassCode   string  `json:"pass_code"`
		PassFormat *string `json:"pass_format"`
		Traveler   *string `json:"traveler"`
	}
	if err := json.Unmarshal(raw, &args); err != nil {
		return mcpErrf(err.Error())
	}
	if args.ID == "" || args.PassCode == "" {
		return mcpErrf("id and pass_code are required")
	}
	id, err := uuid.Parse(args.ID)
	if err != nil {
		return mcpErrf("invalid id")
	}
	format := "qr"
	if args.PassFormat != nil && *args.PassFormat != "" {
		format = *args.PassFormat
	}
	var name *string
	err = db.Pool.QueryRow(ctx,
		"UPDATE bookings SET pass_code = $2, pass_format = $3 WHERE id = $1 RETURNING name",
		id, args.PassCode, format,
	).Scan(&name)
	if err != nil {
		return mcpErrf(err.Error())
	}
	travelerSuffix := ""
	if args.Traveler != nil {
		travelerSuffix = fmt.Sprintf(" [%s]", *args.Traveler)
	}
	return mcpOK(fmt.Sprintf("✓ Pass stored%s for: %s (format: %s, id: %s)",
		travelerSuffix, ptrStr(name, "—"), format, args.ID))
}

// ── Segment tools ─────────────────────────────────────────────────────────────

func mcpListSegments(ctx context.Context) mcpToolResult {
	rows, err := db.Pool.Query(ctx,
		"SELECT id, location, sort_order FROM segments ORDER BY sort_order ASC")
	if err != nil {
		return mcpErrf(err.Error())
	}
	defer rows.Close()

	var lines []string
	for rows.Next() {
		var id uuid.UUID
		var loc string
		var order int
		if err := rows.Scan(&id, &loc, &order); err != nil {
			continue
		}
		var count int
		db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM bookings WHERE segment_id = $1", id).Scan(&count)
		lines = append(lines, fmt.Sprintf("[%d] %s · %d booking(s) (id: %s)", order, loc, count, id.String()))
	}
	if len(lines) == 0 {
		return mcpOK("No segments found.")
	}
	return mcpOK(fmt.Sprintf("%d segment(s):\n\n%s", len(lines), strings.Join(lines, "\n")))
}

func mcpCreateSegment(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		Location  string `json:"location"`
		SortOrder *int   `json:"sort_order"`
	}
	if err := json.Unmarshal(raw, &args); err != nil {
		return mcpErrf(err.Error())
	}
	loc := strings.TrimSpace(args.Location)
	if loc == "" {
		return mcpErrf("location is required")
	}
	order := args.SortOrder
	if order == nil {
		var count int
		db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM segments").Scan(&count)
		o := count + 1
		order = &o
	}
	var id uuid.UUID
	err := db.Pool.QueryRow(ctx,
		"INSERT INTO segments (location, sort_order) VALUES ($1, $2) RETURNING id",
		loc, *order,
	).Scan(&id)
	if err != nil {
		return mcpErrf(err.Error())
	}
	return mcpOK(fmt.Sprintf("✓ Created segment: %s · order:%d (id: %s)", loc, *order, id.String()))
}

func mcpUpdateSegment(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		ID        string  `json:"id"`
		Location  *string `json:"location"`
		SortOrder *int    `json:"sort_order"`
	}
	if err := json.Unmarshal(raw, &args); err != nil {
		return mcpErrf(err.Error())
	}
	if args.ID == "" {
		return mcpErrf("id is required")
	}
	id, err := uuid.Parse(args.ID)
	if err != nil {
		return mcpErrf("invalid id")
	}
	var sets []string
	var qargs []interface{}
	n := 1
	if args.Location != nil {
		sets = append(sets, fmt.Sprintf("location = $%d", n))
		qargs = append(qargs, *args.Location)
		n++
	}
	if args.SortOrder != nil {
		sets = append(sets, fmt.Sprintf("sort_order = $%d", n))
		qargs = append(qargs, *args.SortOrder)
		n++
	}
	if len(sets) == 0 {
		return mcpErrf("no fields to update")
	}
	qargs = append(qargs, id)
	query := fmt.Sprintf(
		"UPDATE segments SET %s WHERE id = $%d RETURNING location, sort_order",
		strings.Join(sets, ", "), n,
	)
	var loc string
	var order int
	err = db.Pool.QueryRow(ctx, query, qargs...).Scan(&loc, &order)
	if err != nil {
		return mcpErrf(err.Error())
	}
	return mcpOK(fmt.Sprintf("✓ Updated segment: %s · order:%d (id: %s)", loc, order, args.ID))
}

func mcpDeleteSegment(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &args); err != nil || args.ID == "" {
		return mcpErrf("id is required")
	}
	id, err := uuid.Parse(args.ID)
	if err != nil {
		return mcpErrf("invalid id")
	}
	var count int
	db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM bookings WHERE segment_id = $1", id).Scan(&count)
	if count > 0 {
		return mcpErrf("cannot delete: %d booking(s) still reference this segment", count)
	}
	var loc string
	err = db.Pool.QueryRow(ctx, "DELETE FROM segments WHERE id = $1 RETURNING location", id).Scan(&loc)
	if err != nil {
		return mcpErrf(err.Error())
	}
	return mcpOK(fmt.Sprintf("Deleted segment: %s (id: %s)", loc, args.ID))
}

func mcpAssignSegment(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		BookingID string `json:"booking_id"`
		SegmentID string `json:"segment_id"`
	}
	if err := json.Unmarshal(raw, &args); err != nil {
		return mcpErrf(err.Error())
	}
	if args.BookingID == "" || args.SegmentID == "" {
		return mcpErrf("booking_id and segment_id are required")
	}
	bid, err := uuid.Parse(args.BookingID)
	if err != nil {
		return mcpErrf("invalid booking_id")
	}
	var name *string
	if args.SegmentID == "none" {
		err = db.Pool.QueryRow(ctx,
			"UPDATE bookings SET segment_id = NULL WHERE id = $1 RETURNING name", bid,
		).Scan(&name)
	} else {
		sid, err2 := uuid.Parse(args.SegmentID)
		if err2 != nil {
			return mcpErrf("invalid segment_id")
		}
		err = db.Pool.QueryRow(ctx,
			"UPDATE bookings SET segment_id = $2 WHERE id = $1 RETURNING name", bid, sid,
		).Scan(&name)
	}
	if err != nil {
		return mcpErrf(err.Error())
	}
	return mcpOK(fmt.Sprintf("✓ Assigned %s → segment %s (booking id: %s)",
		ptrStr(name, "—"), args.SegmentID, args.BookingID))
}

// ── Todo tools ────────────────────────────────────────────────────────────────

func mcpAddTodo(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		Title     string  `json:"title"`
		Category  *string `json:"category"`
		Assignee  *string `json:"assignee"`
		Deadline  *string `json:"deadline"`
		SegmentID *string `json:"segment_id"`
		BookingID *string `json:"booking_id"`
	}
	if err := json.Unmarshal(raw, &args); err != nil {
		return mcpErrf(err.Error())
	}
	if args.Title == "" {
		return mcpErrf("title is required")
	}
	cat := "do"
	if args.Category != nil && *args.Category != "" {
		cat = *args.Category
	}
	assignee := "peter"
	if args.Assignee != nil && *args.Assignee != "" {
		assignee = *args.Assignee
	}

	var segID *uuid.UUID
	if args.SegmentID != nil && *args.SegmentID != "" {
		u, err := uuid.Parse(*args.SegmentID)
		if err != nil {
			return mcpErrf("invalid segment_id")
		}
		segID = &u
	}
	var bookID *uuid.UUID
	if args.BookingID != nil && *args.BookingID != "" {
		u, err := uuid.Parse(*args.BookingID)
		if err != nil {
			return mcpErrf("invalid booking_id")
		}
		bookID = &u
	}

	insert := func(who string) (uuid.UUID, error) {
		var id uuid.UUID
		err := db.Pool.QueryRow(ctx, `
			INSERT INTO todos (title, category, assignee, deadline, segment_id, booking_id, done)
			VALUES ($1, $2, $3, $4, $5, $6, false) RETURNING id`,
			args.Title, cat, who, args.Deadline, segID, bookID,
		).Scan(&id)
		return id, err
	}

	if assignee == "both" {
		id1, err := insert("peter")
		if err != nil {
			return mcpErrf(err.Error())
		}
		id2, err := insert("friend")
		if err != nil {
			return mcpErrf(err.Error())
		}
		return mcpOK(fmt.Sprintf(
			"✓ Added todo (×2) [%s] %q\n  peter  → %s\n  friend → %s",
			cat, args.Title, id1, id2,
		))
	}

	id, err := insert(assignee)
	if err != nil {
		return mcpErrf(err.Error())
	}
	return mcpOK(fmt.Sprintf("✓ Added todo [%s] %q → %s (id: %s)", cat, args.Title, assignee, id))
}

func mcpListTodos(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		Done *bool `json:"done"`
	}
	json.Unmarshal(raw, &args) // best-effort

	query := `SELECT id, title, category, assignee, done, deadline::text, segment_id, booking_id
		FROM todos`
	var qargs []interface{}
	if args.Done != nil {
		query += " WHERE done = $1"
		qargs = append(qargs, *args.Done)
	}
	query += " ORDER BY category, created_at"

	rows, err := db.Pool.Query(ctx, query, qargs...)
	if err != nil {
		return mcpErrf(err.Error())
	}
	defer rows.Close()

	var lines []string
	for rows.Next() {
		var id uuid.UUID
		var title, category, assignee string
		var done bool
		var deadline *string
		var segID, bookID *uuid.UUID
		if err := rows.Scan(&id, &title, &category, &assignee, &done, &deadline, &segID, &bookID); err != nil {
			continue
		}
		check := "[ ]"
		if done {
			check = "[x]"
		}
		line := fmt.Sprintf("%s [%s] %s → %s", check, category, title, assignee)
		if deadline != nil {
			line += " · by " + *deadline
		}
		line += fmt.Sprintf(" (id: %s)", id)
		lines = append(lines, line)
	}
	if len(lines) == 0 {
		return mcpOK("No todos found.")
	}
	return mcpOK(fmt.Sprintf("%d todo(s):\n\n%s", len(lines), strings.Join(lines, "\n")))
}

func mcpCompleteTodo(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &args); err != nil || args.ID == "" {
		return mcpErrf("id is required")
	}
	id, err := uuid.Parse(args.ID)
	if err != nil {
		return mcpErrf("invalid id")
	}
	var title string
	err = db.Pool.QueryRow(ctx,
		"UPDATE todos SET done = true WHERE id = $1 RETURNING title", id,
	).Scan(&title)
	if err != nil {
		return mcpErrf(err.Error())
	}
	return mcpOK(fmt.Sprintf("✓ Completed: %q (id: %s)", title, args.ID))
}

func mcpDeleteTodo(ctx context.Context, raw json.RawMessage) mcpToolResult {
	var args struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &args); err != nil || args.ID == "" {
		return mcpErrf("id is required")
	}
	id, err := uuid.Parse(args.ID)
	if err != nil {
		return mcpErrf("invalid id")
	}
	var title string
	err = db.Pool.QueryRow(ctx,
		"DELETE FROM todos WHERE id = $1 RETURNING title", id,
	).Scan(&title)
	if err != nil {
		return mcpErrf(err.Error())
	}
	return mcpOK(fmt.Sprintf("Deleted todo: %q (id: %s)", title, args.ID))
}
