-- Migration: customer_comments
-- Purpose: data model for the customer <-> management 2-way comment channel on the customer portal.
-- Additive + idempotent. Safe to re-run.
--
-- Auth model:
--   * Customers NEVER use RLS. The public portal endpoint writes via supabaseAdmin / service_role,
--     which bypasses RLS entirely. Customer rows are inserted as author_kind = 'customer'.
--   * The RLS policies below are for AUTHENTICATED STAFF ONLY (admins/ops/sales/shop reading & replying).
--
-- Verified against live DB (2026-06-28):
--   tenants(id), job_orders(id), customer_portal_tokens(id), auth.users(id) all exist as uuid PKs.
--   portal_token_id FK was ADDED (customer_portal_tokens.id PK confirmed present).
--   Helpers public.current_user_has_role(VARIADIC text[]) + public.current_user_tenant_id() confirmed SECURITY DEFINER.

CREATE TABLE IF NOT EXISTS public.customer_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_order_id    uuid NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  portal_token_id uuid REFERENCES public.customer_portal_tokens(id) ON DELETE SET NULL,
  author_kind     text NOT NULL CHECK (author_kind IN ('customer','staff')),
  author_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- staff replies only
  author_name     text NOT NULL,
  body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_ip      inet,                          -- server-captured for abuse forensics; never returned to clients
  is_hidden       boolean DEFAULT false,         -- soft moderation
  created_at      timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS customer_comments_job_order_created_idx
  ON public.customer_comments (job_order_id, created_at);
CREATE INDEX IF NOT EXISTS customer_comments_tenant_id_idx
  ON public.customer_comments (tenant_id);

-- RLS (staff-only; customers go through service_role which bypasses RLS)
ALTER TABLE public.customer_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant-scoped staff can read all comments in their tenant.
DO $$ BEGIN
  CREATE POLICY "customer_comments_staff_select" ON public.customer_comments
    FOR SELECT
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager','salesman','shop_manager')
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- INSERT: staff replies only (author_kind = 'staff'), within their tenant.
DO $$ BEGIN
  CREATE POLICY "customer_comments_staff_insert" ON public.customer_comments
    FOR INSERT
    WITH CHECK (
      author_kind = 'staff'
      AND public.current_user_has_role('admin','super_admin','operations_manager','salesman')
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- UPDATE: moderation (hide/unhide) by management, within their tenant.
DO $$ BEGIN
  CREATE POLICY "customer_comments_staff_update" ON public.customer_comments
    FOR UPDATE
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND tenant_id = public.current_user_tenant_id()
    )
    WITH CHECK (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
