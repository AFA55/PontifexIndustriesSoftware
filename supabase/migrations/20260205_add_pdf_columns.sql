-- Add PDF storage columns for silica form and agreement PDFs
-- These will store base64 encoded PDF data for completed job attachments

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS silica_form_pdf TEXT,
ADD COLUMN IF NOT EXISTS agreement_pdf TEXT;

-- Add comments for documentation
COMMENT ON COLUMN job_orders.silica_form_pdf IS 'Base64 encoded PDF of signed silica exposure control plan';
COMMENT ON COLUMN job_orders.agreement_pdf IS 'Base64 encoded PDF of signed work order agreement';

-- Create indexes for faster retrieval when admins view completed jobs
CREATE INDEX IF NOT EXISTS idx_job_orders_silica_pdf ON job_orders(id) WHERE silica_form_pdf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_orders_agreement_pdf ON job_orders(id) WHERE agreement_pdf IS NOT NULL;

-- Add index for completed jobs with all PDFs (for admin dashboard queries)
CREATE INDEX IF NOT EXISTS idx_job_orders_completed_with_pdfs ON job_orders(status, completion_signed_at)
WHERE status = 'completed' AND completion_signed_at IS NOT NULL;
