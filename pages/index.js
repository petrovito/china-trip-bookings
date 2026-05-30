import { useState, useEffect, useRef } from "react";
import Head from "next/head";

const TYPES = [
  { id: "flight",   label: "Flight",   color: "var(--accent)", icon: "✈"  },
  { id: "hotel",    label: "Hotel",    color: "#8b5cf6", icon: "🏨" },
  { id: "train",    label: "Train",    color: "#10b981", icon: "🚄" },
  { id: "ticket",   label: "Ticket",   color: "#f97316", icon: "🎟" },
  { id: "food",     label: "Food",     color: "#e879f9", icon: "🍜" },
  { id: "activity", label: "Activity", color: "#fbbf24", icon: "📍" },
];

const CURRENCIES = ["USD", "CNY", "EUR", "KRW", "VND", "DKK"];
const BUILD = "2026-05-29";

const EMPTY_FORM = {
  type: "flight", name: "", date: "", date_end: "", price: "", currency: "USD",
  platform: "", reference: "", notes: "", travelers: "both", paid_by: "", location: "",
};

// Types excluded from expense tracking
const EXPENSE_TYPES = ["flight", "hotel", "train", "ticket", "food"];

const TODO_CATS = [
  { id: "pack",   label: "Pack",   icon: "🧳" },
  { id: "book",   label: "Book",   icon: "📋" },
  { id: "docs",   label: "Docs",   icon: "🛂" },
  { id: "health", label: "Health", icon: "💊" },
  { id: "tech",   label: "Tech",   icon: "📱" },
  { id: "do",     label: "Do",     icon: "🎯" },
];
const EMPTY_TODO = { title: "", category: "pack", assignee: "both" };
// Booking types that can have a pass/QR attached
const PASS_TYPES = ["flight", "train", "ticket", "hotel", "activity"];

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

// Does a booking span a given date?
function bookingCoversDate(b, dateStr) {
  if (!b.date) return false;
  if (!b.date_end) return b.date === dateStr;
  return b.date <= dateStr && dateStr <= b.date_end;
}

