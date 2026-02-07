-- Add end_date column to job_orders table for multi-day jobs
ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS end_date DATE;

-- Add comment explaining the field
COMMENT ON COLUMN job_orders.end_date IS 'Optional end date for multi-day jobs. If null, job is single day (uses scheduled_date only).';

-- Create index for efficient querying of jobs by date range
CREATE INDEX IF NOT EXISTS idx_job_orders_date_range
ON job_orders(scheduled_date, end_date);
