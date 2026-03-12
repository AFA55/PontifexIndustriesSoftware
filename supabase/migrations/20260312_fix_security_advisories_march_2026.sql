-- ============================================================
-- Security Fixes: March 2026
-- Fixes: RLS user_metadata → profiles lookup, function search paths,
--        security definer views
-- ============================================================

-- ============================================================
-- 1. FIX RLS POLICIES: Replace user_metadata with profiles lookup
--    user_metadata is editable by end users — security vulnerability!
--    Use a SECURITY DEFINER helper function instead.
-- ============================================================

-- Create a secure helper function that checks role from profiles table
-- This avoids the recursion issue by using auth.uid() directly
CREATE OR REPLACE FUNCTION public.is_admin_or_ops_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'operations_manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Fix audit_logs read policy
DROP POLICY IF EXISTS "audit_logs_read_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_read_policy" ON public.audit_logs
  FOR SELECT
  USING (public.is_admin_or_ops_manager());

-- Fix login_attempts read policy
DROP POLICY IF EXISTS "login_attempts_read_policy" ON public.login_attempts;
CREATE POLICY "login_attempts_read_policy" ON public.login_attempts
  FOR SELECT
  USING (public.is_admin_or_ops_manager());

-- Fix error_logs read policy
DROP POLICY IF EXISTS "error_logs_read_policy" ON public.error_logs;
CREATE POLICY "error_logs_read_policy" ON public.error_logs
  FOR SELECT
  USING (public.is_admin_or_ops_manager());

-- ============================================================
-- 2. FIX FUNCTION SEARCH PATHS
-- ============================================================

-- Fix sync_role_to_auth_metadata
CREATE OR REPLACE FUNCTION public.sync_role_to_auth_metadata()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Fix get_database_stats
CREATE OR REPLACE FUNCTION public.get_database_stats()
RETURNS TABLE(table_name TEXT, row_count BIGINT, size_bytes BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.relname::TEXT AS table_name,
    s.n_live_tup AS row_count,
    pg_total_relation_size(s.relid) AS size_bytes
  FROM pg_stat_user_tables s
  WHERE s.schemaname = 'public'
  ORDER BY s.n_live_tup DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. FIX SECURITY DEFINER VIEWS → SECURITY INVOKER
-- ============================================================

-- Fix schedule_board_view: recreate with security_invoker
DROP VIEW IF EXISTS public.schedule_board_view;
CREATE VIEW public.schedule_board_view
WITH (security_invoker = true)
AS
SELECT
  jo.id,
  jo.job_number,
  jo.title,
  jo.customer_name,
  jo.customer_contact,
  jo.job_type,
  jo.location,
  jo.address,
  jo.description,
  jo.status,
  jo.priority,
  jo.scheduled_date,
  jo.end_date,
  jo.arrival_time,
  jo.shop_arrival_time,
  jo.estimated_hours,
  jo.equipment_needed,
  jo.special_equipment,
  jo.mandatory_equipment,
  jo.po_number,
  jo.is_will_call,
  jo.difficulty_rating,
  jo.salesman_name,
  jo.assigned_to,
  jo.helper_assigned_to,
  jo.estimated_cost,
  jo.scheduling_flexibility,
  jo.dispatched_at,
  jo.created_at,
  jo.updated_at,
  op.full_name AS operator_name,
  hp.full_name AS helper_name,
  COALESCE(nc.note_count, 0)::integer AS notes_count,
  COALESCE(cr.change_request_count, 0)::integer AS pending_change_requests_count
FROM public.job_orders jo
LEFT JOIN public.profiles op ON jo.assigned_to = op.id
LEFT JOIN public.profiles hp ON jo.helper_assigned_to = hp.id
LEFT JOIN (
  SELECT job_order_id, COUNT(*) AS note_count
  FROM public.job_notes
  GROUP BY job_order_id
) nc ON nc.job_order_id = jo.id
LEFT JOIN (
  SELECT job_order_id, COUNT(*) AS change_request_count
  FROM public.schedule_change_requests
  WHERE status = 'pending'
  GROUP BY job_order_id
) cr ON cr.job_order_id = jo.id
WHERE jo.deleted_at IS NULL;

-- Fix timecards_with_users view: recreate with security_invoker
DROP VIEW IF EXISTS public.timecards_with_users;
CREATE VIEW public.timecards_with_users
WITH (security_invoker = true)
AS
SELECT
  t.*,
  p.full_name,
  p.email,
  p.role
FROM public.timecards t
LEFT JOIN public.profiles p ON p.id = t.user_id;
