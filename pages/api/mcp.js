// pages/api/mcp.js
import { createClient } from "@supabase/supabase-js";
import { updateBookingRecord } from "./lib/bookings.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TRANSIT_TYPES = ["flight", "train"];

function _offsetDate(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function _createNewSegment(loc) {
  const { count } = await supabase.from("segments").select("*", { count: "exact", head: true });
  const { data: created, error } = await supabase
    .from("segments")
    .insert({ location: loc, sort_order: (count ?? 0) + 1 })
    .select("id").single();
  if (error) { console.error("getOrCreateSegment:", error.message); return null; }
  return created.id;
}

async function getOrCreateSegment(type, location, bookingDate = null) {
  if (!location?.trim() || TRANSIT_TYPES.includes(type)) return null;
  const loc = location.trim();

  const { data: existing } = await supabase
    .from("segments").select("id").eq("location", loc).order("sort_order", { ascending: true });

  if (!existing?.length) return _createNewSegment(loc);
  if (!bookingDate) return existing[0].id;

  for (const seg of existing) {
    const { data: segBookings } = await supabase
      .from("bookings").select("date, date_end")
      .eq("segment_id", seg.id).not("date", "is", null);

    if (!segBookings?.length) return seg.id;

    const allDates = segBookings.flatMap(b => [b.date, b.date_end].filter(Boolean));
    const segMin = allDates.reduce((a, b) => (a < b ? a : b));
    const segMax = allDates.reduce((a, b) => (a > b ? a : b));

    if (bookingDate >= _offsetDate(segMin, -1) && bookingDate <= _offsetDate(segMax, 1)) {
      return seg.id;
    }
  }

  return _createNewSegment(loc);
}

// Enforces segment resolution for non-transit bookings.
// Returns segment_id (null for transit types is valid), or throws with a descriptive message.
async function resolveSegmentStrict(type, location, date) {
  if (TRANSIT_TYPES.includes(type)) return null;
  if (!location?.trim())
    throw new Error(`type "${type}" requires a location for segment assignment — provide a city name`);
  const seg = await getOrCreateSegment(type, location, date ?? null);
  if (seg === null)
    throw new Error(`could not resolve or create a segment for location "${location.trim()}" — check DB connectivity`);
  return seg;
}

const SHARED_FIELDS = {
  price:     { type: "number",  description: "Price as a number — omit for free activities" },
  currency:  { type: "string",  enum: ["USD", "CNY", "EUR", "KRW", "VND", "DKK"], description: "Currency — defaults to USD" },
  platform:  { type: "string",  description: "Booking platform e.g. Trip.com, Klook, Booking.com" },
  reference: { type: "string",  description: "Booking reference or confirmation number" },
  notes:     { type: "string",  description: "Extra details" },
  travelers: { type: "string",  enum: ["peter", "friend", "both"], description: "Who this is for — defaults to both" },
  paid_by:   { type: "string",  enum: ["peter", "friend"], description: "Who paid — omit if unpaid" },
  details:   { type: "object",  description: "Structured extras shown as highlighted pills + a details modal. Common keys: car (train car number), seat_peter / seat_friend (per-traveler seat — use 'seat' instead if shared), gate (boarding/ticket gate), code (collection/pickup code), room (hotel room number). Any keys allowed; set at insertion time when known." },
};

// Shared per-booking patch fields, used by both update_booking (single) and
// batch_update_bookings (array of these + id).
const BOOKING_PATCH_FIELDS = {
  type:       { type: "string", enum: ["flight", "hotel", "train", "ticket", "food", "activity", "city_transport", "shopping"], description: "Optional new booking type" },
  name:       { type: "string", description: "Booking name" },
  date:       { type: "string", description: "Date in YYYY-MM-DD format" },
  date_end:   { type: "string", description: "End date in YYYY-MM-DD format" },
  time:       { type: "string", description: "Time in HH:MM format" },
  time_end:   { type: "string", description: "End time in HH:MM format" },
  origin:     { type: "string", description: "Departure city/airport" },
  destination:{ type: "string", description: "Arrival city/destination" },
  location:   { type: "string", description: "City, venue, or arrival destination" },
  departs:    { type: "string", description: "Alias for time" },
  arrives:    { type: "string", description: "Alias for time_end" },
  check_in:   { type: "string", description: "Alias for hotel start date" },
  check_out:  { type: "string", description: "Alias for hotel end date" },
  check_in_time: { type: "string", description: "Alias for hotel start time" },
  check_out_time:{ type: "string", description: "Alias for hotel end time" },
  price:      { type: "number", description: "Price as a number" },
  currency:   { type: "string", enum: ["USD", "CNY", "EUR", "KRW", "VND", "DKK"], description: "Currency" },
  platform:   { type: "string", description: "Booking platform" },
  reference:  { type: "string", description: "Booking reference or confirmation number" },
  notes:      { type: "string", description: "Extra details" },
  travelers:  { type: "string", enum: ["peter", "friend", "both"], description: "Who this is for" },
  paid_by:    { type: "string", enum: ["peter", "friend"], description: "Who paid" },
  settled:    { type: "boolean", description: "Mark as settled or unsettled" },
  map_query:  { type: "string", description: "Address or search keyword for the maps button — a full street address is most reliable (e.g. '长沙市芙蓉区车站中路193号')" },
  map_lat:    { type: "number", description: "Latitude in GCJ-02 (Amap) coordinates" },
  map_lng:    { type: "number", description: "Longitude in GCJ-02 (Amap) coordinates" },
  details:    { type: "object", description: "Structured extras shown as highlighted pills + a details modal. Common keys: car, seat_peter, seat_friend (or 'seat' if shared), gate, code, room. Any keys allowed. Pass null to clear." },
};

const TOOLS = [
  // ── Typed tools (preferred) ──────────────────────────────────────────────
  {
    name: "add_transport",
    description: "Add a flight or train to Peter's China Trip 2026 tracker",
    inputSchema: {
      type: "object",
      properties: {
        type:        { type: "string", enum: ["flight", "train"], description: "flight or train" },
        origin:      { type: "string", description: "Departure city or airport code, e.g. 'Changsha' or 'CSX'" },
        destination: { type: "string", description: "Arrival city or airport code, e.g. 'Zhangjiajie West' or 'ZJJ'" },
        date:        { type: "string", description: "Departure date in YYYY-MM-DD format" },
        departs:     { type: "string", description: "Departure time in HH:MM format, e.g. '07:23'" },
        arrives:     { type: "string", description: "Arrival time in HH:MM format, e.g. '09:45'" },
        ...SHARED_FIELDS,
      },
      required: ["type", "origin", "destination"],
    },
  },
  {
    name: "add_accommodation",
    description: "Add a hotel or accommodation to Peter's China Trip 2026 tracker",
    inputSchema: {
      type: "object",
      properties: {
        name:          { type: "string", description: "Hotel or property name" },
        location:      { type: "string", description: "City, e.g. 'Beijing'" },
        check_in:      { type: "string", description: "Check-in date in YYYY-MM-DD format" },
        check_out:     { type: "string", description: "Check-out date in YYYY-MM-DD format" },
        check_in_time: { type: "string", description: "Check-in time in HH:MM format, e.g. '14:00'" },
        check_out_time:{ type: "string", description: "Check-out time in HH:MM format, e.g. '11:00'" },
        ...SHARED_FIELDS,
      },
      required: ["name", "location"],
    },
  },
  {
    name: "add_experience",
    description: "Add a ticket, activity, restaurant, or food booking to Peter's China Trip 2026 tracker",
    inputSchema: {
      type: "object",
      properties: {
        type:     { type: "string", enum: ["ticket", "food", "activity", "city_transport", "shopping"], description: "ticket=attraction/museum, food=restaurant, activity=other plan, city_transport=local transit, shopping=convenience store/supermarket purchases" },
        name:     { type: "string", description: "Name of the attraction, restaurant, or activity" },
        location: { type: "string", description: "City, e.g. 'Beijing'" },
        date:     { type: "string", description: "Date in YYYY-MM-DD format" },
        time:     { type: "string", description: "Start time in HH:MM format" },
        ...SHARED_FIELDS,
      },
      required: ["type", "name"],
    },
  },
  // ── Legacy (kept for backward compat) ────────────────────────────────────
  {
    name: "add_booking",
    description: "Add a booking to Peter's China Trip 2026 tracker. Prefer add_transport / add_accommodation / add_experience when the type is known.",
    inputSchema: {
      type: "object",
      properties: {
        type:     { type: "string", enum: ["flight", "hotel", "train", "ticket", "food", "activity", "city_transport", "shopping"] },
        name:     { type: "string", description: "Name / description of the booking" },
        date:     { type: "string", description: "Start date in YYYY-MM-DD format" },
        date_end: { type: "string", description: "End/checkout date in YYYY-MM-DD format" },
        location: { type: "string", description: "City or region" },
        origin:   { type: "string", description: "Departure city/airport — for flights and trains" },
        time:     { type: "string", description: "Departure / start time in HH:MM" },
        time_end: { type: "string", description: "Arrival / end time in HH:MM" },
        ...SHARED_FIELDS,
      },
      required: ["type", "name"],
    },
  },
  // ── Bookings management ───────────────────────────────────────────────────
  {
    name: "list_bookings",
    description: "List all bookings in Peter's China Trip 2026 tracker",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["flight", "hotel", "train", "ticket", "food", "activity", "city_transport", "shopping", "all"], description: "Filter by type — omit for all" },
      },
    },
  },
  {
    name: "settle_booking",
    description: "Mark a specific booking as settled — i.e. the other person has paid back their share",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The UUID of the booking to mark as settled" } },
      required: ["id"],
    },
  },
  {
    name: "delete_booking",
    description: "Delete a booking by its ID",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The UUID of the booking to delete" } },
      required: ["id"],
    },
  },
  {
    name: "update_booking",
    description: "Update an existing booking's fields. Supports flights, trains, hotels, tickets, food, and activities.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The UUID of the booking to update" },
        ...BOOKING_PATCH_FIELDS,
      },
      required: ["id"],
    },
  },
  {
    name: "batch_update_bookings",
    description: "Apply a different patch of fields to each of several bookings in one call. Far more efficient than calling update_booking repeatedly — use this whenever updating 2+ bookings (e.g. backfilling map_query/map_lat/map_lng for several hotels, bulk-marking settled, fixing references).",
    inputSchema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          description: "One entry per booking to update",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "The UUID of the booking to update" },
              ...BOOKING_PATCH_FIELDS,
            },
            required: ["id"],
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "bulk_add_bookings",
    description: "Insert multiple bookings in a single call. Segment assignment is automatic and enforced — non-transit bookings without a location are rejected before anything is written. All rows are inserted atomically after segment resolution succeeds for every item. Prefer this over repeated add_transport / add_accommodation / add_experience calls whenever inserting 2+ bookings at once.",
    inputSchema: {
      type: "object",
      properties: {
        bookings: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          description: "Ordered list of bookings to insert",
          items: {
            type: "object",
            properties: {
              type:           { type: "string",  enum: ["flight", "hotel", "train", "ticket", "food", "activity", "city_transport", "shopping"], description: "Booking type — determines how other fields are interpreted" },
              name:           { type: "string",  description: "Booking name — for transport omit to auto-generate 'origin → destination'" },
              location:       { type: "string",  description: "City — required for all non-transit types (used for automatic segment assignment)" },
              origin:         { type: "string",  description: "Departure city/airport — flights and trains" },
              destination:    { type: "string",  description: "Arrival city/airport — flights and trains" },
              departs:        { type: "string",  description: "Departure time HH:MM — alias for time" },
              arrives:        { type: "string",  description: "Arrival time HH:MM — alias for time_end" },
              check_in:       { type: "string",  description: "Check-in date YYYY-MM-DD — alias for date" },
              check_out:      { type: "string",  description: "Check-out date YYYY-MM-DD — alias for date_end" },
              check_in_time:  { type: "string",  description: "Check-in time HH:MM" },
              check_out_time: { type: "string",  description: "Check-out time HH:MM" },
              date:           { type: "string",  description: "Start date YYYY-MM-DD" },
              date_end:       { type: "string",  description: "End date YYYY-MM-DD" },
              time:           { type: "string",  description: "Start time HH:MM" },
              time_end:       { type: "string",  description: "End time HH:MM" },
              map_query:      { type: "string",  description: "Chinese address for Amap deep-link, e.g. '长沙市芙蓉区车站中路193号'" },
              map_lat:        { type: "number",  description: "GCJ-02 latitude" },
              map_lng:        { type: "number",  description: "GCJ-02 longitude" },
              ...SHARED_FIELDS,
            },
            required: ["type"],
          },
        },
      },
      required: ["bookings"],
    },
  },
  {
    name: "query_bookings",
    description: "Flexible read access to booking records, returning full raw JSON for every column (including map_query, map_lat, map_lng, map_provider, pass_code, segment_id, settled, etc — fields not shown by list_bookings). Use this to audit data, find records missing a field (e.g. has_map=false), look up specific bookings by id, or fetch only the columns you need for an efficient bulk check.",
    inputSchema: {
      type: "object",
      properties: {
        type:       { type: "string", enum: ["flight", "hotel", "train", "ticket", "food", "activity", "city_transport", "shopping"], description: "Filter by booking type — omit for all" },
        location:   { type: "string", description: "Filter by location (case-insensitive partial match)" },
        date_from:  { type: "string", description: "Only bookings with date >= this (YYYY-MM-DD)" },
        date_to:    { type: "string", description: "Only bookings with date <= this (YYYY-MM-DD)" },
        settled:    { type: "boolean", description: "Filter by settled status" },
        paid_by:    { type: "string", enum: ["peter", "friend"], description: "Filter by who paid" },
        travelers:  { type: "string", enum: ["peter", "friend", "both"], description: "Filter by who the booking is for" },
        segment_id: { type: "string", description: "Filter by segment UUID, or 'none' for unassigned bookings" },
        has_map:    { type: "boolean", description: "true = map_query or map_lat/map_lng is set; false = both are missing" },
        ids:        { type: "array", items: { type: "string" }, description: "Fetch specific bookings by UUID" },
        search:     { type: "string", description: "Case-insensitive search across name, notes, location, and reference" },
        fields:     { type: "array", items: { type: "string" }, description: "Specific columns to return, e.g. ['id','name','map_query','map_lat','map_lng'] — omit for all columns" },
        limit:      { type: "number", description: "Max rows to return" },
      },
    },
  },
  {
    name: "set_pass",
    description: "Store a decoded barcode/QR code for a booking so it can be displayed offline in the pass viewer",
    inputSchema: {
      type: "object",
      properties: {
        id:          { type: "string", description: "The UUID of the booking" },
        pass_code:   { type: "string", description: "The decoded text content of the barcode or QR code" },
        pass_format: { type: "string", description: "Barcode format: QR_CODE, PDF_417, AZTEC, CODE_128, CODE_39, DATA_MATRIX, etc. Defaults to QR_CODE." },
      },
      required: ["id", "pass_code"],
    },
  },
  // ── Segment management ───────────────────────────────────────────────────
  {
    name: "list_segments",
    description: "List all trip segments (city stays) with IDs, sort order, and booking counts. Highlights empty segments.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_segment",
    description: "Manually create a new trip segment (city stay). Useful when a city visit has no auto-created segment yet.",
    inputSchema: {
      type: "object",
      properties: {
        location:   { type: "string", description: "City name, e.g. 'Kunming'" },
        sort_order: { type: "number", description: "Position in the timeline — omit to append at the end" },
      },
      required: ["location"],
    },
  },
  {
    name: "update_segment",
    description: "Rename a segment or change its sort order (position in the trip timeline).",
    inputSchema: {
      type: "object",
      properties: {
        id:         { type: "string", description: "UUID of the segment to update" },
        location:   { type: "string", description: "New city name" },
        sort_order: { type: "number", description: "New position in the timeline" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_segment",
    description: "Delete an empty segment. Fails if any bookings are still assigned to it — use assign_segment first to move them.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID of the segment to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "assign_segment",
    description: "Directly assign (or reassign) a booking to a segment. Use this to fix misassigned bookings without deleting and re-adding them. Pass segment_id=null to unassign.",
    inputSchema: {
      type: "object",
      properties: {
        booking_id: { type: "string", description: "UUID of the booking to reassign" },
        segment_id: { type: "string", description: "UUID of the target segment, or null to unassign" },
      },
      required: ["booking_id"],
    },
  },
  // ── Todos ─────────────────────────────────────────────────────────────────
  {
    name: "add_todo",
    description: "Add a todo item to the China trip checklist. Use assignee='both' to create one task per person.",
    inputSchema: {
      type: "object",
      properties: {
        title:    { type: "string", description: "What needs to be done" },
        category: { type: "string", enum: ["pack", "book", "docs", "health", "tech", "do"], description: "Category — pack=packing, book=reservations, docs=documents, health=medical, tech=devices/apps, do=activities" },
        assignee: { type: "string", enum: ["peter", "friend", "both"], description: "Who this is for — 'both' creates one task per person, defaults to peter" },
        deadline: { type: "string", description: "Optional deadline in YYYY-MM-DD format" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_todos",
    description: "List todo items from the China trip checklist",
    inputSchema: {
      type: "object",
      properties: {
        done: { type: "boolean", description: "Filter by completion — omit for all, true for done only, false for pending only" },
      },
    },
  },
  {
    name: "complete_todo",
    description: "Mark a todo item as done",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The UUID of the todo to mark as done" } },
      required: ["id"],
    },
  },
  {
    name: "delete_todo",
    description: "Delete a todo item by ID",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The UUID of the todo to delete" } },
      required: ["id"],
    },
  },
];

// ── Tool implementations ───────────────────────────────────────────────────

async function add_transport(args) {
  const { type, origin, destination, date, departs, arrives, price, currency, platform, reference, notes, travelers, paid_by, details } = args;
  const name = `${origin} → ${destination}`;
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      type,
      name,
      origin:    origin      || null,
      location:  destination || null,
      date:      date        || null,
      time:      departs     || null,
      time_end:  arrives     || null,
      price:     price       ?? null,
      currency:  currency    || "USD",
      platform:  platform    || null,
      reference: reference   || null,
      notes:     notes       || null,
      travelers: travelers   || "both",
      paid_by:   paid_by     || null,
      details:   details     ?? null,
      segment_id: null,
    })
    .select().single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Added [${data.type}] ${data.name} · ${data.date ?? "—"} · ${data.time ?? ""}${data.time_end ? ` → ${data.time_end}` : ""} · ${data.price != null ? `${data.price} ${data.currency}` : "—"} (id: ${data.id})` }] };
}

async function add_accommodation(args) {
  const { name, location, check_in, check_out, check_in_time, check_out_time, price, currency, platform, reference, notes, travelers, paid_by, details } = args;
  let segment_id;
  try { segment_id = await resolveSegmentStrict("hotel", location, check_in ?? null); }
  catch (err) { return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] }; }
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      type:      "hotel",
      name:      name           || null,
      location:  location       || null,
      date:      check_in       || null,
      date_end:  check_out      || null,
      time:      check_in_time  || null,
      time_end:  check_out_time || null,
      price:     price          ?? null,
      currency:  currency       || "USD",
      platform:  platform       || null,
      reference: reference      || null,
      notes:     notes          || null,
      travelers: travelers      || "both",
      paid_by:   paid_by        || null,
      details:   details        ?? null,
      segment_id,
    })
    .select().single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Added [hotel] ${data.name} · ${data.date ?? ""}${data.date_end ? ` → ${data.date_end}` : ""} · ${data.location} · ${data.price != null ? `${data.price} ${data.currency}` : "—"} (id: ${data.id})` }] };
}

