-- APPLIED TO PROD 2026-06-05 via Supabase MCP (company_holidays_20260605).
-- Feature 3: per-tenant holiday calendar. Admin marks dates as holidays with a
-- configurable pay_hours; an idempotent "apply" creates holiday-pay timecard rows
-- for eligible hourly staff. Additive; tenant-scoped + RLS via SECURITY DEFINER
-- helpers (never user_metadata).

CREATE TABLE IF NOT EXISTS public.company_holidays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name         text NOT NULL,
  pay_hours    numeric NOT NULL DEFAULT 8 CHECK (pay_hours >= 0 AND pay_hours <= 24),
  is_active    boolean NOT NULL DEFAULT true,
  -- eligibility scope. Apply logic maps (by ROLE, since profiles.work_location
  -- does not exist): 'all' = operator+apprentice+shop_manager+shop_help;
  -- 'field' = operator+apprentice; 'shop' = shop_manager+shop_help.
  applies_to   text NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all','field','shop')),
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, holiday_date)
);

ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "company_holidays_tenant_read" ON public.company_holidays
    FOR SELECT
    USING (tenant_id = public.current_user_tenant_id() OR public.current_user_role() = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "company_holidays_admin_write" ON public.company_holidays
    FOR ALL
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id())
    )
    WITH CHECK (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Idempotent holiday-pay application: at most one holiday row per operator per day.
CREATE UNIQUE INDEX IF NOT EXISTS timecards_one_holiday_per_day
  ON public.timecards (user_id, date)
  WHERE entry_type = 'holiday';
