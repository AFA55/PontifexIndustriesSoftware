-- Migration: Fix Profile RLS - Allow users to read their own profile
-- Created: 2025-02-01
-- Description: Adds RLS policy so authenticated users can read their own profile data

-- =====================================================
-- ADD RLS POLICY FOR USERS TO READ THEIR OWN PROFILE
-- =====================================================

-- This policy allows any authenticated user to read their own profile
-- Without this, users can't log in because they can't fetch their profile after auth
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Optional: Allow users to update their own profile (phone, etc.)
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
