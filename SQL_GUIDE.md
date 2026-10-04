# SQL Files — Step-by-Step Guide

This document explains every SQL file in the `sql/` folder: what it does, why it exists, and in what order to run them.

---

## Database Schema Overview

```
┌───────────────────┐
│    auth.users      │  (Supabase built-in)
│    (email, pass)   │
└────────┬──────────┘
         │ id (UUID)
         ▼
┌───────────────────┐
│     profiles       │  User roles & status
│  (role, status)    │  (10_profiles_table)
└───────────────────┘

┌───────────────────┐
│      hotels        │  Admin-managed hotel list
│  (name)            │  (11_hotels_table)
└────────┬──────────┘
         │ id
         ▼
┌───────────────────┐       ┌───────────────────┐
│     bookings       │──────►│     members        │
│  (group, dates,    │       │  (first, last name)│
│   prices, totals)  │       │  (12_members_table) │
│  (01_create_table) │       └───────────────────┘
│                    │       ┌───────────────────┐
│                    │──────►│     flights        │
│                    │       │  (number, dates,   │
│                    │       │   times, comments) │
│                    │       │  (13_flights_table) │
│                    │       └───────────────────┘
│                    │       ┌───────────────────┐
│                    │──────►│  booking_hotels    │
│                    │       │  (hotel/custom,    │
│                    │       │   nights, order)   │
│                    │       │ (15_booking_hotels)│
│                    │       └───────────────────┘
│                    │       ┌───────────────────┐
│                    │──────►│ booking_expenses   │
│                    │       │  (hotel or custom, │
│                    │       │   cost, currency,  │
│                    │       │   comments)        │
└───────────────────┘       │ (14_booking_exp.)  │
                            └───────────────────┘
```

All child tables (`members`, `flights`, `booking_expenses`) use `ON DELETE CASCADE`, so deleting a booking automatically removes its related records.

---

## Execution Order

Run these in the Supabase **SQL Editor** in the order below. The order matters because of foreign key dependencies.

| Step | File | Depends on |
|------|------|------------|
| 1 | `02_updated_at_trigger.sql` | Nothing |
| 2 | `10_profiles_table.sql` | `auth.users` (built-in), trigger from step 1 |
| 3 | `11_hotels_table.sql` | `profiles` from step 2 (for RLS) |
| 4 | `01_create_table.sql` | `hotels` from step 3 |
| 5 | `02` trigger already covers bookings | — |
| 6 | `03_rls_policies.sql` | `bookings` from step 4 |
| 7 | `12_members_table.sql` | `bookings` from step 4 |
| 8 | `13_flights_table.sql` | `bookings` from step 4 |
| 9 | `14_booking_expenses_table.sql` | `bookings` from step 4, `hotels` from step 3 |
| 10 | `15_booking_hotels_table.sql` | `bookings` from step 4, `hotels` from step 3 |
| 11 | `08_indexes.sql` | `bookings` from step 4 |
| — | `16_tour_planner_tables.sql` | **Optional.** Place catalogue and plan storage for the planner. Sign-in is required on the planner page either way. |
| — | `17_planner_people.sql` | **Optional.** People directory (`planner_people`) for `tour-planner.html`. |
| — | `18_planner_shared_albums.sql` | **Optional comment only.** Documents `payload.sharedAlbums` on `planner_plans` — no new table. |
| — | `19_2027_booking_fields.sql` | **Optional. Do not run it for the pages to work.** Documents extra columns for guest email, rooms, payment method and similar. The booking form and planner already store those details without these columns. |
| — | `20_booking_status.sql` | **Optional. Do not run it for the tax summary to work.** Adds nullable `bookings.status` (`cancelled`, `unconfirmed`, `duplicate`, `companion`). The tax page uses the column when it is filled in, and a built-in id list when it is not. |
| — | `21_planner_place_categories.sql` | **Run this so a place can have more than one category.** Adds nullable `planner_places.place_types`. Does not change or delete existing rows. A null list means the place still has only `place_type`. |

Files 04–07 are **reference queries** (SELECT, INSERT, UPDATE, DELETE) — you don't need to run them during setup. They're templates for your application code.

### Optional — `16_tour_planner_tables.sql`

Work-in-progress tables for `tour-planner.html`:

- `planner_places` — the factory / restaurant / experience catalogue
- `planner_plans` — one JSON document per booking (guest list + day timelines + optional `payload.sharedAlbums`)

