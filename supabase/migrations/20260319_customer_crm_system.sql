-- Customer CRM System Migration
-- Adds missing columns to existing customers table, creates customer_contacts,
-- adds customer_id FK to job_orders, sets up RLS, and backfills from job_orders.

-- Add missing columns to existing customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_type TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS billing_contact_phone TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Customer contacts table (many contacts per customer)
CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  is_primary BOOLEAN DEFAULT false,
  is_billing_contact BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add customer_id to job_orders (nullable for backward compatibility)
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_orders_customer_id ON public.job_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON public.customer_contacts(customer_id);

-- Enable RLS on customer_contacts
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;

-- Drop old single policy on customers to replace with granular ones
DROP POLICY IF EXISTS "admin_all_customers" ON public.customers;

-- RLS Policies for customers using JWT metadata pattern
CREATE POLICY "Admin roles can read customers" ON public.customers
  FOR SELECT USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'super_admin', 'operations_manager', 'salesman')
  );

CREATE POLICY "Admin roles can insert customers" ON public.customers
  FOR INSERT WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'super_admin', 'operations_manager', 'salesman')
  );

CREATE POLICY "Admin roles can update customers" ON public.customers
  FOR UPDATE USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'super_admin', 'operations_manager')
  );

CREATE POLICY "Super admin can delete customers" ON public.customers
  FOR DELETE USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin')
  );

-- RLS Policies for customer_contacts
CREATE POLICY "Admin roles can read contacts" ON public.customer_contacts
  FOR SELECT USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'super_admin', 'operations_manager', 'salesman')
  );

CREATE POLICY "Admin roles can manage contacts" ON public.customer_contacts
  FOR INSERT WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'super_admin', 'operations_manager', 'salesman')
  );

CREATE POLICY "Admin roles can update contacts" ON public.customer_contacts
  FOR UPDATE USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'super_admin', 'operations_manager')
  );

CREATE POLICY "Admin roles can delete contacts" ON public.customer_contacts
  FOR DELETE USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager')
  );

-- Backfill: Create customer records from existing job_orders
INSERT INTO public.customers (name, primary_contact_name, primary_contact_phone, address)
SELECT DISTINCT ON (LOWER(TRIM(customer_name)))
  TRIM(customer_name),
  customer_contact,
  site_contact_phone,
  address
FROM public.job_orders
WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
ORDER BY LOWER(TRIM(customer_name)), created_at DESC
ON CONFLICT DO NOTHING;

-- Backfill: Link existing job_orders to customers
UPDATE public.job_orders jo
SET customer_id = c.id
FROM public.customers c
WHERE LOWER(TRIM(jo.customer_name)) = LOWER(TRIM(c.name))
  AND jo.customer_id IS NULL;
