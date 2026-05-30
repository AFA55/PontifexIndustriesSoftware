-- Multi-tenant isolation hardening (applied to prod 2026-05-30).
-- Several RLS policies gated on role only (or qual=true) with no tenant predicate, so a future
-- 2nd tenant's users would read tenant #1's financials/payroll/PII via the anon client.
-- Verified safe with the single current tenant (PATRIOT): an RLS simulation as a Patriot admin
-- returned all rows after the change. super_admin retains cross-tenant access.

-- One-time data backfill: ensure no NULL tenant_id rows (a tenant predicate would hide them).
-- Single tenant today = PATRIOT (ee3d8081-cec2-47f3-ac23-bdc0bb2d142d).
UPDATE public.work_items wi SET tenant_id = jo.tenant_id
  FROM public.job_orders jo WHERE wi.job_order_id = jo.id AND wi.tenant_id IS NULL;
UPDATE public.work_items SET tenant_id = 'ee3d8081-cec2-47f3-ac23-bdc0bb2d142d' WHERE tenant_id IS NULL;
UPDATE public.customer_contacts cc SET tenant_id = c.tenant_id
  FROM public.customers c WHERE cc.customer_id = c.id AND cc.tenant_id IS NULL;
UPDATE public.customer_contacts SET tenant_id = 'ee3d8081-cec2-47f3-ac23-bdc0bb2d142d' WHERE tenant_id IS NULL;

-- profiles: was qual=true (any authed user could read all tenants incl hourly_rate)
ALTER POLICY "profiles_select_all_authenticated" ON public.profiles
  USING ( id = auth.uid() OR current_user_role() = 'super_admin' OR tenant_id = current_user_tenant_id() );

ALTER POLICY "timecards_admin_all" ON public.timecards
  USING ( current_user_has_role(VARIADIC ARRAY['super_admin','operations_manager','admin'])
          AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()) );

ALTER POLICY "admin_all_invoices" ON public.invoices
  USING ( is_admin() AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()) );
ALTER POLICY "admin_all_payments" ON public.payments
  USING ( is_admin() AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()) );

ALTER POLICY "Admins can view all work items" ON public.work_items
  USING ( is_admin() AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()) );
ALTER POLICY "Admins can update all work items" ON public.work_items
  USING ( is_admin() AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()) );

ALTER POLICY "Admin roles can read customers" ON public.customers
  USING ( current_user_has_role(VARIADIC ARRAY['admin','super_admin','operations_manager','salesman'])
          AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()) );
ALTER POLICY "Admin roles can read contacts" ON public.customer_contacts
  USING ( current_user_has_role(VARIADIC ARRAY['admin','super_admin','operations_manager','salesman'])
          AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()) );

ALTER POLICY "daily_job_logs_select_admin" ON public.daily_job_logs
  USING ( current_user_has_role(VARIADIC ARRAY['admin','super_admin','operations_manager','salesman'])
          AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()) );
ALTER POLICY "Admins can manage all daily logs" ON public.daily_job_logs
  USING ( current_user_has_role(VARIADIC ARRAY['admin','super_admin','operations_manager'])
          AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()) );
ALTER POLICY "daily_job_logs_update_admin" ON public.daily_job_logs
  USING ( current_user_has_role(VARIADIC ARRAY['admin','super_admin','operations_manager'])
          AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()) );
ALTER POLICY "Operators can view own daily logs" ON public.daily_job_logs
  USING ( operator_id = auth.uid()
          OR (current_user_has_role(VARIADIC ARRAY['admin','super_admin','operations_manager'])
              AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id())) );

ALTER POLICY "job_orders_select_own_or_admin" ON public.job_orders
  USING ( assigned_to = auth.uid() OR created_by = auth.uid()
          OR (is_admin() AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id())) );
ALTER POLICY "operator_can_view_own_jobs" ON public.job_orders
  USING ( (current_user_has_role(VARIADIC ARRAY['super_admin','operations_manager','admin','salesman','shop_manager','inventory_manager'])
           AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()))
          OR assigned_to = auth.uid() OR helper_assigned_to = auth.uid() );
ALTER POLICY "job_orders_update_own_or_admin" ON public.job_orders
  USING ( assigned_to = auth.uid() OR created_by = auth.uid()
          OR (is_admin() AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id())) );
ALTER POLICY "job_orders_delete_admin" ON public.job_orders
  USING ( is_admin() AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()) );

-- equipment: drop loose qual=true / is_admin policies; tenant-scoped *_v2 policies already cover read+write
DROP POLICY IF EXISTS "Everyone can view equipment" ON public.equipment;
DROP POLICY IF EXISTS "Admins can manage equipment" ON public.equipment;

ALTER POLICY "facilities_read_all" ON public.facilities
  USING ( current_user_role()='super_admin' OR tenant_id = current_user_tenant_id() );
ALTER POLICY "facilities_admin_all" ON public.facilities
  USING ( current_user_has_role(VARIADIC ARRAY['super_admin','operations_manager','admin','salesman'])
          AND (current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()) );
ALTER POLICY "form_templates_read_all" ON public.form_templates
  USING ( current_user_role()='super_admin' OR tenant_id = current_user_tenant_id() );
ALTER POLICY "Allow authenticated users to view checkout sessions" ON public.equipment_checkout_sessions
  USING ( current_user_role()='super_admin' OR tenant_id = current_user_tenant_id() );
