-- ============================================================================
-- MINIMAL DEPLOYMENT - ONLY ADDS COLUMNS
-- NO VIEWS, NO GRANTS, JUST COLUMNS
-- ============================================================================

-- Add columns to job_orders table ONE AT A TIME
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS work_order_signed BOOLEAN DEFAULT FALSE;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS work_order_signature TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS work_order_signer_name TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS work_order_signer_title TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS work_order_signed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS cut_through_authorized BOOLEAN DEFAULT FALSE;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS cut_through_signature TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS completion_signature TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS completion_signer_name TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS completion_signed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS completion_notes TEXT;

-- Create pdf_documents table
CREATE TABLE IF NOT EXISTS pdf_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  document_type TEXT NOT NULL,
  document_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT,
  file_size_bytes INTEGER,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  generated_by UUID,
  version INTEGER DEFAULT 1,
  is_latest BOOLEAN DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Done!
SELECT 'SUCCESS! Columns added to job_orders and pdf_documents table created!' as status;
