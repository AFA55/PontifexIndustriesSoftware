-- COMPLETE FIX for shop_arrival_time
-- This script does EVERYTHING needed:
-- 1. Adds the column to job_orders table
-- 2. Recreates the view to include the new column
-- Run this ONCE in Supabase SQL Editor

-- Step 1: Add shop_arrival_time column to job_orders table
ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS shop_arrival_time TIME;

COMMENT ON COLUMN job_orders.shop_arrival_time IS 'Time operator should arrive at shop (before job arrival time)';

-- Step 2: Recreate the active_job_orders view to include shop_arrival_time
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

-- Step 3: Verify everything worked
DO $$
DECLARE
  column_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'job_orders' AND column_name = 'shop_arrival_time'
  ) INTO column_exists;

  IF column_exists THEN
    RAISE NOTICE '✅ SUCCESS! shop_arrival_time column exists and view has been refreshed.';
    RAISE NOTICE '✅ Your schedule board edits will now save permanently!';
  ELSE
    RAISE EXCEPTION '❌ FAILED! Column was not created.';
  END IF;
END $$;
