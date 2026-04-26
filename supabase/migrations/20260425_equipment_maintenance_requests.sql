CREATE TABLE IF NOT EXISTS equipment_maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  operator_id UUID NOT NULL REFERENCES profiles(id),
  equipment_id TEXT NOT NULL,
  equipment_number TEXT,
  photo_url TEXT,
  what_happened TEXT NOT NULL,
  whats_wrong TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_maint_req_tenant ON equipment_maintenance_requests(tenant_id);
CREATE INDEX idx_maint_req_operator ON equipment_maintenance_requests(operator_id);
CREATE INDEX idx_maint_req_status ON equipment_maintenance_requests(tenant_id, status);

ALTER TABLE equipment_maintenance_requests ENABLE ROW LEVEL SECURITY;

-- Operators can insert their own requests
CREATE POLICY "operators_insert_own" ON equipment_maintenance_requests
  FOR INSERT WITH CHECK (operator_id = auth.uid() AND tenant_id = public.current_user_tenant_id());

-- Operators can read their own; admins can read all in tenant
CREATE POLICY "read_own_or_admin" ON equipment_maintenance_requests
  FOR SELECT USING (
    operator_id = auth.uid() OR
    public.current_user_has_role('admin','super_admin','operations_manager','shop_manager')
  );

-- Admins can update status
CREATE POLICY "admin_update" ON equipment_maintenance_requests
  FOR UPDATE USING (
    public.current_user_has_role('admin','super_admin','operations_manager','shop_manager')
  );
