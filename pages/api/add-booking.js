// pages/api/add-booking.js
// Claude calls this via GET with booking data as query params
// Protected by a secret token

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SECRET = process.env.API_SECRET;

export default async function handler(req, res) {
  const { token, type, name, date, price, currency, platform, reference, notes, travelers, paid_by } = req.query;

  if (!SECRET || token !== SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const { data, error } = await supabase.from("bookings").insert({
    type: type || "flight",
    name,
    date: date || null,
    price: price ? parseFloat(price) : null,
    currency: currency || "USD",
    platform: platform || null,
    reference: reference || null,
    notes: notes || null,
    travelers: travelers || "both",
    paid_by: paid_by || null,
  }).select();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, booking: data[0] });
}
