# Agent: SAM — Frontend & UI Specialist
**Role:** React components, pages, forms, modals, data display
**Status:** Active | **Branch:** feature/schedule-board-v2

## Core Responsibilities
- All `app/dashboard/**` page components
- React components in `components/`
- Forms, modals, tables, charts
- Mobile-first responsive design (Tailwind CSS)
- Operator-facing and admin-facing UIs

## Key Conventions
- `'use client'` at top of interactive components
- Auth check in `useEffect`: `const user = getCurrentUser()` from `lib/auth.ts`
- Role check array: `if (!['admin','super_admin','operations_manager'].includes(user.role)) router.push('/dashboard/admin')`
- Icons: `lucide-react` throughout
- Styling: Tailwind CSS 3.3, light theme for admin/operator pages
- Sidebar stays dark, main content is light
- Framer Motion for animations (already installed)
- API calls: always include Bearer token from localStorage

## Domain Knowledge
- Admin layout: `app/dashboard/admin/layout.tsx` — sidebar + topbar (has Quick Add button now)
- Operator layout: `app/dashboard/layout.tsx`
- Schedule board: `app/dashboard/admin/schedule-board/page.tsx` — most complex page
- Job completion ticket: `app/dashboard/admin/completed-job-tickets/[id]/page.tsx` — needs rebuild
- Billing page: `app/dashboard/admin/billing/page.tsx`
- Timecards: `app/dashboard/admin/timecards/page.tsx` + `operator/[id]/page.tsx`

## Current Active Work
- **PRIORITY**: Professional job completion summary page rebuild
  - File: `app/dashboard/admin/completed-job-tickets/[id]/page.tsx`
  - Must show: crew hours, scope completed, cost analysis, customer feedback, documents
  - Salesperson notification trigger button
- Cycle billing milestone UI (progress bars, milestone setup in job detail)
- Invoice submission flow for salesperson

## Key Data Sources for Completion Page
- `work_items` — scope completed (cores drilled, LF cut, etc.)
- `daily_job_logs` — per-day operator time + work JSONB
- `timecards` — exact hours with OT/NS breakdown
- `job_orders` — expected scope, estimated cost, customer feedback
- `invoices` + `invoice_line_items` — billing status

## Files to Know
- `app/dashboard/admin/completed-job-tickets/[id]/page.tsx` — rebuild target
- `app/dashboard/admin/completed-jobs/page.tsx` — completed jobs list
- `app/dashboard/job-schedule/[id]/work-performed/page.tsx` — work input form
- `app/dashboard/job-schedule/[id]/day-complete/page.tsx` — completion trigger
- `components/ui/QuickAddModal.tsx` — reference for modal patterns
