# Pontifex Industries Platform — Session Context
> Last updated: 2026-03-21
> Use this file to resume work after a session restart.

---

## PART 1: CURRENT WORK IN PROGRESS

### Build Status
- Build PASSING (zero errors)
- All changes committed and pushed to `feature/schedule-board-v2`
- Last commit: `d8740252` — Global error handling, system health, SaaS foundation

### Unapplied Migration
- **File:** `supabase/migrations/20260320_add_error_logs_tenants_backups.sql`
- **Tables:** error_logs, tenants, tenant_users, backup_logs
- **Reason:** Supabase MCP had `net::ERR_FAILED` network errors
- **To apply:** Restart Claude Desktop to reset MCP, then run `apply_migration`

### What Was Built This Sprint (March 19-21)

**AI Features:**
- AI Auto-Scheduling Engine — one-click intelligent operator assignment (`/api/admin/schedule-board/auto-schedule`)
- AI Smart Fill — voice/text NLP job parsing for schedule form (`/api/admin/schedule-form/ai-parse`)
- Smart Fill uses regex-based NLP (no external API costs), parses: service types, core holes, saw cuts, customers, addresses, dates, costs, difficulty, PO numbers, contacts, site conditions

**Core Features:**
- Photo upload during job execution (PhotoUploader → Supabase Storage `job-photos` bucket)
- Enhanced signature capture (uploads PNG to Storage instead of raw base64)
- Professional invoice PDF generation (@react-pdf/renderer server-side)
- Customer CRM system with profiles, contacts, schedule form autocomplete
- Dispatch ticket PDF redesign
- White-label branding system (full settings UI, dynamic company name/colors)

**Infrastructure:**
- Global toast notification system (`useNotifications()` hook)
- Network/connection monitor (offline detection, server health monitoring)
- Global error boundary (prevents white screen crashes)
- `useApi()` hook — authenticated fetch with auto error notifications
- System health dashboard (real-time DB/Auth/Storage monitoring)
- Health check endpoint (`/api/health`)
- Client error logging endpoint (`/api/log-error`)
- SaaS multi-tenant foundation (tenants, tenant_users, plans, feature flags)
- Manual backup system (JSON snapshots to Supabase Storage)

**Polish:**
- Mobile responsive audit (billing, customers, schedule board, schedule form)
- Loading states & error handling audit (retry banners across key pages)
- Competitive analysis document (vs CenPoint, DSM)

### Next Steps
1. Apply pending migration to Supabase
2. E2E workflow testing (schedule → dispatch → execute → complete → invoice)
3. Apply Patriot branding assets (logos, colors)
4. Production deployment prep (env vars, custom domain, SSL)
5. Final build verification & merge to main

---

## PART 2: PLATFORM INFRASTRUCTURE

### Tech Stack
- **Framework**: Next.js 15.5.12 (App Router) + React 19.1.0
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS 3.3.0
- **Database**: Supabase (PostgreSQL) — project ref: `klatddoyncxidgqtcjnu`
- **Auth**: Supabase Auth with JWT Bearer tokens
- **Email**: Resend (from `noreply@admin.pontifexindustries.com`)
- **SMS**: Telnyx
- **Maps**: Google Maps (Places API, geocoding, GPS geofencing)
- **PDF**: @react-pdf/renderer + jspdf + html2canvas
- **Charts**: recharts
- **Icons**: lucide-react
- **Animations**: framer-motion
- **Voice**: Web Speech API (SpeechRecognition)
- **Hosting**: Vercel

### Root Layout Provider Stack
```
ThemeProvider > BrandingProvider > NotificationProvider > ErrorBoundary > NetworkMonitor > GoogleMapsProvider > App
```

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
- `requireAdmin(request)` — admin, super_admin, operations_manager, supervisor, salesman
- `requireSuperAdmin(request)` — super_admin only
- `requireScheduleBoardAccess(request)` — admin, super_admin, salesman, ops_manager, supervisor
- `requireOpsManager(request)` — super_admin, operations_manager
- Returns: `{ authorized: true, userId, userEmail, role }` or `{ authorized: false, response }`

**Client-Side Auth** (`lib/auth.ts`):
- `getCurrentUser()` — synchronous, reads from localStorage, returns User | null
- `isAdmin()`, `isSuperAdmin()`, `isSalesman()`, `isOperator()`

### Role System (8 tiers)
```
super_admin > operations_manager > admin > salesman > shop_manager > inventory_manager > operator > apprentice
```

### Database Schema (Key Tables)

