// pages/api/mcp.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const config = { api: { bodyParser: false } };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function buildServer() {
  const server = new McpServer({
    name: "china-trip-bookings",
    version: "1.0.0",
  });

  // ── Tool: add_booking ───────────────────────────────────────────────────────
  server.tool(
    "add_booking",
    "Add a booking to Peter's China Trip 2026 tracker",
    {
      type: z.enum(["flight", "hotel", "train", "ticket"])
        .describe("Type of booking"),
      name: z.string()
        .describe("Name / description of the booking"),
      date: z.string().optional()
        .describe("Date in YYYY-MM-DD format"),
      price: z.number().optional()
        .describe("Price as a number"),
      currency: z.enum(["USD", "CNY", "EUR", "KRW", "VND"]).optional()
        .describe("Currency code — defaults to USD"),
      platform: z.string().optional()
        .describe("Booking platform e.g. Trip.com, Klook"),
      reference: z.string().optional()
        .describe("Booking reference or flight number(s)"),
      notes: z.string().optional()
        .describe("Any extra details — timings, room type, etc."),
      travelers: z.enum(["peter", "friend", "both"]).optional()
        .describe("Who this booking is for — defaults to both"),
      paid_by: z.enum(["peter", "friend"]).optional()
        .describe("Who paid"),
    },
    async (args) => {
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

      if (error) {
        return {
          content: [{ type: "text", text: `Error inserting booking: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `✓ Booking added (id: ${data.id})\n` +
            `  Type: ${data.type}\n` +
            `  Name: ${data.name}\n` +
            `  Date: ${data.date ?? "—"}\n` +
            `  Price: ${data.price != null ? `${data.price} ${data.currency}` : "—"}\n` +
            `  Travelers: ${data.travelers}\n` +
            (data.reference ? `  Ref: ${data.reference}\n` : "") +
            (data.notes ? `  Notes: ${data.notes}` : ""),
        }],
      };
    }
  );

  // ── Tool: list_bookings ─────────────────────────────────────────────────────
  server.tool(
    "list_bookings",
    "List all bookings in Peter's China Trip 2026 tracker",
    {
      type: z.enum(["flight", "hotel", "train", "ticket", "all"]).optional()
        .describe("Filter by type — omit for all"),
    },
    async ({ type }) => {
      let query = supabase.from("bookings").select("*").order("date", { ascending: true });
      if (type && type !== "all") query = query.eq("type", type);

      const { data, error } = await query;

      if (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      if (!data.length) {
        return { content: [{ type: "text", text: "No bookings found." }] };
      }

      const lines = data.map(b =>
        `[${b.type.toUpperCase()}] ${b.name}` +
        (b.date ? ` · ${b.date}` : "") +
        (b.price != null ? ` · ${b.price} ${b.currency}` : "") +
        (b.reference ? ` · ${b.reference}` : "") +
        (b.travelers !== "both" ? ` · ${b.travelers} only` : "")
      );

      return {
        content: [{ type: "text", text: `${data.length} booking(s):\n\n${lines.join("\n")}` }],
      };
    }
  );

  // ── Tool: delete_booking ────────────────────────────────────────────────────
  server.tool(
    "delete_booking",
    "Delete a booking by its ID",
    {
      id: z.string().describe("The UUID of the booking to delete"),
    },
    async ({ id }) => {
      const { error } = await supabase.from("bookings").delete().eq("id", id);

      if (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      return { content: [{ type: "text", text: `✓ Booking ${id} deleted.` }] };
    }
  );

  return server;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. MCP uses POST." });
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — works on Vercel serverless
  });

  res.on("close", () => transport.close());

  await server.connect(transport);
  await transport.handleRequest(req, res, await rawBody(req));
}

// Read raw body since bodyParser is disabled
function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
