import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import Head from "next/head";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TYPES = [
  { id: "flight", label: "Flight", color: "#0ea5e9", icon: "✈" },
  { id: "hotel", label: "Hotel", color: "#8b5cf6", icon: "🏨" },
  { id: "train", label: "Train", color: "#10b981", icon: "🚄" },
  { id: "ticket", label: "Ticket", color: "#f97316", icon: "🎟" },
];

const CURRENCIES = ["USD", "CNY", "EUR", "KRW", "VND"];

const EMPTY_FORM = {
  type: "flight",
  name: "",
  date: "",
  price: "",
  currency: "USD",
  platform: "",
  reference: "",
  notes: "",
  travelers: "both",
  paid_by: "peter",
};

function fmt(price, currency) {
  if (!price) return "—";
  return `${parseFloat(price).toFixed(2)} ${currency || "USD"}`;
}

function peterShare(b) {
  if (!b.price) return 0;
  const p = parseFloat(b.price);
  if (b.travelers === "peter") return p;
  if (b.travelers === "friend") return 0;
  return p / 2;
}

function friendShare(b) {
  if (!b.price) return 0;
  const p = parseFloat(b.price);
  if (b.travelers === "friend") return p;
  if (b.travelers === "peter") return 0;
  return p / 2;
}

export default function App() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeTab, setActiveTab] = useState("bookings"); // bookings | summary

  useEffect(() => { fetchBookings(); }, []);

  async function fetchBookings() {
    setLoading(true);
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .order("date", { ascending: true });
    setBookings(data || []);
    setLoading(false);
  }

  async function handleSubmit() {
    if (!form.name) return;
    setSaving(true);
    const payload = {
      ...form,
      price: form.price ? parseFloat(form.price) : null,
      date: form.date || null,
      paid_by: form.paid_by || null,
    };
    if (editId) {
      await supabase.from("bookings").update(payload).eq("id", editId);
    } else {
      await supabase.from("bookings").insert(payload);
    }
    await fetchBookings();
    setForm(EMPTY_FORM);
    setShowForm(false);
    setEditId(null);
    setSaving(false);
  }

  async function handleDelete(id) {
    await supabase.from("bookings").delete().eq("id", id);
    setDeleteConfirm(null);
    await fetchBookings();
  }

  function handleEdit(b) {
    setForm({
      type: b.type,
      name: b.name,
      date: b.date || "",
      price: b.price != null ? String(b.price) : "",
      currency: b.currency || "USD",
      platform: b.platform || "",
      reference: b.reference || "",
      notes: b.notes || "",
      travelers: b.travelers || "both",
      paid_by: b.paid_by || "peter",
    });
    setEditId(b.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancel() {
    setForm(EMPTY_FORM);
    setShowForm(false);
    setEditId(null);
  }

  const filtered = filterType === "all" ? bookings : bookings.filter(b => b.type === filterType);

  // Summary calcs (USD only for simplicity)
  const usdBookings = bookings.filter(b => b.currency === "USD" && b.price);
  const totalUSD = usdBookings.reduce((s, b) => s + parseFloat(b.price), 0);
  const peterTotal = usdBookings.reduce((s, b) => s + peterShare(b), 0);
  const friendTotal = usdBookings.reduce((s, b) => s + friendShare(b), 0);

  // Who paid what
  const peterPaid = usdBookings.filter(b => b.paid_by === "peter").reduce((s, b) => s + parseFloat(b.price), 0);
  const friendPaid = usdBookings.filter(b => b.paid_by === "friend").reduce((s, b) => s + parseFloat(b.price), 0);
  const peterOwes = peterTotal - peterPaid;   // negative = friend owes Peter
  const friendOwes = friendTotal - friendPaid;

  return (
    <>
      <Head>
        <title>China Trip 2026 — Bookings</title>
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Code+Pro:wght@400;500&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0f1117; color: #e2e8f0; font-family: 'Georgia', serif; }
        input, select, textarea { outline: none; }
        input::placeholder, textarea::placeholder { color: #374151; }
        .card:hover .card-actions { opacity: 1 !important; }
        .btn { cursor: pointer; transition: opacity 0.15s; border: none; }
        .btn:hover { opacity: 0.8; }
        select option { background: #1a1f2e; }
        .tab { cursor: pointer; transition: all 0.15s; }
      `}</style>

      <div style={{ minHeight: "100vh", padding: "32px 20px 80px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#64748b", fontFamily: "'Source Code Pro', monospace", marginBottom: 8, textTransform: "uppercase" }}>
              China Trip · Jun 8–27, 2026
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
                Bookings
              </h1>
              {!showForm && (
                <button className="btn" onClick={() => setShowForm(true)} style={{
                  background: "#0ea5e9", color: "#fff", borderRadius: 6,
                  padding: "8px 16px", fontSize: 12, fontFamily: "'Source Code Pro', monospace",
                  letterSpacing: "0.05em", fontWeight: 500,
                }}>+ Add</button>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, marginTop: 20, borderBottom: "1px solid #1e2533" }}>
              {["bookings", "summary"].map(tab => (
                <div key={tab} className="tab" onClick={() => setActiveTab(tab)} style={{
                  padding: "8px 16px", fontSize: 12, fontFamily: "'Source Code Pro', monospace",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  color: activeTab === tab ? "#0ea5e9" : "#4b5563",
                  borderBottom: activeTab === tab ? "2px solid #0ea5e9" : "2px solid transparent",
                  marginBottom: -1,
                }}>
                  {tab}
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          {showForm && (
            <div style={{ background: "#151820", borderRadius: 10, padding: 20, marginBottom: 24, border: "1px solid #1e2533" }}>
              <div style={{ fontSize: 12, color: "#64748b", fontFamily: "'Source Code Pro', monospace", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {editId ? "Edit booking" : "New booking"}
              </div>

              {/* Type */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {TYPES.map(t => (
                  <button key={t.id} className="btn" onClick={() => setForm(f => ({ ...f, type: t.id }))} style={{
                    padding: "6px 12px", borderRadius: 5,
                    border: `1.5px solid ${form.type === t.id ? t.color : "#1e2533"}`,
                    background: form.type === t.id ? `${t.color}20` : "transparent",
                    color: form.type === t.id ? t.color : "#4b5563",
                    fontSize: 12, fontFamily: "'Source Code Pro', monospace",
                  }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <input placeholder="Name / description *" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    style={inp} />
                </div>
                <input type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  style={inp} />
                <div style={{ display: "flex", gap: 6 }}>
                  <input placeholder="Price" value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    style={{ ...inp, flex: 1 }} />
                  <select value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    style={{ ...inp, width: 72 }}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <input placeholder="Platform (e.g. Booking.com)" value={form.platform}
                  onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                  style={inp} />
                <input placeholder="Reference / confirmation #" value={form.reference}
                  onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                  style={inp} />

                {/* Travelers */}
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>Travelers</span>
                  {["peter", "friend", "both"].map(v => (
                    <button key={v} className="btn" onClick={() => setForm(f => ({ ...f, travelers: v }))} style={{
                      padding: "5px 12px", borderRadius: 5, fontSize: 11,
                      fontFamily: "'Source Code Pro', monospace",
                      border: `1.5px solid ${form.travelers === v ? "#e2e8f0" : "#1e2533"}`,
                      background: form.travelers === v ? "#1e2533" : "transparent",
                      color: form.travelers === v ? "#e2e8f0" : "#4b5563",
                    }}>{v}</button>
                  ))}
                  <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 8 }}>Paid by</span>
                  {["peter", "friend"].map(v => (
                    <button key={v} className="btn" onClick={() => setForm(f => ({ ...f, paid_by: v }))} style={{
                      padding: "5px 12px", borderRadius: 5, fontSize: 11,
                      fontFamily: "'Source Code Pro', monospace",
                      border: `1.5px solid ${form.paid_by === v ? "#10b981" : "#1e2533"}`,
                      background: form.paid_by === v ? "#10b98120" : "transparent",
                      color: form.paid_by === v ? "#10b981" : "#4b5563",
                    }}>{v}</button>
                  ))}
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <textarea placeholder="Notes" value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn" onClick={handleCancel} style={{ ...btnStyle, background: "transparent", color: "#6b7280", border: "1px solid #1e2533" }}>Cancel</button>
                <button className="btn" onClick={handleSubmit} disabled={saving || !form.name}
                  style={{ ...btnStyle, background: "#0ea5e9", color: "#fff", opacity: (!form.name || saving) ? 0.5 : 1 }}>
                  {saving ? "Saving..." : editId ? "Save changes" : "Add booking"}
                </button>
              </div>
            </div>
          )}

          {/* BOOKINGS TAB */}
          {activeTab === "bookings" && (
            <>
              {/* Filters */}
              {bookings.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
                  {["all", ...TYPES.map(t => t.id)].map(f => {
                    const t = TYPES.find(t => t.id === f);
                    const active = filterType === f;
                    const count = f === "all" ? bookings.length : bookings.filter(b => b.type === f).length;
                    return (
                      <button key={f} className="btn" onClick={() => setFilterType(f)} style={{
                        padding: "5px 12px", borderRadius: 5,
                        border: `1px solid ${active ? (t?.color || "#e2e8f0") : "#1e2533"}`,
                        background: active ? `${t?.color || "#e2e8f0"}15` : "transparent",
                        color: active ? (t?.color || "#e2e8f0") : "#4b5563",
                        fontSize: 11, fontFamily: "'Source Code Pro', monospace",
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        {f === "all" ? "All" : `${t.icon} ${t.label}`}
                        <span style={{ marginLeft: 5, opacity: 0.5 }}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {loading ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#1e2533", fontFamily: "'Source Code Pro', monospace", fontSize: 12 }}>LOADING...</div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#1e2533", fontFamily: "'Source Code Pro', monospace", fontSize: 12, letterSpacing: "0.1em" }}>
                  {bookings.length === 0 ? "NO BOOKINGS YET" : "NOTHING IN THIS CATEGORY"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filtered.map(b => {
                    const t = TYPES.find(t => t.id === b.type) || TYPES[0];
                    return (
                      <div key={b.id} className="card" style={{
                        background: "#12151e", borderRadius: 8, padding: "14px 16px",
                        borderLeft: `3px solid ${t.color}`, position: "relative",
                      }}>
                        <div className="card-actions" style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8, opacity: 0, transition: "opacity 0.15s" }}>
                          <button className="btn" onClick={() => handleEdit(b)} style={{ background: "transparent", color: "#64748b", fontSize: 14, padding: "2px 4px", fontFamily: "monospace" }}>✎</button>
                          {deleteConfirm === b.id ? (
                            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <button className="btn" onClick={() => handleDelete(b.id)} style={{ background: "transparent", color: "#ef4444", fontSize: 11, padding: "2px 4px", fontFamily: "'Source Code Pro', monospace" }}>delete?</button>
                              <button className="btn" onClick={() => setDeleteConfirm(null)} style={{ background: "transparent", color: "#64748b", fontSize: 11, padding: "2px 4px", fontFamily: "'Source Code Pro', monospace" }}>cancel</button>
                            </span>
                          ) : (
                            <button className="btn" onClick={() => setDeleteConfirm(b.id)} style={{ background: "transparent", color: "#374151", fontSize: 14, padding: "2px 4px", fontFamily: "monospace" }}>✕</button>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap", paddingRight: 60 }}>
                          <span style={{
                            fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: t.color,
                            background: `${t.color}18`, padding: "2px 7px", borderRadius: 4,
                            letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
                          }}>{t.icon} {t.label}</span>
                          <span style={{ fontSize: 14.5, color: "#e2e8f0", fontFamily: "'Georgia', serif", lineHeight: 1.4 }}>{b.name}</span>
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginTop: 10 }}>
                          {b.date && <Meta label="date" value={b.date} />}
                          {b.price && <Meta label="price" value={fmt(b.price, b.currency)} highlight />}
                          {b.platform && <Meta label="via" value={b.platform} />}
                          {b.reference && <Meta label="ref" value={b.reference} mono />}
                          <Meta label="travelers" value={b.travelers || "both"} />
                          {b.paid_by && <Meta label="paid by" value={b.paid_by} />}
                        </div>
                        {b.notes && (
                          <div style={{ marginTop: 8, fontSize: 12.5, color: "#4b5563", fontStyle: "italic", lineHeight: 1.5 }}>
                            {b.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* SUMMARY TAB */}
          {activeTab === "summary" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 11, color: "#374151", fontFamily: "'Source Code Pro', monospace", marginBottom: 4 }}>
                USD ITEMS ONLY — OTHER CURRENCIES EXCLUDED FROM SPLIT CALC
              </div>

              {/* Total */}
              <SummaryCard label="Total spend" value={`$${totalUSD.toFixed(2)}`} color="#e2e8f0" sub={`${usdBookings.length} items`} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <SummaryCard label="Peter's share" value={`$${peterTotal.toFixed(2)}`} color="#0ea5e9" sub={`Paid $${peterPaid.toFixed(2)}`} />
                <SummaryCard label="Friend's share" value={`$${friendTotal.toFixed(2)}`} color="#8b5cf6" sub={`Paid $${friendPaid.toFixed(2)}`} />
              </div>

              {/* Settlement */}
              <div style={{ background: "#151820", borderRadius: 8, padding: 20, border: "1px solid #1e2533" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Settlement</div>
                {Math.abs(peterOwes) < 0.01 ? (
                  <div style={{ color: "#10b981", fontFamily: "'Source Code Pro', monospace", fontSize: 13 }}>All square ✓</div>
                ) : peterOwes > 0 ? (
                  <div style={{ fontSize: 14, color: "#e2e8f0" }}>
                    Peter owes friend <span style={{ color: "#f97316", fontFamily: "'Source Code Pro', monospace" }}>${peterOwes.toFixed(2)}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 14, color: "#e2e8f0" }}>
                    Friend owes Peter <span style={{ color: "#10b981", fontFamily: "'Source Code Pro', monospace" }}>${Math.abs(peterOwes).toFixed(2)}</span>
  
