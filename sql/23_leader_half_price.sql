-- Leader half price on a booking.
-- When true, only the organiser's per-person fare is halved. Every other
-- guest stays at the full price per person. The beading tour price then
-- follows (headcount - 0.5) × price per person, unless a different total
-- was typed in. Ten people at £X become 9.5 × £X.
-- Existing rows stay at full price.
--
-- Apply this in the Supabase SQL editor. The app does not run it.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS leader_half_price BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN bookings.leader_half_price IS 'When true, only the organiser pays half the price per person. Other guests stay at the full price. The beading tour price is headcount minus a half, times the price per person, unless a different total was typed.';
