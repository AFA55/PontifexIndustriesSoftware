# Agent C — Security & Tenant-Isolation Audit

**Date:** 2026-04-21
**Scope:** 108 public tables, 217 API route files, Supabase project `klatddoyncxidgqtcjnu`, branch `feature/schedule-board-v2`.
**Method:** `pg_policies` introspection, Supabase advisors (95 security + 882 performance lints), static scan of all `app/api/**/route.ts` for tenant filtering, role guards, and unauth surface.

---

## Executive Summary

**Ship readiness: NOT READY. Two P0 blockers must be fixed before production.**

1. **[P0] JWT `user_metadata` used in 54 RLS policies.** `user_metadata` is writable by end users via the Supabase Auth API (`updateUser`), which means any authenticated operator can elevate themselves to `super_admin` and bypass every one of those policies. Supabase's own linter flags this with `level=ERROR`. CLAUDE.md currently documents this as the preferred pattern — that guidance is wrong and should be reversed. All 54 policies must be migrated to read role from `profiles` (or `app_metadata`, which is server-only).

2. **[P0] Tenant-isolation fallback is insecure in most admin `[id]` routes.** Pattern: `if (tenantId) query = query.eq('tenant_id', tenantId)`. When an admin's profile has `tenant_id = NULL` (empty string after the `|| ''` fallback in `lib/api-auth.ts:76`), the filter is skipped and the admin can read/update/delete rows in every tenant. Super admins intentionally have NULL tenants and will hit this path. Combined with the invoice POST bug (below) this is a full cross-tenant read/write breach.

Additional non-blocking issues: 9 SECURITY DEFINER views, 4 public storage buckets with list permission, 14 functions with mutable search_path, leaked-password protection disabled in Auth.

---

## P0 Findings (must fix before production merge)

### P0-1. RLS policies reference `auth.jwt() -> 'user_metadata' ->> 'role'`

Supabase lint `rls_references_user_metadata` (ERROR, 54 occurrences). `user_metadata` is set by the client and fully user-controllable via `supabase.auth.updateUser({ data: { role: 'super_admin' } })`. Every policy that trusts it is a privilege-escalation vector.

Affected tables include the highest-value ones: `customers`, `customer_contacts`, `timecards`, `timecard_entries`, `timecard_weeks`, `timecard_gps_logs`, `timecard_settings_v2`, `facilities`, `daily_job_logs`, `job_orders` (policy `operator_can_view_own_jobs`), `job_daily_assignments`, `billing_milestones`, `notification_recipients`, `customer_site_addresses`, `customer_surveys`, `nfc_tags`, `form_templates`, `schedule_settings`, `schedule_form_submissions`, `operator_time_off`, `operator_notes`, `role_permissions`, `user_feature_flags`, `user_invitations`, `contact_backups`, `shop_daily_pins`, `skill_categories`, `operator_skill_categories`, `operator_skill_ratings`, `operator_trade_skills`, `job_scope_items`, `job_progress_entries`, `job_completion_requests`, `error_logs`, `tenant_branding`, `consent_records`, `notification_settings`, `operator_facility_badges`.

**Fix:** rewrite each policy to subquery `profiles.role` (or better, introduce a `SECURITY DEFINER` function `public.current_role()` with `STABLE` + `SET search_path=public` and call that). Update CLAUDE.md to remove the user_metadata recommendation.

Because *all* server routes use `supabaseAdmin` (service role) which bypasses RLS, this vulnerability is only exploitable when a client talks to PostgREST directly with its anon/user JWT. The app currently does both (see `lib/supabase.ts`), so the hole is live. Remediation URL: https://supabase.com/docs/guides/database/database-linter?lint=0015_rls_references_user_metadata

### P0-2. `tenant_id` filter silently disabled on empty/null tenant

`lib/api-auth.ts` returns `tenantId: profile.tenant_id || ''`. Nearly every admin `[id]` route then uses:

```ts
if (tenantId) query = query.eq('tenant_id', tenantId);
```

