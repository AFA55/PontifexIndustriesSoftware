-- FINAL COMPREHENSIVE FIX: Remove all RLS recursion issues
-- This migration completely rebuilds RLS policies for profiles and standby_logs
-- Created: 2026-02-03
-- Priority: CRITICAL - Run this migration immediately

-- ============================================
-- PART 1: Fix Profiles Table RLS Policies
-- ============================================

-- Drop ALL existing profiles policies (including any duplicates)
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname FROM pg_policies WHERE tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', policy_record.policyname);
  END LOOP;
END $$;

-- Create clean profiles policies using auth.users instead of profiles table
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Admins can view all profiles (using auth.users metadata, NOT profiles table)
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
ON profiles FOR UPDATE
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Admins can insert profiles
CREATE POLICY "Admins can insert profiles"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 2: Fix Standby Logs Table RLS Policies
-- ============================================

-- Drop ALL existing standby_logs policies (including any duplicates)
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname FROM pg_policies WHERE tablename = 'standby_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON standby_logs', policy_record.policyname);
  END LOOP;
END $$;

-- Create clean standby_logs policies WITHOUT referencing profiles table
CREATE POLICY "Operators can view own standby logs"
ON standby_logs FOR SELECT
TO authenticated
USING (auth.uid() = operator_id);

CREATE POLICY "Operators can create standby logs"
ON standby_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = operator_id);

CREATE POLICY "Operators can update own standby logs"
ON standby_logs FOR UPDATE
TO authenticated
USING (auth.uid() = operator_id)
WITH CHECK (auth.uid() = operator_id);

-- Admins can view all standby logs (using auth.users metadata, NOT profiles table)
CREATE POLICY "Admins can view all standby logs"
ON standby_logs FOR SELECT
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Admins can manage all standby logs (INSERT, UPDATE, DELETE)
CREATE POLICY "Admins can manage all standby logs"
ON standby_logs FOR ALL
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Ensure RLS is enabled
ALTER TABLE standby_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- VERIFICATION
-- ============================================

-- Show all profiles policies (for verification)
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'profiles';
  RAISE NOTICE 'Total profiles policies: %', policy_count;
END $$;

-- Show all standby_logs policies (for verification)
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'standby_logs';
  RAISE NOTICE 'Total standby_logs policies: %', policy_count;
END $$;
