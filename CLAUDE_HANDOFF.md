# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** April 3, 2026 | **Branch:** `feature/schedule-board-v2` | **Build Status:** PASSING ✅ (189 pages)

---

## CURRENT STATE

### Git Status
- **Branch:** `feature/schedule-board-v2`
- **Last commit:** `87decf59` — "security: comprehensive audit — auth guards, tenant isolation, input validation"
- **Pushed to origin** ✅
- **Build:** PASSING (0 errors, 189 pages)

### Recent Commits (this session)
```
87decf59 security: comprehensive audit — auth guards, tenant isolation, input validation
fe357e6e feat: personalized Patriot Concrete Cutting sales page
94cef093 feat: replace homepage with personalized Doug sales page (initial)
1e09733a chore: update handoff — Vercel deployment live ✅
c16a7ee1 chore: update handoff — worktree merged, Vercel action items documented
8e7eb3d6 merge: bring nifty-mcclintock worktree changes into feature/schedule-board-v2
```

---

## WHAT WAS DONE (This Session)

### 1. Database Cleanup — Fresh Slate
- Deleted all 22 test jobs, 11 test customers, 5 timecards, 6 daily logs, 2 invoices, all notifications
- Removed 18 fake demo operator profiles (auth records remain but 403 on login)
- **Kept 4 accounts:** Super Admin, Demo Admin, Demo Operator, Demo Team Member
- Preserved all tenant config, NFC tags, RLS policies, settings

### 2. User Feature Flags System (FORGE)
**New DB tables:**
- `user_feature_flags` — 19 boolean toggles per user (schedule, jobs, people, tools, admin)
- `user_invitations` — email invite tokens with pre-set flags, 7-day expiry
- Extended `profiles` with: `setup_completed`, `waiver_signed_at`, `waiver_ip`, `notification_consent`
- Extended `schedule_change_requests` with: `current_value`, `requested_value`, `reason`

**New API routes:**
- `GET/PUT /api/admin/user-flags/[userId]` — read/write feature flags per user
- `POST /api/admin/grant-super-admin` — elevate user to super_admin (super_admin only)
- `GET/POST /api/admin/job-change-requests` — list/create schedule change requests
- `PUT /api/admin/job-change-requests/[id]` — approve/reject (super_admin only, auto-applies date extensions)

**`lib/feature-flags.ts`** — `useFeatureFlags(userId, role)` hook, short-circuits for super_admin

### 3. Account Invitation + Setup Flow (ONBOARD)
**New API routes:**
- `POST /api/admin/invite` — sends branded Resend invitation email with 7-day token
- `GET /api/setup-account/validate` — validates token (public)
- `POST /api/setup-account/complete` — creates/updates user, applies flags, marks waiver (public)
- `POST /api/upload/avatar` — upserts to Supabase Storage `avatars` bucket (public, used during setup)
- `POST /api/profile/avatar` — authenticated avatar upload for profile settings

**New page `/setup-account`** — 3-step onboarding for invited users:
1. Profile photo upload + password creation
2. Liability waiver scroll + checkbox (records IP + timestamp)
3. Email/SMS notification consent

**Avatar display** added to:
- Admin layout header (top-right user bubble)
- Dashboard sidebar user chip
- Operator dashboard nav
- My Profile page (camera button → immediate upload)

### 4. Active Jobs Page (ACTIVE)
**New page `/dashboard/admin/active-jobs`:**
- Stats: Total Active, Today, In Progress, Needs Attention (each clickable filter)
- Filter tabs: All / Today / In Progress / Needs Attention
- Job cards: number, status, change request warnings, completion approval flags
- Super admins: toggle between "My Jobs Only" / "All Company Jobs"
- Added to admin sidebar under OPERATIONS

**New API route `GET /api/admin/active-jobs`:**
- `?mine=true` scopes to jobs where user is creator/assignee/salesperson
- Returns pending change request count and completion approval flag per job

### 5. Team Profiles — Permission Management (PIXEL)
**New components:**
- `components/FeatureFlagsPanel.tsx` — 19 toggle switches in 6 groups, 4 one-click presets:
  - Sales Admin (schedule + customers)
  - Ops Admin (full ops access)
  - Finance Admin (billing + timecards)
  - Field Admin (jobs + schedule only)
- `components/InviteMemberModal.tsx` — name/email/role/type → sends invite email

**Redesigned `app/dashboard/admin/team-profiles/page.tsx`:**
- Stats row: total staff, active, super admins, roles in use
- Searchable + role-filtered member list with avatars
- Sliding detail panel: "Profile Info" tab + "Feature Permissions" tab
- Grant Super Admin button with confirmation (super_admin only)
- Invite Member button in header (super_admin only)

### 6. Feature Flags Wired to Admin Sidebar
- `ad5833ae` — Admin sidebar nav items now hide/show based on user's feature flags
- `can_view_schedule`, `can_view_billing`, `can_view_analytics`, etc. gate nav sections
- Super admins and ops_managers always see everything (bypass flag check)

