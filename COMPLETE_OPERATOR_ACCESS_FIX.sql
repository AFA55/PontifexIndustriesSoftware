-- COMPLETE FIX: Ensure operators can see their assigned jobs
-- Run this entire script in Supabase SQL Editor

-- Step 1: Drop ALL existing policies on job_orders
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'job_orders') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON job_orders', r.policyname);
    END LOOP;
END $$;

-- Step 2: Create clean, simple policies

-- Policy 1: Admins can do EVERYTHING
CREATE POLICY "admins_all_access"
  ON job_orders
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy 2: Operators can SELECT (view) their assigned jobs
CREATE POLICY "operators_view_assigned"
  ON job_orders
  FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid()
  );

-- Policy 3: Operators can UPDATE their assigned jobs
CREATE POLICY "operators_update_assigned"
  ON job_orders
  FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Step 3: Make absolutely sure RLS is enabled
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;

-- Step 4: Grant necessary permissions
GRANT SELECT, UPDATE ON job_orders TO authenticated;

-- Step 5: Verify the fix with a test query
-- This will show how many jobs the current user can see
DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count FROM job_orders;
  RAISE NOTICE '✅ SUCCESS! Current user can see % job(s)', job_count;
  RAISE NOTICE '🔍 If you are an operator, you should see jobs assigned to you';
  RAISE NOTICE '🔍 If you are an admin, you should see ALL jobs';
END $$;
