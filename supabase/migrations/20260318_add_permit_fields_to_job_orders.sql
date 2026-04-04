-- Add permit tracking to job_orders
-- Permits: work_permit, hot_work_permit, excavation_permit, other (custom text)
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS permit_required BOOLEAN DEFAULT FALSE;
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS permits JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.job_orders.permit_required IS 'Whether permits are required for this job';
COMMENT ON COLUMN public.job_orders.permits IS 'Array of permit objects: [{type: "work_permit"|"hot_work"|"excavation"|"other", label: string, details: string}]';