### 7. Operator Experience Simplification
- Removed progress dots (green/amber/red) from all operator job cards
- Removed scope checklist from work-performed page
- Lock submitted day entries — banner shown if day already submitted
- Simplified onboarding tour to remove all progress/scope language

### 8. Mobile Responsive Audit — Operator Pages
- `200be806` — Full audit and fix pass on operator-facing pages:
  - Timecard page (weekly grid, day breakdown)
  - Operator dashboard (stat cards, job list)
  - Work-performed page (form inputs, buttons)
  - Day-complete page (signature area, submit flow)
  - En-route page (map embed, status buttons)
- All pages verified mobile-first with proper breakpoints and touch targets

### 9. Branding System (pre-existing + enhanced)
- BrandingProvider (`components/BrandingProvider.tsx`) already existed with 7-section config page
- Injects CSS custom properties: `--color-primary`, `--color-secondary`, `--color-accent`
- Also sets favicon and page `<title>` dynamically from tenant config
- Super admin can configure in Settings → Branding (no code changes needed for Patriot branding)

---

## FEATURE STATUS

### Complete ✅
| Feature | Notes |
|---------|-------|
| Multi-tenant architecture | Company code login, tenant_id on all tables |
| White-label branding | CSS vars, favicon, title — super admin configures |
| Schedule Board | View, time-off, editing, crew grid, notifications |
| Schedule Form | Customer-first flow, facility compliance |
| Quick Add Job | Start/end date pickers, 12-type multi-select |
| Personalized Dashboards | Personal/team scope per role |
| Job Scope Tracking | Admin defines, operators log (admin-side only) |
| Job Completion Workflow | Submit → notify → approve/reject |
| Progress Visibility | Admin-only, hidden from operators |
| Timecard System | Clock in/out, NFC, GPS, segments, approval |
| Notification System | In-app + email, completion requests working |
| Billing & Invoicing | Create, send, remind, QuickBooks CSV |
| Stripe Billing Pages | Pricing page, subscription dashboard |
| Customer Management | COD, contacts, billing dashboard |
| Operator Workflow | My jobs → work → complete (simplified, mobile-ready) |
| Facilities & Badges | CRUD, badge tracking, auto-expiration |
| Analytics Dashboard | 20 widgets, drag-and-drop |
| User Feature Flags | Per-user feature toggles, 4 presets |
| Account Invitation Flow | Email invite, waiver signing, avatar |
| Setup Account Page | /setup-account onboarding flow |
| Avatar Uploads | All users, Supabase Storage |
| Active Jobs Page | Personal job view, change request flags |
| Team Profiles Overhaul | Toggle panel, invite modal, grant super admin |
| Job Change Requests | Restricted admins request changes, super admin approves |
| Database Cleanup | Fresh slate, 4 accounts retained |
| Feature Flags → Sidebar | Nav items hide/show per user permissions |
| Mobile Responsive Audit | All operator pages audited and fixed |
| Branding Settings | Super admin CSS vars + favicon + title |

### Remaining — Final Sprint
- [x] **Schedule board "Request Change" button** — DONE: ChangeRequestModal merged from worktree, read-only banner + 5 change types
- [ ] **E2E live browser walkthrough** — create job → assign → complete → approve
- [ ] **Connect Stripe live keys** — add STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET to Vercel
- [ ] **Patriot logo and custom colors** — super admin does this in Settings → Branding (upload logo, pick colors)
- [x] **Vercel deployment** — LIVE ✅ https://pontifex-industries-software-awja.vercel.app
- [ ] **Merge feature/schedule-board-v2 to main** — after Vercel confirms working build

---

## KEY ARCHITECTURE

### Feature Flag System
- Table: `user_feature_flags` (user_id, tenant_id, 19 boolean flags)
- Super admins / ops_managers bypass all flags — always get full access
- Hook: `useFeatureFlags(userId, role)` in `lib/feature-flags.ts`
- UI: `FeatureFlagsPanel` in Team Profiles → "Feature Permissions" tab
- 4 presets: sales_admin, ops_admin, finance_admin, field_admin
- Admin sidebar reads flags and hides/shows nav sections accordingly

### Account Creation Flow
1. Super admin → Team Profiles → "Invite Member"
2. Fill name, email, role, admin type (sets default flags)
3. System sends Resend email with 7-day setup link
4. New user → `/setup-account?token=xxx`
5. Step 1: photo + password | Step 2: waiver signing | Step 3: email/SMS consent
6. Account created, flags applied, ready to log in

### Branding Flow
1. Super admin → Settings → Branding (7 sections)
2. Set primary/secondary/accent colors, logo URL, company name
3. BrandingProvider injects CSS custom properties site-wide
4. Favicon and page title update automatically
5. No code changes needed — all runtime via tenant_branding table

