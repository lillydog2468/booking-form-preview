-- Saved map pin for a place in the Places directory.
--
-- Nullable. Existing rows stay as they are (no pin until someone drags the
-- marker). Safe to re-run. Does not add a table and does not rewrite addresses.
--
-- The planner still works before this is applied: the pin is kept on the
-- device and left out of the Supabase write until these columns exist.

ALTER TABLE planner_places ADD COLUMN IF NOT EXISTS pin_lat DOUBLE PRECISION;
ALTER TABLE planner_places ADD COLUMN IF NOT EXISTS pin_lng DOUBLE PRECISION;
ALTER TABLE planner_places ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ;

COMMENT ON COLUMN planner_places.pin_lat IS
  'Latitude of the pin dragged on the place map. Null means Navigate uses the address text.';
COMMENT ON COLUMN planner_places.pin_lng IS
  'Longitude of the pin dragged on the place map. Null means Navigate uses the address text.';
COMMENT ON COLUMN planner_places.pin_set_at IS
  'When the pin was saved. Null when the pin has been cleared.';
