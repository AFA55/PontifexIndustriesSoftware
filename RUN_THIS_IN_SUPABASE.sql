-- ============================================================================
-- COMPLETE DEPLOYMENT - RUN THIS ENTIRE FILE IN SUPABASE SQL EDITOR
-- ============================================================================
-- This single file does everything you need for the contract & PDF system
-- Just copy/paste this entire file and click RUN
-- ============================================================================

-- STEP 1: Add Work Order Contract Columns
-- ============================================================================
ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS work_order_signed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS work_order_signature TEXT,
ADD COLUMN IF NOT EXISTS work_order_signer_name TEXT,
ADD COLUMN IF NOT EXISTS work_order_signer_title TEXT,
ADD COLUMN IF NOT EXISTS work_order_signed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cut_through_authorized BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cut_through_signature TEXT,
ADD COLUMN IF NOT EXISTS completion_signature TEXT,
ADD COLUMN IF NOT EXISTS completion_signer_name TEXT,
ADD COLUMN IF NOT EXISTS completion_signed_at TIMESTAMP WITH TIME ZONE,
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

-- Update active_job_orders view
DROP VIEW IF EXISTS active_job_orders;
CREATE VIEW active_job_orders AS
SELECT jo.*
FROM job_orders jo
WHERE jo.job_status IN ('scheduled', 'in_progress', 'operator_confirmed');

GRANT SELECT ON active_job_orders TO authenticated;

-- Grant permissions on new columns
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
-- STEP 2: Create PDF Document Management System
-- ============================================================================

-- Create PDF documents table
CREATE TABLE IF NOT EXISTS pdf_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT,
  file_size_bytes INTEGER,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  generated_by UUID REFERENCES auth.users(id),
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
CREATE INDEX IF NOT EXISTS idx_pdf_documents_job_type_latest
ON pdf_documents(job_id, document_type, is_latest) WHERE is_latest = true;

-- Add comments
COMMENT ON TABLE pdf_documents IS 'Tracks all PDF documents generated for jobs';
COMMENT ON COLUMN pdf_documents.document_type IS 'Type: work_order_contract, job_ticket, completion_report, equipment_checklist, silica_form, work_performed, pictures_report';
COMMENT ON COLUMN pdf_documents.version IS 'Version number for tracking document revisions';
COMMENT ON COLUMN pdf_documents.is_latest IS 'Marks the most recent version of a document';
COMMENT ON COLUMN pdf_documents.metadata IS 'JSON data: {signer_name, signature_date, notes, etc}';

-- Create update timestamp function
CREATE OR REPLACE FUNCTION update_pdf_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_pdf_documents_updated_at ON pdf_documents;
CREATE TRIGGER trigger_update_pdf_documents_updated_at
  BEFORE UPDATE ON pdf_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_pdf_documents_updated_at();

-- Create versioning function
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

-- Create trigger for versioning
DROP TRIGGER IF EXISTS trigger_mark_previous_pdf_versions_old ON pdf_documents;
CREATE TRIGGER trigger_mark_previous_pdf_versions_old
  AFTER INSERT ON pdf_documents
  FOR EACH ROW
  EXECUTE FUNCTION mark_previous_pdf_versions_old();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON pdf_documents TO authenticated;

-- Create view for latest PDFs
CREATE OR REPLACE VIEW latest_pdf_documents AS
SELECT
  pd.*,
  jo.job_number,
  jo.customer_name,
  jo.job_date,
  u.email as generated_by_email
FROM pdf_documents pd
JOIN job_orders jo ON pd.job_id = jo.id
LEFT JOIN auth.users u ON pd.generated_by = u.id
WHERE pd.is_latest = TRUE;

GRANT SELECT ON latest_pdf_documents TO authenticated;

-- ============================================================================
-- SUCCESS!
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '✅ CONTRACT & PDF SYSTEM DEPLOYED SUCCESSFULLY!';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';
  RAISE NOTICE '✓ Work Order Contract columns added to job_orders table';
  RAISE NOTICE '✓ PDF documents tracking system created';
  RAISE NOTICE '✓ Automatic versioning enabled';
  RAISE NOTICE '✓ Permissions granted';
  RAISE NOTICE '✓ Views created';
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';
  RAISE NOTICE '1. Create Storage Bucket:';
  RAISE NOTICE '   - Go to Storage in Supabase Dashboard';
  RAISE NOTICE '   - Create bucket named: job-documents';
  RAISE NOTICE '   - Set to PRIVATE (not public)';
  RAISE NOTICE '   - File size limit: 10MB';
  RAISE NOTICE '   - Allowed types: application/pdf';
  RAISE NOTICE '';
  RAISE NOTICE '2. Add Storage Policies (3 policies):';
  RAISE NOTICE '   See STORAGE_POLICIES.sql file';
  RAISE NOTICE '';
  RAISE NOTICE '3. Test the system:';
  RAISE NOTICE '   - Navigate to any job';
  RAISE NOTICE '   - Click "Agreement" step';
  RAISE NOTICE '   - Sign the contract';
  RAISE NOTICE '   - Verify PDF is generated';
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'System Status: READY FOR PRODUCTION';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';
END $$;
