-- Messaging usage meter (founder ask Jul 8): every SMS/email our software
-- sends gets metered with raw provider cost + billed amount (cost x tenant
-- markup) so we can bill tenants monthly via Stripe and keep the margin.
-- Phase 1 = meter only; billing pipeline in docs/plans/MESSAGING_BILLING_PLAN.md.
-- Applied to prod Jul 8 2026.
CREATE TABLE IF NOT EXISTS public.message_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  provider text NOT NULL,
  segments integer NOT NULL DEFAULT 1,
  raw_cost numeric NOT NULL DEFAULT 0,
  billed_amount numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'unknown',
  invoiced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_usage_tenant ON public.message_usage(tenant_id, invoiced);
CREATE INDEX IF NOT EXISTS idx_message_usage_created ON public.message_usage(created_at);
ALTER TABLE public.message_usage ENABLE ROW LEVEL SECURITY;
-- Service-role writes/reads only; customers see aggregates via API later.

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS messaging_markup numeric NOT NULL DEFAULT 2.5;
