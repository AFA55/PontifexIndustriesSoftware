# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** April 4, 2026 | **Branch:** `feature/schedule-board-v2` | **Build Status:** PASSING ✅ (0 errors)

---

## CURRENT STATE

### Git Status
- **Branch:** `feature/schedule-board-v2`
- **Last commit:** `2f3f8b03` — "feat: operator skills, capacity settings, active jobs overhaul, customer UX improvements"
- **Pushed to origin** ✅
- **Build:** PASSING (0 errors)
- **Vercel:** Auto-deploying preview from feature branch

### Recent Commits (This Session)
```
2f3f8b03 feat: operator skills, capacity settings, active jobs overhaul, customer UX improvements
b6ad8d91 feat: real NFC Web API scanning + GPS-only out-of-town clock-in mode
```

---

## WHAT WAS DONE (This Session)

### 1. Operator Skill Rankings System (Agent 1)

**New tables (migrated to Supabase):**
- `operator_skill_categories` — global defaults (tenant_id=NULL) + tenant-custom categories
- `operator_skill_ratings` — per-operator 1-10 ratings with notes, rated_by, timestamps

**9 seeded default categories:** Core Drilling, Hand Sawing/Push Sawing, Chain Sawing, Wall Saw, Track Saw, Demo, Slab Sawing, Removal, Nook Operation

**API Routes:**
- `GET/POST /api/admin/operators/[id]/skills` — fetch all categories with ratings, upsert ratings
- `GET/POST /api/admin/skill-categories` — list + create custom categories (auto-slug)
- `PUT/DELETE /api/admin/skill-categories/[id]` — update name/active, soft-delete (blocks defaults)

**UI:**
- `app/dashboard/admin/operator-profiles/_components/SkillsTab.tsx` — Skills tab in profile drawer: visual 1-10 rating bars, inline edit, notes field, rated-by attribution, add custom category form
- `app/dashboard/admin/operator-profiles/page.tsx` — top-3 skill mini-badges (⚡ Wall Saw 9) on profile cards

### 2. Capacity Settings Page (Agent 2)

**New page:** `app/dashboard/admin/settings/capacity/page.tsx`
- Skill-Based Capacity section: Wall Saw (3), Brokk (2), Precision DFS (2), Core Drilling (4), Slab Sawing (3), Flat Sawing (3), Wire Sawing (2) — all editable with +/− counters
- High-Priority Job Limits: difficulty threshold (default 7) + max simultaneous high-difficulty jobs (default 2)
- Crew Size Limits: max operators per job (4), min operators for difficulty 8+ (2)
- General Capacity: max daily slots, warning threshold

**New API:** `GET/PUT /api/admin/capacity-settings` — reads/writes to `schedule_settings` JSONB key `capacity`

**DB migration applied:** `20260404001001_capacity_skill_settings.sql` — upserts enriched capacity defaults, fixes RLS to allow all admin roles to read

### 3. Active Jobs Overhaul (Agent 2)

**`app/dashboard/admin/active-jobs/page.tsx`:**
- All admin roles now default to `viewAll=true` (all company jobs visible by default)
- "My Jobs Only" toggle available to all admins (not gated behind super_admin)
- Replaced `in_progress` filter tab/stat with `coming_up` — shows jobs where `scheduled_date === tomorrow`
- "Coming Up" stat card uses indigo/ArrowRight icon

**`app/api/admin/active-jobs/route.ts`:**
- Removed role-based scope restriction — all admins get full tenant job list unless `mine=true` is explicit

### 4. Google Maps Places Autocomplete (Agent 3)

**`app/dashboard/admin/customers/_components/CustomerForm.tsx`:**
- Uses `AutocompleteService` + `PlacesService` from the existing Google Maps JS API loader
- Street Address field shows predictions on keystroke (US addresses, address type only)
- On selection: `getDetails()` splits address_components → auto-fills street, city, state, zip
- Dark-themed dropdown (bg-slate-700/text-white)
- "Autocomplete enabled" badge shown when Maps API is loaded

### 5. Contact Type System (Agent 3)

**DB migration applied:** `20260404001002_contact_type.sql`
```sql
ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS contact_type text DEFAULT 'general'
  CHECK (contact_type IN ('on_site', 'billing', 'general'));
```

