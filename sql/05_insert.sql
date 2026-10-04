-- Insert a new booking (main record only)
-- Members, flights, and expenses are inserted into their own tables using the returned booking ID

INSERT INTO bookings (
  group_name,
  hotel_id,
  no_people,
  price_per_person,
  price_per_person_currency,
  tour_arrival_date,
  departure_date,
  deposit_paid_date,
  final_payment_date,
  fuelcost,
  fuelcost_currency,
  other_hotel_nights,
  depositmade,
  depositmade_currency,
  finalpayment,
  finalpayment_currency,
  left_to_pay,
  beading_tour_price,
  beading_tour_price_currency,
  totalexpenses,
  totalprofit,
  totalcost,
  extra_notes
) VALUES (
  :group_name,
  :hotel_id,
  :no_people,
  :price_per_person,
  :price_per_person_currency,
  :tour_arrival_date,
  :departure_date,
  :deposit_paid_date,
  :final_payment_date,
  :fuelcost,
  :fuelcost_currency,
  :other_hotel_nights,
  :depositmade,
  :depositmade_currency,
  :finalpayment,
  :finalpayment_currency,
  :left_to_pay,
  :beading_tour_price,
  :beading_tour_price_currency,
  :totalexpenses,
  :totalprofit,
  :totalcost,
  :extra_notes
)
RETURNING *;

-- Then insert child records using the returned id:
--
-- INSERT INTO members (booking_id, first_name, last_name)
-- VALUES (:booking_id, :first_name, :last_name);
--
-- INSERT INTO flights (booking_id, flight_number, arrival_date, arrival_time, departure_date, departure_time, comments)
-- VALUES (:booking_id, :flight_number, :arrival_date, :arrival_time, :departure_date, :departure_time, :comments);
--
-- Hotel expense:
-- INSERT INTO booking_expenses (booking_id, hotel_id, custom_hotel_name, cost, currency, comments)
-- VALUES (:booking_id, :hotel_id, :custom_hotel_name, :cost, :currency, :comments);
--
-- Additional expense:
-- INSERT INTO booking_expenses (booking_id, description, cost, currency, comments)
-- VALUES (:booking_id, :description, :cost, :currency, :comments);
