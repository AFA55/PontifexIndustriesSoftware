-- Platform-wide health alerts, populated by the /api/cron/data-health-checks
-- cron job (stuck jobs, overdue invoices, inactive tenants). tenant_id is
-- nullable for genuinely platform-wide alerts (e.g. the cron itself failing);
-- every check implemented so far is tenant-scoped.

CREATE TABLE IF NOT EXISTS public.platform_health_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  check_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message text NOT NULL,
  details jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_health_alerts_open
  ON public.platform_health_alerts(resolved, severity, created_at DESC);

ALTER TABLE public.platform_health_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "platform_health_alerts_super_admin_read" ON public.platform_health_alerts
    FOR SELECT
    USING (public.current_user_has_role('super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
