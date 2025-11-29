-- Add company_name, job_site_gc, and estimated drive time fields to jobs table

ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS job_site_gc TEXT,
ADD COLUMN IF NOT EXISTS estimated_drive_hours INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS estimated_drive_minutes INTEGER DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN public.jobs.company_name IS 'Company name associated with the job';
COMMENT ON COLUMN public.jobs.job_site_gc IS 'General Contractor at the job site';
COMMENT ON COLUMN public.jobs.estimated_drive_hours IS 'Estimated drive time in hours (0-24)';
COMMENT ON COLUMN public.jobs.estimated_drive_minutes IS 'Estimated drive time in minutes (0-59)';