**`app/dashboard/admin/customers/_components/ContactForm.tsx`:**
- Pill button selector at top: General (gray) / On-Site Contact (amber) / Billing Contact (green)
- `contact_type` included in form submission

**`app/dashboard/admin/customers/[id]/page.tsx`:**
- Contact cards show colored badges: amber "On-Site", green "Billing", gray "General"

### 6. Facility + NFC Field Visibility Fix (Agent 3)

- `app/dashboard/admin/facilities/page.tsx` — all modal inputs/textareas/selects updated to `bg-gray-800 border-gray-700 text-white` — modal containers changed from white to dark. Labels to `text-gray-300`.
- `app/dashboard/admin/settings/nfc-tags/page.tsx` — form inputs given explicit `text-slate-900 bg-white` for guaranteed visibility

### 7. NFC Clock-In Web API + GPS Remote Mode (Agent 4)

**New hook:** `hooks/useNFCScan.ts`
- Web NFC API (`window.NDEFReader`) hook for physical chip scanning (Android Chrome only)
- Checks support, manages AbortController, extracts serial + NDEF text records
- Surfaces: `isSupported`, `isScanning`, `startScan`, `stopScan`, `lastScan`, `error`

**New component:** `components/NFCClockIn.tsx` — 3-mode mobile-first clock-in:
- **NFC tab** (Android): pulsing tap animation → NDEFReader scan → verify against tag → clock in
- **PIN tab** (iOS/unsupported): 6-digit PIN pad → `/api/timecard/verify-pin` → clock in
- **Remote tab**: GPS captured → `clock_in_method: 'gps_remote'` + `requires_approval: true` → amber warning shown

**New API:** `app/api/timecard/verify-pin/route.ts` — verifies today's daily shop PIN from `shop_daily_pins` table

**DB migration applied:** `20260404001003_nfc_clockin_improvements.sql`
- `timecards`: added `nfc_tag_serial`, `requires_approval`, `approval_note`, `clock_in_method`, `clock_out_method`
- `shop_daily_pins` table: admin sets 4-8 digit daily PIN, operators enter it for on-site verification (fallback when NFC unsupported)
- 2 performance indexes

**Modified:**
- `app/api/timecard/clock-in/route.ts` — added `gps_remote` + `pin` to valid methods, stores `nfc_tag_serial`, auto-sets `requires_approval=true` for gps_remote
- `app/api/admin/timecards/remote-verify/route.ts` — fetches both `remote` + `gps_remote`, returns `maps_url` + `is_gps_remote`
- `app/dashboard/timecard/page.tsx` — replaced `NfcClockInButton` with `NFCClockIn` component
- `app/dashboard/admin/timecards/operator/[id]/page.tsx` — amber "Remote · Review" badge with pulsing animation + Google Maps link for gps_remote entries

---

## FEATURE STATUS

### Complete ✅
| Feature | Status | Notes |
|---------|--------|-------|
| Multi-tenant architecture | ✅ | Company code login, tenant_id on all tables |
| White-label branding | ✅ | Tenant branding context, debranded defaults |
| Schedule Board | ✅ | All operators view, time-off, editing, crew grid, notifications |
| Schedule Form | ✅ | Customer-first flow, smart PO/contact dropdowns, facility compliance |
| Personalized Dashboards | ✅ | Personal/team scope per role, super_admin toggle |
| Job Scope Tracking | ✅ | Admin defines scope, operators log progress, % complete |
| Job Completion Workflow | ✅ | Operator submits → salesperson notified → approve/reject |
| Timecard System | ✅ | Full clock in/out, NFC, GPS, segments, approval workflow |
| NFC Clock-In (Web API) | ✅ | NDEFReader physical chip scanning, iOS PIN fallback, GPS remote mode |
| Shop Daily PIN | ✅ | Admin sets daily PIN, operators enter to prove on-site (iOS fallback) |
| GPS Remote Clock-In | ✅ | Out-of-town mode, requires_approval=true, admin review queue with maps link |
| Operator Skill Rankings | ✅ | 9 predefined + custom, 1-10 ratings, visual bars in profile drawer |
| Capacity Settings | ✅ | Per-skill job limits, high-difficulty threshold, crew size rules |
| Active Jobs Overhaul | ✅ | All admins see all jobs, "Coming Up" tab for tomorrow |
| Google Maps Autocomplete | ✅ | Customer form address → auto-fills city/state/zip |
| Contact Types | ✅ | On-Site / Billing / General with colored badges |
| Facility/NFC Visibility | ✅ | Fixed dark-text-on-dark inputs in facility and NFC forms |
| Notification System | ✅ | In-app + email, auto-reminders, NFC bypass, bell component |
| Analytics Dashboard | ✅ | 20 widgets, drag-and-drop, charts, commission tracking |
| Billing & Invoicing | ✅ | Create, send, remind, payment tracking, QuickBooks CSV |
| Customer Management | ✅ | COD payment, contacts with type badges, billing dashboard |
| Facilities & Badges | ✅ | Facility CRUD, badge tracking, auto-expiration |
| Security Audit | ✅ | NFC bypass, XSS, tenant isolation, data exposure fixes |
| Error Boundaries | ✅ | Global + dashboard error.tsx, 404 page, loading skeletons |

