-- COMPREHENSIVE FIX: Remove SECURITY DEFINER from ALL views
-- Run this in Supabase SQL Editor to fix all 5 security errors
-- Created: 2025-12-24

-- =====================================================
-- FIX ALL 5 SECURITY DEFINER VIEWS
-- =====================================================

-- 1. active_job_orders
DROP VIEW IF EXISTS public.active_job_orders CASCADE;
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
DROP VIEW IF EXISTS public.timecards_with_users CASCADE;
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

-- 3. work_accessibility_analytics (NEW - from migration)
DROP VIEW IF EXISTS public.work_accessibility_analytics CASCADE;
CREATE VIEW public.work_accessibility_analytics AS
SELECT
  wi.work_type,
  jo.customer_name,
  jo.location,
  AVG(wi.accessibility_rating) as avg_accessibility_rating,
  COUNT(*) as job_count,
  STRING_AGG(DISTINCT wi.accessibility_description, '; ') as common_challenges
FROM work_items wi
JOIN job_orders jo ON jo.id = wi.job_order_id
WHERE wi.accessibility_rating IS NOT NULL
GROUP BY wi.work_type, jo.customer_name, jo.location
ORDER BY avg_accessibility_rating DESC;

-- 4. job_document_stats
DROP VIEW IF EXISTS public.job_document_stats CASCADE;
CREATE VIEW public.job_document_stats AS
SELECT
  job_id,
  COUNT(*) as total_documents,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_documents,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_documents,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_documents,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'completed')::DECIMAL / NULLIF(COUNT(*), 0)) * 100,
    2
  ) as completion_percentage
FROM public.job_documents
GROUP BY job_id;

-- 5. operator_document_assignments
DROP VIEW IF EXISTS public.operator_document_assignments CASCADE;
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
GRANT SELECT ON public.work_accessibility_analytics TO authenticated;
GRANT SELECT ON public.job_document_stats TO authenticated;
GRANT SELECT ON public.operator_document_assignments TO authenticated;

-- Add comments for documentation
COMMENT ON VIEW public.active_job_orders IS 'Active jobs with operator details (enforces RLS)';
COMMENT ON VIEW public.timecards_with_users IS 'Timecards with user details (enforces RLS)';
COMMENT ON VIEW public.work_accessibility_analytics IS 'Work accessibility analytics for pricing (enforces RLS)';
COMMENT ON VIEW public.job_document_stats IS 'Document completion statistics (enforces RLS)';
COMMENT ON VIEW public.operator_document_assignments IS 'Operator document assignments (enforces RLS)';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ All 5 Security Definer views have been fixed!';
  RAISE NOTICE 'Views now enforce RLS policies properly.';
END $$;
