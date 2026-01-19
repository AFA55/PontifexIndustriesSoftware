-- ============================================================================
-- FIX INFINITE RECURSION IN job_orders RLS POLICIES
-- ============================================================================
-- This fixes the "infinite recursion detected in policy" error
-- by simplifying and recreating the RLS policies
-- ============================================================================

-- Step 1: Drop all existing policies on job_orders to start fresh
DROP POLICY IF EXISTS "Users can view their assigned jobs" ON job_orders;
DROP POLICY IF EXISTS "Users can view jobs" ON job_orders;
DROP POLICY IF EXISTS "Users can update their jobs" ON job_orders;
DROP POLICY IF EXISTS "Users can insert jobs" ON job_orders;
DROP POLICY IF EXISTS "Operators can view assigned jobs" ON job_orders;
DROP POLICY IF EXISTS "Operators can update assigned jobs" ON job_orders;
DROP POLICY IF EXISTS "Admin can do anything with jobs" ON job_orders;
DROP POLICY IF EXISTS "Anyone can view jobs" ON job_orders;
DROP POLICY IF EXISTS "Authenticated users can view jobs" ON job_orders;
DROP POLICY IF EXISTS "Authenticated users can update jobs" ON job_orders;

-- Step 2: Create simple, non-recursive policies

-- Policy 1: Allow all authenticated users to SELECT jobs
CREATE POLICY "authenticated_select_jobs" ON job_orders
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy 2: Allow all authenticated users to INSERT jobs
CREATE POLICY "authenticated_insert_jobs" ON job_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy 3: Allow all authenticated users to UPDATE jobs
CREATE POLICY "authenticated_update_jobs" ON job_orders
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy 4: Allow all authenticated users to DELETE jobs
CREATE POLICY "authenticated_delete_jobs" ON job_orders
  FOR DELETE
  TO authenticated
  USING (true);

-- Step 3: Ensure RLS is enabled on job_orders
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;

-- Verify the policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'job_orders';
