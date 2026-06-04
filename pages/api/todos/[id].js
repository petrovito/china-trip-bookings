import { supabase } from "../lib/db.js";
import { isAuthorized } from "../lib/auth.js";

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "PATCH") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const { data, error } = await supabase
      .from("todos")
      .update(req.body)
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "DELETE") {
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  res.status(405).end();
}
