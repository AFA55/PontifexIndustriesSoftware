-- Add site condition fields to job_orders table
-- These fields help operators understand job site conditions upfront

ALTER TABLE public.job_orders
ADD COLUMN IF NOT EXISTS truck_distance_to_work TEXT DEFAULT 'close',
ADD COLUMN IF NOT EXISTS work_environment TEXT DEFAULT 'outdoor',
ADD COLUMN IF NOT EXISTS site_cleanliness INTEGER DEFAULT 5;

-- Add comments to document purpose
COMMENT ON COLUMN public.job_orders.truck_distance_to_work IS 'How close truck can park to work area: close (under 300ft) or far_unload_carry (need to carry equipment)';
COMMENT ON COLUMN public.job_orders.work_environment IS 'Work environment: indoor or outdoor';
COMMENT ON COLUMN public.job_orders.site_cleanliness IS 'Site cleanliness rating from 1 (dirty) to 10 (very clean)';
