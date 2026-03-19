# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** March 19, 2026 | **Branch:** `feature/schedule-board-v2` | **Build Status:** PASSING

---

## CURRENT STATE

### Git Status
- **Branch:** `feature/schedule-board-v2` (up to date with `origin/feature/schedule-board-v2`)
- **Last pushed commit:** `58204eb0` — "feat: Team member dashboard with smart job transitions + shop tickets"
- **Uncommitted work:** 7 modified files + 3 new files/dirs (see below)

### Uncommitted Changes (Work in Progress)
**Modified:**
- `app/api/admin/schedule-form/route.ts` — permit fields added to schedule form API
- `app/dashboard/admin/schedule-board/_components/EditJobPanel.tsx` — permit fields in edit panel
- `app/dashboard/admin/schedule-board/_components/OperatorRow.tsx` — UI updates
- `app/dashboard/admin/schedule-board/page.tsx` — dispatch PDF integration + board enhancements
- `app/dashboard/admin/schedule-form/page.tsx` — permit fields in form wizard
- `app/dashboard/my-jobs/[id]/page.tsx` — operator job detail updates
- `tsconfig.tsbuildinfo` — build artifact

**New (untracked):**
- `app/api/job-orders/[id]/dispatch-pdf/` — API route for generating dispatch ticket PDFs
- `components/pdf/DispatchTicketPDF.tsx` — React PDF component for dispatch tickets
- `supabase/migrations/20260318_add_permit_fields_to_job_orders.sql` — adds permit_number, permit_required, permit_status columns

### Unapplied Migration
- `20260318_add_permit_fields_to_job_orders.sql` — needs to be applied to Supabase

---

## WHAT WAS BUILT RECENTLY (Last 5 Sessions)

1. **Team member dashboard** with smart job transitions + shop tickets
2. **Multi-day job workflow** — 7 critical bug fixes
3. **Timecard admin/operator** type safety improvements
4. **NFC clock-in system** with remote selfie fallback
5. **Admin settings page** + NFC tag management
6. **Billing & Invoicing system** — full pipeline from completed jobs to invoices
7. **Active Jobs admin view** — multi-day progress tracking
8. **Dispatch ticket PDF** (in progress) — component + API route exist, needs finishing
9. **Permit fields** — migration written, form/board UI started

---

## WHAT TO DO NEXT (Sprint Backlog — see CLAUDE.md for full list)

### Immediate (finish in-progress work)
1. **Apply permit fields migration** to Supabase
2. **Finish dispatch ticket PDF** — verify component renders, API returns PDF, test download from board
3. **Commit + push** all uncommitted work

### Then continue sprint backlog:
4. Customer signature capture in completion flow
5. Photo upload during job execution
6. PDF invoice generation
7. QuickBooks CSV export
8. White-label rebrand (Pontifex → Patriot)
9. E2E testing
10. Production deployment prep

---

## KEY ARCHITECTURE REFERENCE

### Tech Stack
- Next.js 15 (App Router) + React 19 + TypeScript
- Supabase (PostgreSQL) — project `klatddoyncxidgqtcjnu`
- Tailwind CSS (purple/dark theme)
- @react-pdf/renderer for PDF generation

### Auth Pattern
- Server: `requireAuth()`, `requireAdmin()`, `requireSuperAdmin()`, `requireScheduleBoardAccess()` from `lib/api-auth.ts`
- Client: `getCurrentUser()` from `lib/auth.ts` + role array check in useEffect
- Admin client (`lib/supabase-admin.ts`) bypasses RLS for server-side ops

### Roles
super_admin > operations_manager > admin > salesman > shop_manager > inventory_manager > operator > apprentice

### Key Workflows
- **Scheduling:** Admin creates job via schedule form → appears on schedule board → assign operator/helper
- **Operator flow:** my-jobs → jobsite → work-performed → day-complete → (done for today | complete)
- **Billing:** Completed job → create invoice (draft) → sent → paid
- **Multi-day:** Jobs span start_date → end_date, daily_job_logs track day_number via DB trigger

### File Organization
- `app/api/` — API routes (Next.js Route Handlers)
- `app/dashboard/admin/` — Admin pages (schedule board, billing, analytics, etc.)
- `app/dashboard/my-jobs/` — Operator pages
- `components/` — Shared components (PDF templates, UI elements)
- `lib/` — Utilities (auth, supabase clients, audit logging, RBAC)
- `supabase/migrations/` — 60+ SQL migrations
