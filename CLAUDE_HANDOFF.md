# CLAUDE_HANDOFF.md — Pontifex Industries Platform
**Last updated:** May 25, 2026 | **Branch:** `main` | **HEAD:** `08b54de7` (pending push) | **Production:** ✅ LIVE at pontifexindustries.com | **iOS:** 🍎 Waiting for Review

> **💰 VERCEL BUDGET: ~$11–12 build credit remaining.** Each `git push origin main` = ~$1–2 billed build. BATCH all changes and push ONCE per session. `claude/*` and `feature/*` branches do NOT trigger builds (blocked in `vercel.json`). See `DEPLOYMENT_COST.md`.

---

## What Is This Project?

**Pontifex Industries** is a multi-tenant SaaS platform for concrete cutting and construction services companies. It manages the full operations lifecycle: scheduling jobs, dispatching operators, tracking field work, managing timecards, invoicing customers, and running shop/equipment operations.

- **Tenant #1 (trial customer):** Patriot Concrete Cutting — actively using the platform in production
- **Stack:** Next.js 15 (App Router) + React 19 + TypeScript + Supabase (PostgreSQL) + Tailwind CSS + Capacitor (iOS)
- **Repo:** `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/`
- **Production URL:** https://www.pontifexindustries.com
- **Login:** https://www.pontifexindustries.com/company-login (company code + email + password)

---

## Current State (May 25, 2026)

| Layer | Status | Notes |
|---|---|---|
| Web app | ✅ Complete | All 23 features shipped |
| Production deploy | ✅ Live | https://www.pontifexindustries.com |
| iOS app | 🍎 Waiting for Review | Submitted May 25 9:15 PM, App ID 6772996692 |
| Pending git push | ⏳ `08b54de7` | Compliance audit fixes — NOT yet pushed (save build budget) |
| APNs push notifications | ✅ Vars set in Vercel | Server-side send logic not yet wired in `/api/push` |
| Cron jobs | ✅ Active | `CRON_SECRET` set in Vercel May 22 |
| Twilio SMS | ⏳ Pending | Toll-free verification required at twilio.com |
| Android | ⏳ Not started | After iOS approval: `npx cap add android`, $25 Google Play fee |

### Commit `08b54de7` — Security/compliance fixes (NOT yet pushed)
- `profiles/route.ts`: replaced hardcoded `'Patriot2026!'` temp password with `crypto.getRandomValues`
- `tenant-by-code/route.ts`: removed service role key from public endpoint; uses anon key + SECURITY DEFINER RPC
- `middleware.ts`: added HSTS header, excluded `unsafe-eval` from production CSP, added `/api/sms-opt-in` to rate-limited paths
- Legal docs: `privacy-policy.ts`, `gps-consent.ts`, `terms-of-service.ts`, `esign-consent.ts` — all rebranded to Pontifex Industries with accurate GPS disclosure (one-time clock-in, no background tracking)

---

## Credentials & Access

### Demo Accounts (Supabase tenant: PATRIOT)
| Role | Email | Password |
|---|---|---|
| Admin | admin@pontifex.com | PontifexDemo2026! |
| Supervisor | supervisor@pontifex.com | PontifexDemo2026! |
| Shop Manager | shopmanager@pontifex.com | Shop1234! |
| Shop Help | shophelp@pontifex.com | Help1234! |
| Operator | zack@demopontifex.com | Patriot2026! |
| Operator | aiden@demopontifex.com | Patriot2026! |
| Helper/Apprentice | lucas@demopontifex.com | Patriot2026! |
| Helper/Apprentice | javi@demopontifex.com | Patriot2026! |

**Login URL:** https://www.pontifexindustries.com/company-login
**Company Code:** `PATRIOT`
**Demo gate password:** `PontifexDemo2026` (unlocks demo account dropdown on login page)

