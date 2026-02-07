-- =====================================================
-- CRITICAL SECURITY PATCH
-- Date: 2026-01-29
-- Purpose: Fix critical RLS and security vulnerabilities
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
-- HIGH: Only admins should see all inventory, operators only their assignments

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Everyone can view inventory" ON public.inventory;
DROP POLICY IF EXISTS "Everyone can view inventory transactions" ON public.inventory_transactions;

-- Create restricted policies
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

CREATE POLICY "Operators can view assigned inventory"
  ON public.inventory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role = 'operator'
    )
    AND (
      -- Can only see items assigned to them or in available status
      current_status = 'available'
      OR assigned_to = auth.uid()
    )
  );

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
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role = 'operator'
      AND inventory_transactions.user_id = auth.uid()
    )
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
-- FIX 7: CONVERT SECURITY DEFINER TO INVOKER
-- ============================================
-- HIGH: Functions should respect RLS policies

-- Fix checkout_equipment function
CREATE OR REPLACE FUNCTION checkout_equipment(
  p_item_id UUID,
  p_user_id UUID,
  p_quantity INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_current_quantity INTEGER;
  v_item_name TEXT;
  v_category TEXT;
  v_transaction_id UUID;
BEGIN
  -- Get current quantity and item details
  SELECT quantity, item_name, category INTO v_current_quantity, v_item_name, v_category
  FROM inventory
  WHERE id = p_item_id;

  IF v_current_quantity IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Item not found');
  END IF;

  IF v_current_quantity < p_quantity THEN
    RETURN json_build_object('success', false, 'message', 'Insufficient quantity available');
  END IF;

  -- Create transaction record
  INSERT INTO inventory_transactions (
    item_id, transaction_type, quantity, user_id, notes
  ) VALUES (
    p_item_id, 'checkout', p_quantity, p_user_id, p_notes
  ) RETURNING id INTO v_transaction_id;

  -- Update inventory quantity
  UPDATE inventory
  SET quantity = quantity - p_quantity,
      last_updated = NOW()
  WHERE id = p_item_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Successfully checked out ' || p_quantity || ' ' || v_item_name,
    'transaction_id', v_transaction_id
  );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;  -- Changed from SECURITY DEFINER

-- Fix assign_equipment_from_inventory function
CREATE OR REPLACE FUNCTION assign_equipment_from_inventory(
  p_equipment_type TEXT,
  p_operator_id UUID,
  p_job_id UUID,
  p_quantity INTEGER DEFAULT 1
)
RETURNS UUID AS $$
DECLARE
  v_item_id UUID;
  v_available_qty INTEGER;
BEGIN
  -- Find matching inventory item with sufficient quantity
  SELECT id, quantity INTO v_item_id, v_available_qty
  FROM inventory
  WHERE category = p_equipment_type
    AND quantity >= p_quantity
    AND current_status = 'available'
  ORDER BY quantity DESC
  LIMIT 1;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'No available % in inventory (need % units)', p_equipment_type, p_quantity;
  END IF;

  -- Create checkout transaction
  INSERT INTO inventory_transactions (
    item_id,
    transaction_type,
    quantity,
    user_id,
    notes
  ) VALUES (
    v_item_id,
    'checkout',
    p_quantity,
    p_operator_id,
    'Auto-assigned for job ' || p_job_id::TEXT
  );

  -- Update inventory
  UPDATE inventory
  SET
    quantity = quantity - p_quantity,
    assigned_to = p_operator_id,
    current_status = CASE
      WHEN quantity - p_quantity = 0 THEN 'checked_out'
      ELSE 'available'
    END,
    last_updated = NOW()
  WHERE id = v_item_id;

  RETURN v_item_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;  -- Changed from SECURITY DEFINER

-- ============================================
-- FIX 8: REMOVE IP TRACKING (PRIVACY)
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
-- 2. Test operators can only see their assigned inventory
-- 3. Verify no plain text passwords exist in database
-- 4. Confirm RLS is enabled on all sensitive tables
-- 5. Update any API routes that depended on SECURITY DEFINER
-- =====================================================
