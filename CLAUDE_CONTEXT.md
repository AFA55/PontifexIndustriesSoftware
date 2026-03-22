# Pontifex Industries Platform — Claude Context Document
**Last Updated:** March 21, 2026
**Use this as context when starting a new Claude session on this project.**

---

## Project Overview
A full-stack construction operations platform for **Pontifex Industries** (white-label as **Patriot Concrete Cutting**). Manages field operators, job scheduling, time tracking, equipment inventory, compliance documents (OSHA silica, JHA, liability releases), invoicing, customer CRM, AI-powered scheduling, and multi-tenant SaaS infrastructure.

## Tech Stack
- **Frontend:** Next.js 15.5.12 (App Router), React 19, TypeScript 5, Tailwind CSS 3.3
- **Backend:** Next.js API Routes (100+ route handlers across 38 categories)
- **Database:** Supabase (PostgreSQL) with Row Level Security — project ref: `klatddoyncxidgqtcjnu`
- **Auth:** Supabase Auth with Bearer token validation, 8-tier role hierarchy
- **Email:** Resend API (from: `noreply@admin.pontifexindustries.com`)
- **SMS:** Telnyx
- **PDF Generation:** @react-pdf/renderer + jspdf + html2canvas
- **Charts:** Recharts
- **Maps:** Google Maps (Places API, geocoding, GPS geofencing)
- **Icons:** lucide-react
- **Animations:** Framer Motion 12
- **QR/Barcode:** ZXing
- **Voice:** Web Speech API (SpeechRecognition)
- **Deployment:** Vercel
- **Git:** GitHub (AFA55/PontifexIndustriesSoftware), branch: `feature/schedule-board-v2`

## Project Location
```
/Users/afa55/Documents/Pontifex Industres/pontifex-platform
```

## Vercel Deployment
- **Project:** `pontifex-industries-software-z8py` (ID: `prj_xWRkagEyB6C1rxX81IOQKJynLQd1`)
- **Team:** `team_9PEEftgbKgEZCHzklblcjKKa`
- **Production URL:** `https://pontifex-industries-software-z8py.vercel.app`

---

## Key Architecture

### Root Layout Provider Stack
```
ThemeProvider > BrandingProvider > NotificationProvider > ErrorBoundary > NetworkMonitor > GoogleMapsProvider > App
```

### Authentication Flow
1. POST `{ email, password }` → `/api/auth/login`
2. Server calls `supabase.auth.signInWithPassword()`
3. Fetches profile via `supabaseAdmin` (service_role, bypasses RLS)
4. Checks `profile.active` — inactive = 403
5. Returns `{ success, user: { id, email, full_name, role }, session }`
6. Frontend stores in `localStorage('supabase-user')`, uses JWT for API calls

### Two Supabase Clients
- `lib/supabase.ts` — public client (anon key), client-side, subject to RLS
- `lib/supabase-admin.ts` — admin client (service_role key), server-side only, bypasses RLS

### API Route Guards (`lib/api-auth.ts`)
- `requireAuth(request)` — any authenticated user
- `requireAdmin(request)` — admin, super_admin, operations_manager, supervisor, salesman
- `requireSuperAdmin(request)` — super_admin only
- `requireScheduleBoardAccess(request)` — admin, super_admin, salesman, operations_manager, supervisor
- `requireOpsManager(request)` — super_admin, operations_manager
- `requireShopUser(request)` / `requireShopManager(request)` — stubs
- Returns discriminated union: `{ authorized: true, userId, userEmail, role }` or `{ authorized: false, response }`
- Also exports `isTableNotFoundError(error)` helper for graceful missing-table handling

### Client-Side Auth (`lib/auth.ts`)
- `getCurrentUser()` — reads from localStorage (synchronous, returns User | null)
- `isAdmin()`, `isSuperAdmin()`, `isSalesman()`, `isOperator()`, `isShopUser()`, `isShopManager()`, `hasRole()`

### Role System (8 tiers, priority order)
```
super_admin > operations_manager > admin > salesman > shop_manager > inventory_manager > operator > apprentice
```

| Role | Dashboard | Schedule Board | Job Creation | Special |
|------|-----------|---------------|--------------|---------|
| `super_admin` | All cards | Full edit (`canEdit`) | Auto-approved | Approve changes, settings, capacity, tenant mgmt, system health |
| `operations_manager` | Most cards | View + diagnostics | Via admin | Ops hub, system monitoring |
| `admin` | Configurable cards | View only | → `pending_approval` | Change requests, notes |
| `salesman` | 3 cards | View only | → `pending_approval` | Change requests, notes |
| `supervisor` | Configurable | View only | — | Notes, view schedules |
| `shop_manager` | Shop module | No | — | Shop management |
| `operator` | My Jobs | No | — | Job workflow, clock in/out |
| `apprentice` | My Jobs | No | — | Same as operator |

