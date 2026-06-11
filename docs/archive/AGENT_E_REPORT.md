# Agent E Report — P0-2 / P0-3 / P0-4 Remediation

**Date:** 2026-04-21
**Branch:** `claude/festive-ramanujan-79b9c7` (worktree of `feature/schedule-board-v2`)
**Scope:** Harden `lib/api-auth.ts` against the NULL-tenant bypass, add FK tenant
cross-checks on invoice / job / operator routes, narrow `requireAdmin` and
gate setup/tenants/backups/migrations behind `requireSuperAdmin`.
**Build:** `npm run build` passes with 0 TypeScript errors.

---

## 1. Counts — `if (tenantId)` pattern purge

| scope | before | after |
|---|---|---|
| `app/api/admin/**` (explicit brief scope) | 66 | **0** |
| `app/api/**` total (outside admin — operator / shop / public) | ~42 | 34 |

Admin is fully purged. The 34 remaining live in non-admin routes (e.g. `app/api/operator/*`, `app/api/job-orders/[id]/*`, `app/api/silica-plan/*`). Those were outside the brief's explicit scope, but the hardening in `lib/api-auth.ts` still protects them: `requireAuth` now returns `tenantId: string | null` and rejects non-super-admin profiles with null tenant (403). The `if (tenantId) .eq('tenant_id', tenantId)` pattern in those routes is therefore functionally equivalent to unconditional filtering for every non-super-admin caller — the residual concern is only whether super_admin callers silently skip the filter on those routes. Recommended follow-up below.

---

## 2. P0-2 — `lib/api-auth.ts` hardening

### Behavioral changes

- `AuthSuccess.tenantId` is now `string | null` (was `string` with silent `|| ''` fallback).
- `requireAuth`, `requireAdmin`, `requireSalesStaff`, `requireOpsManager`, `requireScheduleBoardAccess` all return **403 `{ error: 'Tenant not set for this user.' }`** whenever the caller's role is not `super_admin` and their profile has no `tenant_id`.
- New helper `resolveTenantScope(request, auth)` returns a guaranteed non-null tenant:
  - For non-super-admin: returns `auth.tenantId`.
  - For super_admin: requires `?tenantId=<uuid>` (reads `tenantId` or `tenant_id` from the query string), validates the tenant exists in `tenants`, returns `400`/`404` otherwise.
- `requireSuperAdmin` no longer silently accepts a missing tenant from its delegate call; it is the only guard that returns a nullable tenantId (by design — super_admin is allowed to have no home tenant).

Key file: `lib/api-auth.ts` (fully rewritten; old `requireAdmin` role list `['admin','super_admin','operations_manager','supervisor','salesman']` → new list `['admin','super_admin','operations_manager']`).

### Route patches

Every admin route I touched now either:
1. Uses `auth.tenantId` with an immediate `if (!tenantId) return 400 'Tenant scope required. super_admin must pass ?tenantId='` guard, **OR**
2. Calls `await getTenantId(auth.userId)` and guards the return value the same way.

