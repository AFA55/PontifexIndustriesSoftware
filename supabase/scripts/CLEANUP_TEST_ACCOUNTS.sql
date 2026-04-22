-- =====================================================
-- CLEANUP TEST ACCOUNTS
-- =====================================================
-- This will delete test accounts while keeping Super Admin and andres
--
-- KEEPS:
--   - Super Admin (andres.altamirano1280@gmail.com)
--   - andres (quantumlearnr@gmail.com)
--
-- DELETES:
--   - admin@pontifex.com
--   - Marco Altamirano (quatumlearnr@gmail.com - typo)
--   - testadmin@pontifex.com
--   - testoperator@pontifex.com
--   - testuser@example.com
--   - testuser3@example.com

-- Step 1: First, let's see what accounts will be deleted
SELECT
  id,
  email,
  created_at
FROM auth.users
WHERE email NOT IN (
  'andres.altamirano1280@gmail.com',
  'quantumlearnr@gmail.com'
)
ORDER BY created_at;

-- Step 2: Delete related data in profiles table first
DELETE FROM public.profiles
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email NOT IN (
    'andres.altamirano1280@gmail.com',
    'quantumlearnr@gmail.com'
  )
);

-- Step 3: Delete from auth.users
-- Note: This requires service_role key in Supabase dashboard
DELETE FROM auth.users
WHERE email NOT IN (
  'andres.altamirano1280@gmail.com',
  'quantumlearnr@gmail.com'
);

-- Step 4: Verify only 2 users remain
SELECT
  id,
  email,
  created_at,
  'Kept' as status
FROM auth.users
ORDER BY created_at;

-- Expected result: 2 users (Super Admin and andres)
