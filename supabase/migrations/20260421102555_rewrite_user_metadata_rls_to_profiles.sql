-- ============================================================================
-- Rewrite RLS policies that trust auth.jwt()->'user_metadata' to read role
-- and tenant_id from public.profiles via SECURITY DEFINER helpers instead.
--
-- Context: user_metadata is CLIENT-WRITABLE via supabase.auth.updateUser(),
-- so any operator could self-promote to super_admin. Supabase's linter flags
-- this as rls_references_user_metadata (ERROR). See AGENT_C_REPORT.md P0-1.
--
-- This migration:
--   1. Adds three STABLE SECURITY DEFINER helpers reading from public.profiles
--   2. Drops and recreates all 54 offending policies with equivalent intent,
--      preserving: cmd (ALL/SELECT/INSERT/UPDATE/DELETE), role subset,
--      tenant predicates, USING vs WITH CHECK placement.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper functions (idempotent via CREATE OR REPLACE)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_role(VARIADIC allowed text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = ANY(allowed)
  )
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_tenant_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(text[]) TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- 2. Rewrite policies
-- Pattern: DROP POLICY IF EXISTS <name> ON <table>;
--          CREATE POLICY <name> ON <table> ... using helpers
-- ----------------------------------------------------------------------------

-- billing_milestones.tenant_isolation (ALL)
DROP POLICY IF EXISTS "tenant_isolation" ON public.billing_milestones;
CREATE POLICY "tenant_isolation" ON public.billing_milestones
  FOR ALL
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_has_role('super_admin','admin','operations_manager','salesman')
  );

-- consent_records."Admins read all consent" (SELECT)
DROP POLICY IF EXISTS "Admins read all consent" ON public.consent_records;
CREATE POLICY "Admins read all consent" ON public.consent_records
  FOR SELECT
  USING ( public.current_user_has_role('admin','super_admin','operations_manager') );

-- contact_backups."Admins can manage contact backups" (ALL)
DROP POLICY IF EXISTS "Admins can manage contact backups" ON public.contact_backups;
CREATE POLICY "Admins can manage contact backups" ON public.contact_backups
  FOR ALL
  USING (
    public.current_user_has_role('admin','operations_manager','super_admin')
    AND tenant_id = public.current_user_tenant_id()
  );

-- customer_contacts (4 policies)
DROP POLICY IF EXISTS "Admin roles can delete contacts" ON public.customer_contacts;
CREATE POLICY "Admin roles can delete contacts" ON public.customer_contacts
  FOR DELETE
  USING ( public.current_user_has_role('super_admin','operations_manager') );

DROP POLICY IF EXISTS "Admin roles can manage contacts" ON public.customer_contacts;
CREATE POLICY "Admin roles can manage contacts" ON public.customer_contacts
  FOR INSERT
  WITH CHECK ( public.current_user_has_role('admin','super_admin','operations_manager','salesman') );

DROP POLICY IF EXISTS "Admin roles can read contacts" ON public.customer_contacts;
CREATE POLICY "Admin roles can read contacts" ON public.customer_contacts
  FOR SELECT
  USING ( public.current_user_has_role('admin','super_admin','operations_manager','salesman') );

DROP POLICY IF EXISTS "Admin roles can update contacts" ON public.customer_contacts;
CREATE POLICY "Admin roles can update contacts" ON public.customer_contacts
  FOR UPDATE
  USING ( public.current_user_has_role('admin','super_admin','operations_manager') );

-- customer_site_addresses.tenant_isolation (ALL)
-- Original compared tenant_id (text/uuid?) to user_metadata tenant_id (text).
-- profiles.tenant_id is uuid; cast both sides to text for safety.
DROP POLICY IF EXISTS "tenant_isolation" ON public.customer_site_addresses;
CREATE POLICY "tenant_isolation" ON public.customer_site_addresses
  FOR ALL
  USING ( tenant_id::text = public.current_user_tenant_id()::text );

-- customer_surveys.surveys_admin_read (SELECT)
DROP POLICY IF EXISTS "surveys_admin_read" ON public.customer_surveys;
CREATE POLICY "surveys_admin_read" ON public.customer_surveys
  FOR SELECT
  USING ( public.current_user_has_role('super_admin','operations_manager','admin') );

-- customers (4 policies)
DROP POLICY IF EXISTS "Admin roles can insert customers" ON public.customers;
CREATE POLICY "Admin roles can insert customers" ON public.customers
  FOR INSERT
  WITH CHECK ( public.current_user_has_role('admin','super_admin','operations_manager','salesman') );

DROP POLICY IF EXISTS "Admin roles can read customers" ON public.customers;
CREATE POLICY "Admin roles can read customers" ON public.customers
  FOR SELECT
  USING ( public.current_user_has_role('admin','super_admin','operations_manager','salesman') );

