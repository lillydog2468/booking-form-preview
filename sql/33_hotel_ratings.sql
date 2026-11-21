-- APPLIED on 21 November 2026.
-- Keith already created public.hotel_ratings in the Booking-form Supabase
-- project (ojulhplswtcmheonsnlv). Do not run this file again.
-- The app does not run it. It records the live table so the repo matches it.
--
-- Live check on 21 November 2026:
--   columns match the CREATE TABLE below (stars is NOT NULL, updated_at exists)
--   foreign keys use ON DELETE SET NULL
--   member_id has no foreign key
--   RLS is on
--   one policy, hotel_ratings_auth_all, FOR ALL to authenticated
--   anon and PUBLIC have no privileges on the table
--   authenticated and service_role have ALL table privileges
--     (select, insert, update, delete, plus references, trigger, truncate)
--   the id sequence grants USAGE, SELECT and UPDATE to authenticated,
--     service_role, and also anon (the Supabase default on a new sequence).
--     Anon still cannot read or write the table, because the table grant
--     and the policy both exclude anon. service_role bypasses RLS.

CREATE TABLE IF NOT EXISTS public.hotel_ratings (
  id          bigserial PRIMARY KEY,
  place_id    bigint REFERENCES public.planner_places(id) ON DELETE SET NULL,
  hotel_name  text NOT NULL,
  booking_id  int REFERENCES public.bookings(id) ON DELETE SET NULL,
  member_id   int,
  stars       smallint NOT NULL CHECK (stars >= 1 AND stars <= 5),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hotel_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotel_ratings_auth_all ON public.hotel_ratings;
CREATE POLICY hotel_ratings_auth_all
  ON public.hotel_ratings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.hotel_ratings FROM PUBLIC, anon;
GRANT ALL ON TABLE public.hotel_ratings TO authenticated, service_role;

GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.hotel_ratings_id_seq TO authenticated, service_role;
-- Anon keeps the sequence privileges already present on the live database.
-- This line matches that applied state. It does not grant anon the table.
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.hotel_ratings_id_seq TO anon;