**`payload.sharedAlbums`** (no extra column) — array of `{ "name": string, "url"?: string, "albumId"?: string }` for shared iCloud / iPhoto albums. Tour Archivist can upsert this on archive plans. See `sql/18_planner_shared_albums.sql`. Guests on the same payload may include `personId` = `planner_people.client_id`.

Run this when you want plans and the place catalogue stored in Supabase. The planner opens on your own tours after you sign in. If the tables are missing, a signed-in session still keeps a copy of plans in local storage on this device.

### `21_planner_place_categories.sql`

Adds `planner_places.place_types` (`TEXT[]`, nullable) so one place can be, for example, a factory and an experience, or a viewpoint and a restaurant.

- `place_type` stays the primary category. Rows already in the table are left as they are.
- A null `place_types` means “only `place_type`”. The planner reads that the same way it always read a single category.
- Snack is a supermarket or a bakery, not a restaurant. Antique and Viewpoint are the other new categories. Existing labels (Hotel, Factory, Shop, Restaurant, Experience, Museum, School, Other) are unchanged.
- Safe to re-run. It does not delete rows and it does not rewrite `place_type`.

`sql/16_tour_planner_tables.sql` creates the same column on a fresh database. Run `21` on a database that already has `planner_places`.

### Optional — `19_2027_booking_fields.sql`

**Do not run this file for the booking form or the planner to work.** It is not part of the setup order above.

The 2027 fields (every guest’s email, room plan, pick-up, hotel paid status, payment method, interests, diet, mobility, consent, and a link to another group) are stored in two places that already exist:

- `bookings.extra_notes` — human notes, then a `<<<BOOKING_EXTRAS_JSON>>>` block
- `planner_plans.payload.bookingDetails` — the same object on the plan (or `localStorage` if the plan table is missing)

`sql/19_2027_booking_fields.sql` only adds real columns (`members.email`, room counts, payment method, and so on) for a later migration. The pages never read or write those columns, so a database that has not run the file behaves the same.

### Optional — `20_booking_status.sql`

**Do not run this file for the tax summary to work.** It is not part of the setup order above.

`tax-summary.html` reads `bookings.status` when that column exists and the value is `cancelled`, `unconfirmed`, `duplicate` or `companion`. A blank status, or a database that has not had the column added, uses the built-in id list in `tax-summary.js`:

| Status | Booking ids | What the tax page does |
| --- | --- | --- |
| cancelled | 137, 141 | Hidden. Listed under Excluded rows. |
| unconfirmed | 138, 139 | Shown greyed, with a label. Left out of the totals. |
| duplicate | 165, 205, 207, 243 | Hidden. Listed under Excluded rows. |
| companion | 254 and 255 (with 253), 260 (with 259), 263 (with 262) | Shown greyed under the main booking. Money is included in the totals only when the companion row itself has a non-zero amount, and the row is flagged “check: companion with own money”. |

If you later fill in `status`, that value is used instead of the id list.

---

## Step 1 — `02_updated_at_trigger.sql`

**What it does:** Creates a reusable trigger function called `update_updated_at()`. Whenever a row is updated in any table that uses this trigger, the `updated_at` column is automatically set to the current timestamp.

**Why it's first:** Multiple tables use this function (bookings, profiles), so it must exist before those tables are created.

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

> **Note:** The trigger `bookings_updated_at` references the `bookings` table. If you run this before creating `bookings`, the trigger creation will fail. You can either: (a) run the `CREATE FUNCTION` part first, then come back and run the `CREATE TRIGGER` part after step 4, or (b) just run the full file after step 4. The function itself has no dependencies.

**Recommendation:** Run only the `CREATE FUNCTION` part in step 1. Run the `CREATE TRIGGER` part after step 4.

---

## Step 2 — `10_profiles_table.sql`

**What it does:** Creates the `profiles` table that stores user information (email, role, status). It links to Supabase's built-in `auth.users` table via a UUID foreign key.

**Key features:**
- **Auto-profile creation:** A trigger (`on_auth_user_created`) fires whenever a new user signs up through Supabase Auth. It automatically inserts a `profiles` row with `role = 'user'` and `status = 'active'`.
- **Role system:** Two roles — `admin` and `user`. Enforced by a `CHECK` constraint.
- **Status system:** `active` or `disabled`. Disabled users can be blocked from logging in.
- **RLS policies:** Regular users can only read their own profile. Admins can read, update, and delete any profile.

