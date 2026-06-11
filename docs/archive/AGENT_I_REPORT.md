# Agent I — Route-Guard Role Matrix

**Compiled by:** Claude (both background agent attempts timed out; matrix assembled from direct grep)
**Scope:** `/app/api/admin/**` routes that correspond to sidebar flags a salesman / supervisor / inventory_manager should be able to use.
**Date:** 2026-04-21

## Legend
- ✅ = guard matches the audience the sidebar advertises
- ❌ = sidebar shows the feature to salesman/supervisor but API returns 403
- ⚠️ = partial (some verbs OK, others wrong) or too-permissive
- 🔒 = super-admin-only, correct

---

## can_view_active_jobs (salesman / supervisor need read + light writes)

| Route | Guard | Verdict |
|---|---|---|
| `app/api/admin/active-jobs/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/active-jobs-summary/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/jobs/[id]/summary/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/jobs/[id]/work-items/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/jobs/[id]/change-orders/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/jobs/[id]/change-orders/[coId]/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/jobs/[id]/send-signature-request/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/jobs/[id]/new-scope/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/jobs/[id]/scope/route.ts` | `requireAuth` (GET) / `requireAdmin` (PATCH/PUT/DELETE) | ⚠️ sales can read but can't edit scope |
| `app/api/admin/jobs/[id]/completion-request/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/jobs/[id]/completion-summary/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/jobs/[id]/billing-milestones/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/jobs/[id]/schedule/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/jobs/[id]/related-jobs/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/jobs/[id]/notify-salesperson/route.ts` | `requireSalesStaff` | ✅ (already fixed) |
| `app/api/admin/jobs/quick-add/route.ts` | `requireSalesStaff` | ✅ (already fixed) |

## can_view_customers

| Route | Guard | Verdict |
|---|---|---|
| `app/api/admin/customers/route.ts` (list, create) | `requireSalesStaff` | ✅ |
| `app/api/admin/customers/[id]/route.ts` (GET/PATCH; DELETE still superAdmin) | `requireSalesStaff` | ✅ |
| `app/api/admin/customers/[id]/{contacts,site-addresses,project-names,po-numbers,site-contacts,job-history,sync}` | `requireSalesStaff` | ✅ |
| `app/api/admin/customers/search/route.ts` | `requireAuth` | ✅ (broad by design) |

## can_view_invoicing

| Route | Guard | Verdict |
|---|---|---|
| `app/api/admin/invoices/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/invoices/[id]/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/invoices/[id]/pdf/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/invoices/[id]/send/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/invoices/[id]/remind/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/invoices/[id]/payment/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/invoices/create/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/billing-milestones/[id]/trigger/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/job-pnl/route.ts` | `requireAdmin` | ⚠️ sales needs own PnL |
| `app/api/admin/job-pnl/[id]/route.ts` | `requireAdmin` | ⚠️ |

## can_view_completed_jobs

| Route | Guard | Verdict |
|---|---|---|
| `app/api/admin/job-orders/[id]/duplicate/route.ts` | `requireAdmin` | ❌ P0 (sales often duplicates) |
| `app/api/admin/job-orders/[id]/resubmit/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/job-orders/[id]/forms/route.ts` | `requireAdmin` | ❌ P0 (sales sees customer forms) |
| `app/api/admin/job-orders/[id]/approve/route.ts` | `requireAdmin` | ✅ admin action (correct) |
| `app/api/admin/job-orders/[id]/reject/route.ts` | `requireSuperAdmin` | 🔒 correct |

## can_create_schedule_forms (salesman core workflow!)

| Route | Guard | Verdict |
|---|---|---|
| `app/api/admin/schedule-form/route.ts` | `requireAdmin` | ❌ **P0 critical** — sales cannot submit a new job form |
| `app/api/admin/schedule-forms/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/schedule-form/ai-parse/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/schedule-contacts/route.ts` | `requireAdmin` | ❌ P0 |
| `app/api/admin/po-lookup/route.ts` | `requireAdmin` | ❌ P0 (quoting needs this) |

## can_view_schedule_board (sales sees board)

| Route | Guard | Verdict |
|---|---|---|
| `app/api/admin/schedule-board/route.ts` | `requireScheduleBoardAccess` | ✅ |
| `app/api/admin/schedule-board/quick-add/route.ts` | `requireScheduleBoardAccess` | ✅ |
| `app/api/admin/schedule-board/capacity/route.ts` | `requireScheduleBoardAccess` | ✅ |
| `app/api/admin/schedule-board/operators/route.ts` | `requireScheduleBoardAccess` | ✅ |
| `app/api/admin/schedule-board/crew-grid/route.ts` | `requireScheduleBoardAccess` | ✅ |
| `app/api/admin/schedule-board/skill-match/route.ts` | `requireScheduleBoardAccess` | ✅ |
| `app/api/admin/schedule-board/assign/route.ts` | `requireScheduleBoardAccess` | ✅ |
| `app/api/admin/schedule-board/dispatch/route.ts` | `requireScheduleBoardAccess` | ✅ |
| `app/api/admin/schedule-board/time-off/route.ts` | `requireAdmin` | ⚠️ inconsistent w/ rest |
| `app/api/admin/schedule-board/auto-schedule/route.ts` | `requireAdmin` | ⚠️ |
| `app/api/admin/schedule-board/update-schedule/route.ts` | `requireAdmin` | ⚠️ |

(Need to verify `requireScheduleBoardAccess` role list includes salesman — see open question below.)

## can_view_facilities (sales doesn't need write)