### Notification Flow
- Completion requests → `notifications` table → admin bell ✅
- Change requests → `notifications` table → super admin bell
- Invite emails → Resend → `/setup-account`

### Force-Dynamic Note
- 14 API routes explicitly have `export const dynamic = 'force-dynamic'`
- 192 routes rely on Next.js runtime detection (all use `requireAuth()` or `request.json()`)
- Build passes cleanly — no static caching issues in production
- If Vercel shows stale data, add `force-dynamic` to the specific offending route

### Database Tables (95+)
New: `user_feature_flags`, `user_invitations`
Extended: `profiles` (avatar, setup, waiver), `schedule_change_requests` (reason, values)

---

## ACCOUNTS (Fresh DB)
| Account | Role | Email |
|---------|------|-------|
| Super Admin | super_admin | andres.altamirano1280@gmail.com |
| Demo Admin | admin | admin@pontifex.com |
| Demo Operator | operator | demo@pontifex.com |
| Demo Team Member | apprentice | team@pontifex.com |

---

## VERCEL DEPLOYMENT — ✅ LIVE

**Deployment:** `dpl_2VMWb49UwgF17GMNcpDnjdFxAdnt` — READY
**Live URL:** https://pontifex-industries-software-awja.vercel.app (200 OK ✅)
**Preview URL:** https://pontifex-industries-software-awja-1pcy9xcwr.vercel.app
**Commit:** `c16a7ee1` — all worktree features merged
**Env vars:** All 9 confirmed set (Supabase, Resend, NextAuth, App URL)

**How it was deployed:**
- Vercel CLI authenticated via device OAuth flow (`vca_` token)
- Created deployment via REST API from `feature/schedule-board-v2` commit `c16a7ee1`
- Assigned `pontifex-industries-software-awja.vercel.app` alias directly
- GitHub webhook is unblocked — future pushes to `feature/schedule-board-v2` will auto-deploy

**Note:** For future deployments, Claude can use the `vca_` auth token at:
`/Users/afa55/Library/Application Support/com.vercel.cli/auth.json`

---

## VERCEL STATUS
- **Live URL:** https://pontifex-industries-software-awja.vercel.app
- **Deployed commit:** `1e09733a` (pre-sales-page — from previous session)
- **Pending deploy:** `87decf59` (Patriot sales page + security fixes) — blocked by free tier 100/day limit
- **Limit resets:** ~5:47 AM UTC April 4, 2026
- **To deploy immediately:** Upgrade Vercel to Pro ($20/mo) at https://vercel.com/andres-altamiranos-projects/pontifex-industries-software-awja/settings/billing
- **Auth token for CLI deploy:** `/Users/afa55/Library/Application Support/com.vercel.cli/auth.json`

## SALES PAGE (Doug / Patriot)
- **File:** `app/page.tsx` — fully self-contained, 1100+ lines
- **Client:** Patriot Concrete Cutting (Doug)
- **Sections:** Hero → Before/After → Payroll Savings → Smart Scheduling → Operator UX → Custom Dev Partnership → Features Grid → Security → CTA
- **COMPANY_NAME constant** at line 42 — easy to update if needed
- **Security section** added with 6 pillars + SOC 2 / Supabase infrastructure banner
- **Nav:** Overview, Scheduling, Payroll, Features, Security, Let's Talk

## SECURITY AUDIT (COMPLETED)
Full audit by dedicated agent — 15 files fixed, 0 build errors. Key findings:

### CRITICAL fixed:
- `/api/upload/avatar` — was completely unauthenticated; now requires Bearer token OR valid invite token; file type restricted to explicit allowlist (jpg/png/gif/webp only)

### HIGH fixed (tenant isolation):
- `/api/admin/job-orders` POST+GET — no tenant scoping added
- `/api/admin/job-orders/[id]` PATCH+DELETE — unscoped queries fixed
- `/api/job-orders/[id]/status` — all three code paths now tenant-scoped
- `/api/job-hazard-analysis/save` — job ownership check before PDF generation
- `/api/service-completion-agreement/save` — same fix

### MEDIUM fixed (RBAC normalization):
9 routes used `role === 'admin'` only, locking out super_admin and operations_manager:
- send-schedule, job-workflow, sync-job-statuses, operator-profiles (x2), suggestions, operators/active, users (GET+PATCH)

### Verified safe (intentionally public):
- signature/[token], setup-account/complete, setup-account/validate, access-requests, demo-request, health, log-error, webhooks/stripe

## NEXT SESSION PRIORITIES
1. **Deploy to Vercel** — run deploy command once limit resets OR upgrade to Pro
2. **E2E browser walkthrough** — full job creation → operator completion → admin approval at https://pontifex-industries-software-awja.vercel.app
3. **Patriot branding** — log in as super admin → Settings → Branding → upload Patriot logo + Patriot colors
4. **Connect Stripe live keys** — STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in Vercel env vars
5. **Merge to main** — merge feature/schedule-board-v2 → main for permanent production URL
