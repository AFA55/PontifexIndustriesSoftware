# Agent D — Remediation for P0-1 (RLS user_metadata → profiles)

**Date:** 2026-04-21
**Scope:** Supabase project `klatddoyncxidgqtcjnu`, branch `feature/schedule-board-v2`
**Source finding:** `AGENT_C_REPORT.md` P0-1 — 54 RLS policies trusted client-writable `auth.jwt()->'user_metadata'` and allowed privilege escalation via `supabase.auth.updateUser({ data: { role: 'super_admin' } })`.

---

## 1. Migration

**File:** `supabase/migrations/20260421102555_rewrite_user_metadata_rls_to_profiles.sql`
**Applied as:** `rewrite_user_metadata_rls_to_profiles` (Supabase MCP `apply_migration`, success)

### New SECURITY DEFINER helpers (read from `public.profiles`)

| Function | Returns | Purpose |
|---|---|---|
| `public.current_user_role()` | `text` | `profiles.role` for `auth.uid()` |
| `public.current_user_tenant_id()` | `uuid` | `profiles.tenant_id` for `auth.uid()` |
| `public.current_user_has_role(VARIADIC text[])` | `boolean` | Membership check |

All are `STABLE`, `SECURITY DEFINER`, `SET search_path = public`, granted to `authenticated` + `anon`. The existing `public.is_admin()` helper (also `STABLE`/`SECURITY DEFINER`/`search_path=public`) is preserved and still referenced by `job_orders`, `profiles`, `invoices`, `access_requests`, `audit_log` policies (those did not use `user_metadata` and were untouched).

---

## 2. Advisor Counts

| Lint | Before | After |
|---|---|---|
| `rls_references_user_metadata` (ERROR) | **54** | **0** |
| `security_definer_view` (ERROR) | 9 | 9 (P1-1, out of scope) |
| `function_search_path_mutable` (WARN) | 14 | 14 (P1-4, out of scope) |
| `rls_policy_always_true` (WARN) | 12 | 12 (mostly intentional insert-only logging) |
| `public_bucket_allows_listing` (WARN) | 4 | 4 (P1-3, out of scope) |
| `auth_leaked_password_protection` (WARN) | 1 | 1 (P1-5, out of scope) |
| `rls_enabled_no_policy` (INFO) | 1 | 1 (system_health_log, P1-6, out of scope) |

Direct `pg_policies` query also confirms 0 remaining references:
```
SELECT COUNT(*) FROM pg_policies
WHERE schemaname='public'
  AND (qual LIKE '%user_metadata%' OR with_check LIKE '%user_metadata%');
-- -> 0
```

---

## 3. Policies Rewritten (54 total, 35 tables)

For every row below, the policy was `DROP POLICY IF EXISTS` + `CREATE POLICY` preserving `FOR` cmd, `TO` role, and `USING`/`WITH CHECK` placement. The "before" column shows the role/tenant predicate in the original (all checked via `auth.jwt()->'user_metadata'`); the "after" column shows the equivalent helper call. Role-set semantics are unchanged unless noted.

