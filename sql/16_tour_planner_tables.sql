-- Tour-group day planner tables (tour-planner.html)
--
-- Matches the live Booking Supabase schema (project ojulhplswtcmheonsnlv).
-- Public RLS mirrors bookings so the planner can load/save with the anon key.
-- Safe to re-run: CREATE IF NOT EXISTS + upsert seed by client_id.

CREATE TABLE IF NOT EXISTS planner_places (
  id              BIGSERIAL PRIMARY KEY,
  client_id       TEXT UNIQUE,
  name            TEXT NOT NULL,
  place_type      TEXT NOT NULL DEFAULT 'other',
  place_types     TEXT[],
  contact_method  TEXT,
  contact_detail  TEXT,
  address         TEXT,
  notes           TEXT,
  nickname        TEXT,
  icon            TEXT,
  sort_order      INT DEFAULT 0,
  first_visited   DATE,
  visit_count     INT NOT NULL DEFAULT 0,
  visit_years     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planner_places_type ON planner_places(place_type);
CREATE INDEX IF NOT EXISTS idx_planner_places_types ON planner_places USING GIN (place_types);
CREATE INDEX IF NOT EXISTS idx_planner_places_sort ON planner_places(sort_order);

-- Safe upgrades for existing installs (columns already live on ojulhplswtcmheonsnlv)
ALTER TABLE planner_places ADD COLUMN IF NOT EXISTS place_types TEXT[];
ALTER TABLE planner_places ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE planner_places ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE planner_places ADD COLUMN IF NOT EXISTS first_visited DATE;
ALTER TABLE planner_places ADD COLUMN IF NOT EXISTS visit_count INT NOT NULL DEFAULT 0;
ALTER TABLE planner_places ADD COLUMN IF NOT EXISTS visit_years JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN planner_places.place_type IS
  'Primary category. Existing rows keep this single value. See place_types and sql/21_planner_place_categories.sql for a second category.';
COMMENT ON COLUMN planner_places.place_types IS
  'Every category for this place. Null means place_type is the only category. Not backfilled.';
COMMENT ON COLUMN planner_places.first_visited IS 'Earliest known tour/stop date for this place';
COMMENT ON COLUMN planner_places.visit_count IS 'Total times used across all years (real plans only)';
COMMENT ON COLUMN planner_places.visit_years IS 'Optional list of years or visit refs, e.g. [2023,2026]';

-- One JSON plan per booking (or per client_key when a plan is not tied to a booking id).
CREATE TABLE IF NOT EXISTS planner_plans (
  id          BIGSERIAL PRIMARY KEY,
  booking_id  INT UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  client_key  TEXT UNIQUE,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN planner_plans.payload IS
  'JSON plan document. Optional payload.sharedAlbums = [{ "name": string, "url": string (optional), "albumId": string (optional) }]. Guests may include personId linking to planner_people.client_id. See sql/18_planner_shared_albums.sql.';

CREATE INDEX IF NOT EXISTS idx_planner_plans_booking ON planner_plans(booking_id);
CREATE INDEX IF NOT EXISTS idx_planner_plans_client ON planner_plans(client_key);

ALTER TABLE planner_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_plans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'planner_places' AND policyname = 'Allow public read planner_places'
  ) THEN
    CREATE POLICY "Allow public read planner_places" ON planner_places FOR SELECT TO public USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'planner_places' AND policyname = 'Allow public insert planner_places'
  ) THEN
    CREATE POLICY "Allow public insert planner_places" ON planner_places FOR INSERT TO public WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'planner_places' AND policyname = 'Allow public update planner_places'
  ) THEN
    CREATE POLICY "Allow public update planner_places" ON planner_places FOR UPDATE TO public USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'planner_places' AND policyname = 'Allow public delete planner_places'
  ) THEN
    CREATE POLICY "Allow public delete planner_places" ON planner_places FOR DELETE TO public USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'planner_plans' AND policyname = 'Allow public read planner_plans'
  ) THEN
    CREATE POLICY "Allow public read planner_plans" ON planner_plans FOR SELECT TO public USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'planner_plans' AND policyname = 'Allow public insert planner_plans'
  ) THEN
    CREATE POLICY "Allow public insert planner_plans" ON planner_plans FOR INSERT TO public WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'planner_plans' AND policyname = 'Allow public update planner_plans'
  ) THEN
    CREATE POLICY "Allow public update planner_plans" ON planner_plans FOR UPDATE TO public USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'planner_plans' AND policyname = 'Allow public delete planner_plans'
  ) THEN
    CREATE POLICY "Allow public delete planner_plans" ON planner_plans FOR DELETE TO public USING (true);
  END IF;
END $$;

