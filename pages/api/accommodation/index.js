// pages/api/accommodation/index.js
import { supabase } from "../lib/db.js";
import { isAuthorized } from "../lib/auth.js";
import { createBookingRecord } from "../lib/bookings.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("type", "hotel")
      .order("date", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "POST") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const data = await createBookingRecord("accommodation", req.body);
      return res.status(201).json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
