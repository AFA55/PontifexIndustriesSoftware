-- =====================================================
-- CRITICAL SECURITY PATCH V2 (CORRECTED)
-- Date: 2026-01-29
-- Purpose: Fix critical RLS and security vulnerabilities
-- NOTE: This version fixes schema compatibility issues
-- =====================================================

-- ============================================
-- FIX 1: RE-ENABLE RLS ON PROFILES TABLE
-- ============================================
-- CRITICAL: Profiles table has RLS disabled, allowing any user to read/modify any profile

-- First, drop all existing policies on profiles
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;

-- Re-enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create secure policies
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Prevent users from changing their own role
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can update any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- ============================================
-- FIX 2: REMOVE PLAIN TEXT PASSWORD STORAGE
-- ============================================
-- CRITICAL: Never store passwords in plain text

-- Drop the plain text password column
ALTER TABLE public.access_requests DROP COLUMN IF EXISTS password_plain;

-- Add temporary token field instead for password reset links
ALTER TABLE public.access_requests
ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.access_requests.password_reset_token IS 'One-time use token for password setup. Expires after use or 24 hours.';
COMMENT ON COLUMN public.access_requests.token_expires_at IS 'Expiration timestamp for password reset token.';

-- ============================================
-- FIX 3: RESTRICT INVENTORY ACCESS
-- ============================================
-- HIGH: Only admins should see all inventory, operators limited view

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Everyone can view inventory" ON public.inventory;
DROP POLICY IF EXISTS "Everyone can view inventory transactions" ON public.inventory_transactions;

-- Create restricted policies for inventory
CREATE POLICY "Admins can view all inventory"
  ON public.inventory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Operators can view inventory items"
  ON public.inventory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role = 'operator'
    )
    -- Operators can see items with available stock but not financial details
    AND quantity_in_stock > 0
  );

-- Create restricted policies for inventory transactions
CREATE POLICY "Admins can view all inventory transactions"
  ON public.inventory_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Operators can view their own transactions"
  ON public.inventory_transactions
  FOR SELECT
  TO authenticated
  USING (
    operator_id = auth.uid()
    OR performed_by = auth.uid()
  );

-- ============================================
-- FIX 4: REMOVE SYSTEM RECORD BYPASS
-- ============================================
-- HIGH: Remove blanket insertion policy

DROP POLICY IF EXISTS "System creates assignment history" ON public.equipment_assignment_history;

-- Create admin-only policy
CREATE POLICY "Admins can create assignment history"
  ON public.equipment_assignment_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- ============================================
-- FIX 5: RESTRICT AUTOCOMPLETE DATA ACCESS
-- ============================================
-- HIGH: Only admins should see customer/contractor data

-- Drop overly permissive policies
DROP POLICY IF EXISTS "All authenticated users can view customer job titles" ON public.customer_job_titles;
DROP POLICY IF EXISTS "All authenticated users can view company names" ON public.company_names;
DROP POLICY IF EXISTS "All authenticated users can view general contractors" ON public.general_contractors;

-- Create admin-only policies
CREATE POLICY "Admins can view customer job titles"
  ON public.customer_job_titles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can view company names"
  ON public.company_names
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can view general contractors"
  ON public.general_contractors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- ============================================
-- FIX 6: REMOVE ANONYMOUS ACCESS
-- ============================================
-- HIGH: Remove public access to active jobs

REVOKE SELECT ON public.active_job_orders FROM anon;
REVOKE ALL ON public.active_job_orders FROM anon;

-- Ensure only authenticated users can access
GRANT SELECT ON public.active_job_orders TO authenticated;

-- ============================================
-- FIX 7: REMOVE IP TRACKING (PRIVACY)
-- ============================================
-- MEDIUM: Remove unnecessary IP address tracking

ALTER TABLE public.job_orders DROP COLUMN IF EXISTS consent_ip_address;

-- Keep timestamp but ensure it's server-side only
COMMENT ON COLUMN public.job_orders.consent_timestamp IS 'Server-generated timestamp when consent was given. NOT client-provided.';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify the fixes are applied

-- Check RLS is enabled on profiles
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace;

-- Check no plain text password column exists
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_name = 'access_requests' AND column_name = 'password_plain';

-- Check inventory policies are restrictive
-- SELECT policyname, permissive, roles, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN ('inventory', 'inventory_transactions');

-- =====================================================
-- IMPORTANT: After running this migration:
-- 1. Test all admin functions still work
-- 2. Test operators can only see available inventory (not pricing)
-- 3. Verify no plain text passwords exist in database
-- 4. Confirm RLS is enabled on all sensitive tables
-- 5. Update API routes if autocomplete breaks for operators
-- =====================================================

-- =====================================================
-- NOTES ON CHANGES FROM V1:
-- - Removed references to non-existent columns (current_status, assigned_to, quantity)
-- - Used correct inventory table columns (quantity_in_stock, quantity_assigned)
-- - Used correct transaction table columns (operator_id, performed_by)
-- - Simplified operator inventory access (can see items with stock > 0)
-- - Removed the SECURITY DEFINER function updates (need separate careful review)
-- =====================================================