### RBAC Card System (`lib/rbac.ts`)
- `ADMIN_CARDS` array — 17 dashboard cards with key, title, icon, href, features
- `ROLE_PERMISSION_PRESETS` — default card access per role
- Cards include: Timecards, Schedule Form, Schedule Board, Team Management, Analytics, Equipment Performance, Operator Profiles, Completed Jobs, Blade Inventory, Tools & Equipment, Billing, Customer Profiles, Operations Hub, Platform Management, System Health, Settings

---

## Database Schema (Key Tables)

### Core Tables
- **`profiles`**: id (FK auth.users), email, full_name, role, phone, active, avatar_url
- **`job_orders`**: job_number, title, customer_name, customer_contact, job_type, location, address, assigned_to (UUID), helper_assigned_to (UUID), status, priority, scheduled_date, end_date, arrival_time, estimated_hours, estimated_cost, equipment_needed[], jobsite_conditions (JSONB), site_compliance (JSONB), scheduling_flexibility (JSONB), is_will_call, difficulty_rating, photo_urls[], created_via
- **`customers`**: name, email, phone, company, address, city, state, zip, notes, contact_persons (JSONB)
- **`invoices`**: invoice_number, job_order_id, customer data, line_items (JSONB), subtotal, tax, total, status (draft/sent/paid/overdue), due_date, paid_date
- **`daily_job_logs`**: job_order_id, operator_id, day_number (auto-increment trigger), work_items, notes, photos
- **`work_items`**: job_log_id, service_type, quantity, unit, depth, notes

### Auth & Access
- **`access_requests`**: Self-registration. Public INSERT. Admin approves → creates auth user + profile
- **`audit_logs`**: user_id, action, resource_type, resource_id, details (JSONB)

### Schedule Board
- **`schedule_change_requests`**: request_type (reschedule/reassign/cancel), status (pending/approved/rejected)
- **`schedule_settings`**: Key-value JSONB config (capacity: max_slots, warning_threshold)
- **`job_notes`**: note_type (manual/change_log)
- **`schedule_notifications`**: operator_id, type, message, is_read

### Equipment & Inventory
- **`equipment`**: name, type, serial_number, status, assigned_to, location
- **`blade_assignments`**: Blade inventory tracking
- **`maintenance_requests`**: Equipment maintenance tracking

### SaaS Multi-Tenant (NEW — migration pending)
- **`tenants`**: name, slug, domain, status (active/suspended/trial/cancelled), plan (starter/professional/enterprise), max_users, max_jobs_per_month, features (JSONB), owner_id
- **`tenant_users`**: tenant_id, user_id, role, invited_by
- **`error_logs`**: type, error_message, stack_trace, url, user_agent, metadata (JSONB)
- **`backup_logs`**: backup_type, status, size_bytes, duration_ms, storage_path

### Key Views
- `schedule_board_view` — joins job_orders with profiles, includes notes_count + pending_change_requests_count
- `active_job_orders` — non-deleted jobs with operator name
- `recent_completed_jobs` — last 90 days
- `operator_performance_summary` — aggregated stats

### Key Business Rules
- Job created by super_admin → status = `scheduled` (auto-approved)
- Job created by admin/salesman → status = `pending_approval`
- Job lifecycle: `pending_approval → scheduled → assigned → in_route → in_progress → completed`
- Will-call jobs: fetched globally (not date-filtered), shown separately on board
- Job numbers: `JOB-{year}-{6 digits}` (schedule form) or `QA-{year}-{6 digits}` (quick add)
- Soft deletes on job_orders via `deleted_at`/`deleted_by`
- All views filter `WHERE deleted_at IS NULL`
- Capacity: configurable max_slots (default 10) and warning_threshold (default 8)

---

## API Routes (38 categories, 100+ handlers)

### Core Operations
- `api/job-orders/` — CRUD, submit, status, daily logs, history, photos
- `api/timecard/` — Clock in/out, current, history
- `api/time-clock/` — Time clock system
- `api/workflow/` — Workflow management
- `api/work-items/` — Work item tracking

### Admin
- `api/admin/schedule-board/` — Main board + assign, auto-schedule, capacity, dispatch, missing-info, notify, operators, quick-add, reorder, settings, skill-match
- `api/admin/schedule-form/ai-parse` — NLP job description parser
- `api/admin/job-orders/[id]` — Admin job CRUD with audit
- `api/admin/billing/` — Invoice management
- `api/admin/customers/` — Customer CRM
- `api/admin/tenants/` — Multi-tenant management (super_admin)
- `api/admin/system-health/` — System monitoring (super_admin)
- `api/admin/backups/` — Manual backup system (super_admin)
- `api/admin/branding/` — White-label branding settings
- `api/admin/change-requests/` — Schedule change requests
- `api/admin/team/` — Team management
- `api/admin/users/` — User management
- `api/admin/timecards/` — Timecard admin

