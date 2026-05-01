# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** May 1, 2026 (DEMO-DAY SESSION — IN PROGRESS) | **Branch:** `claude/nice-borg-4ffe67` (pushed to origin) → merged to local `main` (~72 commits ahead of origin/main) | **Build Status:** PASSING ✅ | **DB:** Migrations `20260501_customer_survey_v2` and `20260501_notifications_invoice_metadata_idx` applied

---

## MAY 1, 2026 (PT 3) — Invoice Review Modal + RBAC + Salesperson Notifications + Completed-Jobs Polish

User request: hone the post-completion side. Five tasks bundled, dispatched 3 parallel agents in isolated worktrees, audited each diff, manually merged.

### What shipped

**Hydration fix on billing page**
- Outer invoice card was a `<button>` with inner action buttons (Mark Paid / View / Download). React 19 hydration error. Converted outer to `<div role="button">` with `tabIndex={0}` + `onKeyDown` for Enter/Space. Inner action buttons now sit cleanly inside.

**A — Completed Jobs detail polish** (Agent D — `app/dashboard/admin/completed-jobs/page.tsx`)
- View + Download buttons added to the Service Completion Signature block when `job_orders.completion_pdf_url` is set. Falls back to muted "PDF not available" when missing.
- New Completion Photos panel (responsive 2/3/4-col grid of operator-uploaded photos from `photo_urls`, hover ring + scale + count badge).
- Operator + Helper rows now include "View timecard →" links (`/dashboard/admin/timecards/operator/{id}`). Helper name fetched in `loadJobDetails`. Both rows colored chips (violet for operator, indigo for helper).
- 4 metric tiles upgraded from soft tints to vibrant gradients with white text + colored shadow rings: violet→indigo (Days Worked), cyan→sky (Total Hours), amber→orange (Standby Time), emerald→teal (Labor Cost).
- Documents and Operator Notes panels gained matching gradient accent stripes.

**B — Invoice Review & Confirm flow + RBAC** (Agent E)
- New API `app/api/admin/invoices/preview/route.ts` — POST `{ jobOrderId }` returns `{ job, operator_name, work_performed_summary, line_items, subtotal, default_due_date, default_po_number, default_notes }`. Mirrors the line-item builder from the create route without inserting. `work_performed_summary` is bullet-text built from `work_items` rows (truncated to ~120 chars per line, indented notes appended).
- `app/api/admin/invoices/route.ts` POST extended with optional `description_override` (string) and `line_items_override` (validated array). When override provided, replaces auto-built items + recomputes subtotal. Backwards-compatible.
- `app/dashboard/admin/billing/page.tsx`:
  - "Create Invoice" buttons on Ready-to-Bill cards now open a "Review & Confirm Invoice" modal (max-w-2xl, mobile-friendly, sticky header/footer, scrollable body).
  - Modal shows: customer/job/billing-type/due-date grid, "Work Performed by Operator (X)" panel rendering `work_performed_summary` in mono `whitespace-pre-wrap`, editable line-items table (qty/unit/rate inline number+text inputs, per-row "Edit Description" textarea toggle), live subtotal recompute on edits, "Use Operator's Description" button (copies summary into first line item), Cancel + Submit Invoice actions.
  - On submit POSTs `/api/admin/invoices` with `{ jobOrderId, line_items_override }`. Switches to All Invoices tab + success toast.
