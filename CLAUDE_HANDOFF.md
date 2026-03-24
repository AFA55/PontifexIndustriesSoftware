# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** March 24, 2026 (Session 2) | **Branch:** `feature/schedule-board-v2` | **Build Status:** PASSING ✓ 177/177 pages

---

## CURRENT STATE

### Git Status
- **Branch:** `feature/schedule-board-v2` (pushed to origin)
- **Last commit:** `a0d9050d` — "feat: auto-refresh Active Jobs page every 30s with live indicator"
- **Clean working tree** (all changes committed and pushed)

### Recent Commits (March 24, Session 2)
```
a0d9050d feat: auto-refresh Active Jobs page every 30s with live indicator
fbad6012 fix: use RESEND_FROM_EMAIL env var in liability release + fix husky warning
d42c3e0f feat: send payment receipt email when invoice is paid in full
eab0ec00 feat: notify admins when job is completed (ready to invoice)
a8f92226 feat: real-time analytics dashboard + security fixes + silica plan email
2fc57a8c fix: mobile responsiveness audit — remaining 8 operator pages
03d2cb05 fix: mobile responsiveness audit — operator pages
ed89cbef fix: wire maintenance request form to damage-report API
```

### Previous Session Commits (March 24, Session 1)
```
94ab0536 fix: use RESEND_FROM_EMAIL env var in invoice send route
e24a256a feat: enforce mandatory signature + QuickBooks CSV export
64547aea fix: add force-dynamic to all client pages + secure remaining API routes
6d6ceaf4 security: replace manual JWT auth with requireAuth/requireAdmin helpers across all API routes
```

### Previous Session Commits (March 20)
```
935573c0 docs: Update handoff — March 20 session (photos, mobile, error handling)
3b1ab8cb fix: Add error handling with retry banners across key pages
58007779 fix: Mobile responsive audit — critical issues across admin pages
97975d0f feat: Photo upload during job execution + enhanced signature capture
6494f198 fix: Improve AI parser accuracy for customer names and addresses
```

### Previous Session Commits (March 19)
```
87b3389d docs: Update handoff — AI auto-schedule + AI smart fill complete
d99d4027 feat: AI Smart Fill — voice/text job parsing for schedule form
528a35b9 feat: AI Auto-Scheduling Engine with one-click operator assignment
d9ecc37a docs: Deep competitive analysis — Pontifex vs CenPoint vs DSM
feddc0a7 feat: Professional invoice PDF generation + create invoice form
2e9b0d13 feat: Apply white-label branding across entire application
bb3d9eb5 feat: White-label branding system with full settings UI
f83b4c15 feat: Customer CRM system with profiles, contacts, and schedule form integration
ab330d34 feat: Drag-and-drop schedule board with operator view + smart skill matching
c17f185f feat: Dispatch ticket PDF redesign + full-page job detail view
```

---

## WHAT WAS BUILT (March 21 Session)

### 1. Global Toast Notification System
- **File:** `contexts/NotificationContext.tsx`
- `useNotifications()` hook — available app-wide via root layout
- Methods: `success()`, `error()`, `warning()`, `info()`, `notify()`
- 5 notification types: success, error, warning, info, offline, reconnected
- Auto-dismiss with animated progress bar (8s errors, 6s warnings, 4s info/success)
- Max 5 visible, stacked bottom-right, support for persistent + action buttons
- Wired into root layout: `ThemeProvider > BrandingProvider > NotificationProvider > ErrorBoundary`

### 2. Network/Connection Monitor
- **File:** `components/NetworkMonitor.tsx`
- Detects browser offline/online transitions instantly
- Persistent top banner when offline: "No internet connection"
- "Back online" toast when reconnecting
- Monitors ALL fetch() calls globally — counts 500 errors
- After 3+ server errors → shows "Server issues detected" + retry action
- Periodic health check every 30s when unhealthy (hits `/api/health`)
- Amber animated banner during server degradation

### 3. Global Error Boundary
- **File:** `components/ErrorBoundary.tsx`
- Prevents white screen crashes — catches React render errors
- Full-page recovery UI: "Try Again", "Reload Page", "Go to Dashboard"
- Collapsible technical details section
- Auto-logs crashes to `/api/log-error`
- Also exports `SectionErrorBoundary` — compact inline version for individual sections

### 4. API Error Handling Hook
- **File:** `hooks/useApi.ts`
- `useApi()` hook wraps authenticated fetch with auto error notifications
- Handles: 401 (session expired → redirect), 403 (access denied), 404, 429 (rate limit), 500+
- Methods: `get()`, `post()`, `put()`, `patch()`, `del()`
- Auto-attaches Bearer token from `supabase.auth.getSession()`
- `silent` option to suppress notifications for background calls

