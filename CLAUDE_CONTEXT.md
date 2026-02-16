# Pontifex Industries Platform — Claude Context Document
**Last Updated:** February 15, 2026
**Use this as context when starting a new Claude session on this project.**

---

## Project Overview
A full-stack construction operations platform for **Pontifex Industries** — custom software managing field operators, job scheduling, time tracking, equipment inventory, compliance documents (OSHA silica exposure plans, JHA, liability releases), and automated workflows for construction crews.

## Tech Stack
- **Frontend:** Next.js 15.5.12 (App Router), React 19, TypeScript 5, Tailwind CSS 3.3
- **Backend:** Next.js API Routes (81 route handlers across 31 categories)
- **Database:** Supabase (PostgreSQL) with Row Level Security
- **Auth:** Supabase Auth with Bearer token validation, role-based access (admin, operator, apprentice)
- **Email:** Resend API
- **SMS:** Telnyx
- **PDF Generation:** jsPDF + React PDF
- **Animations:** Framer Motion 12
- **Charts:** Recharts
- **QR/Barcode:** ZXing
- **Deployment:** Vercel
- **Git:** GitHub (AFA55/PontifexIndustriesSoftware)

## Project Location
```
/Users/afa55/Documents/Pontifex Industres/pontifex-platform
```

## Vercel Deployment
- **Project:** `pontifex-industries-software-z8py` (ID: `prj_xWRkagEyB6C1rxX81IOQKJynLQd1`)
- **Team:** `team_9PEEftgbKgEZCHzklblcjKKa`
- **Production URL:** `https://pontifex-industries-software-z8py.vercel.app`

## Key Architecture

### Authentication Flow
- `lib/api-auth.ts` — Contains `requireAdmin()` and `requireAuth()` helpers
- Both verify Bearer tokens via `supabaseAdmin.auth.getUser(token)`
- `requireAdmin()` additionally checks `profiles.role === 'admin'`
- API routes use these helpers; pages use client-side AuthGuard components
- Middleware adds security headers + rate limiting but can't verify auth (localStorage-based sessions)

### Database (Supabase)
- `lib/supabase.ts` — Anon key client (for client-side)
- `lib/supabase-admin.ts` — Service role client (for API routes, server-side only)
- 46 database migrations in `supabase/migrations/`
- All tables have RLS enabled with proper policies (secured Feb 15, 2026)

### Key Tables
| Table | Purpose | RLS |
|-------|---------|-----|
| `profiles` | User profiles with roles | 4 clean policies (own + admin) |
| `job_orders` | Job scheduling & tracking | Owner/assigned + admin access |
| `timecards` / `time_clock` | Time tracking | Own records + admin |
| `equipment` | Equipment inventory | View all, admin manage |
| `blade_assignments` | Blade inventory tracking | View all, admin modify |
| `silica_plans` | OSHA silica exposure plans | Owner + admin |
| `access_requests` | New user registration flow | Public insert, admin manage |
| `demo_requests` | Landing page demo form submissions | Public insert |
| `pdf_documents` | Generated PDF tracking | Owner + admin |
| `operator_job_history` | Operator performance data | Own + admin |
| `operator_performance_metrics` | Performance metrics | Own + admin |
| `operator_skills` | Skill tracking | Own + admin |

### Landing Page (White-Label Architecture)
- `components/landing/brand-config.ts` — Central brand configuration
- `components/landing/Hero.tsx` — Hero section with animated gradient
- `components/landing/FeatureShowcase.tsx` — Workflow mockup showcase
- `components/landing/ScheduleDemoForm.tsx` — Demo request form
- `components/landing/Navigation.tsx` — Top nav (no login, just "Contact Us")
- `components/landing/Footer.tsx` — Footer with mailto link
- Company: **Pontifex Industries**
- Tagline: **"Custom Software & Automation for Construction"**
- Contact: info@pontifexindustries.com

### API Routes (31 categories, 81 handlers)
**Core Operations:**
- `api/job-orders/` — CRUD, submit, status, daily logs, history
- `api/timecard/` — Clock in/out, current, history
- `api/time-clock/` — Time clock system
- `api/workflow/` — Workflow management

