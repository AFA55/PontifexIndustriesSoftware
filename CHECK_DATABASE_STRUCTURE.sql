-- ============================================================================
-- RUN THIS FIRST TO SEE YOUR DATABASE STRUCTURE
-- ============================================================================
-- This will show us what columns actually exist in your tables
-- Copy the output and we'll create a custom SQL that works for YOUR database
-- ============================================================================

-- Check job_orders table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'job_orders'
ORDER BY ordinal_position;

-- Also check if active_job_orders view exists
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_name = 'active_job_orders';