### Infrastructure
- `api/health/` — Public health check (no auth), DB/Auth/Storage status + latency
- `api/log-error/` — Client error logging (no auth), stores in error_logs table

### Equipment & Inventory
- `api/equipment/` — Damage reports, maintenance, turn-in, repair
- `api/equipment-units/` — Equipment unit management
- `api/equipment-usage/` — Usage logs
- `api/inventory/` — Stock, assignments, history

### Compliance & Documents
- `api/silica-plan/` — OSHA silica exposure plans
- `api/job-hazard-analysis/` — JHA forms
- `api/liability-release/` — Liability releases + PDF
- `api/work-order-agreement/` — Work order PDFs
- `api/service-completion-agreement/` — Service completion

### Communication
- `api/send-email/` — Resend email (auth required)
- `api/send-sms/` — Telnyx SMS (auth required)

---

## Dashboard Pages

### Admin Pages (27)
```
/dashboard/admin/
  access-requests, active-jobs, all-equipment, analytics, billing,
  completed-job-tickets, completed-jobs, create-estimate, create-job,
  customers, debug, equipment-performance, equipment-units, jobs,
  maintenance-schedules, operator-profiles, operators, ops-hub,
  schedule-board, schedule-form, settings (+ settings/branding),
  system-health, team-management, tenant-management, timecards, upcoming-projects
```

### Operator Pages
```
/dashboard/ — Main dashboard (role-based cards)
/dashboard/my-jobs — Assigned jobs for today
/dashboard/my-jobs/[id] — Job detail
/dashboard/my-jobs/[id]/jobsite — Jobsite info
/dashboard/job-schedule/[id]/ — Job workflow pages:
  in-route, jobsite, work-performed, day-complete, complete, standby
/dashboard/timecard — Time clock
/dashboard/my-profile — Profile management
/dashboard/request-time-off — PTO requests
/dashboard/tools/ — Equipment scanning, blade management, damage, maintenance
/dashboard/shop — Shop management
/dashboard/inventory — Equipment inventory
```

---

## Key Components

### Schedule Board Components (`app/dashboard/admin/schedule-board/_components/`)
ApprovalModal, AssignOperatorModal, ChangeRequestModal, ConflictModal, DailyNotesSection, DndBoardWrapper, DraggableJobCard, DroppableOperatorRow, EditJobPanel, JobCard, JobDetailView, JobPreviewPanel, MissingInfoModal, NotesDrawer, OperatorRow, OperatorRowView, PendingQueueSidebar, QuickAddModal, ScheduleDatePicker, SendBackModal, SkillMatchIndicator, Toast, ViewToggle

### Global Components
- `components/ErrorBoundary.tsx` — Full-page + SectionErrorBoundary
- `components/NetworkMonitor.tsx` — Offline/online detection + server health
- `components/AuthGuard.tsx` — Route protection
- `components/AdminProtection.tsx` — Admin route guard
- `components/PhotoUploader.tsx` — Camera/file upload to Supabase Storage
- `components/SignatureCanvas.tsx` — Touch signature capture

### Contexts
- `contexts/NotificationContext.tsx` — Global toast notifications
- `contexts/ThemeContext.tsx` — Dark/light mode
- `lib/branding-context.tsx` — Tenant branding (company name, colors, logos)

### Hooks
- `hooks/useApi.ts` — Authenticated fetch with auto error handling
- `hooks/useAuth.ts` — Auth state management
- `hooks/useVoiceInput.ts` — Web Speech API voice input
- `hooks/useWorkflow.ts` — Operator job workflow state
- `hooks/useJobs.ts` — Job data fetching

---

## Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
TELNYX_API_KEY=
TELNYX_FROM_NUMBER=
NEXT_PUBLIC_APP_URL=
```

## Build & Deploy
```bash
npm run dev        # Dev server (port 3000)
npm run build      # Production build check (must pass with 0 errors)
git push origin feature/schedule-board-v2  # Push to working branch
git push origin main  # Triggers Vercel auto-deploy (production)
```

## Security Posture
- All API routes use `requireAuth()` or `requireAdmin()` (except intentionally public ones)
- All tables have RLS enabled with proper ownership-based policies
- Rate limiting on public endpoints (10 req/min per IP)
- Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- SSRF protection on PDF URL fetching
- HTML sanitization in email templates
- Global error boundary prevents crash data leakage
- Client errors logged to `error_logs` table for monitoring
- Network monitor detects connectivity issues before they cause data loss

## 73 Database Migrations in `supabase/migrations/`
- Latest: `20260320_add_error_logs_tenants_backups.sql` (UNAPPLIED — Supabase MCP network error)