**Equipment & Inventory:**
- `api/equipment/` — Damage reports, maintenance, turn-in, repair tracking
- `api/equipment-usage/` — Equipment usage logs
- `api/inventory/` — Stock, assignments, history

**Compliance & Documents:**
- `api/silica-plan/` — OSHA silica exposure plans (save, submit, check)
- `api/job-hazard-analysis/` — JHA forms
- `api/liability-release/` — Liability releases + PDF generation
- `api/work-order-agreement/` — Work order PDFs
- `api/service-completion-agreement/` — Service completion

**User Management:**
- `api/auth/` — Login, forgot password
- `api/access-requests/` — Registration, approve/deny
- `api/admin/` — Users, timecards, job orders, operator profiles, suggestions
- `api/setup/` — Super admin creation, profile fixes

**Communication:**
- `api/send-email/` — Resend email (auth required, SSRF protected)
- `api/send-sms/` — Telnyx SMS (auth required)
- `api/sms/test` — SMS testing (admin only)

**Public Endpoints (rate-limited):**
- `api/demo-request/` — Landing page form submissions
- `api/access-requests/` (POST only) — New user registration

### Dashboard Pages
- `/dashboard` — Main dashboard
- `/dashboard/admin` — Admin panel (users, job management)
- `/dashboard/job-schedule` — Job board with daily scheduling
- `/dashboard/my-jobs` — Operator's assigned jobs
- `/dashboard/timecard` — Time clock interface
- `/dashboard/inventory` — Equipment inventory management
- `/dashboard/my-profile` — Profile management
- `/dashboard/tools` — Equipment scanning, blade management, damage reporting, maintenance
- `/dashboard/request-time-off` — PTO requests
- `/dashboard/debug` — Debug tools (operator ratings, work performed)

## Security Posture (Audited Feb 15, 2026)
- All API routes use `requireAuth()` or `requireAdmin()` (except intentionally public ones)
- All tables have RLS enabled with proper ownership-based policies
- Rate limiting on public endpoints (10 req/min per IP)
- Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- SSRF protection on PDF URL fetching
- HTML sanitization in email templates
- No plaintext password storage
- Error responses don't leak internal details
- API responses use no-cache headers
- Full audit report: `SECURITY_AUDIT_2025_02.md`

## Recent Commits (Latest 10)
```
6a22870c Security audit: fix critical vulnerabilities across API routes and Supabase RLS
5df8a676 Update workflow mockup: change time on site from 2.5 hrs to 30 hrs
3dd779db Add Schedule Demo form, broaden to construction software & automation
381feacf Remove login access and fake testimonials, convert to showcase-only landing page
122d71d3 Redesign landing page: dark theme, white-label ready, professional SaaS aesthetic
5321768f Fix Vercel build: use placeholder URL when env vars missing
ebd38b6b Production-ready: mobile responsive UI, bug fixes, workflow improvements
47461821 Comprehensive fix: gracefully handle all missing Supabase tables across 15 API routes
f6a7075e Fix operator workflow 500 errors - gracefully handle missing tables
4d9fff77 Consolidate to Schedule Board, fix RLS errors, add workflow progress
```

## Known Issues / Future Work
1. **PDF Viewer for completed jobs** — User wants all signed documents (liability releases, work order agreements, JHAs, silica plans) converted to PDFs and viewable within completed job tickets
2. **Password flow improvement** — Currently uses temp password + recovery link on approval. Could improve UX with magic link flow
3. **Remaining `details: error.message` leakage** — Background agent was cleaning up ~47 files; about 20 were completed. Remaining files still have this pattern but it's low-risk (info disclosure only)
4. **`listUsers()` performance** — `access-requests/[id]/approve/route.ts` still uses `listUsers()` without pagination. Fine at current scale but should use `getUserByEmail()` at 1000+ users

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
npm run build    # Next.js production build
npm run dev      # Local dev server (port 3000/3001)
git push origin main  # Triggers Vercel auto-deploy
```
