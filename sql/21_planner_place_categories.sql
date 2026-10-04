-- More than one category on a place.
--
-- planner_places.place_type stays a single text value: the primary category.
-- Existing rows are not updated and are not deleted. A null place_types means
-- the place only has place_type, which is how every current row is stored.
--
-- When Keith ticks a second category, the planner writes the full list here
-- (for example {factory,experience} or {viewpoint,restaurant}) and leaves
-- place_type as the category the place already had. A factory or a viewpoint
-- does not become a hotel because it gained another category.
--
-- Safe to re-run.

ALTER TABLE planner_places ADD COLUMN IF NOT EXISTS place_types TEXT[];

COMMENT ON COLUMN planner_places.place_type IS
  'Primary category (hotel, factory, shop, antique, restaurant, snack, experience, museum, school, viewpoint, other). Existing rows keep the value they already have.';

COMMENT ON COLUMN planner_places.place_types IS
  'Every category for this place. Null means the single place_type value is the only category. Example: {factory,experience}. Snack is a supermarket or bakery, not a restaurant.';

CREATE INDEX IF NOT EXISTS idx_planner_places_types ON planner_places USING GIN (place_types);
