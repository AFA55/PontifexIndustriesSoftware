# Pontifex Industries Platform — Session Context
> Last updated: 2026-03-09
> Use this file to resume work after a session restart.

---

## PART 1: CURRENT WORK IN PROGRESS

### What We Built (All Code Complete ✅)

**1. Custom Calendar Date Picker** ✅
- Replaced native browser date picker with modern custom calendar
- Purple/pink gradient theme matching app aesthetic
- Prev/next day arrows, "Today" button, month navigation dropdown
- **File**: `app/dashboard/admin/schedule-board/_components/ScheduleDatePicker.tsx` (NEW)

**2. Smart Capacity API** ✅
- **Endpoint**: `GET /api/admin/schedule-board/capacity`
- Three modes: single date check, date range check, find-next-available
- Counts active jobs per date (excludes `pending_approval`, `cancelled`, will-call)
- Skips weekends, scans up to 90 days ahead for next available
- **File**: `app/api/admin/schedule-board/capacity/route.ts` (NEW)

**3. Configurable Capacity Settings** ✅
- **Endpoint**: `GET/PATCH /api/admin/schedule-board/settings`
- Super admin can adjust max_slots (default 10) and warning_threshold (default 8)
- Settings gear icon on schedule board (super_admin only)
- Inline modal to change capacity as team grows
- **File**: `app/api/admin/schedule-board/settings/route.ts` (NEW)

**4. Enhanced Approval Modal** ✅
- Shows **quoted amount** (`estimated_cost`) with dollar icon
- Shows **start date & end date** with day count for multi-day jobs
- **Real-time capacity checking** — three visual states:
  - 🟢 Green = clear to approve
  - 🟡 Amber = warning threshold hit (requires checkbox acknowledgment)
  - 🔴 Red = full capacity, blocks approval entirely
- **"Find Next Available Date"** button when blocked/warning
- "Use This Date" quick-apply from suggestion
- **File**: `app/dashboard/admin/schedule-board/_components/ApprovalModal.tsx` (REWRITTEN)

**5. Multi-Day Continuous Validation** ✅
- If a job spans start_date → end_date, checks ALL dates have availability
- Reports which specific dates are full or at warning level
- Ensures no gaps in continuous availability before approval

**6. Schedule Board Page Updates** ✅
- `NUM_ROWS` now **dynamic** — driven by `capacityMaxSlots` from settings (not hardcoded 10)
- Capacity indicator in stats bar with color-coded status (green/amber/red)
- "Next Available" button for admin/salesman users
- Settings gear button for super_admin
- Floating "Next Available Date" result banner
- Server-side capacity double-check in `handleApprove` before approving
- **File**: `app/dashboard/admin/schedule-board/page.tsx` (MODIFIED)

**7. Pending Queue Sidebar Updates** ✅
- Shows estimated cost as green badge with DollarSign icon
- Shows date range (start → end) for multi-day jobs
- **File**: `app/dashboard/admin/schedule-board/_components/PendingQueueSidebar.tsx` (MODIFIED)

**8. Job Orders API Update** ✅
- Added `helper_assigned_to`, `estimated_cost`, `is_will_call`, `difficulty_rating` to allowed update fields
- **File**: `app/api/admin/job-orders/[id]/route.ts` (MODIFIED)

### What's Left (1 Item) 🔲

