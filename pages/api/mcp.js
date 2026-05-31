import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TOOLS = [
  {
    name: "add_booking",
    description: "Add a new booking to the China trip tracker.",
    inputSchema: {
      type: "object",
      properties: {
        type:       { type: "string", enum: ["flight","hotel","train","ticket","food","activity"], description: "Booking type" },
        name:       { type: "string", description: "Booking name / description" },
        date:       { type: "string", description: "Start date (YYYY-MM-DD)" },
        date_end:   { type: "string", description: "End date for hotels, activities (YYYY-MM-DD)" },
        time:       { type: "string", description: "Departure / check-in / start time (HH:MM)" },
        time_end:   { type: "string", description: "Arrival / check-out / end time (HH:MM)" },
        origin:     { type: "string", description: "Departure city or airport for flights and trains" },
        location:   { type: "string", description: "Destination city / region (e.g. Beijing, Lijiang)" },
        price:      { type: "number", description: "Price" },
        currency:   { type: "string", enum: ["USD","CNY","EUR","KRW","VND","DKK"], description: "Currency" },
        platform:   { type: "string", description: "Booking platform (e.g. Trip.com, Booking.com)" },
        reference:  { type: "string", description: "Confirmation number or flight code" },
        notes:      { type: "string", description: "Free-form notes" },
        travelers:  { type: "string", enum: ["peter","friend","both"], description: "Who this booking is for" },
        paid_by:    { type: "string", enum: ["peter","friend"], description: "Who paid (omit if unpaid)" },
      },
      required: ["type", "name"],
    },
  },
  {
    name: "list_bookings",
    description: "List all bookings, optionally filtered by type.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["flight","hotel","train","ticket","food","activity"], description: "Filter by type" },
      },
    },
  },
  {
    name: "settle_booking",
    description: "Mark a booking as settled (expenses reimbursed).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Booking UUID" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_booking",
    description: "Delete a booking by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Booking UUID" },
      },
      required: ["id"],
    },
  },
  {
    name: "set_pass",
    description: "Store a decoded barcode/QR string for a booking. Appends to the passes array for the specified traveler.",
    inputSchema: {
      type: "object",
      properties: {
        id:     { type: "string", description: "Booking UUID" },
        code:   { type: "string", description: "Decoded barcode text" },
        format: { type: "string", description: "Barcode format: QR_CODE, PDF_417, AZTEC, CODE_128, etc." },
        who:    { type: "string", enum: ["peter","friend"], description: "Which traveler this pass belongs to" },
      },
      required: ["id", "code", "format", "who"],
    },
  },
];

async function handleTool(name, args) {
  if (name === "add_booking") {
    const row = {
      type:      args.type,
      name:      args.name,
      date:      args.date      || null,
      date_end:  args.date_end  || null,
      time:      args.time      || null,
      time_end:  args.time_end  || null,
      origin:    args.origin    || null,
      location:  args.location  || null,
      price:     args.price     ?? null,
      currency:  args.currency  || "USD",
      platform:  args.platform  || null,
      reference: args.reference || null,
      notes:     args.notes     || null,
      travelers: args.travelers || "both",
      paid_by:   args.paid_by   || null,
    };
    const { data, error } = await supabase.from("bookings").insert([row]).select().single();
    if (error) throw new Error(error.message);
    return `Booking added: ${data.id} — ${data.name} (${data.type}, ${data.date || "no date"})`;
  }

  if (name === "list_bookings") {
    let q = supabase.from("bookings").select("*").order("date", { ascending: true });
    if (args.type) q = q.eq("type", args.type);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data.length) return "No bookings found.";
    return data.map(b => {
      const passCount = (b.passes || []).length;
      const peterPasses = (b.passes || []).filter(p => p.who === "peter").length;
      const friendPasses = (b.passes || []).filter(p => p.who === "friend").length;
      const passNote = passCount > 0
        ? ` 🎫 P:${peterPasses} F:${friendPasses}`
        : b.pass_code ? " 🎫(legacy)" : "";
      const timeStr = b.time ? ` ${b.time}${b.time_end ? `→${b.time_end}` : ""}` : "";
      const routeStr = (b.origin || b.location) ? ` [${b.origin ? b.origin + " → " : ""}${b.location || ""}]` : "";
      return `[${b.type}] ${b.name}${routeStr}${timeStr} | ${b.date || "?"} | ${b.price ? b.price + " " + b.currency : "—"} | ${b.travelers || "both"} | paid:${b.paid_by || "pending"} | settled:${b.settled ? "yes" : "no"}${passNote} | id:${b.id}`;
    }).join("\n");
  }

  if (name === "settle_booking") {
    const { error } = await supabase.from("bookings").update({ settled: true }).eq("id", args.id);
    if (error) throw new Error(error.message);
    return `Booking ${args.id} marked as settled.`;
  }

  if (name === "delete_booking") {
    const { error } = await supabase.from("bookings").delete().eq("id", args.id);
    if (error) throw new Error(error.message);
    return `Booking ${args.id} deleted.`; 
  }

  if (name === "set_pass") {
    const { data: existing, error: fetchErr } = await supabase
      .from("bookings").select("passes").eq("id", args.id).single();
    if (fetchErr) throw new Error(fetchErr.message);
    const currentPasses = existing?.passes || [];
    const newPasses = [...currentPasses, { who: args.who, code: args.code, format: args.format }];
    const { error } = await supabase.from("bookings").update({ passes: newPasses }).eq("id", args.id);
    if (error) throw new Error(error.message);
    return `Pass added for ${args.who} on booking ${args.id} (${args.format}). Total passes: ${newPasses.length}.`;
  }

  throw new Error(`Unknown tool: ${name}`);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body;

  // MCP initialize
  if (body.method === "initialize") {
    return res.json({
      jsonrpc: "2.0", id: body.id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "china-trip-bookings", version: "1.3.0" },
        capabilities: { tools: {} },
      },
    });
  }

  // tools/list
  if (body.method === "tools/list") {
    return res.json({ jsonrpc: "2.0", id: body.id, result: { tools: TOOLS } });
  }

  // tools/call
  if (body.method === "tools/call") {
    try {
      const result = await handleTool(body.params.name, body.params.arguments || {});
      return res.json({
        jsonrpc: "2.0", id: body.id,
        result: { content: [{ type: "text", text: result }] },
      });
    } catch (e) {
      return res.json({
        jsonrpc: "2.0", id: body.id,
        result: { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true },
      });
    }
  }

  return res.json({ jsonrpc: "2.0", id: body.id, result: {} });
}
