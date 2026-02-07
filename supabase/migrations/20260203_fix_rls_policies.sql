-- Fix RLS policies for standby_logs and profiles tables
-- Created: 2026-02-03

-- ============================================
-- FIX STANDBY_LOGS RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own standby logs" ON public.standby_logs;
DROP POLICY IF EXISTS "Users can insert their own standby logs" ON public.standby_logs;
DROP POLICY IF EXISTS "Users can update their own standby logs" ON public.standby_logs;
DROP POLICY IF EXISTS "Operators can view standby logs" ON public.standby_logs;
DROP POLICY IF EXISTS "Operators can create standby logs" ON public.standby_logs;
DROP POLICY IF EXISTS "Operators can update standby logs" ON public.standby_logs;

-- Create new policies that allow operators to access their own standby logs
CREATE POLICY "Operators can view their own standby logs"
ON public.standby_logs
FOR SELECT
USING (
  auth.uid() = operator_id
);

CREATE POLICY "Operators can create their own standby logs"
ON public.standby_logs
FOR INSERT
WITH CHECK (
  auth.uid() = operator_id
);

CREATE POLICY "Operators can update their own standby logs"
ON public.standby_logs
FOR UPDATE
USING (
  auth.uid() = operator_id
)
WITH CHECK (
  auth.uid() = operator_id
);

-- Allow admins to view all standby logs
CREATE POLICY "Admins can view all standby logs"
ON public.standby_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ============================================
-- FIX PROFILES RLS POLICIES
-- ============================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id
);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (
  auth.uid() = id
)
WITH CHECK (
  auth.uid() = id
);

-- Allow authenticated users to view basic profile info of other users
-- This is needed for the job assignment feature to show operator names
CREATE POLICY "Authenticated users can view basic profile info"
ON public.profiles
FOR SELECT
USING (
  auth.role() = 'authenticated'
);

-- Allow admins to view and update all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ============================================
-- VERIFY RLS IS ENABLED
-- ============================================

-- Ensure RLS is enabled on both tables
ALTER TABLE public.standby_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Add helpful comments
COMMENT ON POLICY "Operators can view their own standby logs" ON public.standby_logs
IS 'Allows operators to view standby logs where they are the operator';

COMMENT ON POLICY "Authenticated users can view basic profile info" ON public.profiles
IS 'Allows all authenticated users to view profile information (needed for job assignments)';