async function add_experience(args) {
  const { type, name, date, time, location, price, currency, platform, reference, notes, travelers, paid_by, details } = args;
  let segment_id;
  try { segment_id = await resolveSegmentStrict(type, location, date ?? null); }
  catch (err) { return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] }; }
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      type,
      name:      name      || null,
      date:      date      || null,
      time:      time      || null,
      location:  location  || null,
      price:     price     ?? null,
      currency:  currency  || "USD",
      platform:  platform  || null,
      reference: reference || null,
      notes:     notes     || null,
      travelers: travelers || "both",
      paid_by:   paid_by   || null,
      details:   details   ?? null,
      segment_id,
    })
    .select().single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Added [${data.type}] ${data.name} · ${data.date ?? "—"}${data.time ? ` at ${data.time}` : ""} · ${data.location ?? ""} · ${data.price != null ? `${data.price} ${data.currency}` : "—"} (id: ${data.id})` }] };
}

async function add_booking(args) {
  let segment_id;
  try { segment_id = await resolveSegmentStrict(args.type, args.location, args.date ?? null); }
  catch (err) { return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] }; }
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      type:      args.type,
      name:      args.name,
      date:      args.date      ?? null,
      date_end:  args.date_end  ?? null,
      location:  args.location  ?? null,
      origin:    args.origin    ?? null,
      time:      args.time      ?? null,
      time_end:  args.time_end  ?? null,
      price:     args.price     ?? null,
      currency:  args.currency  ?? "USD",
      platform:  args.platform  ?? null,
      reference: args.reference ?? null,
      notes:     args.notes     ?? null,
      travelers: args.travelers ?? "both",
      paid_by:   args.paid_by   ?? null,
      details:   args.details   ?? null,
      segment_id,
    })
    .select().single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Added [${data.type}] ${data.name} · ${data.date ?? "—"}${data.date_end ? ` → ${data.date_end}` : ""} · ${data.price != null ? `${data.price} ${data.currency}` : "—"}${data.location ? ` · ${data.location}` : ""}` }] };
}

