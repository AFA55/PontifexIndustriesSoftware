-- DIAGNOSTIC: Find out why operator can't see their jobs
-- Run this while logged in AS THE OPERATOR (quantumlearnr@gmail.com)

-- Step 1: Check who you are logged in as
SELECT
  'Current User Info' as check_type,
  auth.uid() as my_user_id,
  auth.email() as my_email;

-- Step 2: Check your profile
SELECT
  'My Profile' as check_type,
  id,
  email,
  full_name,
  role
FROM profiles
WHERE id = auth.uid();

-- Step 3: Check jobs assigned to you
SELECT
  'Jobs Assigned to Me' as check_type,
  job_number,
  title,
  assigned_to,
  scheduled_date,
  status
FROM job_orders
WHERE assigned_to = auth.uid();

-- Step 4: Check jobs assigned to "andres" (by name)
SELECT
  'Jobs for andres (by profile lookup)' as check_type,
  jo.job_number,
  jo.title,
  jo.assigned_to,
  p.full_name,
  p.email,
  jo.scheduled_date
FROM job_orders jo
LEFT JOIN profiles p ON p.id = jo.assigned_to
WHERE p.email = 'quantumlearnr@gmail.com'
   OR p.full_name ILIKE '%andres%';

-- Step 5: Check ALL jobs (ignoring RLS) - this will fail if RLS is working
-- If this returns nothing, RLS is blocking you
SELECT
  'All Jobs (RLS test)' as check_type,
  COUNT(*) as total_jobs
FROM job_orders;

-- Step 6: Check RLS policies
SELECT
  'RLS Policies on job_orders' as check_type,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'job_orders';
