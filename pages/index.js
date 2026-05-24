import { useState, useEffect } from "react";
import Head from "next/head";

const TYPES = [
  { id: "flight", label: "Flight", color: "#0ea5e9", icon: "✈" },
  { id: "hotel", label: "Hotel", color: "#8b5cf6", icon: "🏨" },
  { id: "train", label: "Train", color: "#10b981", icon: "🚄" },
  { id: "ticket", label: "Ticket", color: "#f97316", icon: "🎟" },
];

const CURRENCIES = ["USD", "CNY", "EUR", "KRW", "VND", "DKK"];
const BUILD = "2026-05-23";

const EMPTY_FORM = {
  type: "flight", name: "", date: "", price: "", currency: "USD",
  platform: "", reference: "", notes: "", travelers: "both", paid_by: "",
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

export default function App() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [filterSettled, setFilterSettled] = useState("all");
  const [filterTravelers, setFilterTravelers] = useState("all");
  const [filterPaidBy, setFilterPaidBy] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeTab, setActiveTab] = useState("bookings");
  const [writeToken, setWriteToken] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockInput, setUnlockInput] = useState("");
  const [toast, setToast] = useState(null); // { msg, ok }

  useEffect(() => {
    setFilterType(localStorage.getItem("ft") || "all");
    setFilterSettled(localStorage.getItem("fs") || "all");
    setFilterTravelers(localStorage.getItem("ftr") || "all");
    setFilterPaidBy(localStorage.getItem("fp") || "all");
    setWriteToken(localStorage.getItem("wt") || "");
  }, []);
  useEffect(() => { localStorage.setItem("ft",  filterType);      }, [filterType]);
  useEffect(() => { localStorage.setItem("fs",  filterSettled);   }, [filterSettled]);
  useEffect(() => { localStorage.setItem("ftr", filterTravelers); }, [filterTravelers]);
  useEffect(() => { localStorage.setItem("fp",  filterPaidBy);    }, [filterPaidBy]);
  useEffect(() => { fetchBookings(); }, []);

  async function fetchBookings() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings");
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status}: ${text}`);
      const data = JSON.parse(text);
      setBookings(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("fetchBookings failed:", e);
      setError(e.message);
      setBookings([]);
    } finally {
      setLoading(false);
    }
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
      const r = await fetch(`/api/bookings/${editId}`, { method: "PUT", headers: authedHeaders, body: JSON.stringify(payload) });
      if (r.status === 401) { showToast("Wrong password", false); setSaving(false); return; }
    } else {
      const r = await fetch("/api/bookings", { method: "POST", headers: authedHeaders, body: JSON.stringify(payload) });
      if (r.status === 401) { showToast("Wrong password", false); setSaving(false); return; }
    }
    await fetchBookings();
    showToast(editId ? "Booking updated" : "Booking added");
    setForm(EMPTY_FORM); setShowForm(false); setEditId(null); setSaving(false);
  }

  async function handleDelete(id) {
    await fetch(`/api/bookings/${id}`, { method: "DELETE", headers: authedHeaders });
    setDeleteConfirm(null); await fetchBookings(); showToast("Booking deleted", true);
  }

  function handleEdit(b) {
    setForm({ type: b.type, name: b.name, date: b.date || "", price: b.price != null ? String(b.price) : "", currency: b.currency || "USD", platform: b.platform || "", reference: b.reference || "", notes: b.notes || "", travelers: b.travelers || "both", paid_by: b.paid_by || "" });
    setEditId(b.id); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSettle(id) {
    await fetch(`/api/bookings/${id}`, { method: "PATCH", headers: authedHeaders, body: JSON.stringify({ settled: true }) });
    await fetchBookings(); showToast("Marked as settled");
  }

  function handleCancel() { setForm(EMPTY_FORM); setShowForm(false); setEditId(null); }

  const authedHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${writeToken}` };
  const canWrite = !!writeToken;

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  }

  function handleUnlock() {
    const token = unlockInput.trim();
    setWriteToken(token);
    localStorage.setItem("wt", token);
    setShowUnlock(false);
    setUnlockInput("");
  }

  function handleLock() {
    setWriteToken("");
    localStorage.removeItem("wt");
    setShowForm(false);
  }

  const filtered = bookings
    .filter(b => filterType === "all" || b.type === filterType)
    .filter(b => filterSettled === "all" || (filterSettled === "settled" ? b.settled : !b.settled))
    .filter(b => filterTravelers === "all" || b.travelers === filterTravelers)
    .filter(b => filterPaidBy === "all" || (filterPaidBy === "pending" ? !b.paid_by : b.paid_by === filterPaidBy));

  const activeCurrencies = [...new Set(bookings.filter(b => b.price && b.currency).map(b => b.currency))].sort();

  function calcForCurrency(currency) {
    const bks = bookings.filter(b => b.currency === currency && b.price);
    const paid = bks.filter(b => b.paid_by);
    const pending = bks.filter(b => !b.paid_by);
    const total = bks.reduce((s, b) => s + parseFloat(b.price), 0);
    const pendingTotal = pending.reduce((s, b) => s + parseFloat(b.price), 0);
    const pOwes = paid.filter(b => !b.settled).reduce((s, b) => {
      const fronted = b.paid_by === "peter" ? parseFloat(b.price) : 0;
      return s + peterShare(b) - fronted;
    }, 0);
    const settledCount = paid.filter(b => b.settled).length;
    return { total, pendingTotal, pOwes, count: bks.length, pendingCount: pending.length, settledCount };
  }

  return (
    <>
      <Head>
        <title>China Trip 2026 – Bookings</title>
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
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>

      <div style={{ minHeight: "100vh", padding: "32px 20px 80px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#64748b", fontFamily: "'Source Code Pro', monospace", marginBottom: 8, textTransform: "uppercase" }}>
              China Trip · Jun 8–27, 2026
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.02em" }}>Bookings</h1>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {canWrite && !showForm && (
                  <button className="btn" onClick={() => setShowForm(true)} style={{ background: "#0ea5e9", color: "#fff", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontFamily: "'Source Code Pro', monospace", letterSpacing: "0.05em", fontWeight: 500 }}>+ Add</button>
                )}
                {showUnlock ? (
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="password" placeholder="write password" value={unlockInput} onChange={e => setUnlockInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleUnlock()} autoFocus style={{ ...inp, width: 140, padding: "6px 10px", fontSize: 12 }} />
                    <button className="btn" onClick={handleUnlock} style={{ background: "#0ea5e9", color: "#fff", borderRadius: 5, padding: "6px 12px", fontSize: 11, fontFamily: "'Source Code Pro', monospace" }}>OK</button>
                    <button className="btn" onClick={() => setShowUnlock(false)} style={{ background: "transparent", color: "#4b5563", borderRadius: 5, padding: "6px 10px", fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: "1px solid #1e2533" }}>✕</button>
                  </span>
                ) : canWrite ? (
                  <button className="btn" onClick={handleLock} title="Lock (sign out)" style={{ background: "transparent", color: "#10b981", fontSize: 14, padding: "4px 8px", border: "1px solid #10b98140", borderRadius: 5 }}>🔓</button>
                ) : (
                  <button className="btn" onClick={() => setShowUnlock(true)} title="Unlock write access" style={{ background: "transparent", color: "#374151", fontSize: 14, padding: "4px 8px", border: "1px solid #1e2533", borderRadius: 5 }}>🔒</button>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 0, marginTop: 20, borderBottom: "1px solid #1e2533" }}>
              {["bookings", "summary"].map(tab => (
                <div key={tab} className="tab" onClick={() => setActiveTab(tab)} style={{ padding: "8px 16px", fontSize: 12, fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: activeTab === tab ? "#0ea5e9" : "#4b5563", borderBottom: activeTab === tab ? "2px solid #0ea5e9" : "2px solid transparent", marginBottom: -1 }}>
                  {tab}
                </div>
              ))}
            </div>
          </div>

          {showForm && (
            <div style={{ background: "#151820", borderRadius: 10, padding: 20, marginBottom: 24, border: "1px solid #1e2533" }}>
              <div style={{ fontSize: 12, color: "#64748b", fontFamily: "'Source Code Pro', monospace", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>{editId ? "Edit booking" : "New booking"}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {TYPES.map(t => (
                  <button key={t.id} className="btn" onClick={() => setForm(f => ({ ...f, type: t.id }))} style={{ padding: "6px 12px", borderRadius: 5, border: `1.5px solid ${form.type === t.id ? t.color : "#1e2533"}`, background: form.type === t.id ? `${t.color}20` : "transparent", color: form.type === t.id ? t.color : "#4b5563", fontSize: 12, fontFamily: "'Source Code Pro', monospace" }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <input placeholder="Name / description *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} />
                </div>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
                <div style={{ display: "flex", gap: 6 }}>
                  <input placeholder="Price" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} style={{ ...inp, flex: 1 }} />
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} style={{ ...inp, width: 72 }}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <input placeholder="Platform (e.g. Booking.com)" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} style={inp} />
                <input placeholder="Reference / confirmation #" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} style={inp} />
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>Travelers</span>
                  {["peter", "friend", "both"].map(v => (
                    <button key={v} className="btn" onClick={() => setForm(f => ({ ...f, travelers: v }))} style={{ padding: "5px 12px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${form.travelers === v ? "#e2e8f0" : "#1e2533"}`, background: form.travelers === v ? "#1e2533" : "transparent", color: form.travelers === v ? "#e2e8f0" : "#4b5563" }}>{v}</button>
                  ))}
                  <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 8 }}>Paid by</span>
                  {[{ v: "peter", label: "peter" }, { v: "friend", label: "friend" }, { v: "", label: "⏳ unpaid" }].map(({ v, label }) => (
                    <button key={label} className="btn" onClick={() => setForm(f => ({ ...f, paid_by: v }))} style={{ padding: "5px 12px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${form.paid_by === v ? (v ? "#10b981" : "#f59e0b") : "#1e2533"}`, background: form.paid_by === v ? (v ? "#10b98120" : "#f59e0b20") : "transparent", color: form.paid_by === v ? (v ? "#10b981" : "#f59e0b") : "#4b5563" }}>{label}</button>
                  ))}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <textarea placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn" onClick={handleCancel} style={{ ...btnStyle, background: "transparent", color: "#6b7280", border: "1px solid #1e2533" }}>Cancel</button>
                <button className="btn" onClick={handleSubmit} disabled={saving || !form.name} style={{ ...btnStyle, background: "#0ea5e9", color: "#fff", opacity: (!form.name || saving) ? 0.5 : 1 }}>
                  {saving ? "Saving..." : editId ? "Save changes" : "Add booking"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontFamily: "'Source Code Pro', monospace", fontSize: 12, color: "#f87171" }}>
              ✗ {error}
            </div>
          )}

          {activeTab === "bookings" && (
            <>
              {bookings.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                  {[
                    { label: "type", active: filterType, setActive: setFilterType, opts: [["all","all"], ...TYPES.map(t => [t.id, `${t.icon} ${t.label}`])], colorFn: v => TYPES.find(t=>t.id===v)?.color || "#e2e8f0" },
                    { label: "for", active: filterTravelers, setActive: setFilterTravelers, opts: [["all","all"],["both","both"],["peter","peter"],["friend","friend"]], colorFn: () => "#e2e8f0" },
                    { label: "paid", active: filterPaidBy, setActive: setFilterPaidBy, opts: [["all","all"],["peter","peter"],["friend","friend"],["pending","⏳ unpaid"]], colorFn: v => v === "pending" ? "#f59e0b" : "#10b981" },
                    { label: "status", active: filterSettled, setActive: setFilterSettled, opts: [["all","all"],["unsettled","unsettled"],["settled","✓ settled"]], colorFn: v => v === "settled" ? "#10b981" : "#e2e8f0" },
                  ].map(({ label, active, setActive, opts, colorFn }) => (
                    <div key={label} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "#374151", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 52 }}>{label}</span>
                      {opts.map(([v, display]) => {
                        const isActive = active === v;
                        const color = colorFn(v);
                        return (
                          <button key={v} className="btn" onClick={() => setActive(v)} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1px solid ${isActive ? color : "#1e2533"}`, background: isActive ? `${color}18` : "transparent", color: isActive ? color : "#4b5563" }}>{display}</button>
                        );
                      })}
                    </div>
                  ))}
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
                      <div key={b.id} className="card" style={{ background: b.paid_by ? "#12151e" : "#0e1018", borderRadius: 8, padding: "14px 16px", borderLeft: `3px solid ${b.paid_by ? t.color : "#374151"}`, position: "relative", opacity: b.paid_by ? 1 : 0.75 }}>
                        {canWrite && (
                        <div className="card-actions" style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8, opacity: 0, transition: "opacity 0.15s" }}>
                          {b.paid_by && b.travelers === "both" && !b.settled && (
                            <button className="btn" onClick={() => handleSettle(b.id)} style={{ background: "transparent", color: "#10b981", fontSize: 11, padding: "2px 6px", fontFamily: "'Source Code Pro', monospace", border: "1px solid #10b98140", borderRadius: 4 }}>settle ✓</button>
                          )}
                          <button className="btn" onClick={() => handleEdit(b)} style={{ background: "transparent", color: "#64748b", fontSize: 14, padding: "2px 4px", fontFamily: "monospace" }}>✎</button>
                          {deleteConfirm === b.id ? (
                            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <button className="btn" onClick={() => handleDelete(b.id)} style={{ background: "transparent", color: "#ef4444", fontSize: 11, padding: "2px 4px", fontFamily: "'Source Code Pro', monospace" }}>delete?</button>
                              <button className="btn" onClick={() => setDeleteConfirm(null)} style={{ background: "transparent", color: "#64748b", fontSize: 11, padding: "2px 4px", fontFamily: "'Source Code Pro', monospace" }}>cancel</button>
                            </span>
                          ) : (
                            <button className="btn" onClick={() => setDeleteConfirm(b.id)} style={{ background: "transparent", color: "#374151", fontSize: 14, padding: "2px 4px", fontFamily: "monospace" }}>┕</button>
                          )}
                        </div>
                        )}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap", paddingRight: 60 }}>
                          <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: t.color, background: `${t.color}18`, padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{t.icon} {t.label}</span>
                          {!b.paid_by && <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: "#f59e0b", background: "#f59e0b18", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>⏳ pending</span>}
                          {b.settled && <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: "#10b981", background: "#10b98118", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>✓ settled</span>}
                          <span style={{ fontSize: 14.5, color: "#e2e8f0", fontFamily: "'Georgia', serif", lineHeight: 1.4 }}>{b.name}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginTop: 10 }}>
                          {b.date && <Meta label="date" value={b.date} />}
                          {b.price && <Meta label="price" value={fmt(b.price, b.currency)} highlight />}
                          {b.platform && <Meta label="via" value={b.platform} />}
                          {b.reference && <Meta label="ref" value={b.reference} mono />}
                          <Meta label="travelers" value={b.travelers || "both"} />
                          {b.paid_by ? <Meta label="paid by" value={b.paid_by} /> : <Meta label="paid by" value="—" />}
                        </div>
                        {b.notes && <div style={{ marginTop: 8, fontSize: 12.5, color: "#4b5563", fontStyle: "italic", lineHeight: 1.5 }}>{b.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === "summary" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {activeCurrencies.length === 0 && <div style={{ color: "#374151", fontFamily: "'Source Code Pro', monospace", fontSize: 12 }}>No bookings with prices yet.</div>}
              {activeCurrencies.map(currency => {
                const { total, pendingTotal, pOwes, count, pendingCount, settledCount } = calcForCurrency(currency);
                const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "KRW" ? "₩" : "";
                const fmt2 = v => `${sym}${v.toFixed(2)} ${sym ? "" : currency}`.trim();
                return (
                  <div key={currency} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ fontSize: 11, color: "#374151", fontFamily: "'Source Code Pro', monospace", letterSpacing: "0.12em" }}>─── {currency} ───────────────────────</div>
                    <SummaryCard label="Total committed" value={fmt2(total)} color="#e2e8f0" sub={`${count} item${count !== 1 ? "s" : ""}${pendingCount ? ` · ${pendingCount} pending` : ""}${settledCount ? ` · ${settledCount} settled` : ""}`} />
                    {pendingTotal > 0 && <SummaryCard label="Pending payment" value={fmt2(pendingTotal)} color="#f59e0b" sub="not yet paid by anyone" />}
                    <div style={{ background: "#151820", borderRadius: 8, padding: 20, border: "1px solid #1e2533" }}>
                      <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Settlement</div>
                      {Math.abs(pOwes) < 0.01 ? (
                        <div style={{ color: "#10b981", fontFamily: "'Source Code Pro', monospace", fontSize: 13 }}>All square ✓</div>
                      ) : pOwes > 0 ? (
                        <div style={{ fontSize: 14, color: "#e2e8f0" }}>Peter owes friend <span style={{ color: "#f97316", fontFamily: "'Source Code Pro', monospace" }}>{fmt2(pOwes)}</span></div>
                      ) : (
                        <div style={{ fontSize: 14, color: "#e2e8f0" }}>Friend owes Peter <span style={{ color: "#10b981", fontFamily: "'Source Code Pro', monospace" }}>{fmt2(Math.abs(pOwes))}</span></div>
                      )}
                    </div>
                    <div style={{ background: "#151820", borderRadius: 8, padding: 20, border: "1px solid #1e2533" }}>
                      <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>By category</div>
                      {TYPES.map(t => {
                        const catTotal = bookings.filter(b => b.currency === currency && b.price && b.type === t.id).reduce((s, b) => s + parseFloat(b.price), 0);
                        if (catTotal === 0) return null;
                        return (
                          <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <span style={{ fontSize: 12, color: t.color, fontFamily: "'Source Code Pro', monospace" }}>{t.icon} {t.label}</span>
                            <span style={{ fontSize: 13, color: "#94a3b8", fontFamily: "'Source Code Pro', monospace" }}>{fmt2(catTotal)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: 48, color: "#1a1f2e", fontSize: 11, fontFamily: "'Source Code Pro', monospace", letterSpacing: "0.1em" }}>
            PETER + 1 · BEIJING → YUNNAN → ZHANGJIAJIE → INCHEON
            <br /><span style={{ fontSize: 10, opacity: 0.5 }}>updated {BUILD}</span>
          </div>
        </div>
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: toast.ok ? "#10b981" : "#ef4444",
          color: "#fff", borderRadius: 8, padding: "10px 20px",
          fontFamily: "'Source Code Pro', monospace", fontSize: 12,
          letterSpacing: "0.05em", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          zIndex: 9999, whiteSpace: "nowrap", pointerEvents: "none",
          animation: "fadeIn 0.15s ease",
        }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}

function Meta({ label, value, highlight, mono }) {
  return (
    <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ fontSize: 10, color: "#374151", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      <span style={{ fontSize: 12.5, color: highlight ? "#10b981" : "#94a3b8", fontFamily: mono ? "'Source Code Pro', monospace" : "'Georgia', serif" }}>{value}</span>
    </span>
  );
}

function SummaryCard({ label, value, color, sub }) {
  return (
    <div style={{ background: "#151820", borderRadius: 8, padding: "16px 20px", border: "1px solid #1e2533" }}>
      <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontFamily: "'Playfair Display', serif", color, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#374151", fontFamily: "'Source Code Pro', monospace" }}>{sub}</div>}
    </div>
  );
}

const inp = { width: "100%", background: "#0f1117", border: "1px solid #1e2533", borderRadius: 6, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, fontFamily: "'Source Code Pro', monospace" };
const btnStyle = { padding: "8px 16px", borderRadius: 6, fontSize: 12, fontFamily: "'Source Code Pro', monospace", letterSpacing: "0.05em" };
