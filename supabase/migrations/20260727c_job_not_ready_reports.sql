-- "Job Not Ready" reports: operator arrived on-site but the contractor/site
-- wasn't ready. Documents reason + GPS photos + an on-site signature (the
-- contractor rep signs on the operator's phone). The job is then parked to
-- on_hold (Pending Jobs) and the PM is notified. Additive + idempotent.
-- Applied to prod 2026-07-27 via Supabase MCP.

-- The Pending Jobs / park flow depends on these on_hold_* columns. They exist
-- in prod as schema drift (never migrated) — add them idempotently so a clean
-- rebuild (staging / a new tenant DB) has them too. No-op where already present.
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS on_hold_placed_at  timestamptz;
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS on_hold_placed_by  uuid REFERENCES public.profiles(id);
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS on_hold_released_at timestamptz;

CREATE TABLE IF NOT EXISTS public.job_not_ready_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id  uuid NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  tenant_id     uuid REFERENCES public.tenants(id),
  reported_by   uuid REFERENCES public.profiles(id),
  reason        text NOT NULL,
  photo_urls    jsonb NOT NULL DEFAULT '[]'::jsonb,
  signature_data text,
  signer_name   text,
  arrived_at    timestamptz DEFAULT now(),
  signed_at     timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jnr_job    ON public.job_not_ready_reports(job_order_id);
CREATE INDEX IF NOT EXISTS idx_jnr_tenant ON public.job_not_ready_reports(tenant_id);

ALTER TABLE public.job_not_ready_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY jnr_tenant_read ON public.job_not_ready_reports
    FOR SELECT TO authenticated
    USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY jnr_tenant_insert ON public.job_not_ready_reports
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