When the admin's profile `tenant_id` is NULL (common for `super_admin` and any admin whose tenant wasn't backfilled), the filter is a no-op and the query returns / mutates across all tenants. Examples: `app/api/admin/job-orders/[id]/route.ts:79,113,292,325`, `app/api/admin/invoices/[id]/route.ts:29,136`, `app/api/admin/customers/[id]/route.ts:31,133,169`, `app/api/admin/facilities/[id]/route.ts:26,65,93`, plus `app/api/admin/customers/route.ts:35`, `app/api/admin/invoices/route.ts:43`, `app/api/admin/job-orders/route.ts:76`, `app/api/admin/schedule-board/route.ts:35,60,74`, `app/api/admin/timecards/route.ts:44`, `app/api/admin/timecards/export/route.ts`, `app/api/admin/timecards/team-summary/route.ts`, and ~40 others.

**Fix:** return `403 Forbidden — tenant not set` whenever `auth.tenantId` is empty for non-super-admin roles, and for super_admin explicitly require a `?tenantId=` query parameter (admin client scoped). Never let NULL bypass the filter.

### P0-3. Cross-tenant foreign-key leak in invoice creation

`app/api/admin/invoices/route.ts` POST (line 102+):

```ts
const { data: job } = await supabaseAdmin.from('job_orders').select('*').eq('id', jobOrderId).single();
// no tenant check
...
.insert({ ..., tenant_id: tenantIdForInsert || null })
```

Admin from tenant A can pass `jobOrderId` from tenant B. The invoice gets created with tenant A's ID attached to tenant B's job data — a data-integrity corruption as well as a read leak of customer_name, address, PO number, and job details.

Same class of bug in: `app/api/admin/invoices/[id]/payment/route.ts`, `app/api/admin/invoices/[id]/send/route.ts`, `app/api/admin/job-orders/[id]/duplicate/route.ts`, `app/api/admin/jobs/[id]/scope/route.ts`, `app/api/admin/jobs/[id]/schedule/route.ts`, `app/api/admin/jobs/[id]/completion-request/route.ts`, `app/api/admin/job-orders/[id]/forms/route.ts`, `app/api/admin/operators/[id]/notes/route.ts`, `app/api/admin/operators/[id]/history/route.ts` — each fetches a record by id without verifying the fetched row's tenant matches caller's tenant.

**Fix:** after fetching, enforce `if (row.tenant_id !== auth.tenantId) return 404`.

---

## P1 Findings (fix before GA, not blocking for merge if documented)

### P1-1. Nine SECURITY DEFINER views expose cross-tenant data when queried with user JWT

Lint `security_definer_view` (ERROR): `job_pnl_summary`, `active_job_orders`, `active_job_orders_v3`, `job_profitability`, `timecards_with_users`, `badges_with_details`, `active_operator_dashboard`, `job_completion_summary`, `schedule_board_view`. These views run as the view owner and ignore the caller's RLS, so any authenticated user hitting PostgREST can read all tenants' data via the view.

`app/api/admin/schedule-board/route.ts` and `app/api/admin/timecards/route.ts` both query these views through the service role — that is fine — but if a client ever queries them directly via supabase-js anon, all bets are off.

**Fix:** recreate each view as `SECURITY INVOKER` or move the logic into SECURITY DEFINER functions with explicit tenant predicate.

### P1-2. Tenant table missing enforcement of `is_admin()` helper consistency

`customers`, `customer_contacts`, `facilities`, `timecards`, etc. use user_metadata (P0-1). Meanwhile `job_orders`, `profiles`, `invoices`, `access_requests`, `audit_log` use `is_admin()` — a `SECURITY DEFINER` helper that reads from `profiles`. The split creates attack surface; converge on `is_admin()` everywhere.

### P1-3. Public buckets allow listing

Lint `public_bucket_allows_listing` (WARN, 4 buckets): `job-photos`, `jobsite-area-docs`, `scope-photos`, `site-compliance-docs`. Anonymous users can enumerate every file, not just fetch a known URL. Contains job site photos, compliance badges, silica-plan attachments.

