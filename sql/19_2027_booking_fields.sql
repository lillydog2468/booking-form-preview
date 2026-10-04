-- Optional columns for the 2027 booking fields.
--
-- DO NOT RUN THIS for booking-form.html or tour-planner.html to work.
-- Those pages already store the extra detail without these columns:
--   * bookings.extra_notes  — human notes, then a <<<BOOKING_EXTRAS_JSON>>> block
--   * planner_plans.payload.bookingDetails — the same object (see booking-extras.js)
--   * planner localStorage, if planner_plans is missing
--
-- Guests in the planner keep linking to People with payload.guests[].personId
-- (planner_people.client_id). This file does not change that.
--
-- Safe to re-run if you later choose to promote the JSON into columns.
-- Nothing here is required by the application.

ALTER TABLE members ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS organiser_first_name TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS organiser_last_name TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS organiser_email TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room_singles INT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room_twins INT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room_doubles INT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS keith_own_room BOOLEAN;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency_note TEXT;

COMMENT ON COLUMN members.email IS 'Optional. The live form stores guest email in extra_notes JSON until this column is in use.';
COMMENT ON COLUMN bookings.organiser_first_name IS 'Optional. Organiser is a person, separate from group_name. Live form uses extra_notes JSON.';
COMMENT ON COLUMN bookings.organiser_last_name IS 'Optional surname. Live form uses extra_notes JSON.';
COMMENT ON COLUMN bookings.organiser_email IS 'Optional. Live form uses extra_notes JSON.';
COMMENT ON COLUMN bookings.room_singles IS 'Optional guest singles. Keith''s room is keith_own_room and is not part of the bed count.';
COMMENT ON COLUMN bookings.room_twins IS 'Optional twin rooms (2 guests each).';
COMMENT ON COLUMN bookings.room_doubles IS 'Optional double rooms (2 guests each).';
COMMENT ON COLUMN bookings.keith_own_room IS 'Optional. True when Keith has his own room, separate from the guest bed count.';
COMMENT ON COLUMN bookings.payment_method IS 'Optional: cash, bank, paypal, wise. Live form uses extra_notes JSON.';
COMMENT ON COLUMN bookings.currency_note IS 'Optional free text for a CZK or EUR amount. Prices stay in GBP.';

-- Refresh the plan payload comment only when the planner table already exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'planner_plans' AND column_name = 'payload'
  ) THEN
    EXECUTE $c$COMMENT ON COLUMN planner_plans.payload IS
      'JSON plan document. Optional payload.sharedAlbums. Guests may include personId linking to planner_people.client_id. Optional payload.bookingDetails mirrors the BOOKING_EXTRAS_JSON block in bookings.extra_notes. See sql/19_2027_booking_fields.sql.'$c$;
  END IF;
END $$;
