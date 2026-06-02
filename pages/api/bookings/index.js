// pages/api/bookings/index.js
import { createClient } from "@supabase/supabase-js";
import { getOrCreateSegment } from "../lib/segments.js";

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
      .order("date", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "POST") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

    const {
      type, name, date, date_end, price, currency, platform,
      reference, notes, travelers, paid_by, location, time,
      time_end, origin, settled,
    } = req.body;

    const segment_id = await getOrCreateSegment(type, location);

    const { data, error } = await supabase
      .from("bookings")
      .insert({
        type,
        name,
        date:        date        || null,
        date_end:    date_end    || null,
        price:       price       || null,
        currency:    currency    || "USD",
        platform:    platform    || null,
        reference:   reference   || null,
        notes:       notes       || null,
        travelers:   travelers   || "both",
        paid_by:     paid_by     || null,
        location:    location    || null,
        time:        time        || null,
        time_end:    time_end    || null,
        origin:      origin      || null,
        settled:     settled     || false,
        segment_id,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.status(405).json({ error: "Method not allowed" });
}
