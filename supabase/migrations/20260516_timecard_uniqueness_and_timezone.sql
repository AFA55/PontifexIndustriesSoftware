-- Migration: 20260516_timecard_uniqueness_and_timezone.sql
--
-- 1. Partial unique index on timecards — enforce only one open timecard per user.
--    Prevents race-condition double-clock-ins. A concurrent INSERT for the same
--    user with clock_out_time IS NULL will raise a unique violation, letting the
--    API surface a real error instead of silently creating a duplicate row.
--
-- 2. Performance index on timecards for the open-timecard lookup.
--    The query `WHERE user_id = ? AND clock_out_time IS NULL` runs on every
--    clock-in and clock-out. The partial index keeps the scan tight as the table
--    grows across tenants and months of data.
--    Note: Postgres may satisfy both the uniqueness constraint and the lookup
--    from index #1 alone, but creating the explicit lookup index documents intent
--    and gives the query planner both to choose from.
--
-- 3. timezone column on tenants.
--    The platform currently uses new Date().toISOString().split('T')[0] (UTC)
--    to compute "today". For tenants outside UTC this produces the wrong date.
--    Storing an IANA timezone string per tenant lets APIs compute the correct
--    local date. Defaults to 'America/New_York' (Patriot Concrete Cutting).
--    No new RLS policies required — the column is readable under existing tenant
--    policies.

-- ── 1. Unique partial index (one open timecard per user) ──────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS timecards_one_open_per_user
  ON public.timecards (user_id)
  WHERE clock_out_time IS NULL;

-- ── 2. Performance partial index (open-timecard lookup) ───────────────────────
CREATE INDEX IF NOT EXISTS timecards_open_lookup
  ON public.timecards (user_id)
  WHERE clock_out_time IS NULL;

-- ── 3. Timezone column on tenants ─────────────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York';

-- Signal PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
