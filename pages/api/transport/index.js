// pages/api/transport/index.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function isAuthorized(req) {
  return req.headers.authorization === `Bearer ${process.env.WRITE_PASSWORD}`;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .in("type", ["flight", "train"])
      .order("date", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "POST") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

    const {
      type, origin, location, date, time, time_end,
      price, currency, platform, reference, notes,
      travelers, paid_by,
    } = req.body;

    // Name is auto-assembled from origin + destination (location)
    const name = (origin && location)
      ? `${origin} → ${location}`
      : (req.body.name || `${origin || ""}${location ? ` → ${location}` : ""}`);

    const { data, error } = await supabase
      .from("bookings")
      .insert({
        type,
        name,
        origin:    origin    || null,
        date:      date      || null,
        location:  location  || null,
        time:      time      || null,
        time_end:  time_end  || null,
        price:     price     || null,
        currency:  currency  || "USD",
        platform:  platform  || null,
        reference: reference || null,
        notes:     notes     || null,
        travelers: travelers || "both",
        paid_by:   paid_by   || null,
        segment_id: null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.status(405).json({ error: "Method not allowed" });
}