### 5. System Health Dashboard
- **Page:** `/dashboard/admin/system-health` (super_admin only)
- **API:** `GET /api/admin/system-health`
- Real-time monitoring: Database, Authentication, Storage services with latency bars
- Color-coded: green (<500ms), amber (<1500ms), red (>1500ms)
- Quick stats: Total Users, Active (24h), Jobs Today, Jobs This Week, Errors (24h)
- Users by role breakdown, Jobs by status with progress bars
- Recent logins timeline, Recent errors with details
- Infrastructure info card: daily backups, SSL/TLS, edge network
- Auto-refresh every 30 seconds (toggle on/off)

### 6. Health Check & Error Logging Endpoints
- **`GET /api/health`** — Public health check, no auth. Returns DB/Auth/Storage status + latency
- **`POST /api/log-error`** — Client error logging, no auth. Stores in `error_logs` table

### 7. SaaS Multi-Tenant Foundation
- **Page:** `/dashboard/admin/tenant-management` (super_admin only)
- **API:** `GET/POST /api/admin/tenants` + `GET/PATCH/DELETE /api/admin/tenants/[id]`
- Create tenants: name, slug, custom domain, plan (starter/professional/enterprise)
- Feature flags per tenant: billing, analytics, inventory, NFC, CRM, AI scheduling
- Max users and jobs/month limits
- Suspend/reactivate tenants with audit logging
- Owner assignment by email, billing email tracking
- Soft delete (status → 'cancelled') not hard delete

### 8. Automated Backup System
- **API:** `GET/POST /api/admin/backups`
- Manual backup: exports critical tables (profiles, job_orders, customers, invoices, work_items, daily_job_logs) as JSON to Supabase Storage `backups` bucket
- Auto-creates storage bucket if missing
- Tracks: type, status, size, duration, storage path
- Supabase automatic daily backups info displayed (point-in-time recovery, 7-day retention)
- Backup history UI with size/duration details

### 9. Database Migration (UNAPPLIED)
- **File:** `supabase/migrations/20260320_add_error_logs_tenants_backups.sql`
- Creates 4 tables: `error_logs`, `tenants`, `tenant_users`, `backup_logs`
- RLS policies for all tables
- Supabase MCP had network errors — need to apply when connection restores
- **To apply:** Use Supabase MCP `apply_migration` or run SQL directly in Supabase Dashboard

### 10. Admin Dashboard Cards Added
- **Platform Management** card → `/dashboard/admin/tenant-management`
- **System Health** card → `/dashboard/admin/system-health`
- Both added to `ADMIN_CARDS` array in `lib/rbac.ts`

---

## WHAT WAS BUILT (March 24, Session 2)

### 1. Real Analytics Dashboard
- **API:** `GET /api/admin/analytics` — live business metrics from DB
- **Page:** `/dashboard/admin/analytics` — replaced placeholder with real data
- KPI cards: jobs this month, quoted revenue, AR outstanding, collection rate
- Operator utilization bars (7-day hours per operator)
- Job status breakdown chart (YTD)
- Job type breakdown (top 5 types)
- 30-day job volume bar chart with completed overlay
- MoM comparison badges on key metrics
- Quick links to P&L, Timecards, Billing, Operator Profiles

### 2. Security Fix — P&L API Auth
- `app/api/admin/job-pnl/route.ts` and `[id]/route.ts` had `instanceof NextResponse` check (always false) — fixed to `!auth.authorized` pattern
- This was silently letting unauthenticated requests through

### 3. Silica Plan Email — Wired to Resend
- `app/api/silica-plan/submit/route.ts` previously had console.log stub
- Now sends real email via Resend with PDF attachment when `customerEmail` provided

### 4. Payment Receipt Email
- `app/api/admin/invoices/[id]/payment/route.ts` — sends receipt email to customer when invoice fully paid
- Includes invoice #, payment date, method, amount, zero balance confirmation

### 5. Admin Job Completion Notifications
- `app/api/job-orders/[id]/status/route.ts` — fire-and-forget: when job → 'completed', creates `schedule_notifications` for all admin/super_admin/ops_manager users
- Type: 'job_completed', prompts admin to invoice

### 6. Liability Release Email Fix
- Was hardcoded to `noreply@pontifexindustries.com`
- Now uses `RESEND_FROM_EMAIL` env var (consistent with all other routes)

