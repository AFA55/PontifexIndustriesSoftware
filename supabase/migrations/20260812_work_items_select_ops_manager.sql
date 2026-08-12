-- work_items: let the office actually READ the work the crew submitted.
--
-- FOUNDER (Aug 12): "I'm looking at Southern Basements… it says no details were
-- performed even though they did input the details. Same for Mason Builders —
-- it says no detail log, but there IS a log."
--
-- The data was never missing. `app/dashboard/admin/completed-jobs` reads
-- `work_items` from the BROWSER with the public (RLS-bound) client, and the
-- only SELECT grants were:
--
--   "Admins can view all work items"           → is_admin()  = admin | super_admin
--   "Operators can view work items…"           → assigned_to = auth.uid()
--
-- `tenant_isolation` on this table is RESTRICTIVE, so it only narrows what a
-- permissive policy already allowed — it grants nothing. That leaves
-- operations_manager, salesman and shop_manager with no SELECT path at all, and
-- PostgREST returns an empty array rather than an error, so the page rendered
-- "No detailed work log available" and looked like lost data.
--
-- The founder's own day-to-day account is operations_manager. Proven against
-- production by impersonating it: is_admin() = false, work_items visible = 0 of
-- 3, while daily_job_logs (whose policies already list operations_manager)
-- returned its row fine. That asymmetry between the two tables IS the bug.
--
-- Roles here mirror `daily_job_logs_select_admin`, which has carried
-- operations_manager + salesman since April. READ ONLY — the UPDATE policy is
-- deliberately left alone; nothing here grants anyone new write access.
--
-- Uses the SECURITY DEFINER helpers per CLAUDE.md. Never auth.jwt() ->
-- 'user_metadata' (client-writable → self-promotion).

DROP POLICY IF EXISTS "Admins can view all work items" ON public.work_items;

CREATE POLICY "Admins can view all work items"
  ON public.work_items
  FOR SELECT
  USING (
    public.current_user_has_role('admin', 'super_admin', 'operations_manager', 'salesman')
    AND (
      public.current_user_role() = 'super_admin'
      OR tenant_id = public.current_user_tenant_id()
    )
  );
