-- Add PDF storage for liability release documents
-- Migration: 20260204_add_liability_release_pdf

-- Add column to store base64 encoded PDF
ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS liability_release_pdf TEXT;

COMMENT ON COLUMN job_orders.liability_release_pdf IS 'Base64 encoded PDF of signed liability release document';

-- Add index for faster retrieval when displaying completed job tickets
CREATE INDEX IF NOT EXISTS idx_job_orders_liability_pdf ON job_orders(id) WHERE liability_release_pdf IS NOT NULL;
