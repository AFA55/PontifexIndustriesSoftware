-- Add liability release tracking fields to job_orders
-- Created: 2026-02-02

-- Add columns to track operator's liability release signature
ALTER TABLE public.job_orders
ADD COLUMN IF NOT EXISTS liability_release_signed_by TEXT,
ADD COLUMN IF NOT EXISTS liability_release_signature TEXT,
ADD COLUMN IF NOT EXISTS liability_release_signed_at TIMESTAMPTZ;

-- Add comments to explain the fields
COMMENT ON COLUMN public.job_orders.liability_release_signed_by IS 'Operator name who signed the liability release';
COMMENT ON COLUMN public.job_orders.liability_release_signature IS 'Electronic signature for liability release';
COMMENT ON COLUMN public.job_orders.liability_release_signed_at IS 'Timestamp when liability release was signed by operator';
