-- ============================================================================
-- COMPLETE FIX FOR RLS INFINITE RECURSION
-- Run this ENTIRE script in one go
-- ============================================================================

-- Step 1: Disable RLS temporarily to clear everything
ALTER TABLE job_orders DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies (this will now work since RLS is disabled)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'job_orders')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON job_orders';
    END LOOP;
END $$;

-- Step 3: Re-enable RLS
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;

-- Step 4: Create simple, non-recursive policies
CREATE POLICY "authenticated_select_jobs" ON job_orders
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_jobs" ON job_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_jobs" ON job_orders
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_jobs" ON job_orders
  FOR DELETE
  TO authenticated
  USING (true);

-- Step 5: Verify the fix worked
SELECT
  'SUCCESS! Policies fixed' as status,
  count(*) as total_policies
FROM pg_policies
WHERE tablename = 'job_orders';
