-- Useful SELECT queries

-- ── Bookings with hotel name ──
SELECT b.*, h.name AS hotel_name
FROM bookings b
LEFT JOIN hotels h ON h.id = b.hotel_id
ORDER BY b.tour_arrival_date DESC;

-- ── Single booking with all child data ──
SELECT b.*, h.name AS hotel_name
FROM bookings b
LEFT JOIN hotels h ON h.id = b.hotel_id
WHERE b.id = :id;

SELECT * FROM members     WHERE booking_id = :id ORDER BY id;
SELECT * FROM flights     WHERE booking_id = :id ORDER BY id;
SELECT be.*, h.name AS hotel_name
FROM booking_expenses be
LEFT JOIN hotels h ON h.id = be.hotel_id
WHERE be.booking_id = :id ORDER BY be.id;

-- ── Search bookings by group name (case-insensitive) ──
SELECT b.*, h.name AS hotel_name
FROM bookings b
LEFT JOIN hotels h ON h.id = b.hotel_id
WHERE b.group_name ILIKE '%' || :search || '%'
ORDER BY b.tour_arrival_date DESC;

-- ── Upcoming bookings ──
SELECT b.*, h.name AS hotel_name
FROM bookings b
LEFT JOIN hotels h ON h.id = b.hotel_id
WHERE b.tour_arrival_date >= CURRENT_DATE
ORDER BY b.tour_arrival_date ASC;

-- ── Bookings with outstanding payments ──
SELECT id, group_name, tour_arrival_date, left_to_pay
FROM bookings
WHERE left_to_pay > 0
ORDER BY tour_arrival_date ASC;

-- ── Summary totals ──
SELECT
  COUNT(*)            AS total_bookings,
  SUM(totalcost)      AS total_cost,
  SUM(totalexpenses)  AS total_expenses,
  SUM(totalprofit)    AS total_profit,
  SUM(left_to_pay)    AS total_outstanding
FROM bookings;

-- ── All hotels ──
SELECT * FROM hotels ORDER BY name;
