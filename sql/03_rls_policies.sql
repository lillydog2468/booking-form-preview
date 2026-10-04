-- Row Level Security policies for Supabase
-- Adjust these based on your auth strategy

-- Enable RLS on the bookings table
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous read access (public bookings)
CREATE POLICY "Allow public read" ON bookings
  FOR SELECT
  USING (true);

-- Policy: Allow anonymous insert
CREATE POLICY "Allow public insert" ON bookings
  FOR INSERT
  WITH CHECK (true);

-- Policy: Allow anonymous update
CREATE POLICY "Allow public update" ON bookings
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policy: Allow anonymous delete
CREATE POLICY "Allow public delete" ON bookings
  FOR DELETE
  USING (true);

-- NOTE: The above policies allow full public CRUD access.
-- For production, restrict these to authenticated users:
--
-- CREATE POLICY "Authenticated read" ON bookings
--   FOR SELECT TO authenticated
--   USING (true);
--
-- CREATE POLICY "Authenticated insert" ON bookings
--   FOR INSERT TO authenticated
--   WITH CHECK (true);
--
-- CREATE POLICY "Authenticated update" ON bookings
--   FOR UPDATE TO authenticated
--   USING (true) WITH CHECK (true);
--
-- CREATE POLICY "Authenticated delete" ON bookings
--   FOR DELETE TO authenticated
--   USING (true);
