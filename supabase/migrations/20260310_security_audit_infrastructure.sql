-- ============================================================
-- Security, Audit & Performance Infrastructure Migration
-- ============================================================
-- Creates: audit_logs, login_attempts, error_logs tables
-- Updates: profiles role constraint for operations_manager
-- Adds: Role sync trigger, RLS policy fixes, performance indexes
-- Optimizes: schedule_board_view with JOIN-based approach
-- ============================================================

-- ============================================================
-- 1. AUDIT_LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_role TEXT NOT NULL,
  action TEXT NOT NULL,               -- 'create', 'update', 'delete', 'approve', 'reject', 'assign', 'login', 'logout'
  resource_type TEXT NOT NULL,        -- 'job_order', 'profile', 'timecard', 'change_request', etc.
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only super_admin and operations_manager can read audit logs
CREATE POLICY "audit_logs_read_policy" ON public.audit_logs
  FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager')
  );

-- Service role inserts (via supabaseAdmin) bypass RLS, but explicit policy for clarity
CREATE POLICY "audit_logs_insert_policy" ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- 2. LOGIN_ATTEMPTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  ip_address INET,
  user_agent TEXT,
  failure_reason TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON public.login_attempts(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at ON public.login_attempts(created_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Only super_admin and operations_manager can read login attempts
CREATE POLICY "login_attempts_read_policy" ON public.login_attempts
  FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager')
  );

CREATE POLICY "login_attempts_insert_policy" ON public.login_attempts
  FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- 3. ERROR_LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,                -- 'GET', 'POST', 'PATCH', 'DELETE'
  status_code INTEGER DEFAULT 500,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_endpoint ON public.error_logs(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs(created_at DESC);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Only super_admin and operations_manager can read error logs
CREATE POLICY "error_logs_read_policy" ON public.error_logs
  FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager')
  );

CREATE POLICY "error_logs_insert_policy" ON public.error_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- 4. UPDATE PROFILES ROLE CONSTRAINT
-- ============================================================
-- Drop old constraint and add new one with operations_manager
DO $$
BEGIN
  -- Try to drop existing constraint(s)
  BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS valid_role;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

ALTER TABLE public.profiles ADD CONSTRAINT valid_role
  CHECK (role IN ('operator', 'apprentice', 'admin', 'super_admin', 'salesman', 'inventory_manager', 'operations_manager'));

-- ============================================================
-- 5. ROLE SYNC TRIGGER (profiles.role → auth.users.raw_user_meta_data)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_role_to_auth_metadata()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS profiles_role_sync ON public.profiles;
CREATE TRIGGER profiles_role_sync
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_role_to_auth_metadata();

-- Backfill: sync all existing profiles.role → auth.users.raw_user_meta_data
UPDATE auth.users u
SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role)
FROM public.profiles p
WHERE u.id = p.id;

-- ============================================================
-- 6. PERFORMANCE INDEXES ON JOB_ORDERS
-- ============================================================
-- Schedule board: date + status (most common query)
CREATE INDEX IF NOT EXISTS idx_job_orders_date_status
  ON public.job_orders(scheduled_date, status)
  WHERE deleted_at IS NULL;

-- Operator lookups
CREATE INDEX IF NOT EXISTS idx_job_orders_assigned_date
  ON public.job_orders(assigned_to, scheduled_date)
  WHERE deleted_at IS NULL;

-- Helper lookups
CREATE INDEX IF NOT EXISTS idx_job_orders_helper_date
  ON public.job_orders(helper_assigned_to, scheduled_date)
  WHERE deleted_at IS NULL;

-- Pending jobs (small subset, queried every page load)
CREATE INDEX IF NOT EXISTS idx_job_orders_pending
  ON public.job_orders(created_at DESC)
  WHERE status = 'pending_approval' AND deleted_at IS NULL;

-- Will-call jobs
CREATE INDEX IF NOT EXISTS idx_job_orders_will_call
  ON public.job_orders(created_at DESC)
  WHERE is_will_call = true AND deleted_at IS NULL;

-- ============================================================
-- 7. OPTIMIZED SCHEDULE_BOARD_VIEW
-- ============================================================
-- Replace correlated subqueries with efficient LEFT JOINs
CREATE OR REPLACE VIEW public.schedule_board_view AS
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
  jo.po_number,
  jo.is_will_call,
  jo.difficulty_rating,
  jo.salesman_name,
  jo.assigned_to,
  jo.helper_assigned_to,
  jo.estimated_cost,
  jo.scheduling_flexibility,
  jo.created_at,
  jo.updated_at,
  -- Operator name
  op.full_name AS operator_name,
  -- Helper name
  hp.full_name AS helper_name,
  -- Pre-aggregated note count (avoids correlated subquery)
  COALESCE(nc.note_count, 0)::integer AS notes_count,
  -- Pre-aggregated change request count (avoids correlated subquery)
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

-- ============================================================
-- 8. RPC FUNCTION FOR DATABASE STATS (used by ops-hub)
-- ============================================================
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (RPC will be called by admins via supabaseAdmin)
GRANT EXECUTE ON FUNCTION public.get_database_stats() TO authenticated;
