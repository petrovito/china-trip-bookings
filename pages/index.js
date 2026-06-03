import { useState, useEffect, useRef, useMemo } from "react";
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
const BUILD = "2026-05-31";
const FRIEND_NAME = process.env.NEXT_PUBLIC_FRIEND_NAME || "friend";

const EMPTY_FORM = {
  type: "flight", name: "", date: "", date_end: "", price: "", currency: "USD",
  platform: "", reference: "", notes: "", travelers: "both", paid_by: "", location: "",
  time: "", time_end: "", origin: "",
  reminder: false, reminderType: "buy", reminderAssignee: "me",
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
const EMPTY_TODO = { title: "", category: "pack", assignee: "both", deadline: "", segment_id: null };
// Booking types that can have a pass/QR attached
const PASS_TYPES = ["flight", "train", "ticket", "hotel", "activity"];

// ZXing format string → bwip-js bcid
const FORMAT_TO_BCID = {
  QR_CODE:     "qrcode",
  PDF_417:     "pdf417",
  AZTEC:       "azteccode",
  CODE_128:    "code128",
  CODE_39:     "code39",
  DATA_MATRIX: "datamatrix",
  EAN_13:      "ean13",
  EAN_8:       "ean8",
  UPC_A:       "upca",
  ITF:         "interleaved2of5",
  CODABAR:     "rationalizedCodabar",
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

// All days a booking spans
function bookingDays(b) {
  if (!b.date) return [];
  if (!b.date_end || b.date_end <= b.date) return [b.date];
  const days = [];
  let cur = new Date(b.date + "T00:00:00");
  const end = new Date(b.date_end + "T00:00:00");
  while (cur <= end) {
    days.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const [segments, setSegments] = useState([]);
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
  const [passViewer, setPassViewer] = useState(null); // { id, name, passes: [{who,code,format}], idx }
  // Identity: which traveler is on this device
  const [identity, setIdentity] = useState(null); // "peter" | "friend"
  const [showIdentityPicker, setShowIdentityPicker] = useState(false);
  const [pendingPassBooking, setPendingPassBooking] = useState(null);
  const [editingTodo, setEditingTodo] = useState(null); // todo object being edited inline
  const todayRef = useRef(null);
  const passFileRef = useRef(null);
  const passUploadForRef = useRef(null);
  const passUploadWhoRef = useRef(null);
  const passCanvasRef = useRef(null);
  const pickerAutoShownRef = useRef(false);

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
  useEffect(() => { localStorage.setItem("ft", JSON.stringify(filterTypes)); }, [filterTypes]);
  useEffect(() => { localStorage.setItem("fs",  filterSettled);   }, [filterSettled]);
  useEffect(() => { localStorage.setItem("ftr", filterTravelers); }, [filterTravelers]);
  useEffect(() => { localStorage.setItem("fp",  filterPaidBy);    }, [filterPaidBy]);
  useEffect(() => { localStorage.setItem("sf",  showFilters ? "1" : "0"); }, [showFilters]);
  useEffect(() => { localStorage.setItem("tab", activeTab); }, [activeTab]);
  useEffect(() => { localStorage.setItem("cg",  JSON.stringify(collapsedGroups)); }, [collapsedGroups]);
  useEffect(() => { localStorage.setItem("tfc", todoFilterCat); }, [todoFilterCat]);
  useEffect(() => { localStorage.setItem("tfa", todoFilterAssignee); }, [todoFilterAssignee]);
  useEffect(() => { if (identity) localStorage.setItem("who", identity); else localStorage.removeItem("who"); }, [identity]);
  useEffect(() => {
    if (!passViewer?.passes || !passCanvasRef.current) return;
    const p = passViewer.passes[passViewer.idx ?? 0];
    if (!p?.code) return;
    import("bwip-js").then(({ default: bwipjs }) => {
      try {
        bwipjs.toCanvas(passCanvasRef.current, {
          bcid: FORMAT_TO_BCID[p.format] || "qrcode",
          text: p.code,
          scale: 4,
          includetext: false,
        });
      } catch (err) { console.error("Barcode render error:", err); }
    });
  }, [passViewer]);
  useEffect(() => { fetchBookings(); }, []);
  useEffect(() => { fetchTodos(); }, []);
  useEffect(() => { fetchSegments(); }, []);

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

  async function fetchSegments() {
    try {
      const res = await fetch("/api/segments");
      const data = await res.json();
      setSegments(Array.isArray(data) ? data : []);
    } catch {
      // non-fatal — trip tab degrades gracefully
    }
  }

  async function handleAddTodo() {
    if (!todoForm.title.trim()) return;
    const reset = () => { setTodoForm({ ...EMPTY_TODO, assignee: identity || "peter" }); setShowTodoForm(false); };

    if (todoForm.assignee === "both") {
      const t = Date.now();
      const [tmp1, tmp2] = [
        { ...todoForm, assignee: "peter",  id: `tmp-${t}-1`, done: false },
        { ...todoForm, assignee: "friend", id: `tmp-${t}-2`, done: false },
      ];
      setTodos(prev => { const u = [...prev, tmp1, tmp2]; localStorage.setItem("todos_cache", JSON.stringify(u)); return u; });
      reset(); showToast("2 todos added — one each");
      const [r1, r2] = await Promise.all(
        ["peter", "friend"].map(a => fetch("/api/todos", { method: "POST", headers: authedHeaders, body: JSON.stringify({ ...todoForm, assignee: a }) }))
      );
      if (r1.status === 401 || r2.status === 401) {
        setTodos(prev => { const u = prev.filter(t => t.id !== tmp1.id && t.id !== tmp2.id); localStorage.setItem("todos_cache", JSON.stringify(u)); return u; });
        showToast("Wrong password", false); return;
      }
      const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
      setTodos(prev => { const u = prev.map(t => t.id === tmp1.id ? d1 : t.id === tmp2.id ? d2 : t); localStorage.setItem("todos_cache", JSON.stringify(u)); return u; });
      return;
    }

    const tmpId = `tmp-${Date.now()}`;
    const tmpTodo = { ...todoForm, id: tmpId, done: false };
    setTodos(prev => { const u = [...prev, tmpTodo]; localStorage.setItem("todos_cache", JSON.stringify(u)); return u; });
    reset(); showToast("Todo added");
    const res = await fetch("/api/todos", { method: "POST", headers: authedHeaders, body: JSON.stringify(todoForm) });
    if (res.status === 401) {
      setTodos(prev => { const u = prev.filter(t => t.id !== tmpId); localStorage.setItem("todos_cache", JSON.stringify(u)); return u; });
      showToast("Wrong password", false); return;
    }
    const todo = await res.json();
    setTodos(prev => { const u = prev.map(t => t.id === tmpId ? todo : t); localStorage.setItem("todos_cache", JSON.stringify(u)); return u; });
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

  async function handleSaveEditTodo() {
    if (!editingTodo?.title?.trim()) return;
    const { id, title, category, assignee, deadline } = editingTodo;
    const res = await fetch(`/api/todos/${id}`, { method: "PATCH", headers: authedHeaders, body: JSON.stringify({ title, category, assignee, deadline: deadline || null }) });
    if (res.status === 401) { showToast("Wrong password", false); return; }
    setTodos(prev => { const u = prev.map(t => t.id === id ? { ...t, title, category, assignee } : t); localStorage.setItem("todos_cache", JSON.stringify(u)); return u; });
    setEditingTodo(null);
    showToast("Todo updated");
  }

  function getBookingPasses(b) {
    if (b.passes && b.passes.length > 0) return b.passes;
    if (b.pass_code) return [{ who: "peter", code: b.pass_code, format: b.pass_format }];
    return [];
  }

  function handlePassOpen(b, targetWho) {
    const who = targetWho !== undefined ? targetWho : identity;
    const allPasses = getBookingPasses(b);

    if (!who) {
      // Don't know who we are yet — ask first, then re-open
      setPendingPassBooking({ b, targetWho });
      setShowIdentityPicker(true);
      return;
    }

    const myPasses = allPasses.filter(p => p.who === who);
    if (myPasses.length > 0) {
      setPassViewer({ id: b.id, name: b.name, passes: myPasses, idx: 0 });
      return;
    }

    // No pass for this identity yet — if canWrite, trigger upload
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
    setIdentity(null);
    localStorage.removeItem("who");
    setShowIdentityPicker(false);
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
      const res = await fetch(`/api/bookings/${b.id}`, {
        method: "PATCH",
        headers: authedHeaders,
        body: JSON.stringify({ passes: newPasses }),
      });
      if (res.status === 401) { showToast("Wrong password", false); return; }
      setBookings(prev => {
        const updated = prev.map(bk => bk.id === b.id ? { ...bk, passes: newPasses } : bk);
        localStorage.setItem("bookings_cache", JSON.stringify(updated));
        return updated;
      });
      const myPasses = newPasses.filter(p => p.who === who);
      setPassViewer({ id: b.id, name: b.name, passes: myPasses, idx: myPasses.length - 1 });
      showToast("Pass decoded ✓");
    } catch {
      showToast("Could not read barcode — try a clearer screenshot", false);
    } finally {
      URL.revokeObjectURL(url);
      e.target.value = "";
    }
  }

  async function handlePassRemove(bookingId, passEntry) {
    const b = bookings.find(bk => bk.id === bookingId);
    if (!b) return;
    const allPasses = getBookingPasses(b);
    const newPasses = allPasses.filter(p => !(p.who === passEntry.who && p.code === passEntry.code));
    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ passes: newPasses }),
    });
    if (res.status === 401) { showToast("Wrong password", false); return; }
    setBookings(prev => {
      const updated = prev.map(bk => bk.id === bookingId ? { ...bk, passes: newPasses } : bk);
      localStorage.setItem("bookings_cache", JSON.stringify(updated));
      return updated;
    });
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
      time: form.time || null,
      time_end: form.time_end || null,
      origin: form.origin || null,
    };
    if (editId) {
      const r = await fetch(`/api/bookings/${editId}`, { method: "PUT", headers: authedHeaders, body: JSON.stringify(payload) });
      if (r.status === 401) { showToast("Wrong password", false); setSaving(false); return; }
      // Auto-complete linked todos when booking transitions from unpaid → paid
      const prev = bookings.find(b => b.id === editId);
      if (!prev?.paid_by && payload.paid_by) {
        const linked = todos.filter(t => t.booking_id === editId && !t.done);
        await Promise.all(linked.map(t =>
          fetch(`/api/todos/${t.id}`, { method: "PATCH", headers: authedHeaders, body: JSON.stringify({ done: true }) })
        ));
        if (linked.length) await fetchTodos();
      }
    } else {
      const r = await fetch("/api/bookings", { method: "POST", headers: authedHeaders, body: JSON.stringify(payload) });
      if (r.status === 401) { showToast("Wrong password", false); setSaving(false); return; }
      const newBooking = await r.json();
      // Create linked reminder todo(s)
      if (form.reminder && newBooking?.id) {
        const todoTitle = form.reminderType === "prepare" ? `Prepare: ${form.name}` : `Buy: ${form.name}`;
        const todoCategory = form.reminderType === "prepare" ? "pack" : "book";
        const assignees = form.reminderAssignee === "both" ? ["peter", "friend"] : [identity || "peter"];
        await Promise.all(assignees.map(assignee =>
          fetch("/api/todos", {
            method: "POST", headers: authedHeaders,
            body: JSON.stringify({
              title: todoTitle, category: todoCategory, assignee,
              booking_id: newBooking.id,
              segment_id: newBooking.segment_id || null,
              deadline: form.date || null,
            }),
          })
        ));
        await fetchTodos();
      }
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
      time: b.time || "", time_end: b.time_end || "", origin: b.origin || "",
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

  // Personalized view: only bookings that pertain to the current user
  const myBookings = identity
    ? bookings.filter(b => b.travelers === "both" || b.travelers === identity)
    : bookings;

  const filtered = myBookings
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

  // Computed segment date ranges (dates float off bookings, never stored)
  const segmentData = useMemo(() => {
    return segments.map(seg => {
      const segBookings = myBookings.filter(b => b.segment_id === seg.id && b.date);
      if (!segBookings.length) return { ...seg, startDate: null, endDate: null, days: [] };

      const startDate = segBookings.reduce(
        (min, b) => (!min || b.date < min ? b.date : min), null
      );
      const endDate = segBookings.reduce((max, b) => {
        const e = b.date_end || b.date;
        return !max || e > max ? e : max;
      }, null);

      const days = [];
      let cur = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T00:00:00");
      while (cur <= end) {
        const d = toDateStr(cur);
        days.push({
          date: d,
          bookings: segBookings.filter(b =>
            b.date === d &&
            b.type !== "hotel" &&
            b.type !== "flight" &&
            b.type !== "train"
          ),
        });
        cur.setDate(cur.getDate() + 1);
      }

      return { ...seg, startDate, endDate, days };
    });
  }, [segments, myBookings]);

  // Flat timeline: all transits and segments sorted chronologically.
  // Transits sort before segments on the same date (arrival before city header).
  const tripTimeline = useMemo(() => {
    const transits = myBookings.filter(b => b.type === "flight" || b.type === "train");
    const items = [
      ...segmentData.map(seg  => ({ kind: "segment", segment: seg, _date: seg.startDate || "" })),
      ...transits.map(t       => ({ kind: "transit", b: t,         _date: t.date        || "" })),
    ];
    items.sort((a, b) => {
      if (a._date !== b._date) return a._date.localeCompare(b._date);
      if (a.kind === "transit" && b.kind === "segment") return -1;
      if (a.kind === "segment" && b.kind === "transit") return  1;
      return 0;
    });
    return items;
  }, [segmentData, myBookings]);

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
    if (b.type === "flight") {
      const place = b.origin ? `${b.origin} airport` : b.location ? `${b.location} airport China` : b.name;
      return `https://maps.google.com/?q=${encodeURIComponent(place)}`;
    }
    if (b.type === "train") {
      const place = b.origin ? `${b.origin} railway station` : b.location ? `${b.location} railway station China` : b.name;
      return `https://maps.google.com/?q=${encodeURIComponent(place)}`;
    }
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
                <button className="btn" onClick={() => setShowIdentityPicker(true)} title="Who are you on this device?"
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
                {(form.type === "flight" || form.type === "train") && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <input placeholder={form.type === "flight" ? "From (e.g. Copenhagen, PEK)" : "From (e.g. Beijing, BJS)"} value={form.origin} onChange={e => setForm(f => ({ ...f, origin: e.target.value }))} style={inp} />
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                    {form.type === "hotel" ? "Check-in time" : (form.type === "flight" || form.type === "train") ? "Departs" : "Starts"}
                  </div>
                  <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} style={inp} />
                </div>
                {form.type !== "food" && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                      {form.type === "hotel" ? "Check-out time" : (form.type === "flight" || form.type === "train") ? "Arrives" : "Ends"}
                    </div>
                    <input type="time" value={form.time_end} onChange={e => setForm(f => ({ ...f, time_end: e.target.value }))} style={inp} />
                  </div>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <input placeholder="Reference / confirmation #" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} style={inp} />
                </div>
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
              {/* Reminder todo — only on new bookings */}
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
                            style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace",
                              border: `1.5px solid ${form.reminderType === rt.id ? "var(--accent)" : "var(--border)"}`,
                              background: form.reminderType === rt.id ? "var(--accent)20" : "transparent",
                              color: form.reminderType === rt.id ? "var(--accent)" : "var(--text-faint)" }}>
                            {rt.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[{ v: "me", label: `just ${identity || "me"}` }, { v: "both", label: "both of us" }].map(({ v, label }) => (
                          <button key={v} className="btn" onClick={() => setForm(f => ({ ...f, reminderAssignee: v }))}
                            style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'Source Code Pro', monospace",
                              border: `1.5px solid ${form.reminderAssignee === v ? "var(--accent)" : "var(--border)"}`,
                              background: form.reminderAssignee === v ? "var(--accent)20" : "transparent",
                              color: form.reminderAssignee === v ? "var(--accent)" : "var(--text-faint)" }}>
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
                    return (
                      <div key={b.id} className="card" style={{ background: b.paid_by ? "var(--surface)" : "var(--surface)", borderRadius: 8, padding: "14px 16px", borderLeft: `3px solid ${b.paid_by ? t.color : "var(--text-tiny)"}`, position: "relative", opacity: b.paid_by ? 1 : 0.75 }}>
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
                                  style={{ background: "transparent", fontSize: 14, padding: "0 2px", border: "none", opacity: myPasses.length > 0 ? 0.9 : hasPasses ? 0.4 : 0.25, lineHeight: 1 }} title={myPasses.length > 0 ? "View pass" : "Add pass"}>🎫</button>
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
                        {/* Persistent pass badge — visible even when locked */}
                        {!canWrite && PASS_TYPES.includes(b.type) && identity && getBookingPasses(b).filter(p => p.who === identity).length > 0 && (
                          <button className="btn" onClick={() => handlePassOpen(b)}
                            style={{ position: "absolute", top: 12, right: 12, background: "transparent", fontSize: 14, padding: "2px 4px", border: "none", lineHeight: 1 }}>🎫</button>
                        )}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap", paddingRight: 60 }}>
                          <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: t.color, background: `${t.color}18`, padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{t.icon} {t.label}</span>
                          {!b.paid_by && b.type !== "activity" && <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: "#f59e0b", background: "#f59e0b18", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>⏳ pending</span>}
                          {b.settled && <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: "#10b981", background: "#10b98118", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>✓ settled</span>}
                          {todos.some(t => t.booking_id === b.id && !t.done) && <span style={{ fontSize: 10, fontFamily: "'Source Code Pro', monospace", color: "var(--accent)", background: "var(--accent)18", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>📋 todo</span>}
                          <span style={{ fontSize: 14.5, color: "var(--text)", fontFamily: "'Georgia', serif", lineHeight: 1.4 }}>{b.name}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginTop: 10 }}>
                          {b.date && <Meta label="date" value={b.date_end ? `${b.date} → ${b.date_end}` : b.date} />}
                          {(b.type === "flight" || b.type === "train") && b.origin && <Meta label="from" value={b.origin} />}
                          {b.time && <Meta label="time" value={b.time + (b.time_end ? ` → ${b.time_end}` : "")} />}
                          {b.location && <Meta label="loc" value={b.location} />}
                          {b.price && <Meta label="price" value={fmt(b.price, b.currency)} highlight />}
                          {b.platform && <Meta label="via" value={b.platform} />}
                          {b.reference && <Meta label="ref" value={b.reference} mono />}
                          {b.type !== "activity" && <Meta label="travelers" value={b.travelers === "friend" ? FRIEND_NAME : b.travelers || "both"} />}
                          {b.type !== "activity" && (b.paid_by ? <Meta label="paid by" value={b.paid_by === "friend" ? FRIEND_NAME : b.paid_by} /> : <Meta label="paid by" value="—" />)}
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
                    <button className="btn" onClick={() => { setTodoForm({ ...EMPTY_TODO, assignee: identity || "peter" }); setShowTodoForm(true); }}
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
                      {todoForm.assignee === "both" && (
                        <div style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", marginBottom: 12, paddingLeft: 2 }}>creates one task per person</div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>by</span>
                        <input type="date" value={todoForm.deadline || ""} onChange={e => setTodoForm(f => ({ ...f, deadline: e.target.value }))}
                          style={{ ...inp, flex: 1, fontSize: 12, colorScheme: "dark" }} />
                        {todoForm.deadline && <button className="btn" onClick={() => setTodoForm(f => ({ ...f, deadline: "" }))} style={{ background: "transparent", border: "none", color: "var(--text-tiny)", fontSize: 15, padding: "0 2px" }}>×</button>}
                      </div>
                      {(todoForm.category === "do" || todoForm.category === "book") && segments.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                          <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>in</span>
                          <select value={todoForm.segment_id || ""} onChange={e => setTodoForm(f => ({ ...f, segment_id: e.target.value || null }))}
                            style={{ ...inp, flex: 1, fontSize: 12 }}>
                            <option value="">anywhere</option>
                            {segments.map(s => (
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

              {/* Todo list */}
              {(() => {
                const filteredTodos = todos
                  .filter(t => identity ? t.assignee === identity : (todoFilterAssignee === "all" || t.assignee === todoFilterAssignee))
                  .filter(t => todoFilterCat === "all" || t.category === todoFilterCat);

                // Auto-todos: computed from bookings, never stored
                const autoTodos = (() => {
                  const result = [];
                  // Priority 1: missing hotel per future segment
                  segmentData.forEach(seg => {
                    if (!seg.endDate || seg.endDate < today) return;
                    const hasHotel = myBookings.some(b => b.type === "hotel" && b.segment_id === seg.id);
                    if (!hasHotel) result.push({ id: `auto-hotel-${seg.id}`, title: `Book hotel · ${seg.location}`, category: "book", assignee: identity || "peter", priority: 1, deadline: seg.startDate });
                  });
                  // Priority 2: missing transport between consecutive future segments
                  for (let i = 0; i < segmentData.length - 1; i++) {
                    const from = segmentData[i], to = segmentData[i + 1];
                    if (!to.startDate || to.startDate < today) continue;
                    const hasTransport = myBookings.some(b => (b.type === "flight" || b.type === "train") && b.location === to.location);
                    if (!hasTransport) result.push({ id: `auto-transport-${i}`, title: `Book transport · ${from.location} → ${to.location}`, category: "book", assignee: identity || "peter", priority: 2, deadline: from.endDate });
                  }
                  // Priority 3: missing QR for current identity on future bookings
                  if (identity) {
                    myBookings.filter(b => PASS_TYPES.includes(b.type) && b.date >= today).forEach(b => {
                      if (getBookingPasses(b).filter(p => p.who === identity).length === 0)
                        result.push({ id: `auto-qr-${b.id}`, title: `Upload QR · ${b.name}`, category: "tech", assignee: identity, priority: 3 });
                    });
                  }
                  return result
                    .filter(t => todoFilterCat === "all" || t.category === todoFilterCat)
                    .filter(t => todoFilterAssignee === "all" || t.assignee === todoFilterAssignee || t.assignee === "both")
                    .sort((a, b) => a.priority - b.priority || (a.deadline || "z").localeCompare(b.deadline || "z"));
                })();

                if (todos.length === 0 && autoTodos.length === 0) return (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "var(--border)", fontFamily: "'Source Code Pro', monospace", fontSize: 12, letterSpacing: "0.1em" }}>NO TODOS YET</div>
                );
                if (filteredTodos.length === 0 && autoTodos.length === 0) return (
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
                      const pending = catTodos.filter(t => !t.done).sort((a, b) => {
                        if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
                        if (a.deadline) return -1;
                        if (b.deadline) return 1;
                        return 0;
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
                                  <input
                                    value={editingTodo.title}
                                    onChange={e => setEditingTodo(t => ({ ...t, title: e.target.value }))}
                                    onKeyDown={e => { if (e.key === "Enter") handleSaveEditTodo(); if (e.key === "Escape") setEditingTodo(null); }}
                                    autoFocus
                                    style={{ ...inp, marginBottom: 10, fontSize: 13 }}
                                  />
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
                                    <button className="btn" onClick={() => setEditingTodo(null)}
                                      style={{ ...btnStyle, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", fontSize: 11 }}>Cancel</button>
                                    <button className="btn" onClick={handleSaveEditTodo} disabled={!editingTodo.title.trim()}
                                      style={{ ...btnStyle, background: "var(--accent)", color: "#fff", opacity: !editingTodo.title.trim() ? 0.5 : 1, fontSize: 11 }}>Save</button>
                                  </div>
                                </div>
                              ) : (
                                <div key={todo.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", borderRadius: 7, padding: "10px 14px", opacity: todo.done ? 0.4 : 1, transition: "opacity 0.2s" }}>
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
                                      <span style={{ fontSize: 9, fontFamily: "'Source Code Pro', monospace", letterSpacing: "0.02em", color: todo.deadline < today ? "#ef4444" : "var(--text-tiny)", background: todo.deadline < today ? "#ef444415" : "transparent", borderRadius: 3, padding: "1px 4px" }}>
                                        {todo.deadline < today ? "overdue" : fmtDateShort(todo.deadline)}
                                      </span>
                                    )}
                                    {todo.assignee !== "both" && (
                                      <span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace" }}>{todo.assignee === "friend" ? FRIEND_NAME : todo.assignee}</span>
                                    )}
                                    {canWrite && (
                                      <>
                                        <button className="btn" onClick={() => setEditingTodo({ ...todo })}
                                          style={{ background: "transparent", color: "var(--text-tiny)", fontSize: 13, lineHeight: 1, padding: "0 2px", border: "none", opacity: 0.5 }}>✎</button>
                                        <button className="btn" onClick={() => handleDeleteTodo(todo.id)}
                                          style={{ background: "transparent", color: "var(--text-tiny)", fontSize: 16, lineHeight: 1, padding: "0 2px", border: "none", opacity: 0.5 }}>×</button>
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
                    {autoTodos.length > 0 && (
                      <div style={{ marginTop: filteredTodos.length > 0 ? 4 : 0 }}>
                        <div style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, paddingTop: 16, borderTop: filteredTodos.length > 0 ? "1px solid var(--border)" : "none" }}>suggested</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {autoTodos.map(t => (
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
            <div>
              {loading ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--border)", fontFamily: "'Source Code Pro', monospace", fontSize: 12 }}>LOADING...</div>
              ) : segmentData.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--border)", fontFamily: "'Source Code Pro', monospace", fontSize: 12, letterSpacing: "0.1em" }}>NO BOOKINGS YET</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {tripTimeline.map((item, timelineIdx) => {
                    if (item.kind === "transit") {
                      const b = item.b;
                      const t = TYPES.find(tt => tt.id === b.type) || TYPES[0];
                      const isPastTransit = (b.date || "") < today;
                      const isExpanded = expandedCards[b.id];
                      const hasDetails = b.reference || b.platform || b.notes || b.price || b.time || b.origin;
                      const myPasses = getBookingPasses(b).filter(p => p.who === identity);
                      const hasPasses = getBookingPasses(b).length > 0;
                      const showPassBtn = PASS_TYPES.includes(b.type) && (canWrite || (identity && myPasses.length > 0) || (!identity && hasPasses));
                      return (
                        <div key={`transit-${b.id}`} style={{ marginBottom: 20, opacity: isPastTransit ? 0.45 : 1 }}>
                          {/* Transit card */}
                          <div className="trip-card" onClick={() => hasDetails && toggleCard(b.id)}
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
                                    style={{ background: "transparent", fontSize: 14, padding: "0 2px", border: "none", opacity: myPasses.length > 0 ? 1 : hasPasses ? 0.4 : 0.25, lineHeight: 1 }} title={myPasses.length > 0 ? "View pass" : "Add pass"}>🎫</button>
                                )}
                                {hasDetails && <span style={{ fontSize: 9, color: "var(--text-tiny)" }}>{isExpanded ? "▲" : "▼"}</span>}
                              </div>
                            </div>
                            {isExpanded && (
                              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
                                {b.time && <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>dep</span><span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{b.time}{b.time_end ? ` → ${b.time_end}` : ""}</span></div>}
                                {b.price && <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>cost</span><span style={{ fontSize: 12, color: "#10b981", fontFamily: "'Source Code Pro', monospace" }}>{fmt(b.price, b.currency)}</span></div>}
                                {b.reference && <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>ref</span><span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{b.reference}</span></div>}
                                {b.platform && <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>via</span><span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>{b.platform}</span></div>}
                                {b.notes && <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic", lineHeight: 1.5 }}>{b.notes}</div>}
                                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                                  <a href={mapsLink(b)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px" }} onClick={e => e.stopPropagation()}>📍 maps</a>
                                  {platformLink(b) && <a href={platformLink(b)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px" }} onClick={e => e.stopPropagation()}>↗ {b.platform}</a>}
                                  {canWrite && PASS_TYPES.includes(b.type) && (
                                    <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                                      {(["peter", "friend"]).filter(who => b.travelers === "both" || b.travelers === who).map(who => {
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
                          {/* Arrow into next location */}
                          <div style={{ textAlign: "center", marginTop: 10, color: "var(--border)", fontSize: 10, lineHeight: 1 }}>▼</div>
                        </div>
                      );
                    }
                    const { segment } = item;
                    // Show the departure transit's date as the location end date (more natural than checkout-minus-one)
                    const nextItem = tripTimeline[timelineIdx + 1];
                    const displayEndDate = (nextItem?.kind === "transit" && nextItem.b.date >= segment.startDate) ? nextItem.b.date : segment.endDate;
                    const isPast = segment.endDate && segment.endDate < today;
                    const isActive = segment.startDate && segment.startDate <= today && today <= (displayEndDate || segment.endDate);
                    const isCollapsed = collapsedGroups[segment.id];
                    const hotelBookings = myBookings.filter(b => b.type === "hotel" && b.segment_id === segment.id);

                    const vibeImg = locationImages[segment.location];

                    return (
                      <div key={segment.id} style={{ marginBottom: 28, opacity: isPast ? 0.45 : 1 }}>
                        {/* Location hero header */}
                        <div
                          onClick={() => toggleGroup(segment.id)}
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
                                  {segment.location}
                                </div>
                                <div style={{ fontSize: 11, color: isActive ? "var(--accent)" : "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", marginTop: 3 }}>
                                  {fmtDateShort(segment.startDate)}{segment.startDate !== displayEndDate ? ` – ${fmtDateShort(displayEndDate)}` : ""}
                                  {isActive && " · now"}
                                </div>
                              </div>
                            </div>
                            <span style={{ fontSize: 11, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", flexShrink: 0 }}>{isCollapsed ? "▸" : "▾"}</span>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                            {/* Hotel banners */}
                            {hotelBookings.map(hotelBooking => (
                              <div key={hotelBooking.id} style={{ background: "var(--hotel-bg)", border: "1px solid var(--hotel-border)", borderRadius: 8, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 13 }}>🏨</span>
                                  <span style={{ fontSize: 13, color: "var(--hotel-text)", fontFamily: "'Georgia', serif" }}>{hotelBooking.name}</span>
                                </div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  {hotelBooking.date_end && (
                                    <span style={{ fontSize: 10, color: "var(--hotel-text)", fontFamily: "'Source Code Pro', monospace" }}>
                                      {fmtDateShort(hotelBooking.date)} → {fmtDateShort(hotelBooking.date_end)}
                                    </span>
                                  )}
                                  {(hotelBooking.time || hotelBooking.time_end) && (
                                    <span style={{ fontSize: 10, color: "var(--hotel-text)", fontFamily: "'Source Code Pro', monospace", opacity: 0.75 }}>
                                      {hotelBooking.time && `in ${hotelBooking.time}`}{hotelBooking.time && hotelBooking.time_end && " · "}{hotelBooking.time_end && `out ${hotelBooking.time_end}`}
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
                            ))}

                            {/* Days */}
                            {segment.days.map(({ date: d, bookings: dayBks }) => {
                              const isToday = d === today;
                              const nonHotel = dayBks.filter(b => b.type !== "hotel" && b.type !== "flight" && b.type !== "train");
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
                                    const hasDetails = b.reference || b.platform || b.notes || b.price || b.time || b.origin;
                                    const myPasses = getBookingPasses(b).filter(p => p.who === identity);
                                    const hasPasses = getBookingPasses(b).length > 0;
                                    const showPassBtn = PASS_TYPES.includes(b.type) && (canWrite || (identity && myPasses.length > 0) || (!identity && hasPasses));
                                    const isTransport = b.type === "flight" || b.type === "train";
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
                                            {showPassBtn && (
                                              <button className="btn" onClick={e => { e.stopPropagation(); handlePassOpen(b); }}
                                                style={{ background: "transparent", fontSize: 14, padding: "0 2px", border: "none", opacity: myPasses.length > 0 ? 1 : hasPasses ? 0.4 : 0.25, lineHeight: 1 }}
                                                title={myPasses.length > 0 ? "View pass" : "Add pass"}>🎫</button>
                                            )}
                                            {hasDetails && <span style={{ fontSize: 9, color: "var(--text-tiny)" }}>{isExpanded ? "▲" : "▼"}</span>}
                                          </div>
                                        </div>
                                        {/* Transport: origin → dest + times always visible */}
                                        {isTransport && (b.origin || b.location || b.time) && (
                                          <div style={{ display: "flex", gap: 10, marginTop: 4, paddingLeft: 22, flexWrap: "wrap" }}>
                                            {(b.origin || b.location) && (
                                              <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace" }}>
                                                {b.origin && b.location ? `${b.origin} → ${b.location}` : b.origin || b.location}
                                              </span>
                                            )}
                                            {b.time && (
                                              <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>
                                                {b.time}{b.time_end ? ` → ${b.time_end}` : ""}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {/* Non-transport with time */}
                                        {!isTransport && b.time && (
                                          <div style={{ paddingLeft: 22, marginTop: 3 }}>
                                            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Source Code Pro', monospace" }}>
                                              {b.time}{b.time_end ? ` – ${b.time_end}` : ""}
                                            </span>
                                          </div>
                                        )}
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
                                            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                                              <a href={mapsLink(b)} target="_blank" rel="noopener noreferrer"
                                                style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px" }}
                                                onClick={e => e.stopPropagation()}>📍 maps</a>
                                              {platformLink(b) && (
                                                <a href={platformLink(b)} target="_blank" rel="noopener noreferrer"
                                                  style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Source Code Pro', monospace", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px" }}
                                                  onClick={e => e.stopPropagation()}>↗ {b.platform}</a>
                                              )}
                                              {/* Pass management (canWrite): add pass per person */}
                                              {canWrite && PASS_TYPES.includes(b.type) && (
                                                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                                                  {(["peter", "friend"]).filter(who => b.travelers === "both" || b.travelers === who).map(who => {
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
                            {/* Segment todos (Phase 3) */}
                            {(() => {
                              const segTodos = todos.filter(t => t.segment_id === segment.id);
                              const mySegTodos = identity
                                ? segTodos.filter(t => t.assignee === identity || t.assignee === "both")
                                : segTodos;
                              if (!mySegTodos.length) return null;
                              return (
                                <div style={{ marginTop: 10, borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
                                  <div style={{ fontSize: 10, color: "var(--text-tiny)", fontFamily: "'Source Code Pro', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>want to do</div>
                                  {mySegTodos.map(t => (
                                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, paddingLeft: 2 }}>
                                      <input type="checkbox" checked={t.done} onChange={() => handleToggleTodo(t)}
                                        style={{ accentColor: "var(--accent)", width: 14, height: 14, flexShrink: 0 }} />
                                      <span style={{ fontSize: 13, color: t.done ? "var(--text-tiny)" : "var(--text-muted)", fontFamily: "'Georgia', serif", textDecoration: t.done ? "line-through" : "none" }}>
                                        {t.title}
                                      </span>
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

          {/* ── IDENTITY PICKER MODAL ── */}
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

          {/* ── PASS VIEWER MODAL ── */}
          {passViewer && (() => {
            const passes = passViewer.passes || [];
            const idx = passViewer.idx ?? 0;
            const currentPass = passes[idx];
            const hasMultiple = passes.length > 1;
            return (
              <div onClick={() => setPassViewer(null)}
                style={{ position: "fixed", inset: 0, zIndex: 2000, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <canvas
                  ref={passCanvasRef}
                  onClick={e => e.stopPropagation()}
                  style={{ maxWidth: "92%", maxHeight: "70vh", objectFit: "contain" }}
                />
                {hasMultiple && (
                  <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 18 }}>
                    <button className="btn"
                      onClick={() => setPassViewer(prev => ({ ...prev, idx: Math.max(0, prev.idx - 1) }))}
                      disabled={idx === 0}
                      style={{ background: "#00000010", border: "1px solid #00000018", borderRadius: 7, padding: "7px 16px", fontSize: 17, color: "#000", opacity: idx === 0 ? 0.25 : 1 }}>‹</button>
                    <span style={{ fontSize: 11, color: "#00000055", fontFamily: "'Source Code Pro', monospace" }}>{idx + 1} / {passes.length}</span>
                    <button className="btn"
                      onClick={() => setPassViewer(prev => ({ ...prev, idx: Math.min(prev.passes.length - 1, prev.idx + 1) }))}
                      disabled={idx === passes.length - 1}
                      style={{ background: "#00000010", border: "1px solid #00000018", borderRadius: 7, padding: "7px 16px", fontSize: 17, color: "#000", opacity: idx === passes.length - 1 ? 0.25 : 1 }}>›</button>
                  </div>
                )}
                <div style={{ position: "absolute", top: 16, right: 16 }}>
                  <button className="btn" onClick={() => setPassViewer(null)}
                    style={{ background: "#00000015", color: "#000", border: "1px solid #00000020", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontFamily: "'Source Code Pro', monospace" }}>✕</button>
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
                              // Personalize label: pOwes > 0 means Peter owes friend
                              const debtLabel = pOwes > 0
                                ? (identity === "peter" ? `You owe ${FRIEND_NAME}` : identity === "friend" ? "Peter owes you" : `Peter owes ${FRIEND_NAME}`)
                                : (identity === "peter" ? `${FRIEND_NAME} owes you` : identity === "friend" ? "You owe Peter" : `${FRIEND_NAME} owes Peter`);
                              const debtColor = pOwes > 0
                                ? (identity === "peter" ? "#f97316" : "#10b981")
                                : (identity === "peter" ? "#10b981" : "#f97316");
                              return (
                                <div key={currency} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                                  <div style={{ fontSize: 14, color: "var(--text)" }}>
                                    {debtLabel}
                                    <span style={{ color: debtColor, fontFamily: "'Source Code Pro', monospace", marginLeft: 8 }}>{fmtAmt(pOwes)}</span>
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