### iOS / App Store
| Item | Value |
|---|---|
| Apple ID | pontifexindustries@gmail.com |
| Team ID | MG4K845UH7 |
| Bundle ID | com.pontifexindustries.app |
| App Store App ID | 6772996692 |
| Distribution cert | Apple Distribution: ANDRES FERNANDO ALTAMIRANO (MG4K845UH7) |
| Provisioning profile | Pontifex App Store Distribution (UUID: 05e3d217-dc7b-4db5-8431-5b79743a971a) |
| Profile location | ~/Library/MobileDevice/Provisioning Profiles/ |
| TestFlight tester | AndresAFA55@icloud.com |
| APNs Key ID | M44JJFDG6G |
| APNs Key file | /Users/afa55/Documents/Software documents/AuthKey_M44JJFDG6G.p8 |

### Supabase
| Item | Value |
|---|---|
| Project ID | klatddoyncxidgqtcjnu |
| Dashboard | https://app.supabase.com/project/klatddoyncxidgqtcjnu |

### Vercel
| Item | Value |
|---|---|
| Project | pontifex-industries-software-awja |
| Dashboard | https://vercel.com/andres-altamiranos-projects/pontifex-industries-software-awja |

### Vercel Environment Variables (all set as of May 25, 2026)
| Key | Status | Notes |
|---|---|---|
| `CRON_SECRET` | ✅ Set | 64-char hex, set May 22 |
| `APNS_KEY_ID` | ✅ M44JJFDG6G | Sensitive, Production+Preview |
| `APNS_TEAM_ID` | ✅ MG4K845UH7 | Sensitive, Production+Preview |
| `APNS_BUNDLE_ID` | ✅ com.pontifexindustries.app | Sensitive, Production+Preview |
| `APNS_PRIVATE_KEY` | ✅ Full PEM set | From AuthKey_M44JJFDG6G.p8, Sensitive |
| `RESEND_API_KEY` | ⚠️ Verify | Email delivery — check resend.com dashboard |
| `NEXT_PUBLIC_APP_URL` | ⚠️ Verify | Should = https://www.pontifexindustries.com |
| `NEXT_PUBLIC_SITE_URL` | ⚠️ Verify | Should = https://www.pontifexindustries.com |

---

## Development Workflow — How We Build With Claude

### Session Pattern
1. **Start every session:** Read this file (`CLAUDE_HANDOFF.md`) to resume context
2. **Check build state:** `git log --oneline -5` + `npm run build` (must be 0 errors)
3. **Work through sprint tasks** top-to-bottom unless user reprioritizes
4. **After each feature:** `npm run build` to verify, commit with descriptive message
5. **End of session:** Update this file + confirm before pushing `main`

### Git / Branch Discipline
```bash
# Check recent commits and pending push
git log --oneline -10
git log origin/main..HEAD --oneline

# Build check (always before committing significant changes)
npm run build

# Push ONLY when explicitly told to — each push to main = ~$1-2 build cost
git push origin main
```

### Parallel Agents — How We Build Fast

Claude spawns multiple specialized agents simultaneously for independent work layers. This is how large features get built in a single session.

**Standard parallel pattern:**
1. `supabase-migration-author` → writes migration SQL (idempotent DDL, SECURITY DEFINER helpers, correct RLS)
2. `rls-policy-auditor` → validates RLS policies in parallel with migration writing
3. `backend-dev` → writes API routes (`app/api/`)
4. `coder` → writes UI pages and components (runs concurrently with API routes)
5. `mobile-responsive-auditor` → sweeps all new operator-facing pages at 375px and 414px before push

**Worktree isolation** (for large multi-file features):
- Claude creates isolated git worktrees via `Agent({ isolation: "worktree" })`
- Each agent works in its own temp branch with no shared file conflicts
- Results merged back to main at session end
- **CRITICAL:** Worktrees do NOT inherit `.env.local` — copy it before Supabase calls will work

**When to use parallel agents:**
- Multiple independent features (different pages/routes)
- Frontend + backend written simultaneously
- Migration + RLS review simultaneously
- Any time user says "build this fast" or "parallel"

