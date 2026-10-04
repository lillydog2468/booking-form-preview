-- Flights table — structured flight details per booking
-- Replaces the old flight_details TEXT column on bookings
-- Supports multiple flights (inbound and outbound) per booking

CREATE TABLE IF NOT EXISTS flights (
  id              SERIAL PRIMARY KEY,
  booking_id      INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  flight_number   TEXT,
  arrival_date    DATE,
  arrival_time    TIME,
  departure_date  DATE,
  departure_time  TIME,
  comments        TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flights_booking ON flights(booking_id);

-- RLS
ALTER TABLE flights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read/write for flights"
  ON flights FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
