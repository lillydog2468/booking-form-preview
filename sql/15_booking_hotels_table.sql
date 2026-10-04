-- Booking hotels table — multiple hotel stays per booking
-- Stores additional hotels (beyond bookings.hotel_id) with optional custom name and nights.

CREATE TABLE IF NOT EXISTS booking_hotels (
  id                SERIAL PRIMARY KEY,
  booking_id        INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  hotel_id          INT REFERENCES hotels(id),
  custom_hotel_name TEXT,
  nights            TEXT,
  sort_order        INT DEFAULT 1,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_hotels_booking ON booking_hotels(booking_id);

-- RLS
ALTER TABLE booking_hotels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read/write for booking_hotels"
  ON booking_hotels FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

