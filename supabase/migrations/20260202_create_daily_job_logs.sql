-- Create daily job logs system for multi-day job tracking
-- Created: 2026-02-02
-- Purpose: Track daily progress on jobs that span multiple days

-- Create daily_job_logs table
CREATE TABLE IF NOT EXISTS public.daily_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,

  -- Daily timestamps
  route_started_at TIMESTAMPTZ,
  work_started_at TIMESTAMPTZ,
  day_completed_at TIMESTAMPTZ NOT NULL,

  -- Daily work details
  work_performed JSONB, -- Array of work items completed today
  notes TEXT,
  hours_worked DECIMAL(5,2),

  -- Daily signatures (optional - for client verification)
  daily_signer_name TEXT,
  daily_signature_data TEXT,

  -- Location tracking
  route_start_latitude DECIMAL(10, 8),
  route_start_longitude DECIMAL(11, 8),
  work_start_latitude DECIMAL(10, 8),
  work_start_longitude DECIMAL(11, 8),
  day_end_latitude DECIMAL(10, 8),
  day_end_longitude DECIMAL(11, 8),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE public.daily_job_logs IS 'Tracks daily progress for multi-day jobs';
COMMENT ON COLUMN public.daily_job_logs.log_date IS 'The date this daily log is for';
COMMENT ON COLUMN public.daily_job_logs.day_completed_at IS 'When the operator submitted end-of-day for this date';
COMMENT ON COLUMN public.daily_job_logs.work_performed IS 'JSON array of work items completed on this day';
COMMENT ON COLUMN public.daily_job_logs.hours_worked IS 'Total hours worked on this specific day';

-- Create indexes
CREATE INDEX idx_daily_job_logs_job_order ON public.daily_job_logs(job_order_id);
CREATE INDEX idx_daily_job_logs_operator ON public.daily_job_logs(operator_id);
CREATE INDEX idx_daily_job_logs_date ON public.daily_job_logs(log_date DESC);
CREATE UNIQUE INDEX idx_daily_job_logs_job_date ON public.daily_job_logs(job_order_id, log_date);

-- Enable RLS
ALTER TABLE public.daily_job_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Operators can view their own daily logs
CREATE POLICY "daily_job_logs_select_own"
  ON public.daily_job_logs
  FOR SELECT
  TO authenticated
  USING (operator_id = auth.uid());

-- Operators can insert their own daily logs
CREATE POLICY "daily_job_logs_insert_own"
  ON public.daily_job_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (operator_id = auth.uid());

-- Operators can update their own daily logs
CREATE POLICY "daily_job_logs_update_own"
  ON public.daily_job_logs
  FOR UPDATE
  TO authenticated
  USING (operator_id = auth.uid())
  WITH CHECK (operator_id = auth.uid());

-- Admins can view all daily logs
CREATE POLICY "daily_job_logs_select_admin"
  ON public.daily_job_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Admins can update all daily logs
CREATE POLICY "daily_job_logs_update_admin"
  ON public.daily_job_logs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Add is_multi_day flag to job_orders table
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS is_multi_day BOOLEAN DEFAULT FALSE;
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS total_days_worked INTEGER DEFAULT 0;

-- Add comments
COMMENT ON COLUMN public.job_orders.is_multi_day IS 'True if this job spans multiple days';
COMMENT ON COLUMN public.job_orders.total_days_worked IS 'Number of days worked on this job';

-- Function to automatically update total_days_worked
CREATE OR REPLACE FUNCTION update_total_days_worked()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.job_orders
  SET total_days_worked = (
    SELECT COUNT(DISTINCT log_date)
    FROM public.daily_job_logs
    WHERE job_order_id = NEW.job_order_id
  )
  WHERE id = NEW.job_order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update total_days_worked when daily log is created
CREATE TRIGGER trigger_update_total_days_worked
  AFTER INSERT ON public.daily_job_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_total_days_worked();
