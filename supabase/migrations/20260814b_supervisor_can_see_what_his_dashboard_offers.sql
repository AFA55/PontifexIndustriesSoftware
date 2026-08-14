-- ============================================================================
-- DAVID CAN SEE HIS DASHBOARD BUT NOT THE DATA BEHIND IT.
--
-- lib/rbac.ts gives the `supervisor` role real cards — schedule board, active
-- jobs, completed jobs, timecards, customer profiles, equipment, fleet, and
-- "Site Visit Reports" with SUBMIT rights. The API layer agrees: the
-- supervisor-visits route lists 'supervisor' in both READ_ROLES and
-- CREATE_ROLES. Row-level security never got the message. Ninety-five policies
-- name operations_manager and omit supervisor, so anything the browser reads
-- DIRECTLY from Supabase — rather than through a service-role API route — came
-- back empty for him. He opens Reports, sees nothing, and reasonably concludes
-- the app is broken.
--
-- Third instance of this platform's recurring defect: the page admits the role
-- and the data layer refuses it.
--
-- Scope is READ ONLY and deliberately narrow — exactly the tables his own
-- preset already promises him. He does NOT get hiring, invitations, feature
-- flags, billing milestones, contracts, notification or timecard settings, or
-- PTO. A supervisor is a set of eyes in the field, not an administrator.
--
-- Added as NEW permissive policies rather than edits to existing ones: RLS ORs
-- permissive policies together, so nothing already working can regress.
--
-- ── WHAT THE AUDIT CAUGHT, and what is deliberately NOT here ────────────────
-- A first cut of this migration also created an INSERT policy on
-- supervisor_visits gated only on role + tenant. It was BOTH redundant and
-- dangerous: `supervisor_visits_supervisor_own` (FOR ALL, supervisor_id =
-- auth.uid()) already let a supervisor file their own visits, and because
-- permissive policies OR together, the loose one did not inherit the narrow
-- one's author check. One supervisor could file a Site Visit Report — carrying
-- performance, safety and cleanliness ratings against an operator — under the
-- OTHER supervisor's name, and the own-row policy would then stop the real
-- author from ever editing or deleting it. Write-once, unretractable, forged.
-- It granted no capability the role lacked. It is not in this file.
--
-- Also dropped as dead weight: a supervisor read on `equipment`, which
-- `equipment_tenant_read_v2` already grants to every authenticated user.
--
-- ── KNOWN, ACCEPTED, WITH A TRIPWIRE ────────────────────────────────────────
-- `job_orders` carries total_cost / gross_profit / total_revenue and
-- `timecards` carries labor_cost. Every one of those columns is ZERO in
-- production today because job costing is not switched on, and `job_orders`
-- was already tenant-wide readable by salesman, shop_manager AND
-- inventory_manager before this migration — supervisor is the fourth role
-- through a door that was already open. THE DAY COST TRACKING GOES LIVE, these
-- reads must move behind a view or the server API. Column-level REVOKE cannot
-- solve it: every logged-in user shares the single `authenticated` Postgres
-- role, so revoking a column takes it from admins too. Logged in BACKLOG.md.
-- ============================================================================

DO $$
DECLARE
  t text;
  read_tables text[] := ARRAY[
    'job_orders', 'daily_job_logs', 'work_items', 'timecards',
    'job_daily_assignments', 'job_crew', 'helper_work_logs',
    'customers', 'customer_contacts', 'job_notes',
    'vehicles', 'supervisor_visits', 'job_helper_reviews'
  ];
BEGIN
  FOREACH t IN ARRAY read_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'supervisor_read_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.current_user_role() = ''supervisor''
                AND tenant_id = public.current_user_tenant_id())',
      'supervisor_read_' || t, t
    );
  END LOOP;
END $$;

-- Explicitly NOT recreated — see the note above.
DROP POLICY IF EXISTS supervisor_insert_supervisor_visits ON public.supervisor_visits;
DROP POLICY IF EXISTS supervisor_read_equipment ON public.equipment;