### Key Agents Used in This Project
| Agent | When to use |
|---|---|
| `supabase-migration-author` | Any new table, column, index, RLS policy, function |
| `rls-policy-auditor` | Before merging any migration that touches RLS |
| `mobile-responsive-auditor` | Before pushing any operator-facing UI change |
| `backend-dev` | New API routes under `app/api/` |
| `coder` | UI pages and components |
| `security-auditor` | Full security sweeps, compliance checks |
| `sparc-orchestrator` | Complex multi-phase features needing spec → architecture → code |
| `researcher` | Exploring unfamiliar APIs, researching competing products |

Custom agent definitions (encoded to our exact stack) live in `.claude/agents/`:
- `supabase-migration-author.md` — knows our idempotent DDL pattern + SECURITY DEFINER helpers
- `rls-policy-auditor.md` — catches `user_metadata` RLS bugs (CRITICAL) + missing tenant_id checks
- `mobile-responsive-auditor.md` — sweeps operator pages at 375px/414px with inline eval script

### iOS Build Commands
```bash
# From ios/App/ directory:
xcodebuild archive \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath /tmp/PontifexArchive.xcarchive

xcodebuild -exportArchive \
  -archivePath /tmp/PontifexArchive.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath /tmp/PontifexExport

# Then upload /tmp/PontifexExport/App.ipa via Transporter.app (free, Mac App Store)
# All signing is already configured in project.pbxproj — no extra flags needed
```

---

## Architecture & Key Patterns

### Role Hierarchy (highest → lowest)
```
super_admin → operations_manager → admin → salesman → shop_manager → inventory_manager → operator → apprentice
```
Plus parallel roles: `supervisor` (field oversight), `shop_help` (shop assistant)

### Auth Pattern
- **Server-side:** `requireAuth()`, `requireAdmin()`, `requireSuperAdmin()`, `requireScheduleBoardAccess()` from `lib/api-auth.ts`
- **Client-side:** `getCurrentUser()` from `lib/auth.ts` with role array check in `useEffect`
- **Supabase admin client** (`lib/supabase-admin.ts`): all server-side DB ops (bypasses RLS)
- **Supabase public client** (`lib/supabase.ts`): client-side only

### Multi-Tenant Architecture
- Every table has `tenant_id` (UUID, FK to `public.tenants`)
- Login uses company code → `lookup_tenant_by_code()` SECURITY DEFINER RPC (called from browser directly — no Lambda hop)
- White-label branding: `BrandingProvider` reads `tenants.logo_url`, `tenants.primary_color`, etc.

### RLS Pattern — CRITICAL RULES

```sql
-- ✅ CORRECT — reads from public.profiles via SECURITY DEFINER helper
USING (
  public.current_user_has_role('admin', 'super_admin', 'operations_manager')
  AND tenant_id = public.current_user_tenant_id()
)

-- ❌ NEVER DO THIS — user_metadata is client-writable via supabase.auth.updateUser()
-- Supabase linter flags this as rls_references_user_metadata (ERROR)
USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
)
```

**SECURITY DEFINER helpers (always use these for RLS):**
- `public.is_admin()` — true for `admin` or `super_admin`
- `public.current_user_role()` — returns the caller's `profiles.role`
- `public.current_user_tenant_id()` — returns the caller's `profiles.tenant_id`
- `public.current_user_has_role(VARIADIC text[])` — membership check against a list

### API Response Format
```typescript
return NextResponse.json({ success: true, data: {...} })         // success
return NextResponse.json({ error: 'message' }, { status: 400 }) // error
```

### Audit Logging (fire-and-forget — never block main response)
```typescript
Promise.resolve(supabaseAdmin.from('audit_logs').insert({...})).then(() => {}).catch(() => {})
```

### Job Number Format
- Schedule form: `JOB-{year}-{6 digits}` (e.g., `JOB-2026-000042`)
- Quick add: `QA-{year}-{6 digits}`

---

## Complete Feature Inventory

### 1. Multi-Tenant Architecture
- Company code login (`lookup_tenant_by_code` SECURITY DEFINER RPC — browser calls Supabase directly, no Vercel Lambda)
- White-label branding per tenant (`BrandingProvider`, `primary_color`, `logo_url`)
- All tables have `tenant_id` + RLS using SECURITY DEFINER helpers
- `DEFAULT_BRANDING` shows Pontifex bridge logo before tenant loads

