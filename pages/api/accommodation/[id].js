// pages/api/accommodation/[id].js
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
  const { id } = req.query;

  if (req.method === "PUT") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

    const {
      name, location,
      check_in, check_out, check_in_time, check_out_time,
      date, date_end, time, time_end,
      price, currency, platform, reference, notes,
      travelers, paid_by, settled,
    } = req.body;

    const segment_id = await getOrCreateSegment(location);

    const { data, error } = await supabase
      .from("bookings")
      .update({
        type:      "hotel",
        name:      name              || null,
        date:      check_in          || date      || null,
        date_end:  check_out         || date_end  || null,
        time:      check_in_time     || time      || null,
        time_end:  check_out_time    || time_end  || null,
        location:  location          || null,
        price:     price             || null,
        currency:  currency          || "USD",
        platform:  platform          || null,
        reference: reference         || null,
        notes:     notes             || null,
        travelers: travelers         || "both",
        paid_by:   paid_by           || null,
        settled:   settled           ?? false,
        segment_id,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "DELETE") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  res.status(405).json({ error: "Method not allowed" });
}