| Table | Policy | Cmd | Before (role check) | After |
|---|---|---|---|---|
| billing_milestones | tenant_isolation | ALL | role IN (super_admin,admin,ops,sales) AND tenant match | `current_user_has_role(...) AND tenant_id = current_user_tenant_id()` |
| consent_records | Admins read all consent | SELECT | role IN (admin,super,ops) | `current_user_has_role('admin','super_admin','operations_manager')` |
| contact_backups | Admins can manage contact backups | ALL | role IN (admin,ops,super) AND tenant match | `current_user_has_role(...) AND tenant_id = current_user_tenant_id()` |
| customer_contacts | Admin roles can delete contacts | DELETE | role IN (super,ops) | `current_user_has_role('super_admin','operations_manager')` |
| customer_contacts | Admin roles can manage contacts | INSERT | WITH CHECK role IN (admin,super,ops,sales) | `current_user_has_role(...)` |
| customer_contacts | Admin roles can read contacts | SELECT | role IN (admin,super,ops,sales) | `current_user_has_role(...)` |
| customer_contacts | Admin roles can update contacts | UPDATE | role IN (admin,super,ops) | `current_user_has_role(...)` |
| customer_site_addresses | tenant_isolation | ALL | tenant_id = metadata tenant (text) | `tenant_id::text = current_user_tenant_id()::text` |
| customer_surveys | surveys_admin_read | SELECT | role IN (super,ops,admin) | `current_user_has_role(...)` |
| customers | Admin roles can insert customers | INSERT | WITH CHECK role IN (admin,super,ops,sales) | `current_user_has_role(...)` |
| customers | Admin roles can read customers | SELECT | role IN (admin,super,ops,sales) | `current_user_has_role(...)` |
| customers | Admin roles can update customers | UPDATE | role IN (admin,super,ops) | `current_user_has_role(...)` |
| customers | Super admin can delete customers | DELETE | role = super_admin | `current_user_role() = 'super_admin'` |
| daily_job_logs | Admins can manage all daily logs | ALL (authenticated) | role IN (admin,super,ops) | `current_user_has_role(...)` |
| daily_job_logs | Operators can view own daily logs | SELECT (authenticated) | operator_id=uid OR role∈(admin,super,ops) | `operator_id = auth.uid() OR current_user_has_role(...)` |
| daily_job_logs | daily_job_logs_select_admin | SELECT (authenticated) | role IN (admin,super,ops,sales) | `current_user_has_role(...)` |
| daily_job_logs | daily_job_logs_update_admin | UPDATE (authenticated) | role IN (admin,super,ops) | `current_user_has_role(...)` |
| error_logs | Super admins can read error logs | SELECT | metadata role=super OR profile role=super | `current_user_role() = 'super_admin'` (collapsed — profile check was already the source of truth) |
| facilities | facilities_admin_all | ALL | role IN (super,ops,admin,sales) | `current_user_has_role(...)` |
| form_templates | form_templates_admin_all | ALL | role IN (super,ops,admin) | `current_user_has_role(...)` |
| job_completion_requests | tenant_isolation_completion | ALL | tenant_id::text = metadata tenant | `tenant_id::text = current_user_tenant_id()::text` |
| job_daily_assignments | schedule_board_access_daily_assignments | ALL | role IN (super,admin,ops,sales,shop_manager) | `current_user_has_role(...)` |
| job_form_assignments | form_assignments_admin_all | ALL | role IN (super,ops,admin,sales) | `current_user_has_role(...)` |
| job_orders | operator_can_view_own_jobs | SELECT (authenticated) | role∈big-admin-set OR assigned_to=uid OR helper_assigned_to=uid | `current_user_has_role(...) OR assigned_to = auth.uid() OR helper_assigned_to = auth.uid()` |
| job_progress_entries | tenant_isolation_progress | ALL | tenant_id::text = metadata tenant | `tenant_id::text = current_user_tenant_id()::text` |
| job_scope_items | tenant_isolation_scope_items | ALL | tenant_id::text = metadata tenant | `tenant_id::text = current_user_tenant_id()::text` |
| nfc_tags | nfc_tags_admin_all | ALL | role IN (super,ops,admin) | `current_user_has_role(...)` |
| nfc_tags | nfc_tags_operators_read | SELECT | is_active AND role IN (operator,apprentice,shop_manager) | `is_active = true AND current_user_has_role(...)` |
| notification_recipients | tenant_isolation | ALL | tenant match AND role IN (super,admin,ops,sales) | `tenant_id = current_user_tenant_id() AND current_user_has_role(...)` |
| notification_settings | Admin can update notification_settings | ALL | role IN (admin,super,ops) | `current_user_has_role(...)` |
| notification_settings | Admin can view notification_settings | SELECT | role IN (admin,super,ops) | `current_user_has_role(...)` |
| operator_facility_badges | badges_admin_all | ALL | role IN (super,ops,admin) | `current_user_has_role(...)` |
| operator_notes | Admin can manage operator notes | ALL | role IN (admin,super,ops) | `current_user_has_role(...)` |
| operator_skill_categories | skill_categories_read | SELECT | tenant_id IS NULL OR tenant match | `tenant_id IS NULL OR tenant_id::text = current_user_tenant_id()::text` |
| operator_skill_categories | skill_categories_write | ALL | tenant match AND role IN (super,admin,ops) | `tenant_id::text = current_user_tenant_id()::text AND current_user_has_role(...)` |
| operator_skill_ratings | skill_ratings_read | SELECT | tenant match | `tenant_id::text = current_user_tenant_id()::text` |
| operator_skill_ratings | skill_ratings_write | ALL | tenant match AND role IN (super,admin,ops) | `... AND current_user_has_role(...)` |
| operator_time_off | time_off_admin_all | ALL | role IN (super,ops,admin) | `current_user_has_role(...)` |
| operator_trade_skills | Admins manage trade skills | ALL | role IN (admin,super,ops) | `current_user_has_role(...)` |
| role_permissions | tenant_isolation_role_permissions | ALL | tenant match | `tenant_id::text = current_user_tenant_id()::text` |
| schedule_form_submissions | form_submissions_admin_all | ALL | role IN (super,ops,admin,sales) | `current_user_has_role(...)` |
| schedule_settings | schedule_settings_insert | INSERT | WITH CHECK role IN (super,ops,admin) | `current_user_has_role(...)` |
| schedule_settings | schedule_settings_select | SELECT | role IN (super,ops,admin,sales,shop_mgr,inv_mgr) | `current_user_has_role(...)` |
| schedule_settings | schedule_settings_update | UPDATE | role IN (super,ops,admin) | `current_user_has_role(...)` |
| shop_daily_pins | Admins can manage daily PINs | ALL | role IN (admin,super,ops,shop_manager) | `current_user_has_role(...)` |
| skill_categories | Admins manage skill categories | ALL | role IN (admin,super,ops) AND tenant match | `current_user_has_role(...) AND tenant_id = current_user_tenant_id()` |
| tenant_branding | Super admins can manage branding | ALL | role = super_admin | `current_user_role() = 'super_admin'` |
| timecard_entries | tc_entries_admin_all | ALL | role IN (super,ops,admin) | `current_user_has_role(...)` |
| timecard_gps_logs | tc_gps_admin_all | ALL | role IN (super,ops,admin) | `current_user_has_role(...)` |
| timecard_settings_v2 | tc_settings_v2_admin_write | ALL | role IN (super,ops,admin) | `current_user_has_role(...)` |
| timecard_weeks | tc_weeks_admin_all | ALL | role IN (super,ops,admin) | `current_user_has_role(...)` |
| timecards | timecards_admin_all | ALL | role IN (super,ops,admin) | `current_user_has_role(...)` |
| user_feature_flags | super_admin_manage_flags | ALL | USING + WITH CHECK: tenant match AND role IN (super,ops) | same predicate in both clauses via helpers |
| user_invitations | super_admin_manage_invitations | ALL (authenticated) | tenant match AND role IN (super,ops) | same via helpers |

