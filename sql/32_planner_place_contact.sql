-- A named person and their phone, separate from the place's own number.
--
-- Nullable. Existing rows stay empty. Safe to re-run. Does not rewrite
-- contact_detail or contact_method. The app does not apply this file.

ALTER TABLE public.planner_places ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.planner_places ADD COLUMN IF NOT EXISTS contact_phone text;

COMMENT ON COLUMN public.planner_places.contact_name IS
  'Name of a person to ask for at this place. Null until someone saves one.';
COMMENT ON COLUMN public.planner_places.contact_phone IS
  'Phone number for that person. Null until someone saves one.';
