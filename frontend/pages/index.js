import { useState, useEffect, useRef } from "react";
import Head from "next/head";

const TYPES = [
  { id: "flight",         label: "Flight",   color: "var(--accent)", icon: "✈"  },
  { id: "hotel",          label: "Hotel",    color: "#8b5cf6",       icon: "🏨" },
  { id: "train",          label: "Train",    color: "#10b981",       icon: "🚄" },
  { id: "ticket",         label: "Ticket",   color: "#f97316",       icon: "🎟" },
  { id: "food",           label: "Food",     color: "#e879f9",       icon: "🍜" },
  { id: "activity",       label: "Activity", color: "#fbbf24",       icon: "📍" },
  { id: "city_transport", label: "City",     color: "#06b6d4",       icon: "🚇" },
  { id: "shopping",       label: "Shopping", color: "#84cc16",       icon: "🛍" },
];

const CURRENCIES = ["USD", "CNY", "EUR", "KRW", "VND", "DKK"];
const BUILD = "2026-06-21";
const FRIEND_NAME = process.env.NEXT_PUBLIC_FRIEND_NAME || "friend";
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

const EMPTY_FORM = {
  type: "flight", name: "", date: "", date_end: "", price: "", currency: "USD",
  platform: "", reference: "", notes: "", travelers: "both", paid_by: "", location: "",
  time: "", time_end: "", origin: "", subtype: "",
  detail_car: "", detail_seat_peter: "", detail_seat_friend: "", detail_gate: "", detail_code: "", detail_room: "",
  reminder: false, reminderType: "buy", reminderAssignee: "me",
};

// Types counted as expenses (matches backend AllExpenseTypes)
const EXPENSE_TYPES = ["flight", "hotel", "train", "ticket", "food", "city_transport", "shopping"];

const TODO_CATS = [
  { id: "pack",   label: "Pack",   icon: "🧳" },
  { id: "book",   label: "Book",   icon: "📋" },
  { id: "docs",   label: "Docs",   icon: "🛂" },
  { id: "health", label: "Health", icon: "💊" },
  { id: "tech",   label: "Tech",   icon: "📱" },
  { id: "do",     label: "Do",     icon: "🎯" },
];
const EMPTY_TODO = { title: "", category: "pack", assignee: "both", deadline: "", segment_id: null };
const PASS_TYPES = ["flight", "train", "ticket", "hotel", "activity", "city_transport"];

const CITY_SUBTYPES = [
  { id: "taxi",  icon: "🚕", label: "Taxi"  },
  { id: "bus",   icon: "🚌", label: "Bus"   },
  { id: "metro", icon: "🚇", label: "Metro" },
  { id: "other", icon: "🚐", label: "Other" },
];

function parseSubtype(notes) {
  const m = (notes || "").match(/^\[(taxi|bus|metro|other)\] ?([\s\S]*)/);
  return m ? { subtype: m[1], cleanNotes: m[2] } : { subtype: "", cleanNotes: notes || "" };
}
function encodeSubtype(subtype, notes) {
  const clean = (notes || "").replace(/^\[(taxi|bus|metro|other)\] ?/, "");
  return subtype ? `[${subtype}] ${clean}`.trim() : clean;
}

const DETAIL_LABELS = {
  car: "Car", seat: "Seat", seat_peter: "Seat (Peter)",
  seat_friend: `Seat (${FRIEND_NAME})`, gate: "Gate", code: "Code", room: "Room",
};
const PINNED_DETAIL_KEYS = ["car", "seat", "seat_peter", "seat_friend", "room", "gate"];

function detailLabel(key) {
  return DETAIL_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function detailFieldsForType(type) {
  if (type === "flight" || type === "train") return ["car", "seat_peter", "seat_friend", "gate", "code"];
  if (type === "hotel") return ["room"];
  return [];
}

const FORMAT_TO_BCID = {
  QR_CODE: "qrcode", PDF_417: "pdf417", AZTEC: "azteccode", CODE_128: "code128",
  CODE_39: "code39", DATA_MATRIX: "datamatrix", EAN_13: "ean13", EAN_8: "ean8",
  UPC_A: "upca", ITF: "interleaved2of5", CODABAR: "rationalizedCodabar",
};

function fmt(price, currency) {
  if (!price) return "—";
  return `${parseFloat(price).toFixed(2)} ${currency || "USD"}`;
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

// ── Offline cache ─────────────────────────────────────────────────────────────
const CACHE_VERSION = 2; // bumped for new response shapes

function cacheRead(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== CACHE_VERSION || !("data" in parsed)) return null;
    return parsed;
  } catch { return null; }
}

function cacheWrite(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ v: CACHE_VERSION, ts: Date.now(), data }));
  } catch {}
}

