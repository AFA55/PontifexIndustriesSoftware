-- Migration: Create Super Admin Account
-- Created: 2025-01-30
-- Description: Creates the initial super admin account that can approve other users
--
-- IMPORTANT: Change the email and password before running this in production!
-- This creates the first admin who can then approve other users.

-- =====================================================
-- CREATE SUPER ADMIN USER
-- =====================================================

-- Step 1: You need to create this user in Supabase Auth Dashboard first
-- Go to: Authentication > Users > Add User
-- Email: admin@pontifex.com (or your company email)
-- Password: Create a strong password
-- Auto Confirm Email: YES

-- Step 2: After creating the user in Auth Dashboard, get their UUID
-- Copy the User ID from the Auth Dashboard

-- Step 3: Run this SQL with the actual UUID you copied
-- Replace 'PASTE-USER-ID-HERE' with the actual UUID from step 2

-- Example of creating profile for super admin:
-- INSERT INTO public.profiles (id, email, full_name, role, phone, active)
-- VALUES (
--   'PASTE-USER-ID-HERE',  -- Replace with actual UUID from Supabase Auth
--   'admin@pontifex.com',
--   'Super Admin',
--   'admin',
--   '',
--   true
-- );

-- =====================================================
-- INSTRUCTIONS
-- =====================================================

-- Follow these steps:

-- 1. Go to Supabase Dashboard > Authentication > Users
-- 2. Click "Add User" button
-- 3. Enter:
--    - Email: admin@pontifex.com (or your email)
--    - Password: (create a strong password)
--    - Auto Confirm Email: ✓ Check this box
-- 4. Click "Create User"
-- 5. Copy the "ID" (UUID) that appears in the user list
-- 6. Come back to SQL Editor
-- 7. Run the INSERT command above, replacing 'PASTE-USER-ID-HERE' with the UUID you copied
-- 8. You can now log in with that email/password and approve other users!

-- =====================================================
-- ALTERNATIVE: If you already created a user
-- =====================================================

-- If you already created admin@pontifex.com in Auth, just find their ID and create the profile:

-- First, list all auth users to find the UUID (run this to see all users):
-- This won't work in SQL editor, you need to check Auth > Users in dashboard

-- Then create the profile with their UUID:
-- INSERT INTO public.profiles (id, email, full_name, role, phone, active)
-- VALUES (
--   'PASTE-THE-UUID-HERE',
--   'admin@pontifex.com',
--   'Super Admin',
--   'admin',
--   '',
--   true
-- ) ON CONFLICT (id) DO UPDATE SET
--   role = 'admin',
--   active = true;
