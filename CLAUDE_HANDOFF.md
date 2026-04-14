# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** April 14, 2026 | **Branch:** `feature/schedule-board-v2` | **Build Status:** PASSING ✅ (0 errors)

---

## CURRENT STATE

### Git Status
- **Branch:** `feature/schedule-board-v2`
- **Last commit:** `bf95ef6b` — "fix(customers): correct contact_name → customer_contact column reference"
- **Pushed to origin** ✅
- **Build:** PASSING (0 errors, TypeScript clean)
- **Dev server:** `npm run dev` → port 3000

### Recent Commits (April 14, 2026 session)
```
bf95ef6b fix(customers): correct contact_name → customer_contact column reference
121ade2f docs: update CLAUDE_HANDOFF + sprint backlog for April 14 session
bfe56ac4 feat(customer-history): clickable job history panel with full job detail
d1bacf2c fix(delete-job): proper cascade cleanup + operator notification on job deletion
f851422e feat: Remove from Schedule button inside job detail panel
9121bd99 feat: project-grouped customer history + pre-filled Add Job flow
56e03b17 feat: remove from schedule modal — reschedule or delete permanently
ed7b7cf2 feat: change orders + new scope / continuation job system
```

---

## EVERYTHING BUILT THIS SESSION (April 14, 2026)

### 1. Change Orders System
**New files:**
- `app/api/admin/jobs/[id]/change-orders/route.ts` — GET list + POST create
- `app/api/admin/jobs/[id]/change-orders/[coId]/route.ts` — PATCH approve/reject + DELETE
- `components/jobs/ChangeOrdersSection.tsx` — Amber/orange themed collapsible section on job detail page

**What it does:** Admins can add scope additions to an in-progress job (e.g. "trench doubled"). Change orders have pending → approved/rejected flow. On approve, scope items are bulk-inserted into `job_scope_items` and operator gets notified. On reject, reason appended to notes.

### 2. New Scope / Continuation Jobs
**New files:**
- `app/api/admin/jobs/[id]/new-scope/route.ts` — POST creates child job (pre-filled from parent, `parent_job_id` set, job number `QA-{year}-{6 digits}`)
- `app/api/admin/jobs/[id]/related-jobs/route.ts` — GET returns `{ parent, continuations }`
- `components/jobs/RelatedJobsSection.tsx` — Indigo themed section showing parent/child jobs + "Add New Scope" modal

**What it does:** From any job detail page, create a continuation job for the same client/project. The new job is pre-filled (copies ~30 fields, excludes transient ones), linked via `parent_job_id`, and shows the "Continuation of JOB-XXXX" note.

### 3. Delete Job from Schedule Board (with modal)
**New files:**
- `app/dashboard/admin/schedule-board/_components/CancelJobModal.tsx` — 2-step modal: reschedule vs delete

**Modified:**
- `JobCard.tsx` — trash icon on hover (only when canEdit + not completed)
- `OperatorRow.tsx` — passes `onRemoveJob` down to JobCard
- `JobDetailView.tsx` — red "Remove" button in header (only when not editing + not completed)
- `schedule-board/page.tsx` — `cancelJobTarget` state, `handleRescheduleJob`, `handleDeleteJob` functions, CancelJobModal render

**What it does:** Clicking trash on a job card OR the Remove button in the job detail panel opens a modal with two choices:
- **Reschedule**: date picker + optional reason → PATCH job to new date
- **Delete Permanently**: red confirmation → deletes job

### 4. Delete Job Cascade (Full Cleanup)
**Modified:** `app/api/admin/job-orders/[id]/route.ts` (DELETE handler)

4-step process:
1. Notify assigned operator + helper via `notifications` table (job_cancelled, priority: high)
2. Audit trail to `job_orders_history` (fire-and-forget)
3. FK cleanup before hard delete: delete `invoice_line_items`, nullify `timecards.job_order_id` + `pay_adjustments.job_order_id`, delete `operator_workflow_log/sessions/operator_job_history`, unlink continuation jobs
4. Hard delete `job_orders` with tenant scope

