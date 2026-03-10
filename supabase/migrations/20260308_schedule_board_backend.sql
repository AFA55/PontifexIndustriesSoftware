-- ============================================================
-- Schedule Board Backend Migration
-- ============================================================

-- 1. Add helper_assigned_to and is_will_call to job_orders
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS helper_assigned_to UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS is_will_call BOOLEAN NOT NULL DEFAULT false;

-- 2. Update status constraint to include 'pending_approval'
ALTER TABLE public.job_orders DROP CONSTRAINT IF EXISTS job_orders_status_check;
ALTER TABLE public.job_orders ADD CONSTRAINT job_orders_status_check
  CHECK (status = ANY (ARRAY[
    'scheduled', 'assigned', 'in_route', 'in_progress',
    'completed', 'cancelled', 'pending_approval'
  ]));

-- 3. Add 'salesman' and 'apprentice' to profiles role constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'admin', 'super_admin', 'operator', 'apprentice', 'salesman',
    'inventory_manager', 'shop_manager', 'shop_hand'
  ]));

-- 4. Create schedule_change_requests table
CREATE TABLE IF NOT EXISTS public.schedule_change_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_order_id UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  request_type TEXT NOT NULL CHECK (request_type = ANY (ARRAY[
    'reschedule', 'reassign', 'cancel', 'other'
  ])),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY[
    'pending', 'approved', 'rejected'
  ])),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Create schedule_board_view for efficient queries
CREATE OR REPLACE VIEW public.schedule_board_view AS
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

-- 6. Enable RLS on schedule_change_requests
ALTER TABLE public.schedule_change_requests ENABLE ROW LEVEL SECURITY;

-- Policy: admins, super_admins, and salesmen can view all change requests
CREATE POLICY "schedule_cr_select" ON public.schedule_change_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin', 'salesman')
    )
  );

-- Policy: admins, super_admins, and salesmen can create change requests
CREATE POLICY "schedule_cr_insert" ON public.schedule_change_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin', 'salesman')
    )
  );

-- Policy: only super_admins can update (approve/reject) change requests
CREATE POLICY "schedule_cr_update" ON public.schedule_change_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
    )
  );

-- 7. Index for performance
CREATE INDEX IF NOT EXISTS idx_job_orders_scheduled_date ON public.job_orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_job_orders_assigned_to ON public.job_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_job_orders_helper_assigned_to ON public.job_orders(helper_assigned_to);
CREATE INDEX IF NOT EXISTS idx_schedule_cr_job_order_id ON public.schedule_change_requests(job_order_id);
CREATE INDEX IF NOT EXISTS idx_schedule_cr_status ON public.schedule_change_requests(status);
