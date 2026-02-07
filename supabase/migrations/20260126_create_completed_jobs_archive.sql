-- Migration: Create Completed Jobs Archive System
-- Created: 2026-01-26
-- Description: Archive completed jobs for historical data and reporting

-- =====================================================
-- COMPLETED JOBS ARCHIVE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.completed_jobs_archive (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Reference to original job order
  job_order_id UUID REFERENCES public.job_orders(id) ON DELETE SET NULL,
  job_order_number TEXT NOT NULL,

  -- Job Information (snapshot at completion)
  title TEXT NOT NULL,
  customer_name TEXT,
  contractor_name TEXT,
  job_type TEXT,
  location TEXT,
  address TEXT,
  description TEXT,

  -- Assignment Info
  operator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  operator_name TEXT,
  foreman_name TEXT,
  salesman_name TEXT,

  -- Scheduling Info
  scheduled_date DATE,
  arrival_time TEXT,
  estimated_hours DECIMAL(5,2),

  -- Time Tracking
  route_started_at TIMESTAMPTZ,
  work_started_at TIMESTAMPTZ,
  work_completed_at TIMESTAMPTZ,
  drive_time_minutes INTEGER,
  production_time_minutes INTEGER,
  total_time_minutes INTEGER,

  -- Work Details
  work_performed TEXT,
  materials_used TEXT,
  equipment_used TEXT,
  linear_feet_cut DECIMAL(10,2),
  core_quantity INTEGER,
  operator_notes TEXT,
  issues_encountered TEXT,

  -- Customer Info
  customer_signature TEXT,
  customer_signed_at TIMESTAMPTZ,
  customer_feedback_rating INTEGER,
  customer_feedback_comments TEXT,

  -- Financial
  quoted_amount DECIMAL(10,2),
  final_amount DECIMAL(10,2),
  standby_hours DECIMAL(8,2) DEFAULT 0,
  standby_charges DECIMAL(10,2) DEFAULT 0,

  -- Performance Metrics
  efficiency_score DECIMAL(5,2),
  quality_rating INTEGER,
  on_time_arrival BOOLEAN,

  -- Photos/Documents
  photo_urls TEXT[],
  document_urls TEXT[],

  -- Archive Metadata
  archived_at TIMESTAMPTZ DEFAULT NOW(),
  archived_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  archive_reason TEXT DEFAULT 'job_completed',

  -- Original timestamps for reference
  original_created_at TIMESTAMPTZ,
  original_updated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_completed_jobs_job_order ON public.completed_jobs_archive(job_order_id);
CREATE INDEX idx_completed_jobs_number ON public.completed_jobs_archive(job_order_number);
CREATE INDEX idx_completed_jobs_operator ON public.completed_jobs_archive(operator_id);
CREATE INDEX idx_completed_jobs_customer ON public.completed_jobs_archive(customer_name);
CREATE INDEX idx_completed_jobs_completed_date ON public.completed_jobs_archive(work_completed_at);
CREATE INDEX idx_completed_jobs_archived_date ON public.completed_jobs_archive(archived_at);

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE public.completed_jobs_archive ENABLE ROW LEVEL SECURITY;

-- Operators can view their own completed jobs
CREATE POLICY "Operators can view their own completed jobs"
  ON public.completed_jobs_archive FOR SELECT
  USING (operator_id = auth.uid());

-- Admins can view all completed jobs
CREATE POLICY "Admins can view all completed jobs"
  ON public.completed_jobs_archive FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins can create archive entries
CREATE POLICY "Admins can create archive entries"
  ON public.completed_jobs_archive FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- System can create archive entries (for operators completing jobs)
CREATE POLICY "Operators can create archive entries for their jobs"
  ON public.completed_jobs_archive FOR INSERT
  WITH CHECK (operator_id = auth.uid());

-- =====================================================
-- FUNCTION: Archive Job on Completion
-- =====================================================
CREATE OR REPLACE FUNCTION archive_completed_job(
  p_job_order_id UUID,
  p_operator_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_archive_id UUID;
  v_job RECORD;
  v_operator_name TEXT;
  v_drive_time INTEGER;
  v_production_time INTEGER;
  v_total_time INTEGER;
BEGIN
  -- Get job order details
  SELECT * INTO v_job
  FROM public.job_orders
  WHERE id = p_job_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job order not found';
  END IF;

  -- Get operator name
  SELECT full_name INTO v_operator_name
  FROM public.profiles
  WHERE id = p_operator_id;

  -- Calculate time durations
  IF v_job.route_started_at IS NOT NULL AND v_job.work_started_at IS NOT NULL THEN
    v_drive_time := EXTRACT(EPOCH FROM (v_job.work_started_at - v_job.route_started_at)) / 60;
  END IF;

  IF v_job.work_started_at IS NOT NULL AND v_job.work_completed_at IS NOT NULL THEN
    v_production_time := EXTRACT(EPOCH FROM (v_job.work_completed_at - v_job.work_started_at)) / 60;
  END IF;

  IF v_job.route_started_at IS NOT NULL AND v_job.work_completed_at IS NOT NULL THEN
    v_total_time := EXTRACT(EPOCH FROM (v_job.work_completed_at - v_job.route_started_at)) / 60;
  END IF;

  -- Get standby totals for this job
  WITH standby_totals AS (
    SELECT
      COALESCE(SUM(duration_hours), 0) as total_hours,
      COALESCE(SUM(total_charge), 0) as total_charges
    FROM public.standby_logs
    WHERE job_order_id = p_job_order_id
    AND status = 'completed'
  )
  -- Create archive entry
  INSERT INTO public.completed_jobs_archive (
    job_order_id,
    job_order_number,
    title,
    customer_name,
    contractor_name,
    job_type,
    location,
    address,
    description,
    operator_id,
    operator_name,
    foreman_name,
    salesman_name,
    scheduled_date,
    arrival_time,
    estimated_hours,
    route_started_at,
    work_started_at,
    work_completed_at,
    drive_time_minutes,
    production_time_minutes,
    total_time_minutes,
    work_performed,
    materials_used,
    equipment_used,
    operator_notes,
    issues_encountered,
    customer_signature,
    customer_signed_at,
    customer_feedback_rating,
    customer_feedback_comments,
    quoted_amount,
    standby_hours,
    standby_charges,
    photo_urls,
    archived_by,
    original_created_at,
    original_updated_at
  )
  SELECT
    v_job.id,
    v_job.job_order_number,
    v_job.title,
    v_job.customer_name,
    v_job.contractor_name,
    v_job.job_type,
    v_job.location,
    v_job.address,
    v_job.description,
    p_operator_id,
    v_operator_name,
    v_job.foreman_name,
    v_job.salesman_name,
    v_job.scheduled_date,
    v_job.arrival_time,
    v_job.estimated_hours,
    v_job.route_started_at,
    v_job.work_started_at,
    v_job.work_completed_at,
    v_drive_time,
    v_production_time,
    v_total_time,
    v_job.work_performed,
    v_job.materials_used,
    v_job.equipment_used,
    v_job.operator_notes,
    v_job.issues_encountered,
    v_job.customer_signature,
    v_job.customer_signed_at,
    v_job.customer_feedback_rating,
    v_job.customer_feedback_comments,
    v_job.quoted_amount,
    st.total_hours,
    st.total_charges,
    v_job.photo_urls,
    p_operator_id,
    v_job.created_at,
    v_job.updated_at
  FROM standby_totals st
  RETURNING id INTO v_archive_id;

  RETURN v_archive_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION archive_completed_job(UUID, UUID) TO authenticated;

-- =====================================================
-- VIEW: Recent Completed Jobs Summary
-- =====================================================
CREATE OR REPLACE VIEW recent_completed_jobs AS
SELECT
  id,
  job_order_number,
  title,
  customer_name,
  operator_name,
  work_completed_at,
  total_time_minutes,
  standby_hours,
  standby_charges,
  customer_feedback_rating
FROM public.completed_jobs_archive
WHERE work_completed_at >= NOW() - INTERVAL '90 days'
ORDER BY work_completed_at DESC;

-- Grant access to view
GRANT SELECT ON recent_completed_jobs TO authenticated;

-- =====================================================
-- VIEW: Operator Performance Summary
-- =====================================================
CREATE OR REPLACE VIEW operator_performance_summary AS
SELECT
  operator_id,
  operator_name,
  COUNT(*) as total_jobs_completed,
  AVG(total_time_minutes) as avg_job_duration_minutes,
  SUM(standby_hours) as total_standby_hours,
  SUM(standby_charges) as total_standby_charges,
  AVG(customer_feedback_rating) as avg_customer_rating,
  COUNT(CASE WHEN on_time_arrival THEN 1 END) as on_time_arrivals,
  COUNT(*) FILTER (WHERE work_completed_at >= NOW() - INTERVAL '30 days') as jobs_last_30_days
FROM public.completed_jobs_archive
WHERE operator_id IS NOT NULL
GROUP BY operator_id, operator_name;

-- Grant access to view
GRANT SELECT ON operator_performance_summary TO authenticated;