// All days a booking spans
function bookingDays(b) {
  if (!b.date) return [];
  if (!b.date_end || b.date_end <= b.date) return [b.date];
  const days = [];
  let cur = new Date(b.date + "T00:00:00");
  const end = new Date(b.date_end + "T00:00:00");
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function fmtDateShort(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Build location groups from bookings for Trip tab
function buildLocationGroups(bookings) {
  // Collect all dates that appear across all bookings
  const allDates = new Set();
  bookings.forEach(b => {
    bookingDays(b).forEach(d => allDates.add(d));
    if (b.date) allDates.add(b.date);
  });

  // Sort bookings by date
  const sorted = [...bookings].filter(b => b.date).sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  // Build date range for trip
  const tripStart = sorted[0].date;
  const tripEnd = sorted.reduce((max, b) => {
    const end = b.date_end || b.date;
    return end > max ? end : max;
  }, sorted[sorted.length - 1].date);

  // Generate all days
  const days = [];
  let cur = new Date(tripStart + "T00:00:00");
  const end = new Date(tripEnd + "T00:00:00");
  while (cur <= end) {
    days.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }

  // Assign location to each day (from hotel bookings primarily)
  const dayLocation = {};
  // First pass: hotel date spans set the location
  sorted.filter(b => b.type === "hotel" && b.location).forEach(b => {
    bookingDays(b).forEach(d => { if (!dayLocation[d]) dayLocation[d] = b.location; });
  });
  // Second pass: any booking with location fills gaps
  sorted.filter(b => b.location).forEach(b => {
    bookingDays(b).forEach(d => { if (!dayLocation[d]) dayLocation[d] = b.location; });
    if (b.date && !dayLocation[b.date]) dayLocation[b.date] = b.location;
  });
  // Third pass: fill remaining days by proximity (carry forward)
  let lastLoc = null;
  days.forEach(d => {
    if (dayLocation[d]) { lastLoc = dayLocation[d]; }
    else if (lastLoc) { dayLocation[d] = lastLoc; }
  });

  // Group consecutive days by location
  const groups = [];
  let curGroup = null;
  days.forEach(d => {
    const loc = dayLocation[d] || "Unknown";
    if (!curGroup || curGroup.location !== loc) {
      curGroup = { location: loc, startDate: d, endDate: d, days: [] };
      groups.push(curGroup);
    }
    curGroup.endDate = d;
    curGroup.days.push(d);
  });

  // Attach bookings to each day
  groups.forEach(g => {
    g.days = g.days.map(d => ({
      date: d,
      bookings: sorted.filter(b => {
        // Hotels: show only on first day of span within this group
        if ((b.type === "hotel" || b.type === "activity") && b.date_end) {
          return b.date === d && g.days.includes(d);
        }
        return b.date === d;
      }),
      spanners: sorted.filter(b => {
        // Hotels/activities that span multiple days: show as banner on first day only
        if ((b.type === "hotel") && b.date_end && b.date_end > b.date) {
          return b.date === d;
        }
        return false;
      }),
    }));
  });

  return groups;
}

export default function App() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTypes, setFilterTypes] = useState([]);
  const [filterSettled, setFilterSettled] = useState("all");
  const [filterTravelers, setFilterTravelers] = useState("all");
  const [filterPaidBy, setFilterPaidBy] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeTab, setActiveTab] = useState("trip");
  const [writeToken, setWriteToken] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockInput, setUnlockInput] = useState("");
  const [toast, setToast] = useState(null);
  const [showFilters, setShowFilters] = useState(true);
  const [rates, setRates] = useState(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [expandedCards, setExpandedCards] = useState({});
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [locationImages, setLocationImages] = useState({});
  const [showSummary, setShowSummary] = useState(false);
  const [expandedFoodDays, setExpandedFoodDays] = useState({});
  // Todos
  const [todos, setTodos] = useState([]);
  const [todoForm, setTodoForm] = useState(EMPTY_TODO);
  const [showTodoForm, setShowTodoForm] = useState(false);
  const [todoFilterCat, setTodoFilterCat] = useState("all");
  const [todoFilterAssignee, setTodoFilterAssignee] = useState("all");
  // Pass viewer
  const [passViewer, setPassViewer] = useState(null); // { id, name, dataUrl }
  const [savedPasses, setSavedPasses] = useState({});  // { [bookingId]: true }
  const todayRef = useRef(null);
  const passFileRef = useRef(null);
  const passUploadForRef = useRef(null);

  useEffect(() => {
    try { setFilterTypes(JSON.parse(localStorage.getItem("ft") || "[]")); } catch { setFilterTypes([]); }
    setFilterSettled(localStorage.getItem("fs") || "all");
    setFilterTravelers(localStorage.getItem("ftr") || "all");
    setFilterPaidBy(localStorage.getItem("fp") || "all");
    setWriteToken(localStorage.getItem("wt") || "");
    const sf = localStorage.getItem("sf"); if (sf !== null) setShowFilters(sf !== "0");
    const tab = localStorage.getItem("tab"); if (tab && ["trip","todos","expenses"].includes(tab)) setActiveTab(tab);
    try { const cg = localStorage.getItem("cg"); if (cg) setCollapsedGroups(JSON.parse(cg)); } catch {}
    setTodoFilterCat(localStorage.getItem("tfc") || "all");
    setTodoFilterAssignee(localStorage.getItem("tfa") || "all");
    // Scan localStorage for saved passes
    const passes = {};
    Object.keys(localStorage).forEach(k => { if (k.startsWith("pass_")) passes[k.replace("pass_", "")] = true; });
    setSavedPasses(passes);
  }, []);
  useEffect(() => { localStorage.setItem("ft", JSON.stringify(filterTypes)); }, [filterTypes]);
  useEffect(() => { localStorage.setItem("fs",  filterSettled);   }, [filterSettled]);
  useEffect(() => { localStorage.setItem("ftr", filterTravelers); }, [filterTravelers]);
  useEffect(() => { localStorage.setItem("fp",  filterPaidBy);    }, [filterPaidBy]);
  useEffect(() => { localStorage.setItem("sf",  showFilters ? "1" : "0"); }, [showFilters]);
  useEffect(() => { localStorage.setItem("tab", activeTab); }, [activeTab]);
  useEffect(() => { localStorage.setItem("cg",  JSON.stringify(collapsedGroups)); }, [collapsedGroups]);
  useEffect(() => { localStorage.setItem("tfc", todoFilterCat); }, [todoFilterCat]);
  useEffect(() => { localStorage.setItem("tfa", todoFilterAssignee); }, [todoFilterAssignee]);
  useEffect(() => { fetchBookings(); }, []);
  useEffect(() => { fetchTodos(); }, []);

  // Scroll to today when switching to trip tab
  useEffect(() => {
    if (activeTab === "trip" && todayRef.current) {
      setTimeout(() => todayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [activeTab]);

  async function fetchBookings() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/bookings");
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status}: ${text}`);
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : [];
      setBookings(list);
      localStorage.setItem("bookings_cache", JSON.stringify(list));
    } catch (e) {
      const cached = localStorage.getItem("bookings_cache");
      if (cached) { try { setBookings(JSON.parse(cached)); } catch {} }
      else { setError(e.message); setBookings([]); }
    } finally { setLoading(false); }
  }

  async function fetchTodos() {
    try {
      const res = await fetch("/api/todos");
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setTodos(list);
      localStorage.setItem("todos_cache", JSON.stringify(list));
    } catch {
      const cached = localStorage.getItem("todos_cache");
      if (cached) try { setTodos(JSON.parse(cached)); } catch {}
    }
  }

  async function handleAddTodo() {
    if (!todoForm.title.trim()) return;
    const res = await fetch("/api/todos", { method: "POST", headers: authedHeaders, body: JSON.stringify(todoForm) });
    if (res.status === 401) { showToast("Wrong password", false); return; }
    const todo = await res.json();
    setTodos(prev => { const u = [...prev, todo]; localStorage.setItem("todos_cache", JSON.stringify(u)); return u; });
    setTodoForm(EMPTY_TODO); setShowTodoForm(false); showToast("Todo added");
  }

  async function handleToggleTodo(todo) {
    const updated = { ...todo, done: !todo.done };
    setTodos(prev => { const u = prev.map(t => t.id === todo.id ? updated : t); localStorage.setItem("todos_cache", JSON.stringify(u)); return u; });
    const res = await fetch(`/api/todos/${todo.id}`, { method: "PATCH", headers: authedHeaders, body: JSON.stringify({ done: !todo.done }) });
    if (res.status === 401) {
      setTodos(prev => { const u = prev.map(t => t.id === todo.id ? todo : t); localStorage.setItem("todos_cache", JSON.stringify(u)); return u; });
      showToast("Wrong password", false);
    }
  }

  async function handleDeleteTodo(id) {
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE", headers: authedHeaders });
    if (res.status === 401) { showToast("Wrong password", false); return; }
    setTodos(prev => { const u = prev.filter(t => t.id !== id); localStorage.setItem("todos_cache", JSON.stringify(u)); return u; });
    showToast("Todo deleted");
  }

  function handlePassOpen(b) {
    const saved = localStorage.getItem(`pass_${b.id}`);
    if (saved) {
      setPassViewer({ id: b.id, name: b.name, dataUrl: saved });
    } else {
      passUploadForRef.current = b;
      passFileRef.current?.click();
    }
  }

  function handlePassFile(e) {
    const file = e.target.files?.[0];
    if (!file || !passUploadForRef.current) return;
    const b = passUploadForRef.current;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      localStorage.setItem(`pass_${b.id}`, dataUrl);
      setSavedPasses(prev => ({ ...prev, [b.id]: true }));
      setPassViewer({ id: b.id, name: b.name, dataUrl });
      showToast("Pass saved ✓");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handlePassRemove(bookingId) {
    localStorage.removeItem(`pass_${bookingId}`);
    setSavedPasses(prev => { const n = { ...prev }; delete n[bookingId]; return n; });
    setPassViewer(null);
    showToast("Pass removed");
  }

  async function handleSubmit() {
    if (!form.name) return;
    setSaving(true);
    const payload = {
      ...form,
      price: form.price ? parseFloat(form.price) : null,
      date: form.date || null,
      date_end: form.date_end || null,
      location: form.location || null,
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
    setForm({
      type: b.type, name: b.name, date: b.date || "", date_end: b.date_end || "",
      price: b.price != null ? String(b.price) : "", currency: b.currency || "USD",
      platform: b.platform || "", reference: b.reference || "", notes: b.notes || "",
      travelers: b.travelers || "both", paid_by: b.paid_by || "", location: b.location || "",
    });
    setEditId(b.id); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSettle(id, currentlySettled) {
    await fetch(`/api/bookings/${id}`, { method: "PATCH", headers: authedHeaders, body: JSON.stringify({ settled: !currentlySettled }) });
    await fetchBookings(); showToast(currentlySettled ? "Marked as unsettled" : "Marked as settled");
  }

  function handleCancel() { setForm(EMPTY_FORM); setShowForm(false); setEditId(null); }

  const authedHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${writeToken}` };
  const canWrite = !!writeToken;

  function handleUnlock() {
    const token = unlockInput.trim();
    setWriteToken(token); localStorage.setItem("wt", token);
    setShowUnlock(false); setUnlockInput("");
  }

  function handleLock() {
    setWriteToken(""); localStorage.removeItem("wt"); setShowForm(false);
  }

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  }

  async function fetchRates() {
    setRatesLoading(true);
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/DKK");
      const data = await res.json();
      if (data.result === "success") setRates(data);
    } catch {} finally { setRatesLoading(false); }
  }

  useEffect(() => { if (showSummary) fetchRates(); }, [showSummary]);

  // Fetch Unsplash vibe image for each location when trip tab opens
  useEffect(() => {
    if (activeTab !== "trip") return;
    const locations = [...new Set(bookings.map(b => b.location).filter(Boolean))];
    locations.forEach(loc => {
      if (locationImages[loc]) return; // already fetched
      const query = encodeURIComponent(`${loc} China landscape travel`);
      fetch(`/api/unsplash?location=${encodeURIComponent(loc)}`)
        .then(r => r.json())
        .then(data => {
          if (data?.url) setLocationImages(prev => ({ ...prev, [loc]: data.url }));
        })
        .catch(() => {});
    });
  }, [activeTab, bookings]);

  const filtered = bookings
    .filter(b => filterTypes.length === 0 || filterTypes.includes(b.type))
    .filter(b => filterSettled === "all" || (filterSettled === "settled" ? b.settled : !b.settled))
    .filter(b => filterTravelers === "all" || b.travelers === filterTravelers)
    .filter(b => filterPaidBy === "all" || (filterPaidBy === "pending" ? !b.paid_by : b.paid_by === filterPaidBy));

  const activeCurrencies = [...new Set(
    bookings.filter(b => b.price && b.currency && EXPENSE_TYPES.includes(b.type)).map(b => b.currency)
  )].sort();

  function calcForCurrency(currency) {
    const bks = bookings.filter(b => b.currency === currency && b.price && EXPENSE_TYPES.includes(b.type));
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

  // Trip tab helpers
  const today = toDateStr(new Date());
  const locationGroups = buildLocationGroups(bookings);

  function toggleCard(id) {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleGroup(loc) {
    setCollapsedGroups(prev => ({ ...prev, [loc]: !prev[loc] }));
  }

  function platformLink(b) {
    if (!b.platform && !b.reference) return null;
    const pl = (b.platform || "").toLowerCase();
    if (pl.includes("booking.com")) return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(b.name)}`;
    if (pl.includes("trip.com") || pl.includes("ctrip")) return `https://www.trip.com/`;
    if (pl.includes("klook")) return `https://www.klook.com/`;
    if (pl.includes("airbnb")) return `https://www.airbnb.com/`;
    return null;
  }

  function mapsLink(b) {
    const query = b.location ? `${b.name}, ${b.location}, China` : `${b.name}, China`;
    return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
  }

  const showDateEnd = form.type === "hotel" || form.type === "activity" || form.type === "ticket";

  return (
    <>
      <Head>
        <title>China Trip 2026 — Bookings</title>
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Code+Pro:wght@400;500&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        :root {
          color-scheme: light dark;
          --bg: #f8fafc; --surface: #ffffff; --surface2: #f1f5f9; --surface-hover: #e8edf2;
          --border: #e2e8f0; --border2: #d1d5db; --border-error: #fca5a5;
          --text: #0f172a; --text-medium: #334155; --text-muted: #64748b;
          --text-faint: #94a3b8; --text-tiny: #b0bcc8; --text-error: #dc2626;
          --accent: #0284c7;
          --hero-overlay: linear-gradient(to right, rgba(248,250,252,0.9) 35%, rgba(248,250,252,0.15) 100%);
          --hero-img-opacity: 0.55;
          --hotel-bg: #f5f3ff; --hotel-border: rgba(139,92,246,0.2); --hotel-text: #6d28d9;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --bg: #0f1117; --surface: #12151e; --surface2: #151820; --surface-hover: #161b27;
            --border: #1e2533; --border2: #252d3d; --border-error: #7f1d1d;
            --text: #e2e8f0; --text-medium: #cbd5e1; --text-muted: #94a3b8;
            --text-faint: #4b5563; --text-tiny: #374151; --text-error: #f87171;
            --accent: #0ea5e9;
            --hero-overlay: linear-gradient(to right, rgba(15,17,23,0.84) 35%, rgba(15,17,23,0.1) 100%);
            --hero-img-opacity: 0.5;
            --hotel-bg: #12101f; --hotel-border: rgba(139,92,246,0.3); --hotel-text: #c4b5fd;
          }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text); font-family: 'Georgia', serif; }
        input, select, textarea { outline: none; color: var(--text); }
        input::placeholder, textarea::placeholder { color: var(--text-faint); }
        .card:hover .card-actions { opacity: 1 !important; }
        .btn { cursor: pointer; transition: opacity 0.15s; border: none; }
        .btn:hover { opacity: 0.8; }
        select option { background: var(--surface2); }
        .tab { cursor: pointer; transition: all 0.15s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        .trip-card { cursor: pointer; transition: background 0.15s; }
        .trip-card:hover { background: var(--surface-hover) !important; }
        .hero-img { opacity: var(--hero-img-opacity); filter: saturate(0.8); }
      `}</style>

      <div style={{ minHeight: "100vh", padding: "32px 20px 80px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", marginBottom: 8, textTransform: "uppercase" }}>
              China Trip · Jun 8–27, 2026
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>China Trip</h1>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {canWrite && !showForm && (
                  <button className="btn" onClick={() => setShowForm(true)} style={{ background: "var(--accent)", color: "#fff", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontFamily: "'Source Code Pro', monospace", letterSpacing: "0.05em", fontWeight: 500 }}>+ Add</button>
                )}
                {showUnlock ? (
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="password" placeholder="write password" value={unlockInput}
                      onChange={e => setUnlockInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleUnlock()}
                      autoFocus style={{ ...inp, width: 140, padding: "6px 10px", fontSize: 12 }} />
                    <button className="btn" onClick={handleUnlock} style={{ background: "var(--accent)", color: "#fff", borderRadius: 5, padding: "6px 12px", fontSize: 11, fontFamily: "'Source Code Pro', monospace" }}>OK</button>
                    <button className="btn" onClick={() => setShowUnlock(false)} style={{ background: "transparent", color: "var(--text-faint)", borderRadius: 5, padding: "6px 10px", fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: "1px solid var(--border)" }}>✕</button>
                  </span>
                ) : canWrite ? (
                  <button className="btn" onClick={handleLock} title="Lock" style={{ background: "transparent", color: "#10b981", fontSize: 14, padding: "4px 8px", border: "1px solid #10b98140", borderRadius: 5 }}>🔓</button>
                ) : (
                  <button className="btn" onClick={() => setShowUnlock(true)} title="Unlock write access" style={{ background: "transparent", color: "var(--text-tiny)", fontSize: 14, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 5 }}>🔒</button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, marginTop: 20, borderBottom: "1px solid var(--border)" }}>
              {[["trip", "✦ trip"], ["todos", "todos ✓"], ["expenses", "expenses"]].map(([tab, label]) => (
                <div key={tab} className="tab" onClick={() => setActiveTab(tab)} style={{ padding: "8px 16px", fontSize: 12, fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: activeTab === tab ? "var(--accent)" : "var(--text-faint)", borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1 }}>
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Add/Edit Form */}
          {showForm && (
            <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 20, marginBottom: 24, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>{editId ? "Edit booking" : "New booking"}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {TYPES.map(t => (
                  <button key={t.id} className="btn" onClick={() => setForm(f => ({ ...f, type: t.id }))}
                    style={{ padding: "6px 12px", borderRadius: 5, border: `1.5px solid ${form.type === t.id ? t.color : "var(--border)"}`, background: form.type === t.id ? `${t.color}20` : "transparent", color: form.type === t.id ? t.color : "var(--text-faint)", fontSize: 12, fontFamily: "'Source Code Pro', monospace" }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <input placeholder="Name / description *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                    {form.type === "hotel" ? "Check-in" : "Date"}
                  </div>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
                </div>
                {showDateEnd ? (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                      {form.type === "hotel" ? "Check-out" : "End date"}
                    </div>
                    <input type="date" value={form.date_end} onChange={e => setForm(f => ({ ...f, date_end: e.target.value }))} style={inp} />
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input placeholder="Price" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} style={{ ...inp, flex: 1 }} />
                    <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} style={{ ...inp, width: 72 }}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                {showDateEnd && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input placeholder="Price" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} style={{ ...inp, flex: 1 }} />
                    <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} style={{ ...inp, width: 72 }}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <input placeholder="Location (e.g. Beijing)" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={inp} />
                <input placeholder="Platform (e.g. Booking.com)" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} style={inp} />
                <div style={{ gridColumn: "1 / -1" }}>
                  <input placeholder="Reference / confirmation #" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} style={inp} />
                </div>
                {form.type !== "activity" && (
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>Travelers</span>
                    {["peter", "friend", "both"].map(v => (
                      <button key={v} className="btn" onClick={() => setForm(f => ({ ...f, travelers: v }))}
                        style={{ padding: "5px 12px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${form.travelers === v ? "var(--text)" : "var(--border)"}`, background: form.travelers === v ? "var(--border)" : "transparent", color: form.travelers === v ? "var(--text)" : "var(--text-faint)" }}>{v}</button>
                    ))}
                    <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 8 }}>Paid by</span>
                    {[{ v: "peter", label: "peter" }, { v: "friend", label: "friend" }, { v: "", label: "⏳ unpaid" }].map(({ v, label }) => (
                      <button key={label} className="btn" onClick={() => setForm(f => ({ ...f, paid_by: v }))}
                        style={{ padding: "5px 12px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${form.paid_by === v ? (v ? "#10b981" : "#f59e0b") : "var(--border)"}`, background: form.paid_by === v ? (v ? "#10b98120" : "#f59e0b20") : "transparent", color: form.paid_by === v ? (v ? "#10b981" : "#f59e0b") : "var(--text-faint)" }}>{label}</button>
                    ))}
                  </div>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <textarea placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn" onClick={handleCancel} style={{ ...btnStyle, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Cancel</button>
                <button className="btn" onClick={handleSubmit} disabled={saving || !form.name}
                  style={{ ...btnStyle, background: "var(--accent)", color: "#fff", opacity: (!form.name || saving) ? 0.5 : 1 }}>
                  {saving ? "Saving..." : editId ? "Save changes" : "Add booking"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: "var(--surface)", border: "1px solid #7f1d1d", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontFamily: "'Source Code Pro', monospace", fontSize: 12, color: "var(--text-error)" }}>✗ {error}</div>
          )}

          {/* ── EXPENSES TAB ── */}
          {activeTab === "expenses" && (
            <>
              {/* Summary button */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                <button className="btn" onClick={() => setShowSummary(true)}
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontFamily: "'Source Code Pro', monospace", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                  ¥ summary
                </button>
              </div>
              {bookings.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button className="btn" onClick={() => setShowFilters(v => !v)} style={{ background: "transparent", border: "none", padding: 0, display: "flex", alignItems: "center", gap: 5, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      <span style={{ fontSize: 9, lineHeight: 1 }}>{showFilters ? "▾" : "▸"}</span> filters
                    </button>
                    {!showFilters && (filterTypes.length > 0 || filterSettled !== "all" || filterTravelers !== "all" || filterPaidBy !== "all") && (
                      <span style={{ fontSize: 10, color: "var(--accent)", fontFamily: "'Source Code Pro', monospace" }}>●</span>
                    )}
                  </div>
                  {showFilters && (
                    <>
                      {[
                        { label: "for",    active: filterTravelers, setActive: setFilterTravelers, opts: [["all","all"],["both","both"],["peter","peter"],["friend","friend"]], colorFn: () => "var(--text)" },
                        { label: "paid",   active: filterPaidBy,    setActive: setFilterPaidBy,    opts: [["all","all"],["peter","peter"],["friend","friend"],["pending","⏳ unpaid"]], colorFn: v => v === "pending" ? "#f59e0b" : "#10b981" },
                        { label: "status", active: filterSettled,   setActive: setFilterSettled,   opts: [["all","all"],["unsettled","unsettled"],["settled","✓ settled"]], colorFn: v => v === "settled" ? "#10b981" : "var(--text)" },
                      ].map(({ label, active, setActive, opts, colorFn }) => (
                        <div key={label} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 52 }}>{label}</span>
                          {opts.map(([v, display]) => {
                            const isActive = active === v;
                            const color = colorFn(v);
                            return (
                              <button key={v} className="btn" onClick={() => setActive(v)}
                                style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1px solid ${isActive ? color : "var(--border)"}`, background: isActive ? `${color}18` : "transparent", color: isActive ? color : "var(--text-faint)" }}>{display}</button>
                            );
                          })}
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 52 }}>type</span>
                        <button className="btn" onClick={() => setFilterTypes([])}
                          style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1px solid ${filterTypes.length === 0 ? "var(--text)" : "var(--border)"}`, background: filterTypes.length === 0 ? "#e2e8f018" : "transparent", color: filterTypes.length === 0 ? "var(--text)" : "var(--text-faint)" }}>all</button>
                        {TYPES.map(t => {
                          const on = filterTypes.includes(t.id);
                          return (
                            <button key={t.id} className="btn" onClick={() => setFilterTypes(prev => on ? prev.filter(x => x !== t.id) : [...prev, t.id])}
                              style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1px solid ${on ? t.color : "var(--border)"}`, background: on ? `${t.color}18` : "transparent", color: on ? t.color : "var(--text-faint)" }}>{t.icon} {t.label}</button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {loading ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--border)", fontFamily: "'Source Code Pro', monospace", fontSize: 12 }}>LOADING...</div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--border)", fontFamily: "'Source Code Pro', monospace", fontSize: 12, letterSpacing: "0.1em" }}>
                  {bookings.length === 0 ? "NO BOOKINGS YET" : "NOTHING IN THIS CATEGORY"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filtered.map(b => {
                    const t = TYPES.find(t => t.id === b.type) || TYPES[0];
                    return (
                      <div key={b.id} className="card" style={{ background: b.paid_by ? "var(--surface)" : "var(--surface)", borderRadius: 8, padding: "14px 16px", borderLeft: `3px solid ${b.paid_by ? t.color : "var(--text-tiny)"}`, position: "relative", opacity: b.paid_by ? 1 : 0.75 }}>
                        {canWrite && (
                          <div className="card-actions" style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8, opacity: 0, transition: "opacity 0.15s" }}>
                            {b.paid_by && b.travelers === "both" && (
                              <button className="btn" onClick={() => handleSettle(b.id, b.settled)}
                                style={{ background: "transparent", color: b.settled ? "var(--text-faint)" : "#10b981", fontSize: 11, padding: "2px 6px", fontFamily: "'Source Code Pro', monospace", border: `1px solid ${b.settled ? "#64748b40" : "#10b98140"}`, borderRadius: 4 }}>{b.settled ? "unsettle ↩" : "settle ✓"}</button>
                            )}
                            {PASS_TYPES.includes(b.type) && (
                              <button className="btn" onClick={() => handlePassOpen(b)}
                                style={{ background: "transparent", fontSize: 14, padding: "0 2px", border: "none", opacity: savedPasses[b.id] ? 0.9 : 0.25, lineHeight: 1 }} title={savedPasses[b.id] ? "View pass" : "Add pass"}>🎫</button>
                            )}
                            <button className="btn" onClick={() => handleEdit(b)} style={{ background: "transparent", color: "var(--text-faint)", fontSize: 14, padding: "2px 4px", fontFamily: "monospace" }}>✎</button>
                            {deleteConfirm === b.id ? (
                              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <button className="btn" onClick={() => handleDelete(b.id)} style={{ background: "transparent", color: "#ef4444", fontSize: 11, padding: "2px 4px", fontFamily: "'Source Code Pro', monospace" }}>delete?</button>
                                <button className="btn" onClick={() => setDeleteConfirm(null)} style={{ background: "transparent", color: "var(--text-faint)", fontSize: 11, padding: "2px 4px", fontFamily: "'Source Code Pro', monospace" }}>cancel</button>
                              </span>
                            ) : (
                              <button className="btn" onClick={() => setDeleteConfirm(b.id)} style={{ background: "transparent", color: "var(--text-tiny)", fontSize: 14, padding: "2px 4px", fontFamily: "monospace" }}>┕</button>
                            )}
                          </div>
                        )}
                        {/* Persistent pass badge — visible even when locked */}
                        {savedPasses[b.id] && !canWrite && PASS_TYPES.includes(b.type) && (
                          <button className="btn" onClick={() => handlePassOpen(b)}
                            style={{ position: "absolute", top: 12, right: 12, background: "transparent", fontSize: 14, padding: "2px 4px", border: "none", lineHeight: 1 }}>🎫</button>
                        )}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap", paddingRight: 60 }}>
                          <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: t.color, background: `${t.color}18`, padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{t.icon} {t.label}</span>
                          {!b.paid_by && b.type !== "activity" && <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: "#f59e0b", background: "#f59e0b18", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>⏳ pending</span>}
                          {b.settled && <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: "#10b981", background: "#10b98118", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>✓ settled</span>}
                          <span style={{ fontSize: 14.5, color: "var(--text)", fontFamily: "'Georgia', serif", lineHeight: 1.4 }}>{b.name}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginTop: 10 }}>
                          {b.date && <Meta label="date" value={b.date_end ? `${b.date} → ${b.date_end}` : b.date} />}
                          {b.location && <Meta label="loc" value={b.location} />}
                          {b.price && <Meta label="price" value={fmt(b.price, b.currency)} highlight />}
                          {b.platform && <Meta label="via" value={b.platform} />}
                          {b.reference && <Meta label="ref" value={b.reference} mono />}
                          {b.type !== "activity" && <Meta label="travelers" value={b.travelers || "both"} />}
                          {b.type !== "activity" && (b.paid_by ? <Meta label="paid by" value={b.paid_by} /> : <Meta label="paid by" value="—" />)}
                        </div>
                        {b.notes && <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-faint)", fontStyle: "italic", lineHeight: 1.5 }}>{b.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── TODOS TAB ── */}
          {activeTab === "todos" && (
            <div>
              {/* Progress bar */}
              {todos.length > 0 && (() => {
                const done = todos.filter(t => t.done).length;
                const pct = Math.round((done / todos.length) * 100);
                return (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>progress</span>
                      <span style={{ fontSize: 11, color: pct === 100 ? "#10b981" : "var(--text-faint)", fontFamily: "'Source Code Pro', monospace" }}>{done}/{todos.length}</span>
                    </div>
                    <div style={{ height: 3, background: "var(--border)", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#10b981" : "var(--accent)", borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                  </div>
                );
              })()}

              {/* Add todo form */}
              {canWrite && (
                <div style={{ marginBottom: 18 }}>
                  {!showTodoForm ? (
                    <button className="btn" onClick={() => setShowTodoForm(true)}
                      style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontFamily: "'Source Code Pro', monospace", color: "var(--text-faint)", letterSpacing: "0.05em" }}>
                      + add todo
                    </button>
                  ) : (
                    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
                      <input
                        placeholder="What needs doing? *"
                        value={todoForm.title}
                        onChange={e => setTodoForm(f => ({ ...f, title: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && handleAddTodo()}
                        autoFocus
                        style={{ ...inp, marginBottom: 10 }}
                      />
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                        {TODO_CATS.map(c => (
                          <button key={c.id} className="btn" onClick={() => setTodoForm(f => ({ ...f, category: c.id }))}
                            style={{ padding: "5px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${todoForm.category === c.id ? "var(--text)" : "var(--border)"}`, background: todoForm.category === c.id ? "var(--surface-hover)" : "transparent", color: todoForm.category === c.id ? "var(--text)" : "var(--text-faint)" }}>
                            {c.icon} {c.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>for</span>
                        {["both", "peter", "friend"].map(v => (
                          <button key={v} className="btn" onClick={() => setTodoForm(f => ({ ...f, assignee: v }))}
                            style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${todoForm.assignee === v ? "var(--text)" : "var(--border)"}`, background: todoForm.assignee === v ? "var(--surface-hover)" : "transparent", color: todoForm.assignee === v ? "var(--text)" : "var(--text-faint)" }}>{v}</button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button className="btn" onClick={() => { setShowTodoForm(false); setTodoForm(EMPTY_TODO); }}
                          style={{ ...btnStyle, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Cancel</button>
                        <button className="btn" onClick={handleAddTodo} disabled={!todoForm.title.trim()}
                          style={{ ...btnStyle, background: "var(--accent)", color: "#fff", opacity: !todoForm.title.trim() ? 0.5 : 1 }}>Add</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Filters */}
              {todos.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="btn" onClick={() => setTodoFilterCat("all")}
                      style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1px solid ${todoFilterCat === "all" ? "var(--text)" : "var(--border)"}`, background: todoFilterCat === "all" ? "var(--surface-hover)" : "transparent", color: todoFilterCat === "all" ? "var(--text)" : "var(--text-faint)" }}>all</button>
                    {TODO_CATS.filter(c => todos.some(t => t.category === c.id)).map(c => (
                      <button key={c.id} className="btn" onClick={() => setTodoFilterCat(todoFilterCat === c.id ? "all" : c.id)}
                        style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1px solid ${todoFilterCat === c.id ? "var(--text)" : "var(--border)"}`, background: todoFilterCat === c.id ? "var(--surface-hover)" : "transparent", color: todoFilterCat === c.id ? "var(--text)" : "var(--text-faint)" }}>
                        {c.icon} {c.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 28 }}>for</span>
                    {["all", "both", "peter", "friend"].map(v => (
                      <button key={v} className="btn" onClick={() => setTodoFilterAssignee(v)}
                        style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1px solid ${todoFilterAssignee === v ? "var(--text)" : "var(--border)"}`, background: todoFilterAssignee === v ? "var(--surface-hover)" : "transparent", color: todoFilterAssignee === v ? "var(--text)" : "var(--text-faint)" }}>{v}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Todo list */}
              {(() => {
                const filteredTodos = todos
                  .filter(t => todoFilterCat === "all" || t.category === todoFilterCat)
                  .filter(t => todoFilterAssignee === "all" || t.assignee === todoFilterAssignee);
                if (todos.length === 0) return (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "var(--border)", fontFamily: "'Source Code Pro', monospace", fontSize: 12, letterSpacing: "0.1em" }}>NO TODOS YET</div>
                );
                if (filteredTodos.length === 0) return (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "var(--border)", fontFamily: "'Source Code Pro', monospace", fontSize: 12 }}>nothing here</div>
                );
                const catsToShow = todoFilterCat === "all"
                  ? TODO_CATS.filter(c => filteredTodos.some(t => t.category === c.id))
                  : TODO_CATS.filter(c => c.id === todoFilterCat);
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {catsToShow.map(cat => {
                      const catTodos = filteredTodos.filter(t => t.category === cat.id);
                      if (!catTodos.length) return null;
                      const pending = catTodos.filter(t => !t.done);
                      const done = catTodos.filter(t => t.done);
                      return (
                        <div key={cat.id}>
                          {todoFilterCat === "all" && (
                            <div style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
                              {cat.icon} {cat.label}{pending.length > 0 ? ` · ${pending.length} left` : " · done ✓"}
                            </div>
                          )}
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {[...pending, ...done].map(todo => (
                              <div key={todo.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", borderRadius: 7, padding: "10px 14px", opacity: todo.done ? 0.4 : 1, transition: "opacity 0.2s" }}>
                                <button className="btn" onClick={() => handleToggleTodo(todo)}
                                  style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${todo.done ? "#10b981" : "var(--border2)"}`, background: todo.done ? "#10b98120" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#10b981", padding: 0 }}>
                                  {todo.done ? "✓" : ""}
                                </button>
                                <span style={{ flex: 1, fontSize: 13.5, color: "var(--text)", fontFamily: "'Georgia', serif", textDecoration: todo.done ? "line-through" : "none", lineHeight: 1.4 }}>{todo.title}</span>
                                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                                  {todo.assignee !== "both" && (
                                    <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>{todo.assignee}</span>
                                  )}
                                  {canWrite && (
                                    <button className="btn" onClick={() => handleDeleteTodo(todo.id)}
                                      style={{ background: "transparent", color: "var(--text-tiny)", fontSize: 16, lineHeight: 1, padding: "0 2px", border: "none", opacity: 0.5 }}>×</button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── TRIP TAB ── */}
          {activeTab === "trip" && (
            <div>
              {loading ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--border)", fontFamily: "'Source Code Pro', monospace", fontSize: 12 }}>LOADING...</div>
              ) : locationGroups.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--border)", fontFamily: "'Source Code Pro', monospace", fontSize: 12, letterSpacing: "0.1em" }}>NO BOOKINGS YET</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {locationGroups.map((group, gi) => {
                    const isPast = group.endDate < today;
                    const isActive = group.startDate <= today && today <= group.endDate;
                    const isCollapsed = collapsedGroups[group.location + gi];
                    const hotelBooking = bookings.find(b => b.type === "hotel" && b.location === group.location && b.date >= group.startDate && b.date <= group.endDate);

                    const vibeImg = locationImages[group.location];

                    return (
                      <div key={gi} style={{ marginBottom: 28, opacity: isPast ? 0.45 : 1 }}>
                        {/* Location hero header */}
                        <div
                          onClick={() => toggleGroup(group.location + gi)}
                          style={{ position: "relative", borderRadius: 10, overflow: "hidden", marginBottom: isCollapsed ? 0 : 16, cursor: "pointer", minHeight: 90, background: "var(--surface)", border: "1px solid var(--border)" }}
                        >
                          {vibeImg && (
                            <div className="hero-img" style={{ position: "absolute", inset: 0, backgroundImage: `url(${vibeImg})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                          )}
                          <div style={{ position: "absolute", inset: 0, background: "var(--hero-overlay)" }} />
                          <div style={{ position: "relative", padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {isActive && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, display: "inline-block", boxShadow: "0 0 8px #0ea5e9" }} />}
                              <div>
                                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 600, color: isActive ? "var(--text)" : isPast ? "var(--text-faint)" : "var(--text)", letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                                  {group.location}
                                </div>
                                <div style={{ fontSize: 11, color: isActive ? "var(--accent)" : "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", marginTop: 3 }}>
                                  {fmtDateShort(group.startDate)}{group.startDate !== group.endDate ? ` – ${fmtDateShort(group.endDate)}` : ""}
                                  {isActive && " · now"}
                                </div>
                              </div>
                            </div>
                            <span style={{ fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", flexShrink: 0 }}>{isCollapsed ? "▸" : "▾"}</span>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                            {/* Hotel banner */}
                            {hotelBooking && (
                              <div style={{ background: "var(--hotel-bg)", border: "1px solid var(--hotel-border)", borderRadius: 8, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 13 }}>🏨</span>
                                  <span style={{ fontSize: 13, color: "var(--hotel-text)", fontFamily: "'Georgia', serif" }}>{hotelBooking.name}</span>
                                </div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  {hotelBooking.date_end && (
                                    <span style={{ fontSize: 10, color: "var(--hotel-text)", fontFamily: "'Source Code Pro', monospace" }}>
                                      {fmtDateShort(hotelBooking.date)} → {fmtDateShort(hotelBooking.date_end)}
                                    </span>
                                  )}
                                  <a href={mapsLink(hotelBooking)} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px" }}
                                    onClick={e => e.stopPropagation()}>map ↗</a>
                                  {platformLink(hotelBooking) && (
                                    <a href={platformLink(hotelBooking)} target="_blank" rel="noopener noreferrer"
                                      style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px" }}
                                      onClick={e => e.stopPropagation()}>booking ↗</a>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Days */}
                            {group.days.map(({ date: d, bookings: dayBks }) => {
                              const isToday = d === today;
                              const nonHotel = dayBks.filter(b => b.type !== "hotel");
                              const foodBks = nonHotel.filter(b => b.type === "food");
                              const otherBks = nonHotel.filter(b => b.type !== "food");
                              const isFoodExpanded = expandedFoodDays[d];

                              // Food summary line
                              const foodByCurrency = foodBks.reduce((acc, b) => {
                                if (!b.price || !b.currency) return acc;
                                acc[b.currency] = (acc[b.currency] || 0) + parseFloat(b.price);
                                return acc;
                              }, {});
                              const foodSummary = Object.entries(foodByCurrency)
                                .map(([c, v]) => `${v.toFixed(0)} ${c}`).join(" + ");

                              if (otherBks.length === 0 && foodBks.length === 0 && !isToday) return null;

                              return (
                                <div key={d} ref={isToday ? todayRef : null} style={{ marginBottom: 12 }}>
                                  {/* Day header */}
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                    {isToday && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />}
                                    <span style={{ fontSize: 11, fontFamily: "'Source Code Pro', monospace", color: isToday ? "var(--accent)" : "var(--text-tiny)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                                      {fmtDate(d)}{isToday ? " · today" : ""}
                                    </span>
                                  </div>

                                  {otherBks.length === 0 && foodBks.length === 0 && (
                                    <div style={{ fontSize: 11, color: "var(--border)", fontFamily: "'Source Code Pro', monospace", paddingLeft: 14 }}>—</div>
                                  )}

                                  {otherBks.map(b => {
                                    const t = TYPES.find(t => t.id === b.type) || TYPES[0];
                                    const isExpanded = expandedCards[b.id];
                                    const hasDetails = b.reference || b.platform || b.notes || b.price;
                                    return (
                                      <div key={b.id} className="trip-card"
                                        onClick={() => hasDetails && toggleCard(b.id)}
                                        style={{ background: "var(--surface)", borderRadius: 7, padding: "10px 14px", marginBottom: 6, borderLeft: `3px solid ${t.color}`, cursor: hasDetails ? "pointer" : "default" }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 14 }}>{t.icon}</span>
                                            <span style={{ fontSize: 13.5, color: "var(--text)", fontFamily: "'Georgia', serif", lineHeight: 1.3 }}>{b.name}</span>
                                          </div>
                                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                            {b.price && b.type !== "activity" && (
                                              <span style={{ fontSize: 11, color: "#10b981", fontFamily: "'Source Code Pro', monospace" }}>{fmt(b.price, b.currency)}</span>
                                            )}
                                            {PASS_TYPES.includes(b.type) && (savedPasses[b.id] || canWrite) && (
                                              <button className="btn" onClick={e => { e.stopPropagation(); handlePassOpen(b); }}
                                                style={{ background: "transparent", fontSize: 14, padding: "0 2px", border: "none", opacity: savedPasses[b.id] ? 1 : 0.25, lineHeight: 1 }} title={savedPasses[b.id] ? "View pass" : "Add pass"}>🎫</button>
                                            )}
                                            {hasDetails && <span style={{ fontSize: 9, color: "var(--text-tiny)" }}>{isExpanded ? "▲" : "▼"}</span>}
                                          </div>
                                        </div>
                                        {isExpanded && (
                                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
                                            {b.date_end && <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace" }}>until {fmtDate(b.date_end)}</div>}
                                            {b.reference && (
                                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>ref</span>
                                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{b.reference}</span>
                                              </div>
                                            )}
                                            {b.platform && (
                                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>via</span>
                                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{b.platform}</span>
                                              </div>
                                            )}
                                            {b.notes && <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic", lineHeight: 1.5 }}>{b.notes}</div>}
                                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                              {(b.type === "hotel" || b.type === "activity" || b.type === "ticket") && (
                                                <a href={mapsLink(b)} target="_blank" rel="noopener noreferrer"
                                                  style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px" }}
                                                  onClick={e => e.stopPropagation()}>📍 maps</a>
                                              )}
                                              {platformLink(b) && (
                                                <a href={platformLink(b)} target="_blank" rel="noopener noreferrer"
                                                  style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px" }}
                                                  onClick={e => e.stopPropagation()}>↗ {b.platform}</a>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {/* Food one-liner */}
                                  {foodBks.length > 0 && (
                                    <div>
                                      <div className="trip-card"
                                        onClick={() => setExpandedFoodDays(p => ({ ...p, [d]: !p[d] }))}
                                        style={{ background: "var(--surface)", borderRadius: 7, padding: "8px 14px", marginBottom: isFoodExpanded ? 0 : 6, borderLeft: "3px solid #e879f9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ fontSize: 13 }}>🍜</span>
                                          <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>
                                            {foodBks.length} {foodBks.length === 1 ? "meal" : "meals"}
                                          </span>
                                          {foodSummary && <span style={{ fontSize: 12, color: "#10b981", fontFamily: "'Source Code Pro', monospace" }}>· {foodSummary}</span>}
                                        </div>
                                        <span style={{ fontSize: 9, color: "var(--text-tiny)" }}>{isFoodExpanded ? "▲" : "▼"}</span>
                                      </div>
                                      {isFoodExpanded && foodBks.map(b => (
                                        <div key={b.id} style={{ background: "var(--surface2)", borderRadius: "0 0 6px 6px", padding: "7px 14px 7px 40px", marginBottom: 2, borderLeft: "3px solid #e879f920", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                          <span style={{ fontSize: 12.5, color: "var(--text-muted)", fontFamily: "'Georgia', serif" }}>{b.name}</span>
                                          {b.price && <span style={{ fontSize: 11, color: "#10b981", fontFamily: "'Source Code Pro', monospace", flexShrink: 0 }}>{fmt(b.price, b.currency)}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── PASS VIEWER MODAL ── */}
          {passViewer && (
            <div onClick={() => setPassViewer(null)}
              style={{ position: "fixed", inset: 0, zIndex: 2000, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <img
                src={passViewer.dataUrl}
                alt={passViewer.name}
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }}
              />
              <div style={{ position: "absolute", top: 16, right: 16 }}>
                <button className="btn" onClick={() => setPassViewer(null)}
                  style={{ background: "#00000015", color: "#000", border: "1px solid #00000020", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontFamily: "'Source Code Pro', monospace" }}>✕</button>
              </div>
              <div style={{ position: "absolute", bottom: 28, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: "#00000050", fontFamily: "'Source Code Pro', monospace" }}>{passViewer.name}</span>
                {canWrite && (
                  <button className="btn" onClick={e => { e.stopPropagation(); handlePassRemove(passViewer.id); }}
                    style={{ background: "transparent", color: "#ef4444", fontSize: 11, fontFamily: "'Source Code Pro', monospace", padding: "3px 8px", border: "1px solid #ef444440", borderRadius: 4 }}>remove pass</button>
                )}
              </div>
            </div>
          )}

          {/* ── SUMMARY MODAL ── */}
          {showSummary && (
            <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
              onClick={e => { if (e.target === e.currentTarget) setShowSummary(false); }}>
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setShowSummary(false)} />
              <div style={{ position: "relative", background: "var(--surface)", borderRadius: "16px 16px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 680, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>Summary</div>
                  <button className="btn" onClick={() => setShowSummary(false)} style={{ background: "transparent", border: "none", color: "var(--text-faint)", fontSize: 18, padding: "0 4px" }}>✕</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {activeCurrencies.length === 0 && <div style={{ color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", fontSize: 12 }}>No expenses yet.</div>}
                  {activeCurrencies.length > 0 && (() => {
                    const owedByCurrency = activeCurrencies
                      .map(currency => ({ currency, pOwes: calcForCurrency(currency).pOwes }))
                      .filter(x => Math.abs(x.pOwes) >= 0.01);
                    const toDKK = (amount, currency) => {
                      if (currency === "DKK") return amount;
                      if (!rates?.rates?.[currency]) return null;
                      return amount / rates.rates[currency];
                    };
                    const dkkAmounts = owedByCurrency.map(x => toDKK(x.pOwes, x.currency));
                    const allConverted = dkkAmounts.every(v => v !== null);
                    const totalDKK = allConverted ? dkkAmounts.reduce((s, v) => s + v, 0) : null;
                    const rateTs = rates?.time_last_update_utc ? new Date(rates.time_last_update_utc).toLocaleString("en-DK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
                    return (
                      <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 20, border: "1px solid var(--border2)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                          <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>Settlement snapshot</div>
                          <button className="btn" onClick={fetchRates} disabled={ratesLoading} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-tiny)", fontSize: 10, fontFamily: "'Source Code Pro', monospace", padding: "2px 8px" }}>{ratesLoading ? "..." : "↻ rates"}</button>
                        </div>
                        {owedByCurrency.length === 0 ? (
                          <div style={{ color: "#10b981", fontFamily: "'Source Code Pro', monospace", fontSize: 13 }}>All square ✓</div>
                        ) : (
                          <>
                            {owedByCurrency.map(({ currency, pOwes }) => {
                              const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "KRW" ? "₩" : "";
                              const fmtAmt = v => `${sym}${Math.abs(v).toFixed(2)} ${sym ? "" : currency}`.trim();
                              const dkk = toDKK(pOwes, currency);
                              return (
                                <div key={currency} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                                  <div style={{ fontSize: 14, color: "var(--text)" }}>
                                    {pOwes > 0 ? "Peter owes friend" : "Friend owes Peter"}
                                    <span style={{ color: pOwes > 0 ? "#f97316" : "#10b981", fontFamily: "'Source Code Pro', monospace", marginLeft: 8 }}>{fmtAmt(pOwes)}</span>
                                  </div>
                                  {dkk !== null && <span style={{ fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>≈ {Math.abs(dkk).toFixed(0)} DKK</span>}
                                </div>
                              );
                            })}
                            {owedByCurrency.length > 1 && totalDKK !== null && (
                              <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                <div style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>net total</div>
                                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: totalDKK > 0 ? "#f97316" : "#10b981" }}>
                                  {totalDKK > 0 ? "+" : "−"}{Math.abs(totalDKK).toFixed(0)} <span style={{ fontSize: 13, color: "var(--text-faint)" }}>DKK</span>
                                </div>
                              </div>
                            )}
                            {owedByCurrency.length === 1 && totalDKK !== null && owedByCurrency[0].currency !== "DKK" && (
                              <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "flex-end" }}>
                                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: totalDKK > 0 ? "#f97316" : "#10b981" }}>
                                  {totalDKK > 0 ? "+" : "−"}{Math.abs(totalDKK).toFixed(0)} <span style={{ fontSize: 13, color: "var(--text-faint)" }}>DKK</span>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {rateTs && <div style={{ marginTop: 14, fontSize: 10, color: "var(--border)", fontFamily: "'Source Code Pro', monospace" }}>rates · {rateTs} UTC</div>}
                      </div>
                    );
                  })()}
                  {activeCurrencies.map(currency => {
                    const { total, pendingTotal, pOwes, count, pendingCount, settledCount } = calcForCurrency(currency);
                    const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "KRW" ? "₩" : "";
                    const fmt2 = v => `${sym}${v.toFixed(2)} ${sym ? "" : currency}`.trim();
                    return (
                      <div key={currency} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", letterSpacing: "0.12em" }}>─ {currency} ──────────────────────────</div>
                        <SummaryCard label="Total committed" value={fmt2(total)} color="var(--text)" sub={`${count} item${count !== 1 ? "s" : ""}${pendingCount ? ` · ${pendingCount} pending` : ""}${settledCount ? ` · ${settledCount} settled` : ""}`} />
                        {pendingTotal > 0 && <SummaryCard label="Pending payment" value={fmt2(pendingTotal)} color="#f59e0b" sub="not yet paid by anyone" />}
                        <div style={{ background: "var(--surface2)", borderRadius: 8, padding: 20, border: "1px solid var(--border)" }}>
                          <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>By category</div>
                          {TYPES.filter(t => EXPENSE_TYPES.includes(t.id)).map(t => {
                            const catTotal = bookings.filter(b => b.currency === currency && b.price && b.type === t.id).reduce((s, b) => s + parseFloat(b.price), 0);
                            if (catTotal === 0) return null;
                            return (
                              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                <span style={{ fontSize: 12, color: t.color, fontFamily: "'Source Code Pro', monospace" }}>{t.icon} {t.label}</span>
                                <span style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{fmt2(catTotal)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: 48, color: "var(--surface2)", fontSize: 11, fontFamily: "'Source Code Pro', monospace", letterSpacing: "0.1em" }}>
            PETER + 1 · BEIJING → YUNNAN → ZHANGJIAJIE → INCHEON
            <br /><span style={{ fontSize: 10, opacity: 0.5 }}>updated {BUILD}</span>
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.ok ? "#10b981" : "#ef4444", color: "#fff", borderRadius: 8, padding: "10px 20px", fontFamily: "'Source Code Pro', monospace", fontSize: 12, letterSpacing: "0.05em", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", zIndex: 9999, whiteSpace: "nowrap", pointerEvents: "none", animation: "fadeIn 0.15s ease" }}>
          {toast.msg}
        </div>
      )}

      {/* Hidden file input for pass uploads */}
      <input
        type="file"
        accept="image/*"
        ref={passFileRef}
        onChange={handlePassFile}
        style={{ display: "none" }}
      />
    </>
  );
}

function Meta({ label, value, highlight, mono }) {
  return (
    <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      <span style={{ fontSize: 12.5, color: highlight ? "#10b981" : "var(--text-muted)", fontFamily: mono ? "'Source Code Pro', monospace" : "'Georgia', serif" }}>{value}</span>
    </span>
  );
}

function SummaryCard({ label, value, color, sub }) {
  return (
    <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "16px 20px", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontFamily: "'Playfair Display', serif", color, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>{sub}</div>}
    </div>
  );
}

const inp = { width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 12px", color: "var(--text)", fontSize: 13, fontFamily: "'Source Code Pro', monospace" };
const btnStyle = { padding: "8px 16px", borderRadius: 6, fontSize: 12, fontFamily: "'Source Code Pro', monospace", letterSpacing: "0.05em" };
