# Patriot Concrete Cutting Platform — Architecture Reference
**Last Updated:** March 23, 2026 | **Build Status:** PASSING

---

## Project Overview
Full-stack construction operations platform for **Patriot Concrete Cutting** (formerly Pontifex Industries). Manages job scheduling, field operator workflows, time tracking, equipment inventory, OSHA compliance (silica, JHA, liability releases), invoicing, customer CRM, AI-powered scheduling, analytics dashboards, and multi-tenant SaaS infrastructure.

## Tech Stack
| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 15.5.12 (App Router) + React 19 + TypeScript 5 |
| **Styling** | Tailwind CSS 3.3 |
| **Database** | Supabase (PostgreSQL) — project ref: `klatddoyncxidgqtcjnu` |
| **Auth** | Supabase Auth with Bearer token validation, 9-tier role hierarchy |
| **Email** | Resend API |
| **SMS** | Telnyx (primary) + Twilio (legacy) |
| **PDF** | @react-pdf/renderer + jspdf + html2canvas |
| **Charts** | Recharts (bar, line, pie, donut) |
| **Maps** | Google Maps (Places, geocoding, GPS geofencing) |
| **Drag & Drop** | react-grid-layout (analytics dashboard), @dnd-kit (schedule board) |
| **Icons** | lucide-react |
| **Animations** | Framer Motion 12 |
| **Voice** | Web Speech API (SpeechRecognition) |
| **Deployment** | Vercel (ready, not yet deployed) |
| **Git** | GitHub: `AFA55/PontifexIndustriesSoftware`, branch: `claude/mystifying-diffie` |

## Scale
- **153 API route handlers** across 40+ categories
- **67 page components** (admin, operator, public)
- **76 database tables** + 12 views
- **75 migration files**
- **271 indexes**, 82 foreign key constraints
- **All 76 tables have RLS enabled**

---

## Infrastructure Architecture

### Root Layout Provider Stack
```
ThemeProvider > BrandingProvider > NotificationProvider > ErrorBoundary > NetworkMonitor > GoogleMapsProvider > App
```

### Two Supabase Clients
- `lib/supabase.ts` — public client (anon key), client-side, subject to RLS
- `lib/supabase-admin.ts` — admin client (service_role key), server-side only, bypasses RLS

### Authentication Flow
1. `POST /api/auth/login` with `{ email, password }`
2. Server: `supabase.auth.signInWithPassword()` → fetch profile via admin client
3. Check `profile.active` (inactive = 403)
4. Return `{ success, user: { id, email, full_name, role }, session }`
5. Frontend: stores user in `localStorage('supabase-user')`, uses JWT for API calls
6. API routes: extract Bearer token → `supabaseAdmin.auth.getUser(token)` → verify role

### API Route Guards (`lib/api-auth.ts`)
```typescript
requireAuth(request)              // any authenticated user
requireAdmin(request)             // admin, super_admin, ops_manager, supervisor, salesman
requireSuperAdmin(request)        // super_admin only
requireScheduleBoardAccess(request) // admin, super_admin, salesman, ops_manager, supervisor
requireOpsManager(request)        // super_admin, operations_manager
```
Returns: `{ authorized: true, userId, userEmail, role }` or `{ authorized: false, response }`

### Client Auth (`lib/auth.ts`)
```typescript
getCurrentUser()  // reads from localStorage (synchronous)
isAdmin(), isSuperAdmin(), isSalesman(), isOperator(), hasRole()
```

### Middleware (Edge Runtime)
- Security headers (X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy)
- Rate limiting on public endpoints (10 req/min per IP, lazy cleanup)
- API response cache prevention

---

## Role System (9 tiers)

```
super_admin > operations_manager > admin > salesman > supervisor > shop_manager > inventory_manager > operator > apprentice
```

| Role | Dashboard | Schedule Board | Analytics | Special Access |
|------|-----------|---------------|-----------|----------------|
| `super_admin` | All widgets + all cards | Full edit | All 20 widgets | Tenant mgmt, system health, backups, settings |
| `operations_manager` | Most widgets + cards | View + diagnostics | 14 widgets | Ops hub, crew utilization |
| `admin` | Configurable widgets | View only | 12 widgets | Change requests, billing, customers |
| `salesman` | Commission + pipeline | View only | 6 widgets | Commission tracking, my jobs |
| `supervisor` | Configurable | View only | Limited | Notes, view schedules |
| `shop_manager` | Shop module | No | No | Shop management |
| `inventory_manager` | Inventory | No | No | Equipment inventory |
| `operator` | My Jobs | No | No | Job workflow, clock in/out |
| `apprentice` | My Jobs | No | No | Same as operator |

---

## Database Schema (Key Tables)

### Core Operations
- **`job_orders`** (139 columns): job_number, customer_name, address, job_type, status, scheduled_date, assigned_to, estimated_cost, completion_signature, photo_urls[], work_started_at, work_completed_at, is_multi_day, equipment_needed[], created_via
- **`profiles`** (37 columns): id (FK auth.users), full_name, email, role, active, phone, commission_rate, skills, avatar_url
- **`customers`** (33 columns): name, primary_contact_email, primary_contact_phone, address, city, state, zip, notes
- **`work_items`** (20 columns): job_order_id, operator_id, work_type, quantity, day_number, core_quantity, core_size, linear_feet_cut, cut_depth_inches
- **`daily_job_logs`** (20 columns): job_order_id, operator_id, log_date, day_number, hours_worked, work_performed (JSONB)

