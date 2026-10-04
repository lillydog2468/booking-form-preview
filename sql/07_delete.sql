-- Delete a booking by ID

DELETE FROM bookings
WHERE id = :id
RETURNING *;

-- Delete all bookings (use with caution)
-- DELETE FROM bookings;
