-- Not applied. Run this yourself if you want stored plans cleaned in one go.
-- Opening a tour also removes the same rows in the planner.
--
-- Deletes automatic daily tour-hotel pick-ups and drop-offs from planner_plans.payload.
-- A block is removed only when it is a handover at that plan's tour hotel, with no notes,
-- and it still has the generated title and the default 08:00 / 17:00 clock
-- (or it was the old last-day flag). Manual stops and Prague or airport stops stay.

UPDATE planner_plans
SET payload = jsonb_set(
  payload,
  '{days}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN jsonb_typeof(day->'blocks') = 'array' THEN
          jsonb_set(
            day,
            '{blocks}',
            (
              SELECT COALESCE(jsonb_agg(block), '[]'::jsonb)
              FROM jsonb_array_elements(day->'blocks') AS block
              WHERE NOT (
                COALESCE(block->>'type', '') = 'handover'
                AND COALESCE(block->>'placeKind', 'hotel') NOT IN ('airport', 'note')
                AND COALESCE(block->>'autoStop', '') = ''
                AND btrim(COALESCE(block->>'notes', '')) = ''
                AND lower(regexp_replace(btrim(COALESCE(block->>'hotelName', '')), '\s+', ' ', 'g'))
                  = lower(regexp_replace(btrim(COALESCE(planner_plans.payload->>'tourHotelName', '')), '\s+', ' ', 'g'))
                AND btrim(COALESCE(planner_plans.payload->>'tourHotelName', '')) <> ''
                AND (
                  COALESCE(block->>'tourFinalDropoff', '') IN ('true', 't')
                  OR (
                    (
                      COALESCE(block->>'title', '') ILIKE 'Pick-up%'
                      OR COALESCE(block->>'title', '') ILIKE 'Drop-off%'
                    )
                    AND left(COALESCE(block->>'time', ''), 5) IN ('', '08:00', '17:00')
                  )
                )
              )
            )
          )
        ELSE day
      END
    ), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(payload->'days', '[]'::jsonb)) AS day
    WHERE day IS NOT NULL AND jsonb_typeof(day) = 'object'
  )
)
WHERE payload ? 'days'
  AND jsonb_typeof(payload->'days') = 'array';
