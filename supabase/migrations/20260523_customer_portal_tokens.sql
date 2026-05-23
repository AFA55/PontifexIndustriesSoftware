-- customer_portal_tokens: magic-link tokens for the public customer portal
CREATE TABLE IF NOT EXISTS customer_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  -- optional: link to a specific job that needs signing right now
  job_order_id uuid REFERENCES job_orders(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_by uuid REFERENCES auth.users(id),
  accessed_at timestamptz,
  access_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_portal_tokens_tenant_idx ON customer_portal_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS customer_portal_tokens_token_idx ON customer_portal_tokens(token);
CREATE INDEX IF NOT EXISTS customer_portal_tokens_email_idx ON customer_portal_tokens(customer_email);

ALTER TABLE customer_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Only admins can manage portal tokens; the page uses supabaseAdmin (bypasses RLS)
DO $$ BEGIN
  CREATE POLICY "Admins manage portal tokens" ON customer_portal_tokens
    FOR ALL USING (public.current_user_has_role('admin','super_admin','operations_manager','salesman'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
