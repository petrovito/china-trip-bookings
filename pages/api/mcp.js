// pages/api/mcp.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TRANSIT_TYPES = ["flight", "train"];

async function getOrCreateSegment(type, location) {
  if (!location?.trim() || TRANSIT_TYPES.includes(type)) return null;
  const loc = location.trim();
  const { data: existing } = await supabase.from("segments").select("id").eq("location", loc).single();
  if (existing) return existing.id;
  const { count } = await supabase.from("segments").select("*", { count: "exact", head: true });
  const { data: created, error } = await supabase
    .from("segments")
    .insert({ location: loc, sort_order: (count ?? 0) + 1 })
    .select("id").single();
  if (error) { console.error("getOrCreateSegment:", error.message); return null; }
  return created.id;
}

const TOOLS = [
  {
    name: "add_booking",
    description: "Add a booking to Peter's China Trip 2026 tracker",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["flight", "hotel", "train", "ticket", "food", "activity"], description: "Type of booking. Use 'activity' for plans that don't involve tracked expenses." },
        name: { type: "string", description: "Name / description of the booking" },
        date: { type: "string", description: "Start date in YYYY-MM-DD format" },
        date_end: { type: "string", description: "End/checkout date in YYYY-MM-DD format — use for hotels (checkout), multi-day activities, etc." },
        location: { type: "string", description: "City or region, e.g. 'Beijing', 'Zhangjiajie'. Used to group bookings in the trip view." },
        price: { type: "number", description: "Price as a number — omit for free activities" },
        currency: { type: "string", enum: ["USD", "CNY", "EUR", "KRW", "VND", "DKK"], description: "Currency — defaults to USD" },
        platform: { type: "string", description: "Booking platform e.g. Trip.com, Klook, Booking.com" },
        reference: { type: "string", description: "Booking reference or flight number(s)" },
        notes: { type: "string", description: "Extra details — timings, room type, etc." },
        travelers: { type: "string", enum: ["peter", "friend", "both"], description: "Who this is for — defaults to both" },
        paid_by: { type: "string", enum: ["peter", "friend"], description: "Who paid — omit if unpaid" },
      },
      required: ["type", "name"],
    },
  },
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
      properties: {
        id: { type: "string", description: "The UUID of the booking to mark as settled" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_booking",
    description: "Delete a booking by its ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The UUID of the booking to delete" },
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
      properties: {
        id: { type: "string", description: "The UUID of the todo to mark as done" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_todo",
    description: "Delete a todo item by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The UUID of the todo to delete" },
      },
      required: ["id"],
    },
  },
];

async function add_booking(args) {
  const segment_id = await getOrCreateSegment(args.type, args.location);
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      type: args.type,
      name: args.name,
      date: args.date ?? null,
      date_end: args.date_end ?? null,
      location: args.location ?? null,
      price: args.price ?? null,
      currency: args.currency ?? "USD",
      platform: args.platform ?? null,
      reference: args.reference ?? null,
      notes: args.notes ?? null,
      travelers: args.travelers ?? "both",
      paid_by: args.paid_by ?? null,
      segment_id,
    })
    .select().single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Added [${data.type}] ${data.name} · ${data.date ?? "—"}${data.date_end ? ` → ${data.date_end}` : ""} · ${data.price != null ? `${data.price} ${data.currency}` : "—"}${data.location ? ` · ${data.location}` : ""}` }] };
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
    (b.location ? ` · ${b.location}` : "") +
    (b.price != null ? ` · ${b.price} ${b.currency}` : "") +
    (b.reference ? ` · ${b.reference}` : "") +
    (b.travelers !== "both" ? ` · ${b.travelers} only` : "") +
    (b.pass_code ? ` · 🎫 ${b.pass_format}` : "") +
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
    .from("bookings")
    .update({ pass_code, pass_format })
    .eq("id", id)
    .select("name")
    .single();
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Pass set for "${data.name}" (${pass_format})` }] };
}

async function add_todo(args) {
  const assignees = args.assignee === "both" ? ["peter", "friend"] : [args.assignee ?? "peter"];
  const rows = assignees.map(assignee => ({
    title:    args.title,
    category: args.category ?? "do",
    assignee,
    deadline: args.deadline ?? null,
    done:     false,
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return res.json({ status: "ok", name: "china-trip-bookings", version: "1.3.0" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: "Invalid JSON" }); }

  const { jsonrpc, id, method, params } = body;

  if (method === "initialize") {
    return res.json({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "china-trip-bookings", version: "1.3.0" } } });
  }
  if (method === "tools/list") {
    return res.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  }
  if (method === "tools/call") {
    const { name, arguments: args } = params;
    let result;
    if (name === "add_booking") result = await add_booking(args);
    else if (name === "list_bookings") result = await list_bookings(args);
    else if (name === "settle_booking") result = await settle_booking(args);
    else if (name === "delete_booking") result = await delete_booking(args);
    else if (name === "set_pass") result = await set_pass(args);
    else if (name === "add_todo") result = await add_todo(args);
    else if (name === "list_todos") result = await list_todos(args);
    else if (name === "complete_todo") result = await complete_todo(args);
    else if (name === "delete_todo") result = await delete_todo(args);
    else result = { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    return res.json({ jsonrpc: "2.0", id, result });
  }

  return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
}
