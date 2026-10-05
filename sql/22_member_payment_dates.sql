-- Per-guest payment dates on members.
-- Amounts already live in members.deposit and members.final_payment (both nullable numeric).
-- Applied to the live database as migration add_member_payment_dates.
-- Nullable and additive: existing member rows stay valid with both dates empty.

ALTER TABLE members ADD COLUMN IF NOT EXISTS deposit_date DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS final_payment_date DATE;

COMMENT ON COLUMN members.deposit_date IS 'Date this guest''s deposit was paid. Nullable.';
COMMENT ON COLUMN members.final_payment_date IS 'Date this guest''s final payment was paid. Nullable.';