// ── Shared row builder (used by bulk_add_bookings) ───────────────────────

function _buildBookingRow(type, item, segment_id) {
  const shared = {
    price:     item.price     ?? null,
    currency:  item.currency  || "USD",
    platform:  item.platform  || null,
    reference: item.reference || null,
    notes:     item.notes     || null,
    travelers: item.travelers || "both",
    paid_by:   item.paid_by   || null,
    details:   item.details   ?? null,
    map_query: item.map_query || null,
    map_lat:   item.map_lat   ?? null,
    map_lng:   item.map_lng   ?? null,
    segment_id,
  };
  if (TRANSIT_TYPES.includes(type)) {
    const origin      = item.origin      || null;
    const destination = item.destination || null;
    return {
      type, origin, location: destination,
      name:     item.name || (origin && destination ? `${origin} → ${destination}` : null),
      date:     item.date     || null,
      date_end: item.date_end || null,
      time:     item.departs  || item.time     || null,
      time_end: item.arrives  || item.time_end || null,
      ...shared,
    };
  }
  if (type === "hotel") {
    return {
      type: "hotel", origin: null,
      name:     item.name           || null,
      location: item.location       || null,
      date:     item.check_in       || item.date     || null,
      date_end: item.check_out      || item.date_end || null,
      time:     item.check_in_time  || item.time     || null,
      time_end: item.check_out_time || item.time_end || null,
      ...shared,
    };
  }
  // ticket | food | activity | city_transport | shopping
  return {
    type, origin: null,
    name:     item.name     || null,
    location: item.location || null,
    date:     item.date     || null,
    date_end: item.date_end || null,
    time:     item.time     || null,
    time_end: item.time_end || null,
    ...shared,
  };
}

