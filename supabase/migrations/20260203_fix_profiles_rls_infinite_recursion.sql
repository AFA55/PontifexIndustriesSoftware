-- Fix Infinite Recursion in Profiles RLS Policies
-- This migration resolves the infinite recursion error that occurs when RLS policies
-- reference the profiles table while checking permissions on the profiles table itself

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Create new policies without recursion
-- These policies use auth.uid() directly instead of referencing the profiles table

-- Policy 1: Users can view their own profile
CREATE POLICY "Users can view own profile"
ON profiles
FOR SELECT
USING (auth.uid() = id);

-- Policy 2: Users can update their own profile
CREATE POLICY "Users can update own profile"
ON profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy 3: Users can insert their own profile (for new user signup)
CREATE POLICY "Users can insert own profile"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Policy 4: Admins can view all profiles
-- Note: We check the role directly from auth.jwt() to avoid recursion
CREATE POLICY "Admins can view all profiles"
ON profiles
FOR SELECT
USING (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Policy 5: Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
ON profiles
FOR UPDATE
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

-- Policy 6: Admins can insert profiles
CREATE POLICY "Admins can insert profiles"
ON profiles
FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
