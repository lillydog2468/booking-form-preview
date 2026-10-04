-- Creates the bookings table in Supabase (PostgreSQL)
-- Run 11_hotels_table.sql FIRST (bookings.hotel_id references hotels)
-- Members, flights, and expenses are in separate child tables (12–14)

CREATE TABLE IF NOT EXISTS bookings (
  id                          SERIAL PRIMARY KEY,
  group_name                  TEXT,
  hotel_id                    INT REFERENCES hotels(id),
  no_people                   TEXT,
  price_per_person            NUMERIC,
  price_per_person_currency   TEXT DEFAULT 'GBP',
  tour_arrival_date           DATE,
  departure_date              DATE,
  deposit_paid_date           DATE,
  final_payment_date          DATE,
  fuelcost                    NUMERIC,
  fuelcost_currency           TEXT DEFAULT 'GBP',
  other_hotel_nights          TEXT,
  depositmade                 NUMERIC,
  depositmade_currency        TEXT DEFAULT 'GBP',
  finalpayment                NUMERIC,
  finalpayment_currency       TEXT DEFAULT 'GBP',
  left_to_pay                 NUMERIC,
  beading_tour_price          NUMERIC,
  beading_tour_price_currency TEXT DEFAULT 'GBP',
  totalexpenses               NUMERIC,
  totalprofit                 NUMERIC,
  totalcost                   NUMERIC,
  extra_notes                 TEXT,
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