**Database Migration** — `supabase/migrations/20260309_capacity_settings.sql`
- Uses `DROP VIEW + CREATE VIEW` (NOT `CREATE OR REPLACE` — PostgreSQL can't add columns via replace)
- Updates `schedule_board_view` to include `estimated_cost` + `scheduling_flexibility`
- Creates `schedule_settings` table with default capacity (10 max, 8 warning)
- RLS policies: read for admin/super_admin/salesman, write for super_admin only
- Performance index on `job_orders.status`
- **Status**: SQL file ready, NOT YET APPLIED to Supabase database
- **Note**: The Supabase MCP tool was failing with `net::ERR_FAILED` — restart Claude Desktop to reset MCP connections

### Build Status
- ✅ `npm run build` passes with zero errors
- ✅ Dev server runs on port 3000
- ✅ All code saved and ready
- 🔲 Migration needs to be applied, then end-to-end verification

### Next Steps After Migration
1. Apply migration to Supabase
2. Verify: login → schedule board → approve job with capacity warnings → test "Next Available" → test settings modal
3. **Then**: Build job tickets for operators based on the new job cards

---

## PART 2: PLATFORM INFRASTRUCTURE

### Tech Stack
- **Framework**: Next.js 15.5.12 (App Router) + React 19.1.0
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS 3.3.0
- **Database**: Supabase (PostgreSQL) — project ref: `klatddoyncxidgqtcjnu`
- **Auth**: Supabase Auth with JWT Bearer tokens
- **Forms**: react-hook-form + zod validation
- **Email**: Resend (from `noreply@admin.pontifexindustries.com`)
- **SMS**: Twilio (phone: `+18336954288`)
- **Maps**: Google Maps (Places API, geocoding, GPS geofencing)
- **PDF**: @react-pdf/renderer + jspdf + html2canvas
- **Charts**: recharts
- **Icons**: lucide-react
- **Animations**: framer-motion
- **Hosting**: Vercel

### Auth System

**Login Flow**:
1. POST `{ email, password }` → `/api/auth/login`
2. Server calls `supabase.auth.signInWithPassword()`
3. Fetches profile via `supabaseAdmin` (service_role, bypasses RLS)
4. Checks `profile.active` — inactive = 403
5. Returns `{ success, user: { id, email, full_name, role }, session }`
6. Frontend stores in `localStorage('supabase-user')`, uses JWT for API calls

**Two Supabase Clients**:
- `lib/supabase.ts` — public client (anon key), client-side, subject to RLS
- `lib/supabase-admin.ts` — admin client (service_role key), server-side only, bypasses RLS

**API Route Guards** (`lib/api-auth.ts`):
- `requireAuth(request)` — any authenticated user
- `requireAdmin(request)` — `admin` or `super_admin`
- `requireSuperAdmin(request)` — `super_admin` only
- `requireScheduleBoardAccess(request)` — `admin`, `super_admin`, or `salesman`
- Returns discriminated union: `{ authorized: true, userId, role }` or `{ authorized: false, response }`

**Client-Side Auth** (`lib/auth.ts`):
- `getCurrentUser()` — reads from localStorage
- `isAdmin()` — true for `admin` AND `super_admin`
- `isSuperAdmin()` — true for `super_admin` only
- `isSalesman()`, `isOperator()`, `isShopUser()`, `isShopManager()`, `hasRole()`

### Role System

| Role | Dashboard Access | Schedule Board | Job Creation | Special Permissions |
|------|-----------------|----------------|--------------|-------------------|
| `super_admin` | All 11 cards | Full edit (`canEdit: true`) | Auto-approved (`scheduled`) | Approve/reject change requests, modify capacity settings |
| `admin` | 3 cards (Timecard, Schedule Form, Schedule Board) | View only | Goes to `pending_approval` | Can create change requests and notes |
| `salesman` | 3 cards (same as admin) | View only | Goes to `pending_approval` | Can create change requests and notes |
| `operator` | Redirected to `/dashboard` | No access | N/A | View assigned jobs, clock in/out, complete workflow |
| `apprentice` | Same as operator | No access | N/A | Same as operator, differentiated in profile |
| `shop_manager` | Treated as admin | N/A | N/A | Shop-related functionality |
| `shop_hand` | Defined but limited | N/A | N/A | — |
| `inventory_manager` | Defined but limited | N/A | N/A | — |

### Database Schema (Key Tables)

**`profiles`**: `id` (FK auth.users), `email`, `full_name`, `role`, `phone`, `active`, timestamps

**`job_orders`** (core dispatch table):
- Identity: `job_number` (unique), `title`, `customer_name`, `customer_contact`, `job_type`
- Location: `location`, `address`
- Assignment: `assigned_to` UUID (FK), `helper_assigned_to` UUID (FK), `foreman_name`, `salesman_name`
- Status: `scheduled | assigned | in_route | in_progress | completed | cancelled | pending_approval`
- Priority: `low | medium | high | urgent`
- Scheduling: `scheduled_date`, `end_date`, `arrival_time`, `shop_arrival_time`, `estimated_hours`
- Time tracking: `assigned_at`, `route_started_at`, `work_started_at`, `work_completed_at` → triggers compute `drive_time`, `production_time`, `total_time`
- Equipment: `equipment_needed` TEXT[], `special_equipment` TEXT[]
- Financial: `estimated_cost`, `quoted_amount`
- JSONB fields: `jobsite_conditions`, `site_compliance`, `scheduling_flexibility`
- Will-call: `is_will_call` BOOLEAN, `difficulty_rating` (1-10)
- Soft delete: `deleted_at`, `deleted_by`
- Created via: `created_via` ('quick_add' or 'schedule_form')

**`schedule_change_requests`**: request_type (`reschedule | reassign | cancel | other`), status (`pending | approved | rejected`). Admin/salesman create; super_admin approves.

**`schedule_settings`**: Key-value JSONB config. Currently used for `capacity: { max_slots, warning_threshold }`. Super_admin only for writes.

**`job_notes`**: Notes on jobs. `note_type` ('manual' or 'change_log'). Admin/super_admin access.

**`time_clock`**: `clock_in_time`, `clock_out_time`, GPS locations as JSONB, auto-calculated `total_hours`

**`access_requests`**: Self-registration. Anyone can INSERT. Admin approves → creates auth user + profile.

**Views**:
- `schedule_board_view` — joins job_orders with profiles for names, includes notes_count + pending_change_requests_count
- `active_job_orders` — non-deleted jobs with operator name
- `recent_completed_jobs` — last 90 days
- `operator_performance_summary` — aggregated stats

### Key Business Rules

**Job Order Lifecycle**:
1. Created via Schedule Form (8-step wizard) or Quick Add
2. If creator is `super_admin` → status = `scheduled` (auto-approved)
3. If creator is `admin` or `salesman` → status = `pending_approval`
4. Pending jobs appear in global queue on Schedule Board sidebar
5. Super_admin approves → job gets `scheduled_date` and enters the board
6. Assignment: `assigned_to` set → status = `assigned`
7. Progression: `scheduled → assigned → in_route → in_progress → completed`
8. Completion triggers archive to `completed_jobs_archive`

**Schedule Board Rules**:
- Access: `admin`, `super_admin`, `salesman` (via `requireScheduleBoardAccess`)
- Edit: Only `super_admin` (returned in API meta: `canEdit: auth.role === 'super_admin'`)
- Capacity: Configurable max_slots (default 10) and warning_threshold (default 8)
- Will-call jobs: Fetched globally (not date-filtered), shown separately
- Pending jobs: Fetched globally, shown in sidebar queue

**Job Numbering**:
- Schedule Form: `JOB-{year}-{random 6 digits}`
- Quick Add: `QA-{year}-{random 6 digits}`

**Soft Deletes**: `job_orders` uses `deleted_at`/`deleted_by`. All views filter `WHERE deleted_at IS NULL`.

**RLS**: All tables have RLS enabled. API routes use `supabaseAdmin` (service_role) which bypasses RLS. RLS is a second line of defense for direct database access.

### API Response Format
```
Success: { success: true, data: { ... }, [message: '...'], [meta: { userRole, canEdit }] }
Error:   { error: 'Human-readable message' } with HTTP status 4xx/5xx
```

### Project Structure (Key Paths)
```
app/
  api/admin/schedule-board/     — main board, assign, capacity, settings, operators, quick-add, reorder
  api/admin/job-orders/         — CRUD with audit trail
  api/admin/change-requests/    — schedule change requests
  api/admin/job-notes/          — notes on jobs
  api/auth/login/               — login endpoint
  dashboard/admin/              — admin pages (11 modules)
  dashboard/admin/schedule-board/ — schedule board + _components/
  dashboard/job-schedule/[id]/  — operator job workflow (15+ sub-pages)
components/                     — ~58 shared components
lib/                           — auth.ts, api-auth.ts, supabase.ts, supabase-admin.ts
supabase/migrations/           — 53 migration files
```
