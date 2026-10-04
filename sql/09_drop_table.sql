-- Drop all tables and related objects
-- WARNING: This is destructive and cannot be undone

-- Drop child tables first (they reference bookings)
DROP TABLE IF EXISTS booking_expenses;
DROP TABLE IF EXISTS flights;
DROP TABLE IF EXISTS members;

-- Drop trigger on bookings
DROP TRIGGER IF EXISTS bookings_updated_at ON bookings;
DROP FUNCTION IF EXISTS update_updated_at();

-- Drop main tables
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS hotels;