DROP POLICY IF EXISTS "Admin roles can update customers" ON public.customers;
CREATE POLICY "Admin roles can update customers" ON public.customers
  FOR UPDATE
  USING ( public.current_user_has_role('admin','super_admin','operations_manager') );

DROP POLICY IF EXISTS "Super admin can delete customers" ON public.customers;
CREATE POLICY "Super admin can delete customers" ON public.customers
  FOR DELETE
  USING ( public.current_user_role() = 'super_admin' );

-- daily_job_logs (4 policies) -- roles clause 'authenticated'
DROP POLICY IF EXISTS "Admins can manage all daily logs" ON public.daily_job_logs;
CREATE POLICY "Admins can manage all daily logs" ON public.daily_job_logs
  FOR ALL
  TO authenticated
  USING ( public.current_user_has_role('admin','super_admin','operations_manager') );

DROP POLICY IF EXISTS "Operators can view own daily logs" ON public.daily_job_logs;
CREATE POLICY "Operators can view own daily logs" ON public.daily_job_logs
  FOR SELECT
  TO authenticated
  USING (
    operator_id = auth.uid()
    OR public.current_user_has_role('admin','super_admin','operations_manager')
  );

DROP POLICY IF EXISTS "daily_job_logs_select_admin" ON public.daily_job_logs;
CREATE POLICY "daily_job_logs_select_admin" ON public.daily_job_logs
  FOR SELECT
  TO authenticated
  USING ( public.current_user_has_role('admin','super_admin','operations_manager','salesman') );

DROP POLICY IF EXISTS "daily_job_logs_update_admin" ON public.daily_job_logs;
CREATE POLICY "daily_job_logs_update_admin" ON public.daily_job_logs
  FOR UPDATE
  TO authenticated
  USING ( public.current_user_has_role('admin','super_admin','operations_manager') );

-- error_logs "Super admins can read error logs" (SELECT)
DROP POLICY IF EXISTS "Super admins can read error logs" ON public.error_logs;
CREATE POLICY "Super admins can read error logs" ON public.error_logs
  FOR SELECT
  USING ( public.current_user_role() = 'super_admin' );

-- facilities.facilities_admin_all (ALL)
DROP POLICY IF EXISTS "facilities_admin_all" ON public.facilities;
CREATE POLICY "facilities_admin_all" ON public.facilities
  FOR ALL
  USING ( public.current_user_has_role('super_admin','operations_manager','admin','salesman') );

-- form_templates.form_templates_admin_all (ALL)
DROP POLICY IF EXISTS "form_templates_admin_all" ON public.form_templates;
CREATE POLICY "form_templates_admin_all" ON public.form_templates
  FOR ALL
  USING ( public.current_user_has_role('super_admin','operations_manager','admin') );

-- job_completion_requests.tenant_isolation_completion (ALL)
DROP POLICY IF EXISTS "tenant_isolation_completion" ON public.job_completion_requests;
CREATE POLICY "tenant_isolation_completion" ON public.job_completion_requests
  FOR ALL
  USING ( tenant_id::text = public.current_user_tenant_id()::text );

-- job_daily_assignments.schedule_board_access_daily_assignments (ALL)
DROP POLICY IF EXISTS "schedule_board_access_daily_assignments" ON public.job_daily_assignments;
CREATE POLICY "schedule_board_access_daily_assignments" ON public.job_daily_assignments
  FOR ALL
  USING ( public.current_user_has_role('super_admin','admin','operations_manager','salesman','shop_manager') );

-- job_form_assignments.form_assignments_admin_all (ALL)
DROP POLICY IF EXISTS "form_assignments_admin_all" ON public.job_form_assignments;
CREATE POLICY "form_assignments_admin_all" ON public.job_form_assignments
  FOR ALL
  USING ( public.current_user_has_role('super_admin','operations_manager','admin','salesman') );

-- job_orders.operator_can_view_own_jobs (SELECT, authenticated)
DROP POLICY IF EXISTS "operator_can_view_own_jobs" ON public.job_orders;
CREATE POLICY "operator_can_view_own_jobs" ON public.job_orders
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_has_role('super_admin','operations_manager','admin','salesman','shop_manager','inventory_manager')
    OR assigned_to = auth.uid()
    OR helper_assigned_to = auth.uid()
  );

-- job_progress_entries.tenant_isolation_progress (ALL)
DROP POLICY IF EXISTS "tenant_isolation_progress" ON public.job_progress_entries;
CREATE POLICY "tenant_isolation_progress" ON public.job_progress_entries
  FOR ALL
  USING ( tenant_id::text = public.current_user_tenant_id()::text );

-- job_scope_items.tenant_isolation_scope_items (ALL)
DROP POLICY IF EXISTS "tenant_isolation_scope_items" ON public.job_scope_items;
CREATE POLICY "tenant_isolation_scope_items" ON public.job_scope_items
  FOR ALL
  USING ( tenant_id::text = public.current_user_tenant_id()::text );

