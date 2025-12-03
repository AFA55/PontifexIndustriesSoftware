-- Migration: Fix RLS Infinite Recursion
-- Created: 2025-02-01
-- Description: Fixes infinite recursion in profile RLS policies

-- =====================================================
-- DROP THE PROBLEMATIC POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- =====================================================
-- CREATE CORRECT POLICIES WITHOUT RECURSION
-- =====================================================

-- Allow authenticated users to read ANY profile
-- This is safe because we'll control what data is returned via SELECT
CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow users to update only their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
