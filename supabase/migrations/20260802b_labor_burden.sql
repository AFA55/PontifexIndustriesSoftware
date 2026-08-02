-- 20260802b_labor_burden.sql
-- Tenant-level labor burden percentage for TRUE labor cost math.
--
-- Labor cost = hours × profiles.hourly_rate × (1 + labor_burden_pct/100).
-- Burden covers payroll taxes, workers comp, insurance, etc. on top of the
-- raw wage. Default 25% (industry-typical for concrete cutting field crews);
-- configurable per tenant in Settings → Billing → Job Cost Standards.
--
-- v1 is tenant-level only. A per-profile override (profiles.labor_burden_pct)
-- is a possible future refinement — intentionally NOT added yet to keep the
-- model simple.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS labor_burden_pct numeric NOT NULL DEFAULT 25;

COMMENT ON COLUMN public.tenants.labor_burden_pct IS
  'Labor burden markup % applied on top of raw wages for job labor-cost math (payroll taxes, comp, insurance). Default 25. Read by /api/admin/job-pnl/[id] and invoice generation via lib/labor-cost-server.ts; edited in Settings → Job Cost Standards.';
