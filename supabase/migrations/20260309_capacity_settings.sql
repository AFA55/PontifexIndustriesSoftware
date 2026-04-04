-- ============================================================
-- Capacity Settings & Schedule Board View Enhancement
-- ============================================================

-- 1. Drop and recreate schedule_board_view to add new columns
--    (PostgreSQL doesn't allow CREATE OR REPLACE to add columns to existing views)
DROP VIEW IF EXISTS public.schedule_board_view;
CREATE VIEW public.schedule_board_view AS
SELECT
  jo.id,
  jo.job_number,
  jo.title,
  jo.customer_name,
  jo.customer_contact,
  jo.job_type,
  jo.location,
  jo.address,
  jo.description,
  jo.status,
  jo.priority,
  jo.scheduled_date,
  jo.end_date,
  jo.arrival_time,
  jo.shop_arrival_time,
  jo.estimated_hours,
  jo.equipment_needed,
  jo.special_equipment,
  jo.po_number,
  jo.is_will_call,
  jo.difficulty_rating,
  jo.salesman_name,
  jo.assigned_to,
  jo.helper_assigned_to,
  jo.estimated_cost,
  jo.scheduling_flexibility,
  jo.created_at,
  jo.updated_at,
  op.full_name AS operator_name,
  hp.full_name AS helper_name,
  (SELECT COUNT(*) FROM public.job_notes jn WHERE jn.job_order_id = jo.id)::int AS notes_count,
  (SELECT COUNT(*) FROM public.schedule_change_requests cr WHERE cr.job_order_id = jo.id AND cr.status = 'pending')::int AS pending_change_requests_count
FROM public.job_orders jo
LEFT JOIN public.profiles op ON jo.assigned_to = op.id
LEFT JOIN public.profiles hp ON jo.helper_assigned_to = hp.id
WHERE jo.deleted_at IS NULL;

-- 2. Create schedule_settings table for configurable capacity
CREATE TABLE IF NOT EXISTS public.schedule_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default capacity setting
INSERT INTO public.schedule_settings (setting_key, setting_value)
VALUES ('capacity', '{"max_slots": 10, "warning_threshold": 8}')
ON CONFLICT (setting_key) DO NOTHING;

-- 3. Enable RLS on schedule_settings
ALTER TABLE public.schedule_settings ENABLE ROW LEVEL SECURITY;

-- Everyone with schedule board access can read settings
CREATE POLICY "schedule_settings_select" ON public.schedule_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin', 'salesman')
    )
  );

-- Only super_admin can modify settings
CREATE POLICY "schedule_settings_update" ON public.schedule_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
    )
  );

CREATE POLICY "schedule_settings_insert" ON public.schedule_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
    )
  );

-- 4. Index for capacity queries (date-based job counting)
CREATE INDEX IF NOT EXISTS idx_job_orders_status ON public.job_orders(status);
