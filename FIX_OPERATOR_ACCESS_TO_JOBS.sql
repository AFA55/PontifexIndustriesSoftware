-- FIX: Allow operators to see jobs assigned to them
-- This fixes the issue where operators can't see their assigned jobs

-- First, let's make sure the active_job_orders view has proper RLS
-- Views inherit RLS from their base tables, so we need to fix job_orders table policies

-- Drop existing policies that might be blocking
DROP POLICY IF EXISTS "Operators can view assigned jobs" ON job_orders;
DROP POLICY IF EXISTS "Operators can update assigned jobs" ON job_orders;

-- Policy 1: Operators can SELECT (view) jobs assigned to them
CREATE POLICY "Operators can view their assigned jobs"
  ON job_orders
  FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR
    -- Also allow if user is admin
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy 2: Operators can UPDATE jobs assigned to them
CREATE POLICY "Operators can update their assigned jobs"
  ON job_orders
  FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy 3: Admins can do everything
DROP POLICY IF EXISTS "Admins can manage all jobs" ON job_orders;

CREATE POLICY "Admins can manage all jobs"
  ON job_orders
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Verify RLS is enabled
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;

-- Test query (run this to verify it works)
-- SELECT COUNT(*) FROM job_orders WHERE assigned_to = auth.uid();

DO $$
BEGIN
  RAISE NOTICE '✅ SUCCESS! Operators can now view and update their assigned jobs.';
  RAISE NOTICE '🔍 Test by logging in as an operator and checking their schedule.';
END $$;