| Route | Guard | Verdict |
|---|---|---|
| `app/api/admin/facilities/route.ts` | `requireAdmin` | ⚠️ sales should at least GET for quoting |
| `app/api/admin/facilities/[id]/route.ts` | `requireAdmin` | ⚠️ |
| `app/api/admin/facilities/[id]/badges/route.ts` | `requireAdmin` | ✅ (admin action) |
| `app/api/admin/facilities/[id]/badged-operators/route.ts` | `requireAdmin` | ✅ |

## Dashboard / shell routes (sidebar home page needs these)

| Route | Guard | Verdict |
|---|---|---|
| `app/api/admin/dashboard-stats/route.ts` | `requireAdmin` | ❌ sales dashboard shows these stats |
| `app/api/admin/dashboard-summary/route.ts` | `requireAdmin` | ❌ |
| `app/api/admin/dashboard-tasks/route.ts` | `requireAdmin` | ❌ |
| `app/api/admin/dashboard-notes/route.ts` | `requireAdmin` | ⚠️ |
| `app/api/admin/dashboard-layout/route.ts` | `requireAuth` | ✅ |
| `app/api/admin/notifications/route.ts` | `requireAuth` | ✅ |
| `app/api/admin/user-flags/[userId]/route.ts` | `requireAuth` (GET), `requireAdmin+superAdminCheck` (PUT) | ✅ (fixed earlier) |

## Timecards (can_view_timecards — admin only)

All `app/api/admin/timecards/**` use `requireAdmin`. ✅ correct for now — if inventory_manager/supervisor need read, promote to `requireSalesStaff` later.

## 🚨 SECURITY-CRITICAL findings

| Route | Current | Issue | Fix |
|---|---|---|---|
| `app/api/admin/grant-super-admin/route.ts` | `requireAdmin` | An `admin` can grant super_admin. Privilege-escalation risk. | `requireSuperAdmin` |
| `app/api/admin/commission/route.ts` | `requireAuth` | Any authenticated user can fetch commissions. Likely too open. | Likely `requireAdmin` or filter to `user_id === auth.userId` |
| `app/api/admin/profiles/[id]/route.ts` | `requireAdmin` | Blocks a user from reading their own profile. | Switch to `requireAuth` + self-or-admin check |
| `app/api/admin/profiles/route.ts` | `requireAdmin` | ⚠️ sidebar "Team Profiles" flag is `can_manage_team` — salesman doesn't need this; correct |

---

# P0 FIX LIST (batch-edit targets)

Switch `requireAdmin` → `requireSalesStaff` on these (sales/supervisor-reachable features):

## Schedule Form (MOST CRITICAL — salesman core workflow)
1. `app/api/admin/schedule-form/route.ts`
2. `app/api/admin/schedule-forms/route.ts`
3. `app/api/admin/schedule-form/ai-parse/route.ts`
4. `app/api/admin/schedule-contacts/route.ts`
5. `app/api/admin/po-lookup/route.ts`

## Active Jobs (read + job-level actions)
6. `app/api/admin/active-jobs/route.ts`
7. `app/api/admin/active-jobs-summary/route.ts`
8. `app/api/admin/jobs/[id]/summary/route.ts`
9. `app/api/admin/jobs/[id]/work-items/route.ts`
10. `app/api/admin/jobs/[id]/change-orders/route.ts`
11. `app/api/admin/jobs/[id]/change-orders/[coId]/route.ts`
12. `app/api/admin/jobs/[id]/send-signature-request/route.ts`
13. `app/api/admin/jobs/[id]/new-scope/route.ts`
14. `app/api/admin/jobs/[id]/completion-request/route.ts`
15. `app/api/admin/jobs/[id]/completion-summary/route.ts`
16. `app/api/admin/jobs/[id]/billing-milestones/route.ts`
17. `app/api/admin/jobs/[id]/schedule/route.ts`
18. `app/api/admin/jobs/[id]/related-jobs/route.ts`
19. `app/api/admin/jobs/[id]/scope/route.ts` (promote PATCH/PUT/DELETE from `requireAdmin`)

## Invoicing
20. `app/api/admin/invoices/route.ts`
21. `app/api/admin/invoices/[id]/route.ts`
22. `app/api/admin/invoices/[id]/pdf/route.ts`
23. `app/api/admin/invoices/[id]/send/route.ts`
24. `app/api/admin/invoices/[id]/remind/route.ts`
25. `app/api/admin/invoices/[id]/payment/route.ts`
26. `app/api/admin/invoices/create/route.ts`
27. `app/api/admin/billing-milestones/[id]/trigger/route.ts`

## Completed jobs / job-order actions
28. `app/api/admin/job-orders/[id]/duplicate/route.ts`
29. `app/api/admin/job-orders/[id]/resubmit/route.ts`
30. `app/api/admin/job-orders/[id]/forms/route.ts`

## Dashboard shell (so the landing page isn't empty for non-admins)
31. `app/api/admin/dashboard-stats/route.ts`
32. `app/api/admin/dashboard-summary/route.ts`
33. `app/api/admin/dashboard-tasks/route.ts`

## Security tightening (separate commit)
34. `app/api/admin/grant-super-admin/route.ts` → `requireSuperAdmin`
35. `app/api/admin/commission/route.ts` → add self-or-admin check
36. `app/api/admin/profiles/[id]/route.ts` → `requireAuth` + self-or-admin

## Open questions (verify before fixing)
- Does `requireScheduleBoardAccess` currently include `salesman`? If not, add it (needed so the Schedule Board page loads for them).
- Should `job-pnl` endpoints be admin-only, or should sales see their own deals' PnL?
- `facilities` read access for sales — confirm with product owner.

Total: **33 P0 route fixes** to unblock salesman/supervisor end-to-end, plus **3 security tightenings** that should go in a separate commit.
