-- ============================================================
-- Error Logs table — stores client-side and server-side errors
-- ============================================================
CREATE TABLE IF NOT EXISTS error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'client_error',
  error_message text NOT NULL,
  stack_trace text,
  component_stack text,
  url text,
  user_agent text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(type);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert error logs"
  ON error_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Super admins can read error logs"
  ON error_logs FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- ============================================================
-- Tenants table — SaaS multi-tenant foundation
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  domain text UNIQUE,
  logo_url text,
  primary_color text DEFAULT '#7c3aed',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial', 'cancelled')),
  plan text NOT NULL DEFAULT 'professional' CHECK (plan IN ('starter', 'professional', 'enterprise')),
  max_users integer DEFAULT 50,
  max_jobs_per_month integer DEFAULT 500,
  features jsonb DEFAULT '{"billing": true, "analytics": true, "inventory": true, "nfc": true, "customer_crm": true, "ai_scheduling": true}'::jsonb,
  owner_id uuid REFERENCES auth.users(id),
  billing_email text,
  billing_address jsonb,
  trial_ends_at timestamptz,
  subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(owner_id);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage tenants"
  ON tenants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Tenant owners can view own tenant"
  ON tenants FOR SELECT
  USING (owner_id = auth.uid());

-- ============================================================
-- Tenant Users junction — maps users to tenants
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  invited_by uuid REFERENCES auth.users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage tenant users"
  ON tenant_users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can see own tenant memberships"
  ON tenant_users FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- System backups log — tracks backup operations
-- ============================================================
CREATE TABLE IF NOT EXISTS backup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type text NOT NULL DEFAULT 'daily' CHECK (backup_type IN ('daily', 'manual', 'pre_deploy', 'weekly')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  size_bytes bigint,
  duration_ms integer,
  storage_path text,
  notes text,
  triggered_by uuid REFERENCES auth.users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backup_logs_created ON backup_logs(created_at DESC);

ALTER TABLE backup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage backup logs"
  ON backup_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Updated_at trigger for tenants
CREATE OR REPLACE FUNCTION update_tenants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_tenants_updated_at();