```sql
-- The profiles table links to Supabase's auth system
CREATE TABLE IF NOT EXISTS profiles (
  id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email  TEXT NOT NULL,
  role   TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  ...
);
```

**After running:** Your first admin user must be promoted manually. See the `DEPLOY.md` guide for instructions.

---

## Step 3 — `11_hotels_table.sql`

**What it does:** Creates the `hotels` table. Hotels are managed from the admin page and appear as dropdown options in the booking form (both in the Hotels section and the Expenses section).

**Key features:**
- `name` has a `UNIQUE` constraint — no duplicate hotel names.
- Seeds one default hotel: `Na Basta`.
- **RLS:** All authenticated users can read hotels. Only admins can create, update, or delete them.

```sql
CREATE TABLE IF NOT EXISTS hotels (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO hotels (name) VALUES ('Na Basta') ON CONFLICT (name) DO NOTHING;
```

---

## Step 4 — `01_create_table.sql`

**What it does:** Creates the main `bookings` table. This is the central table of the application.

**Columns explained:**

| Column | Type | Purpose |
|--------|------|---------|
| `id` | SERIAL | Auto-incrementing primary key |
| `group_name` | TEXT | Name of the booking group |
| `hotel_id` | INT (FK) | References the selected hotel from the `hotels` table |
| `no_people` | TEXT | Number of people in the group |
| `price_per_person` | NUMERIC | Cost per person |
| `price_per_person_currency` | TEXT | Currency for price per person (CZK or GBP) |
| `tour_arrival_date` | DATE | When the group arrives |
| `departure_date` | DATE | When the group leaves |
| `deposit_paid_date` | DATE | When the deposit was paid |
| `final_payment_date` | DATE | When the final payment was made |
| `fuelcost` | NUMERIC | Fuel expenses |
| `fuelcost_currency` | TEXT | Currency for fuel cost |
| `other_hotel_nights` | TEXT | Free text for other hotel night details |
| `depositmade` | NUMERIC | Amount of deposit paid |
| `depositmade_currency` | TEXT | Currency for deposit |
| `finalpayment` | NUMERIC | Final payment amount |
| `finalpayment_currency` | TEXT | Currency for final payment |
| `left_to_pay` | NUMERIC | Computed: tour price minus total payments |
| `beading_tour_price` | NUMERIC | Total tour price |
| `beading_tour_price_currency` | TEXT | Currency for tour price |
| `totalexpenses` | NUMERIC | Computed: sum of all expenses |
| `totalprofit` | NUMERIC | Computed: payments minus expenses |
| `totalcost` | NUMERIC | Computed: tour price plus expenses |
| `extra_notes` | TEXT | Free-text notes |
| `created_at` | TIMESTAMPTZ | Auto-set on insert |
| `updated_at` | TIMESTAMPTZ | Auto-updated via trigger |

**Currency columns:** Each monetary field has a companion `_currency` column (defaults to `'GBP'`) so you can record whether each amount is in GBP or CZK independently.

> **After running this:** Go back and run the `CREATE TRIGGER bookings_updated_at` part from `02_updated_at_trigger.sql` if you skipped it earlier.

---

## Step 5 — `03_rls_policies.sql`

**What it does:** Enables Row Level Security (RLS) on the `bookings` table and creates access policies.

**Default policies (development):** Allow full public CRUD access — anyone can read, insert, update, and delete bookings. This is convenient for development/testing.

**Production policies (commented out):** Restrict access to authenticated users only. You should switch to these before going live. See `DEPLOY.md` Step 6 for instructions.

```sql
-- Development (permissive):
CREATE POLICY "Allow public read" ON bookings FOR SELECT USING (true);

-- Production (recommended):
-- CREATE POLICY "Authenticated read" ON bookings
--   FOR SELECT TO authenticated USING (true);
```

---

## Steps 6–8 — Child Tables

### `12_members_table.sql` — Members

Each booking can have multiple members (one-to-many). Each member has a first name and last name.

