# Planner cloud recovery (Angela / booking 20)

## Status (2026-09-17 evening PT)
- Supabase `planner_plans` for **booking_id=20** is a **skeleton** only (Park hotel, default Breakfast / Leave for tours, empty Prague hotel).
- Keith confirmed the rich Mon–Thu plan is **gone from Netlify localStorage** as well.
- **Do not invent** Angela’s stops — Keith must re-enter from his notes.

## Safe to re-enter on GitHub Pages
After the harden-save deploy:

1. Open **only** `https://lillydog2468.github.io/beading-tour-planner/tour-planner.html?booking=20` (not Netlify).
2. Confirm **Auto-save** is **On** (default for new sessions).
3. Enter Mon–Thu stops carefully.
4. Click **Force save to cloud** and wait for **Cloud saved**.
5. Optionally click **Export JSON** for a local backup.
6. Hard-refresh once and confirm stops are still there (richer local is never replaced by a thinner cloud skeleton).

## Protections shipped
- Load: prefer the plan with more stops / richer payload (local vs cloud).
- Autosave: default **ON**; status shows **Cloud saved** / **Cloud save failed**.
- Normal save: refuses to overwrite cloud if the existing cloud payload has **more blocks** or a higher richness score (status: **Kept richer cloud**).
- **Force save to cloud**: upserts anyway (use after intentional edits).
- **Export JSON**: download current plan.

## Netlify
Do **not** use `keith-booking-form.netlify.app` for Angela week 2 until/unless it is rebuilt with the same harden-save. GitHub Pages is the source of truth going forward for this tour.

## Blank times
Stops may be added **without a time**. Untimed stops sort last and still save to cloud. Fill times later.

## Do not clobber a richer cloud plan
If Supabase already has a richer Angela plan (more stops), normal autosave will **refuse** to overwrite it with a thinner local skeleton (status **Kept richer cloud**). Use **Force save to cloud** only when the plan on screen is intentionally the one to keep.
