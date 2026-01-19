-- =====================================================
-- PREVIEW TEST ACCOUNTS TO DELETE
-- =====================================================
-- Run this FIRST to see what will be deleted
-- NO DATA WILL BE DELETED - this is just a preview

-- Accounts that will be KEPT:
SELECT
  'KEEP' as action,
  email,
  created_at,
  id
FROM auth.users
WHERE email IN (
  'andres.altamirano1280@gmail.com',
  'quantumlearnr@gmail.com'
)
ORDER BY created_at;

-- Accounts that will be DELETED:
SELECT
  'DELETE' as action,
  email,
  created_at,
  id
FROM auth.users
WHERE email NOT IN (
  'andres.altamirano1280@gmail.com',
  'quantumlearnr@gmail.com'
)
ORDER BY created_at;

-- Count summary:
SELECT
  COUNT(*) FILTER (WHERE email IN ('andres.altamirano1280@gmail.com', 'quantumlearnr@gmail.com')) as accounts_to_keep,
  COUNT(*) FILTER (WHERE email NOT IN ('andres.altamirano1280@gmail.com', 'quantumlearnr@gmail.com')) as accounts_to_delete,
  COUNT(*) as total_accounts
FROM auth.users;
