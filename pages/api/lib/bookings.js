// pages/api/lib/bookings.js
import { supabase } from "./db.js";
import { getOrCreateSegment } from "./segments.js";

const DEFAULTS = {
  type: "flight",
  currency: "USD",
  travelers: "both",
};

function toNull(value) {
  return value === "" || value == null ? null : value;
}

function toNumber(value) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function pick(...values) {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}

// Like pick(), but also skips empty strings — for fields that have non-null defaults
// (travelers, currency) where an empty string from the client should fall through.
function pickNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function reminderAssignees(body = {}) {
  if (body.reminderAssignee === "both") return ["peter", "friend"];
  if (body.reminderAssignee === "peter" || body.reminderAssignee === "friend") return [body.reminderAssignee];
  if (body.identity === "peter" || body.identity === "friend") return [body.identity];
  return ["peter"];
}

function reminderTitle(body = {}, name = "") {
  const base = name || body.name || "Booking";
  return body.reminderType === "prepare" ? `Prepare: ${base}` : `Buy: ${base}`;
}

function reminderCategory(body = {}) {
  return body.reminderType === "prepare" ? "pack" : "book";
}

function baseBookingFields(body = {}, existing = {}) {
  return {
    name: pick(body.name, existing.name, null),
    date: toNull(pick(body.date, existing.date)),
    date_end: toNull(pick(body.date_end, existing.date_end)),
    time: toNull(pick(body.time, existing.time)),
    time_end: toNull(pick(body.time_end, existing.time_end)),
    origin: toNull(pick(body.origin, existing.origin)),
    location: toNull(pick(body.location, existing.location)),
    price: toNumber(pick(body.price, existing.price)),
    currency: pickNonEmpty(body.currency, existing.currency, DEFAULTS.currency),
    platform: toNull(pick(body.platform, existing.platform)),
    reference: toNull(pick(body.reference, existing.reference)),
    notes: toNull(pick(body.notes, existing.notes)),
    travelers: pickNonEmpty(body.travelers, existing.travelers, DEFAULTS.travelers),
    paid_by: toNull(pick(body.paid_by, existing.paid_by)),
  };
}

function transportName(body = {}, existing = {}) {
  const origin = toNull(pick(body.origin, existing.origin));
  const location = toNull(pick(body.location, existing.location));
  const explicit = pick(body.name, existing.name);
  if (origin && location) return `${origin} → ${location}`;
  return explicit || (origin || location ? `${origin || ""}${location ? ` → ${location}` : ""}` : null);
}

function buildTransportPayload(body = {}, existing = {}, { forInsert = false } = {}) {
  const payload = {
    type: pick(body.type, existing.type, DEFAULTS.type),
    ...baseBookingFields(body, existing),
  };

  payload.name = transportName(body, existing);
  payload.origin = toNull(pick(body.origin, existing.origin));
  payload.location = toNull(pick(body.location, existing.location));
  payload.settled = body.settled !== undefined ? body.settled : (forInsert ? false : undefined);

  return payload;
}

function buildAccommodationPayload(body = {}, existing = {}, { forInsert = false } = {}) {
  const payload = {
    type: "hotel",
    name: toNull(pick(body.name, existing.name)),
    date: toNull(pick(body.check_in, body.date, existing.date)),
    date_end: toNull(pick(body.check_out, body.date_end, existing.date_end)),
    time: toNull(pick(body.check_in_time, body.time, existing.time)),
    time_end: toNull(pick(body.check_out_time, body.time_end, existing.time_end)),
    location: toNull(pick(body.location, existing.location)),
    price: toNumber(pick(body.price, existing.price)),
    currency: pickNonEmpty(body.currency, existing.currency, DEFAULTS.currency),
    platform: toNull(pick(body.platform, existing.platform)),
    reference: toNull(pick(body.reference, existing.reference)),
    notes: toNull(pick(body.notes, existing.notes)),
    travelers: pickNonEmpty(body.travelers, existing.travelers, DEFAULTS.travelers),
    paid_by: toNull(pick(body.paid_by, existing.paid_by)),
  };

  if (body.settled !== undefined) payload.settled = body.settled;
  else if (forInsert) payload.settled = false;

  return payload;
}

