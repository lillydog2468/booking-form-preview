-- Private admin list of people who would like to come in 2027.
-- Not for customers. Apply this in the Supabase SQL editor. The app does not run it.
-- Depends on is_admin() and update_updated_at() from the earlier profile migration.
-- Apply once. Running the inserts again adds these 13 people a second time.

CREATE TABLE IF NOT EXISTS interest_2027 (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            TEXT NOT NULL,
  contact         TEXT,
  source          TEXT,
  preferred_when  TEXT,
  party_size      TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'interested'
                    CHECK (status IN ('interested', 'waiting for dates', 'placed')),
  possible_group  TEXT,
  do_not_contact  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS interest_2027_updated_at ON interest_2027;
CREATE TRIGGER interest_2027_updated_at
  BEFORE UPDATE ON interest_2027
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE interest_2027 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read interest_2027" ON interest_2027;
DROP POLICY IF EXISTS "Admins can insert interest_2027" ON interest_2027;
DROP POLICY IF EXISTS "Admins can update interest_2027" ON interest_2027;
DROP POLICY IF EXISTS "Admins can delete interest_2027" ON interest_2027;

CREATE POLICY "Admins can read interest_2027"
  ON interest_2027 FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can insert interest_2027"
  ON interest_2027 FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update interest_2027"
  ON interest_2027 FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete interest_2027"
  ON interest_2027 FOR DELETE
  TO authenticated
  USING (is_admin());

REVOKE ALL ON TABLE interest_2027 FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE interest_2027 TO authenticated;

INSERT INTO interest_2027
  (name, contact, source, preferred_when, party_size, notes, status, possible_group, do_not_contact)
VALUES
  ('Tina Paul', 'tina.paul43@googlemail.com; Facebook', 'Facebook Post 1 comment 20 Oct 2026 (per Keith); group-contacts-tracker.csv', 'not said', 'Organiser; usually travels with Eileen Ranson, Ann Quigley and friends', 'TOP PRIORITY #1. Group last visited 28 Sep–2 Oct 2026. Comment wording not logged in folder', 'interested', NULL, false),
  ('Eileen Ranson (Ransom)', 'ransoneileen@gmail.com; Facebook', 'Facebook Post 1 comment 20 Oct 2026 (''10 trips and counting''); group-contacts-tracker.csv', 'not said', 'Travels with Tina Paul', 'TOP PRIORITY #1. Regular since 2015, last visit Oct 2025', 'interested', NULL, false),
  ('Jayde Hollingworth', 'Facebook', 'Facebook Post 1 comment 20 Oct 2026 (per Keith)', 'early 2027 (wants to book early)', 'not said', 'Comment not logged in folder; no email on file', 'waiting for dates', NULL, false),
  ('Karen Poll', 'tonypoll_ms@msn.com', 'replies-log.md 17 Oct 2026; reply-karen-poll-SUGGESTED-2026-10-17.txt', '2027: proposed 7–12 Mar, 8–13 Mar or 7–12 Jun (some flexibility)', 'Solo (Tony recovering); happy to share a room', 'Per Keith, those dates didn''t suit. DO NOT CONTACT unless Keith asks. Wants 5 days', 'waiting for dates', NULL, true),
  ('Kathy Kentfield', 'kathy477@btinternet.com', 'replies-log.md 27 Sep 2026', 'April 2027; 3 days/2 nights; Thursday to Saturday ideal, dates flexible', 'With her daughter (2); happy to join a group', 'Toured April 2013', 'waiting for dates', NULL, false),
  ('Anna (Tigerguld)', 'anna@tigerguld.com', 'replies-log.md 17 Sep 2026', '''next year'' (said Sept 2026)', 'Would like to get a group together (students); size not said', 'Sweden; autumn/winter fully booked', 'interested', NULL, false),
  ('Ann Lucas', 'lucasann6@gmail.com; Facebook', 'Facebook Post 1 comment 20 Oct 2026; beading-2023-contacts-2026-10-19.csv', '''maybe next year''', 'Came in Sept 2018 with Kath Mc (Katherine McLeary)', 'Said ''would love to come back''. Hello-again email sent 20 Oct 10:13', 'interested', NULL, false),
  ('Kath Mc (Katherine McLeary)', 'k.m.beadwork@gmail.com; Facebook', 'Facebook Post 1 (per Keith); beading-2023-contacts-2026-10-19.csv', 'not said', 'Ann Lucas''s travel friend', 'Her comment wording not logged in folder; check on Facebook. Hello-again email drafted, not yet sent', 'interested', NULL, false),
  ('Linda Barbara Pauer', 'Facebook', 'Facebook Post 1 comment 20 Oct 2026', 'not said', 'not said', 'Said ''would love to do again''. No email on file', 'interested', NULL, false),
  ('Jenny Playford', 'jennyybl@yahoo.co.uk', 'replies-log.md 3 Oct 2026', 'not said (when she''s able to travel)', 'Previously led a group (Carol Longbone, Gill Laycock, Ruth Haldon)', 'Can''t travel just now; would love a bead trip when able', 'interested', NULL, false),
  ('Rhonda Heidebrecht', 'RHeiDesign@outlook.com', 'replies-log.md 5 and 7 Oct 2026', 'Day trip Fri 11 Dec 2026', 'Solo (1); happy to join another group', 'Hotel in Prague 1. Sore throat 7 Oct, said she''d reply properly later', 'interested', NULL, false),
  ('Bruria Adin', 'bruriaadin@gmail.com', 'replies-log.md 4–5 Oct 2026', 'not said (arriving Prague 6 Dec; day trip date not set)', 'With daughter and grandson (family)', 'May want a day trip without beads; will be in touch', 'interested', NULL, false),
  ('Ronit (via Bruria Adin)', 'via bruriaadin@gmail.com', 'replies-log.md 28 Sep and 4 Oct 2026', 'not said', 'not said', 'Wants to come on a bead trip; will get in touch when she decides', 'interested', NULL, false);