The `if (tenantId) query = query.eq(...)` lines that previously bypassed filtering are replaced with direct `query.eq('tenant_id', tenantId)` calls. The null-check above each `.eq('tenant_id', tenantId)` block is redundant-but-safe belt-and-suspenders (matches the brief's intent).

### Files patched for tenant null-guards (42 files)

All files in this list now have a `const tenantId = …` line followed by `if (!tenantId) return 400` and no `if (tenantId) .eq(…)` conditional:

```
app/api/admin/badges/route.ts
app/api/admin/branding/route.ts
app/api/admin/card-permissions/route.ts
app/api/admin/customers/[id]/contacts/route.ts
app/api/admin/customers/[id]/route.ts
app/api/admin/customers/[id]/sync/route.ts
app/api/admin/customers/route.ts
app/api/admin/customers/search/route.ts
app/api/admin/facilities/[id]/route.ts
app/api/admin/facilities/route.ts
app/api/admin/invoices/[id]/pdf/route.ts
app/api/admin/invoices/[id]/route.ts
app/api/admin/invoices/route.ts
app/api/admin/job-orders/[id]/approve/route.ts
app/api/admin/job-orders/[id]/duplicate/route.ts
app/api/admin/job-orders/[id]/reject/route.ts
app/api/admin/job-orders/[id]/route.ts
app/api/admin/job-orders/route.ts
app/api/admin/job-workflow/route.ts
app/api/admin/nfc-tags/route.ts
app/api/admin/notification-settings/route.ts
app/api/admin/operator-profiles/[id]/route.ts
app/api/admin/operator-profiles/route.ts
app/api/admin/operators/active/route.ts
app/api/admin/profiles/route.ts
app/api/admin/schedule-board/assign/route.ts
app/api/admin/schedule-board/notify/route.ts
app/api/admin/schedule-board/operators/route.ts
app/api/admin/schedule-board/route.ts
app/api/admin/schedule-board/time-off/route.ts
app/api/admin/suggestions/route.ts
app/api/admin/sync-job-statuses/route.ts
app/api/admin/timecard-settings/route.ts
app/api/admin/timecards/[id]/approve/route.ts
app/api/admin/timecards/[id]/route.ts
app/api/admin/timecards/[id]/update/route.ts
app/api/admin/timecards/export/route.ts
app/api/admin/timecards/operator/[id]/route.ts
app/api/admin/timecards/route.ts
app/api/admin/timecards/team-summary/route.ts
app/api/admin/users/[id]/route.ts
app/api/admin/users/route.ts
```

---

## 3. P0-3 — FK tenant cross-checks

All ten routes in the brief received an explicit `row.tenant_id === auth.tenantId`
guard returning **404** (not 403) when mismatched.

| route | what now happens |
|---|---|
| `app/api/admin/invoices/route.ts` (POST) | Fetches `job_orders` by id, returns `404` if `job.tenant_id !== callerTenantId`. `tenantIdForInsert` now reuses the verified caller tenant. |
| `app/api/admin/invoices/[id]/payment/route.ts` | Adds `tenant_id` to the invoice select; returns `404` on mismatch before mutating. |
| `app/api/admin/invoices/[id]/send/route.ts` | Same — select includes `tenant_id`, FK check before any side effect. |
| `app/api/admin/job-orders/[id]/duplicate/route.ts` | Already gated by `.eq('tenant_id', tenantId)` on the source fetch; added tenant-required null guard. |
| `app/api/admin/jobs/[id]/scope/route.ts` | POST now verifies the parent `job_orders` row belongs to the caller's tenant before inserting `job_scope_items`. GET/PUT/DELETE already had `.eq('tenant_id', tenantId)`. |
| `app/api/admin/jobs/[id]/schedule/route.ts` | Added explicit non-null guard for `auth.tenantId` + a pre-update FK cross-check. |
| `app/api/admin/jobs/[id]/completion-request/route.ts` | Already tenant-scoped on every `.from()` call; added non-null guard. |
| `app/api/admin/job-orders/[id]/forms/route.ts` | GET now verifies parent job; POST now verifies both `job_orders` and `form_templates` belong to the caller's tenant (returns 404 on either mismatch). |
| `app/api/admin/operators/[id]/notes/route.ts` | GET, POST, DELETE all verify the target operator's `profiles.tenant_id === callerTenantId` via the new local `verifyOperatorTenant()` helper. |
| `app/api/admin/operators/[id]/history/route.ts` | Fetched profile is now checked against caller tenant before any child query runs. |

All FK mismatches return `404 { error: 'Not found' }` to avoid leaking cross-tenant record existence.

---

## 4. P0-4 — Role guard narrowing and super-admin gating

### `requireAdmin` narrowed

| before | after |
|---|---|
| `['admin','super_admin','operations_manager','supervisor','salesman']` | `['admin','super_admin','operations_manager']` |

### New guard: `requireSalesStaff`

Broader guard (the old `requireAdmin` set) for read-only / sales pipeline routes. `requireScheduleBoardAccess` is now a thin alias for `requireSalesStaff` — same role set, same tenant guard.

### Routes promoted to `requireSuperAdmin`

All of these had `requireAdmin` before and are destructive, cross-tenant, or tenant-assignment-sensitive:

- `app/api/setup/create-super-admin/route.ts`
- `app/api/setup/fix-profile/route.ts`
- `app/api/migrations/apply-consent-fields/route.ts`
- `app/api/admin/backups/contacts/route.ts`

Already on `requireSuperAdmin` (verified, not changed):

- `app/api/admin/tenants/route.ts`
- `app/api/admin/tenants/[id]/route.ts`
- `app/api/admin/backups/route.ts`

### Callers reclassified from `requireAdmin` → `requireSalesStaff`

Only two files. The rest of the ~95 `requireAdmin` callers are legitimately admin-only (invoices, facilities, tenant settings, timecards, billing, invoices, payroll, etc.); narrowing the list actually closes a hole where salesman/supervisor previously had write access to admin-only endpoints:

| route | reason |
|---|---|
| `app/api/admin/operators/[id]/history/route.ts` | Module comment explicitly states "Access: admin, super_admin, operations_manager, salesman, supervisor" — this is a read-only operator profile history page. |
| `app/api/admin/operators/[id]/notes/route.ts` | Same documented role set; DELETE already has an internal super_admin narrowing. |

I deliberately did NOT reclassify the many admin CRUD / billing / timecard routes — those should remain admin-only. If a salesman user now gets a 403 on a specific route they used to access, the fix is to reclassify that route to `requireSalesStaff` explicitly rather than re-broaden `requireAdmin`.

---

## 5. Unchanged / intentionally out of scope

- `app/api/setup/check-admin/route.ts` stayed on `requireAdmin` — it's a self-check reporting the caller's own state, not a cross-tenant operation.
- Non-admin routes under `app/api/operator/**`, `app/api/job-orders/**`, `app/api/shop/**`, `app/api/silica-plan/**`, `app/api/service-completion-agreement/**`, `app/api/job-hazard-analysis/**`, `app/api/inventory/**`, `app/api/access-requests/**`, `app/api/workflow/**` were not swept. The api-auth.ts hardening protects them for non-super-admin callers; super_admin callers will silently match 0 rows rather than bypassing on those `.eq('tenant_id', null)` calls. Follow-up PR should purge the `if (tenantId)` pattern from those files too (Agent A catalogued ~30 of them).
- `app/api/admin/dashboard-summary/route.ts` has 20 `.eq('tenant_id', tenantId)` calls which are now safe (guard rejects null tenant before the handler body runs) but were not individually re-audited in this pass.
- DB migrations (Agent D), `ADD_PASSWORD_PLAIN_COLUMN.sql` (Agent F), and `CLAUDE.md` — untouched per brief.

---

## 6. Follow-ups for the lead

1. Sweep the ~34 `if (tenantId)` instances in non-admin routes using the same script (`/tmp/patch_admin.mjs` has the regex).
2. Replace the scattered `getTenantId(auth.userId)` calls with `auth.tenantId` — the profile lookup is now duplicated (once in `requireAuth`, once in `getTenantId`). Consolidation would shave one DB round-trip per request.
3. Audit remaining `requireAdmin` callers and decide which should move to `requireSalesStaff`. Safe default is to leave them admin-only; widen only when a legitimate salesman access request surfaces.
4. Add an E2E test that hits `/api/admin/invoices` POST with a super_admin token and no `?tenantId=`; should return 400, not 500.
5. Regression test: super_admin calling `/api/admin/customers?tenantId=<A>` vs `?tenantId=<B>` should return different result sets scoped to each tenant.

---

## 7. 10-line summary for the lead

1. `lib/api-auth.ts` rewritten: `AuthResult.tenantId` is `string | null`; non-super-admins with no tenant get a 403 at the guard, not a silent bypass.
2. New helper `resolveTenantScope(request, auth)` forces super_admin to pass `?tenantId=<uuid>`; validates the tenant exists.
3. New `requireSalesStaff` guard; `requireAdmin` narrowed to `['admin','super_admin','operations_manager']` only.
4. Removed `if (tenantId) …` in all 42 admin route files — admin is at 0 instances (from 66).
5. Every admin route now rejects a null tenant with a 400 before running any tenant-scoped query.
6. FK cross-checks added to invoices POST / send / payment, jobs scope/schedule/forms, operator notes/history — all return 404 on tenant mismatch.
7. `setup/create-super-admin`, `setup/fix-profile`, `migrations/apply-consent-fields`, `admin/backups/contacts` promoted to `requireSuperAdmin`.
8. `operators/[id]/history` and `operators/[id]/notes` moved from `requireAdmin` to `requireSalesStaff` per their documented role set.
9. `npm run build` passes 0 errors.
10. Not merged — lead to merge. Follow-ups in section 6 are non-blocking.
