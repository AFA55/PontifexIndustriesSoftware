-- Add company_name, job_site_gc, and estimated_drive_time fields to jobs table

ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS job_site_gc TEXT,
ADD COLUMN IF NOT EXISTS estimated_drive_time TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.jobs.company_name IS 'Company name associated with the job';
COMMENT ON COLUMN public.jobs.job_site_gc IS 'General Contractor at the job site';
COMMENT ON COLUMN public.jobs.estimated_drive_time IS 'Estimated drive time to job site (e.g., "45 mins", "1.5 hours")';