### Billing
- **`invoices`** (28 columns): invoice_number, customer_name, subtotal, total_amount, balance_due, status (draft/sent/paid/overdue/void), due_date, payment_terms
- **`invoice_line_items`** (14 columns): invoice_id, job_order_id, description, quantity, unit_rate, amount, billing_type

### Analytics Dashboard
- **`dashboard_layouts`**: user_id (unique), layout (JSONB) — persists widget positions per user
- **`dashboard_notes`**: user_id, title, content, color, pinned, shared — personal sticky notes
- **`dashboard_tasks`**: user_id, title, completed, priority, due_date — personal todo items
- **`team_messages`**: author_id, author_name, content, channel — internal chat feed

### Schedule Board
- **`schedule_change_requests`**: request_type, status (pending/approved/rejected)
- **`schedule_settings`**: key-value JSONB config
- **`job_notes`**: note_type (manual/change_log), content
- **`schedule_notifications`**: operator_id, type, message, is_read

### SaaS Infrastructure
- **`tenants`**: name, slug, domain, status, plan, features (JSONB), max_users
- **`tenant_users`**: tenant_id, user_id, role
- **`error_logs`**: type, error_message, stack_trace, url, metadata (JSONB)
- **`backup_logs`**: backup_type, status, size_bytes, duration_ms, storage_path
- **`tenant_branding`**: company_name, logo_url, colors

### Key Views (12)
```
schedule_board_view, active_job_orders, recent_completed_jobs,
operator_performance_summary, ar_aging, financial_dashboard,
current_operator_rates, job_document_stats, job_orders_history_readable,
payroll_period_summary, timecards_with_users, work_accessibility_analytics
```

### Key Business Rules
- Job by super_admin → `scheduled` (auto-approved)
- Job by admin/salesman → `pending_approval`
- Job lifecycle: `pending_approval → scheduled → assigned → dispatched → in_route → on_site → in_progress → completed`
- Job numbers: `JOB-{year}-{6 digits}` or `QA-{year}-{6 digits}`
- Invoice numbers: `INV-{year}-{6 digits}` (5 retry collision avoidance)
- Default billing rates: Core Drilling $150/core, Wall Sawing $12/LF, Labor $125/hr
- Soft deletes on job_orders via `deleted_at`/`deleted_by`
- Work items persisted to DB via daily-log API (fire-and-forget)
- Photos awaited before job completion (not fire-and-forget)

---

## Analytics Dashboard Architecture

### 20 Customizable Widgets
**Financial (6):** Revenue Overview, Financial Summary, Top Customers, Commission, Pipeline, Invoice Summary
**Operations (8):** Job Status, Schedule Preview, Active Crews, Top Operators, System Health, Completion Rate, My Jobs, Crew Utilization
**Communication (3):** Recent Activity, Team Messages, Notifications Feed
**Personal (3):** Quick Notes, My Tasks, Mini Calendar

### Widget Infrastructure
- Drag-and-drop grid: `react-grid-layout` with `ResponsiveGridLayout`
- Layout saved per user in `dashboard_layouts` table
- 3 presets: Operations Manager, Salesman, Billing & Finance
- Settings panel: Widgets toggle, Presets, Appearance (density)
- Role-based visibility (super_admin sees all, salesman sees 6)
- 60-second auto-refresh, daily/weekly/monthly time ranges
- Self-managed widgets (Notes, Tasks, Messages) fetch their own data

### API Routes
- `GET /api/admin/dashboard-stats?timeRange=monthly` — aggregated stats by role
- `GET/PUT /api/admin/dashboard-layout` — user layout persistence
- `CRUD /api/admin/dashboard-notes` — personal notes
- `CRUD /api/admin/dashboard-tasks` — personal tasks
- `GET/POST /api/admin/team-messages` — team chat
- `GET/PATCH /api/admin/commission` — commission rate + earnings

---

## Environment Variables
```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://klatddoyncxidgqtcjnu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=https://your-vercel-url.vercel.app
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-maps-key
RESEND_API_KEY=re_your-key
RESEND_FROM_EMAIL=Patriot Concrete Cutting <noreply@patriotconcretecutting.com>

# Optional
TWILIO_ACCOUNT_SID=    # SMS (legacy)
TWILIO_AUTH_TOKEN=     # SMS (legacy)
TWILIO_PHONE_NUMBER=   # SMS (legacy)
NEXT_PUBLIC_LOCATION_BYPASS_CODE=     # Testing bypass code; UNSET in production
```

## Build & Deploy
```bash
npm run dev        # Dev server (port 3000)
npm run build      # Production build (must pass with 0 errors)
# Deploy: Connect GitHub repo to Vercel, set env vars, auto-deploy on push
```

## Security
- All 153 API routes use auth guards (except /api/health and /api/log-error)
- All 76 tables have RLS enabled
- Rate limiting on public endpoints (10 req/min)
- Security headers in middleware + next.config.js
- E-sign consent required for job completion
- GPS tracking consent during onboarding
- Privacy Policy + Terms of Service pages
- Photo endpoints require job assignment or admin role
- Invoice number collision retry (5 attempts)
- `isTableNotFoundError()` tightened to avoid swallowing real 404s