### 7. Active Jobs Auto-Refresh
- `app/dashboard/admin/active-jobs/page.tsx` — auto-refreshes every 30s silently
- 'Live' green pulse badge + last-refreshed timestamp in header
- Toggle button to pause auto-refresh

### 8. Husky Pre-commit Fix
- Removed deprecated `#!/usr/bin/env sh` and `. husky.sh` lines (was printing DEPRECATED warning on every commit)

---

## SPRINT STATUS (Target: April 2, 2026)

### Week 1 — Core Features COMPLETE
- [x] Dispatch ticket PDF generation
- [x] Customer signature capture in job completion flow (mandatory — enforced March 24)
- [x] Photo upload during job execution
- [x] PDF invoice generation
- [x] QuickBooks CSV export from billing page (added March 24)

### Week 2 — Polish & Launch (In Progress)
- [x] Mobile responsive audit (critical fixes done)
- [x] Loading states & error handling audit
- [x] Global error handling + crash prevention
- [x] System health monitoring dashboard
- [x] SaaS multi-tenant foundation
- [x] Backup system (auto daily + manual snapshots)
- [x] Full API security audit — all routes use requireAuth/requireAdmin (March 24)
- [x] SSR prerender fix — all 69 client pages have `force-dynamic` (March 24)
- [x] Invoice email send via Resend (March 24)
- [x] Invoice payment recording (March 24)
- [ ] **Apply pending migrations** (requires Supabase dashboard SQL Editor — see below)
- [ ] E2E workflow testing (schedule → dispatch → execute → complete → invoice)
- [ ] Remove `NEXT_PUBLIC_BYPASS_LOCATION_CHECK=true` from production env
- [ ] Production deployment prep (env vars, custom domain, SSL)
- [ ] Final build verification & merge to main

### Bonus Features Built (Ahead of Schedule)
- [x] AI Auto-Scheduling Engine (one-click operator assignment)
- [x] AI Smart Fill (voice/text NLP for schedule form)
- [x] Customer CRM system with autocomplete
- [x] Drag-and-drop schedule board with operator view
- [x] White-label branding system
- [x] Global notification system + network monitoring
- [x] System health dashboard + error tracking
- [x] Multi-tenant SaaS foundation
- [x] Manual + automatic backup system
- [x] Rate limiting for SMS/email endpoints (middleware)

---

## WHAT TO DO NEXT

### Immediate Priority
1. **Apply pending migrations** — Run SQL in Supabase Dashboard SQL Editor:
   - `supabase/migrations/20260320_add_error_logs_tenants_backups.sql`
   - `supabase/migrations/20260324_timecard_job_linkage_and_pnl.sql`
2. E2E workflow testing — test the full pipeline end-to-end
3. Remove `NEXT_PUBLIC_BYPASS_LOCATION_CHECK=true` from `.env.local` before production
4. Production deployment: configure Vercel env vars from `.env.example`, custom domain, SSL

### Production Env Checklist (all in .env.example)
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL`
- `NEXT_PUBLIC_APP_URL` → set to real domain (not localhost)
- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_PHONE_NUMBER` (or install twilio package)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- **DO NOT** set `NEXT_PUBLIC_BYPASS_LOCATION_CHECK` in production

### Nice-to-Have (If Time Allows)
- AR aging warnings on dispatch screen
- Stripe payment links on invoices
- Schedule board performance optimization for large datasets
- Notification system polish (SMS/email for job assignments)

### Deprioritized by User
- ~~Diamond blade intelligence~~
- ~~Equipment management enhancements~~
- ~~Certified payroll~~
- ~~Estimate-to-job pipeline~~

---

## UNAPPLIED MIGRATIONS
1. `20260320_add_error_logs_tenants_backups.sql` — error_logs, tenants, tenant_users, backup_logs tables
2. `20260324_timecard_job_linkage_and_pnl.sql` — job_order_id on timecards, labor_cost trigger, job_pnl_summary view

---

## KEY PATTERNS & CONVENTIONS

### Authentication
- **Token retrieval**: Always `supabase.auth.getSession()` — NEVER localStorage for tokens
- **API auth**: `requireAdmin()` / `requireSuperAdmin()` / `requireAuth()` from `lib/api-auth.ts`
- **Client guard**: `getCurrentUser()` from `lib/auth.ts` (synchronous, reads localStorage)
- **Schedule board access**: `requireScheduleBoardAccess()` — admin, super_admin, salesman, ops_manager, supervisor
- `canEdit` on schedule board = `role === 'super_admin'` only

