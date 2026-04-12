# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** April 7, 2026 | **Branch:** `feature/schedule-board-v2` | **Build Status:** PASSING ✅ (0 errors)

---

## CURRENT STATE

### Git Status
- **Branch:** `feature/schedule-board-v2`
- **Last commit:** `f63caed3` — "feat(operator): collapsible sections + simplified in-route view"
- **Pushed to origin** ✅
- **Build:** PASSING (0 errors)
- **Dev server:** running on port 3001

### Recent Commits (April 7, 2026 session)
```
f63caed3 feat(operator): collapsible sections + simplified in-route view
4655a031 fix: operator job page — site contact always visible + conditions/compliance/notes on main page
df09598b fix: Schedule Preview synced to real data — jobs show even if unassigned, operators/team members split
d3730d30 fix: mic permission handling in AI Smart Fill — request permission, show professional denied UI
7a8f436d feat: per-day assignment tracking via job_daily_assignments
00a9084f feat: Scope of Work and Equipment fully editable in job modal
54e40295 fix: push tickets works every day independently, day label shows correct day number
```

---

## WHAT WAS DONE (April 7, 2026 — Session Start)

### Operator Job Detail Page Overhaul (`app/dashboard/my-jobs/[id]/page.tsx`)
- **In-route simplified view**: when `job.status === 'in_route'`, page shows ONLY Location + Site Contact with Call button + "Arrived — Start In Progress" CTA; all other sections hidden
- **Collapsible sections**: every section now has a toggle button with ChevronDown indicator:
  - Site Contact (green)
  - Crew (blue)
  - Work Details (existing)
  - Equipment (existing)
  - Jobsite Conditions (amber)
  - Site Compliance (indigo)
  - Additional Notes (purple)
  - Documents (collapsed by default)
- Build: PASSING ✅, committed `f63caed3`, pushed to origin

### Schedule Board Fixes (this session's worktree — tender-dirac)
- All job ticket fields editable inline (Job Info, Work Conditions, Site Compliance, Notes, Scope, Equipment)
- Push Tickets works every day independently for multi-day jobs
- Day label shows correct "Day N of M" based on currently-viewed date
- Per-day assignments via `job_daily_assignments` table — unassigning one day doesn't affect other days
- Mic permission in AI Smart Fill: requests permission professionally, shows denied UI with instructions
- Schedule Preview synced to real data: shows unassigned jobs, splits operators vs team members

---

## WHAT WAS DONE (April 5, 2026 Session 2 — agent-abdb6df8 worktree)

### Operator Flow Audit + Bug Fixes

**Root cause of "Experiencing server issues - reconnecting...":**
The `active_job_orders` DB view was created in migration `20260317` (before multi-tenant was added in `20260328`). The `/api/job-orders` route called `.eq('tenant_id', tenantId)` on the view, but `tenant_id` was never included in the view → PostgREST returned HTTP 400/500 → `NetworkMonitor.tsx` counted 3+ failures → showed the server issues banner on every operator page load.

**Migration `20260405000010_fix_operator_job_rls.sql` (applied to Supabase):**
- Rebuilt `active_job_orders` view with all missing fields: `tenant_id`, `on_hold`, `on_hold_reason`, `pause_reason` (aliased from `on_hold_reason` for UI compatibility), `project_name`
- Added `operator_can_view_own_jobs` RLS policy on `job_orders`: operators/apprentices can SELECT rows where `assigned_to = auth.uid()` OR `helper_assigned_to = auth.uid()`
- Admins/managers see all jobs via JWT metadata role check
- Ensured `job_orders` has RLS enabled

**`/api/job-orders/route.ts`:**
- Added `include_helper_jobs` param: when true, uses `.or('assigned_to.eq.UID,helper_assigned_to.eq.UID')` instead of just `assigned_to` filter
- Added `date_from`/`date_to` params for the 7-day lookahead used by my-jobs page
- Returns `user_role` in both single-job and list responses (used by my-jobs to set `isHelper` state)
- Fixed single-job auth check: now allows access if `helper_assigned_to === user.id` (was blocked for helpers)

**`/api/job-orders/[id]/status/route.ts`:**
- Fixed permission check: helpers (apprentices) assigned to a job can now update its status (was returning 403 for `helper_assigned_to` users)

**Dispatch flow verified clean (no bugs found):**
- Admin `POST /api/admin/schedule-board/dispatch` → sets `dispatched_at` + status `assigned` + sends in-app notifications + SMS ✅
- Operators see dispatched jobs via `/api/job-orders` (now fixed with tenant_id) ✅
- Status transitions `assigned → in_route → in_progress → completed` all work via the status API ✅
- Clock-in via NFC or manual uses `/api/time-clock` (separate route, not affected) ✅