### 2. Role-Based Access Control (RBAC)
- 10 roles with permission presets in `lib/rbac.ts`
- `ADMIN_CARDS` array drives dashboard card visibility per role
- Dashboard sidebar role-filtered with `excludeRoles` + `roles` fields on nav items

### 3. Schedule Board
- Full operator view with time-off blocking, skill warnings, realtime color-coded status
- Capacity view, crew grid
- Inline editing: scope, operators, notes; Mark Out (rose) blocks operator row
- Dispatch modal with PDF ticket generation
- Smart scheduling: per-scope skill matching with availability panel (good / stretch / under-skilled / busy)

### 4. Schedule Form (Job Creation)
- Multi-step wizard: Customer → Project → Scope → Equipment → Difficulty → Scheduling → Site Compliance
- Customer-first flow with smart contact dropdown
- Linear Ft + Cut Depth calculator (auto-computes LF from dimensions + cross-cut spacing + overcut)
- Edit mode via `?editJobId=<uuid>&jumpTo=scope` — prefills from existing job, PATCHes on submit

### 5. Operator Workflow
- `My Jobs` → `Jobsite` (in-route → arrived) → `Work Performed` → `Day Complete` → Done/Complete
- Helper (apprentice) simplified view with HelperWorkLog
- Past 7-day job history (collapsible); "Continuing Tomorrow" amber section for multi-day jobs
- Green highlights: emerald border (done-for-today), full emerald (completed)
- Real-time live status panel on admin job detail (30s poll)
- Duplicate job tickets (cyan Copy button on job cards)

### 6. Dispatch & Tickets
- PDF dispatch ticket generation (`@react-pdf/renderer`)
- Send via email + SMS (Telnyx→Twilio via `lib/sms.ts`)
- Idempotent dispatch (skips operators already dispatched for the date)

### 7. Timecard System
- Clock-in with GPS geofence (100ft radius, shop at 34.768775, -82.435642)
- NFC clock-in/clock-out (NFC tag UID → timecard, bypass GPS requirement)
- Three-layer lunch deduction: per-shift admin override > per-user default > tenant default (30min for field, 60min for shop)
- Auto-deduct when shift > 6h threshold (configurable in `timecard_settings_v2`)
- Admin manual time entry: PTO, sick, holiday, manual hours, admin_adjustment
- Split date/time picker in admin edit modal (prevents datetime-local mis-clicks on mobile)
- Weekly team payroll view with late arrivals summary card
- Operator detail: segments, GPS, coworkers, notes, PTO balance card, punctuality tile
- Auto clock-out cron (midnight + noon runs)
- Time correction request flow (operator submit → admin approve → auto-patch timecard)
- Timezone-aware "today" using `tenants.timezone` (no UTC midnight split)

### 8. NFC System
- NFC tag management (create, assign to operator/location)
- Clock-in bypass via NFC scan (`timecard_settings_v2` configures bypass)
- NFC kiosk page at `/nfc-clock`

### 9. Time-Off & Attendance
- Request Time Off flow (operator submit → admin approve/deny)
- Admin 2-tab view: Requests + Attendance Metrics
- PTO balance tracking (`operator_pto_balance` table, per-year allocation)
- Late clock-in tracking: `is_late`, `late_minutes` flagged at clock-in → fire-and-forget admin notification
- Callout count per operator in attendance metrics

### 10. Team Profiles & Skills
- Operator skills taxonomy (`lib/skills-taxonomy.ts`) — cutting 0–10, equipment 0–5
- Skills stored in `profiles.skill_levels` JSONB
- "Skills & Proficiency" tab in Team Profiles right panel
- Peer ratings system (`rating_forms` + `rating_submissions`): 4 question types, avg scores, slide-over detail
- "Rate Your Crew" amber card on My Jobs (pending coworker ratings)
- Admin peer ratings page: Forms tab (builder modal) + Team Ratings tab

