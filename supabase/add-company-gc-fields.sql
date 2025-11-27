-- Add company_name and job_site_gc fields to jobs table

ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS job_site_gc TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.jobs.company_name IS 'Company name associated with the job';
COMMENT ON COLUMN public.jobs.job_site_gc IS 'General Contractor at the job site';