- **RBAC**: `salesman` role added to `allowedRoles` page guard. Server-side filter on GET `/api/admin/invoices` (`.eq('created_by', auth.userId)` when `auth.role === 'salesman'`). Server-side guard on `/api/admin/invoices/preview` (404 if salesman doesn't own the job). Client-side filter on Ready-to-Bill query for salesman. Admin/super_admin/operations_manager unchanged.
- "Submitted by: {name}" chips added to invoice cards and ready-to-bill cards. Bulk profile lookup cached in `profilesById` state on data load.

**C — Salesperson notifications + 30-day unpaid reminder** (Agent F)
- New `lib/notify-salesperson.ts` — fire-and-forget helper exporting `notifySalesperson({ event, jobOrderId?, invoiceId?, recipientUserId, tenantId?, subjectName?, customerName? })`. Inserts into `public.notifications` (sender_id null = system event) and best-effort emails the user via `auth.users.email` lookup + `lib/email.ts`. Five events:
  - `job_active` — job → `in_progress`
  - `job_completed` — job → `completed`
  - `invoice_ready` — invoice created from completed job
  - `invoice_paid` — invoice → `paid`
  - `invoice_unpaid_30d` — 30-day reminder
- Triggered from:
  - `app/api/job-orders/[id]/status/route.ts` — fires `job_active` / `job_completed` to job's `created_by` on transition.
  - `app/api/admin/invoices/route.ts` POST — fires `invoice_ready` to job's `created_by` (the salesperson who scheduled the work, not whoever created the invoice).
  - `app/api/admin/invoices/[id]/mark-paid/route.ts` PATCH — fires `invoice_paid` via `invoice_line_items.job_order_id → job.created_by`, falls back to `invoices.created_by`.
- New cron route `app/api/cron/invoice-30d-reminders/route.ts` — auth via `Authorization: Bearer ${CRON_SECRET}` env (falls back to `requireAdmin` for manual testing). Scans `invoices` where `status IN ('sent','overdue','partial')` AND `balance_due > 0` AND `invoice_date <= NOW() - 30 days`. Dedupes on 7-day window via `metadata->>invoiceId`. Fires `invoice_unpaid_30d` for each.
- New migration `supabase/migrations/20260501_notifications_invoice_metadata_idx.sql` — partial index `idx_notifications_invoice_unpaid_30d` on `(user_id, type, created_at DESC)` filtered to `type = 'invoice_unpaid_30d'` for fast dedupe. **Applied via MCP**.

**D — Analytics YTD revenue (no work needed)**
- `/api/admin/analytics` already filters invoices by `status === 'paid'` and sums `total_amount` for `revenueYTD`. Dashboard reads this on every load → auto-updates as soon as Mark Paid succeeds. Verified, no changes required.

### Merge ordering + manual conflict resolution
- Agent D: clean patch apply.
- Agent F: applied edits + lib + cron + migration cleanly. The agent's worktree was based on `main` and didn't see the existing PATCH `mark-paid` route, so it created a parallel POST handler instead. **Skipped** that file; manually inserted `invoice_paid` notification logic into the existing PATCH handler (line_items lookup → job.created_by → notifySalesperson, fire-and-forget).
- Agent E: 7 of 8 hunks on billing page applied via `git apply`; the auth-guard hunk failed due to overlap with my hydration-fix line numbers. **Manually added** `salesman` to `allowedRoles` and the new state hooks (`profilesById`, `reviewJobId`, `reviewLoading`, `reviewError`, `reviewData`, `editLineItems`, `editingDescIdx`, `submittingReview`). Build then passed.

### Verification
- `npm run build` PASS (0 errors). New routes in manifest: `/api/admin/invoices/preview`, `/api/cron/invoice-30d-reminders`.
- Migration applied + verified live.
- Pre-commit type-check passed.

### Commits on `main` (LOCAL — pushed to origin/claude/nice-borg-4ffe67, NOT to origin/main)
```
1a0c04a2  feat: invoice review modal + RBAC + salesperson notifications + completed-jobs polish
3e80a747  feat: customer survey + admin photos + vibrant CTAs + PDF email
```

### Pending follow-ups for next session
- Test the salesman RBAC flow with a real salesman-role user — confirm they see only own invoices/jobs.
- Wire the cron route to a real scheduler (Vercel Cron / GH Action) — currently manual-trigger only.
- Consider adding `invoice_paid` notification to the existing `/api/admin/invoices/[id]/payment/route.ts` (the payment-ledger handler) and `/api/admin/invoices/[id]/route.ts` PATCH for completeness — currently only the lightweight Mark Paid PATCH dispatches.
- The Review & Confirm modal currently doesn't surface `survey` data, photos, or scope_details. If invoice description should be auto-populated from richer sources, extend `work_performed_summary` builder.
- Add a "View Invoice" or "Edit Invoice" page route (currently invoice details are loaded into a modal in `viewInvoice` — fine for now, but admins might want a full page).

---

## MAY 1, 2026 (PT 2) — Customer Survey + Admin Photos + Vibrant Day-Complete UI + PDF Email

User request was 4 things touching the customer-facing completion flow. Dispatched 3 parallel agents in isolated worktrees, audited each diff, then merged into `claude/nice-borg-4ffe67`.

### What shipped

**A — Operator photos visible to admin** (Agent A)
- `app/api/admin/jobs/[id]/summary/route.ts` — additively returns `photos` array (`job_orders.photo_urls`).
- `app/dashboard/admin/jobs/[id]/page.tsx` — new "Job Photos" panel rendered between Daily Progress and Activity Log. Responsive 2/3/4-col grid of `<a target=_blank>` thumbnails with hover ring shift, scale, gradient overlay, count badge, empty-state.

**B — Customer satisfaction survey infrastructure** (Agent B)
- Migration `supabase/migrations/20260501_customer_survey_v2.sql` (applied via MCP, verified live): adds `operator_feedback_notes`, `likely_to_use_again_rating` (1-10 NPS w/ CHECK), `customer_email`, `delivered_to` to `customer_surveys`.
- New `components/CustomerSatisfactionSurvey.tsx` — shared between on-site and remote flows. Two 5-star widgets (cleanliness, communication), NPS 1-10 chip selector (rose 1-6 / amber 7-8 / emerald 9-10), free-text operator notes, radio toggle "send to contact-on-site phone (default)" vs "send to my email", security disclaimer pill, purple→indigo submit. Variant prop `'light' | 'public'`.
- New `app/api/job-orders/[id]/customer-survey/route.ts` — POST for on-site flow. Auth + tenant scope. Inserts row, computes `overall_rating` as round(avg). Fire-and-forget SMS to `site_contact_phone` OR email if `send_to_email`. Updates operator running averages.
- `app/api/public/signature/[token]/route.ts` — survey block extended additively to accept new v2 fields. Same SMS/email dispatch.
- `app/sign/[token]/page.tsx` — replaced inline survey block with `<CustomerSatisfactionSurvey variant="public" />`. Removed legacy `surveyClean/surveyComm/surveyOverall/wouldRecommend/feedbackText` state and inline `StarRating` helper.

**SECURITY note (Agent B):** business rule explicitly enforced — survey results **always** go to the job's `site_contact_phone` OR the customer's own email (radio choice). NEVER the operator's device. Prevents operators from filling out their own surveys to inflate ratings. Visible disclaimer pill in the UI.

**C — Day-complete UI overhaul + PDF email** (Agent C)
- `app/dashboard/job-schedule/[id]/day-complete/page.tsx`:
  - Vibrant CTA gradients replace pale tints: amber→orange (Done for Today), emerald→teal (Complete Job — Get Signature On Site), indigo→violet→purple (Send Completion Link). White text + white/translucent icon circles + colored shadow rings.
  - New Customer Email field on signature view (Mail icon, optional, sends PDF receipt).
  - New violet→indigo branded "Thank you for choosing Patriot Concrete Cutting" callout above the existing PDF notice.
  - New survey screen between signature submission and Job Complete success card. Survey only fires on the on-site Complete Job path; Done-for-Today and Send Completion Link paths unchanged. Skip-survey link bypasses save.
  - Success card now shows "Thanks for your feedback ✓" violet badge when survey was submitted.
- `app/api/job-orders/[id]/generate-completion-pdf/route.ts` — accepts new optional `customer_email` and `reference_photo_urls`. After PDF upload, fire-and-forget thank-you email via Resend with PDF attached as base64 + branded HTML body featuring up to 6 inline reference photos in a 3-col grid.
- `lib/email.ts` — backwards-compatible: added optional `attachments?: EmailAttachment[]` to `EmailOptions`. Passed through to Resend payload only when present.

### Merge ordering
Agent A merged manually (Edit tool — line numbers had drifted between agent's main-based worktree and parent session). Agents B + C patches applied via `git apply` after Agent A's edits stabilized line numbers. Conflict-free.

### Commits on `main` (LOCAL — pushed to origin/claude/nice-borg-4ffe67, NOT to origin/main)
```
3e80a747  feat: customer survey + admin photos + vibrant CTAs + PDF email
```

### Database migration applied
`20260501_customer_survey_v2` — verified live via `information_schema.columns` query. All 4 new columns present.

### Verification
- `npm run build` PASS, 0 errors. Both `/api/job-orders/[id]/customer-survey` and `/api/admin/jobs/[id]/summary` rebuilt.
- Migration applied to live DB.
- Pre-commit type-check passed.

### Known issues — still acknowledged (NOT blocking demo)
- Cross-tab session bleed → wrong-dashboard redirects (multi-tab Supabase auth). Workaround: one role per browser/tab during demo.
- Start-In-Route latency (cosmetic).

### Pending follow-ups for next session
- Survey results — currently dispatched fire-and-forget; consider an admin "view all surveys" page once data accumulates.
- Survey UI on the public sign page hasn't been hand-tested in browser yet — variant="public" path needs eyes during demo.
- Operator-uploaded photos lightbox — currently opens in new tab; could be upgraded to inline modal viewer if desired.
- Apply same vibrant gradient style to other operator workflow pages (in-route, jobsite, work-performed CTAs) for consistency.

---

## MAY 1, 2026 — Demo-Day Bug Fixes: Data-Flow Bridges (Operator → Admin Visibility)

User is running through the demo flow live. Issues surface, get fixed in flight. New rule from user this session: **after each task completed, update CLAUDE_HANDOFF.md (and CLAUDE.md sprint backlog if relevant)**. Going forward this is the persistent workflow.

### Bugs fixed this session

**CRITICAL data-integrity (operator submissions invisible to admin):**

1. **Operator's Work Performed → admin's Job Scope & Progress** — operator submissions via `work_items` table were not appearing in admin's Daily Activity / Job Scope & Progress. `/api/admin/jobs/[id]/summary` only read from `job_progress_entries`. Fix: route now reads BOTH tables, merges by date into `progress.by_date`, tags work_items entries with `source: 'work_items'`. Quantity intelligently picks `core_quantity` (cores) → `linear_feet_cut` (LF) → `quantity` (raw) so admin sees the meaningful number. Scope-progress percentages still driven only by `job_progress_entries` to avoid inflating %.
2. **Per-area overcut + cross-cut not on operator ticket** — sawing calculator inputs (overcut state, cross-cut spacing, total linear-ft) were not surfaced on the operator's ticket. Fixed in `components/ScopeDetailsDisplay.tsx` — each sawing area now renders an overcut state pill, cross-cut pill (if set), and total-linear-ft pill with breakdown subtitle "(perimeter X + cross-cuts Y)". Section grand-total LF appended below.
3. **Custom-added equipment ("5000 DFS") missing from operator ticket** — `UnifiedEquipmentPanel`'s filter was dropping custom items added in `equipment_needed`. Fixed in `app/dashboard/my-jobs/[id]/page.tsx` — new sky-themed "Additional / Custom Equipment" sub-card surfaces custom entries below the unified list.
4. **Material removal details (method + equipment used) not on operator ticket** — only method was rendering. `ScopeDetailsDisplay.tsx` now renders 2-column grid of every populated field from `scope_details._removal`: method, equipment list (forklift/skidsteer/lull/dingo/sherpa/mini_excavator), forward-compat `dumpster_size` / `responsible_party` / `what` slots.

### Known issues — acknowledged, deferred (NOT blocking demo)

- **Cross-tab session bleed → wrong-dashboard redirects.** When user clicks "Active Jobs" or "Arrived On Jobsite", clicking sometimes redirects to operator dashboard. Root cause: multi-tab Supabase auth — localStorage `sb-*-auth-token` is shared across tabs, so logging in as Operator in one tab silently flips the salesman/admin tab's session. `getCurrentUser()` reads stale `supabase-user` cache, role guards trigger redirect. Proper fix: `useAuthUser` retrofit on every role-guarded page (already exists at `lib/hooks/useAuthUser.ts` — partially adopted in April 27 session). Too risky to land mid-demo. **Workaround for demo:** one role per browser/tab.
- **Start In Route → next-page latency.** User confirmed admin side reflects status correctly, just visual delay. Cosmetic.

### Agents dispatched this session (both merged + pushed)

| Agent | Scope | Outcome |
|---|---|---|
| Agent A — work_items bridge | `app/api/admin/jobs/[id]/summary/route.ts` only — merge `work_items` into `progress.by_date` | Single file, additive only. Merged. |
| Agent B — operator ticket display | `components/ScopeDetailsDisplay.tsx` + `app/dashboard/my-jobs/[id]/page.tsx` — overcut/cross-cut pills, custom equipment sub-card, material removal grid | Two frontend files, no API/auth/lib changes. Merged. |

Both agents received guardrails: no `app/api/**` (except the explicitly named summary route), no `lib/supabase*`, no `lib/api-auth*`, no `middleware.ts`, no `package.json`, no migrations. Diffs audited before merge.

### Commits on `main` (LOCAL — verify push state before next session)

```
f55150ea  Merge: data-flow fixes (work_items bridge, overcut + custom equipment + removal details on ticket)
ac96a221  Merge: surface overcut + custom equipment + material removal details on operator ticket
d5af99e6  fix: surface overcut/cross-cut, custom equipment, and removal details on operator ticket
be09c997  Merge: bridge operator work_items into admin Job Scope & Progress
9ee95310  Merge: bridge work_items into admin Job Scope & Progress summary
29d8ca82  fix: bridge operator work_items into admin Job Scope & Progress summary
```

### Pending follow-ups (from this session)

- **Cross-tab session bleed fix** — retrofit remaining role-guarded admin pages onto `useAuthUser` hook (pages still using legacy `getCurrentUser()` localStorage path). Post-demo priority.
- **Start In Route latency** — investigate why operator-side transition feels slow despite admin reflecting status correctly. Likely a router push timing issue.
- **Apply same per-area cross-cut calculator to operator's Work Performed page** (carryover from Apr 30 — still admin-side only).

---

## APRIL 30, 2026 (PT 4) — Pre-Demo Hardening: 4 Bug Fixes + Sawing Cross-Cut Calculator

User has a software demo tomorrow and is walking the full create-job → completion flow. Issues are surfacing in real time; this session shipped them as they came up.

### Bug fixes shipped (5 total in this session)
1. **React duplicate-key crash on contact picker** — when two records shared a display name (e.g., two "John Test"), `<li key={option.value}>` collided. Fixed at [components/SmartCombobox.tsx:293](components/SmartCombobox.tsx:293) — composite key `${value}-${idx}`.
2. **`ContactCombobox` data-layer dedupe** — same component now collapses options by case-insensitive trimmed name BEFORE rendering. Most-informative entry wins (scored on phone+email+job_count). Eliminates the dup-name issue at the source.
3. **Super admin / operations_manager bypass approval gate** — `/api/admin/schedule-form` now creates jobs with `status='scheduled'` directly for those roles. Salesmen and admins still go through `pending_approval`.
4. **New Job button perceived latency** — `<button onClick=router.push>` → `<Link href prefetch>`. Next.js now prefetches the schedule-form chunk on hover/viewport so click feels instant.

### Schedule form Sawing Calculator (DFS / EFS / HHS-PS)
This is the genuine differentiator the user called out. Captures real-world cross-cut + overcut requirements and auto-computes total linear feet.

**Per-area inputs added** (in "Areas + Thickness" mode for DFS, EFS, HHS/PS):
- "Overcut allowed" toggle (per area, falls back to top-level `form.overcutting_allowed`)
- "Cross-cut every X ft length-wise" (number)
- "Cross-cut every Y ft width-wise" (number)

**Pure helper** `computeSawingAreaLinearFt(area)` at [app/dashboard/admin/schedule-form/page.tsx:209-256](app/dashboard/admin/schedule-form/page.tsx:209) computes:
```
perimeter      = 2 × (length + width)
lengthwiseCuts = max(0, floor(length / lengthSpacing) - 1)
widthwiseCuts  = max(0, floor(width  / widthSpacing)  - 1)
crossCutLength = (lengthwiseCuts × width) + (widthwiseCuts × length)
linearFt       = (perimeter × (overcut ? 1 : 2) + crossCutLength) × qty
```

**Verified scenarios:**
| Scenario | Inputs | Result |
|---|---|---|
| User example | 10×10, qty 1, 2/2 spacing, overcut=true | 40 + 80 = **120 lf** ✓ |
| Plain perimeter | 20×8, qty 1, no spacing, overcut=true | **56 lf** |
| No-overcut doubles perimeter | 20×8, qty 1, no spacing, overcut=false | **112 lf** |
| Quantity scales | 12×6, qty 2, 3/3 spacing, overcut=true | (36 + 30) × 2 = **132 lf** |
| Combined | 15×10, qty 1, 5/5 spacing, overcut=false | 100 + 35 = **135 lf** |
| Empty fields | length blank | shows `— linear ft` (returns null, no error) |

**Persistence**: new keys live inside the existing `scope_details[code].areas` JSONB array. No backend route or migration needed — Postgres jsonb absorbs them.

**Per-area total** displayed inline as a sky pill (with breakdown tooltip). **Section grand total** appended below the existing "TOTAL: NNN sq ft" line.

### Team manifest — agents dispatched this session
Scope discipline: every agent received a strict guardrail list (no `app/api/**` for non-security work, no `lib/supabase*` / `lib/api-auth*` / `middleware.ts` / `package.json` / migrations). I independently audited each diff before merge.

| Agent | Scope | Outcome |
|---|---|---|
| Track A (sales tiles) | Salesman dashboard 4 tiles → 3 (Active / Quoted MTD / Expected Commission); scoping audit | Merged |
| Track B (admin invoicing UI) | Mark Paid button + modal, commission % chip on job detail, default rate input on team profiles | Merged |
| Track C (workflow audit) | Read-only research → [WORKFLOW_AUDIT.md](WORKFLOW_AUDIT.md) (378 lines, 9 critical / 14 important / 7 polish) | Merged |
| Track D (security fixes) | 9 critical findings from Track C — agent stalled mid-task; **completed manually** | Merged |
| Track E (sawing calculator) | Per-area overcut + cross-cuts + auto linear-ft on DFS/EFS/HHS+PS | Merged |
| (manual) | SmartCombobox composite key + dedupe; super_admin bypass approval; New Job prefetch | Merged |

### Commits on `main` (LOCAL — NOT pushed to origin)
```
67ced6b1  feat: schedule form sawing calculator — per-area overcut, cross-cuts, auto linear-ft
11d8f8dd  fix: dedupe ContactCombobox options at the data layer
830f8d31  fix: 3 testing-blockers — duplicate React key, super_admin approval skip, New Job prefetch
88c4de72  fix: 9 critical workflow audit findings (security + correctness)
04b2880e  docs: end-to-end workflow + security audit
dd1e4bcc  feat: admin Mark Paid + commission rate editors
fbc36a27  feat: simplify salesman dashboard tiles
```

### Database state
Wiped via Supabase MCP earlier this session. Single seed customer remaining: Patriot Test GC (id `a2cb81e6-790a-48f1-aba6-ac979c29de96`). 8 profiles preserved. All transactional tables zeroed.

### Pending follow-ups (from WORKFLOW_AUDIT.md "Important")
- Audit-log writes on status transitions, work-items, completion approvals, invoice events, signature submission
- Wrap `work_items` delete-then-insert in transaction or UPSERT
- Optimistic concurrency on payment recording (`.eq('balance_due', currentBalance)`)
- DB-level `tenant_id NOT NULL` migration (API guards now in place; constraint is a future migration)
- IP rate limit on `POST /api/public/signature/[token]`
- Drop `'supervisor'` from inline admin role lists; align reject vs approve role guards
- Apply the same per-area cross-cut calculator to operator's Work Performed page (currently schedule-form only — admin-side estimation)

---

## APRIL 30, 2026 (LATE SESSION) — Sales Polish + Workflow Audit + 9 Security Fixes + DB Reset

### What shipped
- **Track A** — Salesman dashboard tiles trimmed 4→3 (Active / Quoted MTD / Expected Commission). "Showing your jobs only" hint.
- **Track B** — Admin "Mark Paid" button + modal on billing list. Commission rate inline editor on job detail. Default rate input on team-profiles.
- **Track C** — End-to-end workflow + security audit doc: [WORKFLOW_AUDIT.md](WORKFLOW_AUDIT.md) (378 lines). 9 critical, 14 important, 7 polish.
- **Track D** — 9 critical security/correctness fixes (Track D agent stalled mid-task; completed manually):
  1. Tenant filter on `/api/admin/job-orders/[id]/resubmit`
  2. Tenant filter on `/api/job-orders/[id]/work-items`
  3. Tenant filter on `/api/admin/schedule-board/assign` multi-day SELECT
  4. Tenant filter on `/api/timecard/clock-in` NFC tag lookup
  5. Status state machine — `LEGAL_TRANSITIONS` map; `cancelled`/`archived` admin-only
  6. Signature `expires_at = NOW() + 7 days`; URL from `NEXT_PUBLIC_APP_URL` || `request.nextUrl.origin` (no host-header injection)
  7. `daily_log.hours_worked` reads from `timecards.total_hours` first
  8. Payment receipt sender uses `tenant_branding.company_name`
  9. Reject `tenant_id=null` on 4 creation paths (legacy quick-add wasn't writing tenant_id at all)

### Database wiped to clean slate
Executed via Supabase MCP. All 35+ transactional tables zeroed: `job_orders`, `invoices`, `invoice_line_items`, `payments`, `timecards`, `daily_job_logs`, `job_progress_entries`, `job_scope_items`, `job_completion_requests`, `job_notes`, `standby_logs`, `work_items`, `notifications`, `audit_logs`, `operator_time_off`, `change_orders`, `signature_requests`, `schedule_change_requests`, etc.

**Preserved**: `tenants` (1), `tenant_branding` (1), `profiles` (8), `operator_badges`, NFC tags, schedule contacts, role permissions, feature flags. **Seed**: Patriot Test GC customer (id `a2cb81e6-790a-48f1-aba6-ac979c29de96`). `operator_pto_balance` zeroed.

### Pending follow-ups (deferred — see WORKFLOW_AUDIT.md)
- Audit log on status transitions, work-items, daily-log, completion-request, invoice create/send/void/PATCH, signature submission
- Wrap `work_items` delete-then-insert in transaction or UPSERT
- Optimistic concurrency on payment recording
- DB-level `tenant_id NOT NULL` migration (API-level guards in place; DB constraint is a future migration)
- IP rate limit on public signature endpoint
- Drop `'supervisor'` from inline admin role lists

---

---

## APRIL 30, 2026 SESSION (PT 2) — Performance Optimization Pass

### Goal
Cut First Load JS across the heaviest pages WITHOUT touching logic, backend, auth, or behavior. Strict guardrails enforced per track.

### Three parallel tracks (all merged, all build-clean, behavior identical)

#### Track A — schedule-board + admin dashboard
- `app/dashboard/admin/schedule-board/page.tsx` — 14 conditionally-rendered modals/views moved from eager to dynamic imports: ApprovalModal, MissingInfoModal, AssignOperatorModal, EditJobPanel, ChangeRequestModal, NotesDrawer, QuickAddModal, ConflictModal, JobDetailView, OperatorRowView, CrewScheduleGrid, CancelJobModal, MarkOutModal, PendingQueueSidebar. All gated behind `useState(false)` flags.
- `app/dashboard/admin/page.tsx` — AdminOnboardingTour now dynamic (only mounts for demo admins). Renamed import to `nextDynamic` to avoid collision with `export const dynamic = 'force-dynamic'` route segment config.

#### Track B — jobs/[id] + work-performed
- `app/dashboard/admin/jobs/[id]/page.tsx` — `JobScopePanel`, `JobProgressChart`, and `EditScheduleModal` now dynamic imports. Inline `EditScheduleModal` (130 lines) extracted to its own file `_components/EditScheduleModal.tsx` (verbatim — same fetch URL `/api/admin/jobs/[id]/schedule`, same props, same logic).
- `app/dashboard/job-schedule/[id]/work-performed/page.tsx` — `EquipmentUsageForm`, `RecommendedItems`, `PhotoUploader`, `VoiceMemoNotes` now dynamic. 11 pure helper predicates (`requiresDetailedData`, `isCoreDrilling`, `isSawing`, `isHandSaw`, `isSlabSaw`, `isWallSaw`, `isChainsaw`, `isBreakAndRemove`, `isJackHammering`, `isChipping`, `isBrokk`) hoisted from component body to top-level module scope (avoids re-creation on every render).

#### Track C — schedule-form + my-jobs/[id] + bundle audit
- `app/dashboard/admin/schedule-form/page.tsx` — `AISmartFillModal` (framer-motion-heavy) and `CustomerForm` (Google-Maps-using dialog) now dynamic. Both gated behind `show*` state flags.
- `app/dashboard/my-jobs/[id]/page.tsx` — `HelperWorkLog` now dynamic (only renders when `jobIsHelper === true`, i.e., apprentice role only — majority of operators never load this code).
- Bundle audit performed: `@react-pdf/renderer` confirmed server-only (API routes); `framer-motion` extracted via AISmartFillModal lazy-load; `recharts` left eager (analytics-only); `@react-google-maps/api` left as-is (mounted in app/layout.tsx provider). `react-grid-layout`, `react-signature-canvas`, `jspdf`, `html2canvas`, `qrcode`, `@zxing/library` confirmed already tree-shaken (no eager client imports).

### Final First Load JS reductions

| Page | Before | After | Δ |
|------|--------|-------|---|
| `/dashboard/admin/jobs/[id]` | 275 kB | **173 kB** | **-102 kB** |
| `/dashboard/admin` | 217 kB | **173 kB** | **-44 kB** |
| `/dashboard/admin/schedule-form` | 273 kB | **235 kB** | **-38 kB** |
| `/dashboard/admin/schedule-board` | 242 kB | **204 kB** | **-38 kB** |
| `/dashboard/job-schedule/[id]/work-performed` | 221 kB | **215 kB** | **-6 kB** |

**Total: ~228 kB First Load JS removed across 5 heaviest pages.**

### Hard guardrails enforced (every agent self-audited 10 questions, all answered "no"; I independently verified diffs before merging)
- ❌ NO modifications to `app/api/**`, `lib/supabase*`, `lib/api-auth*`, `lib/api-client*`, `middleware.ts`, `.env*`, `package.json`, `package-lock.json`, migrations, SQL
- ❌ NO renaming exports, props, state vars, or function signatures
- ❌ NO changes to fetch URLs, request bodies, response handling, error handling
- ❌ NO removal of features, modals, panels, fields, conditional renders
- ❌ NO changes to useState initial values, useEffect deps (beyond lint required), hook ordering
- ❌ NO copy/label/auth-guard changes
- ❌ NO new dependencies; NO removed dependencies

### Bug caught and fixed during audit
Track A's first revision had a name collision: `import dynamic from 'next/dynamic'` clashed with the file's `export const dynamic = 'force-dynamic'` route segment config (causing build failure on `app/dashboard/admin/page.tsx`). Fixed by renaming to `nextDynamic`. Tracks B and C used aliases proactively (`dynamicImport`, `nextDynamic`) — no collisions.

### Commits on `main` (LOCAL — NOT pushed)
```
[merge] perf — dynamic imports + bundle splits (3 parallel tracks)
154dafe2  perf: dynamic-import heavy modals and memoize lists on jobs/[id] and work-performed (Track B)
0c525c71  perf: dynamic-import multi-step form sections, my-jobs modals, and heavy lib boundaries (Track C)
9eaa3d39  perf: dynamic-import heavy modals on schedule-board and admin dashboard (Track A)
```

### Behavior verification
- All 3 builds passing with 0 errors
- E2E flows from prior sessions still pass logically (no fetch URLs changed)
- Visible UI for all state paths unchanged (lazy components have identical default-export shape and props)
- Loading placeholders are either invisible (`loading: () => null`) or match the existing skeleton aesthetic (animated pulse blocks)

### Known minor consideration
On first cold render of admin job detail page, JobScopePanel and JobProgressChart will show a brief skeleton placeholder while their chunks download. Subsequent navigations within the session use cached chunks — instant. This is the trade-off for -102 kB First Load.

---

---

## APRIL 30, 2026 SESSION — Active-Jobs Filter, Real-Time Draft, Back-Nav, Survey Redesign

### Four-issue fix shipped (3 parallel tracks + 2 follow-up bug fixes)

#### Issue 1 — Hide pending_approval from Active Jobs
- `app/api/admin/active-jobs/route.ts` — added `pending_approval` to the excluded status set: `not('status', 'in', '("completed","cancelled","archived","pending_approval")')`.
- Active-jobs-summary route already used a whitelist (`['assigned','in_route','on_site','in_progress']`), so it was already correctly excluding pending_approval.

#### Issue 2 — Real-time draft transparency
- `app/api/admin/jobs/[id]/live-status/route.ts` extended with `draft_work_performed: { items, notes, updated_at, source } | null`.
- Pulls from `daily_job_logs.work_performed_draft` jsonb for the operator's row on today's date. Picks the most recently edited row (operator vs helper) that has actual items.
- `app/dashboard/admin/jobs/[id]/page.tsx` — new pulsing violet "Draft in progress" pill on the Live Status panel showing typed item chips with quantities + "edited Xs ago".

#### Issue 3 — Work-performed back-nav data loss
- `handleSubmit` no longer clears the draft on the Next button. Drafts survive navigation away and back.
- Auto-save debounce reduced **2000ms → 500ms** for near-real-time admin transparency.
- Mount fallback: if no draft exists in DB or localStorage, GET `/api/job-orders/[id]/work-history` and hydrate the form from today's submitted work_items (highest day_number rows). User who already submitted can re-edit on Back-button return.

#### Issue 4 — Job Survey UI redesign
- Full visual rewrite preserving all state, logic, localStorage keys, equipment categories, and submit flow.
- Gradient violet→indigo header accent stripe, sticky header with back/home/dark-mode buttons.
- Progress indicator: "X / Y sections" + gradient fill bar driven by `useMemo` over completeness.
- Helper Rating: 10 buttons in `grid-cols-5`, color-coded selection (rose 1-2, amber 3-5, emerald 6-10).
- Equipment Details: lucide thumbnails per category (Drill / Scissors / Cable etc.); per-category card with tone-coded accent (violet/sky/amber/rose/teal/indigo).
- Segmented Yes/No and Water Source buttons with Droplets/Truck icons, all `min-h-[44px]` (iOS guideline preserved from session 2 mobile audit).
- Summary review card before submit + emerald-gradient submit button with `CheckCircle` icon.

### Two follow-up bug fixes (caught during E2E test)
- `daily_job_logs` has NO `updated_at` column — only `created_at` and `work_performed_draft_updated_at`.
  - Live-status query was selecting `updated_at` → silently returned null draft → admin pill never appeared.
  - PUT `/work-performed-draft` was writing `updated_at: now` → every draft save returned 500.
  - Both fixed: live-status now uses `work_performed_draft_updated_at` (with `created_at` fallback). PUT route stripped the bogus column write.

### E2E verification (against running localhost:3000 with magic-link minted tokens)
- ✅ Operator PUTs draft → 200 (no more 500)
- ✅ Admin GET live-status sees the draft with 2 items, correct source='operator', fresh updated_at
- ✅ Operator updates draft → admin sees the UPDATED draft (1 item, qty 15)
- ✅ Operator clears draft (PUT null) → 200; admin sees `draft_work_performed: null`
- ✅ Active-jobs returns 1 job (in_progress only); pending_approval WS/TS correctly excluded
- ✅ Build passes; pre-commit TypeScript check green

### Commits on `main` (LOCAL — NOT pushed)
```
a31bd3b4  fix: live-status draft query and work-performed-draft PUT use real column names
1c4d36fc  feat: hide pending_approval jobs + real-time draft transparency for admins
[merge]   Track C — job survey redesign
[merge]   Track B — work-performed back-nav fix
b77b90cb  fix: persist work-performed draft across back-navigation; hydrate from submitted items when draft empty
cfc35bb9  feat: redesign job survey page UI for operators
```

### Known follow-up
- `day-complete` page submission does NOT yet clear `daily_job_logs.work_performed_draft` after final submit. Track B left a TODO. Without it, drafts orphan after day-complete (not user-visible — fallback hydration logic uses `max(day_number)` to surface only today's items). Address when next touching day-complete.

---

---

## APRIL 28, 2026 SESSION (PT 3) — Sales Scoping + Commissions Dashboard

### Three parallel tracks shipped (all merged, all build-clean, all E2E-tested)

#### Track A — Server-enforced active-jobs role scoping
- `app/api/admin/active-jobs/route.ts` and `app/api/admin/active-jobs-summary/route.ts`
- Salesmen can ONLY see jobs they created (`created_by = userId`). Server enforces regardless of `?mine` flag.
- Full admins (`super_admin`, `operations_manager`, `admin`) see all tenant jobs by default; can opt into `?mine=true` for their own.
- Response now includes `scope: { is_scoped, role, scoped_to_user }` so the UI can render appropriate copy.
- Active-jobs-summary aligned with the same scoping logic — counts no longer leak across salesmen.

#### Track B — Sales dashboard backend
- New `GET /api/sales/dashboard` — returns `{ user, quoted (mtd/ytd/last_month/trend_pct), jobs (active/completed/total counts), commissions (pending/earned_mtd/earned_ytd/breakdown[]) }`. Self-scoped; super_admin can pass `?userId=`.
- New `PATCH /api/admin/invoices/[id]/mark-paid` — admin-only. Updates `amount_paid`, `paid_at`, `paid_by`, `balance_due`, `status` (paid/partial). Audit-logged.
- New `PATCH /api/admin/jobs/[id]/commission-rate` — admin-only. Validates 0–100. Audit-logged.
- New `PATCH /api/profile/commission-rate-default` — self-update; admins can target via `?userId=`. Validates 0–100.
- Invoice → job linkage flows through `invoice_line_items.job_order_id` (no `job_id` direct column on invoices). Multi-job invoices are distributed proportionally by line-item amount share.

#### Track C — Salesman dashboard UI + scoped active-jobs UI + per-job % progress
- `app/dashboard/admin/page.tsx` — when `role === 'salesman'`, page short-circuits to a sales-specific layout: 4 KPI tiles (Active / Quoted MTD / Pending Commissions / Earned MTD), Commissions card, quick actions. Other roles untouched.
- New `components/CommissionsCard.tsx` — gradient card with editable default rate, 3 stat tiles, desktop table / mobile cards breakdown by job, status badges (Earned / Pending / No invoice), empty state.
- `app/dashboard/admin/active-jobs/page.tsx` — reads new `scope.is_scoped` from the API. When scoped: header subtitle becomes "My active jobs", top-right badge sky "My Jobs" (instead of violet "Showing All"), empty-state copy adapts. Salesmen see no toggle button.
- Per-job % complete progress bar on each card — lazy fetches `/api/admin/jobs/[id]/summary` with concurrency 3. Thin emerald bar, "X% complete" label.

### Schema added (Supabase MCP applied)
Migration `20260428_commission_and_paid_invoice_fields`:
- `profiles.commission_rate_default numeric(5,2) DEFAULT 0`
- `job_orders.commission_rate numeric(5,2) NULL` (per-job override)
- `invoices.paid_at timestamptz`, `invoices.paid_by uuid REFERENCES profiles(id)`
- Indexes: `invoices_paid_at_idx`, `job_orders_created_by_active_idx` (partial)

### E2E verification (against running localhost:3000 with magic-link minted tokens)
- ✅ Salesman GET `/active-jobs` → returns ONLY their 2 jobs, `is_scoped: true`
- ✅ Super Admin GET `/active-jobs` → returns all jobs, `is_scoped: false`
- ✅ Super Admin GET `/active-jobs?mine=true` → returns 0 jobs (correctly scoped to super_admin's own)
- ✅ Salesman GET `/api/sales/dashboard` → 200, full payload populated
- ✅ Salesman PATCH `/api/profile/commission-rate-default` (rate 7.5) → 200, persisted
- ✅ Super Admin PATCH `/api/admin/jobs/.../commission-rate` (rate 10) → 200, persisted
- ✅ Validation: rate=150 → 400
- ✅ Authorization: salesman trying to PATCH job commission-rate → 403
- Test artifacts (test rates) rolled back to clean state

### Commits on `main` (LOCAL — NOT pushed to origin yet)
```
d9ee644f  feat: sales dashboard endpoints — quoted revenue, commissions, mark-paid
54d6c455  feat: server-enforced role scoping on active-jobs endpoint
2ee40e75  feat: salesman dashboard — quoted MTD, commissions card, scoped active jobs UI, % progress
```

### Pending follow-ups (deferred from Track C)
- **Mark Paid button on invoice list page** ([app/dashboard/admin/billing/page.tsx](app/dashboard/admin/billing/page.tsx)) — backend ready (PATCH `/api/admin/invoices/[id]/mark-paid`), UI not wired. Need: row-level "Mark Paid" button + modal capturing paid_amount/paid_at.
- **Commission Rate inline editor on job detail page** ([app/dashboard/admin/jobs/[id]/page.tsx](app/dashboard/admin/jobs/[id]/page.tsx)) — backend ready (PATCH `/api/admin/jobs/[id]/commission-rate`), UI not wired. Mirror the pattern from CommissionsCard's default-rate inline editor.
- **Partial billing UI** — backend has `summary.scope.overall_pct`. Could add "Bill at X%" CTA on Active Jobs cards that pre-fills an invoice draft for the completed portion.

---

---

## APRIL 28, 2026 SESSION (PT 2) — Operator Transparency Panel + Editable Timestamps

### Problem reported
Admin opens job detail for an active job and gets "Failed to load job details" full-screen. User needed real-time visibility into operator activity (in-route, arrived, work performed, standby) AND the ability to edit timestamps when operators forget to click.

### Diagnosis
- **Root cause of page-load failure:** stale browser session token. Server-side `/summary` endpoint returns 200 with valid JSON when called with a fresh token (verified via E2E magic-link test). The browser was sending an expired bearer.
- **Hidden UX flaw:** the page short-circuits the entire layout when `/summary` errors, hiding the live-status panel that *did* successfully load. So even when transparency data was available, admins saw nothing.

### Three parallel agent tracks (all merged, all build-clean)

#### Track A — Backend: editable timestamps + work-performed notifications
- New `PATCH /api/admin/jobs/[id]/timestamps` — accepts any of `in_route_at`, `arrived_at_jobsite_at`, `work_started_at`, `work_completed_at` (each can be ISO string or `null` to clear) + optional `edit_reason`. requireAdmin. Returns updated values. Validation: 400 on no keys / malformed ISO; 404 if job not found.
- Audit-logged via `audit_logs.action='admin_edit_job_timestamps'` with `before/after` snapshot + `edit_reason` in `details` JSON.
- `app/api/job-orders/[id]/work-items/route.ts` (operator submission endpoint) now fans out a `notifications` row to every `admin/super_admin/operations_manager` profile in the tenant after each work-performed insert. Fire-and-forget pattern, doesn't block operator response.
- Notification fields used: `type='work_performed'`, `title='Work performed update'`, computed message string, `action_url=/dashboard/admin/jobs/<id>`, `sender_id=operator`, `tenant_id=job.tenant_id`.

#### Track B — Backend: live-status enriched
- `GET /api/admin/jobs/[id]/live-status` extended (existing fields preserved):
  - `standby_segments_today: Array<{ id, started_at, ended_at, duration_minutes, reason }>` — all of today's segments, ongoing duration computed live
  - `last_work_performed_at: string|null`
  - `work_performed_count_today: number`
  - `route_start_coords: {lat, lng}|null` and `work_start_coords: {lat, lng}|null` (from existing `route_start_*`/`work_start_*` columns)
- All new queries wrapped in try/catch with safe defaults so a single failure doesn't kill the response.

#### Track C — Frontend: non-blocking error + live ops panel + edit modal
- `pageError` state widened from `string|null` → `{status?: number; message: string}|null` so HTTP status is preserved for display.
- Old full-screen "Failed to load job details" replaced with rose-accent inline banner. **Live status panel still renders even when summary fails**, so dispatch never loses operator visibility.
- Banner shows status code, "Retry" button (calls `fetchJob`), "Reload page", and a small "Sign out" link in case of corrupted session.
- New [components/admin/EditTimestampModal.tsx](components/admin/EditTimestampModal.tsx) (293 lines) — bottom-sheet on mobile, centered on desktop, datetime-local input + edit-reason textarea + Save/Clear/Cancel.
- Pencil icons next to in-route, arrived, work-started, work-completed timestamps in the live-status panel — opens the edit modal.
- Always-rendered rows (em-dash placeholder + pencil) so admins can fill in missed clicks for any of the four timestamps.
- Active standby block now shows a **live ticking elapsed timer** (`formatHMS`, 1s setInterval) with pulsing rose dot.
- New collapsible "Today's standby (N)" list when there are completed segments.
- Sky chip showing work-performed count + last update timestamp; click scrolls to Daily Progress card.
- Live indicator now intelligent: emerald LIVE (<60s), amber STALE (>90s), grey "Polling".

### E2E verification (against running localhost:3000 with super_admin token)
- ✅ `GET /live-status` → 200 with all new fields populated
- ✅ `PATCH /timestamps` setting `arrived_at_jobsite_at` → 200, value persists, reflected in next GET
- ✅ `PATCH /timestamps` to null → 200, clears column
- ✅ Audit log captures both edits with correct `changed_keys` and `edit_reason`
- ✅ Empty body → 400; malformed ISO → 400
- ✅ Page renders 67KB shell without React error markers

### Commits on `main` (LOCAL only — NOT pushed to origin yet pending user QA)
```
[merge] live operator transparency — editable timestamps, standby segments, non-blocking errors
0acaee11  feat: live ops transparency — editable timestamps + standby segments + non-blocking errors
1ec00aaa  feat: extend live-status with standby segments, work counts, GPS coords
92f34146  feat: editable job timestamps API + work-performed admin notifications
```

### Note on the original "Failed to load" report
The user's specific page-load failure was a stale browser session — the server endpoint was 200ing the whole time. With Track C's non-blocking error UI, this scenario now degrades gracefully (banner + live panel) instead of total blackout. If it recurs, the banner offers a "Sign out" → re-login path.

---

## APRIL 28, 2026 SESSION — Pending Migrations Applied, Parallel Polish (Mobile / Loading / Deploy Doc)

### Head-developer parallel sprint
Dispatched 3 isolated-worktree agents simultaneously, all returned clean builds, all merged with zero conflicts (deliberate non-overlapping file scopes: page.tsx vs loading/error.tsx vs new doc).

#### Track 1 — Mobile responsive audit on operator pages
- 4 pages fixed, 9 already clean.
- `app/dashboard/my-jobs/page.tsx` — schedule-updated banner dismiss button, multi-day "View" links, "Resume" links upgraded to ≥40×32px touch targets, "Awaiting Approval" badge shortened to fit at 375px.
- `app/dashboard/job-schedule/[id]/work-performed/page.tsx` — Add Hole Entry modal grid: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`. Cut Area form: `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`.
- `app/dashboard/job-schedule/[id]/job-survey/page.tsx` — 5 segmented water-source pickers were 36px tall (below iOS 44px target); bumped to `min-h-[44px]`.
- Already clean: my-jobs detail, jobsite, in-route, day-complete, standby, utility-waiver, timecard, my-profile, request-time-off, notifications.
- **Pre-existing color bug flagged (not in scope)**: 4 modal close buttons in work-performed (lines 3534, 3699, 3928, 4103) use `text-white hover:bg-white/20` on a white sticky modal header — invisible until hovered.

#### Track 2 — Loading & error boundaries on dashboard routes
- 54 `loading.tsx` files added (custom skeletons for high-traffic routes: jobs/[id], team-profiles, time-off, operator timecard, mobile pages; generic admin/operator templates for the rest).
- 55 `error.tsx` files added (client-component, retry button, "Back to dashboard" link; job detail and operator timecard get tailored back-links).
- Existing loading skeletons preserved on `app/dashboard/admin/`, `admin/billing/`, `admin/customers/`, `admin/schedule-board/`, `admin/timecards/`.
- Skipped intentionally: `app/dashboard/debug/*` (internal tools).

#### Track 3 — Production deployment checklist
- New file [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) at repo root — 9-section launch runbook.
- **26 distinct env vars** found in code; 6 missing from `.env.example`. White-label-critical: `NEXT_PUBLIC_CONTACT_EMAIL`.
- **24 hardcoded "Pontifex" strings** still rendering to customers. Highest-priority offenders:
  - [app/sign/[token]/page.tsx:818](app/sign/[token]/page.tsx:818) — "Powered by Pontifex Industries" on customer signature page
  - [app/error.tsx:59](app/error.tsx:59) and [app/global-error.tsx:136](app/global-error.tsx:136)
  - Single-source-of-truth: [components/landing/brand-config.ts](components/landing/brand-config.ts)
- **Production hazard found**: [app/api/send-email/route.ts:17](app/api/send-email/route.ts:17) hardcodes the old vercel.app domain in SSRF allowlist — must add custom domain before launch.
- **Risk**: [lib/supabase.ts:4-5](lib/supabase.ts:4) and [lib/supabase-admin.ts:36-37](lib/supabase-admin.ts:36) silently fall back to `placeholder.supabase.co` if env vars missing — recommended fail-fast hardening.
- 1130 `console.*` calls (mostly legit catch-blocks); worst offender [lib/database.ts](lib/database.ts) at 27.
- Stale [app/dashboard/admin/schedule-board/page.backup.tsx](app/dashboard/admin/schedule-board/page.backup.tsx) shipping in bundle — delete before launch.
- Vercel project confirmed: `prj_vubQAdrHfAlSq9msk0sfedlBq5zJ`, region `iad1`.

### Migrations applied (start of session)
- `20260427_utility_waiver_fields` — 5 utility_waiver_* columns on job_orders
- `20260427_operator_badges` — table + RLS (admins manage / operators see own).
  - **FK fix during apply**: original migration had `tenant_id REFERENCES auth.users(id)`; corrected to `REFERENCES tenants(id) ON DELETE CASCADE` to match codebase convention. SQL file in repo updated to match what was applied.

### Commits on `claude/sleepy-shannon-95c45b` (pushed to origin)
```
7b77c9b7  Merge: add production deployment checklist (Track 3)
7e383838  Merge: add loading and error boundaries to dashboard routes (Track 2)
54745538  Merge: mobile responsive audit on operator pages (Track 1)
029c76bb  chore: apply pending migrations + fix operator_badges tenant FK
3991407b  feat: add loading and error boundaries to dashboard routes
5ea5e163  docs: add production deployment checklist
3cc84357  fix: mobile responsive audit on operator pages
```

### Pending manual actions
- **Merge `claude/sleepy-shannon-95c45b` → `main`** to deploy to Vercel.
- **Delete test job**: JOB-2026-119492 (WS/TS test job) — use the trash icon on Active Jobs page.
- **Address white-label rebranding TODOs** — see [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) section "White-label rebranding TODOs". Most-visible: customer signature footer.
- **Add custom domain to SSRF allowlist** in [app/api/send-email/route.ts:17](app/api/send-email/route.ts:17) once domain is decided.

---

## APRIL 27, 2026 SESSION — Navigation Cross-Contamination, Auth Fixes, Live Status, Timecard Repairs

### Critical bugs fixed this session

#### 1. Navigation Cross-Contamination (root cause: stale localStorage cache)
- **Problem**: Backspace sent Demo Operator to admin portal; clicking Active Jobs as Super Admin sent to operator dashboard; role state bled between browser tabs when two different users had been logged in.
- **Root cause**: `getCurrentUser()` in `lib/auth.ts` read `supabase-user` from localStorage without verifying that key belonged to the *current* Supabase session. If a previous user's data was cached, the new user inherited the wrong role.
- **Fix 1 — `lib/auth.ts`**: `getCurrentUser()` now cross-validates the `supabase-user` cache against the active `sb-*-auth-token` Supabase session. Mismatched IDs → cache purged → returns null → forces re-auth. `logout()` also clears all `sb-*-auth-token` keys to prevent session bleed.
- **Fix 2 — `lib/hooks/useAuthUser.ts`** (new file): async-safe React hook that calls `supabase.auth.getSession()` as ground truth, enforces `requiredRoles`, and redirects mismatch to the correct dashboard.
- **Fix 3 — page guards**: Admin pages that were doing `!currentUser || !isAdmin()` → single redirect were split: `!currentUser` → `/login`, wrong role → `/dashboard`. Fixed in `schedule-form/page.tsx`, `timecards/page.tsx`.
- **Fix 4 — operator dashboard Active Jobs tile**: Was a plain `div` — clicking it was a no-op then falling through to router. Converted to `Link href="/dashboard/my-jobs"`.

#### 2. Operator Dashboard Redirect
- **Problem**: Super Admin opened `/dashboard` (operator root) instead of `/dashboard/admin`.
- **Fix**: Expanded role check from `if role === 'admin'` to full ADMIN_ROLES array `['super_admin', 'admin', 'operations_manager', 'salesman', 'shop_manager', 'inventory_manager']`.

#### 3. Stale Timecard Blocking Clock-In
- **Problem**: Demo Operator showed "already clocked in" with 34.7 hours — yesterday's open timecard entry was not closed and had no date scope.
- **Fix**: Added `.eq('date', todayStr)` to both the "already clocked in" check in `clock-in/route.ts` and the active timecard query in `current/route.ts`. Added auto-close loop for stale previous-day open timecards (sets `clock_out_time = '{date}T23:59:59'`).

#### 4. Job Daily Assignments Sync
- **Problem**: Demo Operator saw 2 jobs; schedule board showed 1. The `job_daily_assignments` table overrides were not respected in `GET /api/job-orders`.
- **Fix**: `api/job-orders/route.ts` now cross-references `job_daily_assignments` for any non-admin date-scoped query. If a daily override exists and the current user isn't that day's operator → job is excluded. Also added client-side role-based filter on `my-jobs/page.tsx` (non-apprentices only see `assigned_to === uid` jobs).

#### 5. Super Admin "Job Not Found"
- **Problem**: Admin job detail returned 404 for Super Admin because `tenantId = null` caused `.eq('tenant_id', null)` to match nothing.
- **Fix**: All 4 queries in `summary/route.ts` now use conditional `if (tenantId) query.eq('tenant_id', tenantId)`.

#### 6. Real-Time Operator Transparency Panel
- **New**: `GET /api/admin/jobs/[id]/live-status` — polls every 30s from admin job detail. Returns:
  - `status`, `operator_name`, `helper_name`
  - `in_route_at`, `arrived_at`, `work_started_at` (timestamps)
  - `standby_active`, `standby_started_at`, `standby_duration_minutes`
  - `time_on_site_minutes` (computed)
  - `clock_in_time`, `clock_out_time` (today's timecard)
  - `work_performed_today` (array of progress entries)
  - `status_history` (last 20 transitions)
  - Gracefully handles missing optional tables (`standby_logs`, `job_status_history`)

#### 7. Delete Job from Active Jobs
- Added trash icon + confirmation modal on Active Jobs cards. Calls `DELETE /api/admin/jobs/[id]`.

#### 8. Skill-Match Slash Split Fix
- `job.job_type = "WS/TS"` was producing `['ws/ts']` — not found in the scope map. Fixed: `split(/[,/]/)` → correctly produces `['ws', 'ts']`.

### Commits on main (chronological)
```
71501d64  fix: operator my-jobs now matches schedule board assignment
8585e7ad  fix: redirect all admin/management roles from operator dashboard to admin dashboard
daa3960c  fix: resolve TS errors in live-status route + skill-match slash split
2022f937  fix: super_admin Job not found bug + add Live Status panel
52e0c3b6  fix: scope active timecard check to today; auto-close stale open timecards
7cad1ad7  fix: validate getCurrentUser against Supabase session; add useAuthUser hook; clear session on logout
c66b1f7b  fix: admin role-fail redirects and operator back button navigation
3194af26  fix: show approval card based on completion request status not job status
33c2da5c  fix: change past jobs history window from 30 days to 7 days
```

### Pending manual actions
- **Delete test job**: JOB-2026-119492 (WS/TS test job) — use the trash icon on Active Jobs page

### Migrations applied (April 27, late session)
- `20260427_utility_waiver_fields` — 5 utility_waiver_* columns on job_orders
- `20260427_operator_badges` — operator_badges table + RLS (admins manage / operators see own).
  - **FK fix during apply**: original migration had `tenant_id REFERENCES auth.users(id)`; corrected to `REFERENCES tenants(id) ON DELETE CASCADE` to match codebase convention. SQL file in repo updated to match.

### Known remaining issues (low priority)
- Clock-in event isn't persisted across page navigation if user force-navigates mid-flow (timecard state in operator dashboard resets on back-navigation). The underlying timecard row IS correctly saved to DB — this is a display-only race.
- Operator "Active Jobs" stat tile text says "Active Jobs" but links to My Jobs. Consider renaming tile label to "My Jobs" for clarity.

---

## APRIL 26, 2026 SESSION — Operator Workflow, Dark Mode, Time-Off & Attendance, Late Clock-In

### What shipped
- **Work-performed page** — all 28 `alert()` calls replaced with `showNotification()` toast system.
- **Daily-log 403 fix** — assignment check covers helper + admin bypass.
- **Post-submission locked card** — polished success card after Done for Today / Complete Job.
- **Operator past 7-day job history** — My Jobs collapsible "Past 7 Days" section.
- **Green ticket highlights** — emerald/amber status badges on JobTicketCard.
- **"Continuing Tomorrow" section** — My Jobs amber section for multi-day scheduled jobs.
- **Admin job detail — Daily Progress** — per-day cards with gradient badge, hours, work items, operator name.
- **Admin job detail — Operator Notes panel** — notes after submission; type badges amber/emerald/violet.
- **Admin active jobs** — `operator_notes_count` badge on cards.
- **Admin completed jobs** — 4 metric tiles + Operator Notes panel.
- **Schedule board Mark Out** — rose "Mark Out" button → MarkOutModal → creates approved time_off record.
- **Time-off admin page** — 2-tab: Requests + Attendance Metrics (PTO bars, callout counts).
- **PTO balance system** — `operator_pto_balance` table fully wired.
- **Late clock-in tracking** — is_late, late_minutes fully wired; admin fire-and-forget notifications.
- **Team payroll** — 7th "Late Arrivals" summary card + per-operator Late column.
- **Operator detail timecard** — 7th Punctuality metric tile.
- **Stale "Needs Attention" badge fix** — `job_completion_requests` cancelled on Done for Today.

---

## APRIL 24, 2026 SESSION — Jobs UI refresh, Change Orders, Operator Skills

### What shipped
- Active Jobs + Job Detail redesign — light-default, gradient accent bars, 5 metric tiles, 3 tabs
- Change Orders data model + API (`change_orders` table, `CO-NNN` auto-numbering, approve/reject)
- Multi-day progress analytics — `GET /api/admin/jobs/[id]/progress-by-day`
- Summary route 404 fix for Super Admin
- Light-mode factory reset sentinel
- Billing / Completed Jobs / Completed Job Tickets rewritten to light-default
- Schedule form step reorder (Difficulty→5, Scheduling→6, Site Compliance→7)
- Approve Job modal — operator availability panel with date param
- Operator skills taxonomy in `lib/skills-taxonomy.ts` + Skills & Proficiency tab in Team Profiles
- Smart scheduling — per-scope skill used when job service code maps to scope

---

## CURRENT STATE

### Git
- **Branch:** `main`
- **Pushed to origin** ✅
- **Build:** PASSING (0 errors)
- **Localhost**: Restart `npm run dev` to pick up all auth.ts and navigation changes

### Supabase
- **Project ID**: `klatddoyncxidgqtcjnu`
- **100+ tables**, all RLS enabled

### Dev Server
- Preview: `preview_start` / `preview_stop` MCP tools
- Config in `.claude/launch.json`
- If changes don't appear: `lsof -ti:3000 | xargs kill -9`, delete `.next/`, restart

### Vercel
- Auto-deploy: pushes to `main` → production
- **Env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

---

## REMAINING SPRINT TASKS (Week 2)

- [ ] End-to-end workflow test: create job → dispatch → clock-in → work performed → complete → invoice
- [ ] Mobile responsive audit on operator pages
- [ ] Loading states & error handling audit
- [ ] Patriot-specific visual assets (logos, custom colors)
- [ ] Production deployment prep (env vars, custom domain, SSL)
- [ ] Final build verification & merge to main (already on main)
