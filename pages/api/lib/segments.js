// pages/api/lib/segments.js
import { supabase } from "./db.js";

export const TRANSIT_TYPES = ["flight", "train"];

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

async function createNewSegment(loc) {
  const { count } = await supabase
    .from("segments")
    .select("*", { count: "exact", head: true });

  const { data: created, error } = await supabase
    .from("segments")
    .insert({ location: loc, sort_order: (count ?? 0) + 1 })
    .select("id")
    .single();

  if (error) {
    console.error("getOrCreateSegment:", error.message);
    return null;
  }

  return created.id;
}

// bookingDate: YYYY-MM-DD string. Used to find the right segment when the same
// city appears multiple times in the itinerary (e.g. Kunming twice). If the
// booking date falls within 1 day of an existing same-city segment's date range,
// it is assigned there. Otherwise a new segment is created.
export async function getOrCreateSegment(type, location, bookingDate = null) {
  if (!location?.trim() || TRANSIT_TYPES.includes(type)) return null;
  const loc = location.trim();

  // Find all existing segments with this location, oldest first
  const { data: existing } = await supabase
    .from("segments")
    .select("id")
    .eq("location", loc)
    .order("sort_order", { ascending: true });

  if (!existing?.length) {
    return createNewSegment(loc);
  }

  // No date context — fall back to first matching segment (safe default)
  if (!bookingDate) {
    return existing[0].id;
  }

  // For each candidate segment, compute its date range from its current bookings.
  // Use a 1-day buffer on each side to handle same-day checkout/checkin cases.
  for (const seg of existing) {
    const { data: segBookings } = await supabase
      .from("bookings")
      .select("date, date_end")
      .eq("segment_id", seg.id)
      .not("date", "is", null);

    if (!segBookings?.length) {
      // Empty segment — assign the booking here
      return seg.id;
    }

    const allDates = segBookings.flatMap(b => [b.date, b.date_end].filter(Boolean));
    const segMin = allDates.reduce((a, b) => (a < b ? a : b));
    const segMax = allDates.reduce((a, b) => (a > b ? a : b));

    const windowMin = offsetDate(segMin, -1);
    const windowMax = offsetDate(segMax, 1);

    if (bookingDate >= windowMin && bookingDate <= windowMax) {
      return seg.id;
    }
  }

  // No nearby segment found for this city — create a fresh one
  return createNewSegment(loc);
}
