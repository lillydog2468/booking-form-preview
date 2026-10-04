-- People directory for tour-planner.html (Keith’s guests / ladies)
--
-- Matches live Booking Supabase schema (project ojulhplswtcmheonsnlv).
-- Public RLS mirrors planner_places so the planner can load/save with the anon key.
-- Safe to re-run: CREATE IF NOT EXISTS + policy guards.
-- No seed rows — people are absorbed from booking-linked plan.guests (or added by hand).

CREATE TABLE IF NOT EXISTS planner_people (
  id           BIGSERIAL PRIMARY KEY,
  client_id    TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  email        TEXT,
  notes        TEXT,
  visit_count    INT NOT NULL DEFAULT 0,
  visit_refs     JSONB NOT NULL DEFAULT '[]'::jsonb,
  travelled_with JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE planner_people ADD COLUMN IF NOT EXISTS travelled_with JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN planner_people.travelled_with IS 'Optional manual companion client_ids; UI also derives from shared visit booking_ids';

CREATE INDEX IF NOT EXISTS idx_planner_people_email
  ON planner_people ((lower(email)))
  WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS idx_planner_people_name
  ON planner_people ((lower(name)));

ALTER TABLE planner_people ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'planner_people' AND policyname = 'Allow public read planner_people'
  ) THEN
    CREATE POLICY "Allow public read planner_people" ON planner_people FOR SELECT TO public USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'planner_people' AND policyname = 'Allow public insert planner_people'
  ) THEN
    CREATE POLICY "Allow public insert planner_people" ON planner_people FOR INSERT TO public WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'planner_people' AND policyname = 'Allow public update planner_people'
  ) THEN
    CREATE POLICY "Allow public update planner_people" ON planner_people FOR UPDATE TO public USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'planner_people' AND policyname = 'Allow public delete planner_people'
  ) THEN
    CREATE POLICY "Allow public delete planner_people" ON planner_people FOR DELETE TO public USING (true);
  END IF;
END $$;
