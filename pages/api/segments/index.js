// pages/api/segments/index.js
import { supabase } from "../lib/db.js";
import { isAuthorized } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("segments")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "POST") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const { location, sort_order } = req.body;
    if (!location) return res.status(400).json({ error: "location required" });

    let order = sort_order;
    if (order == null) {
      const { count } = await supabase
        .from("segments")
        .select("*", { count: "exact", head: true });
      order = (count ?? 0) + 1;
    }

    const { data, error } = await supabase
      .from("segments")
      .insert({ location: location.trim(), sort_order: order })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.status(405).json({ error: "Method not allowed" });
}
