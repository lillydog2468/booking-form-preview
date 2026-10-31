-- Shared tour price list. The booking form used to keep this only in the
-- browser (localStorage keith_tour_price_book_v1), so each site had its own copy.
-- Apply this in the Supabase SQL editor. The app does not run it.
-- Apply once. The insert does nothing if the row is already there.

CREATE TABLE IF NOT EXISTS public.tour_price_book (
  id         TEXT PRIMARY KEY DEFAULT 'main',
  book       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tour_price_book ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read tour_price_book" ON public.tour_price_book;
DROP POLICY IF EXISTS "Signed-in users can insert tour_price_book" ON public.tour_price_book;
DROP POLICY IF EXISTS "Signed-in users can update tour_price_book" ON public.tour_price_book;

CREATE POLICY "Signed-in users can read tour_price_book"
  ON public.tour_price_book
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Signed-in users can insert tour_price_book"
  ON public.tour_price_book
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Signed-in users can update tour_price_book"
  ON public.tour_price_book
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.tour_price_book FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.tour_price_book TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tour_price_book TO authenticated, service_role;

INSERT INTO public.tour_price_book (id, book)
VALUES (
  'main',
  '{
    "years": {
      "2026": {
        "dayTrip": "120",
        "beading": {"1": "285", "2": "400", "3": "530", "4": "670", "5": "800"}
      },
      "2027": {
        "dayTrip": "124",
        "beading": {"1": "294", "2": "412", "3": "546", "4": "690", "5": "805"}
      }
    },
    "parkHotelPrice": "41"
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