**Effect:** Job vanishes from operator's my-jobs list, customer profile, and all related views.

### 5. Customer Project History — Grouped + Pre-filled Add Job
**Modified:** `app/dashboard/admin/customers/[id]/page.tsx`

- Jobs grouped by `project_name`, sorted newest first
- Collapsible project folders with: active job count badge, total value, last date
- "Add Job" button inside each folder → stores `schedule-form-customer-prefill` in localStorage → navigates to schedule form
- Schedule form reads that key on mount and pre-fills: customer, project name, address, location, contact, equipment

**Modified:** `app/dashboard/admin/schedule-form/page.tsx`
- On mount: reads `schedule-form-customer-prefill` from localStorage, maps all fields, calls `fetchCustomerHistory`, clears key immediately

### 6. Job History Detail Panel (Click-into from Customer Page)
**New files:**
- `app/api/admin/jobs/[id]/detail/route.ts` — Full aggregation endpoint returns: job row (`*`), operator + helper profiles (UUID→name), scope items with `completed_qty` + `pct_complete`, timecards with operator names, job notes, daily logs, totals block
- `components/jobs/JobHistoryDetailPanel.tsx` — Slide-in right panel (52% desktop / full mobile)

**Modified:** `app/dashboard/admin/customers/[id]/page.tsx`
- Job rows open the panel instead of navigating away
- Selected row highlighted with purple ring
- `selectedJobId` state, Escape key closes panel

**Panel tabs:**
- **Overview** — Crew cards with initials avatars, multi-day badge, description, scope-of-work, star ratings if completed
- **Scope & Work** — Progress bars per scope item (green ≥90%, amber ≥50%, red <50%)
- **Hours & Crew** — Timecard rows with clock-in/out, labor cost summary, daily logs
- **Notes** — Newest-first, author name, type badge

### 7. Bug Fix: Customer Detail Showing 0 Jobs / $0
**Root cause:** `job_orders` table has no column `contact_name` — it's `customer_contact`. The bad column name caused Supabase to error, `data` returned `null`, defaulted to `[]` → customer detail showed 0 jobs and $0 despite data existing.

**Fixed in:**
- `app/api/admin/customers/[id]/route.ts` — SELECT now uses `customer_contact`
- `app/dashboard/admin/customers/[id]/page.tsx` — Job interface field renamed, `handleAddJobForProject` source field updated

**QA verified on live DB:** 2 jobs return correctly, $26k revenue, 2 notes per job.

---

## WHAT WAS DONE IN PREVIOUS SESSIONS

### Session 9 (March 31) — Timecard System & Security ✅
- Timecard system overhaul (DB, API, UI, NFC, GPS, segments)
- Configurable break deduction
- Operator timecard detail view
- Team payroll overview (Mon-Sun grid, batch approve, export)
- Notification system (in-app + email, auto-reminders)
- NotificationBell on admin + operator dashboards
- Security audit (NFC bypass, XSS, tenant isolation)
- Restored all 230+ files from unmerged worktree branches
- Fixed login (all 8 roles), RBAC, dashboard branding

### Sessions 7-8 (March 28-29) — Multi-Tenant & Landing ✅
- Multi-tenant architecture, white-label branding (BrandingProvider)
- Debranded all Pontifex hardcodes
- Landing page rebuild + Request Demo funnel

### Sessions 4-6 (March 25-26) — Major Features ✅
- Schedule board (operators, time-off, skill warnings, realtime colors, inline editing)
- Schedule form redesign (customer-first, project name, smart contact dropdown)
- Timecard + NFC system, Facilities & badging, Approval workflow
- Customer portal (public signature, form builder, surveys)
- Work-performed gate

### Session 7-April 7 — Operator & Schedule Board Fixes ✅
- In-route simplified view (location + site contact only)
- Collapsible sections on operator job detail page
- Per-day assignments via `job_daily_assignments`
- AI Smart Fill mic permission handling
- Schedule Preview real data sync

