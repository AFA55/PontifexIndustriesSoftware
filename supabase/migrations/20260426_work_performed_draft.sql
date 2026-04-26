-- Add draft work performed state to daily_job_logs
-- Allows operators to auto-save work-in-progress before final submission,
-- and lets admins see real-time work state before job completion.

ALTER TABLE daily_job_logs
ADD COLUMN IF NOT EXISTS work_performed_draft jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS work_performed_draft_updated_at timestamptz DEFAULT NULL;

-- Index for admin queries: efficiently find jobs with active drafts
CREATE INDEX IF NOT EXISTS idx_daily_job_logs_work_draft
ON daily_job_logs(job_order_id, operator_id)
WHERE work_performed_draft IS NOT NULL;
