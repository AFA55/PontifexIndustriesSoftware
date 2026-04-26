-- Add completion sign-off PDF columns to job_orders
ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS completion_pdf_url text,
ADD COLUMN IF NOT EXISTS completion_signed_at timestamptz,
ADD COLUMN IF NOT EXISTS completion_signer_name text,
ADD COLUMN IF NOT EXISTS completion_signature_url text;

COMMENT ON COLUMN job_orders.completion_pdf_url IS 'URL of the generated completion sign-off PDF stored in completion-pdfs bucket';
COMMENT ON COLUMN job_orders.completion_signed_at IS 'Timestamp when the customer signed the job completion document';
COMMENT ON COLUMN job_orders.completion_signer_name IS 'Full name of the person who signed the completion document';
COMMENT ON COLUMN job_orders.completion_signature_url IS 'URL of the signature image stored in job-photos bucket';

CREATE INDEX IF NOT EXISTS idx_job_orders_completion_pdf ON job_orders(id) WHERE completion_pdf_url IS NOT NULL;