### Remaining — Final Sprint
- [ ] End-to-end workflow testing (schedule → dispatch → execute → complete → invoice)
- [ ] Mobile responsive audit on all operator pages
- [ ] Patriot-specific visual assets (logos, custom colors in tenant_branding)
- [ ] Production deployment prep (env vars, custom domain, SSL)
- [ ] Final build verification & merge to main
- [ ] Set up first daily shop PIN for NFC fallback (admin action, not code)

---

## KEY ARCHITECTURE ADDITIONS

### NFC Clock-In Decision Tree
```
Operator opens timecard page
  ↓
NFCClockIn component renders 3 tabs:
  ├── NFC (Android Chrome + NDEFReader support)
  │     └── tap physical chip → verified → clock in (no approval needed)
  ├── PIN (iOS / unsupported browsers)
  │     └── 6-digit PIN from shop_daily_pins → verified → clock in
  └── Remote (traveling / out-of-town)
        └── GPS captured → clock in with requires_approval=true
              └── admin sees amber badge in timecards + Google Maps link
```

### Skill Rankings Data Flow
1. Global default categories seeded in `operator_skill_categories` (tenant_id=NULL)
2. Admin opens operator profile → Skills tab → rates each skill 1-10
3. Ratings stored in `operator_skill_ratings` (operator_id, category_id, rating)
4. Profile cards show top-3 skill badges
5. Admin can add custom categories via skill-categories API

### Capacity Settings Storage
- Stored as JSONB in `schedule_settings` table, key = `'capacity'`
- API merges new values with existing (preserves custom settings)
- Used by schedule board to warn when limits are exceeded

---

## NEXT SESSION PRIORITIES
1. **E2E workflow test**: schedule → dispatch → execute → complete → invoice
2. **Mobile responsive audit**: `/dashboard/timecard`, operator pages, NFCClockIn on small screens
3. **Patriot branding**: logo upload, custom colors in tenant_branding settings
4. **Production prep**: Vercel env vars, custom domain DNS, SSL cert
5. **Merge to main** and final release

---

## INFRASTRUCTURE

### Vercel
- **Auto-deploy**: pushes to `feature/schedule-board-v2` trigger preview deploys
- **Merges to `main`** trigger production at pontifexindustries.com
- **Env vars required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

### Supabase
- **Project ID**: `klatddoyncxidgqtcjnu`
- **95+ tables**, all RLS enabled, JWT metadata for tenant isolation
- **New tables this session**: `operator_skill_categories`, `operator_skill_ratings`, `shop_daily_pins`
- **Altered tables**: `timecards` (nfc_tag_serial, requires_approval, approval_note, clock_in/out_method), `customer_contacts` (contact_type)

### Dev Server (Worktrees)
- Worktrees do NOT inherit `.env.local` — copy from main repo
- Delete `.next/` if routes-manifest.json errors appear
- Preview server lockfile: set `runtimeExecutable: "/bin/sh"`, `runtimeArgs: ["-c", "PATH=/usr/local/bin:$PATH npm run dev"]`
- Commits require `PATH="/usr/local/bin:$PATH"` prefix for husky npx hook