### 11. Job Execution & Progress
- Work Performed gate (blocks completion without logging work items)
- Work items logged with quantity, linear feet, cut depth
- Change Orders (`change_orders` table, auto-numbered `CO-NNN`, approve/reject flow)
- Daily progress analytics (per-day hours, timestamps, cumulative quantities)
- Operator notes with type badges (done_for_day, completion, amendment)
- Admin job detail: Daily Progress cards, Operator Notes panel, notes count badge on active jobs list

### 12. Customer Portal
- Public signature page (no auth required, accessed via SMS/email link)
- E-sign consent with GPS disclosure
- Customer satisfaction survey / NPS system
- Service completion agreement

### 13. Billing & Invoices
- Invoice pipeline: draft → confirmed (salesperson) → sent (admin) → paid
- Confirm modal with notes; Send notifies original creator
- "Awaiting Send" stat tile + amber Confirm button + emerald Send button on billing page
- QuickBooks CSV export
- PDF invoice generation
- 30-day overdue reminder cron

### 14. Facilities & Badging
- Facility CRUD (`facilities` table)
- Badge tracking with auto-expiration
- Operator badge assignment

### 15. Notifications
- In-app notification bell (admin + operator dashboards)
- Email notifications (Resend API)
- SMS notifications (Telnyx primary → Twilio fallback, `lib/sms.ts`)
- Auto-reminders: late clock-in, signature requests, invoice overdue
- All notifications fire-and-forget — never block main operations

### 16. Shop Manager Module
- `shop_manager` + `shop_help` roles with separate dashboards
- Equipment CRUD (`/dashboard/admin/equipment`) with smart location display ("with Carlos · truck #5")
- Fleet CRUD (`/dashboard/admin/fleet`) with vehicle service history tab
- Unified Inventory Control (`/dashboard/admin/inventory-control`) — 4 tabs: Inventory / Checkout / Check-In / History
- Voice checkout: speak equipment name → pg_trgm fuzzy match (6-tier scoring) → auto-fill fields
- Voice corrections learning loop (`voice_recognition_corrections` table → alias suggestions after 3+ uses)
- Audio recording of voice checkouts (30-day signed URL in `equipment_checkouts.voice_note_url`)
- Equipment storage location dropdown (🏭 Shop or 🚚 Truck · Operator)
- Per-role lunch default: shop roles = 60min, field roles = 30min

### 17. Maintenance Module
- Operator 3-tap mobile maintenance request wizard (`/dashboard/maintenance/new`)
- Maintenance Inbox 3-tab view: Inbox / In Progress / Closed (triage actions inline)
- Fleet service history (`vehicle_service_records` table, next-service ribbon)
- Visit-wizard → maintenance conversion hook (supervisor equipment issues auto-create maintenance_requests)

### 18. Supervisor Module
- Site visit reports (jobsite + per-issue equipment photos stored in `maintenance-photos` bucket)
- Site visit detail page with star ratings, lightbox, follow-up tracking
- Supervisor dashboard: clock-in/out widget, KPI tiles, Recent Visits, My Active Jobs, Quick Actions
- Schedule Board, Active Jobs, and Daily Clock-In Code access for supervisors
- GPS clock-in with `field` method (no shop GPS enforcement)

### 19. Legal & Compliance
- Privacy Policy (`/privacy-policy`), Terms of Service (`/terms-of-service`)
- GPS Consent (`/gps-consent`), E-Sign Consent (`/esign-consent`)
- SMS Opt-In page (`/sms-opt-in`) — required for Twilio toll-free verification

### 20. Security
- HSTS header (`Strict-Transport-Security: max-age=31536000; includeSubDomains`) in middleware
- CSP: `unsafe-eval` excluded from production, allowed in dev
- Rate limiting: 60s on clock-in, on `/api/sms-opt-in`
- GPS suspicious jump detection (>80km + <2hr gap → audit log, fire-and-forget)
- Tenant-scoped GPS reads from `tenants.shop_latitude/longitude`
- Duplicate open timecard guard (409 before DB unique index)
- SECURITY DEFINER RPC for public tenant lookup (anon key only — no service role on public endpoints)
- 31 redundant indexes dropped (May 21) — was paying for duplicate B-tree maintenance