async function bulk_add_bookings(args) {
  const { bookings } = args;
  if (!Array.isArray(bookings) || !bookings.length)
    return { isError: true, content: [{ type: "text", text: "Error: 'bookings' must be a non-empty array." }] };

  // Phase 1: resolve all segments — abort on the first failure so nothing partial is inserted
  const rows = [];
  for (let i = 0; i < bookings.length; i++) {
    const item = bookings[i];
    const { type } = item;
    const effectiveDate = item.check_in || item.date || null;
    let segment_id;
    try {
      segment_id = await resolveSegmentStrict(type, item.location || null, effectiveDate);
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Aborted — item ${i + 1} [${type}] "${item.name ?? item.origin ?? "?"}": ${err.message}` }],
      };
    }
    rows.push(_buildBookingRow(type, item, segment_id));
  }

  // Phase 2: single batch insert
  const { data, error } = await supabase.from("bookings").insert(rows).select();
  if (error) return { isError: true, content: [{ type: "text", text: `DB Error: ${error.message}` }] };

  const lines = data.map(b =>
    `✓ [${b.type}] ${b.name} · ${b.date ?? "—"}${b.date_end ? ` → ${b.date_end}` : ""} · ${b.price != null ? `${b.price} ${b.currency}` : "—"}${b.location ? ` · ${b.location}` : ""} (id: ${b.id})`
  );
  return { content: [{ type: "text", text: `✓ Bulk inserted ${data.length} booking(s):\n\n${lines.join("\n")}` }] };
}

async function update_booking(args) {
  const { id, ...changes } = args || {};
  if (!id) return { isError: true, content: [{ type: "text", text: "Error: Missing booking id" }] };

  try {
    const data = await updateBookingRecord("generic", id, changes);
    return {
      content: [{
        type: "text",
        text: `✓ Updated [${data.type}] ${data.name} · ${data.date ?? "—"}${data.date_end ? ` → ${data.date_end}` : ""} · ${data.price != null ? `${data.price} ${data.currency}` : "—"}${data.location ? ` · ${data.location}` : ""} (id: ${data.id})`,
      }],
    };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  }
}

async function batch_update_bookings(args) {
  const updates = args?.updates;
  if (!Array.isArray(updates) || !updates.length)
    return { isError: true, content: [{ type: "text", text: "Error: 'updates' must be a non-empty array of {id, ...fields}." }] };

  const results = [];
  for (const u of updates) {
    const { id, ...changes } = u || {};
    if (!id) { results.push(`✗ missing id`); continue; }
    try {
      const data = await updateBookingRecord("generic", id, changes);
      results.push(`✓ ${data.name} (${data.id})`);
    } catch (error) {
      results.push(`✗ ${id}: ${error.message}`);
    }
  }
  return { content: [{ type: "text", text: `Processed ${updates.length} update(s):\n\n${results.join("\n")}` }] };
}

async function query_bookings(args = {}) {
  const { type, location, date_from, date_to, settled, paid_by, travelers, segment_id, has_map, ids, search, fields, limit } = args;

  let query = supabase.from("bookings").select(Array.isArray(fields) && fields.length ? fields.join(",") : "*")
    .order("date", { ascending: true });

  if (type) query = query.eq("type", type);
  if (location) query = query.ilike("location", `%${location}%`);
  if (date_from) query = query.gte("date", date_from);
  if (date_to) query = query.lte("date", date_to);
  if (settled !== undefined) query = query.eq("settled", settled);
  if (paid_by) query = query.eq("paid_by", paid_by);
  if (travelers) query = query.eq("travelers", travelers);
  if (segment_id === "none") query = query.is("segment_id", null);
  else if (segment_id) query = query.eq("segment_id", segment_id);
  if (Array.isArray(ids) && ids.length) query = query.in("id", ids);
  if (search) {
    const s = `%${search}%`;
    query = query.or(`name.ilike.${s},notes.ilike.${s},location.ilike.${s},reference.ilike.${s}`);
  }
  if (has_map === true) query = query.or("map_query.not.is.null,map_lat.not.is.null");
  if (has_map === false) query = query.is("map_query", null).is("map_lat", null);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  if (!data.length) return { content: [{ type: "text", text: "No bookings matched." }] };
  return { content: [{ type: "text", text: `${data.length} booking(s):\n\n${JSON.stringify(data, null, 1)}` }] };
}

async function list_bookings(args) {
  let query = supabase.from("bookings").select("*").order("date", { ascending: true });
  if (args?.type && args.type !== "all") query = query.eq("type", args.type);
  const { data, error } = await query;
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  if (!data.length) return { content: [{ type: "text", text: "No bookings found." }] };
  const lines = data.map(b =>
    `[${b.type.toUpperCase()}] ${b.name}` +
    (b.date ? ` · ${b.date}` : "") +
    (b.date_end ? ` → ${b.date_end}` : "") +
    (b.time ? ` · ${b.time}${b.time_end ? ` → ${b.time_end}` : ""}` : "") +
    (b.location ? ` · ${b.location}` : "") +
    (b.price != null ? ` · ${b.price} ${b.currency}` : "") +
    (b.reference ? ` · ${b.reference}` : "") +
    (b.paid_by ? ` · paid by ${b.paid_by}` : " · unpaid") +
    (b.travelers !== "both" ? ` · ${b.travelers} only` : "") +
    (b.pass_code ? ` · 🎫 ${b.pass_format}` : "") +
    (b.segment_id ? ` · seg:${b.segment_id}` : " · seg:none") +
    ` (id: ${b.id})`
  );
  return { content: [{ type: "text", text: `${data.length} booking(s):\n\n${lines.join("\n")}` }] };
}

async function settle_booking(args) {
  const { error } = await supabase.from("bookings").update({ settled: true }).eq("id", args.id);
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Booking ${args.id} marked as settled.` }] };
}

