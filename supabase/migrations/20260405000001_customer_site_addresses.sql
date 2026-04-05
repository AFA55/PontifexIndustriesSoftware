CREATE TABLE IF NOT EXISTS customer_site_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  location_name TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_site_addresses_customer ON customer_site_addresses(customer_id);
CREATE INDEX idx_customer_site_addresses_tenant ON customer_site_addresses(tenant_id);

ALTER TABLE customer_site_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON customer_site_addresses
  USING (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id'));
