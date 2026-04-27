-- operator_badges: tracks facility-specific badges (GE, BMW, M3, etc.) for operators
CREATE TABLE IF NOT EXISTS operator_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES auth.users(id),
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

ALTER TABLE operator_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage badges" ON operator_badges
  FOR ALL USING (public.current_user_has_role('admin','super_admin','operations_manager'));

CREATE POLICY "Operators view own badges" ON operator_badges
  FOR SELECT USING (operator_id = auth.uid());
