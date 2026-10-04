-- Optional status for a booking.
--
-- DO NOT RUN THIS for tax-summary.html to work.
-- The tax page reads bookings.status when the column is present and filled in
-- with one of: cancelled, unconfirmed, duplicate, companion.
-- When the column is missing, or the value is blank, the page uses a built-in
-- id list in tax-summary.js (taxSummaryExclusion / BUILTIN_BOOKING_STATUS):
--   cancelled:   137, 141
--   unconfirmed: 138, 139
--   duplicate:   165, 205, 207, 243
--   companion:   254 and 255 (belong to 253), 260 (to 259), 263 (to 262)
--
-- A filled-in status wins over that list. Safe to re-run.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IS NULL OR status IN ('cancelled', 'unconfirmed', 'duplicate', 'companion'));

COMMENT ON COLUMN bookings.status IS
  'Optional. cancelled, unconfirmed, duplicate or companion. Null is a normal booking. tax-summary.html uses this when set, otherwise its built-in id list. See sql/20_booking_status.sql.';
