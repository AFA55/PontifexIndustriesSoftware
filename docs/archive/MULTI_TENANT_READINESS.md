# Multi-Tenant Onboarding Readiness Checklist

**Status:** 1 tenant live (Patriot). Everything below has **zero impact today** but must be
completed **before onboarding tenant #2**. Created 2026-05-30 from the architecture audit.

The big cross-tenant **read** leaks (RLS on profiles/timecards/invoices/job_orders/etc., anon-readable
SECURITY DEFINER views) were already fixed and verified — see migrations `20260530_tenant_scope_rls_policies`
and `20260530_revoke_anon_security_definer_views`. What remains are lower-risk or payroll-sensitive items
deliberately deferred until a second tenant exists to test isolation against.

## 🔴 Must fix before tenant #2

### 1. Tenant-scope the payroll calculation settings
- **What:** `calculate_timecard_hours()` and `auto_approve_timecard()` (DB functions, fire on clock-out)
  read the legacy global `timecard_settings` (key/value) table with **no tenant filter** — while the
  clock-in route reads the per-tenant `timecard_settings_v2`. OT thresholds, auto-lunch, and
  auto-approval bounds are therefore shared across all tenants.
- **Why deferred:** changes live payroll math; can only be safely verified with a real 2nd tenant.
  Doing it blind now risks a payroll bug for Patriot with no way to test the multi-tenant behavior.
- **Fix when onboarding:** migrate both functions to read `timecard_settings_v2` scoped by the
  timecard's `tenant_id`, with documented fallback defaults. Test pay calc for BOTH tenants.

### 2. P&L views need a tenant_id column
- **What:** `job_pnl_summary`, `job_profitability`, `active_operator_dashboard`, `badges_with_details`,
  `active_job_orders_v3` have no `tenant_id` column, so `/api/admin/job-pnl` can't tenant-scope its query
  (it returns all-tenant P&L). Anon access is already revoked, and there's one tenant, so no leak today.
- **Fix when onboarding:** add `tenant_id` to these views (select `jo.tenant_id`) and add
  `.eq('tenant_id', resolvedTenantId)` in `app/api/admin/job-pnl/route.ts`.

## 🟡 Lower-risk / accepted

### 3. Public-INSERT RLS policies (WITH CHECK = true)
- `access_requests`, `consent_records`, `demo_requests`, `error_logs`, `audit_log(s)`,
  `customer_surveys`, `job_orders_history`, `equipment_checkout_sessions` have always-true INSERT
  policies. These are **intentional public-intake / system-write endpoints** (signup, surveys, error
  logging). They are write-only (no cross-tenant read), so the risk is spam, not data leakage.
- **Decision:** accepted as-is. If abuse appears, add rate-limiting or a tenant/`auth.uid()` check on
  the few that are authenticated (e.g. `equipment_checkout_sessions` INSERT could scope `tenant_id`).

### 4. `if (tenantId)` NULL-bypass pattern (~90 sites)
- Read/write sites use `if (tenantId) query.eq('tenant_id', tenantId)`. Today `tenantId` is server-derived
  and non-null for all non-super-admin roles (guards enforce it), so this is a super_admin-only
  over-read, not a tenant-to-tenant leak. It is a latent footgun.
- **Fix incrementally:** migrate write routes first to `resolveTenantScope()` (hard `.eq`), per the
  guidance in `lib/api-auth.ts`.

## ✅ Already done (multi-tenant safe now)
- RLS tenant-scoping on profiles, timecards, invoices, payments, work_items, customers,
  customer_contacts, daily_job_logs, job_orders, equipment, facilities, form_templates,
  equipment_checkout_sessions (verified: Patriot admin still sees all rows).
- Revoked anon/authenticated on the 9 SECURITY DEFINER views.
- super_admin role-grant caps; webhook idempotency + retry; payroll cascade-delete protection.
- Billing is per-tenant (admin manages own; super_admin targets any via ?tenantId / sole-tenant default).
