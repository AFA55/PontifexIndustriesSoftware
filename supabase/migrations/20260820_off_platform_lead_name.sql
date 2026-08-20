-- ═══════════════════════════════════════════════════════════════════════════
-- A CREW WHOSE LEAD IS NOT ON PONTIFEX  (founder, Aug 20 2026)
--
--   "Sometimes the helpers get assigned to operators that aren't on the
--    platform. What I would like to do to resolve this is just to be able to
--    assign helpers to jobs — so if the helper is in Pontifex we can assign
--    them, and it can show in their timecard even if they are assigned to
--    someone without it."
--
-- The TABLE already permitted this: `operator_id` and `helper_id` have been
-- nullable since 20260405000030. In 111 production rows it had never happened —
-- 55 both, 33 operator-only, 23 nobody, 0 helper-only — because the schedule
-- board's UI refused it, not the schema. The fix is therefore almost entirely in
-- the app; this migration adds the one fact the platform had nowhere to put.
--
-- WHAT THIS ADDS
--   `off_platform_lead_name` — free text, nullable. The person actually running
--   that crew when they are not a Pontifex user (a sub, or someone not yet
--   onboarded). Per-DAY, on the assignment row, because crew is a per-day fact:
--   whoever led Monday's crew is not necessarily leading Thursday's, and the
--   board's Assign control states one day at a time (scope 'day') so the office
--   can say exactly that.
--
--   ⚠️ PER-DAY IS THE STORAGE, NOT A PROMISE THAT AN EDIT TOUCHES ONE DAY. The
--   lead is part of a crew statement, never a field of its own: it is written by
--   the same write path, to the same dates, as the operator and helper seats
--   beside it. The Edit panel's Save is a scope-'remaining' crew change, so a
--   lead edited there lands on this date and every remaining day of the job —
--   the same as the two seats. Writing it to the anchor date alone would leave a
--   named lead on Monday and "Lead not on Pontifex" on the rest of the same
--   crew's week. See `resolveOffPlatformLead` in lib/off-platform-lead.ts.
--
--   Set ONLY on a row where a helper is placed and no operator is. An operator on
--   the row clears it (a crew has one lead) and so does a row left with nobody —
--   that shape is a date held open on the board, and a lead left behind on one
--   would be inherited by whoever is assigned to that row next.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   • No shadow `profiles` row for the off-platform lead. They would appear in
--     every crew picker, every roster and every notification target, which is a
--     much larger change than was asked for and one that is hard to take back.
--   • No reuse of `job_orders.foreman_name`. That is the CUSTOMER's site contact
--     — it pre-fills the utility-waiver signer name and prints on the operator's
--     ticket as the site contact. Putting a Patriot sub's name there would put
--     them on a customer signature line.
--   • No reuse of `job_daily_assignments.operator_name`. That column is the
--     denormalised cache of `profiles.full_name` for `operator_id`, and the board
--     keys its rows off it; a name there with no matching id is precisely the
--     Aug 18 shape where an unresolvable name took three crews off live jobs.
--
-- RLS: none needed. `job_daily_assignments` already has RLS enabled with three
-- policies (`schedule_board_access_daily_assignments`,
-- `supervisor_read_job_daily_assignments`, `tenant_isolation`), all built on the
-- SECURITY DEFINER helpers (`current_user_has_role`, `current_user_role`,
-- `current_user_tenant_id`) and none on `auth.jwt() -> 'user_metadata'`. A new
-- column on an existing table inherits them unchanged.
--
-- Additive and idempotent. Safe to re-run. NOT applied automatically — the
-- founder applies schema changes. The app tolerates the column's absence: every
-- read and write of it falls back (see `isMissingColumnError` in
-- lib/off-platform-lead.ts), so shipping the code before the migration degrades
-- to "the lead's name is not captured", never to a broken board.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.job_daily_assignments
  ADD COLUMN IF NOT EXISTS off_platform_lead_name text;

COMMENT ON COLUMN public.job_daily_assignments.off_platform_lead_name IS
  'Free-text name of the person leading this crew on this date when they are NOT '
  'a Pontifex user (a sub, or someone not yet onboarded). Set only on rows with a '
  'null operator_id. NOT a customer contact — that is job_orders.foreman_name — '
  'and NOT a cache of any profile name.';
