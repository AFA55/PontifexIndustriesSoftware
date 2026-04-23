-- Change Orders table: tracks extra/out-of-scope work authorized after the initial job scope.
-- Separate from job_scope_items (original scope) so each change order carries its own costing and approval trail.

CREATE TABLE IF NOT EXISTS public.change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  job_order_id uuid NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  co_number text,
  description text NOT NULL,
  work_type text,
  unit text,
  target_quantity numeric,
  cost_amount numeric(12,2) DEFAULT 0,
  price_amount numeric(12,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','invoiced')),
  notes text,
  customer_signature text,
  customer_signed_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_orders_job_order_id ON public.change_orders(job_order_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_tenant_id ON public.change_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_status ON public.change_orders(status);

ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS change_orders_tenant_select ON public.change_orders;
CREATE POLICY change_orders_tenant_select ON public.change_orders
  FOR SELECT
  USING (
    tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS change_orders_tenant_insert ON public.change_orders;
CREATE POLICY change_orders_tenant_insert ON public.change_orders
  FOR INSERT
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_has_role('admin','super_admin','operations_manager','salesman','supervisor')
  );

DROP POLICY IF EXISTS change_orders_tenant_update ON public.change_orders;
CREATE POLICY change_orders_tenant_update ON public.change_orders
  FOR UPDATE
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_has_role('admin','super_admin','operations_manager','salesman','supervisor')
  );

DROP POLICY IF EXISTS change_orders_tenant_delete ON public.change_orders;
CREATE POLICY change_orders_tenant_delete ON public.change_orders
  FOR DELETE
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_has_role('admin','super_admin','operations_manager')
  );

CREATE OR REPLACE FUNCTION public.set_change_order_number() RETURNS trigger AS $$
DECLARE
  next_n integer;
BEGIN
  IF NEW.co_number IS NULL THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(co_number FROM 4) AS integer)), 0) + 1
      INTO next_n
      FROM public.change_orders
      WHERE job_order_id = NEW.job_order_id
        AND co_number ~ '^CO-[0-9]+$';
    NEW.co_number := 'CO-' || LPAD(next_n::text, 3, '0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_change_orders_set_number ON public.change_orders;
CREATE TRIGGER trg_change_orders_set_number
BEFORE INSERT OR UPDATE ON public.change_orders
FOR EACH ROW EXECUTE FUNCTION public.set_change_order_number();

COMMENT ON TABLE public.change_orders IS 'Extra/out-of-scope work added after job scope is set. Separate from job_scope_items so each CO has its own costing + approval.';
