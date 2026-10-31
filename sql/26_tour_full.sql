-- Tour full flag on a booking.
-- When true, the tour is full. The booking form will not add guests or raise
-- the headcount until the flag is turned off. Hotels can show that the hotel
-- still needs booking.
-- Existing rows stay not full.
--
-- Apply this in the Supabase SQL editor. The app does not run it.
-- The form still saves if this column is missing.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tour_full BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN bookings.tour_full IS
  'When true, the tour is full. The booking form blocks adding guests and raising the headcount until this is turned off.';
