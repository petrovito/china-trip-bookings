// pages/api/todos/index.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function isAuthorized(req) {
  return req.headers.authorization === `Bearer ${process.env.WRITE_PASSWORD}`;
}

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
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const { title, category, assignee, deadline, segment_id, booking_id } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });
    const { data, error } = await supabase
      .from("todos")
      .insert({
        title,
        category:   category   || "do",
        assignee:   assignee   || "peter",
        deadline:   deadline   || null,
        segment_id: segment_id || null,
        booking_id: booking_id || null,
        done: false,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.status(405).end();
}
