-- ════════════════════════════════════════════════════════════════════
-- Migration: 20260521_rls_enable_and_stale_timecard_fix
-- Purpose: Fix 4 critical DB issues found during security audit:
--   1. Close stale open timecard (operator blocked from clocking in)
--   2. Enable RLS on operator_pto_balance (was fully open)
--   3. Enable RLS on time_off_requests (was fully open)
--   4. Add policies to system_health_log (had RLS on, zero policies = all writes blocked)
-- ════════════════════════════════════════════════════════════════════

-- 1. CLOSE STALE OPEN TIMECARD
UPDATE timecards
SET
  clock_out_time = NOW(),
  total_hours    = ROUND(EXTRACT(EPOCH FROM (NOW() - clock_in_time)) / 3600.0, 2),
  auto_closed    = true,
  notes          = COALESCE(notes || ' | ', '') ||
                   'Auto-closed by DB audit (2026-05-21): timecard left open since 2026-05-19'
WHERE id = '1df262dd-b937-4e2d-8881-bcd3ce69e77d'
  AND clock_out_time IS NULL;

-- 2. operator_pto_balance — backfill tenant_id + enable RLS
UPDATE operator_pto_balance b
SET tenant_id = p.tenant_id
FROM profiles p
WHERE p.id = b.operator_id
  AND b.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pto_balance_tenant   ON operator_pto_balance (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pto_balance_operator ON operator_pto_balance (operator_id);

ALTER TABLE operator_pto_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operators view own PTO balance"   ON operator_pto_balance;
DROP POLICY IF EXISTS "Admins view tenant PTO balances"  ON operator_pto_balance;
DROP POLICY IF EXISTS "Admins manage PTO balances"       ON operator_pto_balance;

CREATE POLICY "Operators view own PTO balance"
  ON operator_pto_balance FOR SELECT
  USING (operator_id = auth.uid());

CREATE POLICY "Admins view tenant PTO balances"
  ON operator_pto_balance FOR SELECT
  USING (
    public.current_user_has_role('admin', 'super_admin', 'operations_manager')
    AND tenant_id = public.current_user_tenant_id()
  );

CREATE POLICY "Admins manage PTO balances"
  ON operator_pto_balance FOR ALL
  USING (
    public.current_user_has_role('admin', 'super_admin', 'operations_manager')
    AND tenant_id = public.current_user_tenant_id()
  )
  WITH CHECK (
    public.current_user_has_role('admin', 'super_admin', 'operations_manager')
    AND tenant_id = public.current_user_tenant_id()
  );

-- 3. time_off_requests — backfill tenant_id + enable RLS
UPDATE time_off_requests r
SET tenant_id = p.tenant_id
FROM profiles p
WHERE p.id = r.operator_id
  AND r.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_off_requests_tenant   ON time_off_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_time_off_requests_operator ON time_off_requests (operator_id);

ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operators view own time-off requests"    ON time_off_requests;
DROP POLICY IF EXISTS "Operators insert own time-off requests"  ON time_off_requests;
DROP POLICY IF EXISTS "Operators update own pending requests"   ON time_off_requests;
DROP POLICY IF EXISTS "Admins manage time-off requests"         ON time_off_requests;

CREATE POLICY "Operators view own time-off requests"
  ON time_off_requests FOR SELECT
  USING (operator_id = auth.uid());

CREATE POLICY "Operators insert own time-off requests"
  ON time_off_requests FOR INSERT
  WITH CHECK (
    operator_id = auth.uid()
    AND tenant_id = public.current_user_tenant_id()
  );

CREATE POLICY "Operators update own pending requests"
  ON time_off_requests FOR UPDATE
  USING (operator_id = auth.uid() AND status = 'pending')
  WITH CHECK (operator_id = auth.uid());

CREATE POLICY "Admins manage time-off requests"
  ON time_off_requests FOR ALL
  USING (
    public.current_user_has_role('admin', 'super_admin', 'operations_manager')
    AND tenant_id = public.current_user_tenant_id()
  )
  WITH CHECK (
    public.current_user_has_role('admin', 'super_admin', 'operations_manager')
    AND tenant_id = public.current_user_tenant_id()
  );

-- 4. system_health_log — RLS on, no policies → all inserts blocked silently
DROP POLICY IF EXISTS "Service role can insert health logs" ON system_health_log;
DROP POLICY IF EXISTS "Admins read health logs"            ON system_health_log;

CREATE POLICY "Service role can insert health logs"
  ON system_health_log FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins read health logs"
  ON system_health_log FOR SELECT
  USING (
    public.current_user_has_role('admin', 'super_admin', 'operations_manager')
  );
