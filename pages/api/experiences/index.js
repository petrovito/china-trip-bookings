// pages/api/experiences/index.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function isAuthorized(req) {
  return req.headers.authorization === `Bearer ${process.env.WRITE_PASSWORD}`;
}

async function getOrCreateSegment(location) {
  if (!location?.trim()) return null;
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

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .in("type", ["ticket", "food", "activity"])
      .order("date", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "POST") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

    const {
      type, name, date, time, location,
      price, currency, platform, reference, notes,
      travelers, paid_by,
    } = req.body;

    const segment_id = await getOrCreateSegment(location);

    const { data, error } = await supabase
      .from("bookings")
      .insert({
        type,
        name:      name      || null,
        date:      date      || null,
        time:      time      || null,
        location:  location  || null,
        price:     price     || null,
        currency:  currency  || "USD",
        platform:  platform  || null,
        reference: reference || null,
        notes:     notes     || null,
        travelers: travelers || "both",
        paid_by:   paid_by   || null,
        segment_id,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.status(405).json({ error: "Method not allowed" });
}
