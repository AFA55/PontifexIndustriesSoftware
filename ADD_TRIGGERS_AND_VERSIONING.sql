-- ============================================================================
-- ADD TRIGGERS AND VERSIONING - RUN AFTER PERMISSIONS
-- ============================================================================
-- This adds the smart auto-versioning and timestamp features
-- ============================================================================

-- Function to auto-update timestamps
CREATE OR REPLACE FUNCTION update_pdf_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamps
DROP TRIGGER IF EXISTS trigger_update_pdf_documents_updated_at ON pdf_documents;
CREATE TRIGGER trigger_update_pdf_documents_updated_at
  BEFORE UPDATE ON pdf_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_pdf_documents_updated_at();

-- Function to auto-version PDFs (marks old versions as not latest)
CREATE OR REPLACE FUNCTION mark_previous_pdf_versions_old()
RETURNS TRIGGER AS $$
BEGIN
  -- When new PDF inserted, mark all previous versions of same type as old
  UPDATE pdf_documents
  SET is_latest = FALSE
  WHERE job_id = NEW.job_id
    AND document_type = NEW.document_type
    AND id != NEW.id
    AND is_latest = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-versioning
DROP TRIGGER IF EXISTS trigger_mark_previous_pdf_versions_old ON pdf_documents;
CREATE TRIGGER trigger_mark_previous_pdf_versions_old
  AFTER INSERT ON pdf_documents
  FOR EACH ROW
  EXECUTE FUNCTION mark_previous_pdf_versions_old();

-- Add helpful comments
COMMENT ON TABLE pdf_documents IS 'Tracks all PDF documents with auto-versioning';
COMMENT ON COLUMN pdf_documents.document_type IS 'Types: work_order_contract, job_ticket, completion_report, equipment_checklist, silica_form, work_performed, pictures_report';
COMMENT ON COLUMN pdf_documents.version IS 'Auto-incremented version number';
COMMENT ON COLUMN pdf_documents.is_latest IS 'Auto-managed: TRUE for latest version only';
COMMENT ON COLUMN pdf_documents.metadata IS 'Store signer info, notes, etc as JSON';

SELECT 'Triggers and versioning added successfully! PDFs will auto-version now.' as status;