### 21. iOS App (Capacitor)
- Same Next.js codebase wrapped in Capacitor (zero React Native rewrite)
- App icon: 1024×1024 opaque PNG, bridge logo on `#1e1b4b` (no alpha channel)
- `App.entitlements`: `aps-environment=production` (APNs) + NFC readersession.formats = [TAG]
- `Info.plist`: arm64 only, `ITSAppUsesNonExemptEncryption=false`, no background location
- Build 1.0.0 (3) submitted May 25 9:15 PM — "Waiting for Review"

### 22. Marketing & Landing Pages
- `app/page.tsx` — Pontifex Industries homepage (story-driven, targets construction companies, non-compete safe)
- `app/patriot/page.tsx` — Patriot Concrete Cutting operator landing page (red/crimson brand)
- Request Demo funnel (3-step with API, leads → Supabase)

### 23. Admin Utilities
- Real-time live status panel on job detail (30s poll: in-route, arrived, standby, work performed)
- Job soft-delete (trash icon + confirmation modal → `status: 'cancelled'`, FK is RESTRICT not CASCADE)
- Light/dark mode toggle (factory-reset sentinel wipes stale `theme=dark` from localStorage)
- `useVisiblePoll` hook — polls only when tab is visible + device is online (~80% fewer invocations)

---

## Database

- **Project:** `klatddoyncxidgqtcjnu`
- **Migrations:** 70+ in `supabase/migrations/`
- **Tables:** 90+ in production
- **Rule:** Every table has `tenant_id` FK to `public.tenants` + RLS enabled
- **Migration convention:** Idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE POLICY ... EXCEPTION WHEN duplicate_object`)

### Key Tables
| Table | Purpose |
|---|---|
| `tenants` | Multi-tenant root — company_code, branding, plan, GPS shop coordinates, timezone |
| `profiles` | User profiles — role, tenant_id, skill_levels JSONB, default_lunch_minutes |
| `job_orders` | Jobs — job_number, status, scope_details, customer, tenant_id |
| `job_daily_assignments` | Per-day operator assignments (unique partial index: operator+date) |
| `timecards` | Clock-in/out — GPS, NFC, entry_type, lunch deduction, audit columns |
| `timecard_settings_v2` | Tenant timecard config (break threshold, auto-deduct, NFC bypass) |
| `equipment` | Shop equipment — status, current_custodian_id, aliases JSONB, asset_tag |
| `equipment_checkouts` | Equipment custody log — operator, truck, job, voice_note_url |
| `voice_recognition_corrections` | Voice checkout learning loop |
| `vehicles` | Fleet — VIN, plate, compliance dates, odometer |
| `vehicle_service_records` | Fleet maintenance history |
| `maintenance_requests` | Equipment issue tickets — priority, status, supervisor_visit FK |
| `supervisor_visits` | Site visit reports — observations, equipment_issues JSONB, photos, ratings |
| `change_orders` | Job change orders — CO-NNN auto-numbered, approve/reject |
| `invoices` | Billing — status: draft→confirmed→sent→paid |
| `rating_forms` | Peer review form definitions |
| `rating_submissions` | Peer review responses |
| `operator_pto_balance` | PTO allocation/used per operator per year |
| `audit_logs` | Security/admin audit trail |

### Recent Migrations (all applied to production)
| Migration | Purpose |
|---|---|
| `20260521_public_tenant_lookup_fn` | SECURITY DEFINER RPC for anon tenant lookup |
| `20260521_drop_redundant_duplicate_indexes` | Dropped 31 redundant indexes |
| `20260517_job_assignments_no_cascade` | FK RESTRICT + soft-delete pattern |
| `20260516_timecard_uniqueness_and_timezone` | Unique index for open timecards + tenant timezone |
| `20260510_voice_checkouts_bucket` | Non-public Supabase Storage bucket for audio |
| `20260510_voice_recognition_corrections` | Voice learning loop table + pg_trgm indexes |
| `20260508_timecards_entry_type_extend` | Added pto, sick, manual, admin_adjustment to CHECK |
| `20260507_profiles_default_lunch_minutes` | Per-user lunch default column |
| `20260507_timecards_lunch_override_audit` | Admin lunch override audit columns |
| `20260427_utility_waiver_fields` | Utility waiver fields on job_orders |
| `20260427_operator_badges` | operator_badges table with RLS |

---

## Cron Jobs

Defined in `vercel.json`. Require `CRON_SECRET` env var in Vercel (✅ set May 22). Only fire on production (`main` branch).

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/auto-clockout` | Midnight + noon daily | Auto-close open timecards from previous days |
| `/api/cron/invoice-30d-reminders` | Daily | Send overdue invoice email reminders |