-- nfc_tags (2 policies)
DROP POLICY IF EXISTS "nfc_tags_admin_all" ON public.nfc_tags;
CREATE POLICY "nfc_tags_admin_all" ON public.nfc_tags
  FOR ALL
  USING ( public.current_user_has_role('super_admin','operations_manager','admin') );

DROP POLICY IF EXISTS "nfc_tags_operators_read" ON public.nfc_tags;
CREATE POLICY "nfc_tags_operators_read" ON public.nfc_tags
  FOR SELECT
  USING (
    is_active = true
    AND public.current_user_has_role('operator','apprentice','shop_manager')
  );

-- notification_recipients.tenant_isolation (ALL)
DROP POLICY IF EXISTS "tenant_isolation" ON public.notification_recipients;
CREATE POLICY "tenant_isolation" ON public.notification_recipients
  FOR ALL
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_has_role('super_admin','admin','operations_manager','salesman')
  );

-- notification_settings (2 policies)
DROP POLICY IF EXISTS "Admin can update notification_settings" ON public.notification_settings;
CREATE POLICY "Admin can update notification_settings" ON public.notification_settings
  FOR ALL
  USING ( public.current_user_has_role('admin','super_admin','operations_manager') );

DROP POLICY IF EXISTS "Admin can view notification_settings" ON public.notification_settings;
CREATE POLICY "Admin can view notification_settings" ON public.notification_settings
  FOR SELECT
  USING ( public.current_user_has_role('admin','super_admin','operations_manager') );

-- operator_facility_badges.badges_admin_all (ALL)
DROP POLICY IF EXISTS "badges_admin_all" ON public.operator_facility_badges;
CREATE POLICY "badges_admin_all" ON public.operator_facility_badges
  FOR ALL
  USING ( public.current_user_has_role('super_admin','operations_manager','admin') );

-- operator_notes."Admin can manage operator notes" (ALL)
DROP POLICY IF EXISTS "Admin can manage operator notes" ON public.operator_notes;
CREATE POLICY "Admin can manage operator notes" ON public.operator_notes
  FOR ALL
  USING ( public.current_user_has_role('admin','super_admin','operations_manager') );

-- operator_skill_categories (2 policies)
DROP POLICY IF EXISTS "skill_categories_read" ON public.operator_skill_categories;
CREATE POLICY "skill_categories_read" ON public.operator_skill_categories
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id::text = public.current_user_tenant_id()::text
  );

DROP POLICY IF EXISTS "skill_categories_write" ON public.operator_skill_categories;
CREATE POLICY "skill_categories_write" ON public.operator_skill_categories
  FOR ALL
  USING (
    tenant_id::text = public.current_user_tenant_id()::text
    AND public.current_user_has_role('super_admin','admin','operations_manager')
  );

-- operator_skill_ratings (2 policies)
DROP POLICY IF EXISTS "skill_ratings_read" ON public.operator_skill_ratings;
CREATE POLICY "skill_ratings_read" ON public.operator_skill_ratings
  FOR SELECT
  USING ( tenant_id::text = public.current_user_tenant_id()::text );

DROP POLICY IF EXISTS "skill_ratings_write" ON public.operator_skill_ratings;
CREATE POLICY "skill_ratings_write" ON public.operator_skill_ratings
  FOR ALL
  USING (
    tenant_id::text = public.current_user_tenant_id()::text
    AND public.current_user_has_role('super_admin','admin','operations_manager')
  );

-- operator_time_off.time_off_admin_all (ALL)
DROP POLICY IF EXISTS "time_off_admin_all" ON public.operator_time_off;
CREATE POLICY "time_off_admin_all" ON public.operator_time_off
  FOR ALL
  USING ( public.current_user_has_role('super_admin','operations_manager','admin') );

-- operator_trade_skills."Admins manage trade skills" (ALL)
DROP POLICY IF EXISTS "Admins manage trade skills" ON public.operator_trade_skills;
CREATE POLICY "Admins manage trade skills" ON public.operator_trade_skills
  FOR ALL
  USING ( public.current_user_has_role('admin','super_admin','operations_manager') );

-- role_permissions.tenant_isolation_role_permissions (ALL)
DROP POLICY IF EXISTS "tenant_isolation_role_permissions" ON public.role_permissions;
CREATE POLICY "tenant_isolation_role_permissions" ON public.role_permissions
  FOR ALL
  USING ( tenant_id::text = public.current_user_tenant_id()::text );

-- schedule_form_submissions.form_submissions_admin_all (ALL)
DROP POLICY IF EXISTS "form_submissions_admin_all" ON public.schedule_form_submissions;
CREATE POLICY "form_submissions_admin_all" ON public.schedule_form_submissions
  FOR ALL
  USING ( public.current_user_has_role('super_admin','operations_manager','admin','salesman') );

