// pages/api/bookings/[id].js
import { supabase } from "../lib/db.js";
import { isAuthorized } from "../lib/auth.js";
import { updateBookingRecord } from "../lib/bookings.js";

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "PUT") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const data = await updateBookingRecord("generic", id, req.body);
      return res.json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === "PATCH") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const { data, error } = await supabase
      .from("bookings")
      .update(req.body)
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