async function delete_booking(args) {
  const { error } = await supabase.from("bookings").delete().eq("id", args.id);
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Booking ${args.id} deleted.` }] };
}

async function set_pass(args) {
  const { id, pass_code, pass_format = "QR_CODE" } = args;
  const { data, error } = await supabase
    .from("bookings").update({ pass_code, pass_format }).eq("id", id).select("name").single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Pass set for "${data.name}" (${pass_format})` }] };
}

async function add_todo(args) {
  const assignees = args.assignee === "both" ? ["peter", "friend"] : [args.assignee ?? "peter"];
  const rows = assignees.map(assignee => ({
    title: args.title, category: args.category ?? "do", assignee, deadline: args.deadline ?? null, done: false,
  }));
  const { data, error } = await supabase.from("todos").insert(rows).select();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  const summary = data.map(d => `"${d.title}" → ${d.assignee}`).join(" + ");
  return { content: [{ type: "text", text: `✓ ${data.length > 1 ? "2 todos" : "Todo"} added: ${summary} [${data[0].category}]${data[0].deadline ? ` · due ${data[0].deadline}` : ""}` }] };
}

async function list_todos(args) {
  let query = supabase.from("todos").select("*").order("created_at", { ascending: true });
  if (args?.done === true)  query = query.eq("done", true);
  if (args?.done === false) query = query.eq("done", false);
  const { data, error } = await query;
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  if (!data.length) return { content: [{ type: "text", text: "No todos found." }] };
  const lines = data.map(t =>
    `[${t.done ? "✓" : " "}] ${t.title} [${t.category}]` +
    (t.assignee !== "both" ? ` · ${t.assignee}` : "") +
    (t.deadline ? ` · due ${t.deadline}` : "") +
    ` (id: ${t.id})`
  );
  return { content: [{ type: "text", text: `${data.length} todo(s):\n\n${lines.join("\n")}` }] };
}

