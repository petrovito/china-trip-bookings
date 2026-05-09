// pages/api/mcp.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ── Tool definitions ────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "add_booking",
    description: "Add a booking to Peter's China Trip 2026 tracker",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["flight", "hotel", "train", "ticket"], description: "Type of booking" },
        name: { type: "string", description: "Name / description of the booking" },
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        price: { type: "number", description: "Price as a number" },
        currency: { type: "string", enum: ["USD", "CNY", "EUR", "KRW", "VND"], description: "Currency — defaults to USD" },
        platform: { type: "string", description: "Booking platform e.g. Trip.com, Klook" },
        reference: { type: "string", description: "Booking reference or flight number(s)" },
        notes: { type: "string", description: "Extra details — timings, room type, etc." },
        travelers: { type: "string", enum: ["peter", "friend", "both"], description: "Who this is for — defaults to both" },
        paid_by: { type: "string", enum: ["peter", "friend"], description: "Who paid" },
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
        type: {
          type: "string",
          enum: ["flight", "hotel", "train", "ticket", "all"],
          description: "Filter by type — omit for all",
        },
      },
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
];

// ── Tool handlers ───────────────────────────────────────────────────────────
async function add_booking(args) {
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      type: args.type,
      name: args.name,
      date: args.date ?? null,
      price: args.price ?? null,
      currency: args.currency ?? "USD",
      platform: args.platform ?? null,
      reference: args.reference ?? null,
      notes: args.notes ?? null,
      travelers: args.travelers ?? "both",
      paid_by: args.paid_by ?? null,
    })
    .select()
    .single();

  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };

  return {
    content: [{
      type: "text",
      text: [
        `✓ Booking added!`,
        `  [${data.type}] ${data.name}`,
        `  Date: ${data.date ?? "—"}  Price: ${data.price != null ? `${data.price} ${data.currency}` : "—"}`,
        `  Travelers: ${data.travelers}`,
        data.reference ? `  Ref: ${data.reference}` : null,
        data.notes ? `  Notes: ${data.notes}` : null,
      ].filter(Boolean).join("\n"),
    }],
  };
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
    (b.price != null ? ` · ${b.price} ${b.currency}` : "") +
    (b.reference ? ` · ${b.reference}` : "") +
    (b.travelers !== "both" ? ` · ${b.travelers} only` : "") +
    `  (id: ${b.id})`
  );

  return { content: [{ type: "text", text: `${data.length} booking(s):\n\n${lines.join("\n")}` }] };
}

async function delete_booking(args) {
  const { error } = await supabase.from("bookings").delete().eq("id", args.id);
  if (error) return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
  return { content: [{ type: "text", text: `✓ Booking ${args.id} deleted.` }] };
}

// ── Main handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return res.json({ status: "ok", name: "china-trip-bookings", version: "1.0.0" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { jsonrpc, id, method, params } = req.body;

  try {
    switch (method) {
      case "initialize":
        return res.json({
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "china-trip-bookings", version: "1.0.0" },
          },
        });

      case "notifications/initialized":
        return res.status(204).end();

      case "ping":
        return res.json({ jsonrpc: "2.0", id, result: {} });

      case "tools/list":
        return res.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });

      case "tools/call": {
        const name = params?.name;
        const args = params?.arguments ?? {};
        let result;
        if (name === "add_booking") result = await add_booking(args);
        else if (name === "list_bookings") result = await list_bookings(args);
        else if (name === "delete_booking") result = await delete_booking(args);
        else result = { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
        return res.json({ jsonrpc: "2.0", id, result });
      }

      default:
        return res.status(400).json({
          jsonrpc: "2.0", id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
    }
  } catch (e) {
    return res.status(500).json({
      jsonrpc: "2.0", id,
      error: { code: -32603, message: e.message },
    });
  }
}
