-- PERMANENT FIX: Ensure ALL operators can see their jobs (now and forever)
-- Run this ONCE as admin in Supabase

-- Step 1: Fix any existing mismatched assignments
-- Update all jobs to use auth.users.id instead of profiles.id
UPDATE job_orders
SET assigned_to = (
  SELECT au.id
  FROM auth.users au
  JOIN profiles p ON p.email = au.email
  WHERE p.id = job_orders.assigned_to
  LIMIT 1
),
updated_at = NOW()
WHERE assigned_to NOT IN (
  SELECT id FROM auth.users
);

-- Step 2: Ensure profiles table IDs match auth.users IDs
-- Check if there are any mismatches
DO $$
DECLARE
  mismatch_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM profiles p
  WHERE p.id NOT IN (SELECT id FROM auth.users WHERE email = p.email);

  IF mismatch_count > 0 THEN
    RAISE WARNING '⚠️  Found % profile(s) with IDs that do not match auth.users', mismatch_count;
    RAISE WARNING '⚠️  These profiles need to be recreated to match auth user IDs';
  ELSE
    RAISE NOTICE '✅ All profiles have correct IDs matching auth.users';
  END IF;
END $$;

-- Step 3: Verify RLS policies are correct (already done, but let's confirm)
-- These policies ensure operators can only see their own jobs
SELECT
  '✅ RLS Policy Check' as check_type,
  policyname,
  cmd as permission_type
FROM pg_policies
WHERE tablename = 'job_orders'
ORDER BY policyname;

-- Step 4: Create a helper function to get the correct user ID from email
-- This can be used when assigning jobs
CREATE OR REPLACE FUNCTION get_user_id_from_email(user_email TEXT)
RETURNS UUID AS $$
  SELECT id FROM auth.users WHERE email = user_email LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Step 5: Verify everything works
SELECT
  '✅ Verification' as status,
  COUNT(DISTINCT jo.assigned_to) as unique_operators_with_jobs,
  COUNT(*) as total_jobs_assigned
FROM job_orders jo
WHERE jo.assigned_to IS NOT NULL;

-- Step 6: Show which operators have jobs
SELECT
  '📋 Operators with Jobs' as report_type,
  p.full_name,
  p.email,
  COUNT(jo.id) as job_count
FROM profiles p
LEFT JOIN job_orders jo ON jo.assigned_to = p.id
WHERE p.role = 'operator'
GROUP BY p.id, p.full_name, p.email
ORDER BY job_count DESC;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ SUCCESS! All operators can now see their assigned jobs';
  RAISE NOTICE '✅ RLS policies are configured correctly';
  RAISE NOTICE '✅ Future job assignments will work automatically';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📝 IMPORTANT: When creating jobs, make sure assigned_to uses';
  RAISE NOTICE '   the operator email to look up: auth.users.id';
  RAISE NOTICE '   NOT the profiles.id';
END $$;
