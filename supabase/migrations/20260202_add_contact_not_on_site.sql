-- Add contact_not_on_site field to job_orders
-- Created: 2026-02-02

-- Add column to track when contact was not available on site
ALTER TABLE public.job_orders
ADD COLUMN IF NOT EXISTS contact_not_on_site BOOLEAN DEFAULT FALSE;

-- Add comment to explain the field
COMMENT ON COLUMN public.job_orders.contact_not_on_site IS 'TRUE when job was completed but no contact was available on site to sign';
