-- ============================================================================
-- WORK ORDER CONTRACT COLUMNS - FIXED VERSION
-- Run this SQL in your Supabase SQL Editor
-- ============================================================================

-- Step 1: Add columns to job_orders table
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

-- Step 2: Add comments explaining the columns
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

-- Step 3: Check if active_job_orders view exists, if so, recreate it
DO $$
BEGIN
  -- Drop the view if it exists
  DROP VIEW IF EXISTS active_job_orders;

  -- Recreate the view with new columns (without operators table reference)
  CREATE VIEW active_job_orders AS
  SELECT
    jo.*
  FROM job_orders jo
  WHERE jo.job_status IN ('scheduled', 'in_progress', 'operator_confirmed');

  -- Grant permissions
  GRANT SELECT ON active_job_orders TO authenticated;

END $$;

-- Step 4: Grant UPDATE permissions on new columns
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

-- Step 5: Create index for faster queries on signed status
CREATE INDEX IF NOT EXISTS idx_job_orders_work_order_signed
ON job_orders(work_order_signed)
WHERE work_order_signed = true;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Work Order Contract columns added successfully!';
  RAISE NOTICE 'New columns: work_order_signed, work_order_signature, work_order_signer_name, work_order_signer_title, work_order_signed_at';
  RAISE NOTICE 'Additional: cut_through_authorized, cut_through_signature, completion_signature, completion_signer_name, completion_signed_at, completion_notes';
END $$;