**Fix:** drop the `SELECT` policies; public URLs still resolve without list permission.

### P1-4. 14 DB functions have mutable search_path

Lint `function_search_path_mutable` (WARN). Functions: `update_total_days_worked`, `update_tenants_updated_at`, `update_dashboard_layouts_updated_at`, `update_dashboard_notes_updated_at`, `update_dashboard_tasks_updated_at`, `upsert_equipment_recommendation`, `get_user_tenant_id`, `get_current_tenant_id`, `get_tenant_by_slug`, `get_tenant_by_code`, `update_updated_at_column`, `set_daily_log_day_number`, `calculate_timecard_labor_cost`, `auto_expire_badges`. Combined with `SECURITY DEFINER` this enables search-path hijack.

**Fix:** `ALTER FUNCTION ... SET search_path = public, pg_temp;`.

### P1-5. Leaked-password protection disabled

Lint `auth_leaked_password_protection` (WARN). Enable HaveIBeenPwned check in Auth settings.

### P1-6. `system_health_log` has RLS enabled but zero policies

Table is effectively locked to service role only. If any client code reads from it, it will return empty silently. Add at least an admin-read policy or drop RLS.

---

## Table 1 — RLS Coverage (summary)

| category | count | notes |
|---|---|---|
| Tables with RLS enabled | 108 | 100% of public tables |
| Tables with 0 policies | 1 | `system_health_log` (P1-6) |
| Tables with 1 policy | 31 | mostly single ALL policy — verify scope |
| Tables with 2+ policies | 76 | healthier coverage |
| Policies using `user_metadata` | 54 | **P0-1** — all must be rewritten |
| Policies with `WITH CHECK = true` | 12 | mostly audit_log / error_logs / demo_requests (expected for insert-only logging) |
| SECURITY DEFINER views | 9 | **P1-1** |

Full per-table data captured in the audit query; high-risk 1-policy tables (review recommended): `analytics_daily`, `billing_milestones`, `contractor_jobs`, `contractors`, `customer_site_addresses`, `invoices`, `invoice_line_items`, `dashboard_layouts`, `payments`, `payroll_settings`, `pay_periods`, `signature_requests`, `standby_policies`, `user_invitations`. Several of these are read-only config (defensible); others (`invoices`, `invoice_line_items`, `payments`) need scrutiny.

`invoices` only has `admin_all_invoices` (ALL via `is_admin()`) — no per-user read. OK given the admin-only use case but means non-admins cannot ever see their own invoices via client-side Supabase.

---

## Table 2 — API Route Tenant-Isolation Findings

| route | severity | issue | suggested fix |
|---|---|---|---|
| all `app/api/admin/**/[id]/route.ts` using `if (tenantId) query.eq(...)` | P0 | NULL tenant bypasses filter (~40 routes) | Reject empty tenant; require explicit tenantId for super_admin |
| `app/api/admin/invoices/route.ts` POST | P0 | fetches `job_orders` by id without tenant check; creates cross-tenant invoice | Verify `job.tenant_id === auth.tenantId` before insert |
| `app/api/admin/invoices/[id]/payment/route.ts` | P0 | same pattern | ditto |
| `app/api/admin/invoices/[id]/send/route.ts` | P0 | same pattern | ditto |
| `app/api/admin/job-orders/[id]/duplicate/route.ts` | P0 | copies job without tenant check on source | ditto |
| `app/api/admin/jobs/[id]/scope/route.ts` | P0 | 4 `.from()` calls, only job filters by tenant | filter scope items too |
| `app/api/admin/jobs/[id]/schedule/route.ts` | P0 | same | ditto |
| `app/api/admin/jobs/[id]/completion-request/route.ts` | P0 | 5 `.from()` calls on different tables, inconsistent tenant scoping | audit each call |
| `app/api/admin/job-orders/[id]/forms/route.ts` | P0 | no tenant check on `job_form_assignments` writes | add tenant filter on FK join |
| `app/api/admin/operators/[id]/notes/route.ts` | P1 | operator_notes write without verifying target operator's tenant | verify target profile.tenant_id |
| `app/api/admin/operators/[id]/history/route.ts` | P1 | same | same |
| `app/api/setup/create-super-admin/route.ts` | P1 | `requireAdmin` allows any admin (not super_admin) to create new admins/super admins via duplicate email logic; no tenant binding on created profile | gate behind `requireSuperAdmin`; always set tenant_id to caller's |
| `app/api/setup/fix-profile/route.ts` | P1 | `supabaseAdmin.auth.admin.listUsers()` then creates profile — no tenant assignment | require caller's tenant_id |
| `app/api/admin/grant-super-admin/route.ts` | OK | correctly checks target.tenant_id === auth.tenantId — exemplar to copy |
| `app/api/admin/tenants/route.ts` (& `[id]`) | P1 | verify only super_admin; currently `requireAdmin` | confirm role narrowing |
| `app/api/public/signature/[token]/route.ts` | OK | token-based unauth, appropriately narrow select |
| `app/api/demo-requests/route.ts`, `/demo-request/route.ts` | OK | unauth insert only; rate-limit recommended |
| `app/api/log-error/route.ts` | P2 | unauth, no rate limit — log spam / storage DoS | add IP-based throttle |
| `app/api/send-email/route.ts` | OK | requires auth, SSRF-guarded PDF domains |
| `app/api/auth/login/route.ts` | OK | logs login attempts with IP; no enumeration leak |

