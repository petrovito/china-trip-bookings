// pages/api/lib/segments.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TRANSIT_TYPES = ["flight", "train"];

// Looks up a segment by location name, creates it if it doesn't exist.
// Returns null for transit bookings or bookings with no location.
export async function getOrCreateSegment(type, location) {
  if (!location?.trim() || TRANSIT_TYPES.includes(type)) return null;
  const loc = location.trim();

  const { data: existing } = await supabase
    .from("segments")
    .select("id")
    .eq("location", loc)
    .single();

  if (existing) return existing.id;

  const { count } = await supabase
    .from("segments")
    .select("*", { count: "exact", head: true });

  const { data: created, error } = await supabase
    .from("segments")
    .insert({ location: loc, sort_order: (count ?? 0) + 1 })
    .select("id")
    .single();

  if (error) { console.error("getOrCreateSegment:", error.message); return null; }
  return created.id;
}