async function complete_todo(args) {
  const { error } = await supabase.from("todos").update({ done: true }).eq("id", args.id);
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Todo ${args.id} marked as done.` }] };
}

async function delete_todo(args) {
  const { error } = await supabase.from("todos").delete().eq("id", args.id);
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Todo ${args.id} deleted.` }] };
}


async function list_segments() {
  const { data: segs, error } = await supabase
    .from("segments").select("*").order("sort_order", { ascending: true });
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  if (!segs?.length) return { content: [{ type: "text", text: "No segments found." }] };

  const { data: bkgs } = await supabase.from("bookings").select("segment_id").not("segment_id", "is", null);
  const countMap = {};
  for (const b of bkgs ?? []) countMap[b.segment_id] = (countMap[b.segment_id] ?? 0) + 1;

  const lines = segs.map(s => {
    const n = countMap[s.id] ?? 0;
    return `[SEG] ${s.location} · sort:${s.sort_order} · ${n} booking${n !== 1 ? "s" : ""}${n === 0 ? " ⚠️ EMPTY" : ""} (id: ${s.id})`;
  });
  return { content: [{ type: "text", text: `${segs.length} segment(s):\n\n${lines.join("\n")}` }] };
}

async function create_segment(args) {
  const { location, sort_order } = args;
  let order = sort_order;
  if (!order) {
    const { count } = await supabase.from("segments").select("*", { count: "exact", head: true });
    order = (count ?? 0) + 1;
  }
  const { data, error } = await supabase
    .from("segments").insert({ location: location.trim(), sort_order: order }).select().single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Created segment [${data.location}] · sort:${data.sort_order} (id: ${data.id})` }] };
}

async function update_segment(args) {
  const { id, location, sort_order } = args;
  const updates = {};
  if (location  !== undefined) updates.location   = location.trim();
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (!Object.keys(updates).length)
    return { isError: true, content: [{ type: "text", text: "Nothing to update — provide location and/or sort_order." }] };
  const { data, error } = await supabase
    .from("segments").update(updates).eq("id", id).select().single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Segment updated: [${data.location}] · sort:${data.sort_order} (id: ${data.id})` }] };
}

