-- Migration: add details jsonb column for structured per-booking extras
-- Run in Supabase SQL editor

alter table public.bookings
  add column if not exists details jsonb;

comment on column public.bookings.details is 'Structured extra info (e.g. car/seat numbers, gate, collection code, room number) shown as highlighted pills and in a details modal. Free-form key/value object.';