---

## WHAT WAS DONE (April 5, 2026 — tender-dirac worktree)

### Customer Data Persistence
- New table `customer_site_addresses` — upsert by address string, tracks `use_count` + `last_used_at`
- New API routes: `GET/POST /api/admin/customers/[id]/site-addresses` and `GET /api/admin/customers/[id]/project-names`
- Schedule form: SmartCombobox dropdowns for past site addresses and project names; fire-and-forget save on submit
- **Site address no longer auto-fills from customer office address** (they are separate locations)

### Photo/Document Upload Fix
- Created 4 Supabase Storage buckets: `jobsite-area-docs`, `scope-photos`, `site-compliance-docs`, `job-photos`
- RLS policies: authenticated upload + public read + authenticated delete
- `PhotoUploader.tsx` now shows actual Supabase error message on failure

### EFS — Electric Floor Sawing
- Added `EFS` to `SERVICE_TYPES`, `FLEXIBLE_SCOPE_TYPES`, `SCOPE_FIELDS`, `SERVICE_EQUIPMENT` in schedule form
- Green/emerald color scheme, same structure as DFS, plus Extension Cord and GFCI items
- Added EFS to `lib/equipment-map.ts` EQUIPMENT_PRESETS

### Compliance Documents Modal
- Replaced inline expansion with a proper overlay `CreateFacilityModal` component in schedule form Step 6
- Matches the AddFacilityModal design from the Facilities admin page (uniform UX)

### Approve Job Modal — Full Details
- Rebuilt `schedule_board_view` (migration `20260405000003`) to expose all missing fields
- Extended `PendingJob` interface with: `po_number`, `site_contact`, `contact_phone`, `project_name`, `scheduling_flexibility`
- Unified equipment list: merges `equipment_needed[]` + active `equipment_selections` dict items into one flat list
- Added 3 new sections (all expanded by default):
  - **Jobsite Info** (slate): project name, site address, site contact + phone, PO number
  - **Site Compliance Requirements** (amber): orientation datetime, badging type, special instructions
  - **Scheduling Notes** (blue): special arrival time, outside hours details, weekend availability

---

## WHAT WAS DONE (This Session — April 4, 2026 — Parallel Agent Launch)

Three parallel agents ran simultaneously. All changes landed in commit `aba3bee0`.

### Agent A — E2E Workflow Smoke Test

**P0 Fix — `app/api/admin/schedule-form/route.ts`**
- Removed a redundant manual role check that ran *after* `requireAdmin()`. The extra check only allowed `['admin', 'super_admin']`, so `operations_manager` users got a 403 when submitting the 8-step schedule form despite passing the auth guard.

**P1 Fix — `app/api/jobs/[id]/completion-request/route.ts`**
- `requireAuth()` returns `tenantId: profile.tenant_id || ''`. When tenant_id is null, the route was running `.eq('tenant_id', '')` which matched zero rows → 404 on every completion request.
- Fix: conditional tenant filter (`if (tenantId) query = query.eq(...)`). Resolved tenant_id from the fetched job record for inserts/updates.

**Files Audited (all clean besides the above):**
- schedule-form API + UI, dispatch-pdf route, clock-in route, work-items route, status route, completion-request route, admin approval route, invoices create/patch, api-auth.ts

### Agent B — Mobile Responsive Audit (Operator Pages, 375px)

**Timecard page — `app/dashboard/timecard/page.tsx`**
- Grid changed from `grid-cols-3` → `grid-cols-2 sm:grid-cols-3` (Total Hours card spans full width on mobile)
- 6-column daily entries table: hid `Category` column with `hidden sm:table-cell`, shortened headers to In/Out/Hrs, reduced padding/font sizes for mobile

**Work Performed page — `app/dashboard/job-schedule/[id]/work-performed/page.tsx`**
- Header bar on mobile was overflowing: badge now only shown when items selected, button text shortened on mobile via `sm:hidden`/`hidden sm:inline`

**Pages audited with no issues:** my-jobs list, my-jobs/[id] detail, jobsite view, day-complete

### Agent C — Patriot Branding

**DB — `tenant_branding` table (PATRIOT tenant)**
- Updated from Pontifex purple palette to Patriot:
  - `primary_color`: `#DC2626` (red)
  - `primary_color_dark`: `#B91C1C`
  - `secondary_color`: `#1E3A5F` (navy)
  - `accent_color`: `#EF4444`
  - `header_bg_color`: `#1E3A5F`
  - `sidebar_bg_color`: `#0F1F33`
  - `login_bg_gradient_from/to`: navy gradient
  - `login_welcome_text`: "Welcome to Patriot"
  - `login_subtitle`: "Concrete Cutting Management Software"

