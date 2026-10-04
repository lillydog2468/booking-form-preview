-- Booking expenses table — hotel costs and additional expenses per booking
-- Replaces the old jablonechotelcost and prahaotherhotelcost columns on bookings
--
-- Hotel expenses:      hotel_id or custom_hotel_name is set
-- Additional expenses: description is set (no hotel reference)
-- Both types can have an optional comments field

CREATE TABLE IF NOT EXISTS booking_expenses (
  id                SERIAL PRIMARY KEY,
  booking_id        INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  hotel_id          INT REFERENCES hotels(id),
  custom_hotel_name TEXT,
  description       TEXT,
  cost              NUMERIC DEFAULT 0,
  currency          TEXT DEFAULT 'GBP',
  comments          TEXT,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_expenses_booking ON booking_expenses(booking_id);

-- RLS
ALTER TABLE booking_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read/write for booking_expenses"
  ON booking_expenses FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
