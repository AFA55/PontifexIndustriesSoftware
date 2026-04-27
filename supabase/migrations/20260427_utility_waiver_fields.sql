-- Utility waiver onsite signature fields on job_orders
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS utility_waiver_signed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS utility_waiver_signer_name text,
  ADD COLUMN IF NOT EXISTS utility_waiver_signer_company text,
  ADD COLUMN IF NOT EXISTS utility_waiver_signature_data text,
  ADD COLUMN IF NOT EXISTS utility_waiver_signed_at timestamptz;
