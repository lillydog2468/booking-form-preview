-- Hotels table — managed from the Admin page
-- Hotels are available for selection in both the Hotels and Expenses sections of the booking form

CREATE TABLE IF NOT EXISTS hotels (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed with a default hotel
INSERT INTO hotels (name) VALUES ('Na Basta') ON CONFLICT (name) DO NOTHING;

-- RLS
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for all authenticated users"
  ON hotels FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow admin full access"
  ON hotels FOR ALL
  TO authenticated
  USING (is_admin());
