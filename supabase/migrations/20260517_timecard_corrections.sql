CREATE TABLE IF NOT EXISTS public.timecard_correction_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  timecard_id     uuid NOT NULL REFERENCES public.timecards(id) ON DELETE CASCADE,
  requested_by    uuid NOT NULL REFERENCES public.profiles(id),
  
  -- What they're requesting (null = no change to that field)
  requested_clock_in    timestamptz,
  requested_clock_out   timestamptz,
  reason                text NOT NULL,
  
  -- Admin review
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     uuid REFERENCES public.profiles(id),
  reviewed_at     timestamptz,
  reviewer_notes  text,
  
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tcr_tenant_idx ON public.timecard_correction_requests (tenant_id);
CREATE INDEX IF NOT EXISTS tcr_timecard_idx ON public.timecard_correction_requests (timecard_id);
CREATE INDEX IF NOT EXISTS tcr_user_idx ON public.timecard_correction_requests (requested_by);
CREATE INDEX IF NOT EXISTS tcr_status_idx ON public.timecard_correction_requests (status) WHERE status = 'pending';

ALTER TABLE public.timecard_correction_requests ENABLE ROW LEVEL SECURITY;

-- Workers can see and create their own requests
CREATE POLICY "tcr_own_read" ON public.timecard_correction_requests
  FOR SELECT USING (requested_by = auth.uid());

CREATE POLICY "tcr_own_insert" ON public.timecard_correction_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND tenant_id = public.current_user_tenant_id()
  );

-- Admins can see all in their tenant and update (approve/reject)
CREATE POLICY "tcr_admin_read" ON public.timecard_correction_requests
  FOR SELECT USING (
    public.current_user_has_role('admin', 'super_admin', 'operations_manager')
    AND tenant_id = public.current_user_tenant_id()
  );

CREATE POLICY "tcr_admin_update" ON public.timecard_correction_requests
  FOR UPDATE USING (
    public.current_user_has_role('admin', 'super_admin', 'operations_manager')
    AND tenant_id = public.current_user_tenant_id()
  );
