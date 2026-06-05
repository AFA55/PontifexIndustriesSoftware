-- APPLIED TO PROD 2026-06-05 via Supabase MCP (subsistence_nights_20260605).
-- One row per operator per calendar night away on an out-of-town job. Recorded at
-- day-complete when the operator confirms an overnight stay. Counted for subsistence
-- (per-diem) pay. Distinct from timecards.is_overnight (shift crossing midnight) and
-- is_night_shift (night rate). Additive + idempotent; tenant_id + RLS.

CREATE TABLE IF NOT EXISTS public.subsistence_nights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  night_date date NOT NULL,
  job_order_id uuid REFERENCES public.job_orders(id) ON DELETE SET NULL,
  job_number text,
  source text NOT NULL DEFAULT 'operator',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subsistence_nights_operator_date_key UNIQUE (operator_id, night_date)
);

CREATE INDEX IF NOT EXISTS idx_subsistence_nights_tenant      ON public.subsistence_nights(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subsistence_nights_operator    ON public.subsistence_nights(operator_id, night_date DESC);
CREATE INDEX IF NOT EXISTS idx_subsistence_nights_job         ON public.subsistence_nights(job_order_id);
CREATE INDEX IF NOT EXISTS idx_subsistence_nights_tenant_date ON public.subsistence_nights(tenant_id, night_date);

CREATE OR REPLACE FUNCTION public.subsistence_nights_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_subsistence_nights_updated_at ON public.subsistence_nights;
CREATE TRIGGER set_subsistence_nights_updated_at
  BEFORE UPDATE ON public.subsistence_nights
  FOR EACH ROW EXECUTE FUNCTION public.subsistence_nights_set_updated_at();

ALTER TABLE public.subsistence_nights ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "subsistence_nights_operator_own" ON public.subsistence_nights
    FOR ALL
    USING (operator_id = auth.uid() AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id()))
    WITH CHECK (operator_id = auth.uid() AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "subsistence_nights_admin_all" ON public.subsistence_nights
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
