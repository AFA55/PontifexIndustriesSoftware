-- Migration: Add Apprentice Role Support
-- Created: 2025-01-30
-- Description: Adds 'apprentice' as a valid role in profiles and access_requests tables

-- =====================================================
-- UPDATE PROFILES TABLE
-- =====================================================

-- Drop existing constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new constraint with apprentice role
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'operator', 'apprentice'));

-- =====================================================
-- UPDATE ACCESS_REQUESTS TABLE
-- =====================================================

-- Drop existing constraint
ALTER TABLE public.access_requests DROP CONSTRAINT IF EXISTS access_requests_assigned_role_check;

-- Add new constraint with apprentice role
ALTER TABLE public.access_requests
  ADD CONSTRAINT access_requests_assigned_role_check
  CHECK (assigned_role IN ('admin', 'operator', 'apprentice'));