-- schedule_settings (3 policies)
DROP POLICY IF EXISTS "schedule_settings_insert" ON public.schedule_settings;
CREATE POLICY "schedule_settings_insert" ON public.schedule_settings
  FOR INSERT
  WITH CHECK ( public.current_user_has_role('super_admin','operations_manager','admin') );

DROP POLICY IF EXISTS "schedule_settings_select" ON public.schedule_settings;
CREATE POLICY "schedule_settings_select" ON public.schedule_settings
  FOR SELECT
  USING ( public.current_user_has_role('super_admin','operations_manager','admin','salesman','shop_manager','inventory_manager') );

DROP POLICY IF EXISTS "schedule_settings_update" ON public.schedule_settings;
CREATE POLICY "schedule_settings_update" ON public.schedule_settings
  FOR UPDATE
  USING ( public.current_user_has_role('super_admin','operations_manager','admin') );

-- shop_daily_pins."Admins can manage daily PINs" (ALL)
DROP POLICY IF EXISTS "Admins can manage daily PINs" ON public.shop_daily_pins;
CREATE POLICY "Admins can manage daily PINs" ON public.shop_daily_pins
  FOR ALL
  USING ( public.current_user_has_role('admin','super_admin','operations_manager','shop_manager') );

-- skill_categories."Admins manage skill categories" (ALL)
DROP POLICY IF EXISTS "Admins manage skill categories" ON public.skill_categories;
CREATE POLICY "Admins manage skill categories" ON public.skill_categories
  FOR ALL
  USING (
    public.current_user_has_role('admin','super_admin','operations_manager')
    AND tenant_id = public.current_user_tenant_id()
  );

-- tenant_branding."Super admins can manage branding" (ALL)
DROP POLICY IF EXISTS "Super admins can manage branding" ON public.tenant_branding;
CREATE POLICY "Super admins can manage branding" ON public.tenant_branding
  FOR ALL
  USING ( public.current_user_role() = 'super_admin' );

-- timecard_entries.tc_entries_admin_all (ALL)
DROP POLICY IF EXISTS "tc_entries_admin_all" ON public.timecard_entries;
CREATE POLICY "tc_entries_admin_all" ON public.timecard_entries
  FOR ALL
  USING ( public.current_user_has_role('super_admin','operations_manager','admin') );

-- timecard_gps_logs.tc_gps_admin_all (ALL)
DROP POLICY IF EXISTS "tc_gps_admin_all" ON public.timecard_gps_logs;
CREATE POLICY "tc_gps_admin_all" ON public.timecard_gps_logs
  FOR ALL
  USING ( public.current_user_has_role('super_admin','operations_manager','admin') );

-- timecard_settings_v2.tc_settings_v2_admin_write (ALL)
DROP POLICY IF EXISTS "tc_settings_v2_admin_write" ON public.timecard_settings_v2;
CREATE POLICY "tc_settings_v2_admin_write" ON public.timecard_settings_v2
  FOR ALL
  USING ( public.current_user_has_role('super_admin','operations_manager','admin') );

-- timecard_weeks.tc_weeks_admin_all (ALL)
DROP POLICY IF EXISTS "tc_weeks_admin_all" ON public.timecard_weeks;
CREATE POLICY "tc_weeks_admin_all" ON public.timecard_weeks
  FOR ALL
  USING ( public.current_user_has_role('super_admin','operations_manager','admin') );

-- timecards.timecards_admin_all (ALL)
DROP POLICY IF EXISTS "timecards_admin_all" ON public.timecards;
CREATE POLICY "timecards_admin_all" ON public.timecards
  FOR ALL
  USING ( public.current_user_has_role('super_admin','operations_manager','admin') );

-- user_feature_flags.super_admin_manage_flags (ALL) -- had USING + WITH CHECK
DROP POLICY IF EXISTS "super_admin_manage_flags" ON public.user_feature_flags;
CREATE POLICY "super_admin_manage_flags" ON public.user_feature_flags
  FOR ALL
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_has_role('super_admin','operations_manager')
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_has_role('super_admin','operations_manager')
  );

-- user_invitations.super_admin_manage_invitations (ALL, authenticated)
DROP POLICY IF EXISTS "super_admin_manage_invitations" ON public.user_invitations;
CREATE POLICY "super_admin_manage_invitations" ON public.user_invitations
  FOR ALL
  TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_has_role('super_admin','operations_manager')
  );

-- ============================================================================
-- End of policy rewrites. After apply, verify:
--   SELECT COUNT(*) FROM pg_policies
--   WHERE schemaname='public'
--     AND (qual LIKE '%user_metadata%' OR with_check LIKE '%user_metadata%');
-- Expected: 0
-- ============================================================================
