alter table public.bookings
  add column if not exists map_provider text default 'amap',
  add column if not exists map_query text,
  add column if not exists map_lat numeric,
  add column if not exists map_lng numeric,
  add column if not exists map_place_id text;

comment on column public.bookings.map_provider is 'Preferred map provider for opening a booking location (amap or google).';
comment on column public.bookings.map_query is 'Search keyword used by the maps button when an exact place ID or coordinates are not available.';
comment on column public.bookings.map_lat is 'Optional latitude for exact map opening.';
comment on column public.bookings.map_lng is 'Optional longitude for exact map opening.';
comment on column public.bookings.map_place_id is 'Optional provider-specific place identifier for future exact map deep links.';