(Severity definitions: **P0** = must fix before prod merge; **P1** = must fix before GA; **P2** = nice-to-have.)

---

## Table 3 — Role-Guard Gaps

| route | current guard | expected guard | severity |
|---|---|---|---|
| `app/api/setup/create-super-admin/route.ts` | `requireAdmin` (accepts admin, salesman, supervisor per api-auth.ts:61) | `requireSuperAdmin` | P0 |
| `app/api/migrations/apply-consent-fields/route.ts` | `requireAdmin` | `requireSuperAdmin` | P1 |
| `app/api/setup/fix-profile/route.ts` | `requireAdmin` | `requireSuperAdmin` (can repair any user's profile) | P1 |
| `app/api/admin/tenants/route.ts` and `[id]` | `requireAdmin` (likely) | `requireSuperAdmin` | P0 |
| `app/api/admin/backups/**` | `requireAdmin` | `requireSuperAdmin` (contains full tenant export) | P1 |
| `app/api/cron/health-check/route.ts` | none (public) | bearer secret or Vercel cron signature header | P1 |
| `app/api/log-error/route.ts` | none | optional, but add IP rate limit | P2 |

`requireAdmin` in `lib/api-auth.ts` (line 61) admits roles `['admin', 'super_admin', 'operations_manager', 'supervisor', 'salesman']`. Salesman and supervisor access to routes labeled "admin" is almost certainly wrong for destructive / cross-tenant operations (tenants CRUD, create-super-admin, system-health, backups, grant-super-admin). Recommend splitting into `requireSalesStaff` (broad) and `requireAdmin` (admin + super_admin + ops_manager only).

---

## Input Validation / Misc

- **No raw SQL** found in routes — Supabase query builder is used throughout; SQL injection surface is limited to the 14 `search_path_mutable` DB functions (P1-4).
- **XSS surface:** `app/api/admin/send-schedule/route.ts:233` and `app/api/admin/notifications/send/route.ts` interpolate `process.env.NEXT_PUBLIC_APP_URL` into HTML — env-controlled, low risk. No user-supplied HTML is echoed into responses.
- **SSRF:** `app/api/send-email/route.ts` has an explicit domain allow-list for PDF fetching — good.
- **Open redirects:** not found.
- **Secrets in client bundle:** all `NEXT_PUBLIC_*` vars are non-sensitive (URL, anon key, Stripe publishable, Google Maps). Service role key only in `lib/supabase-admin.ts` (server-only). **No leaks.**
- **Password handling:** `CLEANUP_TEST_ACCOUNTS.sql` and `ADD_PASSWORD_PLAIN_COLUMN.sql` exist at repo root — investigate whether plaintext passwords are ever stored. Recommend deleting the migration and column if present.

---

## Supabase Advisor Summary

### Security (95 lints)
| name | level | count | action |
|---|---|---|---|
| `rls_references_user_metadata` | ERROR | 54 | **P0-1** |
| `security_definer_view` | ERROR | 9 | **P1-1** |
| `rls_policy_always_true` | WARN | 12 | review; most are intentional insert-only logging |
| `function_search_path_mutable` | WARN | 14 | **P1-4** |
| `public_bucket_allows_listing` | WARN | 4 | **P1-3** |
| `auth_leaked_password_protection` | WARN | 1 | **P1-5** |
| `rls_enabled_no_policy` | INFO | 1 | **P1-6** |

### Performance (882 lints)
| name | level | count | action |
|---|---|---|---|
| `multiple_permissive_policies` | WARN | 347 | consolidate; query planner OR's all of them |
| `auth_rls_initplan` | WARN | 181 | wrap `auth.uid()` / `auth.jwt()` in `(select ...)` in each policy |
| `unused_index` | INFO | 226 | review and drop after 30 days of observed traffic |
| `unindexed_foreign_keys` | INFO | 125 | add indexes on high-traffic FKs (job_orders.customer_id, timecards.user_id, work_items.job_order_id) |
| `duplicate_index` | WARN | 3 | drop dupes |

Performance lints are non-blocking but `auth_rls_initplan` meaningfully degrades list-query latency under load. Recommended cleanup before production traffic, not before merge.

---

## Recommendations (ordered)

**Before merging to main (blockers):**
1. Rewrite all 54 `user_metadata`-based RLS policies to use `profiles.role` via `is_admin()` or an equivalent SECURITY DEFINER helper. Update CLAUDE.md guidance.
2. Harden `lib/api-auth.ts`: reject empty `tenantId` for non-super-admin; super_admin must pass explicit `?tenantId=`.
3. Audit and patch the ~40 admin `[id]` routes that use the `if (tenantId) .eq()` pattern; after the helper fix, the conditional can be removed entirely.
4. Add `tenant_id` cross-check on FK reads in invoice creation, job duplication, completion-request, scope, schedule routes.
5. Gate `/api/setup/create-super-admin`, `/api/admin/tenants/*`, `/api/admin/backups/*`, `/api/setup/fix-profile`, `/api/migrations/*` on `requireSuperAdmin`.
6. Drop `ADD_PASSWORD_PLAIN_COLUMN.sql` and confirm no password-in-plain column exists.

**Before GA (1–2 weeks post-launch):**
7. Recreate 9 SECURITY DEFINER views as SECURITY INVOKER with embedded tenant predicate.
8. `ALTER FUNCTION ... SET search_path` on 14 functions.
9. Remove SELECT policies from 4 public storage buckets.
10. Enable leaked-password protection in Auth.
11. Add policy for `system_health_log` or disable RLS.
12. Rate-limit `/api/log-error`, `/api/demo-requests`, `/api/cron/*`.
13. Narrow `requireAdmin` to exclude salesman/supervisor; create `requireSalesStaff` for true read-only routes.

**Performance (post-launch):**
14. Wrap `auth.uid()`/`auth.jwt()` in `(select ...)` in 181 policies.
15. Consolidate 347 multiple-permissive-policy sets.
16. Add FK indexes; drop unused indexes after observation.

---

## Must-fix before production merge

- [ ] P0-1: `user_metadata` RLS rewrite (54 policies)
- [ ] P0-2: Tenant-filter-bypass hardening in `lib/api-auth.ts` + all consuming routes
- [ ] P0-3: FK tenant cross-check on invoices / jobs / duplicate / scope / schedule routes
- [ ] P0 role-guard: `create-super-admin`, `admin/tenants`, `setup/fix-profile` → requireSuperAdmin
- [ ] Confirm no plaintext password column in profiles

Everything else is fair game for post-merge iteration, provided it lands before external GA.
