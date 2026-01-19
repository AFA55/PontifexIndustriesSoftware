-- Refresh the active_job_orders view to include shop_arrival_time
-- Run this in Supabase SQL Editor after adding shop_arrival_time column

DROP VIEW IF EXISTS active_job_orders;

CREATE OR REPLACE VIEW active_job_orders AS
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

-- Verify it worked
SELECT 'SUCCESS! View refreshed with shop_arrival_time column.' as status;