**`job_orders`** (core table):
- Identity: job_number, title, customer_name, job_type
- Location: location, address, latitude, longitude
- Assignment: assigned_to UUID, helper_assigned_to UUID
- Status: pending_approval | scheduled | assigned | in_route | in_progress | completed | cancelled
- Priority: low | medium | high | urgent
- Scheduling: scheduled_date, end_date, arrival_time, shop_arrival_time, estimated_hours
- Financial: estimated_cost, quoted_amount
- JSONB: jobsite_conditions, site_compliance, scheduling_flexibility
- Arrays: equipment_needed[], special_equipment[], photo_urls[]
- Flags: is_will_call, difficulty_rating (1-10)
- Tracking: created_via ('quick_add' | 'schedule_form')
- Soft delete: deleted_at, deleted_by

**`profiles`**: id, email, full_name, role, phone, active, avatar_url

**`customers`**: name, email, phone, company, address, city, state, zip, contact_persons (JSONB)

**`invoices`**: invoice_number, job_order_id, line_items (JSONB), subtotal, tax, total, status (draft/sent/paid/overdue)

**`tenants`** (PENDING MIGRATION): name, slug, domain, status, plan, max_users, features (JSONB)

**`error_logs`** (PENDING MIGRATION): type, error_message, stack_trace, url, metadata (JSONB)

**Views**: schedule_board_view, active_job_orders, recent_completed_jobs, operator_performance_summary

### Key Business Rules

**Job Lifecycle**:
1. Created via Schedule Form (8-step) or Quick Add
2. super_admin → `scheduled` (auto-approved); admin/salesman → `pending_approval`
3. Pending jobs appear in sidebar queue on Schedule Board
4. super_admin approves → scheduled with date on board
5. `assigned_to` set → `assigned`
6. Progression: scheduled → assigned → in_route → in_progress → completed

**Job Numbering**: `JOB-{year}-{6 digits}` (form) or `QA-{year}-{6 digits}` (quick add)

**Schedule Board**: Only `super_admin` can edit (canEdit flag). Capacity is configurable.

**Operator Workflow**: my-jobs → jobsite → work-performed → day-complete → (done for today | complete)

**Billing Pipeline**: completed job → create invoice (draft) → sent → paid

### API Response Format
```
Success: { success: true, data: {...} }
Error:   { error: 'Human-readable message' } with HTTP status 4xx/5xx
```

### Key Coding Patterns
- **Token**: Always `supabase.auth.getSession()` — NEVER localStorage for tokens
- **Logging**: Fire-and-forget: `Promise.resolve(supabaseAdmin.from('audit_logs').insert(...)).catch(() => {})`
- **Inputs**: Always `text-gray-900 bg-white` (black text on white background)
- **Cards**: `bg-white rounded-2xl border border-gray-200 p-5`
- **PDFs**: Server-side only with @react-pdf/renderer, NO React hooks
- **Notifications**: `useNotifications()` for toast messages
- **API calls**: `useApi()` hook or manual fetch with session token
- **Branding**: `useBranding()` for dynamic company name/colors
- **Table not found**: Use `isTableNotFoundError(error)` from api-auth.ts for graceful handling

### Project Structure (Key Paths)
```
app/
  api/admin/schedule-board/     — main board, assign, auto-schedule, capacity, etc.
  api/admin/schedule-form/      — ai-parse endpoint
  api/admin/tenants/            — multi-tenant CRUD
  api/admin/backups/            — backup system
  api/admin/system-health/      — system monitoring
  api/health/                   — public health check
  api/log-error/                — client error logging
  dashboard/admin/              — 27 admin pages
  dashboard/admin/schedule-board/ — schedule board + 23 sub-components
  dashboard/admin/system-health/  — system health dashboard
  dashboard/admin/tenant-management/ — tenant + backup management
  dashboard/job-schedule/[id]/  — operator job workflow (6+ sub-pages)
components/                     — ~60 shared components
  ErrorBoundary.tsx             — global crash prevention
  NetworkMonitor.tsx            — offline/server health detection
contexts/
  NotificationContext.tsx       — global toast notification system
  ThemeContext.tsx               — dark/light mode
hooks/
  useApi.ts                     — authenticated fetch wrapper
  useVoiceInput.ts              — Web Speech API
lib/
  api-auth.ts                   — API route guards
  auth.ts                       — client auth helpers
  rbac.ts                       — ADMIN_CARDS, roles, permissions
  branding-context.tsx          — white-label branding
  supabase.ts / supabase-admin.ts — DB clients
supabase/migrations/            — 73 migration files
```

### Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY, RESEND_FROM_EMAIL
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
TELNYX_API_KEY, TELNYX_FROM_NUMBER
NEXT_PUBLIC_APP_URL
```