-- Keith’s full Places catalogue (factories / shops / restaurants / experiences / museums / schools).
-- Upsert by client_id so re-runs are safe. Contact fields left empty for Keith to fill in.
INSERT INTO planner_places (client_id, name, place_type, contact_method, contact_detail, address, notes, sort_order)
VALUES
  ('kf01','Rutkovsky','factory',NULL,NULL,'','',1),
  ('kf02','Matubo','factory',NULL,NULL,'','',2),
  ('kf03','GB Beads','factory',NULL,NULL,'','',3),
  ('kf04','Beads for You — Lucka','factory',NULL,NULL,'','',4),
  ('kf05','Pegasus Production','factory',NULL,NULL,'','Confirm / optional.',5),
  ('kf06','Glass beads family Clever','factory',NULL,NULL,'','',6),
  ('kf07','Ralton','factory',NULL,NULL,'','Minimum 4 hours. Probably 4 hours of fun — chance to make own stones to fit in a piece.',7),
  ('kf08','Oliver Glass','factory',NULL,NULL,'','About 4 hours.',8),
  ('kf09','Janov glass factory','factory',NULL,NULL,'','',9),
  ('kf10','Pesničák glass cutting','factory',NULL,NULL,'','',10),
  ('kf11','Black glass jewellery','factory',NULL,NULL,'','80-year-old man making from home, last of a kind.',11),
  ('kf12','Button factory','factory',NULL,NULL,'','See them being hand painted.',12),
  ('kf13','Button pressing in old pressing house','factory',NULL,NULL,'','',13),
  ('kf14','Lamp glass','factory',NULL,NULL,'','',14),
  ('kf15','Lhotský studio','factory',NULL,NULL,'','Amazing larger glass studio, world-class works.',15),
  ('kf16','Clever Beads','factory',NULL,NULL,'','Confirm / optional.',16),
  ('ks01','Antik shop beads','shop',NULL,NULL,'','',17),
  ('ks02','Small antik shop in Držkov','shop',NULL,NULL,'','Small bakery opposite.',18),
  ('ks03','Vlad antik','shop',NULL,NULL,'','Confirm / optional.',19),
  ('ks04','Bijou Non Stop','shop',NULL,NULL,'','Confirm / optional.',20),
  ('ks05','Bijou Components','shop',NULL,NULL,'','Confirm / optional.',21),
  ('ks06','Křišťálový ráj','shop',NULL,NULL,'','40+ makers and suppliers; maybe Saturday morning demo from students.',22),
  ('ks07','House of Beads','shop',NULL,NULL,'','Confirm / optional.',23),
  ('ks08','Glass shop in Smržovka','shop',NULL,NULL,'','Confirm / optional.',24),
  ('ks09','Haberdashery in Jablonec','shop',NULL,NULL,'','Confirm / optional.',25),
  ('ks10','Precious factory outlet','shop',NULL,NULL,'','Outlet in Zásada.',26),
  ('kr01','Černá Studnice','restaurant',NULL,NULL,'','',27),
  ('kr02','Petřín','restaurant',NULL,NULL,'','Great for last evening meal — need to book.',28),
  ('kr03','Na Baště','restaurant',NULL,NULL,'Horní náměstí 5, 466 01 Jablonec nad Nisou, Czech Republic','Also known as Na Basta.',29),
  ('kr04','Splzov motorest','restaurant',NULL,NULL,'','Best garlic soup.',30),
  ('kr05','Park hotel','restaurant',NULL,NULL,'Kostelní 892, 468 51 Smržovka, Czech Republic','Food / hotel dining — Parkhotel Smržovka.',31),
  ('kr06','Snack at supermarket','restaurant',NULL,NULL,'','Light food stop — supermarket snack.',32),
  ('ke01','Poniklá Christmas decoration','experience',NULL,NULL,'','Look around; amazing private museums / local way of life in a poor hard area in the past.',33),
  ('ke02','Family Oliver cutting glass','experience',NULL,NULL,'','Chance to cut into their own small mirror.',34),
  ('ke03','Koralex bead press house','experience',NULL,NULL,'','Confirm / optional. About 2 hours of fun.',35),
  ('km01','Glass and jewellery museum in Jablonec','museum',NULL,NULL,'','',36),
  ('km02','Glass museum in Železný Brod','museum',NULL,NULL,'','',37),
  ('km03','Old Soviet car museum in Železný Brod','museum',NULL,NULL,'','Confirm / optional.',38),
  ('km04','Old museum of cars in Smržovka','museum',NULL,NULL,'','Originally a seed bead factory.',39),
  ('kh01','Glass school in Jablonec','school',NULL,NULL,'','Small shop — see what the kids are making.',40),
  ('kh02','Glass school in Železný Brod','school',NULL,NULL,'','',41),
  ('ht01','Park hotel','hotel',NULL,NULL,'Kostelní 892, 468 51 Smržovka, Czech Republic','Parkhotel Smržovka — beading-area tour hotel (also has restaurant dining as a separate Places entry).',42),
  ('ht02','Na Basta','hotel',NULL,NULL,'Horní náměstí 5, 466 01 Jablonec nad Nisou, Czech Republic','Also known as Na Baště. Common tour hotel in the beading area.',43)
ON CONFLICT (client_id) DO UPDATE SET
  name = EXCLUDED.name,
  place_type = EXCLUDED.place_type,
  notes = EXCLUDED.notes,
  address = COALESCE(NULLIF(EXCLUDED.address, ''), planner_places.address),
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