function buildExperiencePayload(body = {}, existing = {}, { forInsert = false } = {}) {
  const payload = {
    type: pick(body.type, existing.type, "ticket"),
    name: toNull(pick(body.name, existing.name)),
    date: toNull(pick(body.date, existing.date)),
    time: toNull(pick(body.time, existing.time)),
    location: toNull(pick(body.location, existing.location)),
    price: toNumber(pick(body.price, existing.price)),
    currency: pickNonEmpty(body.currency, existing.currency, DEFAULTS.currency),
    platform: toNull(pick(body.platform, existing.platform)),
    reference: toNull(pick(body.reference, existing.reference)),
    notes: toNull(pick(body.notes, existing.notes)),
    travelers: pickNonEmpty(body.travelers, existing.travelers, DEFAULTS.travelers),
    paid_by: toNull(pick(body.paid_by, existing.paid_by)),
  };

  if (body.settled !== undefined) payload.settled = body.settled;
  else if (forInsert) payload.settled = false;

  return payload;
}

function buildGenericPayload(body = {}, existing = {}, opts = {}) {
  const type = pick(body.type, existing.type, DEFAULTS.type);
  if (type === "flight" || type === "train") return buildTransportPayload({ ...body, type }, existing, opts);
  if (type === "hotel") return buildAccommodationPayload(body, existing, opts);
  return buildExperiencePayload({ ...body, type }, existing, opts);
}

function buildPayload(kind, body = {}, existing = {}, opts = {}) {
  if (kind === "transport") return buildTransportPayload(body, existing, opts);
  if (kind === "accommodation") return buildAccommodationPayload(body, existing, opts);
  if (kind === "experience") return buildExperiencePayload(body, existing, opts);
  return buildGenericPayload(body, existing, opts);
}

async function createLinkedReminderTodos(booking, body = {}) {
  if (!body.reminder || !booking?.id) return;

  const assignees = reminderAssignees(body);
  const title = reminderTitle(body, booking.name);
  const category = reminderCategory(body);
  const deadline = body.date || booking.date || null;

  for (const assignee of assignees) {
    const { error } = await supabase.from("todos").insert({
      title,
      category,
      assignee,
      booking_id: booking.id,
      segment_id: booking.segment_id || null,
      deadline,
      done: false,
    });
    if (error) {
      console.error("createLinkedReminderTodos:", error.message);
      return;
    }
  }
}

async function markLinkedTodosDone(bookingId) {
  const { data, error } = await supabase
    .from("todos")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("done", false);

  if (error) {
    console.error("markLinkedTodosDone:", error.message);
    return;
  }

  if (!data?.length) return;

  for (const todo of data) {
    const { error: updateError } = await supabase
      .from("todos")
      .update({ done: true })
      .eq("id", todo.id);
    if (updateError) {
      console.error("markLinkedTodosDone update:", updateError.message);
      return;
    }
  }
}

async function getExistingBooking(id) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

async function applyInsert(kind, body = {}) {
  const payload = buildPayload(kind, body, {}, { forInsert: true });
  const segment_id = await getOrCreateSegment(payload.type, payload.location, payload.date ?? null);
  const insertPayload = { ...payload, segment_id };

  const { data, error } = await supabase
    .from("bookings")
    .insert(insertPayload)
    .select()
    .single();

  if (error) throw error;
  await createLinkedReminderTodos(data, body);
  return data;
}

async function applyUpdate(kind, id, body = {}) {
  const existing = await getExistingBooking(id);
  const payload = buildPayload(kind, body, existing, { forInsert: false });
  const segment_id = await getOrCreateSegment(payload.type, payload.location, payload.date ?? null);
  const updatePayload = { ...payload, segment_id };

  // Intentional partial-update semantics: if settled is not provided in the request body,
  // we preserve the existing DB value rather than defaulting to false.
  // Callers that need to explicitly clear settled should send settled: false.
  if (body.settled === undefined) delete updatePayload.settled;

  const { data, error } = await supabase
    .from("bookings")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  if (!existing.paid_by && data.paid_by) {
    await markLinkedTodosDone(id);
  }

  return data;
}

export async function createBookingRecord(kind, body = {}) {
  return applyInsert(kind, body);
}

export async function updateBookingRecord(kind, id, body = {}) {
  return applyUpdate(kind, id, body);
}

