-- Migration: add shopping to bookings type check constraint
-- Run in Supabase SQL editor

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_type_check
    CHECK (type IN ('flight', 'hotel', 'train', 'ticket', 'food', 'activity', 'city_transport', 'shopping'));
