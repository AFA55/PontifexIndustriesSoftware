-- =====================================================
-- CREATE DEMO ACCOUNTS FOR WORLD OF CONCRETE
-- =====================================================
-- This creates the demo accounts shown on the login page
--
-- DEMO OPERATOR: demo@pontifex.com / Demo123!
-- DEMO ADMIN: admin@pontifex.com / Admin123!
--
-- Run this in Supabase SQL Editor

-- Step 1: Create Demo Operator Account
-- You need to create this user in Supabase Auth Dashboard first:
-- Go to Authentication > Users > Add user
-- Email: demo@pontifex.com
-- Password: Demo123!
-- Then get the user ID and use it below

-- After creating the user in Auth Dashboard, run this:
-- Replace 'USER_ID_FROM_AUTH_DASHBOARD' with the actual UUID

/*
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  role,
  status,
  phone,
  created_at,
  updated_at
) VALUES (
  'USER_ID_FROM_AUTH_DASHBOARD', -- Replace with UUID from Auth Dashboard
  'demo@pontifex.com',
  'Demo Operator',
  'operator',
  'active',
  '555-0100',
  NOW(),
  NOW()
);
*/

-- Step 2: Create Demo Admin Account
-- You need to create this user in Supabase Auth Dashboard first:
-- Go to Authentication > Users > Add user
-- Email: admin@pontifex.com
-- Password: Admin123!
-- Then get the user ID and use it below

/*
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  role,
  status,
  phone,
  created_at,
  updated_at
) VALUES (
  'USER_ID_FROM_AUTH_DASHBOARD', -- Replace with UUID from Auth Dashboard
  'admin@pontifex.com',
  'Demo Admin',
  'admin',
  'status',
  '555-0101',
  NOW(),
  NOW()
);
*/

-- Step 3: Verify accounts created
SELECT
  id,
  email,
  full_name,
  role,
  status,
  created_at
FROM public.profiles
WHERE email IN (
  'demo@pontifex.com',
  'admin@pontifex.com',
  'andres.altamirano1280@gmail.com',
  'quantumlearnr@gmail.com'
)
ORDER BY role, email;

-- Expected result: 4 users
-- - andres.altamirano1280@gmail.com (Super Admin)
-- - admin@pontifex.com (Demo Admin)
-- - quantumlearnr@gmail.com (andres operator)
-- - demo@pontifex.com (Demo Operator)

-- =====================================================
-- MANUAL STEPS IN SUPABASE DASHBOARD
-- =====================================================
--
-- 1. Go to Supabase Dashboard > Authentication > Users
--
-- 2. Click "Add user" button
--    - Email: demo@pontifex.com
--    - Password: Demo123!
--    - Auto Confirm User: YES
--    - Click "Create user"
--    - Copy the User ID (UUID)
--
-- 3. Click "Add user" button again
--    - Email: admin@pontifex.com
--    - Password: Admin123!
--    - Auto Confirm User: YES
--    - Click "Create user"
--    - Copy the User ID (UUID)
--
-- 4. Go to SQL Editor and run the INSERT statements above
--    Replace 'USER_ID_FROM_AUTH_DASHBOARD' with the actual UUIDs
--
-- 5. Verify with the SELECT statement at the bottom
