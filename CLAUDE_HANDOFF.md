# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** April 5, 2026 | **Branch:** `feature/schedule-board-v2` | **Build Status:** PASSING ✅ (0 errors)

---

## CURRENT STATE

### Git Status
- **Branch:** `feature/schedule-board-v2`
- **Last commit:** `b38401d2` — "merge: tender-dirac worktree — Approve Job modal full details + EFS + storage buckets + customer site addresses"
- **Pushed to origin** ✅
- **Build:** PASSING (0 errors, 70 pages)

### Recent Commits (This Session — April 5, 2026)
```
b38401d2 merge: tender-dirac worktree — all April 5 features
f5cb63ec feat: enhance Approve Job modal with full jobsite details, compliance, and scheduling info
24f91054 feat: remove Payment & Billing section from CustomerForm
```

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

---

## NEXT SESSION PRIORITIES
If another automated session runs before the manual test:
1. **Patriot logo upload** — get the logo file path from user, update `tenant_branding` row
2. **Vercel env vars check** — verify all 8 required vars are set in Vercel dashboard
3. **Production DNS** — verify pontifexindustries.com points to Vercel

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