**Code — `lib/branding-context.tsx`**
- Updated `DEFAULT_BRANDING` fallback (shown on API failure) from Pontifex purple to Patriot red/navy colors

**BrandingProvider API:** No bugs — queries correctly, handles missing rows gracefully.

**Verified:** Login page shows "Welcome to Patriot" + "Concrete Cutting Management Software" ✅

---

## FEATURE STATUS

### Complete ✅
| Feature | Status | Notes |
|---------|--------|-------|
| Multi-tenant architecture | ✅ | Company code login, tenant_id on all tables |
| White-label branding | ✅ | Patriot colors live in DB + code fallback |
| Patriot branding colors | ✅ | Red #DC2626 + navy #1E3A5F in tenant_branding |
| Light theme | ✅ | All admin/operator pages light, sidebar stays dark |
| Schedule Board | ✅ | All operators view, time-off, editing, crew grid, notifications |
| Schedule Form | ✅ | P0 role bug fixed — operations_manager can now create jobs |
| Team Profiles | ✅ | Editable hire date, role-specific cards |
| Feature Permissions | ✅ | No emojis, 5 clean presets, job visibility toggle |
| Customer Management | ✅ | Multi-contact support, Google Maps autocomplete |
| Facilities | ✅ | CRUD, badge tracking, visible modal inputs |
| Timecards | ✅ | Full clock in/out, NFC, GPS, segments, approval |
| Operator Skills | ✅ | 9 predefined + custom, 1-10 ratings, visual bars |
| Capacity Settings | ✅ | Per-skill limits, difficulty threshold, crew size rules |
| Active Jobs | ✅ | All admins see all jobs, "Coming Up" tab |
| Notification System | ✅ | In-app + email, auto-reminders |
| Analytics Dashboard | ✅ | 20 widgets, charts, commission tracking |
| Billing & Invoicing | ✅ | Create, send, remind, QuickBooks CSV |
| Security Audit | ✅ | NFC bypass, XSS, tenant isolation |
| NFC Clock-In (Web API) | ✅ | NDEFReader, iOS PIN fallback, GPS remote mode |
| E2E flow (code-level) | ✅ | All API routes audited, P0/P1 bugs fixed |
| Mobile responsive (operator) | ✅ | Timecard + work-performed fixed at 375px |

### Remaining — User Must Do Manually
- [ ] **Manual UX test**: Create customer → create job → dispatch → operator clock-in → work performed → complete + signature → invoice → mark paid → approve timecard
- [ ] **Patriot logo**: Upload logo file to `tenant_branding.logo_url` (no file provided yet)
- [ ] **Production prep**: Verify Vercel env vars all set (see list below)
- [ ] **Go live**: Merge `feature/schedule-board-v2` → `main` after manual test passes

> **The operator "server issues" banner is now fixed.** The `active_job_orders` view now has `tenant_id`. Operator page loads should work cleanly. Recommend doing a manual smoke test: log in as an operator, check `/dashboard/my-jobs` — should show dispatched jobs with no server error banner.

---

## NEXT SESSION PRIORITIES
1. **Manual UX smoke test** — schedule → dispatch → operator in-route → arrived → work performed → complete → invoice
2. **Loading states & error handling audit** — remaining pages with no skeletons/spinners
3. **Patriot logo upload** — get logo file, update `tenant_branding.logo_url`
4. **Vercel env vars check** — verify all 8 required vars set in Vercel dashboard
5. **Production DNS** — verify pontifexindustries.com → Vercel
6. **Merge to main** — after manual test passes

---

## KNOWN ISSUES / WATCH LIST
- If changes don't appear on localhost: kill port 3000 with `lsof -ti:3000 | xargs kill -9`, delete `.next/`, restart preview server
- If Vercel production seems stale: go to Cloudflare → Caching → Purge Everything
- Worktrees do NOT inherit `.env.local` — copy from main repo when using parallel agents

---

## INFRASTRUCTURE

### Vercel
- **Auto-deploy**: pushes to `feature/schedule-board-v2` trigger preview deploys
- **Merges to `main`** trigger production at pontifexindustries.com
- **Env vars required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

### Supabase
- **Project ID**: `klatddoyncxidgqtcjnu`
- **95+ tables**, all RLS enabled, JWT metadata for tenant isolation
- **Branding updated**: `tenant_branding` for PATRIOT tenant now uses red/navy palette

### Dev Server
- Preview server managed via `preview_start` / `preview_stop` MCP tools
- Config in `.claude/launch.json`
- Commits require `export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"` prefix
