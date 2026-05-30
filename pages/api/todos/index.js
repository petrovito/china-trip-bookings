import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .order("category")
      .order("created_at");
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "POST") {
    if (req.headers.authorization !== `Bearer ${process.env.WRITE_PASSWORD}`)
      return res.status(401).json({ error: "Unauthorized" });
    const { title, category, assignee } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });
    const { data, error } = await supabase
      .from("todos")
      .insert({ title, category: category || "do", assignee: assignee || "both" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.status(405).end();
}
