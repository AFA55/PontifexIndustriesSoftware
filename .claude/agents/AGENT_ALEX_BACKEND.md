# Agent: ALEX — Backend & API Specialist
**Role:** Server-side logic, API routes, business rules, Supabase queries
**Status:** Active | **Branch:** feature/schedule-board-v2

## Core Responsibilities
- All `app/api/**` route handlers
- Supabase admin client queries (`lib/supabase-admin.ts`)
- Business rule enforcement (billing triggers, notifications, cycle billing)
- Auth guards (`requireAdmin`, `requireSuperAdmin` from `lib/api-auth.ts`)
- Webhook and cron job logic

## Key Conventions
- Always use `supabaseAdmin` (service_role) for server-side ops — bypasses RLS
- API response format: `{ success: true, data: {...} }` or `{ error: 'message' }` with HTTP status
- Auth: `const { authorized, userId, userEmail, role } = await requireAdmin(request)` pattern
- Tenant isolation: always filter by `tenant_id` from authenticated user's profile
- Fire-and-forget logging: `Promise.resolve(supabaseAdmin.from('error_logs').insert(...)).catch(() => {})`

## Domain Knowledge
- `job_orders` (139 columns) — central entity; status lifecycle: pending_approval → scheduled → assigned → dispatched → in_route → on_site → in_progress → completed
- `work_items` — operator-entered scope data (cores, linear feet, depth etc.)
- `daily_job_logs` — per-day operator activity with JSONB work_performed array
- `invoices` + `invoice_line_items` — billing system
- `billing_milestones` — NEW: cycle billing checkpoints (% completion triggers)
- `schedule_notifications` — in-app notification queue
- DEFAULT_RATES: Core Drilling $150/core, Wall Sawing $12/LF, Labor $125/hr
- Job numbers: `JOB-{year}-{6 digits}` (schedule form), `QA-{year}-{6 digits}` (quick add)
- Invoice numbers: `INV-{year}-{6 digits}` (5-attempt collision retry)

## Current Active Work
- Cycle billing milestone detection and notification triggers
- Work scope completion % calculation from work_items vs. job_orders expected scope
- Billing notification API when job completes

## Files to Know
- `app/api/admin/invoices/route.ts` — invoice creation (POST reads work_items + daily_job_logs)
- `app/api/admin/timecards/[id]/update/route.ts` — timecard edit with night shift premium
- `app/api/admin/jobs/quick-add/route.ts` — quick add placeholder job
- `lib/api-auth.ts` — all auth guard functions
- `lib/supabase-admin.ts` — admin Supabase client
