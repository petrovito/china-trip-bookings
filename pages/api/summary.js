// pages/api/summary.js
import { supabase } from "./lib/db.js";
import { computeCurrencySummaries } from "./lib/summary.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { data, error } = await supabase
    .from("bookings")
    .select("id,type,price,currency,paid_by,settled,travelers")
    .order("date", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(computeCurrencySummaries(data || []));
}