```sql
CREATE TABLE IF NOT EXISTS members (
  id          SERIAL PRIMARY KEY,
  booking_id  INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  first_name  TEXT,
  last_name   TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### `13_flights_table.sql` — Flights

Each booking can have multiple flights (inbound, outbound, etc.). Each flight has structured fields plus a free-text comments field.

```sql
CREATE TABLE IF NOT EXISTS flights (
  id              SERIAL PRIMARY KEY,
  booking_id      INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  flight_number   TEXT,
  arrival_date    DATE,
  arrival_time    TIME,
  departure_date  DATE,
  departure_time  TIME,
  comments        TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### `14_booking_expenses_table.sql` — Expenses

Each booking can have multiple expense line items. There are two types stored in the same table:

| Type | How to identify | Example |
|------|----------------|---------|
| **Hotel expense** | `hotel_id` is set (or `custom_hotel_name` for "Other") | Hotel Na Basta — 5000 CZK |
| **Additional expense** | `description` is set, no hotel reference | Parking — 200 CZK |

Both types can have a `currency` (CZK/GBP) and optional `comments`.

```sql
CREATE TABLE IF NOT EXISTS booking_expenses (
  id                SERIAL PRIMARY KEY,
  booking_id        INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  hotel_id          INT REFERENCES hotels(id),
  custom_hotel_name TEXT,
  description       TEXT,
  cost              NUMERIC DEFAULT 0,
  currency          TEXT DEFAULT 'CZK',
  comments          TEXT,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

All three child tables have:
- An index on `booking_id` for fast lookups
- `ON DELETE CASCADE` so deleting a booking cleans up related records
- RLS policies (currently public, tighten for production)

---

## Step 9 — `08_indexes.sql`

**What it does:** Adds performance indexes on the `bookings` table for common query patterns.

| Index | Column(s) | Speeds up |
|-------|-----------|-----------|
| `idx_bookings_group_name` | `group_name` | Searching by group name |
| `idx_bookings_tour_arrival_date` | `tour_arrival_date DESC` | Sorting by arrival date |
| `idx_bookings_left_to_pay` | `left_to_pay` (partial, > 0) | Finding unpaid bookings |
| `idx_bookings_hotel_id` | `hotel_id` | Filtering by hotel |

These are optional but recommended. They improve query performance as your data grows.

---

## Reference Files (not run during setup)

### `04_select_queries.sql`

A collection of useful SELECT queries you can copy into your code or run manually:
- List all bookings with hotel names
- Fetch a single booking with all child data (members, flights, expenses)
- Search by group name
- Find upcoming bookings
- Find bookings with outstanding payments
- Summary totals (total bookings, cost, profit, etc.)

### `05_insert.sql`

Template for inserting a new booking. Shows the main `INSERT INTO bookings` statement followed by commented examples for inserting child records (members, flights, expenses).

### `06_update.sql`

Template for updating a booking. The pattern is:
1. `UPDATE bookings SET ... WHERE id = :id`
2. Delete all child records for that booking
3. Re-insert the updated child records

This "delete and re-insert" approach for child tables is simpler than tracking individual row changes.

### `07_delete.sql`

Simple `DELETE FROM bookings WHERE id = :id`. Child records are removed automatically via `ON DELETE CASCADE`.

---

## Cleanup — `09_drop_table.sql`

**WARNING: Destructive.** Drops all tables and related objects. Only use this if you want to start fresh.

The order matters — child tables are dropped first to avoid foreign key errors:

```
booking_expenses → flights → members → bookings → hotels
```

---

## Quick Reference — Table Relationships

```
auth.users  ──(1:1)──►  profiles
hotels      ──(1:many)──►  bookings (via hotel_id)
hotels      ──(1:many)──►  booking_expenses (via hotel_id)
bookings    ──(1:many)──►  members
bookings    ──(1:many)──►  flights
bookings    ──(1:many)──►  booking_expenses
```

## Quick Reference — All Tables

| Table | Rows per booking | Managed from |
|-------|-----------------|--------------|
| `profiles` | N/A (one per user) | Admin page |
| `hotels` | N/A (global list) | Admin page |
| `bookings` | 1 | Booking form |
| `members` | 1+ per booking | Booking form |
| `flights` | 0+ per booking | Booking form |
| `booking_expenses` | 0+ per booking | Booking form |
| `planner_places` | N/A (global catalogue, optional) | Tour planner (or SQL seed) |
| `planner_plans` | 0–1 per booking (optional) | Tour planner (`payload` JSON, including optional `sharedAlbums`) |
| `planner_people` | N/A (global directory, optional) | Tour planner |