---

## What's Next

### Immediate (next session — batch with `08b54de7` before pushing)
1. **Wire up APNs push notification logic** — vars are set in Vercel. Implement server-side send in `/api/push` using `apns2` or `node-apns`. Then push the combined commit to `main`.
2. **Watch for Apple review email** at pontifexindustries@gmail.com — within 48 hours of May 25 9:15 PM. If approved, App Store Connect → auto-releases (already configured as "automatically release").

### Short-term (user action required)
3. **Twilio toll-free verification** — submit at twilio.com with opt-in URL `https://www.pontifexindustries.com/sms-opt-in` (1–3 day approval → SMS reminders activate)
4. **Rotate Twilio Auth Token** — was visible in a screenshot (hygiene)
5. **Upload Patriot logo** → Settings → Company Branding → "Icon (Square)" slot → Save
6. **Verify email env vars** in Vercel: `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`

### Backlog
7. **Schedule board refactor** — `app/dashboard/admin/schedule-board/page.tsx` is 2,850 lines / 137KB. Extract `OperatorRow`, `JobCard`, `EditModal`, `DispatchModal` to `_components/`. Refactor-only (no logic change).
8. **Android (Google Play)** — after iOS approval: `npx cap add android`, $25 fee, APK upload
9. **iOS splash screen** — 2732×2732 opaque purple + bridge logo (for iPad + older iPhones)
10. **Apple Developer Program renewal** — confirm $99/yr is current for continued TestFlight + App Store
11. **End-to-end smoke test** — schedule → dispatch → in-route → work-performed → day-complete → invoice → paid
12. **Loading states audit** — check remaining pages for missing `loading.tsx` skeletons

---

## Key File Map

