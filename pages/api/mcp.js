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

const SHARED_FIELDS = {
  price:     { type: "number",  description: "Price as a number — omit for free activities" },
  currency:  { type: "string",  enum: ["USD", "CNY", "EUR", "KRW", "VND", "DKK"], description: "Currency — defaults to USD" },
  platform:  { type: "string",  description: "Booking platform e.g. Trip.com, Klook, Booking.com" },
  reference: { type: "string",  description: "Booking reference or confirmation number" },
  notes:     { type: "string",  description: "Extra details" },
  travelers: { type: "string",  enum: ["peter", "friend", "both"], description: "Who this is for — defaults to both" },
  paid_by:   { type: "string",  enum: ["peter", "friend"], description: "Who paid — omit if unpaid" },
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
        type:     { type: "string", enum: ["ticket", "food", "activity"], description: "ticket=attraction/museum, food=restaurant, activity=other plan" },
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
        type:     { type: "string", enum: ["flight", "hotel", "train", "ticket", "food", "activity"] },
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
        type: { type: "string", enum: ["flight", "hotel", "train", "ticket", "food", "activity", "all"], description: "Filter by type — omit for all" },
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
        id:         { type: "string", description: "The UUID of the booking to update" },
        type:       { type: "string", enum: ["flight", "hotel", "train", "ticket", "food", "activity"], description: "Optional new booking type" },
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
      },
      required: ["id"],
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
  const { type, origin, destination, date, departs, arrives, price, currency, platform, reference, notes, travelers, paid_by } = args;
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
      segment_id: null,
    })
    .select().single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Added [${data.type}] ${data.name} · ${data.date ?? "—"} · ${data.time ?? ""}${data.time_end ? ` → ${data.time_end}` : ""} · ${data.price != null ? `${data.price} ${data.currency}` : "—"} (id: ${data.id})` }] };
}

async function add_accommodation(args) {
  const { name, location, check_in, check_out, check_in_time, check_out_time, price, currency, platform, reference, notes, travelers, paid_by } = args;
  const segment_id = await getOrCreateSegment("hotel", location, check_in ?? null);
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
      segment_id,
    })
    .select().single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Added [hotel] ${data.name} · ${data.date ?? ""}${data.date_end ? ` → ${data.date_end}` : ""} · ${data.location} · ${data.price != null ? `${data.price} ${data.currency}` : "—"} (id: ${data.id})` }] };
}

async function add_experience(args) {
  const { type, name, date, time, location, price, currency, platform, reference, notes, travelers, paid_by } = args;
  const segment_id = await getOrCreateSegment(type, location, date ?? null);
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
      segment_id,
    })
    .select().single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Added [${data.type}] ${data.name} · ${data.date ?? "—"}${data.time ? ` at ${data.time}` : ""} · ${data.location ?? ""} · ${data.price != null ? `${data.price} ${data.currency}` : "—"} (id: ${data.id})` }] };
}

async function add_booking(args) {
  const segment_id = await getOrCreateSegment(args.type, args.location, args.date ?? null);
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
      segment_id,
    })
    .select().single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Added [${data.type}] ${data.name} · ${data.date ?? "—"}${data.date_end ? ` → ${data.date_end}` : ""} · ${data.price != null ? `${data.price} ${data.currency}` : "—"}${data.location ? ` · ${data.location}` : ""}` }] };
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
  if (req.method === "GET") return res.json({ status: "ok", name: "china-trip-bookings", version: "2.0.0" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: "Invalid JSON" }); }

  const { id, method, params } = body;

  if (method === "initialize") {
    return res.json({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "china-trip-bookings", version: "2.0.0" } } });
  }
  if (method === "tools/list") {
    return res.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  }
  if (method === "tools/call") {
    const { name, arguments: args } = params;
    const handlers = {
      add_transport, add_accommodation, add_experience,
      add_booking, list_bookings, settle_booking, delete_booking, update_booking, set_pass,
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
