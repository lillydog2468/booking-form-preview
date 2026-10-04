-- Optional indexes to speed up common queries

CREATE INDEX IF NOT EXISTS idx_bookings_group_name
  ON bookings (group_name);

CREATE INDEX IF NOT EXISTS idx_bookings_tour_arrival_date
  ON bookings (tour_arrival_date DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_left_to_pay
  ON bookings (left_to_pay)
  WHERE left_to_pay > 0;

CREATE INDEX IF NOT EXISTS idx_bookings_hotel_id
  ON bookings (hotel_id);
