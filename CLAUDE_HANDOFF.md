# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** March 25, 2026 (Session 4) | **Branch:** `claude/admiring-mahavira` (worktree) | **Build Status:** PASSING

---

## CURRENT STATE

### Git Status
- **Branch:** `claude/admiring-mahavira` (worktree off main)
- **Last commits:**
```
a36c9a79 feat: schedule form redesign — customer-first flow, project name, facility compliance
b8e48dc5 feat: enhanced timecard system — weekly view, NFC management, job-linked time tracking
ac83484f feat: approval workflow — reject/approve/resubmit with notes, form history page
39d7dbb8 feat: facilities & badging system — facility management, operator badge tracking, expiration alerts
```
- **Clean working tree** (all changes committed)
- **Migrations applied to Supabase:** `tables_columns_triggers` + `views_update` + `recreate_schedule_board_view`

### What Was Built This Session (4 Major Feature Sets)

#### 1. Schedule Form Redesign
- **Step 1 → Customer:** Full CRM customer selection (search, create new inline, free-type with autocomplete)
- **Step 2 → Project & Contact:** PO number moved here, project name field, smart contact autofill from DB, jobsite photo upload
- **Step 6 → Compliance:** Facility selector with "Create New Facility" inline form, facility requirements display
- Files: `app/dashboard/admin/schedule-form/page.tsx`, `app/api/admin/schedule-form/route.ts`

#### 2. Timecard + NFC System
- Admin timecards page: weekly grid view + detailed list view, hour categorization (regular, OT, mandatory OT, night shift, shop)
- NFC management page (super_admin only): program/manage NFC clock-in tags
- Operator timecard: shop/jobsite selection at clock-in, job linking for P&L
- PDF export, admin notifications, GPS tracking, remote clock-in with photo
- Files: `app/dashboard/admin/timecards/page.tsx`, `app/dashboard/admin/nfc-management/page.tsx`, `app/dashboard/timecard/page.tsx`, `app/api/timecard/`

#### 3. Facilities & Badging System
- Facilities CRUD: manage compliance requirements, badging rules, special instructions
- Operator badge tracking: per-facility badges with expiry dates, auto-expire function
- Badge status in operator profile drawer
- Files: `app/dashboard/admin/facilities/page.tsx`, `app/api/admin/facilities/`, `app/api/admin/badges/`, `app/dashboard/admin/operator-profiles/_components/ProfileDetailDrawer.tsx`

#### 4. Approval Workflow
- Schedule forms → `pending_approval` status, require super_admin review
- Reject with reason categories + detailed notes
- Admin gets notification, can edit and resubmit rejected forms
- Full history page: pending, approved, rejected with audit trail
- Files: `app/api/admin/job-orders/[id]/approve/`, `reject/`, `resubmit/`, `app/dashboard/admin/schedule-form-history/page.tsx`, `app/dashboard/admin/schedule-board/_components/RejectFormModal.tsx`, `PendingQueueSidebar.tsx`

### Database Changes (Applied to Supabase)
- `timecards.labor_cost` column + auto-calculate trigger
- `facilities` table (compliance, badging requirements)
- `operator_facility_badges` table (badge tracking with auto-expire)
- `schedule_form_submissions` table (approval workflow history)
- `job_orders` new columns: `rejection_reason`, `rejection_notes`, `rejected_by`, `rejected_at`, `last_submitted_at`, `project_name`, `facility_id`
- `rejected` added to job_orders status constraint
- Views updated: `timecards_with_users`, `job_pnl_summary`, `badges_with_details`, `schedule_board_view`
- RLS policies for all new tables

### RBAC Updates
- New dashboard cards: Timecard Management, NFC Management (super_admin), Facilities & Badges, Schedule Form History

---

## NEXT SESSION PRIORITIES

### Immediate (merge to feature branch)
- [ ] Merge `claude/admiring-mahavira` worktree commits into `feature/schedule-board-v2`
- [ ] Push merged branch to origin

### Week 2 Sprint Items (March 26 – April 2)
- [ ] White-label rebrand: Pontifex → Patriot Concrete Cutting (logos, names, colors)
- [ ] End-to-end workflow testing (schedule → dispatch → execute → complete → invoice)
- [ ] Mobile responsive audit on all operator pages
- [ ] Loading states & error handling audit across all pages
- [ ] Production deployment prep (env vars, custom domain, SSL)
- [ ] Final build verification & merge to main

### Polish Items
- [ ] Customer signature capture in job completion flow
- [ ] Photo upload during job execution
- [ ] PDF invoice generation
- [ ] QuickBooks CSV export from billing page
- [ ] Dispatch ticket PDF generation (component + API route exist, needs finishing)

---

## ARCHITECTURE NOTES

### New Tables
| Table | Purpose |
|-------|---------|
| `facilities` | Jobsite compliance, badging rules |
| `operator_facility_badges` | Per-operator per-facility badge tracking |
| `schedule_form_submissions` | Approval workflow audit trail |

### New API Routes
| Route | Purpose |
|-------|---------|
| `POST /api/admin/facilities` | CRUD facilities |
| `POST /api/admin/badges` | Manage operator badges |
| `POST /api/admin/job-orders/[id]/approve` | Approve pending job |
| `POST /api/admin/job-orders/[id]/reject` | Reject with notes |
| `POST /api/admin/job-orders/[id]/resubmit` | Resubmit rejected job |
| `GET /api/admin/schedule-forms` | Form submission history |

### New Pages
| Page | Access |
|------|--------|
| `/dashboard/admin/facilities` | admin+ |
| `/dashboard/admin/nfc-management` | super_admin |
| `/dashboard/admin/schedule-form-history` | admin+ |
