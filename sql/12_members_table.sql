-- Members table — each member belongs to a booking and has a unique ID
-- Replaces the old members_names TEXT column on bookings

CREATE TABLE IF NOT EXISTS members (
  id          SERIAL PRIMARY KEY,
  booking_id  INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  first_name  TEXT,
  last_name   TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_booking ON members(booking_id);

-- RLS
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read/write for members"
  ON members FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
