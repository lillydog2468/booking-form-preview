-- No deposit expected.
-- Tick this for a repeat tour, or a group who pay in full on arrival.
-- The booking form then shows a grey "No deposit expected" label and
-- leaves the booking out of the Missing deposits filter.
-- Existing rows stay expecting a deposit.
--
-- Apply this in the Supabase SQL editor. The app does not run it.
-- The form still saves if this column is missing.

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS no_deposit_expected boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bookings.no_deposit_expected IS
  'When true, no deposit is expected. The deposits indicator stays grey and the booking is left out of Missing deposits.';
