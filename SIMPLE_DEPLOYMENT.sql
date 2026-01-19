-- ============================================================================
-- SIMPLE DEPLOYMENT - WORKS WITH ANY DATABASE SCHEMA
-- ============================================================================
-- This version only adds new columns and tables
-- Does NOT modify existing views or structures
-- Safe to run on any database
-- ============================================================================

-- ============================================================================
-- STEP 1: Add Work Order Contract Columns to job_orders
-- ============================================================================

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS work_order_signed BOOLEAN DEFAULT FALSE;

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS work_order_signature TEXT;

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS work_order_signer_name TEXT;

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS work_order_signer_title TEXT;

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS work_order_signed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS cut_through_authorized BOOLEAN DEFAULT FALSE;

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS cut_through_signature TEXT;

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS completion_signature TEXT;

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS completion_signer_name TEXT;

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS completion_signed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS completion_notes TEXT;

-- Add comments
COMMENT ON COLUMN job_orders.work_order_signed IS 'Whether the work order agreement was signed at job start';
COMMENT ON COLUMN job_orders.work_order_signature IS 'Customer signature on work order agreement';
COMMENT ON COLUMN job_orders.work_order_signer_name IS 'Name of person who signed work order';
COMMENT ON COLUMN job_orders.work_order_signer_title IS 'Title/position of signer';
COMMENT ON COLUMN job_orders.work_order_signed_at IS 'Timestamp when work order was signed';
COMMENT ON COLUMN job_orders.cut_through_authorized IS 'Whether customer authorized cutting through marked obstructions';
COMMENT ON COLUMN job_orders.cut_through_signature IS 'Separate signature for cut-through authorization';
COMMENT ON COLUMN job_orders.completion_signature IS 'Customer signature at job completion';
COMMENT ON COLUMN job_orders.completion_signer_name IS 'Name of person who signed completion';
COMMENT ON COLUMN job_orders.completion_signed_at IS 'Timestamp when completion was signed';
COMMENT ON COLUMN job_orders.completion_notes IS 'Any notes or exceptions noted at completion';

-- Grant permissions
GRANT UPDATE (
  work_order_signed,
  work_order_signature,
  work_order_signer_name,
  work_order_signer_title,
  work_order_signed_at,
  cut_through_authorized,
  cut_through_signature,
  completion_signature,
  completion_signer_name,
  completion_signed_at,
  completion_notes
) ON job_orders TO authenticated;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_job_orders_work_order_signed
ON job_orders(work_order_signed)
WHERE work_order_signed = true;

-- ============================================================================
-- STEP 2: Create PDF Documents Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS pdf_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pdf_documents_job_id ON pdf_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_pdf_documents_document_type ON pdf_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_pdf_documents_is_latest ON pdf_documents(is_latest) WHERE is_latest = true;
CREATE INDEX IF NOT EXISTS idx_pdf_documents_generated_at ON pdf_documents(generated_at DESC);

-- Add comments
COMMENT ON TABLE pdf_documents IS 'Tracks all PDF documents generated for jobs';
COMMENT ON COLUMN pdf_documents.document_type IS 'Type: work_order_contract, job_ticket, completion_report, etc';
COMMENT ON COLUMN pdf_documents.version IS 'Version number for tracking document revisions';
COMMENT ON COLUMN pdf_documents.is_latest IS 'Marks the most recent version of a document';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON pdf_documents TO authenticated;

-- ============================================================================
-- STEP 3: Create Helper Functions
-- ============================================================================

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_pdf_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_pdf_documents_updated_at ON pdf_documents;
CREATE TRIGGER trigger_update_pdf_documents_updated_at
  BEFORE UPDATE ON pdf_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_pdf_documents_updated_at();

-- Function to mark previous versions as old
CREATE OR REPLACE FUNCTION mark_previous_pdf_versions_old()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE pdf_documents
  SET is_latest = FALSE
  WHERE job_id = NEW.job_id
    AND document_type = NEW.document_type
    AND id != NEW.id
    AND is_latest = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_mark_previous_pdf_versions_old ON pdf_documents;
CREATE TRIGGER trigger_mark_previous_pdf_versions_old
  AFTER INSERT ON pdf_documents
  FOR EACH ROW
  EXECUTE FUNCTION mark_previous_pdf_versions_old();

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '✅ SUCCESS! Contract & PDF System Deployed';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Added to job_orders table:';
  RAISE NOTICE '  ✓ work_order_signed';
  RAISE NOTICE '  ✓ work_order_signature';
  RAISE NOTICE '  ✓ work_order_signer_name';
  RAISE NOTICE '  ✓ work_order_signer_title';
  RAISE NOTICE '  ✓ work_order_signed_at';
  RAISE NOTICE '  ✓ cut_through_authorized';
  RAISE NOTICE '  ✓ cut_through_signature';
  RAISE NOTICE '  ✓ completion_signature';
  RAISE NOTICE '  ✓ completion_signer_name';
  RAISE NOTICE '  ✓ completion_signed_at';
  RAISE NOTICE '  ✓ completion_notes';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  ✓ pdf_documents table';
  RAISE NOTICE '  ✓ Indexes for performance';
  RAISE NOTICE '  ✓ Auto-versioning triggers';
  RAISE NOTICE '  ✓ Permissions granted';
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';
  RAISE NOTICE '1. CREATE STORAGE BUCKET:';
  RAISE NOTICE '   → Go to Storage in Supabase';
  RAISE NOTICE '   → New Bucket: "job-documents"';
  RAISE NOTICE '   → Set to PRIVATE';
  RAISE NOTICE '   → File size: 10MB';
  RAISE NOTICE '   → Type: application/pdf';
  RAISE NOTICE '';
  RAISE NOTICE '2. ADD STORAGE POLICIES:';
  RAISE NOTICE '   → Use STORAGE_POLICIES.sql file';
  RAISE NOTICE '';
  RAISE NOTICE '3. TEST IT:';
  RAISE NOTICE '   → Navigate to any job';
  RAISE NOTICE '   → Click "Agreement" step';
  RAISE NOTICE '   → Sign and verify PDF generation';
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'Status: READY FOR PRODUCTION';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';
END $$;