async function delete_segment(args) {
  const { count } = await supabase
    .from("bookings").select("*", { count: "exact", head: true }).eq("segment_id", args.id);
  if (count > 0)
    return { isError: true, content: [{ type: "text", text: `Cannot delete: ${count} booking(s) still assigned to this segment. Use assign_segment to move them first.` }] };
  const { error } = await supabase.from("segments").delete().eq("id", args.id);
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Segment ${args.id} deleted.` }] };
}

async function assign_segment(args) {
  const { booking_id, segment_id = null } = args;
  const { data, error } = await supabase
    .from("bookings").update({ segment_id }).eq("id", booking_id)
    .select("name, type, date, segment_id").single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  const dest = data.segment_id ? `segment ${data.segment_id}` : "no segment (unassigned)";
  return { content: [{ type: "text", text: `✓ "${data.name}" (${data.type} · ${data.date ?? "—"}) → ${dest}` }] };
}

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return res.json({ status: "ok", name: "china-trip-bookings", version: "2.1.0" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: "Invalid JSON" }); }

  const { id, method, params } = body;

  if (method === "initialize") {
    return res.json({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "china-trip-bookings", version: "2.1.0" } } });
  }
  if (method === "tools/list") {
    return res.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  }
  if (method === "tools/call") {
    const { name, arguments: args } = params;
    const handlers = {
      add_transport, add_accommodation, add_experience,
      add_booking, bulk_add_bookings, list_bookings, query_bookings, settle_booking, delete_booking, update_booking, batch_update_bookings, set_pass,
      list_segments, create_segment, update_segment, delete_segment, assign_segment,
      add_todo, list_todos, complete_todo, delete_todo,
    };
    const fn = handlers[name];
    const result = fn
      ? await fn(args)
      : { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    return res.json({ jsonrpc: "2.0", id, result });
  }

  return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
}