async function fetchWithCache(url, key, setter, { fallback = null } = {}) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status}: ${text}`);
    const data = JSON.parse(text);
    setter(data);
    cacheWrite(key, data);
    return { ok: true };
  } catch (e) {
    const cached = cacheRead(key);
    if (cached) {
      setter(cached.data);
      return { ok: false, cached: true, cachedAt: cached.ts, error: e };
    }
    if (fallback !== null) setter(fallback);
    return { ok: false, cached: false, error: e };
  }
}

// ── Traveler filter (display-only, no computation) ────────────────────────────
function travelerMatch(b, identity) {
  return !identity || b.travelers === "both" || b.travelers === identity;
}

export default function App() {
  const [bookings,   setBookings]   = useState([]);
  const [tripData,   setTripData]   = useState(null);   // TripResponse from /api/trip
  const [summaryData, setSummaryData] = useState(null); // FullSummaryResponse from /api/summary
  const [todos,      setTodos]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [offline,    setOffline]    = useState(false);
  const [cachedAt,   setCachedAt]   = useState(null);
  const [error,      setError]      = useState(null);

  const [filterTypes,     setFilterTypes]     = useState([]);
  const [filterSettled,   setFilterSettled]   = useState("all");
  const [filterTravelers, setFilterTravelers] = useState("all");
  const [filterPaidBy,    setFilterPaidBy]    = useState("all");
  const [showFilters,     setShowFilters]     = useState(true);

  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [editId,    setEditId]    = useState(null);
  const [saving,    setSaving]    = useState(false);

  const [activeTab,      setActiveTab]      = useState("trip");
  const [writeToken,     setWriteToken]     = useState("");
  const [showUnlock,     setShowUnlock]     = useState(false);
  const [unlockInput,    setUnlockInput]    = useState("");
  const [toast,          setToast]          = useState(null);
  const [deleteConfirm,  setDeleteConfirm]  = useState(null);
  const [expandedCards,  setExpandedCards]  = useState({});
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [detailsModal,   setDetailsModal]   = useState(null);

  const [showSummary,       setShowSummary]       = useState(false);
  const [summaryMode,       setSummaryMode]        = useState("expenses");
  const [summaryShowSettled, setSummaryShowSettled] = useState(false);
  const [expandedSumCats,   setExpandedSumCats]   = useState({});
  const [segmentExpenseOpen, setSegmentExpenseOpen] = useState(null);
  const [summaryLoading,    setSummaryLoading]     = useState(false);

  const [expandedFoodDays,    setExpandedFoodDays]    = useState({});
  const [expandedTransitDays, setExpandedTransitDays] = useState({});

  const [todoForm,          setTodoForm]          = useState(EMPTY_TODO);
  const [showTodoForm,      setShowTodoForm]      = useState(false);
  const [todoFilterCat,     setTodoFilterCat]     = useState("all");
  const [todoFilterAssignee, setTodoFilterAssignee] = useState("all");
  const [editingTodo,       setEditingTodo]       = useState(null);

  const [passViewer,         setPassViewer]         = useState(null);
  const [identity,           setIdentity]           = useState(null);
  const [showIdentityPicker, setShowIdentityPicker] = useState(false);
  const [pendingPassBooking, setPendingPassBooking] = useState(null);

  const [locationImages, setLocationImages] = useState({});

  const todayRef      = useRef(null);
  const passFileRef   = useRef(null);
  const passUploadForRef = useRef(null);
  const passUploadWhoRef = useRef(null);
  const passCanvasRef    = useRef(null);
  const pickerAutoShownRef = useRef(false);

  // ── Persist preferences ───────────────────────────────────────────────────
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
    const savedIdentity = localStorage.getItem("who") || null;
    setIdentity(savedIdentity);
    if (!savedIdentity && !pickerAutoShownRef.current) {
      pickerAutoShownRef.current = true;
      setTimeout(() => setShowIdentityPicker(true), 350);
    }
  }, []);
  useEffect(() => { localStorage.setItem("ft",  JSON.stringify(filterTypes)); }, [filterTypes]);
  useEffect(() => { localStorage.setItem("fs",  filterSettled);               }, [filterSettled]);
  useEffect(() => { localStorage.setItem("ftr", filterTravelers);             }, [filterTravelers]);
  useEffect(() => { localStorage.setItem("fp",  filterPaidBy);                }, [filterPaidBy]);
  useEffect(() => { localStorage.setItem("sf",  showFilters ? "1" : "0");     }, [showFilters]);
  useEffect(() => { localStorage.setItem("tab", activeTab);                   }, [activeTab]);
  useEffect(() => { localStorage.setItem("cg",  JSON.stringify(collapsedGroups)); }, [collapsedGroups]);
  useEffect(() => { localStorage.setItem("tfc", todoFilterCat);               }, [todoFilterCat]);
  useEffect(() => { localStorage.setItem("tfa", todoFilterAssignee);          }, [todoFilterAssignee]);
  useEffect(() => { if (identity) localStorage.setItem("who", identity); else localStorage.removeItem("who"); }, [identity]);

  // ── Pass barcode render ───────────────────────────────────────────────────
  useEffect(() => {
    if (!passViewer?.passes || !passCanvasRef.current) return;
    const p = passViewer.passes[passViewer.idx ?? 0];
    if (!p?.code) return;
    import("bwip-js").then(({ default: bwipjs }) => {
      try {
        bwipjs.toCanvas(passCanvasRef.current, {
          bcid: FORMAT_TO_BCID[p.format] || "qrcode",
          text: p.code, scale: 4, includetext: false,
        });
      } catch (err) { console.error("Barcode render error:", err); }
    });
  }, [passViewer]);

  // ── Scroll to today on trip tab ───────────────────────────────────────────
  useEffect(() => {
    if (activeTab === "trip" && todayRef.current) {
      setTimeout(() => todayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [activeTab]);

  // ── Unsplash images ───────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "trip" || !tripData) return;
    const locations = [...new Set(
      tripData.timeline.filter(i => i.kind === "segment").map(i => i.segment.location)
    )];
    locations.forEach(loc => {
      if (locationImages[loc]) return;
      fetch(`${API_URL}/api/unsplash?location=${encodeURIComponent(loc)}`)
        .then(r => r.json())
        .then(data => { if (data?.url) setLocationImages(prev => ({ ...prev, [loc]: data.url })); })
        .catch(() => {});
    });
  }, [activeTab, tripData]);

  // ── Initial fetches ───────────────────────────────────────────────────────
  useEffect(() => { fetchBookings(); }, []);
  useEffect(() => { fetchTrip();     }, []);
  useEffect(() => { fetchTodos();    }, []);
  useEffect(() => { fetchSummary();  }, []);

  async function fetchBookings() {
    setLoading(true); setError(null);
    const result = await fetchWithCache(`${API_URL}/api/bookings`, "bookings_cache_v2",
      (data) => setBookings(Array.isArray(data) ? data : []), { fallback: [] });
    if (result.ok) { setOffline(false); setCachedAt(null); }
    else if (result.cached) { setOffline(true); setCachedAt(result.cachedAt); }
    else { setOffline(false); setError(result.error?.message); }
    setLoading(false);
  }

  async function fetchTrip() {
    await fetchWithCache(`${API_URL}/api/trip`, "trip_cache_v2",
      (data) => setTripData(data), { fallback: null });
  }

  async function fetchTodos() {
    await fetchWithCache(`${API_URL}/api/todos`, "todos_cache_v2",
      (data) => setTodos(Array.isArray(data) ? data : []), { fallback: [] });
  }

  async function fetchSummary() {
    setSummaryLoading(true);
    await fetchWithCache(`${API_URL}/api/summary`, "summary_cache_v2",
      (data) => setSummaryData(data), { fallback: null });
    setSummaryLoading(false);
  }

  async function refreshAll() {
    await Promise.all([fetchBookings(), fetchTrip(), fetchTodos(), fetchSummary()]);
  }

  // ── Todos CRUD ─────────────────────────────────────────────────────────────
  async function handleAddTodo() {
    if (!todoForm.title.trim()) return;
    const reset = () => { setTodoForm({ ...EMPTY_TODO, assignee: identity || "peter" }); setShowTodoForm(false); };

    if (todoForm.assignee === "both") {
      const t = Date.now();
      const [tmp1, tmp2] = [
        { ...todoForm, assignee: "peter",  id: `tmp-${t}-1`, done: false },
        { ...todoForm, assignee: "friend", id: `tmp-${t}-2`, done: false },
      ];
      setTodos(prev => { const u = [...prev, tmp1, tmp2]; cacheWrite("todos_cache_v2", u); return u; });
      reset(); showToast("2 todos added");
      const [r1, r2] = await Promise.all(
        ["peter", "friend"].map(a => fetch(`${API_URL}/api/todos`, {
          method: "POST", headers: authedHeaders,
          body: JSON.stringify({ ...todoForm, assignee: a }),
        }))
      );
      if (r1.status === 401 || r2.status === 401) {
        setTodos(prev => { const u = prev.filter(t => t.id !== tmp1.id && t.id !== tmp2.id); cacheWrite("todos_cache_v2", u); return u; });
        showToast("Wrong password", false); return;
      }
      const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
      setTodos(prev => { const u = prev.map(t => t.id === tmp1.id ? d1 : t.id === tmp2.id ? d2 : t); cacheWrite("todos_cache_v2", u); return u; });
      return;
    }

    const tmpId = `tmp-${Date.now()}`;
    const tmpTodo = { ...todoForm, id: tmpId, done: false };
    setTodos(prev => { const u = [...prev, tmpTodo]; cacheWrite("todos_cache_v2", u); return u; });
    reset(); showToast("Todo added");
    const res = await fetch(`${API_URL}/api/todos`, { method: "POST", headers: authedHeaders, body: JSON.stringify(todoForm) });
    if (res.status === 401) {
      setTodos(prev => { const u = prev.filter(t => t.id !== tmpId); cacheWrite("todos_cache_v2", u); return u; });
      showToast("Wrong password", false); return;
    }
    const todo = await res.json();
    setTodos(prev => { const u = prev.map(t => t.id === tmpId ? todo : t); cacheWrite("todos_cache_v2", u); return u; });
  }

  async function handleToggleTodo(todo) {
    const updated = { ...todo, done: !todo.done };
    setTodos(prev => { const u = prev.map(t => t.id === todo.id ? updated : t); cacheWrite("todos_cache_v2", u); return u; });
    const res = await fetch(`${API_URL}/api/todos/${todo.id}`, { method: "PATCH", headers: authedHeaders, body: JSON.stringify({ done: !todo.done }) });
    if (res.status === 401) {
      setTodos(prev => { const u = prev.map(t => t.id === todo.id ? todo : t); cacheWrite("todos_cache_v2", u); return u; });
      showToast("Wrong password", false);
    }
  }

  async function handleDeleteTodo(id) {
    const res = await fetch(`${API_URL}/api/todos/${id}`, { method: "DELETE", headers: authedHeaders });
    if (res.status === 401) { showToast("Wrong password", false); return; }
    setTodos(prev => { const u = prev.filter(t => t.id !== id); cacheWrite("todos_cache_v2", u); return u; });
    showToast("Todo deleted");
  }

  async function handleSaveEditTodo() {
    if (!editingTodo?.title?.trim()) return;
    const { id, title, category, assignee, deadline } = editingTodo;
    const res = await fetch(`${API_URL}/api/todos/${id}`, {
      method: "PATCH", headers: authedHeaders,
      body: JSON.stringify({ title, category, assignee, deadline: deadline || null }),
    });
    if (res.status === 401) { showToast("Wrong password", false); return; }
    setTodos(prev => { const u = prev.map(t => t.id === id ? { ...t, title, category, assignee } : t); cacheWrite("todos_cache_v2", u); return u; });
    setEditingTodo(null);
    showToast("Todo updated");
  }

  // ── Pass management ───────────────────────────────────────────────────────
  function getBookingPasses(b) {
    if (b.passes && b.passes.length > 0) return b.passes;
    if (b.pass_code) return [{ who: "peter", code: b.pass_code, format: b.pass_format }];
    return [];
  }

  function handlePassOpen(b, targetWho) {
    const who = targetWho !== undefined ? targetWho : identity;
    const allPasses = getBookingPasses(b);
    if (!who) {
      setPendingPassBooking({ b, targetWho });
      setShowIdentityPicker(true);
      return;
    }
    const myPasses = allPasses.filter(p => p.who === who);
    if (myPasses.length > 0) {
      setPassViewer({ id: b.id, name: b.name, passes: myPasses, idx: 0 });
      return;
    }
    if (canWrite) {
      passUploadForRef.current = b;
      passUploadWhoRef.current = who;
      passFileRef.current?.click();
    }
  }

  function handleIdentityPick(who) {
    setIdentity(who);
    localStorage.setItem("who", who);
    setShowIdentityPicker(false);
    if (pendingPassBooking) {
      const { b, targetWho } = pendingPassBooking;
      setPendingPassBooking(null);
      setTimeout(() => handlePassOpen(b, targetWho !== undefined ? targetWho : who), 50);
    }
  }
  function handleIdentityReset() {
    setIdentity(null); localStorage.removeItem("who"); setShowIdentityPicker(false);
  }

  async function handlePassFile(e) {
    const file = e.target.files?.[0];
    if (!file || !passUploadForRef.current) return;
    const b = passUploadForRef.current;
    const who = passUploadWhoRef.current || identity || "peter";
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader, BarcodeFormat } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      const code = result.getText();
      const format = BarcodeFormat[result.getBarcodeFormat()];
      const currentBooking = bookings.find(bk => bk.id === b.id);
      const existingPasses = currentBooking?.passes || [];
      const newPasses = [...existingPasses, { who, code, format }];
      const res = await fetch(`${API_URL}/api/bookings/${b.id}`, {
        method: "PATCH", headers: authedHeaders, body: JSON.stringify({ passes: newPasses }),
      });
      if (res.status === 401) { showToast("Wrong password", false); return; }
      setBookings(prev => {
        const updated = prev.map(bk => bk.id === b.id ? { ...bk, passes: newPasses } : bk);
        cacheWrite("bookings_cache_v2", updated); return updated;
      });
      const myPasses = newPasses.filter(p => p.who === who);
      setPassViewer({ id: b.id, name: b.name, passes: myPasses, idx: myPasses.length - 1 });
      showToast("Pass decoded ✓");
    } catch { showToast("Could not read barcode — try a clearer screenshot", false); }
    finally { URL.revokeObjectURL(url); e.target.value = ""; }
  }

  async function handlePassRemove(bookingId, passEntry) {
    const b = bookings.find(bk => bk.id === bookingId);
    if (!b) return;
    const newPasses = getBookingPasses(b).filter(p => !(p.who === passEntry.who && p.code === passEntry.code));
    const res = await fetch(`${API_URL}/api/bookings/${bookingId}`, {
      method: "PATCH", headers: authedHeaders, body: JSON.stringify({ passes: newPasses }),
    });
    if (res.status === 401) { showToast("Wrong password", false); return; }
    setBookings(prev => {
      const updated = prev.map(bk => bk.id === bookingId ? { ...bk, passes: newPasses } : bk);
      cacheWrite("bookings_cache_v2", updated); return updated;
    });
    setPassViewer(null); showToast("Pass removed");
  }

  // ── Booking form ──────────────────────────────────────────────────────────
  function apiBase(type) {
    if (type === "flight" || type === "train") return `${API_URL}/api/transport`;
    if (type === "hotel") return `${API_URL}/api/accommodation`;
    return `${API_URL}/api/experiences`;
  }

  async function handleSubmit() {
    const isTransport = form.type === "flight" || form.type === "train";
    if (!form.name && !isTransport) return;
    setSaving(true);
    const detailKeys = detailFieldsForType(form.type);
    const detailEntries = detailKeys.map(k => [k, (form[`detail_${k}`] || "").trim()]).filter(([,v]) => v);
    const details = detailEntries.length ? Object.fromEntries(detailEntries) : null;
    const payload = {
      ...form,
      price: form.price ? parseFloat(form.price) : null,
      date: form.date || null, date_end: form.date_end || null,
      location: form.location || null, paid_by: form.paid_by || null,
      time: form.time || null, time_end: form.time_end || null, origin: form.origin || null,
      notes: form.type === "city_transport" ? (encodeSubtype(form.subtype, form.notes) || null) : (form.notes || null),
      details,
    };
    const base = apiBase(form.type);
    if (editId) {
      const r = await fetch(`${base}/${editId}`, { method: "PUT", headers: authedHeaders, body: JSON.stringify(payload) });
      if (r.status === 401) { showToast("Wrong password", false); setSaving(false); return; }
      // Auto-complete linked todos
      const prev = bookings.find(b => b.id === editId);
      if (!prev?.paid_by && payload.paid_by) {
        const linked = todos.filter(t => t.booking_id === editId && !t.done);
        await Promise.all(linked.map(t =>
          fetch(`${API_URL}/api/todos/${t.id}`, { method: "PATCH", headers: authedHeaders, body: JSON.stringify({ done: true }) })
        ));
        if (linked.length) await fetchTodos();
      }
    } else {
      const r = await fetch(base, { method: "POST", headers: authedHeaders, body: JSON.stringify(payload) });
      if (r.status === 401) { showToast("Wrong password", false); setSaving(false); return; }
      const newBooking = await r.json();
      if (form.reminder && newBooking?.id) {
        const todoTitle = form.reminderType === "prepare" ? `Prepare: ${form.name}` : `Buy: ${form.name}`;
        const todoCategory = form.reminderType === "prepare" ? "pack" : "book";
        const assignees = form.reminderAssignee === "both" ? ["peter", "friend"] : [identity || "peter"];
        await Promise.all(assignees.map(assignee =>
          fetch(`${API_URL}/api/todos`, {
            method: "POST", headers: authedHeaders,
            body: JSON.stringify({
              title: todoTitle, category: todoCategory, assignee,
              booking_id: newBooking.id, segment_id: newBooking.segment_id || null,
              deadline: form.date || null,
            }),
          })
        ));
        await fetchTodos();
      }
    }
    await refreshAll();
    showToast(editId ? "Booking updated" : "Booking added");
    setForm(EMPTY_FORM); setShowForm(false); setEditId(null); setSaving(false);
  }

  async function handleDelete(id) {
    await fetch(`${API_URL}/api/bookings/${id}`, { method: "DELETE", headers: authedHeaders });
    setDeleteConfirm(null); await refreshAll(); showToast("Booking deleted");
  }

  function handleEdit(b) {
    const isTransport = b.type === "flight" || b.type === "train";
    let origin = b.origin || "";
    if (!origin && isTransport && b.name?.includes(" → ")) origin = b.name.split(" → ")[0].trim();
    setForm({
      type: b.type, name: b.name, date: b.date || "", date_end: b.date_end || "",
      price: b.price != null ? String(b.price) : "", currency: b.currency || "USD",
      platform: b.platform || "", reference: b.reference || "",
      ...(b.type === "city_transport"
        ? { notes: parseSubtype(b.notes).cleanNotes, subtype: parseSubtype(b.notes).subtype }
        : { notes: b.notes || "", subtype: "" }),
      travelers: b.travelers || "both", paid_by: b.paid_by || "", location: b.location || "",
      time: b.time || "", time_end: b.time_end || "", origin,
      detail_car: b.details?.car || "", detail_seat_peter: b.details?.seat_peter || "",
      detail_seat_friend: b.details?.seat_friend || "", detail_gate: b.details?.gate || "",
      detail_code: b.details?.code || "", detail_room: b.details?.room || "",
      reminder: false, reminderType: "buy", reminderAssignee: "me",
    });
    setEditId(b.id); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSettle(id, currentlySettled) {
    await fetch(`${API_URL}/api/bookings/${id}`, {
      method: "PATCH", headers: authedHeaders, body: JSON.stringify({ settled: !currentlySettled }),
    });
    await refreshAll(); showToast(currentlySettled ? "Marked as unsettled" : "Marked as settled");
  }

  function handleCancel() { setForm(EMPTY_FORM); setShowForm(false); setEditId(null); }

  const authedHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${writeToken}` };
  const canWrite = !!writeToken;

  function handleUnlock() {
    const token = unlockInput.trim();
    setWriteToken(token); localStorage.setItem("wt", token);
    setShowUnlock(false); setUnlockInput("");
  }
  function handleLock() { setWriteToken(""); localStorage.removeItem("wt"); setShowForm(false); }

  function showToast(msg, ok = true) {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 2800);
  }

  // ── Map helpers (pure display) ────────────────────────────────────────────
  function mapTargets(b) {
    const query = b.map_query ||
      (b.type === "flight" ? (b.origin ? `${b.origin} airport` : b.location ? `${b.location} airport China` : b.name) :
       b.type === "train"  ? (b.origin ? `${b.origin} railway station` : b.location ? `${b.location} railway station China` : b.name) :
       b.location ? `${b.name}, ${b.location}, China` : `${b.name}, China`);
    const encoded = encodeURIComponent(query);
    const name    = encodeURIComponent(b.name || query);
    const lat = b.map_lat; const lng = b.map_lng;
    const hasCoords = lat != null && lng != null && lat !== "" && lng !== "";
    const appUrl = hasCoords
      ? `androidamap://viewMap?sourceApplication=tripbookings&poiname=${name}&lat=${lat}&lon=${lng}&dev=1`
      : `androidamap://poi?sourceApplication=tripbookings&keywords=${encoded}&dev=0`;
    const webUrl = hasCoords
      ? `https://uri.amap.com/marker?position=${lng},${lat}&name=${name}&src=tripbookings`
      : `https://uri.amap.com/search?keyword=${encoded}&src=tripbookings`;
    return { appUrl, webUrl };
  }

  function mapsLink(b) { return mapTargets(b).webUrl; }
  function openMapsLink(e, b) {
    e.preventDefault(); e.stopPropagation();
    const { appUrl, webUrl } = mapTargets(b);
    const intentUrl = appUrl.replace(/^androidamap:\/\//, "intent://") +
      `#Intent;scheme=androidamap;package=com.autonavi.minimap;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
    window.location.href = intentUrl;
  }

  function platformLink(b) {
    if (!b.platform && !b.reference) return null;
    const pl = (b.platform || "").toLowerCase();
    if (pl.includes("booking.com")) return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(b.name)}`;
    if (pl.includes("trip.com") || pl.includes("ctrip")) return "https://www.trip.com/";
    if (pl.includes("klook")) return "https://www.klook.com/";
    if (pl.includes("airbnb")) return "https://www.airbnb.com/";
    return null;
  }

  // ── Derived display state ─────────────────────────────────────────────────
  const today = tripData?.today || new Date().toISOString().slice(0, 10);

  const myBookings = identity
    ? bookings.filter(b => b.travelers === "both" || b.travelers === identity)
    : bookings;

  const filtered = myBookings
    .filter(b => filterTypes.length === 0 || filterTypes.includes(b.type))
    .filter(b => filterSettled === "all" || (filterSettled === "settled" ? b.settled : !b.settled))
    .filter(b => filterTravelers === "all" || b.travelers === filterTravelers)
    .filter(b => filterPaidBy === "all" || (filterPaidBy === "pending" ? !b.paid_by : b.paid_by === filterPaidBy));

  // Auto-todos now use flags pre-computed by the backend
  const autoTodos = (() => {
    if (!tripData) return [];
    const result = [];
    const segItems = tripData.timeline.filter(i => i.kind === "segment");

    // Priority 1: missing hotel in future segments
    segItems.forEach(({ segment: seg }) => {
      if (!seg.end_date || seg.end_date < today) return;
      if (seg.missing_hotel) result.push({
        id: `auto-hotel-${seg.id}`, title: `Book hotel · ${seg.location}`,
        category: "book", assignee: identity || "peter", priority: 1, deadline: seg.start_date,
      });
    });

    // Priority 2: missing transport to next future segment
    segItems.forEach(({ segment: seg }) => {
      const nextStart = seg.display_end_date || seg.end_date;
      if (!nextStart || nextStart < today) return;
      if (seg.missing_transport_next) result.push({
        id: `auto-transport-${seg.id}`, title: `Book transport from ${seg.location}`,
        category: "book", assignee: identity || "peter", priority: 2,
      });
    });

    // Priority 3: missing QR for identity on future bookings (still client-side, identity-dependent)
    if (identity) {
      bookings.filter(b => PASS_TYPES.includes(b.type) && b.date >= today).forEach(b => {
        if (getBookingPasses(b).filter(p => p.who === identity).length === 0)
          result.push({ id: `auto-qr-${b.id}`, title: `Upload QR · ${b.name}`, category: "tech", assignee: identity, priority: 3 });
      });
    }

    return result.sort((a, b) => a.priority - b.priority || ((a.deadline || "z") < (b.deadline || "z") ? -1 : 1));
  })();

  const showDateEnd = form.type === "hotel" || form.type === "activity" || form.type === "ticket";

  // ── Render ────────────────────────────────────────────────────────────────
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
                  <button className="btn" onClick={() => setShowUnlock(true)} title="Unlock" style={{ background: "transparent", color: "var(--text-tiny)", fontSize: 14, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 5 }}>🔒</button>
                )}
                <button className="btn" onClick={() => setShowIdentityPicker(true)}
                  style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 9px", fontSize: 11, fontFamily: "'Source Code Pro', monospace", color: identity ? "var(--text-muted)" : "var(--text-tiny)", letterSpacing: "0.05em" }}>
                  {identity === "peter" ? "P" : identity === "friend" ? (FRIEND_NAME[0] || "F").toUpperCase() : "?"}
                </button>
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

          {/* Add / Edit Form */}
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
              {form.type === "city_transport" && (
                <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>mode</span>
                  {CITY_SUBTYPES.map(s => (
                    <button key={s.id} className="btn" onClick={() => setForm(f => ({ ...f, subtype: f.subtype === s.id ? "" : s.id }))}
                      style={{ padding: "5px 10px", borderRadius: 5, border: `1.5px solid ${form.subtype === s.id ? "#06b6d4" : "var(--border)"}`, background: form.subtype === s.id ? "#06b6d420" : "transparent", color: form.subtype === s.id ? "#06b6d4" : "var(--text-faint)", fontSize: 12, fontFamily: "'Source Code Pro', monospace" }}>
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>
              )}
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
                <input placeholder={form.type === "flight" || form.type === "train" ? "To (city or airport)" : form.type === "city_transport" ? "To (optional)" : "Location"} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={inp} />
                <input placeholder="Platform (e.g. Booking.com)" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} style={inp} />
                {(form.type === "flight" || form.type === "train" || form.type === "city_transport") && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <input placeholder={form.type === "flight" ? "From (e.g. Copenhagen, PEK)" : form.type === "train" ? "From (e.g. Beijing)" : "From (optional)"} value={form.origin} onChange={e => setForm(f => ({ ...f, origin: e.target.value }))} style={inp} />
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                    {form.type === "hotel" ? "Check-in time" : (form.type === "flight" || form.type === "train" || form.type === "city_transport") ? "Departs" : "Starts"}
                  </div>
                  <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} style={inp} />
                </div>
                {form.type !== "food" && form.type !== "shopping" && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                      {form.type === "hotel" ? "Check-out time" : (form.type === "flight" || form.type === "train" || form.type === "city_transport") ? "Arrives" : "Ends"}
                    </div>
                    <input type="time" value={form.time_end} onChange={e => setForm(f => ({ ...f, time_end: e.target.value }))} style={inp} />
                  </div>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <input placeholder="Reference / confirmation #" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} style={inp} />
                </div>
                {detailFieldsForType(form.type).length > 0 && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Extras (shown as highlights)</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {detailFieldsForType(form.type).map(k => (
                        <input key={k} placeholder={detailLabel(k)} value={form[`detail_${k}`]}
                          onChange={e => setForm(f => ({ ...f, [`detail_${k}`]: e.target.value }))}
                          style={{ ...inp, flex: "1 1 110px" }} />
                      ))}
                    </div>
                  </div>
                )}
                {form.type !== "activity" && (
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>Travelers</span>
                    {["peter", "friend", "both"].map(v => (
                      <button key={v} className="btn" onClick={() => setForm(f => ({ ...f, travelers: v }))}
                        style={{ padding: "5px 12px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${form.travelers === v ? "var(--text)" : "var(--border)"}`, background: form.travelers === v ? "var(--border)" : "transparent", color: form.travelers === v ? "var(--text)" : "var(--text-faint)" }}>{v === "friend" ? FRIEND_NAME : v}</button>
                    ))}
                    <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 8 }}>Paid by</span>
                    {[{ v: "peter", label: "peter" }, { v: "friend", label: FRIEND_NAME }, { v: "", label: "⏳ unpaid" }].map(({ v, label }) => (
                      <button key={label} className="btn" onClick={() => setForm(f => ({ ...f, paid_by: v }))}
                        style={{ padding: "5px 12px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${form.paid_by === v ? (v ? "#10b981" : "#f59e0b") : "var(--border)"}`, background: form.paid_by === v ? (v ? "#10b98120" : "#f59e0b20") : "transparent", color: form.paid_by === v ? (v ? "#10b981" : "#f59e0b") : "var(--text-faint)" }}>{label}</button>
                    ))}
                  </div>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <textarea placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>
              </div>
              {!editId && (
                <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 12, marginTop: 4 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.reminder} onChange={e => setForm(f => ({ ...f, reminder: e.target.checked }))}
                      style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>📋 create a reminder todo</span>
                  </label>
                  {form.reminder && (
                    <div style={{ marginTop: 10, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {[{ id: "buy", label: "buy online" }, { id: "book", label: "book in person" }, { id: "prepare", label: "prepare & pack" }].map(rt => (
                          <button key={rt.id} className="btn" onClick={() => setForm(f => ({ ...f, reminderType: rt.id }))}
                            style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${form.reminderType === rt.id ? "var(--accent)" : "var(--border)"}`, background: form.reminderType === rt.id ? "var(--accent)20" : "transparent", color: form.reminderType === rt.id ? "var(--accent)" : "var(--text-faint)" }}>
                            {rt.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[{ v: "me", label: `just ${identity || "me"}` }, { v: "both", label: "both of us" }].map(({ v, label }) => (
                          <button key={v} className="btn" onClick={() => setForm(f => ({ ...f, reminderAssignee: v }))}
                            style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${form.reminderAssignee === v ? "var(--accent)" : "var(--border)"}`, background: form.reminderAssignee === v ? "var(--accent)20" : "transparent", color: form.reminderAssignee === v ? "var(--accent)" : "var(--text-faint)" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn" onClick={handleCancel} style={{ ...btnStyle, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Cancel</button>
                <button className="btn" onClick={handleSubmit} disabled={saving || (!form.name && form.type !== "flight" && form.type !== "train")}
                  style={{ ...btnStyle, background: "var(--accent)", color: "#fff", opacity: saving ? 0.5 : 1 }}>
                  {saving ? "Saving..." : editId ? "Save changes" : "Add booking"}
                </button>
              </div>
            </div>
          )}

          {offline && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", marginBottom: 20, fontFamily: "'Source Code Pro', monospace", fontSize: 12, color: "var(--text-muted)" }}>
              📡 Offline — showing cached data{cachedAt ? ` from ${new Date(cachedAt).toLocaleString()}` : ""}
            </div>
          )}
          {error && (
            <div style={{ background: "var(--surface)", border: "1px solid #7f1d1d", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontFamily: "'Source Code Pro', monospace", fontSize: 12, color: "var(--text-error)" }}>✗ {error}</div>
          )}

          {/* ── EXPENSES TAB ── */}
          {activeTab === "expenses" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
                <button className="btn" onClick={() => { setSummaryMode("expenses"); setShowSummary(true); }}
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontFamily: "'Source Code Pro', monospace", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                  ¥ expenses
                </button>
                <button className="btn" onClick={() => { setSummaryMode("settlement"); setShowSummary(true); }}
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontFamily: "'Source Code Pro', monospace", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                  ⇌ settlement
                </button>
              </div>

              {bookings.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button className="btn" onClick={() => setShowFilters(v => !v)} style={{ background: "transparent", border: "none", padding: 0, display: "flex", alignItems: "center", gap: 5, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      <span style={{ fontSize: 9, lineHeight: 1 }}>{showFilters ? "▾" : "▸"}</span> filters
                    </button>
                  </div>
                  {showFilters && (
                    <>
                      {[
                        { label: "for",    active: filterTravelers, setActive: setFilterTravelers, opts: [["all","all"],["both","both"],["peter","peter"],["friend", FRIEND_NAME]], colorFn: () => "var(--text)" },
                        { label: "paid",   active: filterPaidBy,    setActive: setFilterPaidBy,    opts: [["all","all"],["peter","peter"],["friend", FRIEND_NAME],["pending","⏳ unpaid"]], colorFn: v => v === "pending" ? "#f59e0b" : "#10b981" },
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
                    const subtypeInfo = b.type === "city_transport" ? CITY_SUBTYPES.find(s => s.id === parseSubtype(b.notes).subtype) : null;
                    return (
                      <div key={b.id} className="card" style={{ background: "var(--surface)", borderRadius: 8, padding: "14px 16px", borderLeft: `3px solid ${b.paid_by ? t.color : "var(--text-tiny)"}`, position: "relative", opacity: b.paid_by ? 1 : 0.75 }}>
                        {canWrite && (
                          <div className="card-actions" style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8, opacity: 0, transition: "opacity 0.15s" }}>
                            {b.paid_by && (b.travelers === "both" || !b.travelers) && (
                              <button className="btn" onClick={() => handleSettle(b.id, b.settled)}
                                style={{ background: "transparent", color: b.settled ? "var(--text-faint)" : "#10b981", fontSize: 11, padding: "2px 6px", fontFamily: "'Source Code Pro', monospace", border: `1px solid ${b.settled ? "#64748b40" : "#10b98140"}`, borderRadius: 4 }}>{b.settled ? "unsettle ↩" : "settle ✓"}</button>
                            )}
                            {PASS_TYPES.includes(b.type) && (() => {
                              const myPasses = getBookingPasses(b).filter(p => p.who === (identity || "peter"));
                              const hasPasses = getBookingPasses(b).length > 0;
                              return (
                                <button className="btn" onClick={() => handlePassOpen(b)}
                                  style={{ background: "transparent", fontSize: 14, padding: "0 2px", border: "none", opacity: myPasses.length > 0 ? 0.9 : hasPasses ? 0.4 : 0.25, lineHeight: 1 }}>🎫</button>
                              );
                            })()}
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
                        {!canWrite && PASS_TYPES.includes(b.type) && identity && getBookingPasses(b).filter(p => p.who === identity).length > 0 && (
                          <button className="btn" onClick={() => handlePassOpen(b)}
                            style={{ position: "absolute", top: 12, right: 12, background: "transparent", fontSize: 14, padding: "2px 4px", border: "none", lineHeight: 1 }}>🎫</button>
                        )}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap", paddingRight: 60 }}>
                          <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: t.color, background: `${t.color}18`, padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{t.icon} {t.label}</span>
                          {subtypeInfo && <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: "#06b6d4", background: "#06b6d418", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{subtypeInfo.icon} {subtypeInfo.label}</span>}
                          {!b.paid_by && b.type !== "activity" && <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: "#f59e0b", background: "#f59e0b18", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>⏳ pending</span>}
                          {b.settled && <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: "#10b981", background: "#10b98118", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>✓ settled</span>}
                          {todos.some(t => t.booking_id === b.id && !t.done) && <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: "var(--accent)", background: "var(--accent)18", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>📋 todo</span>}
                          <span style={{ fontSize: 14.5, color: "var(--text)", fontFamily: "'Georgia', serif", lineHeight: 1.4 }}>{b.name}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginTop: 10 }}>
                          {b.date && <Meta label="date" value={b.date_end ? `${b.date} → ${b.date_end}` : b.date} />}
                          {(b.type === "flight" || b.type === "train" || b.type === "city_transport") && b.origin && <Meta label="from" value={b.origin} />}
                          {b.time && <Meta label="time" value={b.time + (b.time_end ? ` → ${b.time_end}` : "")} />}
                          {b.location && <Meta label="loc" value={b.location} />}
                          {b.price && <Meta label="price" value={fmt(b.price, b.currency)} highlight />}
                          {b.platform && <Meta label="via" value={b.platform} />}
                          {b.reference && <Meta label="ref" value={b.reference} mono />}
                          {b.type !== "activity" && <Meta label="travelers" value={b.travelers === "friend" ? FRIEND_NAME : b.travelers || "both"} />}
                          {b.type !== "activity" && (b.paid_by ? <Meta label="paid by" value={b.paid_by === "friend" ? FRIEND_NAME : b.paid_by} /> : <Meta label="paid by" value="—" />)}
                        </div>
                        {(() => { const n = b.type === "city_transport" ? parseSubtype(b.notes).cleanNotes : b.notes; return n ? <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-faint)", fontStyle: "italic", lineHeight: 1.5 }}>{n}</div> : null; })()}
                        <DetailPills booking={b} onOpenModal={() => setDetailsModal(b)} />
                        {b.map_query && (
                          <div style={{ marginTop: 8 }}>
                            <CopyButton text={b.map_query} onCopy={ok => showToast(ok ? "Address copied" : "Copy failed", ok)} />
                          </div>
                        )}
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

              {canWrite && (
                <div style={{ marginBottom: 18 }}>
                  {!showTodoForm ? (
                    <button className="btn" onClick={() => { setTodoForm({ ...EMPTY_TODO, assignee: identity || "peter" }); setShowTodoForm(true); }}
                      style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontFamily: "'Source Code Pro', monospace", color: "var(--text-faint)", letterSpacing: "0.05em" }}>
                      + add todo
                    </button>
                  ) : (
                    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
                      <input placeholder="What needs doing? *" value={todoForm.title}
                        onChange={e => setTodoForm(f => ({ ...f, title: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && handleAddTodo()}
                        autoFocus style={{ ...inp, marginBottom: 10 }} />
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                        {TODO_CATS.map(c => (
                          <button key={c.id} className="btn" onClick={() => setTodoForm(f => ({ ...f, category: c.id, segment_id: (c.id === "do" || c.id === "book") ? f.segment_id : null }))}
                            style={{ padding: "5px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${todoForm.category === c.id ? "var(--text)" : "var(--border)"}`, background: todoForm.category === c.id ? "var(--surface-hover)" : "transparent", color: todoForm.category === c.id ? "var(--text)" : "var(--text-faint)" }}>
                            {c.icon} {c.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: todoForm.assignee === "both" ? 6 : 12 }}>
                        <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>for</span>
                        {["peter", "friend", "both"].map(v => (
                          <button key={v} className="btn" onClick={() => setTodoForm(f => ({ ...f, assignee: v }))}
                            style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${todoForm.assignee === v ? "var(--text)" : "var(--border)"}`, background: todoForm.assignee === v ? "var(--surface-hover)" : "transparent", color: todoForm.assignee === v ? "var(--text)" : "var(--text-faint)" }}>
                            {v === "both" ? "both ×2" : v === "friend" ? FRIEND_NAME : v}
                          </button>
                        ))}
                      </div>
                      {todoForm.assignee === "both" && <div style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", marginBottom: 12, paddingLeft: 2 }}>creates one task per person</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>by</span>
                        <input type="date" value={todoForm.deadline || ""} onChange={e => setTodoForm(f => ({ ...f, deadline: e.target.value }))}
                          style={{ ...inp, flex: 1, fontSize: 12, colorScheme: "dark" }} />
                        {todoForm.deadline && <button className="btn" onClick={() => setTodoForm(f => ({ ...f, deadline: "" }))} style={{ background: "transparent", border: "none", color: "var(--text-tiny)", fontSize: 15, padding: "0 2px" }}>×</button>}
                      </div>
                      {(todoForm.category === "do" || todoForm.category === "book") && tripData?.timeline && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                          <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>in</span>
                          <select value={todoForm.segment_id || ""} onChange={e => setTodoForm(f => ({ ...f, segment_id: e.target.value || null }))}
                            style={{ ...inp, flex: 1, fontSize: 12 }}>
                            <option value="">anywhere</option>
                            {tripData.timeline.filter(i => i.kind === "segment").map(({ segment: s }) => (
                              <option key={s.id} value={s.id}>{s.location}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button className="btn" onClick={() => { setShowTodoForm(false); setTodoForm({ ...EMPTY_TODO, assignee: identity || "peter" }); }}
                          style={{ ...btnStyle, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Cancel</button>
                        <button className="btn" onClick={handleAddTodo} disabled={!todoForm.title.trim()}
                          style={{ ...btnStyle, background: "var(--accent)", color: "#fff", opacity: !todoForm.title.trim() ? 0.5 : 1 }}>Add</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                  {!identity && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 28 }}>for</span>
                      {["all", "peter", "friend"].map(v => (
                        <button key={v} className="btn" onClick={() => setTodoFilterAssignee(v)}
                          style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1px solid ${todoFilterAssignee === v ? "var(--text)" : "var(--border)"}`, background: todoFilterAssignee === v ? "var(--surface-hover)" : "transparent", color: todoFilterAssignee === v ? "var(--text)" : "var(--text-faint)" }}>
                          {v === "friend" ? FRIEND_NAME : v}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(() => {
                const filteredTodos = todos
                  .filter(t => identity ? t.assignee === identity : (todoFilterAssignee === "all" || t.assignee === todoFilterAssignee))
                  .filter(t => todoFilterCat === "all" || t.category === todoFilterCat);
                const filtAutoTodos = autoTodos
                  .filter(t => todoFilterCat === "all" || t.category === todoFilterCat)
                  .filter(t => identity ? t.assignee === identity : (todoFilterAssignee === "all" || t.assignee === todoFilterAssignee || t.assignee === "both"));

                if (todos.length === 0 && filtAutoTodos.length === 0) return (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "var(--border)", fontFamily: "'Source Code Pro', monospace", fontSize: 12, letterSpacing: "0.1em" }}>NO TODOS YET</div>
                );
                const catsToShow = todoFilterCat === "all"
                  ? TODO_CATS.filter(c => filteredTodos.some(t => t.category === c.id))
                  : TODO_CATS.filter(c => c.id === todoFilterCat);
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {catsToShow.map(cat => {
                      const catTodos = filteredTodos.filter(t => t.category === cat.id);
                      if (!catTodos.length) return null;
                      const pending = catTodos.filter(t => !t.done).sort((a, b) => {
                        if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
                        if (a.deadline) return -1; if (b.deadline) return 1; return 0;
                      });
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
                              editingTodo?.id === todo.id ? (
                                <div key={todo.id} style={{ background: "var(--surface2)", borderRadius: 7, padding: "12px 14px", border: "1px solid var(--border)" }}>
                                  <input value={editingTodo.title} onChange={e => setEditingTodo(t => ({ ...t, title: e.target.value }))}
                                    onKeyDown={e => { if (e.key === "Enter") handleSaveEditTodo(); if (e.key === "Escape") setEditingTodo(null); }}
                                    autoFocus style={{ ...inp, marginBottom: 10, fontSize: 13 }} />
                                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 9 }}>
                                    {TODO_CATS.map(c => (
                                      <button key={c.id} className="btn" onClick={() => setEditingTodo(t => ({ ...t, category: c.id }))}
                                        style={{ padding: "4px 9px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${editingTodo.category === c.id ? "var(--text)" : "var(--border)"}`, background: editingTodo.category === c.id ? "var(--surface-hover)" : "transparent", color: editingTodo.category === c.id ? "var(--text)" : "var(--text-faint)" }}>
                                        {c.icon} {c.label}
                                      </button>
                                    ))}
                                  </div>
                                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                                    <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>for</span>
                                    {["peter", "friend"].map(v => (
                                      <button key={v} className="btn" onClick={() => setEditingTodo(t => ({ ...t, assignee: v }))}
                                        style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace", border: `1.5px solid ${editingTodo.assignee === v ? "var(--text)" : "var(--border)"}`, background: editingTodo.assignee === v ? "var(--surface-hover)" : "transparent", color: editingTodo.assignee === v ? "var(--text)" : "var(--text-faint)" }}>
                                        {v === "friend" ? FRIEND_NAME : v}
                                      </button>
                                    ))}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                    <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>by</span>
                                    <input type="date" value={editingTodo.deadline || ""} onChange={e => setEditingTodo(t => ({ ...t, deadline: e.target.value }))}
                                      style={{ ...inp, flex: 1, fontSize: 12, colorScheme: "dark" }} />
                                    {editingTodo.deadline && <button className="btn" onClick={() => setEditingTodo(t => ({ ...t, deadline: "" }))} style={{ background: "transparent", border: "none", color: "var(--text-tiny)", fontSize: 15, padding: "0 2px" }}>×</button>}
                                  </div>
                                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                    <button className="btn" onClick={() => setEditingTodo(null)} style={{ ...btnStyle, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", fontSize: 11 }}>Cancel</button>
                                    <button className="btn" onClick={handleSaveEditTodo} disabled={!editingTodo.title.trim()} style={{ ...btnStyle, background: "var(--accent)", color: "#fff", opacity: !editingTodo.title.trim() ? 0.5 : 1, fontSize: 11 }}>Save</button>
                                  </div>
                                </div>
                              ) : (
                                <div key={todo.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", borderRadius: 7, padding: "10px 14px", opacity: todo.done ? 0.4 : 1 }}>
                                  <button className="btn" onClick={() => handleToggleTodo(todo)}
                                    style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${todo.done ? "#10b981" : "var(--border2)"}`, background: todo.done ? "#10b98120" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#10b981", padding: 0 }}>
                                    {todo.done ? "✓" : ""}
                                  </button>
                                  <span style={{ flex: 1, fontSize: 13.5, color: "var(--text)", fontFamily: "'Georgia', serif", textDecoration: todo.done ? "line-through" : "none", lineHeight: 1.4 }}>
                                    {todo.title}
                                    {todo.booking_id && (() => { const bk = bookings.find(b => b.id === todo.booking_id); return bk ? <span style={{ display: "block", fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", marginTop: 2 }}>↗ {bk.name}</span> : null; })()}
                                  </span>
                                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                                    {todo.deadline && !todo.done && (
                                      <span style={{ fontSize: 9, fontFamily: "'Source Code Pro', monospace", color: todo.deadline < today ? "#ef4444" : "var(--text-tiny)", background: todo.deadline < today ? "#ef444415" : "transparent", borderRadius: 3, padding: "1px 4px" }}>
                                        {todo.deadline < today ? "overdue" : fmtDateShort(todo.deadline)}
                                      </span>
                                    )}
                                    {todo.assignee !== "both" && <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>{todo.assignee === "friend" ? FRIEND_NAME : todo.assignee}</span>}
                                    {canWrite && (
                                      <>
                                        <button className="btn" onClick={() => setEditingTodo({ ...todo })} style={{ background: "transparent", color: "var(--text-tiny)", fontSize: 13, lineHeight: 1, padding: "0 2px", border: "none", opacity: 0.5 }}>✎</button>
                                        <button className="btn" onClick={() => handleDeleteTodo(todo.id)} style={{ background: "transparent", color: "var(--text-tiny)", fontSize: 16, lineHeight: 1, padding: "0 2px", border: "none", opacity: 0.5 }}>×</button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {filtAutoTodos.length > 0 && (
                      <div style={{ marginTop: filteredTodos.length > 0 ? 4 : 0 }}>
                        <div style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, paddingTop: 16, borderTop: filteredTodos.length > 0 ? "1px solid var(--border)" : "none" }}>suggested</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {filtAutoTodos.map(t => (
                            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", borderRadius: 7, padding: "9px 14px", border: "1px dashed var(--border)", opacity: 0.65 }}>
                              <span style={{ fontSize: 13, flexShrink: 0 }}>{TODO_CATS.find(c => c.id === t.category)?.icon}</span>
                              <span style={{ flex: 1, fontSize: 13, color: "var(--text-faint)", fontFamily: "'Georgia', serif", lineHeight: 1.4 }}>{t.title}</span>
                              {t.deadline && (
                                <span style={{ fontSize: 9, fontFamily: "'Source Code Pro', monospace", color: t.deadline < today ? "#ef4444" : "var(--text-tiny)", background: t.deadline < today ? "#ef444415" : "transparent", borderRadius: 3, padding: "1px 4px", flexShrink: 0 }}>
                                  {t.deadline < today ? "overdue" : fmtDateShort(t.deadline)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── TRIP TAB ── */}
          {activeTab === "trip" && (
            <div style={{ position: "relative" }}>
              <button onClick={() => todayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                style={{ position: "fixed", bottom: 28, right: 20, zIndex: 200, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 20, padding: "8px 16px", fontFamily: "'Source Code Pro', monospace", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", boxShadow: "0 2px 12px rgba(14,165,233,0.45)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block", flexShrink: 0 }} /> today
              </button>

              {!tripData ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--border)", fontFamily: "'Source Code Pro', monospace", fontSize: 12 }}>LOADING...</div>
              ) : tripData.timeline.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--border)", fontFamily: "'Source Code Pro', monospace", fontSize: 12, letterSpacing: "0.1em" }}>NO BOOKINGS YET</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {tripData.timeline.map((item, timelineIdx) => {
                    if (item.kind === "transit") {
                      const b = item.booking;
                      const t = TYPES.find(tt => tt.id === b.type) || TYPES[0];
                      const isPastTransit = (b.date || "") < today;
                      const isExpanded = expandedCards[b.id];
                      const hasDetails = b.reference || b.platform || b.notes || b.price || b.time || b.origin || b.details;
                      const myPasses = getBookingPasses(b).filter(p => p.who === identity);
                      const hasPasses = getBookingPasses(b).length > 0;
                      const showPassBtn = PASS_TYPES.includes(b.type) && (canWrite || (identity && myPasses.length > 0) || (!identity && hasPasses));
                      return (
                        <div key={`transit-${b.id}`} style={{ marginBottom: 20, opacity: isPastTransit ? 0.45 : 1 }}>
                          <div className="trip-card" onClick={() => hasDetails && setExpandedCards(p => ({ ...p, [b.id]: !p[b.id] }))}
                            style={{ background: "var(--surface)", borderRadius: 7, padding: "10px 14px", borderLeft: `3px solid ${t.color}`, cursor: hasDetails ? "pointer" : "default" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: 14 }}>{t.icon}</span>
                                <span style={{ fontSize: 13.5, color: "var(--text)", fontFamily: "'Georgia', serif", lineHeight: 1.3 }}>{b.name}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                <span style={{ fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", whiteSpace: "nowrap" }}>{fmtDateShort(b.date)}</span>
                                {showPassBtn && (
                                  <button className="btn" onClick={e => { e.stopPropagation(); handlePassOpen(b); }}
                                    style={{ background: "transparent", fontSize: 14, padding: "0 2px", border: "none", opacity: myPasses.length > 0 ? 1 : hasPasses ? 0.4 : 0.25, lineHeight: 1 }}>🎫</button>
                                )}
                                {hasDetails && <span style={{ fontSize: 9, color: "var(--text-tiny)" }}>{isExpanded ? "▲" : "▼"}</span>}
                              </div>
                            </div>
                            {isExpanded && (
                              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
                                {b.time && <div style={{ display: "flex", gap: 6 }}><span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>dep</span><span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{b.time}{b.time_end ? ` → ${b.time_end}` : ""}</span></div>}
                                {b.price && <div style={{ display: "flex", gap: 6 }}><span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>cost</span><span style={{ fontSize: 12, color: "#10b981", fontFamily: "'Source Code Pro', monospace" }}>{fmt(b.price, b.currency)}</span></div>}
                                {b.reference && <div style={{ display: "flex", gap: 6 }}><span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>ref</span><span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{b.reference}</span></div>}
                                {b.platform && <div style={{ display: "flex", gap: 6 }}><span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>via</span><span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{b.platform}</span></div>}
                                {b.notes && <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic", lineHeight: 1.5 }}>{b.notes}</div>}
                                <DetailPills booking={b} onOpenModal={() => setDetailsModal(b)} />
                                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                                  <a href={mapsLink(b)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px" }} onClick={e => openMapsLink(e, b)}>📍 maps</a>
                                  <CopyButton text={b.map_query} onCopy={ok => showToast(ok ? "Address copied" : "Copy failed", ok)} />
                                  {platformLink(b) && <a href={platformLink(b)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px" }} onClick={e => e.stopPropagation()}>↗ {b.platform}</a>}
                                  {canWrite && PASS_TYPES.includes(b.type) && (
                                    <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                                      {["peter", "friend"].filter(who => b.travelers === "both" || b.travelers === who).map(who => {
                                        const wPasses = getBookingPasses(b).filter(p => p.who === who);
                                        const initial = (who === "friend" ? FRIEND_NAME : who)[0]?.toUpperCase();
                                        return (
                                          <button key={who} className="btn" onClick={e => { e.stopPropagation(); handlePassOpen(b, who); }}
                                            style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", padding: "3px 9px", borderRadius: 4, border: `1px solid ${wPasses.length > 0 ? "var(--accent)" : "var(--border)"}`, background: "transparent", color: wPasses.length > 0 ? "var(--accent)" : "var(--text-tiny)" }}>
                                            {wPasses.length > 0 ? `🎫 ${initial}${wPasses.length > 1 ? ` ×${wPasses.length}` : ""}` : `+ ${initial}`}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: "center", marginTop: 10, color: "var(--border)", fontSize: 10, lineHeight: 1 }}>▼</div>
                        </div>
                      );
                    }

                    // Segment item
                    const { segment } = item;
                    const isPast     = segment.is_past;
                    const isActive   = segment.is_active;
                    const isCollapsed = collapsedGroups[segment.id];
                    const vibeImg    = locationImages[segment.location];
                    const segExp     = summaryData?.by_segment?.[segment.id];

                    return (
                      <div key={segment.id} style={{ marginBottom: 28, opacity: isPast ? 0.45 : 1, background: "var(--surface2)", border: `2px solid ${isActive ? "rgba(14,165,233,0.35)" : "var(--border2)"}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}>
                        {/* Segment header */}
                        <div onClick={() => setCollapsedGroups(p => ({ ...p, [segment.id]: !p[segment.id] }))}
                          style={{ position: "relative", overflow: "hidden", cursor: "pointer", minHeight: 88, borderBottom: isCollapsed ? "none" : "1px solid var(--border)" }}>
                          {vibeImg && <div className="hero-img" style={{ position: "absolute", inset: 0, backgroundImage: `url(${vibeImg})`, backgroundSize: "cover", backgroundPosition: "center" }} />}
                          <div style={{ position: "absolute", inset: 0, background: "var(--hero-overlay)" }} />
                          <div style={{ position: "relative", padding: "16px 18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                              {isActive && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, display: "inline-block", marginTop: 5, boxShadow: "0 0 8px #0ea5e9" }} />}
                              <div>
                                <div style={{ display: "inline-flex", alignItems: "center", background: "rgba(14,165,233,0.12)", border: "1px solid rgba(14,165,233,0.22)", borderRadius: 4, padding: "1px 8px", marginBottom: 7 }}>
                                  <span style={{ fontSize: 9, fontFamily: "'Source Code Pro', monospace", color: "var(--accent)", letterSpacing: "0.15em", textTransform: "uppercase" }}>stop</span>
                                </div>
                                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em", lineHeight: 1.2 }}>{segment.location}</div>
                                <div style={{ fontSize: 11, color: isActive ? "var(--accent)" : "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", marginTop: 4, letterSpacing: "0.04em" }}>
                                  {fmtDateShort(segment.start_date)}{segment.start_date !== segment.display_end_date ? ` – ${fmtDateShort(segment.display_end_date)}` : ""}
                                  {isActive && " · now"}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginTop: 2 }}>
                              <button className="btn"
                                onClick={e => { e.stopPropagation(); setSegmentExpenseOpen(prev => prev === segment.id ? null : segment.id); }}
                                style={{ background: segmentExpenseOpen === segment.id ? "rgba(14,165,233,0.15)" : "rgba(255,255,255,0.06)", border: `1px solid ${segmentExpenseOpen === segment.id ? "rgba(14,165,233,0.3)" : "var(--border)"}`, borderRadius: 5, color: segmentExpenseOpen === segment.id ? "var(--accent)" : "var(--text-tiny)", fontSize: 10, fontFamily: "'Source Code Pro', monospace", padding: "2px 8px", letterSpacing: "0.06em", lineHeight: 1.6 }}>¥ costs</button>
                              <span style={{ fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>{isCollapsed ? "▸" : "▾"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Segment expense panel — data comes from /api/summary */}
                        {segmentExpenseOpen === segment.id && (
                          <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px 14px", background: "rgba(14,165,233,0.04)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                              <div style={{ fontSize: 9, fontFamily: "'Source Code Pro', monospace", color: "var(--accent)", letterSpacing: "0.15em", textTransform: "uppercase" }}>costs · {segment.location}</div>
                              <button className="btn" onClick={fetchSummary} disabled={summaryLoading}
                                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-tiny)", fontSize: 9, fontFamily: "'Source Code Pro', monospace", padding: "1px 7px" }}>
                                {summaryLoading ? "…" : "↻ rates"}
                              </button>
                            </div>
                            {!segExp ? (
                              <div style={{ fontSize: 12, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>
                                {summaryLoading ? "loading…" : summaryData ? "no expenses yet" : "loading rates…"}
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                {TYPES.filter(t => EXPENSE_TYPES.includes(t.id) && segExp.by_type?.[t.id]).map(t => (
                                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                      <span style={{ fontSize: 11 }}>{t.icon}</span>
                                      <span style={{ fontSize: 10, color: t.color, fontFamily: "'Source Code Pro', monospace", letterSpacing: "0.05em" }}>{t.label}</span>
                                    </div>
                                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>
                                      {segExp.by_type[t.id].approx ? "~" : "≈"}{Math.round(segExp.by_type[t.id].total_dkk)} DKK
                                    </span>
                                  </div>
                                ))}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0 0", marginTop: 4, borderTop: "1px solid var(--border)" }}>
                                  <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>total</span>
                                  <span style={{ fontSize: 13, color: "#10b981", fontFamily: "'Source Code Pro', monospace", fontWeight: 600 }}>
                                    {segExp.approx ? "~" : "≈"}{Math.round(segExp.total_dkk)} DKK
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {!isCollapsed && (
                          <div style={{ position: "relative", padding: "14px 14px 14px 34px", display: "flex", flexDirection: "column", gap: 0 }}>
                            <div style={{ position: "absolute", left: 16, top: 10, bottom: 10, width: 2, background: "var(--border)", borderRadius: 1 }} />

                            {/* Hotel banner */}
                            {segment.hotel && (
                              <div style={{ background: "var(--hotel-bg)", border: "1px solid var(--hotel-border)", borderRadius: 8, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 13 }}>🏨</span>
                                  <span style={{ fontSize: 13, color: "var(--hotel-text)", fontFamily: "'Georgia', serif" }}>{segment.hotel.name}</span>
                                </div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  {segment.hotel.date_end && (
                                    <span style={{ fontSize: 10, color: "var(--hotel-text)", fontFamily: "'Source Code Pro', monospace" }}>
                                      {fmtDateShort(segment.hotel.date)} → {fmtDateShort(segment.hotel.date_end)}
                                    </span>
                                  )}
                                  {(segment.hotel.time || segment.hotel.time_end) && (
                                    <span style={{ fontSize: 10, color: "var(--hotel-text)", fontFamily: "'Source Code Pro', monospace", opacity: 0.75 }}>
                                      {segment.hotel.time && `in ${segment.hotel.time}`}{segment.hotel.time && segment.hotel.time_end && " · "}{segment.hotel.time_end && `out ${segment.hotel.time_end}`}
                                    </span>
                                  )}
                                  <a href={mapsLink(segment.hotel)} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px" }}
                                    onClick={e => openMapsLink(e, segment.hotel)}>map ↗</a>
                                  <CopyButton text={segment.hotel.map_query} onCopy={ok => showToast(ok ? "Address copied" : "Copy failed", ok)} style={{ fontSize: 10, padding: "2px 7px" }} />
                                  {segment.hotel.details && Object.values(segment.hotel.details).some(Boolean) && (
                                    <button className="btn" onClick={e => { e.stopPropagation(); setDetailsModal(segment.hotel); }}
                                      style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px", background: "transparent" }}>ⓘ</button>
                                  )}
                                  {platformLink(segment.hotel) && (
                                    <a href={platformLink(segment.hotel)} target="_blank" rel="noopener noreferrer"
                                      style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px" }}
                                      onClick={e => e.stopPropagation()}>booking ↗</a>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Days */}
                            {segment.days.map(day => {
                              const isToday = day.is_today;
                              // Apply identity filter to day bookings
                              const otherBks = day.other_bookings.filter(b => travelerMatch(b, identity));
                              const foodItems = day.food.items.filter(b => travelerMatch(b, identity));
                              const transitItems = day.city_transport.items.filter(b => travelerMatch(b, identity));
                              const isFoodExpanded    = expandedFoodDays[day.date];
                              const isTransitExpanded = expandedTransitDays[day.date];

                              // Re-compute per-currency summaries for identity-filtered items
                              function localSummary(items) {
                                const byCur = {};
                                items.forEach(b => { if (b.price && b.currency) byCur[b.currency] = (byCur[b.currency] || 0) + parseFloat(b.price); });
                                return Object.entries(byCur).sort(([a],[b]) => a < b ? -1 : 1).map(([c,v]) => `${Math.round(v)} ${c}`).join(" + ");
                              }

                              if (otherBks.length === 0 && foodItems.length === 0 && transitItems.length === 0 && !isToday) return null;

                              return (
                                <div key={day.date} ref={isToday ? todayRef : null} style={{ marginBottom: 12 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                    {isToday && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />}
                                    <span style={{ fontSize: 11, fontFamily: "'Source Code Pro', monospace", color: isToday ? "var(--accent)" : "var(--text-tiny)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                                      {fmtDate(day.date)}{isToday ? " · today" : ""}
                                    </span>
                                  </div>
                                  {otherBks.length === 0 && foodItems.length === 0 && (
                                    <div style={{ fontSize: 11, color: "var(--border)", fontFamily: "'Source Code Pro', monospace", paddingLeft: 14 }}>—</div>
                                  )}
                                  {otherBks.map(b => {
                                    const t = TYPES.find(t => t.id === b.type) || TYPES[0];
                                    const isExpanded = expandedCards[b.id];
                                    const hasDetails = b.reference || b.platform || b.notes || b.price || b.time || b.origin || b.details;
                                    const myPasses = getBookingPasses(b).filter(p => p.who === identity);
                                    const hasPasses = getBookingPasses(b).length > 0;
                                    const showPassBtn = PASS_TYPES.includes(b.type) && (canWrite || (identity && myPasses.length > 0) || (!identity && hasPasses));
                                    const isTransport = b.type === "flight" || b.type === "train" || b.type === "city_transport";
                                    return (
                                      <div key={b.id} className="trip-card" onClick={() => hasDetails && setExpandedCards(p => ({ ...p, [b.id]: !p[b.id] }))}
                                        style={{ background: "var(--surface)", borderRadius: 7, padding: "10px 14px", marginBottom: 6, borderLeft: `3px solid ${t.color}`, cursor: hasDetails ? "pointer" : "default" }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 14 }}>{t.icon}</span>
                                            <span style={{ fontSize: 13.5, color: "var(--text)", fontFamily: "'Georgia', serif", lineHeight: 1.3 }}>{b.name}</span>
                                          </div>
                                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                            {b.price && b.type !== "activity" && <span style={{ fontSize: 11, color: "#10b981", fontFamily: "'Source Code Pro', monospace" }}>{fmt(b.price, b.currency)}</span>}
                                            {showPassBtn && (
                                              <button className="btn" onClick={e => { e.stopPropagation(); handlePassOpen(b); }}
                                                style={{ background: "transparent", fontSize: 14, padding: "0 2px", border: "none", opacity: myPasses.length > 0 ? 1 : hasPasses ? 0.4 : 0.25, lineHeight: 1 }}>🎫</button>
                                            )}
                                            {hasDetails && <span style={{ fontSize: 9, color: "var(--text-tiny)" }}>{isExpanded ? "▲" : "▼"}</span>}
                                          </div>
                                        </div>
                                        {isTransport && (b.origin || b.location || b.time) && (
                                          <div style={{ display: "flex", gap: 10, marginTop: 4, paddingLeft: 22, flexWrap: "wrap" }}>
                                            {(b.origin || b.location) && <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace" }}>{b.origin && b.location ? `${b.origin} → ${b.location}` : b.origin || b.location}</span>}
                                            {b.time && <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{b.time}{b.time_end ? ` → ${b.time_end}` : ""}</span>}
                                          </div>
                                        )}
                                        {!isTransport && b.time && <div style={{ paddingLeft: 22, marginTop: 3 }}><span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{b.time}{b.time_end ? ` – ${b.time_end}` : ""}</span></div>}
                                        {isExpanded && (
                                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
                                            {b.date_end && <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace" }}>until {fmtDate(b.date_end)}</div>}
                                            {b.reference && <div style={{ display: "flex", gap: 6 }}><span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>ref</span><span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{b.reference}</span></div>}
                                            {b.platform && <div style={{ display: "flex", gap: 6 }}><span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>via</span><span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{b.platform}</span></div>}
                                            {(() => { const n = b.type === "city_transport" ? parseSubtype(b.notes).cleanNotes : b.notes; return n ? <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic", lineHeight: 1.5 }}>{n}</div> : null; })()}
                                            <DetailPills booking={b} onOpenModal={() => setDetailsModal(b)} />
                                            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                                              <a href={mapsLink(b)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px" }} onClick={e => openMapsLink(e, b)}>📍 maps</a>
                                              <CopyButton text={b.map_query} onCopy={ok => showToast(ok ? "Address copied" : "Copy failed", ok)} />
                                              {platformLink(b) && <a href={platformLink(b)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px" }} onClick={e => e.stopPropagation()}>↗ {b.platform}</a>}
                                              {canWrite && PASS_TYPES.includes(b.type) && (
                                                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                                                  {["peter", "friend"].filter(who => b.travelers === "both" || b.travelers === who).map(who => {
                                                    const wPasses = getBookingPasses(b).filter(p => p.who === who);
                                                    const initial = (who === "friend" ? FRIEND_NAME : who)[0]?.toUpperCase();
                                                    return (
                                                      <button key={who} className="btn" onClick={e => { e.stopPropagation(); handlePassOpen(b, who); }}
                                                        style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", padding: "3px 9px", borderRadius: 4, border: `1px solid ${wPasses.length > 0 ? "var(--accent)" : "var(--border)"}`, background: "transparent", color: wPasses.length > 0 ? "var(--accent)" : "var(--text-tiny)" }}>
                                                        {wPasses.length > 0 ? `🎫 ${initial}${wPasses.length > 1 ? ` ×${wPasses.length}` : ""}` : `+ ${initial}`}
                                                      </button>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {/* Food one-liner */}
                                  {foodItems.length > 0 && (
                                    <div>
                                      <div className="trip-card" onClick={() => setExpandedFoodDays(p => ({ ...p, [day.date]: !p[day.date] }))}
                                        style={{ background: "var(--surface)", borderRadius: 7, padding: "8px 14px", marginBottom: isFoodExpanded ? 0 : 6, borderLeft: "3px solid #e879f9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ fontSize: 13 }}>🍜</span>
                                          <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{foodItems.length} {foodItems.length === 1 ? "meal" : "meals"}</span>
                                          {localSummary(foodItems) && <span style={{ fontSize: 12, color: "#10b981", fontFamily: "'Source Code Pro', monospace" }}>· {localSummary(foodItems)}</span>}
                                        </div>
                                        <span style={{ fontSize: 9, color: "var(--text-tiny)" }}>{isFoodExpanded ? "▲" : "▼"}</span>
                                      </div>
                                      {isFoodExpanded && foodItems.map(b => (
                                        <div key={b.id} style={{ background: "var(--surface2)", borderRadius: "0 0 6px 6px", padding: "7px 14px 7px 40px", marginBottom: 2, borderLeft: "3px solid #e879f920", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                          <span style={{ fontSize: 12.5, color: "var(--text-muted)", fontFamily: "'Georgia', serif" }}>{b.name}</span>
                                          {b.price && <span style={{ fontSize: 11, color: "#10b981", fontFamily: "'Source Code Pro', monospace", flexShrink: 0 }}>{fmt(b.price, b.currency)}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* City transport one-liner */}
                                  {transitItems.length > 0 && (
                                    <div>
                                      <div className="trip-card" onClick={() => setExpandedTransitDays(p => ({ ...p, [day.date]: !p[day.date] }))}
                                        style={{ background: "var(--surface)", borderRadius: 7, padding: "8px 14px", marginBottom: isTransitExpanded ? 0 : 6, borderLeft: "3px solid #06b6d4", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ fontSize: 13 }}>🚇</span>
                                          <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{transitItems.length} {transitItems.length === 1 ? "ride" : "rides"}</span>
                                          {localSummary(transitItems) && <span style={{ fontSize: 12, color: "#10b981", fontFamily: "'Source Code Pro', monospace" }}>· {localSummary(transitItems)}</span>}
                                        </div>
                                        <span style={{ fontSize: 9, color: "var(--text-tiny)" }}>{isTransitExpanded ? "▲" : "▼"}</span>
                                      </div>
                                      {isTransitExpanded && transitItems.map(b => {
                                        const { subtype, cleanNotes } = parseSubtype(b.notes);
                                        const subtypeInfo = CITY_SUBTYPES.find(s => s.id === subtype);
                                        const icon  = subtypeInfo?.icon || "🚇";
                                        const label = b.name || cleanNotes || subtypeInfo?.label || "Transit";
                                        return (
                                          <div key={b.id} style={{ background: "var(--surface2)", borderRadius: "0 0 6px 6px", padding: "7px 14px 7px 40px", marginBottom: 2, borderLeft: "3px solid #06b6d420", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                              <span style={{ fontSize: 12 }}>{icon}</span>
                                              <span style={{ fontSize: 12.5, color: "var(--text-muted)", fontFamily: "'Georgia', serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                                            </div>
                                            {b.price && <span style={{ fontSize: 11, color: "#10b981", fontFamily: "'Source Code Pro', monospace", flexShrink: 0 }}>{fmt(b.price, b.currency)}</span>}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Segment todos */}
                            {(() => {
                              const mySegTodos = segment.todos.filter(t => identity ? t.assignee === identity || t.assignee === "both" : true);
                              if (!mySegTodos.length) return null;
                              return (
                                <div style={{ marginTop: 10, borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
                                  <div style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>want to do</div>
                                  {mySegTodos.map(t => (
                                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, paddingLeft: 2 }}>
                                      <input type="checkbox" checked={t.done} onChange={() => handleToggleTodo(t)}
                                        style={{ accentColor: "var(--accent)", width: 14, height: 14, flexShrink: 0 }} />
                                      <span style={{ fontSize: 13, color: t.done ? "var(--text-tiny)" : "var(--text-muted)", fontFamily: "'Georgia', serif", textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── DETAILS MODAL ── */}
          {detailsModal && (
            <div onClick={() => setDetailsModal(null)}
              style={{ position: "fixed", inset: 0, zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)" }}>
              <div onClick={e => e.stopPropagation()}
                style={{ background: "var(--surface)", borderRadius: 14, padding: "24px 22px", maxWidth: 340, width: "90%", border: "1px solid var(--border)" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, marginBottom: 14, color: "var(--text)" }}>{detailsModal.name}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {Object.entries(detailsModal.details || {}).filter(([,v]) => v).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>{detailLabel(k)}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, color: "var(--text)", fontFamily: "'Source Code Pro', monospace" }}>{v}</span>
                        <CopyButton text={String(v)} onCopy={ok => showToast(ok ? "Copied" : "Copy failed", ok)} />
                      </span>
                    </div>
                  ))}
                  {detailsModal.map_query && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Address</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, color: "var(--text)", fontFamily: "'Georgia', serif", textAlign: "right" }}>{detailsModal.map_query}</span>
                        <CopyButton text={detailsModal.map_query} onCopy={ok => showToast(ok ? "Address copied" : "Copy failed", ok)} />
                      </span>
                    </div>
                  )}
                </div>
                <button className="btn" onClick={() => setDetailsModal(null)}
                  style={{ marginTop: 18, width: "100%", padding: "9px 0", borderRadius: 8, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontFamily: "'Source Code Pro', monospace", fontSize: 12 }}>Close</button>
              </div>
            </div>
          )}

          {/* ── IDENTITY PICKER ── */}
          {showIdentityPicker && (
            <div onClick={() => setShowIdentityPicker(false)}
              style={{ position: "fixed", inset: 0, zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)" }}>
              <div onClick={e => e.stopPropagation()}
                style={{ background: "var(--surface)", borderRadius: 14, padding: "32px 28px", maxWidth: 280, width: "90%", textAlign: "center", border: "1px solid var(--border)" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 21, marginBottom: 6, color: "var(--text)" }}>Who are you?</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", marginBottom: 26, letterSpacing: "0.04em" }}>
                  {identity ? "Tap to switch · saved to this device" : "Personalises your view · saved to this device"}
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  {["peter", "friend"].map(who => (
                    <button key={who} className="btn" onClick={() => handleIdentityPick(who)}
                      style={{ flex: 1, padding: "13px 0", borderRadius: 9, background: identity === who ? "var(--accent)" : "var(--surface2)", color: identity === who ? "#fff" : "var(--text)", border: `1.5px solid ${identity === who ? "var(--accent)" : "var(--border)"}`, fontFamily: "'Source Code Pro', monospace", fontSize: 13, textTransform: "capitalize" }}>
                      {who === "friend" ? FRIEND_NAME : who}
                    </button>
                  ))}
                </div>
                {identity && (
                  <button className="btn" onClick={handleIdentityReset}
                    style={{ marginTop: 20, background: "transparent", border: "none", fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", letterSpacing: "0.05em" }}>
                    clear identity
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── PASS VIEWER ── */}
          {passViewer && (() => {
            const passes = passViewer.passes || [];
            const idx = passViewer.idx ?? 0;
            const currentPass = passes[idx];
            const hasMultiple = passes.length > 1;
            return (
              <div onClick={() => setPassViewer(null)}
                style={{ position: "fixed", inset: 0, zIndex: 2000, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <canvas ref={passCanvasRef} onClick={e => e.stopPropagation()} style={{ maxWidth: "92%", maxHeight: "70vh", objectFit: "contain" }} />
                {hasMultiple && (
                  <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 18 }}>
                    <button className="btn" onClick={() => setPassViewer(prev => ({ ...prev, idx: Math.max(0, prev.idx - 1) }))} disabled={idx === 0}
                      style={{ background: "#00000010", border: "1px solid #00000018", borderRadius: 7, padding: "7px 16px", fontSize: 17, color: "#000", opacity: idx === 0 ? 0.25 : 1 }}>‹</button>
                    <span style={{ fontSize: 11, color: "#00000055", fontFamily: "'Source Code Pro', monospace" }}>{idx + 1} / {passes.length}</span>
                    <button className="btn" onClick={() => setPassViewer(prev => ({ ...prev, idx: Math.min(prev.passes.length - 1, prev.idx + 1) }))} disabled={idx === passes.length - 1}
                      style={{ background: "#00000010", border: "1px solid #00000018", borderRadius: 7, padding: "7px 16px", fontSize: 17, color: "#000", opacity: idx === passes.length - 1 ? 0.25 : 1 }}>›</button>
                  </div>
                )}
                <div style={{ position: "absolute", top: 16, right: 16 }}>
                  <button className="btn" onClick={() => setPassViewer(null)} style={{ background: "#00000015", color: "#000", border: "1px solid #00000020", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontFamily: "'Source Code Pro', monospace" }}>✕</button>
                </div>
                <div style={{ position: "absolute", bottom: 28, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, color: "#00000050", fontFamily: "'Source Code Pro', monospace" }}>
                    {passViewer.name}{hasMultiple ? ` · leg ${idx + 1}` : ""}
                    {currentPass?.who && ` · ${currentPass.who === "friend" ? FRIEND_NAME : currentPass.who}`}
                  </span>
                  {canWrite && currentPass && (
                    <button className="btn" onClick={e => { e.stopPropagation(); handlePassRemove(passViewer.id, currentPass); }}
                      style={{ background: "transparent", color: "#ef4444", fontSize: 11, fontFamily: "'Source Code Pro', monospace", padding: "3px 8px", border: "1px solid #ef444440", borderRadius: 4 }}>remove pass</button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── SUMMARY MODAL — data comes from /api/summary ── */}
          {showSummary && (
            <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
              onClick={e => { if (e.target === e.currentTarget) setShowSummary(false); }}>
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setShowSummary(false)} />
              <div style={{ position: "relative", background: "var(--surface)", borderRadius: "16px 16px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 680, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>{summaryMode === "settlement" ? "Settlement" : "Expenses"}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="btn" onClick={fetchSummary} disabled={summaryLoading}
                      style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-tiny)", fontSize: 10, fontFamily: "'Source Code Pro', monospace", padding: "2px 8px" }}>
                      {summaryLoading ? "…" : "↻ rates"}
                    </button>
                    <button className="btn" onClick={() => setShowSummary(false)} style={{ background: "transparent", border: "none", color: "var(--text-faint)", fontSize: 18, padding: "0 4px" }}>✕</button>
                  </div>
                </div>

                {summaryLoading && !summaryData ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", fontSize: 12 }}>loading…</div>
                ) : !summaryData ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-error)", fontFamily: "'Source Code Pro', monospace", fontSize: 12 }}>could not load summary</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                    {/* ── SETTLEMENT MODE ── */}
                    {summaryMode === "settlement" && (() => {
                      const { settlement } = summaryData;
                      const pfx = settlement.approx ? "~" : "≈";
                      const peterOwes  = settlement.peter_owes;
                      const friendOwes = settlement.friend_owes;
                      const debtLabel  = peterOwes
                        ? (identity === "peter" ? `You owe ${FRIEND_NAME}` : identity === "friend" ? "Peter owes you" : `Peter owes ${FRIEND_NAME}`)
                        : friendOwes
                        ? (identity === "peter" ? `${FRIEND_NAME} owes you` : identity === "friend" ? "You owe Peter" : `${FRIEND_NAME} owes Peter`)
                        : "All square";
                      const debtColor  = peterOwes
                        ? (identity === "peter" ? "#f97316" : "#10b981")
                        : friendOwes ? (identity === "peter" ? "#10b981" : "#f97316") : "#10b981";

                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          {/* Per-type settlement cards */}
                          {TYPES.filter(t => EXPENSE_TYPES.includes(t.id)).map(t => {
                            const ts = settlement.by_type?.[t.id];
                            if (!ts) return null;
                            const cardKey = `settle-${t.id}`;
                            const isExp = !!expandedSumCats[cardKey];
                            const outColor = ts.peter_owes
                              ? (identity === "peter" ? "#f97316" : "#10b981")
                              : ts.friend_owes ? (identity === "peter" ? "#10b981" : "#f97316") : "#10b981";
                            const listItems = ts.items.filter(b => summaryShowSettled || !b.settled);
                            return (
                              <div key={cardKey} style={{ background: "var(--surface2)", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
                                <div onClick={() => setExpandedSumCats(prev => ({ ...prev, [cardKey]: !prev[cardKey] }))}
                                  style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
                                    <span style={{ fontSize: 14 }}>{t.icon}</span>
                                    <span style={{ fontSize: 12, color: t.color, fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{t.label}</span>
                                    <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>{ts.items.length}</span>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                                      {(ts.peter_owes || ts.friend_owes) && (
                                        <span style={{ fontSize: 13, color: outColor, fontFamily: "'Source Code Pro', monospace" }}>
                                          {ts.approx ? "~" : "≈"}{Math.round(Math.abs(ts.outstanding_dkk))} DKK
                                        </span>
                                      )}
                                      {!ts.peter_owes && !ts.friend_owes && <span style={{ fontSize: 11, color: "#10b981", fontFamily: "'Source Code Pro', monospace" }}>square</span>}
                                      {Math.abs(ts.settled_dkk) > 0.5 && <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>+{Math.round(Math.abs(ts.settled_dkk))} ✓</span>}
                                    </div>
                                    <span style={{ fontSize: 10, color: "var(--text-tiny)", flexShrink: 0 }}>{isExp ? "▲" : "▼"}</span>
                                  </div>
                                </div>
                                {isExp && (
                                  <div style={{ borderTop: "1px solid var(--border)" }}>
                                    {listItems.length === 0
                                      ? <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>no unsettled items</div>
                                      : listItems.map((b, i) => {
                                          const friendPaid = b.paid_by === "friend";
                                          const rowColor = friendPaid ? "#f97316" : "#10b981";
                                          const itemDKK = summaryData.rates
                                            ? (b.currency === "DKK" ? parseFloat(b.price) : parseFloat(b.price) / (summaryData.rates[b.currency] || 1))
                                            : null;
                                          return (
                                            <div key={b.id} style={{ padding: "8px 16px", borderBottom: i < listItems.length - 1 ? "1px solid var(--border)" : "none", opacity: b.settled ? 0.45 : 1, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                  <span style={{ color: "var(--text-tiny)", marginRight: 5 }}>{b.date ? b.date.slice(5).replace("-", "/") : "—"}</span>
                                                  {b.name}
                                                  {b.settled && <span style={{ marginLeft: 5, color: "#10b981", fontSize: 10 }}>✓</span>}
                                                </div>
                                                <div style={{ fontSize: 10, color: rowColor, fontFamily: "'Source Code Pro', monospace", marginTop: 2 }}>{friendPaid ? `${FRIEND_NAME} paid` : "Peter paid"}</div>
                                              </div>
                                              <div style={{ textAlign: "right", flexShrink: 0 }}>
                                                <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace" }}>{parseFloat(b.price).toFixed(2)} {b.currency}</div>
                                                {itemDKK !== null && <div style={{ fontSize: 11, color: rowColor, fontFamily: "'Source Code Pro', monospace" }}>≈{Math.round(Math.abs(itemDKK / 2))} DKK</div>}
                                              </div>
                                            </div>
                                          );
                                        })
                                    }
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", paddingLeft: 2 }}>
                            <input type="checkbox" checked={summaryShowSettled} onChange={e => setSummaryShowSettled(e.target.checked)} style={{ accentColor: "#0ea5e9", width: 13, height: 13 }} />
                            <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>show settled</span>
                          </label>

                          {/* Net outstanding */}
                          {summaryData.rates && (
                            <div style={{ background: "var(--surface2)", borderRadius: 10, border: "1px solid var(--border2)", padding: 20 }}>
                              {Math.abs(settlement.net_settled_dkk) > 0.5 && (
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>settled</span>
                                  <span style={{ fontSize: 14, color: "#10b981", fontFamily: "'Source Code Pro', monospace" }}>{pfx}{Math.round(Math.abs(settlement.net_settled_dkk))} DKK ✓</span>
                                </div>
                              )}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>outstanding</span>
                                <span style={{ fontSize: 14, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{pfx}{Math.round(Math.abs(settlement.net_outstanding_dkk))} DKK</span>
                              </div>
                              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                                <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>net outstanding</div>
                                {!peterOwes && !friendOwes
                                  ? <div style={{ color: "#10b981", fontFamily: "'Source Code Pro', monospace", fontSize: 16 }}>All square ✓</div>
                                  : <>
                                      <div style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace", marginBottom: 8 }}>{debtLabel}</div>
                                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 38, color: debtColor, lineHeight: 1 }}>
                                        {pfx}{Math.round(Math.abs(settlement.net_outstanding_dkk))} <span style={{ fontSize: 17, color: "var(--text-faint)" }}>DKK</span>
                                      </div>
                                    </>
                                }
                              </div>
                            </div>
                          )}
                          {summaryData.rates_at && <div style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", paddingLeft: 2 }}>rates · {summaryData.rates_at}</div>}
                        </div>
                      );
                    })()}

                    {/* ── EXPENSE MODE ── */}
                    {summaryMode === "expenses" && (() => {
                      const { collective, peter: petSection, friend: friSection, per_person } = summaryData;

                      function renderCatCard(t, te, groupKey) {
                        if (!te || te.items.length === 0) return null;
                        const cardKey = `${groupKey}-${t.id}`;
                        const isExp = !!expandedSumCats[cardKey];
                        const sorted = [...te.items].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
                        return (
                          <div key={cardKey} style={{ background: "var(--surface2)", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
                            <div onClick={() => setExpandedSumCats(prev => ({ ...prev, [cardKey]: !prev[cardKey] }))}
                              style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
                                <span style={{ fontSize: 14 }}>{t.icon}</span>
                                <span style={{ fontSize: 12, color: t.color, fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{t.label}</span>
                                <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>{te.items.length}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {summaryLoading ? <span style={{ fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>…</span>
                                  : summaryData.rates ? <span style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{te.approx ? "~" : "≈"}{Math.round(te.total_dkk)} DKK</span>
                                  : null}
                                <span style={{ fontSize: 10, color: "var(--text-tiny)", flexShrink: 0 }}>{isExp ? "▲" : "▼"}</span>
                              </div>
                            </div>
                            {isExp && (
                              <div style={{ borderTop: "1px solid var(--border)" }}>
                                {sorted.map((b, i) => {
                                  const dkk = summaryData.rates && b.currency !== "DKK"
                                    ? parseFloat(b.price) / (summaryData.rates[b.currency] || 1) : null;
                                  return (
                                    <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px", borderBottom: i < sorted.length - 1 ? "1px solid var(--border)" : "none" }}>
                                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                                        <span style={{ color: "var(--text-tiny)", marginRight: 5 }}>{b.date ? b.date.slice(5).replace("-", "/") : "—"}</span>
                                        {b.name}
                                      </div>
                                      <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0, marginLeft: 12 }}>
                                        <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace" }}>{parseFloat(b.price).toFixed(2)} {b.currency}</span>
                                        {dkk !== null && <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>≈{Math.round(dkk)}</span>}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      const sectionLabel = txt => (
                        <div style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.12em", paddingLeft: 2 }}>{txt}</div>
                      );

                      const subtotalBar = (label, amount, approx, sub) => summaryData.rates ? (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid var(--border)" }}>
                          <span style={{ fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{approx ? "~" : "≈"}{Math.round(amount)} DKK</div>
                            {sub && <div style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>{sub}</div>}
                          </div>
                        </div>
                      ) : null;

                      const hasCollective = collective.total_dkk > 0 || Object.keys(collective.by_type || {}).length > 0;
                      const hasPeter      = petSection.total_dkk > 0 || Object.keys(petSection.by_type || {}).length > 0;
                      const hasFriend     = friSection.total_dkk > 0 || Object.keys(friSection.by_type || {}).length > 0;

                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                          {hasCollective && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {sectionLabel("collective")}
                              {TYPES.filter(t => EXPENSE_TYPES.includes(t.id)).map(t => renderCatCard(t, collective.by_type?.[t.id], "col"))}
                              {subtotalBar("shared total", collective.total_dkk, collective.approx, `→ ≈${Math.round(collective.total_dkk / 2)} each`)}
                            </div>
                          )}
                          {hasPeter && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {sectionLabel("peter · personal")}
                              {TYPES.filter(t => EXPENSE_TYPES.includes(t.id)).map(t => renderCatCard(t, petSection.by_type?.[t.id], "pet"))}
                              {subtotalBar("peter total", petSection.total_dkk, petSection.approx, null)}
                            </div>
                          )}
                          {hasFriend && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {sectionLabel(`${FRIEND_NAME} · personal`)}
                              {TYPES.filter(t => EXPENSE_TYPES.includes(t.id)).map(t => renderCatCard(t, friSection.by_type?.[t.id], "fri"))}
                              {subtotalBar(`${FRIEND_NAME} total`, friSection.total_dkk, friSection.approx, null)}
                            </div>
                          )}
                          {summaryData.rates && (hasCollective || hasPeter || hasFriend) && (
                            <div style={{ background: "var(--surface2)", borderRadius: 10, border: "1px solid var(--border2)", padding: 20 }}>
                              <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>per person</div>
                              {[["Peter", per_person.peter], [FRIEND_NAME, per_person.friend]].map(([name, pp]) => (
                                <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                                  <span style={{ fontSize: 13, color: "var(--text)" }}>{name}</span>
                                  <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "var(--text)" }}>{pp.approx ? "~" : "≈"}{Math.round(pp.total_dkk)} <span style={{ fontSize: 12, color: "var(--text-faint)" }}>DKK</span></span>
                                </div>
                              ))}
                              <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 10, fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>
                                personal + ½ collective
                              </div>
                            </div>
                          )}
                          {!hasCollective && !hasPeter && !hasFriend && (
                            <div style={{ color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", fontSize: 12 }}>No expenses yet.</div>
                          )}
                          {summaryData.rates_at && <div style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", paddingLeft: 2 }}>rates · {summaryData.rates_at}</div>}
                        </div>
                      );
                    })()}
                  </div>
                )}
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

      <input type="file" accept="image/*" ref={passFileRef} onChange={handlePassFile} style={{ display: "none" }} />
    </>
  );
}

function CopyButton({ text, onCopy, title = "Copy address", style }) {
  if (!text) return null;
  return (
    <button className="btn" onClick={e => {
      e.preventDefault(); e.stopPropagation();
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => onCopy?.(true), () => onCopy?.(false));
      } else { onCopy?.(false); }
    }}
      title={title}
      style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px", background: "transparent", lineHeight: 1, ...style }}>
      📋
    </button>
  );
}

function DetailPills({ booking, onOpenModal }) {
  const details = booking.details;
  const hasDetails = details && typeof details === "object" && Object.values(details).some(Boolean);
  if (!hasDetails) return null;
  const pinned = PINNED_DETAIL_KEYS.filter(k => details[k]);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
      {pinned.map(k => (
        <span key={k} style={{ fontSize: 11, fontFamily: "'Source Code Pro', monospace", color: "var(--accent)", background: "var(--accent)18", border: "1px solid var(--accent)40", borderRadius: 4, padding: "2px 8px" }}>
          {detailLabel(k)}: <b>{details[k]}</b>
        </span>
      ))}
      <button className="btn" onClick={e => { e.preventDefault(); e.stopPropagation(); onOpenModal(); }}
        style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px", background: "transparent" }}>
        ⓘ details
      </button>
    </div>
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

const inp = { width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 12px", color: "var(--text)", fontSize: 13, fontFamily: "'Source Code Pro', monospace" };
const btnStyle = { padding: "8px 16px", borderRadius: 6, fontSize: 12, fontFamily: "'Source Code Pro', monospace", letterSpacing: "0.05em" };
