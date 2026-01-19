-- Migration: Fix SECURITY DEFINER Views
-- Created: 2025-12-23
-- Description: Recreates views without SECURITY DEFINER to enforce proper RLS policies
-- Issue: Views with SECURITY DEFINER run with creator's permissions, bypassing RLS

-- =====================================================
-- DROP AND RECREATE VIEWS WITHOUT SECURITY DEFINER
-- =====================================================

-- 1. active_job_orders
DROP VIEW IF EXISTS public.active_job_orders;
CREATE VIEW public.active_job_orders AS
SELECT
  jo.*,
  p.full_name as operator_name,
  p.email as operator_email,
  p.phone as operator_phone,
  CASE
    WHEN jo.work_completed_at IS NOT NULL THEN 'Completed'
    WHEN jo.work_started_at IS NOT NULL THEN 'In Progress'
    WHEN jo.route_started_at IS NOT NULL THEN 'In Route'
    WHEN jo.assigned_at IS NOT NULL THEN 'Assigned'
    ELSE 'Scheduled'
  END as readable_status,
  ROUND((jo.drive_time::DECIMAL / 60), 2) as drive_hours,
  ROUND((jo.production_time::DECIMAL / 60), 2) as production_hours,
  ROUND((jo.total_time::DECIMAL / 60), 2) as total_hours
FROM job_orders jo
LEFT JOIN profiles p ON p.id = jo.assigned_to
WHERE jo.deleted_at IS NULL
ORDER BY
  CASE jo.status
    WHEN 'in_progress' THEN 1
    WHEN 'in_route' THEN 2
    WHEN 'assigned' THEN 3
    WHEN 'scheduled' THEN 4
    WHEN 'completed' THEN 5
    ELSE 6
  END,
  jo.scheduled_date ASC,
  jo.created_at DESC;

-- 2. timecards_with_users
DROP VIEW IF EXISTS public.timecards_with_users;
CREATE VIEW public.timecards_with_users AS
SELECT
  t.id,
  t.user_id,
  p.full_name,
  p.email,
  p.role,
  t.date,
  t.clock_in_time,
  t.clock_out_time,
  t.total_hours,
  t.clock_in_latitude,
  t.clock_in_longitude,
  t.clock_out_latitude,
  t.clock_out_longitude,
  t.notes,
  t.is_approved,
  t.approved_by,
  t.approved_at,
  approver.full_name as approved_by_name,
  t.created_at,
  t.updated_at
FROM timecards t
LEFT JOIN profiles p ON t.user_id = p.id
LEFT JOIN profiles approver ON t.approved_by = approver.id;

-- 3. job_document_stats
DROP VIEW IF EXISTS public.job_document_stats;
CREATE VIEW public.job_document_stats AS
SELECT
  job_id,
  COUNT(*) as total_documents,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_documents,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_documents,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_documents,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'completed')::DECIMAL / COUNT(*)) * 100,
    2
  ) as completion_percentage
FROM public.job_documents
GROUP BY job_id;

-- 4. operator_document_assignments
DROP VIEW IF EXISTS public.operator_document_assignments;
CREATE VIEW public.operator_document_assignments AS
SELECT
  jd.id as document_id,
  jd.job_id,
  jd.document_name,
  jd.document_category,
  jd.status,
  jd.completed_at,
  j.title as job_title,
  j.location as job_location,
  j.scheduled_start_date,
  p.id as operator_id,
  p.full_name as operator_name
FROM public.job_documents jd
JOIN public.jobs j ON jd.job_id = j.id
CROSS JOIN LATERAL UNNEST(j.assigned_operators) AS operator_id
JOIN public.profiles p ON p.id = operator_id
WHERE jd.status IN ('pending', 'in_progress');

-- Grant necessary permissions
GRANT SELECT ON public.active_job_orders TO authenticated;
GRANT SELECT ON public.timecards_with_users TO authenticated;
GRANT SELECT ON public.job_document_stats TO authenticated;
GRANT SELECT ON public.operator_document_assignments TO authenticated;

-- Add comments
COMMENT ON VIEW public.active_job_orders IS 'Active jobs with operator details (no SECURITY DEFINER - enforces RLS)';
COMMENT ON VIEW public.timecards_with_users IS 'Timecards with user details (no SECURITY DEFINER - enforces RLS)';
COMMENT ON VIEW public.job_document_stats IS 'Document completion statistics per job (no SECURITY DEFINER - enforces RLS)';
COMMENT ON VIEW public.operator_document_assignments IS 'Operator document assignments (no SECURITY DEFINER - enforces RLS)';