```
pontifex-platform/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   ├── jobs/[id]/                  # Job CRUD, progress, live-status, change-orders
│   │   │   ├── schedule-board/             # Schedule board data (operators, capacity, crew grid)
│   │   │   ├── timecards/                  # Admin timecard management + manual entry
│   │   │   ├── equipment/                  # Equipment CRUD + voice alias suggestions
│   │   │   ├── equipment-checkouts/        # Checkout/check-in + voice-parse + audio upload
│   │   │   ├── fleet/[id]/service-records/ # Fleet maintenance history
│   │   │   ├── maintenance-requests/       # Maintenance inbox triage
│   │   │   ├── supervisor-visits/          # Site visit reports
│   │   │   ├── invoices/                   # Invoice CRUD + confirm + send
│   │   │   └── peer-ratings/              # Rating forms + submissions
│   │   ├── timecard/
│   │   │   ├── clock-in/route.ts          # GPS + NFC clock-in (100ft geofence, rate-limited)
│   │   │   └── clock-out/route.ts         # GPS clock-out + lunch deduction
│   │   ├── public/tenant-by-code/route.ts  # DEAD CODE — login calls RPC directly now
│   │   └── cron/                          # Auto-clockout + invoice reminders
│   ├── company-login/page.tsx             # Main login — calls supabase.rpc() directly (fast)
│   ├── dashboard/
│   │   ├── admin/
│   │   │   ├── active-jobs/               # Job cards with duplicate + delete
│   │   │   ├── schedule-board/            # 2850-line main board
│   │   │   ├── schedule-form/             # Multi-step job creation + edit mode
│   │   │   ├── equipment/                 # Equipment list + detail
│   │   │   ├── fleet/                     # Vehicle list + service history
│   │   │   ├── inventory-control/         # 4-tab unified inventory page (voice checkout here)
│   │   │   ├── maintenance/               # Maintenance inbox
│   │   │   ├── site-visits/               # Supervisor visit reports
│   │   │   ├── timecards/                 # Team payroll + operator detail
│   │   │   ├── peer-ratings/              # Rating forms + team ratings
│   │   │   └── billing/                   # Invoice pipeline
│   │   ├── my-jobs/                       # Operator job list + job detail tickets
│   │   ├── timecard/                      # Operator personal timecard
│   │   └── maintenance/new/              # Operator maintenance request wizard (3-tap)
│   └── page.tsx                          # Pontifex Industries homepage
├── lib/
│   ├── api-auth.ts                        # requireAuth, requireAdmin, requireSuperAdmin, etc.
│   ├── auth.ts                            # getCurrentUser() + useAuthUser hook
│   ├── rbac.ts                            # ADMIN_CARDS + ROLE_PERMISSION_PRESETS
│   ├── supabase-admin.ts                  # Service-role client (bypasses RLS)
│   ├── supabase.ts                        # Anon client (client-side)
│   ├── sms.ts                             # sendSMSAny() Telnyx→Twilio + sendSignatureRequestSMS()
│   ├── geolocation.ts                     # SHOP_LOCATION + radius constants (single source of truth)
│   ├── skills-taxonomy.ts                 # Operator skills definitions (cutting/equipment scopes)
│   └── hooks/
│       ├── useAuthUser.ts                 # Async-safe auth hook, Supabase session as ground truth
│       └── useVisiblePoll.ts              # Polls only when tab visible + online
├── components/
│   ├── BrandingProvider.tsx               # White-label tenant branding
│   ├── DashboardSidebar.tsx               # Role-aware navigation (excludeRoles + roles fields)
│   ├── NfcClockInModal.tsx                # NFC + GPS + PIN clock-in flow
│   └── NotificationBell.tsx              # In-app notification bell (admin + operator)
├── ios/App/
│   ├── App/Info.plist                     # arm64, ITSAppUsesNonExemptEncryption=false
│   ├── App/App.entitlements               # aps-environment=production + NFC entitlement
│   └── App/Assets.xcassets/AppIcon.appiconset/  # 1024×1024 opaque PNG
├── supabase/migrations/                   # 70+ migration files (all idempotent)
├── CLAUDE.md                              # Project conventions + sprint backlog (update checkboxes)
├── CLAUDE_HANDOFF.md                      # ← THIS FILE (update at end of every session)
├── CLAUDE_CONTEXT.md                      # Full architecture reference
├── CLAUDE_SESSION_CONTEXT.md             # Detailed schema + patterns + business rules
├── SHOP_MANAGER_PLAN.md                   # Shop manager module plan (C-phases all shipped)
├── APP_CHANGES.md                         # Native iOS-only changes + App Store submission guide
├── DEPLOYMENT_COST.md                     # Vercel build cost discipline (read before pushing)
└── vercel.json                            # maxDuration, cron config, blocked branch deploys
```

---

## Quick Sanity Checks (Run at Start of Every Session)

```bash
# 1. Confirm branch and recent commits
git log --oneline -5
git status

# 2. Verify build passes (must be 0 errors)
npm run build

# 3. Check what's pending push
git log origin/main..HEAD --oneline

# 4. Start dev server if doing UI work
npm run dev   # port 3000
```

**Expected state:**
- `git log` shows HEAD at `08b54de7` (compliance fixes) or later
- `npm run build` exits 0 with no TS errors
- `git log origin/main..HEAD` shows `08b54de7` pending (or empty if already pushed)
- https://www.pontifexindustries.com returns 200
- Apple review email may have arrived at pontifexindustries@gmail.com
