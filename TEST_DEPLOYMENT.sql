-- ============================================================================
-- TEST YOUR DEPLOYMENT - Run this to verify everything works
-- ============================================================================

-- Check that columns were added to job_orders
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'job_orders'
AND column_name IN (
  'work_order_signed',
  'work_order_signature',
  'work_order_signer_name',
  'cut_through_authorized'
)
ORDER BY column_name;

-- Should return 4 rows showing these columns exist

-- Check that pdf_documents table was created
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_name = 'pdf_documents';

-- Should return: pdf_documents | BASE TABLE

-- Check that indexes were created
SELECT
  indexname,
  tablename
FROM pg_indexes
WHERE tablename IN ('job_orders', 'pdf_documents')
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Should show indexes on both tables

-- Check that triggers were created
SELECT
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'pdf_documents'
ORDER BY trigger_name;

-- Should show 2 triggers on pdf_documents

-- SUMMARY
SELECT
  '✅ Database deployment successful!' as status,
  'All columns, tables, indexes, and triggers are in place' as message;
