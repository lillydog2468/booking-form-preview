-- Update an existing booking by ID (main record only)
-- For child tables, delete existing rows and re-insert

UPDATE bookings SET
  group_name                  = :group_name,
  hotel_id                    = :hotel_id,
  no_people                   = :no_people,
  price_per_person            = :price_per_person,
  price_per_person_currency   = :price_per_person_currency,
  tour_arrival_date           = :tour_arrival_date,
  departure_date              = :departure_date,
  deposit_paid_date           = :deposit_paid_date,
  final_payment_date          = :final_payment_date,
  fuelcost                    = :fuelcost,
  fuelcost_currency           = :fuelcost_currency,
  other_hotel_nights          = :other_hotel_nights,
  depositmade                 = :depositmade,
  depositmade_currency        = :depositmade_currency,
  finalpayment                = :finalpayment,
  finalpayment_currency       = :finalpayment_currency,
  left_to_pay                 = :left_to_pay,
  beading_tour_price          = :beading_tour_price,
  beading_tour_price_currency = :beading_tour_price_currency,
  totalexpenses               = :totalexpenses,
  totalprofit                 = :totalprofit,
  totalcost                   = :totalcost,
  extra_notes                 = :extra_notes
WHERE id = :id
RETURNING *;

-- Then refresh child records:
--
-- DELETE FROM members WHERE booking_id = :id;
-- INSERT INTO members (booking_id, first_name, last_name) VALUES ...
--
-- DELETE FROM flights WHERE booking_id = :id;
-- INSERT INTO flights (booking_id, flight_number, arrival_date, arrival_time, departure_date, departure_time, comments) VALUES ...
--
-- DELETE FROM booking_expenses WHERE booking_id = :id;
-- Hotel expenses:
-- INSERT INTO booking_expenses (booking_id, hotel_id, custom_hotel_name, cost, currency, comments) VALUES ...
-- Additional expenses:
-- INSERT INTO booking_expenses (booking_id, description, cost, currency, comments) VALUES ...
