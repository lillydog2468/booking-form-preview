-- Let an open planner hear inserts and updates for the booking it is showing.
-- Apply this in the Supabase SQL editor. The app does not run it.
--
-- postgres_changes only delivers rows for tables in the supabase_realtime
-- publication. The new row on an update is included without REPLICA IDENTITY
-- FULL; that setting is only needed if a subscriber must also see the previous
-- row.

ALTER PUBLICATION supabase_realtime ADD TABLE public.planner_plans;
