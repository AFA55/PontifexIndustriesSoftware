-- Migration: cycle_billing_schema
-- Applied: 2026-04-18
-- Description: Adds billing_milestones table, notification_recipients table,
--              expected_scope/billing_type columns on job_orders, and
--              job_completion_summary view for cycle/milestone billing support.

-- 1. Create billing_milestones table
CREATE TABLE IF NOT EXISTS public.billing_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID REFERENCES public.job_orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  milestone_percent INTEGER NOT NULL CHECK (milestone_percent > 0 AND milestone_percent <= 100),
  label TEXT,
  triggered_at TIMESTAMPTZ,
  invoice_id UUID REFERENCES public.invoices(id),
  notified_at TIMESTAMPTZ,
  notification_sent BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.billing_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.billing_milestones
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin','admin','operations_manager','salesman'));
CREATE INDEX IF NOT EXISTS idx_billing_milestones_job ON public.billing_milestones(job_order_id);
CREATE INDEX IF NOT EXISTS idx_billing_milestones_tenant ON public.billing_milestones(tenant_id);

-- 2. Create notification_recipients table
CREATE TABLE IF NOT EXISTS public.notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  job_order_id UUID REFERENCES public.job_orders(id) ON DELETE CASCADE,
  user_id UUID,
  email TEXT,
  notify_on_completion BOOLEAN DEFAULT true,
  notify_on_milestone BOOLEAN DEFAULT true,
  notify_on_dispatch BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.notification_recipients
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin','admin','operations_manager','salesman'));
CREATE INDEX IF NOT EXISTS idx_notif_recipients_job ON public.notification_recipients(job_order_id);
CREATE INDEX IF NOT EXISTS idx_notif_recipients_tenant ON public.notification_recipients(tenant_id);

-- 3. Add expected_scope and billing_type to job_orders
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS expected_scope JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS billing_type TEXT DEFAULT 'fixed' CHECK (billing_type IN ('fixed', 'cycle', 'time_and_material'));

-- 4. Create job_completion_summary view
-- Schema notes (corrected from original spec to match actual DB):
--   work_items: uses core_quantity, linear_feet_cut (no square_feet_cut column exists)
--   timecards:  uses regular_hours, overtime_hours, night_shift_premium_hours (not night_shift_hours)
--   job_orders: uses total_cost (not actual_cost), customer_overall_rating (not customer_rating),
--               customer_feedback_comments (not customer_feedback), work_completed_at (not completed_at)
CREATE OR REPLACE VIEW public.job_completion_summary AS
SELECT
  jo.id,
  jo.job_number,
  jo.tenant_id,
  jo.status,
  jo.project_name,
  jo.customer_id,
  jo.expected_scope,
  jo.billing_type,
  jo.estimated_cost,
  jo.total_cost,
  COALESCE(wi_agg.total_cores, 0) AS total_cores_drilled,
  COALESCE(wi_agg.total_lf, 0) AS total_lf_cut,
  COALESCE(tc_agg.total_hours, 0) AS total_labor_hours,
  COALESCE(tc_agg.total_ot_hours, 0) AS total_ot_hours,
  COALESCE(tc_agg.total_ns_hours, 0) AS total_ns_hours,
  jo.customer_overall_rating,
  jo.customer_feedback_comments,
  jo.work_completed_at
FROM public.job_orders jo
LEFT JOIN (
  SELECT
    job_order_id,
    SUM(core_quantity) AS total_cores,
    SUM(linear_feet_cut) AS total_lf
  FROM public.work_items
  GROUP BY job_order_id
) wi_agg ON wi_agg.job_order_id = jo.id
LEFT JOIN (
  SELECT
    job_order_id,
    SUM(regular_hours + COALESCE(overtime_hours,0) + COALESCE(night_shift_premium_hours,0)) AS total_hours,
    SUM(COALESCE(overtime_hours,0)) AS total_ot_hours,
    SUM(COALESCE(night_shift_premium_hours,0)) AS total_ns_hours
  FROM public.timecards
  GROUP BY job_order_id
) tc_agg ON tc_agg.job_order_id = jo.id;