### UI/Styling
- Purple/dark theme with Tailwind CSS
- lucide-react icons throughout
- Input fields: always `text-gray-900 bg-white` (black text on white background)
- Mobile-first responsive design
- Rounded corners: `rounded-xl` or `rounded-2xl`
- Cards: `bg-white rounded-2xl border border-gray-200 p-5`

### Data
- **Branding**: Use `useBranding()` hook for dynamic company name/colors
- **Notifications**: Use `useNotifications()` hook for toast messages
- **API calls**: Use `useApi()` hook for auto-error-handled fetch, or manual fetch with `supabase.auth.getSession()` for token
- **PDFs**: Server-side only with @react-pdf/renderer, NO React hooks in PDF components
- **Photos**: PhotoUploader component → Supabase Storage `job-photos` bucket
- **Signatures**: Upload to Storage as PNG, fallback to base64 in DB
- **Fire-and-forget logging**: `Promise.resolve(supabaseAdmin.from(...).insert(...)).then(...).catch(() => {})`

### API Response Format
```
Success: { success: true, data: {...} }
Error: { error: 'message' } with HTTP status 4xx/5xx
```

### Job Numbers
- Schedule Form: `JOB-{year}-{6 digits}`
- Quick Add: `QA-{year}-{6 digits}`

### Roles (priority order)
super_admin > operations_manager > admin > salesman > shop_manager > inventory_manager > operator > apprentice

---

## FILE STRUCTURE REFERENCE

### Root Layout Provider Stack
```
ThemeProvider > BrandingProvider > NotificationProvider > ErrorBoundary > NetworkMonitor > GoogleMapsProvider > App
```

### Key Contexts
- `contexts/ThemeContext.tsx` — dark/light mode
- `contexts/NotificationContext.tsx` — global toast notifications
- `lib/branding-context.tsx` — tenant branding (company name, colors, logos)

### Key Hooks
- `hooks/useApi.ts` — authenticated fetch with auto error handling
- `hooks/useAuth.ts` — auth state management
- `hooks/useVoiceInput.ts` — Web Speech API voice input
- `hooks/useWorkflow.ts` — operator job workflow state

### Key Libraries
- `lib/api-auth.ts` — API route auth guards (requireAdmin, requireSuperAdmin, etc.)
- `lib/auth.ts` — Client-side auth helpers (getCurrentUser, isAdmin, etc.)
- `lib/supabase.ts` — Public Supabase client (client-side, respects RLS)
- `lib/supabase-admin.ts` — Admin Supabase client (server-side, bypasses RLS)
- `lib/rbac.ts` — ADMIN_CARDS array, ROLE_PERMISSION_PRESETS, role definitions
- `lib/audit.ts` — Audit logging helper

### Admin Pages (27 total)
```
/dashboard/admin/
  access-requests, active-jobs, all-equipment, analytics, billing,
  completed-job-tickets, completed-jobs, create-estimate, create-job,
  customers, debug, equipment-performance, equipment-units, jobs,
  maintenance-schedules, operator-profiles, operators, ops-hub,
  schedule-board, schedule-form, settings, system-health,
  team-management, tenant-management, timecards, upcoming-projects
```

### API Routes (38 categories)
```
/api/
  access-requests, admin/*, auth, card-permissions, contractors,
  demo-request, equipment, equipment-units, equipment-usage, geocode,
  google-maps, health, helper-work-log, inventory, job-hazard-analysis,
  job-orders, liability-release, log-error, maps, migrations, my-profile,
  onboarding, operator, operator-ratings, send-email, send-sms,
  service-completion-agreement, setup, shop, silica-plan, sms, standby,
  time-clock, timecard, users, work-items, work-order-agreement, workflow
```

### Admin API Sub-routes
```
/api/admin/
  backups, billing, branding, change-requests, completed-jobs,
  contractors, customers, job-notes, job-orders/[id], operators,
  schedule-board (+ assign, auto-schedule, capacity, dispatch,
    missing-info, notify, operators, quick-add, reorder, settings,
    skill-match), schedule-form/ai-parse, settings/branding,
  suggestions, system-health, team, tenants/[id], timecards, users
```

### Database (73 migration files)
- Project ref: `klatddoyncxidgqtcjnu`
- Key views: `schedule_board_view`, `active_job_orders`, `recent_completed_jobs`, `operator_performance_summary`
- All tables have RLS enabled
- New tables use JWT metadata for RLS: `auth.jwt() -> 'user_metadata' ->> 'role'`