---

## NEXT PRIORITIES (in order)

1. **End-to-end workflow test** — manually walk: schedule → dispatch → operator accepts → in route → in progress → work performed → day complete → complete → invoice. Find and fix any broken steps.
2. **Mobile responsive audit** — all operator pages on 375px viewport. Especially: my-jobs list, job detail, work-performed, day-complete.
3. **Loading states & error handling** — pages that crash or show blank on bad API responses.
4. **Patriot-specific assets** — upload Patriot Concrete Cutting logo, set brand colors (they use red/black/white). Update `tenant_branding` in DB for their tenant.
5. **Reschedule notification** — when job date changes via PATCH, notify assigned operator (same pattern as job_cancelled notification).
6. **Production deployment prep** — Vercel env vars, custom domain, SSL, verify all Supabase RLS policies for production load.
7. **Merge `feature/schedule-board-v2` → `main`**

---

## KEY FILES REFERENCE

| Area | File |
|------|------|
| Schedule board | `app/dashboard/admin/schedule-board/page.tsx` |
| Job detail (admin) | `app/dashboard/admin/jobs/[id]/page.tsx` |
| Customer detail | `app/dashboard/admin/customers/[id]/page.tsx` |
| Customer API | `app/api/admin/customers/[id]/route.ts` |
| Job orders API | `app/api/admin/job-orders/[id]/route.ts` |
| Job detail aggregation API | `app/api/admin/jobs/[id]/detail/route.ts` |
| Change orders API | `app/api/admin/jobs/[id]/change-orders/route.ts` |
| Job history panel | `components/jobs/JobHistoryDetailPanel.tsx` |
| Change orders section | `components/jobs/ChangeOrdersSection.tsx` |
| Related jobs section | `components/jobs/RelatedJobsSection.tsx` |
| Cancel job modal | `app/dashboard/admin/schedule-board/_components/CancelJobModal.tsx` |
| Schedule form | `app/dashboard/admin/schedule-form/page.tsx` |
| Operator job detail | `app/dashboard/my-jobs/[id]/page.tsx` |
| RBAC cards | `lib/rbac.ts` |
| API auth helpers | `lib/api-auth.ts` |
| Supabase admin client | `lib/supabase-admin.ts` |

---

## IMPORTANT PATTERNS (for new Claude session)

- **Auth in API routes:** `requireAdmin(request)` → check `auth.authorized` → `getTenantId(auth.userId)`
- **Tenant scoping:** `if (tenantId) { query = query.eq('tenant_id', tenantId); }` — super_admin has null tenantId and sees all
- **Fire-and-forget logging:** `Promise.resolve(supabaseAdmin.from('...').insert(...)).catch(() => {})`
- **API response format:** `{ success: true, data: {...} }` or `{ error: 'message' }` with HTTP status
- **Client auth:** `getCurrentUser()` from `lib/auth.ts`, role check in useEffect, redirect to `/login` if null
- **Client fetching:** `apiFetch(url, opts)` helper that injects Bearer token from `supabase.auth.getSession()`
- **Job numbers:** `JOB-{year}-{6 digits}` (schedule form) or `QA-{year}-{6 digits}` (quick add / continuation)
- **Notifications:** Insert to `notifications` table with `type, title, message, job_id, user_id, tenant_id, priority, read: false`
- **Column gotcha:** `job_orders.customer_contact` (NOT `contact_name`), `job_orders.foreman_name` (site contact display name)

---

## DB QUICK REFERENCE

- **Supabase project:** `klatddoyncxidgqtcjnu`
- **Tenant ID for Patriot/demo:** `ee3d8081-cec2-47f3-ac23-bdc0bb2d142d`
- **Test customer ID:** `027ea971-8f34-4ad9-9fee-0e35441a88e8` (touch of tism construction, 2 jobs)
- **Migrations:** `supabase/migrations/` (70+ files)
- **RLS pattern:** `auth.jwt() -> 'user_metadata' ->> 'role'` for new tables
