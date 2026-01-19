-- ============================================================================
-- PDF DOCUMENT MANAGEMENT SYSTEM
-- Tracks all generated PDFs for jobs including contracts, tickets, reports
-- ============================================================================

-- Create PDF documents table
CREATE TABLE IF NOT EXISTS pdf_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- 'work_order_contract', 'job_ticket', 'completion_report', 'equipment_checklist', 'silica_form', etc.
  document_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Path in Supabase Storage
  file_url TEXT, -- Public URL if applicable
  file_size_bytes INTEGER,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  generated_by UUID REFERENCES auth.users(id),
  version INTEGER DEFAULT 1, -- Track document versions
  is_latest BOOLEAN DEFAULT TRUE, -- Mark latest version
  metadata JSONB, -- Store additional data: signer name, completion status, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_pdf_documents_job_id ON pdf_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_pdf_documents_document_type ON pdf_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_pdf_documents_is_latest ON pdf_documents(is_latest) WHERE is_latest = true;
CREATE INDEX IF NOT EXISTS idx_pdf_documents_generated_at ON pdf_documents(generated_at DESC);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_pdf_documents_job_type_latest
ON pdf_documents(job_id, document_type, is_latest)
WHERE is_latest = true;

-- Add comments
COMMENT ON TABLE pdf_documents IS 'Tracks all PDF documents generated for jobs';
COMMENT ON COLUMN pdf_documents.document_type IS 'Type of document: work_order_contract, job_ticket, completion_report, equipment_checklist, silica_form, work_performed, pictures_report';
COMMENT ON COLUMN pdf_documents.version IS 'Version number for tracking document revisions';
COMMENT ON COLUMN pdf_documents.is_latest IS 'Marks the most recent version of a document';
COMMENT ON COLUMN pdf_documents.metadata IS 'JSON data: {signer_name, signature_date, notes, etc}';

-- Create function to automatically update updated_at timestamp
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

-- Create function to mark previous versions as not latest
CREATE OR REPLACE FUNCTION mark_previous_pdf_versions_old()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new PDF is inserted, mark all previous versions of the same document type for the same job as not latest
  UPDATE pdf_documents
  SET is_latest = FALSE
  WHERE job_id = NEW.job_id
    AND document_type = NEW.document_type
    AND id != NEW.id
    AND is_latest = TRUE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-mark previous versions
DROP TRIGGER IF EXISTS trigger_mark_previous_pdf_versions_old ON pdf_documents;
CREATE TRIGGER trigger_mark_previous_pdf_versions_old
  AFTER INSERT ON pdf_documents
  FOR EACH ROW
  EXECUTE FUNCTION mark_previous_pdf_versions_old();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON pdf_documents TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE pdf_documents_id_seq TO authenticated;

-- Create view for latest PDFs only
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

-- Create storage bucket for PDFs (run this separately in Supabase Storage UI or via API)
-- Bucket name: 'job-documents'
-- Public: false (requires authentication)
-- File size limit: 10MB
-- Allowed MIME types: application/pdf

-- Success message
DO $$
BEGIN
  RAISE NOTICE '===================================================================';
  RAISE NOTICE 'PDF Document Management System Created Successfully!';
  RAISE NOTICE '===================================================================';
  RAISE NOTICE 'Table: pdf_documents - tracks all PDF documents';
  RAISE NOTICE 'View: latest_pdf_documents - shows only latest versions';
  RAISE NOTICE 'Triggers: Auto-versioning and timestamp updates';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEP: Create Storage Bucket in Supabase';
  RAISE NOTICE '1. Go to Storage in Supabase Dashboard';
  RAISE NOTICE '2. Create new bucket: "job-documents"';
  RAISE NOTICE '3. Set to Private (requires auth)';
  RAISE NOTICE '4. Set file size limit: 10MB';
  RAISE NOTICE '5. Allowed MIME types: application/pdf';
  RAISE NOTICE '===================================================================';
END $$;
