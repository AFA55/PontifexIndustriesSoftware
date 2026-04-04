-- Migration: contact_backups
-- Creates a dedicated table to log contact/customer CSV backup exports.

CREATE TABLE IF NOT EXISTS contact_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  backup_type TEXT NOT NULL DEFAULT 'manual',
  record_count INTEGER DEFAULT 0,
  file_size_bytes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed',
  notes TEXT
);

ALTER TABLE contact_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contact backups"
ON contact_backups FOR ALL
USING (
  auth.jwt() -> 'user_metadata' ->> 'role' IN ('admin', 'operations_manager', 'super_admin')
  AND tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
);

CREATE INDEX IF NOT EXISTS idx_contact_backups_tenant ON contact_backups(tenant_id, created_at DESC);
