-- A ROW WITHOUT A COMPANY IS A ROW NOBODY CAN SEE.
--
-- FOUNDER (Aug 16): "Patriot data should remain within Patriot… our database in
-- the backend should reflect that and be clean and have enterprise-level
-- separation and security to prevent issues from cross data and pulling wrong
-- data."
--
-- Every query in this platform filters by tenant_id. So a row written WITHOUT
-- one is not merely untidy — it is invisible to every screen, every report and
-- every printed ticket, for ever, with no error anywhere. An operator's ten
-- hours would simply cease to exist. That is the worst failure mode this system
-- has, because nothing announces it.
--
-- Verified before writing this (Aug 16): ZERO null tenant_id rows across all of
-- these tables — 287 timecards, 96 daily assignments, 66 work items, 54 daily
-- logs, 46 job orders, 28 customers, 2 crew rows. Every live write path already
-- sets it. This constraint therefore changes no current behaviour; it converts a
-- silent, permanent data loss into a loud error the moment a future code path
-- forgets.
--
-- DELIBERATELY NOT INCLUDED: `profiles`. lib/api-auth.ts documents that
-- super_admin is the one role allowed to have a null tenant (the platform-level
-- account that belongs to no single company). No such row exists today, but
-- whether to close that door is a product decision for the founder, not a
-- cleanup. Left alone on purpose.
--
-- Reversible: ALTER TABLE <t> ALTER COLUMN tenant_id DROP NOT NULL;

DO $$
DECLARE
  t text;
  n bigint;
  targets text[] := ARRAY[
    'timecards',
    'job_orders',
    'work_items',
    'daily_job_logs',
    'invoices',
    'customers',
    'job_daily_assignments',
    'job_crew'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    -- Skip a table that isn't there rather than abort the whole migration.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN
      RAISE NOTICE 'skip %: no tenant_id column', t;
      CONTINUE;
    END IF;

    -- Already constrained — re-running this migration is a no-op.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t
        AND column_name = 'tenant_id' AND is_nullable = 'NO'
    ) THEN
      CONTINUE;
    END IF;

    -- Refuse rather than guess. Back-filling an orphan to "whichever tenant
    -- looks likely" would be inventing ownership of somebody's payroll; if this
    -- ever fires, the rows need a human to say who they belong to.
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS NULL', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION
        'Cannot set % .tenant_id NOT NULL: % row(s) have no tenant. Assign them first.', t, n;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    RAISE NOTICE 'tenant_id NOT NULL applied to %', t;
  END LOOP;
END $$;
