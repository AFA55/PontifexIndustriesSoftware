-- operator_badges: tracks facility-specific badges (GE, BMW, M3, etc.) for operators
CREATE TABLE IF NOT EXISTS operator_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  badge_type text NOT NULL, -- 'GE', 'BMW', 'M3', 'OSHA_10', 'OSHA_30', etc.
  badge_number text,
  issued_date date,
  expiry_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operator_badges_operator_id_idx ON operator_badges(operator_id);
CREATE INDEX IF NOT EXISTS operator_badges_tenant_id_idx ON operator_badges(tenant_id);
CREATE INDEX IF NOT EXISTS operator_badges_expiry_idx ON operator_badges(expiry_date);

-- keep updated_at fresh
DROP TRIGGER IF EXISTS set_operator_badges_updated_at ON operator_badges;
CREATE TRIGGER set_operator_badges_updated_at
  BEFORE UPDATE ON operator_badges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE operator_badges ENABLE ROW LEVEL SECURITY;

-- Tenant-scoped RLS: admins manage badges only within their own tenant;
-- super_admin spans tenants. (Idempotent: drop-then-create so re-runs are no-ops.)
DROP POLICY IF EXISTS "Admins manage badges" ON operator_badges;
CREATE POLICY "Admins manage badges" ON operator_badges
  FOR ALL
  USING (
    public.current_user_role() = 'super_admin'
    OR (
      public.current_user_has_role('admin','operations_manager')
      AND tenant_id = public.current_user_tenant_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (
      public.current_user_has_role('admin','operations_manager')
      AND tenant_id = public.current_user_tenant_id()
    )
  );

DROP POLICY IF EXISTS "Operators view own badges" ON operator_badges;
CREATE POLICY "Operators view own badges" ON operator_badges
  FOR SELECT USING (operator_id = auth.uid());
