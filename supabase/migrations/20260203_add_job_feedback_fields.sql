-- Add job difficulty rating and access feedback fields to job_orders
-- Created: 2026-02-03

-- Add columns to track job difficulty and access information
ALTER TABLE public.job_orders
ADD COLUMN IF NOT EXISTS job_difficulty_rating INTEGER CHECK (job_difficulty_rating >= 1 AND job_difficulty_rating <= 5),
ADD COLUMN IF NOT EXISTS job_access_rating INTEGER CHECK (job_access_rating >= 1 AND job_access_rating <= 5),
ADD COLUMN IF NOT EXISTS job_difficulty_notes TEXT,
ADD COLUMN IF NOT EXISTS job_access_notes TEXT,
ADD COLUMN IF NOT EXISTS feedback_submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS feedback_submitted_by TEXT;

-- Add comments to explain the fields
COMMENT ON COLUMN public.job_orders.job_difficulty_rating IS 'Operator rating of job difficulty (1=Very Easy, 5=Very Difficult)';
COMMENT ON COLUMN public.job_orders.job_access_rating IS 'Operator rating of job site access (1=Very Easy, 5=Very Difficult)';
COMMENT ON COLUMN public.job_orders.job_difficulty_notes IS 'Additional notes about job difficulty';
COMMENT ON COLUMN public.job_orders.job_access_notes IS 'Additional notes about job site access';
COMMENT ON COLUMN public.job_orders.feedback_submitted_at IS 'Timestamp when operator submitted feedback';
COMMENT ON COLUMN public.job_orders.feedback_submitted_by IS 'Operator name who submitted feedback';
