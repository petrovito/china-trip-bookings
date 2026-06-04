// pages/api/segments/[id].js
import { supabase } from "../lib/db.js";
import { isAuthorized } from "../lib/auth.js";

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "PATCH") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const { data, error } = await supabase
      .from("segments")
      .update(req.body)
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "DELETE") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

    const { count } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("segment_id", id);

    if (count > 0) {
      return res.status(409).json({
        error: `Cannot delete: ${count} booking(s) still reference this segment.`,
      });
    }

    const { error } = await supabase.from("segments").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  res.status(405).json({ error: "Method not allowed" });
}
