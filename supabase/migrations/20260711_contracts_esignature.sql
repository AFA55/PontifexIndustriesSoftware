-- Contracts + change orders with e-signature (founder ask Jul 11).
-- Lifecycle: draft -> sent -> viewed -> signed (or void). Signed PDF stored in
-- the 'contracts' storage bucket; public signing via single-use CSPRNG token.
-- Applied to prod via Supabase MCP on 2026-07-11.
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id uuid REFERENCES job_orders(id) ON DELETE SET NULL,
  parent_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  doc_type text NOT NULL DEFAULT 'contract' CHECK (doc_type IN ('contract', 'change_order')),
  title text NOT NULL,
  work_description text,
  terms text,
  amount numeric,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'signed', 'void')),
  token varchar(64) UNIQUE,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  signer_name text,
  signature_data text,
  pdf_url text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contracts_tenant_idx ON public.contracts(tenant_id, status);
CREATE INDEX IF NOT EXISTS contracts_job_idx ON public.contracts(job_id);
CREATE INDEX IF NOT EXISTS contracts_token_idx ON public.contracts(token);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "contracts_tenant_office_read" ON public.contracts
    FOR SELECT USING (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role('admin','super_admin','operations_manager','salesman')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON public.contracts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_function THEN NULL; END $$;
