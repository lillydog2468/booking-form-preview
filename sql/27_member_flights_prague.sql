-- Per-guest flights and own Prague hotel stays.
-- These columns are added to the existing public.members table.
-- There is no new table, so no extra GRANT is required.
-- Every column is nullable. Existing member rows stay valid.
--
-- Apply this in the Supabase SQL editor. The app does not run it.
-- The form still saves if a column is missing: it retries without that column.

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS arrival_flight TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS arrival_date DATE;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS arrival_time TIME;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS departure_flight TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS departure_date DATE;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS departure_time TIME;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS flight_note TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS prague_stays JSONB;

COMMENT ON COLUMN public.members.arrival_flight IS 'This guest''s arrival flight number. Nullable.';
COMMENT ON COLUMN public.members.arrival_date IS 'This guest''s arrival flight date. Nullable.';
COMMENT ON COLUMN public.members.arrival_time IS 'This guest''s arrival flight time. Nullable.';
COMMENT ON COLUMN public.members.departure_flight IS 'This guest''s departure flight number. Nullable.';
COMMENT ON COLUMN public.members.departure_date IS 'This guest''s departure flight date. Nullable.';
COMMENT ON COLUMN public.members.departure_time IS 'This guest''s departure flight time. Nullable.';
COMMENT ON COLUMN public.members.flight_note IS 'A note on this guest''s flights. Nullable.';
COMMENT ON COLUMN public.members.prague_stays IS 'This guest''s own Prague hotel stays. JSON array of {hotel, check_in, check_out, note}. Nullable.';
