-- =====================================================
-- CREATE DEMO ACCOUNTS FOR WORLD OF CONCRETE 2026
-- =====================================================
-- This creates the demo accounts shown on login page
--
-- IMPORTANT: You MUST create these in Supabase Dashboard first!
--
-- Step 1: Go to Supabase Dashboard > Authentication > Users
-- Step 2: Click "Add user" and create BOTH accounts:
--
--   Account 1 - Demo Operator:
--   ✓ Email: demo@pontifex.com
--   ✓ Password: Demo1234!
--   ✓ Auto Confirm User: YES ✓
--   ✓ Click "Create user"
--
--   Account 2 - Demo Admin:
--   ✓ Email: admin@pontifex.com
--   ✓ Password: Admin1234!
--   ✓ Auto Confirm User: YES ✓
--   ✓ Click "Create user"
--
-- Step 3: After BOTH users are created, run THIS SCRIPT below
-- It will automatically create the profiles for both users

-- =====================================================
-- AUTO-CREATE PROFILES FOR DEMO ACCOUNTS
-- =====================================================

-- This will automatically find the user IDs and create profiles
DO $$
DECLARE
  demo_operator_id UUID;
  demo_admin_id UUID;
BEGIN
  -- Get demo operator user ID
  SELECT id INTO demo_operator_id
  FROM auth.users
  WHERE email = 'demo@pontifex.com'
  LIMIT 1;

  -- Get demo admin user ID
  SELECT id INTO demo_admin_id
  FROM auth.users
  WHERE email = 'admin@pontifex.com'
  LIMIT 1;

  -- Check if we found both users
  IF demo_operator_id IS NULL THEN
    RAISE EXCEPTION 'Demo operator account not found! Create demo@pontifex.com in Auth Dashboard first!';
  END IF;

  IF demo_admin_id IS NULL THEN
    RAISE EXCEPTION 'Demo admin account not found! Create admin@pontifex.com in Auth Dashboard first!';
  END IF;

  -- Create or update demo operator profile
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    active,
    phone,
    created_at,
    updated_at
  ) VALUES (
    demo_operator_id,
    'demo@pontifex.com',
    'Demo Operator',
    'operator',
    true,
    '555-0100',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = 'Demo Operator',
    role = 'operator',
    active = true,
    phone = '555-0100',
    updated_at = NOW();

  -- Create or update demo admin profile
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    active,
    phone,
    created_at,
    updated_at
  ) VALUES (
    demo_admin_id,
    'admin@pontifex.com',
    'Demo Admin',
    'admin',
    true,
    '555-0101',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = 'Demo Admin',
    role = 'admin',
    active = true,
    phone = '555-0101',
    updated_at = NOW();

  RAISE NOTICE '✅ Demo accounts created successfully!';
  RAISE NOTICE '✅ demo@pontifex.com (Operator) - ID: %', demo_operator_id;
  RAISE NOTICE '✅ admin@pontifex.com (Admin) - ID: %', demo_admin_id;
END $$;

-- =====================================================
-- VERIFY ALL ACCOUNTS
-- =====================================================

SELECT
  id,
  email,
  full_name,
  role,
  active,
  created_at
FROM public.profiles
WHERE email IN (
  'demo@pontifex.com',
  'admin@pontifex.com',
  'andres.altamirano1280@gmail.com',
  'quantumlearnr@gmail.com'
)
ORDER BY role DESC, email;

-- Expected result: 4 users
-- ✓ andres.altamirano1280@gmail.com (admin/super admin)
-- ✓ admin@pontifex.com (admin) - DEMO ACCOUNT
-- ✓ demo@pontifex.com (operator) - DEMO ACCOUNT
-- ✓ quantumlearnr@gmail.com (operator)

-- =====================================================
-- 🎉 DONE! You can now login with:
-- =====================================================
-- Operator: demo@pontifex.com / Demo1234!
-- Admin: admin@pontifex.com / Admin1234!
