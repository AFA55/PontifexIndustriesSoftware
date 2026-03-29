-- Add missing info tracking fields to job_orders
-- These allow the schedule board to visually indicate jobs that have been flagged
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS missing_info_flagged BOOLEAN DEFAULT false;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS missing_info_flagged_by UUID REFERENCES auth.users(id);
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS missing_info_flagged_at TIMESTAMPTZ;

-- Add index for quick lookup of flagged jobs
CREATE INDEX IF NOT EXISTS idx_job_orders_missing_info ON job_orders(missing_info_flagged) WHERE missing_info_flagged = true;

-- Add 'read_at' to schedule_notifications for tracking when notification was read
ALTER TABLE schedule_notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
