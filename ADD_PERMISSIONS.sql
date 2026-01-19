-- ============================================================================
-- ADD PERMISSIONS - RUN THIS AFTER MINIMAL_JUST_COLUMNS.sql
-- ============================================================================

-- Grant UPDATE permissions on new job_orders columns
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

-- Grant permissions on pdf_documents table
GRANT SELECT, INSERT, UPDATE ON pdf_documents TO authenticated;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_job_orders_work_order_signed ON job_orders(work_order_signed) WHERE work_order_signed = true;
CREATE INDEX IF NOT EXISTS idx_pdf_documents_job_id ON pdf_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_pdf_documents_is_latest ON pdf_documents(is_latest) WHERE is_latest = true;

SELECT 'Permissions and indexes added successfully!' as status;
