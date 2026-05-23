-- SMS consent / opt-in records.
-- Required for Twilio toll-free (and A2P 10DLC) verification: proof that each
-- recipient agreed to receive text messages, with the exact disclosure text,
-- timestamp, and source. Also the operational record we check before texting
-- a contact.

CREATE TABLE IF NOT EXISTS sms_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  phone text NOT NULL,                 -- E.164, e.g. +18645551234
  contact_name text,
  company text,
  consented boolean NOT NULL DEFAULT false,
  consent_method text NOT NULL DEFAULT 'web_form'
    CHECK (consent_method IN ('web_form', 'verbal', 'written', 'imported')),
  consent_text text,                   -- exact wording the person agreed to
  source_ip text,
  user_agent text,
  job_order_id uuid REFERENCES job_orders(id) ON DELETE SET NULL,
  captured_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,              -- set when they reply STOP / opt out
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_consent_phone_idx ON sms_consent(phone);
CREATE INDEX IF NOT EXISTS sms_consent_tenant_idx ON sms_consent(tenant_id);

ALTER TABLE sms_consent ENABLE ROW LEVEL SECURITY;

-- Server-only writes (public form posts via supabaseAdmin, which bypasses RLS).
-- Management can read consent records within their tenant.
DO $$ BEGIN
  CREATE POLICY "Management reads tenant consent" ON sms_consent
    FOR SELECT USING (
      public.current_user_has_role('admin','super_admin','operations_manager','supervisor','salesman')
      AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
