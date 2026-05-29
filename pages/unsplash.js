// pages/api/unsplash.js
export default async function handler(req, res) {
  const { location } = req.query;
  if (!location) return res.status(400).json({ error: "location required" });

  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return res.status(500).json({ error: "UNSPLASH_ACCESS_KEY not set" });

  const query = encodeURIComponent(`${location} China landscape travel`);
  const url = `https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape&client_id=${key}`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    const imgUrl = data?.results?.[0]?.urls?.regular ?? null;
    if (!imgUrl) return res.status(404).json({ error: "no image found" });
    // Cache for 24h — images won't change between refreshes
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.json({ url: imgUrl });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