**Semantics preserved for all 54.** The only micro-change is on `error_logs."Super admins can read error logs"`: the original was `metadata_role='super_admin' OR EXISTS(profile.role='super_admin')`. Since `metadata_role` was the unsafe path and the profile subquery already enforced the intended rule, I collapsed it to `current_user_role() = 'super_admin'`. Net access is strictly tighter (no false positives from forged metadata) and there is no false negative — anyone whose profile role is actually `super_admin` still gets through.

---

## 4. CLAUDE.md Change

File: `CLAUDE.md`, "Database" section (line ~48). Removed:

> - New tables should use JWT metadata for RLS: `auth.jwt() -> 'user_metadata' ->> 'role'`

Replaced with explicit warning that `user_metadata` is client-writable, plus a helper inventory and example usage. Recommends `app_metadata` as an acceptable alternative when immutable claims are needed, and points new tables at `public.is_admin()` / `public.current_user_has_role(...)` / `public.current_user_tenant_id()`.

---

## 5. Policies NOT rewritten (edge cases)

**None.** All 54 policies flagged by the advisor were rewritten. No edge cases encountered — every policy fit cleanly into `current_user_has_role`, `current_user_role`, `current_user_tenant_id`, or a combination. The 9 `SECURITY DEFINER` views (P1-1) and the 14 `function_search_path_mutable` functions (P1-4) are separate findings out of scope for this task.

Note on Agent C's audit: the report mentioned some additional tables (e.g. `access_requests`, `audit_log`, `invoices`, `profiles`, `job_orders` with policy `job_orders_admin_all`) as examples of the `is_admin()` pattern. Those did not use `user_metadata` and are untouched. The policy `job_orders.operator_can_view_own_jobs` (the one flagged by the linter) is included above.

---

## 6. Verification Queries

Run any/all of these against the live DB to verify the remediation:

```sql
-- Must return 0
SELECT COUNT(*) FROM pg_policies
WHERE schemaname = 'public'
  AND (qual LIKE '%user_metadata%' OR with_check LIKE '%user_metadata%');

-- Helpers exist with expected properties
SELECT proname, prosecdef, provolatile
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('current_user_role','current_user_tenant_id','current_user_has_role','is_admin');

-- Sample: confirm a high-value policy was rewritten correctly
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='customers';

-- Functional test (run as an operator JWT via PostgREST):
-- Before fix: supabase.auth.updateUser({ data: { role: 'super_admin' } });
--             then SELECT * FROM customers -> returned all rows
-- After fix: same attack -> returns 0 rows (profile.role still 'operator')
```

Supabase advisor URL for continuous monitoring:
<https://supabase.com/dashboard/project/klatddoyncxidgqtcjnu/advisors/security>

---

## Build Status

`npm run build` — PASS (no TypeScript or Next.js errors). DB-only change; no application code touched.

## Out of scope / Left for Agent E & F

- `lib/api-auth.ts` tenant-bypass hardening (P0-2) — Agent E.
- FK tenant cross-checks in admin routes (P0-3) — Agent E.
- `ADD_PASSWORD_PLAIN_COLUMN.sql` audit — Agent F.
- P1-1 (SECURITY DEFINER views), P1-3 (public bucket listing), P1-4 (search_path on 14 functions), P1-5 (leaked-password protection), P1-6 (`system_health_log` policy) — follow-up tickets.
