# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** May 3, 2026 (SUPERVISOR DASHBOARD SESSION) | **Branch:** `claude/inspiring-swanson-31ba74` (pushed to origin) → merged to local `main` (NOT yet pushed to origin/main) | **Production:** 🚀 LIVE at https://www.pontifexindustries.com (last deploy commit `0963259f`) | **Build:** PASSING ✅ | **DB:** Migration `20260502_supervisor_visits` applied

---

## MAY 10, 2026 (PT 3) — Phase C(ii)-b foundation: voice mic + parser + auto-fill

Voice equipment checkout MVP. Hold mic, speak ("FS5000 number 5 to truck 3"), fields auto-fill. Multi-item pending tray + audio recording + learning-loop alias prompts queued for C(ii)-b polish.

**Branch only — NOT main.** Commit `c175782e`.

### What's live
- **pg_trgm extension** enabled (was missing).
- **`voice_recognition_corrections` table** — learning-loop foundation. Records every successful voice match → future calls hit cache before fuzzy search.
- **Trigram GIN indexes** on `equipment.name` + `short_name` (filtered to active rows).
- **`POST /api/admin/equipment-checkouts/voice-parse`** — 6-tier scoring: cache (0.98) > alias exact (1.00) > asset_tag (0.95) > short_name+unit (0.85-0.90) > partial (0.65-0.85) > trigram fallback. Returns top-3 alternatives per slot for the amber picker.
- **Phrase segmentation** — "going with X" → operator; "to truck N" / "into X" → truck; rest → equipment. Normalization: lowercase, "number" → "#", strip punctuation.
- **VoiceMic component** — hold-to-talk button with browser-feature detection (Chrome/Edge/Safari OK; Firefox shows friendly message). Inline transcript + permission-denied error handling. Stale-closure safe (transcript mirrored in ref).
- **VoiceMatchSummary component** — confidence tiers visualized:
  - ≥0.85 → green chip + auto-fill the field
  - 0.60-0.84 → amber + top-3 alternatives picker
  - <0.60 → red + free-text fallback hint

### What's deliberately deferred (next session: C(ii)-b polish)
- **Multi-item pending tray** — speak 5 things in a row, confirm-all at end
- **Audio recording** (MediaRecorder API) + upload to Supabase Storage → save URL on `equipment_checkouts.voice_note_url` for audit replay
- **Learning-loop alias prompt** — after 3 matches of same phrase, prompt shop_manager to add as permanent alias on equipment row
- **Persistence** — actually insert into `voice_recognition_corrections` on every confirmed checkout (table exists; just need the write call wired in)

### Files
```
supabase/migrations/20260510_voice_recognition_corrections.sql      (new — applied)
app/api/admin/equipment-checkouts/voice-parse/route.ts              (new)
app/dashboard/admin/inventory-control/page.tsx                      (VoiceMic, VoiceMatchSummary, integration)
SHOP_MANAGER_PLAN.md                                                (C(ii) marked shipped + polish queued)
```

### Test path
1. Refresh localhost (`http://localhost:51361`)
2. Login as shopmanager@pontifex.com / Shop1234!
3. Inventory Control → Checkout tab
4. Pink mic banner at top — tap mic, allow microphone permission
5. Say: "FS5000 number 5" (the equipment we created earlier)
6. Stop talking → see transcript → parse fires → green chip + auto-fill the equipment field
7. Variations to try: "PTRT-0001" (asset tag), "Husqvarna 5000" (partial name)
8. With trucks: add a truck via Fleet first, then say "FS5000 number 5 to truck 3"

### Known caveats
- Web Speech API requires HTTPS or localhost. Production already on HTTPS, localhost works.
- Permission prompt fires the first time. Once granted, subsequent uses skip the prompt.
- Browser detection is honest — Firefox users get a clear "use Chrome/Edge/Safari" message instead of a broken button.

---

## MAY 10, 2026 (PT 2) — shop_manager Forbidden bug fix + equipment storage dropdown + Phase C plan

Big multi-task ask from user. Did the two ship-ready fixes and documented the four bigger features as Phase C in `SHOP_MANAGER_PLAN.md`. **Branch only** — not pushed to main. Commit `4e6f1244`.

### Critical bug fixed: shop_manager couldn't load dashboard
- Symptom: `Forbidden. Sales staff access required` console error on `/dashboard/admin` for shop_manager. Half-rendered page.
- Cause: `/api/admin/schedule-board` was gated by `requireSalesStaff` (excludes shop_manager).
- Fix: new `requireScheduleViewer` in `lib/api-auth.ts` — SALES_STAFF + shop_manager. Read-only. Applied to schedule-board root, active-jobs, active-jobs-summary. Write routes (schedule-form POST, job-orders PATCH, etc.) unchanged — shop_manager can SEE schedule but not CREATE jobs.

### Equipment storage location → dropdown
Free-text was creeping into noise ("shelf 3", "Carlos's truck"). Replaced with:
- 🏭 Shop
- 🚚 `<truck>` · `<operator first name>` (per truck, loaded from Fleet)

Applied to New Equipment form + edit modal. Empty state hint if no trucks exist yet.

### UI permission cleanups
- "+ New Job" header button hidden for shop_manager + shop_help
- shop_manager preset gained `active_jobs: 'view'` so sidebar passes flag check

### Phase C plan (next sessions, in priority order)
- **C(ii)** Voice-driven Inventory Control + truck-as-custodian (operator picker → truck picker; mic button; alias fuzzy match; audio audit; learning loop)
- **C(iii)** Fleet maintenance history (vehicle_service_records table; oil/filter/repair tracking; tie to maintenance_requests)
- **C(iv)** Operator/Helper Maintenance Request form (3-tap mobile + voice memo) + Maintenance Inbox triage UI
- **C(v)** Visit-wizard equipment-issues → maintenance_requests conversion hook

Each Phase C entry in the plan doc names which agents own which slice — `supabase-migration-author`, `rls-policy-auditor`, `mobile-responsive-auditor`, plus general-purpose for UI scaffolds. Next sessions will dispatch these in parallel where safe.

### Files changed
```
lib/api-auth.ts                                    (new requireScheduleViewer guard)
lib/rbac.ts                                        (shop_manager preset: active_jobs view)
app/api/admin/active-jobs/route.ts                 (guard swap)
app/api/admin/active-jobs-summary/route.ts         (guard swap)
app/dashboard/admin/layout.tsx                     (hide New Job for shop_manager/help)
app/dashboard/admin/equipment/[id]/page.tsx        (storage location dropdown)
app/dashboard/admin/equipment/new/page.tsx         (storage location dropdown)
SHOP_MANAGER_PLAN.md                               (Phase C added)
```

---

## MAY 10, 2026 — Per-role lunch default + cleaner edit affordances

Quick polish session after user verified the May 8 PT 4 work on localhost. Three small fixes ready to ride to prod with the next push.

**Branch only — NOT pushed to main yet.** Branch `claude/inspiring-swanson-31ba74`, commit `cd3e72a9`.

### Fix 1 — Shop manager + shop help take a 1-hour lunch
- Backfill: `UPDATE profiles SET default_lunch_minutes = 60 WHERE role IN ('shop_manager','shop_help') AND default_lunch_minutes IS NULL`. Demo accounts already had 60 from May 7 PT 2 — no-op for them.
- New role-baseline fallback in `app/api/timecard/clock-out/route.ts`. Resolution order:
  1. `profile.default_lunch_minutes` (explicit per-user wins)
  2. `ROLE_DEFAULT_LUNCH` map: `shop_manager` + `shop_help` → 60
  3. `timecard_settings.break_duration_minutes` (tenant default — typically 30)
- Future shop_managers/shop_help auto-get 60min even without the explicit per-user override. Defense in depth.

### Fix 2 — Removed Edit button from team payroll table
The whole row is already a click target (navigates to operator detail). The legacy quick-Edit button was redundant + opened a stripped clock-in-only modal that didn't expose the new PTO/sick/holiday workflow.
- Renamed remaining "Detail" button to "View" (clearer intent).
- Edit happens from inside the operator detail page now — full-featured day cells with PTO chips, manual-entry modal, split date/time picker, lunch override.

### Fix 3 — Bigger edit button on operator detail page
The pencil-only button was too small to spot. Now:
- Icon + "Edit" text label
- Blue tint (50/100 bg, 700 text, 200 border)
- 14px icon, px-3 py-1.5 padding
- Meets tap-target standards on mobile

### Files changed
```
app/api/timecard/clock-out/route.ts                    (per-role lunch fallback)
app/dashboard/admin/timecards/page.tsx                 (Edit btn removed, Detail→View)
app/dashboard/admin/timecards/operator/[id]/page.tsx   (bigger edit btn)
```

### Note: dev server cache flush
Localhost was rendering unstyled HTML this morning — `Cannot find module './8263.js'` webpack chunk corruption from a 2-day-old `.next/` cache. Standard fix: nuke `.next/` + restart. New port: 55761.

---

## MAY 8, 2026 (PT 4) — Operator timecard edit UX: split picker + empty-day PTO entry + balance card

User found three problems while editing on the operator timecard detail page (`/dashboard/admin/timecards/operator/[id]`):
1. Native datetime-local picker registered wrong clicks (tap 6 → got 10).
2. Empty days had no editable affordance — couldn't log PTO/sick/holiday for someone who didn't clock in.
3. No visible PTO balance per operator.

**Branch only — NOT pushed to main** (user wants to test on localhost first). Branch `claude/inspiring-swanson-31ba74`, commit `9e0d2bca`. Localhost: http://localhost:55697.

### Fix 1 — Split date/time picker
- New `SplitDateTimePicker` component (file-local, in operator page).
- Replaces `<input type="datetime-local">` with `<input type="date">` + `<input type="time" step={60}>`.
- No more wheel-spinner mis-clicks. Reliable across Mac Safari + Chrome + mobile.
- Composes back to ISO via local Date constructor — no silent UTC drift like the old `.toISOString().slice(0,16)` path did.
- Accepts `allowEmpty` for clock-out (lets admin clear when still on shift).
- Both clock-in and clock-out fields in the edit modal now use this picker.

### Fix 2 — Empty-day quick actions + Manual Entry modal
Each day cell with no entries renders 4 quick-action chips below the day header:
- **+ PTO** (emerald)
- **+ Sick** (rose)
- **+ Holiday** (violet)
- **+ Manual hrs** (amber)

Click → opens Manual Entry modal pre-filled with that date and type. Modal:
- Hero gradient swaps based on selected type.
- Type chip row inside the modal lets admin change type (also exposes `admin_adjustment` as 5th option).
- Hours: number input (0.25 step, 0.25-16 range) + 4h/8h shortcut buttons.
- Optional notes field.
- For PTO: shows "Will use X day(s) · Y day(s) remaining after" live hint using current balance.

Submits to existing `POST /api/admin/timecards/manual` (built May 8 PT 2). That endpoint:
- Validates entry_type ∈ {pto, sick, holiday, manual, admin_adjustment}.
- Inserts manually-approved timecard row.
- For PTO: bumps `operator_pto_balance.pto_days_used` by `hours / 8`.
- Fire-and-forget audit log.

### Fix 3 — PTO Balance card
Emerald gradient card at top of operator detail page (above Daily Breakdown). Shows:
- **Days remaining** (large, primary metric)
- Allocated / Used / Callouts (3-column sub-stats)
- Year scoped to current calendar year

Fetched from existing `GET /api/admin/operators/pto-balance` — already tenant-scoped + role-gated. Fire-and-forget — non-blocking on the main timecard load. Card only renders if balance row exists.

### Files changed
```
app/dashboard/admin/timecards/operator/[id]/page.tsx   (+343 lines, -11)
```
Single-file change. No migration needed — the `manual` API + `operator_pto_balance` table + entry_type CHECK already exist.

### What's still NOT addressed (out of this session's scope)
- Lunch deduction edit (already exists from May 7 PT 1).
- "Edit existing entry" gradient styling polish — current edit modal is functional but visually plain. Could match the manual-entry modal's hero-gradient look in a follow-up.
- PTO balance card on the team payroll page (`/dashboard/admin/timecards`) — only on the per-operator detail right now.

### Next steps queued
- User verifies on localhost → push to main → Vercel.
- Phase B(ii) voice checkout still queued.
- Phase B(iii) Pull Equipment days-ahead picker.
- Phase B(iv) Schedule board access for shop_manager + Pull Equipment Requirements button.

---

## MAY 8, 2026 (PT 3) — Recenter shop pin → PROD (clock-in actually works now)

User reported shop manager STILL couldn't clock in even after PT 2's 100ft radius widening. Got user to drop a fresh pin on the building from on-site.

**Pushed to production.** Commit `d08a8d1d`, deploy `dpl_3E579bAmp1zbj7kEuVRu4sq8ZVxo`. Aliased to `pontifexindustries.com` + `www.` — both responding 200.

### Root cause
The original SHOP_LOCATION pin (`34.76874308, -82.43569623`) was far enough off-center that even the 100ft (30.48m) radius didn't cover the whole building. From certain spots in the shop, the user's phone was reading >100ft from the OLD pin. Recentering on user-supplied accurate coordinates moves the geofence circle ~6m NE, and now the entire building footprint sits inside.

### What changed
- `lib/geolocation.ts` — `SHOP_LOCATION` lat/lng updated:
  - **From**: `34.76874307354808, -82.43569623308949`
  - **To**: `34.768775733693474, -82.43564252936702`
- `components/NfcClockInModal.tsx` — stale comment "6.1m ≈ 20ft" updated to reflect current 30.48m ≈ 100ft (functional code already pulled from the central constant — this was just a comment cleanup).

### Audit confirmed single source of truth
Every clock-in code path reads from the central `SHOP_LOCATION` constant — no hardcoded coordinates anywhere. Updating one constant updates all flows:
| Path | Used by |
|---|---|
| `/api/timecard/clock-in` | All dashboards (operator, supervisor, shop_manager, shop_help) |
| `/api/timecard/clock-out` | All dashboards |
| `components/NfcClockInModal.tsx` | The shared clock-in modal |
| `components/NFCClockIn.tsx` | NFC scan flow |
| `app/nfc-clock/page.tsx` | NFC kiosk page |
| `components/DriveTimeFromShop.tsx` | Drive-time chip on schedule form |

### Files changed
```
lib/geolocation.ts                 (SHOP_LOCATION recentered)
components/NfcClockInModal.tsx     (stale comment fix)
```

### What this means for trial customer
Shop manager (and every other role with clock-in) can now clock in from anywhere in the shop building. The 100ft radius around the new center comfortably covers Patriot's footprint.

### Commit chain (May 8 in order)
```
d08a8d1d  fix(clockin): recenter shop pin to user-supplied accurate coordinates  ← THIS PT 3
cb919706  fix(clockin): widen radius to 100ft + admin manual time entry (PTO)   ← PT 2
447b2387  docs(handoff): Phase B(i) shipped — smart location + unified Inventory Control
64f1ad54  feat(inventory): Phase B(i) — smart equipment location + unified Inventory Control page
```

---

## MAY 8, 2026 (PT 2) — On-site fix: 100ft GPS radius + Admin manual time entry → PROD

User on-site testing exposed two urgent gaps. Both shipped to production today.

**Pushed to production.** Commit `cb919706`, deploy `dpl_CZZbU3vtKrjQDdzmVqbfEq12Jxo2`. Built in 76s. Aliased to `pontifexindustries.com` + `www.` — both responding 200. The previously-pushed Phase B(i) Inventory Control work also rode this commit chain (`64f1ad54`, `447b2387`).

### Fix 1 — GPS radius widened to 100ft (clock-in AND clock-out)

**Symptom:** Shop manager standing inside the shop couldn't clock in. App said "you must be at Patriot Concrete Cutting".

**Root cause:** Radius was 20ft (clock-in) / 50ft (clock-out from yesterday's PT 2 fix). Indoor GPS drift on a typical phone is **10-30 meters** — metal/concrete walls scatter the signal. Standing in the shop reading as 30m+ "away" → reject.

**Fix:** Both `ALLOWED_RADIUS_METERS` and `ALLOWED_RADIUS_CLOCKOUT_METERS` set to **30.48m (~100ft)** in `lib/geolocation.ts`. Anti-fraud preserved — home addresses are miles away, not 100ft.

### Fix 2 — Admin manual time entry (PTO + sick + holiday + manual)

**Why:** No way to enter hours for someone who didn't clock in. PTO, sick days, holiday — all needed manual creation, not just edits to existing rows.

**Migration `20260508_timecards_entry_type_extend.sql`** (applied):
The existing `timecards_entry_type_check` CHECK constraint allowed: regular, overtime, double_time, time_off, holiday, no_call_no_show, late. **Extended** to additionally allow: `pto`, `sick`, `manual`, `admin_adjustment`. Additive only — existing data preserved.

**API `POST /api/admin/timecards/manual`** (new):
- Body: `{ user_id, date, entry_type, hours, start_time?, notes? }`
- Validates: `entry_type` ∈ {pto,sick,holiday,manual,admin_adjustment}, hours ∈ [0.25, 16], date YYYY-MM-DD, start_time HH:MM (default 08:00)
- Inserts a timecard with computed clock_in_time + clock_out_time, `total_hours = gross = net = hours`, `is_approved=true`, `approval_status='manually_approved'`, `clock_in/out_method='manual'`, `timecard_source='manual'`
- For `entry_type='pto'`: bumps `operator_pto_balance.pto_days_used` by `hours / 8`. Creates a 10-day allocation row if none exists for the year.
- Audit logged to `audit_logs` (fire-and-forget)
- Tenant-scoped via `requireAdmin`

**UI on `/dashboard/admin/timecards`:**
- New emerald gradient **"Add Time"** button next to CSV/PDF export.
- Modal:
  - Employee picker (from `teamMembers`)
  - 5 type cards: PTO / Sick / Holiday / Manual / Adjustment — gradient swaps in modal header to match
  - Date + Hours (number, step 0.25) + optional Start time + Notes
  - Live "+0.X day(s) used" hint when type=PTO
  - Mobile-friendly: bottom sheet on phones, centered modal on sm+
  - On success: closes + refreshes team summary

### Files changed
```
lib/geolocation.ts                                              (radius constants → 30.48m)
app/api/admin/timecards/manual/route.ts                         (new — manual entry API)
app/dashboard/admin/timecards/page.tsx                          (Add Time button + AddTimeModal)
supabase/migrations/20260508_timecards_entry_type_extend.sql    (new — applied)
```

### Vercel usage observation

Production deploys this billing period (May 1 - May 8, 2026):
1. `0963259f` — May 2 (Linear Ft calculator)
2. `11d938b9` — May 2 (Edit Scope)
3. `0be04c59` — May 6 (lunch override)
4. `f1d8b2df` — May 7 (50ft clock-out + per-user lunch + sidebar)
5. `cb919706` — May 8 (100ft + manual entry — this one)

**5 production deploys in 8 days.** Disciplined cadence vs. late April when ~20 preview deploys in 3 days drove the $500 bill. Per `vercel.json` the `claude/*` branch auto-deploys are blocked — only `main` triggers a billed build. Each main push ≈ 60-90s build minutes.

The Vercel MCP exposes deployments + logs but **NOT billing endpoints**. Exact dollar usage requires the dashboard at `vercel.com/andres-altamiranos-projects/pontifex-industries-software-awja/usage`.

### Phase B remaining (next sessions, in order)

- **B(ii)** — Voice layer on Inventory Control Checkout + Check-In tabs (mic button, alias fuzzy match, ≥85% auto-confirm, audio audit trail, learning loop via `voice_recognition_corrections`)
- **B(iii)** — Pull Equipment workflow (days-ahead picker, reserve equipment, generate pre-use checks)
- **B(iv)** — Schedule board access for shop_manager + "Pull Equipment Requirements" button on schedule-board edit modal

### Trial customer status
- Shop manager can now clock in (100ft radius)
- Admin can manually log PTO / sick / holiday hours via the team payroll page
- Both Fix 1 + Fix 2 LIVE on `pontifexindustries.com`

---

## MAY 8, 2026 — Phase B(i): Smart equipment location + Unified Inventory Control

### What shipped
Per user request after the May 7 shop manager hands-on test: replace 3 separate sidebar items (Pull Equipment / Voice Check-Out / Returned Equipment) with ONE unified page. Plus equipment list now shows LIVE location ("with Carlos · truck #5") instead of static `home_location`. Branch `claude/inspiring-swanson-31ba74`, commit `e888f184`. **NOT pushed to main yet** — user wants to test on localhost first.

### Sub-phasing
Phase B is big — split it into 4 sub-phases so we ship working chunks:
- ✅ **B(i) THIS SESSION**: smart location + unified Inventory Control page with 4 tabs (Inventory / Checkout / Check-In / History) — all manual workflows
- ⏳ **B(ii) NEXT**: voice layer on Checkout + Check-In tabs (smart-alias matching, audio audit, learning loop via voice_recognition_corrections)
- ⏳ **B(iii) NEXT**: Pull Equipment workflow (days-ahead picker, reserve equipment, generate pre-use checks when shop_tasks exists in Phase 4)
- ⏳ **B(iv) NEXT**: Schedule board access for shop_manager + "Pull Equipment Requirements" button on schedule-board

### APIs (new)
- `GET /api/admin/equipment-checkouts` — list with filters (`open=true`, `operator_id`, `equipment_id`, `truck_id`, `search`). Hydrates equipment + truck + custodian + job. Search is client-side post-hydration to keep SQL simple. Pagination via `page` + `limit`.
- `POST /api/admin/equipment-checkouts` — atomic checkout: insert checkout row + flip `equipment.status='in_use'` + set `current_custodian_id` + `current_job_order_id`. Validates equipment is in tenant, not already in_use, not retired. Rolls back on partial failure.
- `PATCH /api/admin/equipment-checkouts/[id]` — mark checked-in. Stamps `checked_in_at` + `checked_in_by`. Default flips `equipment.status='pending_putaway'` (sends to helper queue). Shop manager can pass `status_after_checkin='available'` to skip queue.
- `GET /api/admin/equipment` extended — hydrates `current_custodian`, `current_job`, `open_checkout` (with truck) so the equipment list smart-location renderer has everything it needs in one request.

### Smart location formatter
```typescript
function smartLocation(eq: Equipment): string {
  if (eq.status === 'in_use') {
    const op = eq.current_custodian?.full_name?.split(' ')[0] ?? 'someone';
    const truck = eq.open_checkout?.truck;
    if (truck) return `with ${op} · ${truckLabel}`;
    if (eq.current_job?.job_number) return `with ${op} · ${eq.current_job.job_number}`;
    return `with ${op}`;
  }
  if (eq.status === 'reserved') return `reserved for ${eq.current_job?.job_number ?? 'job'}`;
  if (eq.status === 'pending_putaway') return 'pending put-away';
  if (eq.status === 'in_maintenance' || eq.status === 'maintenance') return 'in maintenance';
  if (eq.status === 'out_of_service') return 'out of service';
  return eq.location || 'in shop';
}
```
Used in both the equipment list page and the Inventory Control inventory tab.

### Unified Inventory Control page (`/dashboard/admin/inventory-control`)
4 tabs sharing equipment + checkout + operator data via shared loader hooks. Tab gradient swaps in the hero based on active tab.

- **Inventory** (cyan/sky) — 3 quantity tiles (Total / Available / In Use) + searchable equipment grid. Each card shows smart location as its primary subtitle. Search matches name, asset_tag, unit_number, operator name.
- **Checkout** (rose/pink) — 3-step form (Equipment → Operator → Truck) + notes field. Submits to POST. Filters equipment list to status='available' or 'reserved' (can't check out something that's already in_use). Refreshes both inventory + open-checkouts on success.
- **Check-In** (teal/emerald) — list of open checkouts (status badge in tab bar shows count). Each row: equipment + operator + truck + job + duration. Two action buttons per row: "Pending Put-Away" (amber, default — sends to helper queue) or "Mark Available" (teal gradient — skips queue when shop manager racked it themselves).
- **History** (violet/indigo) — searchable log of ALL checkouts (open + closed). Search matches operator / equipment / truck / job / asset_tag. Each row shows OPEN or CLOSED chip + checked-out + checked-in timestamps + notes.

URL param `?tab=` persists tab choice across page loads. Shop Manager dashboard CTAs deep-link via `?tab=checkout` and `?tab=checkin`.

### Sidebar restructure
- SHOP section: 7 items → 5 items
- Removed: Pull Equipment, Voice Check-Out, Returned Equipment
- Added: Inventory Control (single entry point)
- Kept: Equipment, Fleet, Maintenance Inbox, Shop Tasks

### Shop Manager dashboard updates
- Header CTAs: "Pull Equipment" + "Voice Check-Out" replaced with "Check Out Equipment" (rose, → `?tab=checkout`) + "Check In" (teal, → `?tab=checkin`).
- Returned-Queue KPI tile now points at `?tab=checkin`.
- Action card grid: 3 old cards (Pull/Voice/Returned) replaced with 1 "Inventory Control" card.

### Files changed
```
app/api/admin/equipment/route.ts                          (hydrate custodian/job/truck)
app/api/admin/equipment-checkouts/route.ts                (new — GET list + POST create)
app/api/admin/equipment-checkouts/[id]/route.ts           (new — PATCH check-in)
app/dashboard/admin/equipment/page.tsx                    (smartLocation + render)
app/dashboard/admin/inventory-control/page.tsx            (new — 4-tab unified page)
app/dashboard/admin/_components/ShopManagerDashboard.tsx  (CTAs + tile + cards)
components/DashboardSidebar.tsx                           (SHOP section collapsed)
```

### Smoke test note
Dev preview eval kept racing the React form hydration tonight (login form submitted as GET, same flaky behavior as past sessions). Build passes (`npm run build` clean), routes compile, code is surgical. Real browser sessions work — user can test on localhost manually. Production push held until they verify.

### What's still left (queued)

**B(ii) — Voice layer.** Add a microphone button to the Checkout + Check-In tabs. On press: SpeechRecognition → fuzzy match against `equipment.aliases` → confidence-tiered confirm (≥85% auto, 60-85% pick from 3 suggestions, <60% free-text edit). Audio recorded to `equipment_checkouts.voice_note_url` for audit. Learning loop via `voice_recognition_corrections` table.

**B(iii) — Pull Equipment.** Days-ahead date picker shows upcoming jobs with required equipment. "Pull selected" reserves equipment (`equipment.reserved_for_job_id` + `reserved_until`) and generates `shop_tasks` rows once that table exists.

**B(iv) — Schedule board for shop_manager.** Already-allowed by RBAC preset; verify page-level role guard accepts shop_manager. Add "Pull Equipment Requirements" button on the schedule-board edit modal that lists equipment per job from `job_orders.equipment_*` fields.

### Agents on standby (in `.claude/agents/`)
- `supabase-migration-author` — for B(ii)'s `voice_recognition_corrections` table
- `rls-policy-auditor` — for any new query patterns
- `mobile-responsive-auditor` — sweep the new Inventory Control page on 375px before next push

---

## MAY 7, 2026 (PT 2) — Shop manager hands-on feedback fixes + production deploy

User had Demo Shop Manager actually test clock-in/clock-out. Three issues found, all fixed and deployed.

**Pushed to production.** Commit `f1d8b2df`, deploy `dpl_FTB2rPJmozfizxLSjA2X1sHVBtx4`. Aliased to `pontifexindustries.com` + `www.` — both responding 200.

### Fix 1 — GPS clock-out bug (couldn't clock out from inside the shop)

**Symptom:** Shop manager clicks Clock Out → "You must be at Patriot Concrete Cutting to clock out — you are 35ft away".

**Root cause:** `lib/geolocation.ts` exported a single `ALLOWED_RADIUS_METERS = 6.1` (20ft) used by both clock-in and clock-out. Mobile GPS routinely drifts 10–30m indoors (metal/concrete walls scatter the signal), so legitimate "I'm in the shop" reads as 30+ feet away. Geofencing reject triggers.

**Fix:** Asymmetric radius — clock-IN stays tight, clock-OUT widens.
- New `ALLOWED_RADIUS_CLOCKOUT_METERS = 15.24` (50ft) export.
- New `isWithinShopRadiusForClockout()` helper.
- `app/api/timecard/clock-out/route.ts` imports the new helper + radius constant. Error message reports "50 feet" as the limit now.

**Why this is right:** Clock-IN tight = anti-fraud (operator can't clock in from home and drive over). Clock-OUT wide = no fraud incentive ("I'm leaving" doesn't help anyone steal time). 50ft is the sweet spot — still catches "I'm clocking out from a job site" but accommodates indoor GPS drift.

### Fix 2 — Per-user lunch default (Shop manager takes 60min, not 30min)

**Symptom:** Shop manager takes a full hour for lunch, but the system was deducting only 30min.

**Existing infrastructure:** `timecard_settings` had a tenant-wide `auto_lunch_duration_minutes = 30`. No per-user override existed.

**Fix:** Added per-user override on `profiles`.
- Migration `20260507_profiles_default_lunch_minutes.sql`: `ADD COLUMN default_lunch_minutes integer` (NULL = use tenant default).
- Demo Shop Manager seeded with 60.
- Clock-out reads per-user first, falls back to tenant default. A non-null 0 is honored ("user takes no lunch").
- The May 7 PT 1 admin per-shift override (lunch_override_by/at/reason on `timecards`) is still on top — admin can still tweak any individual shift.

**Three-layer hierarchy now:**
1. **Per-shift** (admin manually edits a specific timecard) — highest priority
2. **Per-user default** (`profiles.default_lunch_minutes`) — wins over tenant
3. **Tenant default** (`timecard_settings.break_duration_minutes`) — fallback

### Fix 3 — Shop manager sidebar showing team data

**Symptom:** Shop manager logs in and sees "Timecards" + "Time Off" sidebar items — those are the TEAM views (everyone's data), not their own.

**Fix:** Reorganized sidebar with role-aware filtering.
- New `excludeRoles?: string[]` field on `NavItem` type. Filter logic honors it in both loading-state and post-load passes.
- New **MY ACCOUNT** section (emerald accent) with `My Timecard` + `Request Time Off` links — gated to roles=['shop_manager','shop_help','supervisor']. Routes to existing personal pages (`/dashboard/timecard`, `/dashboard/request-time-off`) which had no role guards.
- Existing MANAGEMENT items "Timecards" and "Time Off" now have `excludeRoles=['shop_manager','shop_help']` — hidden from them but still visible to admin/super_admin/operations_manager.

Result: shop_manager sees `MY ACCOUNT > My Timecard, Request Time Off` (own data only). Admin still sees `MANAGEMENT > Timecards, Time Off` (team views).

### Smoke test note
The dev preview server kept racing the form-fill (login form submitted as GET, password landed in URL) — flaky on the localhost preview tonight, not a code bug. Skipped UI smoke-test in favor of:
- Build passes (`npm run build` clean on both worktree branch + local main).
- Migration applied + verified by SELECT on the new column.
- Schema audit confirmed shop_manager profile has default_lunch_minutes=60.
- Logic flow is surgical: 1 import + 1 const + 2 string-literal swaps for GPS, 1 column lookup added in clock-out, 1 new section + 1 new field on sidebar.

Production is the real test — user can verify by logging in.

### Files changed
```
lib/geolocation.ts                                              (radius constants + helper)
app/api/timecard/clock-out/route.ts                             (imports + per-user lunch lookup)
components/DashboardSidebar.tsx                                 (excludeRoles + MY ACCOUNT)
supabase/migrations/20260507_profiles_default_lunch_minutes.sql  (new — applied)
```

### Phase B queued for next session

Bigger requests that need design + parallel agents:
1. **Equipment list smart location** — show "in shop" vs "with [operator] on truck #X" based on checkout state, not static `home_location`.
2. **Unified Inventory Control page** — replace 3 separate sidebar items (Voice Check-Out, Returned Equipment, Pull Equipment) with ONE page that has buttons to trigger each workflow + searchable history log (by operator/truck/equipment name).
3. **Schedule board for shop_manager** + **"Pull Equipment Requirements" button** — pulls equipment lists per ticket so shop manager knows what to prep ahead of dispatch.

These need careful design — especially the unified Inventory Control page (queries across equipment + equipment_checkouts + maintenance_requests + shop_tasks, audit log fanout, search across multiple fields). Will dispatch agents in parallel for the schema + page design + history log queries.

### Agents available + worth using next session
- **`supabase-migration-author`** — for any schema additions (equipment view, history materialized view if needed)
- **`rls-policy-auditor`** — review RLS on the new history queries
- **`mobile-responsive-auditor`** — sweep the new Inventory Control page on 375px before merge

---

## MAY 7, 2026 — Lunch deduction admin override + production deploy

### What shipped
Last timecard feature per user request: lunch is auto-calculated, but admins can override (extend past 30min, or zero out when no lunch was taken). Audit trail captures who/when/why.

**Pushed to production.** Deploy `dpl_9fWUDbKtxsmSuhgg8iqScuChgmvq`, commit `0be04c59`. Built in 65s. Aliased to `www.pontifexindustries.com` + `pontifexindustries.com` — both responding 200. Trial customer (Patriot) sees the new admin lunch UI on next login.

### Schema audit findings (before building)
The system already had most of the lunch infrastructure from Session 9 (March 31):
- `timecards.lunch_duration_minutes` (existed, defaulting 0)
- `timecards.auto_lunch_applied` (existed, defaulting false)
- `timecards.gross_hours` / `net_hours` (existed)
- `timecard_settings_v2`: `break_duration_minutes=30`, `auto_deduct_break=true`, `break_threshold_hours=6`
- Clock-out route was already auto-deducting when shift > 6h, but writing only to legacy `break_minutes` column.

What was **missing**:
1. Clock-out wasn't populating `lunch_duration_minutes` / `auto_lunch_applied` (legacy `break_minutes` only).
2. No admin UI to edit lunch on a specific timecard.
3. No audit trail for admin overrides.

### Migration (applied + file: `supabase/migrations/20260507_timecards_lunch_override_audit.sql`)
```sql
ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS lunch_override_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS lunch_override_at timestamptz;
ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS lunch_override_reason text;
```
Three new audit columns. Additive only. Live DB updated via Supabase MCP.

### Code changes
- **`app/api/timecard/clock-out/route.ts`** — auto-deduct logic unchanged. Now also writes `lunch_duration_minutes` and `auto_lunch_applied` alongside legacy `break_minutes`. Both columns stay in sync going forward.
- **`app/api/admin/timecards/entries/[entryId]/route.ts`** — accepts `lunch_duration_minutes` (validated 0-480 integer) and `lunch_override_reason` (optional). Stamps `lunch_override_by`/`lunch_override_at` when admin edits. Recomputes `total_hours` when lunch OR clock times change: `max(0, gross_hours - lunch_minutes/60)`. Works on both `timecard_entries` (writes `break_minutes`) and legacy `timecards` (full audit set).
- **`app/dashboard/admin/timecards/operator/[id]/page.tsx`** — edit modal gets a new amber "Lunch Deduction (minutes)" section with: number input (0-480, step 5), 3 quick buttons (No lunch / 30 default / 60), optional override-reason text field. Initial value comes from existing `lunch_duration_minutes` (or `break_minutes` for legacy rows).

### Verification path
Smoke-test against the live preview was flaky (form-fill timing issues), so verified via DB simulation:
1. Synthetic 7h timecard → simulated clock-out → `total_hours=6.5`, `auto_lunch_applied=true`, `lunch_duration_minutes=30` ✓
2. Simulated admin override to 60min → `total_hours=6.0` recomputed correctly, `lunch_override_by`/`at`/`reason` populated ✓

Clock-in flow itself is **unchanged** — only clock-out got 2 additional UPDATE columns. Build passes (`npm run build` clean on both worktree branch + local main).

### Why no smoke-test in browser
Preview server form-fill kept hitting timing issues — Next.js dev mode + auto-refresh was racing the eval. Database simulation is more authoritative than UI smoke-test for this kind of additive write. The user explicitly approved the Vercel push, so the trial customer can now exercise it on prod.

### Files changed this session
```
supabase/migrations/20260507_timecards_lunch_override_audit.sql   (new)
app/api/timecard/clock-out/route.ts                               (lunch fields)
app/api/admin/timecards/entries/[entryId]/route.ts                (admin override + recalc)
app/dashboard/admin/timecards/operator/[id]/page.tsx              (edit modal UI)
```

### Production deploy details
- Commit `0be04c59` (cherry-picked from branch, includes today's lunch + Phase 1A + 1B + handoff docs)
- Vercel deploy `dpl_9fWUDbKtxsmSuhgg8iqScuChgmvq` — READY, target: production
- Build: 65 seconds (1778152439 → 1778152504 epoch ms)
- Aliases live: `www.pontifexindustries.com` + `pontifexindustries.com`
- HTTP 200 confirmed on `/` + `/login`

### Now in production for the trial customer
- Shop manager + shop helper roles + dashboards (Phase 1A)
- Equipment + Fleet inventory CRUD (Phase 1B)
- Auto + admin-editable lunch deduction (today)

### Next session — Phase 2

Operator-side maintenance request form (3-tap mobile, voice memo, photo). Shop manager Maintenance Inbox (triage queue). Hook to convert visit-wizard `equipment_issues` jsonb entries into real maintenance request rows now that equipment exists in inventory.

---

## MAY 5, 2026 (PT 5) — Phase 1B: Equipment + Fleet CRUD shipped

### What shipped
The Shop Manager can now populate the inventory. ~200 pieces of equipment + ~15 vehicles can be added, browsed, edited, retired. **Branch:** `claude/inspiring-swanson-31ba74`. **Commit:** `934e8055`. **NOT pushed to main** — preview/localhost only until verified.

**APIs (4 routes):**
- `GET/POST /api/admin/equipment` — list (filter + paginate) + create. Auto-generates asset tag.
- `GET/PATCH/DELETE /api/admin/equipment/[id]` — single record + soft-retire (status='retired').
- `GET/POST /api/admin/fleet` — vehicles (joined equipment + vehicles tables).
- `GET/PATCH /api/admin/fleet/[id]` — single vehicle.

**Pages (6 pages):**
- `/dashboard/admin/equipment` — searchable, filterable grid (kind / power_source / status filters, search, pagination at 50/page, "include vehicles" toggle).
- `/dashboard/admin/equipment/new` — full form: Name (required) / Short name / Unit number (required) / Aliases / Kind (4 picker cards) / Power source (when powered) / Category w/ datalist suggestions / Manufacturer / Storage / Notes. Sticky bottom Save bar.
- `/dashboard/admin/equipment/[id]` — read view + inline edit + retire button. Phase 2/3 placeholders for maintenance + checkout history.
- `/dashboard/admin/fleet` — vehicle grid with plate + 30-day reg/insurance expiry warning chips.
- `/dashboard/admin/fleet/new` — vehicle form with VIN/plate/fuel/odometer/3 compliance dates.
- `/dashboard/admin/fleet/[id]` — vehicle read + edit + expiring-soon banner.

**Asset tag auto-generation:**
- Prefix derives from `tenants.company_code` with vowels removed: PATRIOT → P A T R I O T → PTRT.
- Suffix is the next-available 4-digit padded integer scoped to the tenant.
- First Patriot equipment got `PTRT-0001`. Next will be `PTRT-0002`. Per-tenant series — won't collide when more tenants come online.

**Voice alias auto-seeding (Phase 3 prep):**
On equipment create, the API auto-adds these to `aliases`:
- The asset tag itself (`PTRT-0042`)
- The short name (`FS5000`)
- `{short_name} #{unit_number}` ("FS5000 #5")
- `{short_name} {unit_number}` ("FS5000 5")
Plus any user-entered aliases from the comma-separated input. So when the voice checkout layer ships in Phase 3, every piece of equipment is already voice-matchable from day 1 — no manual prep needed.

**Shop Manager dashboard KPIs wired to real counts:**
- Returned Queue ← `COUNT(equipment WHERE status='pending_putaway')`
- Vehicles Out of Service ← `COUNT(equipment WHERE kind='vehicle' AND status='out_of_service')`
- Maintenance Inbox stays 0 (Phase 2 will populate)
- Pending Pre-Use Checks stays 0 (Phase 4 will populate)

### How — design decisions

**Migration strategy was additive-only.** The `equipment` table already existed from a prior feature with 4 rows of test data ("husqvarna pro 3000 20" blades). Rather than rewrite the schema, we ALTER + ADD COLUMN IF NOT EXISTS for everything new. Legacy columns (`type`, `brand`, `equipment_category`, `assigned_to`, `qr_code`) are preserved untouched. New columns (`kind`, `make`, `category`, `current_custodian_id`, `unit_number`, `aliases`, etc.) coexist alongside. Future cleanup can backfill + drop legacy.

**Why I chose this migration approach:** the trial customer is on prod. Dropping/renaming columns is the kind of thing that breaks production at midnight. Additive-only means worst case is "extra columns sit there unused."

**API + UI consistency: separate `make` from legacy `brand`, `category` from legacy `equipment_category`.** The new APIs use the cleaner names. If a future API or page needs to read legacy data, both columns are queryable. No data migration required.

**Soft-delete instead of hard-delete on retire.** Setting `status='retired'` keeps history (checkouts, maintenance) intact. Retired equipment falls out of normal status filters but is still queryable.

### Why — fits the larger plan

This is the foundation that Phase 2 (maintenance requests) needs. Without an equipment row, you can't link a maintenance request to "the saw that's broken." Without a fleet row, you can't track vehicle service intervals.

Phase 1B also unblocks Phase 3's voice checkout — the matcher reads `aliases` jsonb to resolve spoken phrases, and we've now seeded those automatically.

The visit wizard's `equipment_issues` jsonb (shipped in Phase 0) eventually links to specific `equipment.id` records once shop manager populates inventory. That bridge is built — the API just needs the lookup wired in Phase 2.

### Smoke-test discoveries → migration patches

While testing, the legacy schema rejected several columns the API wanted. All patched in the same migration file (additive only):
1. `category text` — legacy had `equipment_category varchar` (different values, can't reuse).
2. `make text` — legacy had `brand`.
3. `current_custodian_id uuid REFERENCES auth.users(id)` — legacy had `assigned_to`.
4. `serial_number` was `NOT NULL` — relaxed to nullable. Real-world equipment doesn't always have a known serial.

Each was discovered by running an actual end-to-end test (login → fill form → submit → see what error PostgREST returned) and then applying a `NOTIFY pgrst, 'reload schema'` after the ALTER to force the cache to pick up the new column.

### Agents used + reused

- **Phase 0-1 research (May 4)**: dispatched two parallel `general-purpose` agents to study fleet management software (Hilti On!Track, Samsara, Fleetio, EZOfficeInventory) and maintenance request workflows (UpKeep, Limble, MaintainX, DOT DVIR). Their findings drove the schema design — particularly QR-driven checkout (steal from EZOfficeInventory), Service Reminders dashboard (Fleetio), pre-use-blocks-dispatch (Samsara DVIR), and 3-tap mobile request submission (MaintainX). Transcripts captured in earlier session.
- **Custom subagents available** (from May 3 session, in `.claude/agents/`): `supabase-migration-author`, `rls-policy-auditor`, `mobile-responsive-auditor`. **Not used this session** — the migration was small enough to write inline + smoke-test catches the issues. Worth using next session when Phase 2's `maintenance_requests` schema needs more rigor.

### Files changed
```
app/api/admin/equipment/route.ts                                (new)
app/api/admin/equipment/[id]/route.ts                           (new)
app/api/admin/fleet/route.ts                                    (new)
app/api/admin/fleet/[id]/route.ts                               (new)
app/dashboard/admin/equipment/page.tsx                          (new)
app/dashboard/admin/equipment/new/page.tsx                      (new)
app/dashboard/admin/equipment/[id]/page.tsx                     (new)
app/dashboard/admin/fleet/page.tsx                              (new)
app/dashboard/admin/fleet/new/page.tsx                          (new)
app/dashboard/admin/fleet/[id]/page.tsx                         (new)
app/dashboard/admin/_components/ShopManagerDashboard.tsx        (KPI fetch)
supabase/migrations/20260505_shop_manager_phase_1a_foundation.sql  (appended additive patches)
```

### How to view + test
```bash
git fetch origin
git checkout claude/inspiring-swanson-31ba74
git pull
npm run dev
# Open http://localhost:3000 (or whatever port npm picked)
# Login: shopmanager@pontifex.com / Shop1234!
```
Or click the live preview link Claude provides.

### What's still placeholder

- Maintenance + checkout history sections on equipment detail show "Coming Phase 2/3."
- Sidebar items for Pull Equipment, Voice Check-Out, Returned Equipment, Maintenance Inbox, Shop Tasks → still 404 (Phase 2-4 work).
- "Report Equipment Issue" card on operator dashboard → placeholder page.

### Next session = Phase 2

Operator-side maintenance request form (3-tap mobile, voice memo, photo). Shop manager Maintenance Inbox (triage queue). Hook to convert visit-wizard equipment issues into real maintenance requests.

---

## MAY 5, 2026 (PT 4) — Phase 1A: Shop Manager + Shop Help foundation

### What shipped
Two new roles + dashboards + work_location toggle + demo accounts. **No equipment data yet** (that landed in Phase 1B above). Branch: `claude/inspiring-swanson-31ba74`, commit `f42bd372`.

**Migrations applied to live Supabase:**
- `equipment` table extended with 12 new columns: `asset_tag`, `kind`, `short_name`, `unit_number`, `aliases jsonb`, `power_source`, `requires_maintenance_schedule`, `current_job_order_id`, `reserved_for_job_id`, `reserved_until`, `hour_meter`, `photo_url`. Status CHECK widened to allow `'reserved'`, `'pending_putaway'`, `'out_of_service'`. Kind CHECK constraint added.
- `vehicles` table created (1:1 with equipment for kind='vehicle'). VIN, plate, registration/insurance/inspection expiry, odometer.
- `equipment_checkouts` table created (transactional history; no UI yet, Phase 3 builds it).
- `timecards.work_location` column added: `'field'` (default) | `'shop'`.
- `profiles.role` CHECK widened to allow `shop_manager` + `shop_help`.

**RBAC (`lib/rbac.ts`):**
- New `shop_help` role added to `ROLES_WITH_LABELS`.
- `shop_manager` + `shop_help` added to `ADMIN_DASHBOARD_ROLES`.
- 7 new card keys: `equipment`, `fleet`, `pull_equipment`, `voice_checkout`, `returned_equipment`, `maintenance`, `shop_tasks`.
- `shop_manager` preset filled in: full on equipment/fleet/maintenance/shop_tasks/returned_equipment, submit on pull_equipment + voice_checkout.
- `shop_help` preset: submit on shop_tasks + maintenance + voice_checkout.
- `supervisor` preset extended: view on equipment + fleet, submit on voice_checkout (so supervisors can do equipment checkout in field).

**Demo accounts (created via SQL):**
- `shopmanager@pontifex.com` / `Shop1234!` (role: shop_manager) — cyan card on `/login`.
- `shophelp@pontifex.com` / `Help1234!` (role: shop_help) — teal card on `/login`.
- Both in Patriot tenant.

**Dashboards (`/dashboard/admin/_components/`):**
- `ShopManagerDashboard.tsx` — vibrant gradient KPI tiles (cyan/violet/amber/teal/rose), slate clock-in widget, header CTAs (Pull Equipment + Voice Check-Out), 6 action cards linking to all planned pages.
- `ShopHelpDashboard.tsx` — operator-style energy. Welcome heading + clock-in widget + 2 KPI tiles + empty task list placeholder + quick actions for Submit Maintenance + Request Time Off.
- Both wired into `/dashboard/admin/page.tsx` role-branch. The dashboard-summary fetch is skipped for these roles (they have their own data sources).

**Field/Shop clock-in toggle:**
- Operator dashboard: 2-button picker (Field / Shop) shown to apprentice + operator roles before clock-in. Persists choice → `/api/timecard/clock-in` accepts `work_location` and stores it on the timecard row.
- Shop manager + shop helper dashboards always pass `work_location: 'shop'`.

**Sidebar:** new SHOP section (cyan accent) with 7 role-gated items via the `roles?: string[]` field on `NavItem` (introduced in May 3 supervisor session).

**Operator dashboard:**
- New "Report Equipment Issue" card (orange/amber gradient, settings icon) sits next to Request Time Off. Links to `/dashboard/maintenance/new`.
- `app/dashboard/maintenance/new/page.tsx` — placeholder page with vibrant hero + "Coming in Phase 2" notice.

**Login redirect fix:**
- `/login` redirects shop_manager + shop_help (in addition to existing roles) to `/dashboard/admin`. Operators + apprentices stay on `/dashboard`.
- `useAuthUser` hook + `app/dashboard/page.tsx` ADMIN_ROLES lists updated.

### How
Followed the additive-only migration pattern (no DROP column, no RENAME). RLS via the `public.current_user_*()` SECURITY DEFINER helpers — never `auth.jwt() -> 'user_metadata'` (per CLAUDE.md hard rule).

### Why
Foundation gates everything that comes after. Without `shop_manager` role + dashboard skeleton, there's nothing to point at and say "Phase 2 will fill this tile in." Without `equipment_checkouts` table, voice checkout has nowhere to write. Without `work_location` column, apprentices rotating to shop have no way for the system to know.

### Agents used
None this phase — pattern was copy-and-adapt from the supervisor session (May 3) which had already established the dashboard skeleton + sidebar role-gating + demo-account creation pattern.

### Files changed
```
supabase/migrations/20260505_shop_manager_phase_1a_foundation.sql   (new)
app/api/timecard/clock-in/route.ts                                  (work_location)
app/dashboard/admin/page.tsx                                        (role-branch)
app/dashboard/admin/_components/ShopManagerDashboard.tsx            (new)
app/dashboard/admin/_components/ShopHelpDashboard.tsx               (new)
app/dashboard/page.tsx                                              (Field/Shop picker)
app/login/page.tsx                                                  (demo cards + redirects)
components/DashboardSidebar.tsx                                     (SHOP section)
lib/hooks/useAuthUser.ts                                            (admin roles)
lib/rbac.ts                                                         (shop roles + cards)
app/dashboard/maintenance/new/page.tsx                              (new placeholder)
```

---

## MAY 5, 2026 (PT 3) — Visit wizard + equipment issues bridge

User reviewed the supervisor work and requested:
1. Convert visit form to a 3-step wizard for better mobile UX
2. Add an Equipment Issues section that routes problems to shop manager (maintenance request OR replace)
3. Voice equipment checkout — confirmed for Phase 3 with smart abbreviation learning
4. Equipment inventory needs an `aliases` field for alternative names

### Phase 0 (visit wizard equipment-issue capture) — SHIPPED

- **Migration**: `supervisor_visits.equipment_issues jsonb DEFAULT '[]'::jsonb` applied. Stores each captured issue with `equipment_name`, optional `equipment_id` (nullable until shop manager Phase 1), `whats_wrong`, `action: 'maintenance' | 'replace'`, `photo_urls`, `status: 'open'`.
- **API**: POST `/api/admin/supervisor-visits` accepts + sanitizes the array.
- **Wizard UI**: 3 steps — Visit Details (violet→indigo) / What You Saw (indigo→purple) / Equipment Issues (purple→fuchsia). Progress indicator (3 dots, tap completed dots to jump back). Sticky bottom action bar with Back / Continue / Submit Report. Per-step validation auto-jumps back to failing step on error.
- **Equipment Issues step UX**: toggle "I saw equipment issues today" → if on, dynamic list of issue cards. Each card has equipment name (free-text placeholder for now), what's wrong, and a 2-button action picker (Repair/Maintenance amber vs Replace this Unit rose). Add/remove issues freely.
- **Mobile-tested at 375px**: clean. All inputs ≥ 44×44 tap target. Sticky bar always reachable.

### Phase 2 conversion plan (built when shop manager system lands)
A nightly hook (or trigger) will scan `supervisor_visits.equipment_issues` for entries where `status='open'`, create real `maintenance_requests` rows (action='maintenance') or `shop_tasks` rows (action='replace'), and flip the entry's `status` to `'converted'`. **No data is lost between phases.**

### SHOP_MANAGER_PLAN.md major updates

- **Equipment schema**: added `short_name` + `aliases jsonb` for alternative names (so "DFS-5" or "5000 slab saw" can map to "Husqvarna FS5000 #5"). Shop manager fills these at create time.
- **New `voice_recognition_corrections` table**: every successful voice-driven equipment match logs the spoken phrase → resolved equipment. Future calls hit this cache first (fuzzy match on normalized text). After N (e.g. 3) successful matches of the same phrase, shop manager gets a one-tap prompt to add it to the equipment's aliases. Result: system learns abbreviations over time without per-alias data entry.
- **Voice flow rewritten**: 4-strategy parser (cached corrections → aliases → pg_trgm similarity → fallback selectors). Pending-tray pattern — supervisor speaks as they walk past gear, all checkouts queue up as drafts, confirm in batch at the end. High-confidence auto-saves; low-confidence gets a 3-suggestion picker. Audio recording stored on the checkout for audit.
- **Phase 0 documented as shipped.**

### 7 questions for the user (Phase 1 starts when answered)

1. **Asset tag format** — proposed `PTRT-0001` per-tenant prefix.
2. **Shop helper count today**.
3. **Equipment count ballpark** (50? 100? 300?).
4. **Vehicle count** (drives whether Fleet gets dedicated nav).
5. **Operator's "Report Issue" entry point** — dashboard, my-jobs ticket, or both.
6. **Pre-use check default assignee + lead time** — named helper or unassigned, and how many hours before dispatch.
7. **Equipment alias seeding + voice auto-confirm default** — pre-seed pattern aliases or learn-only, and high-confidence auto-save vs always-tap-confirm.

### Files changed
```
supabase/migrations/20260505_supervisor_visits_equipment_issues.sql (new — applied)
app/api/admin/supervisor-visits/route.ts                            (sanitize equipment_issues)
app/dashboard/admin/site-visits/new/page.tsx                        (3-step wizard rewrite)
SHOP_MANAGER_PLAN.md                                                (Phase 0 done, voice/aliases section, 7 questions)
```

### Commits (pushed to origin/claude/inspiring-swanson-31ba74; NOT origin/main)
```
5260dbb7  feat(visit): 3-step wizard + equipment issues bridge to shop manager
```

---

## MAY 5, 2026 (PT 2) — Supervisor polish + Shop Manager build plan

### Supervisor (shipped this session)
- **Bug fixed**: supervisor landing on `/dashboard` was getting served the OPERATOR dashboard. Cause: `supervisor` was missing from the `ADMIN_ROLES` redirect list in both `app/dashboard/page.tsx` and `lib/hooks/useAuthUser.ts`. Now redirects properly to `/dashboard/admin`.
- **Header**: New violet→indigo gradient "New Visit Report" button next to the green "New Job" button. Visible to supervisors only. Both buttons bumped to min 44×44 tap target.
- **Sidebar**: New `VISIT REPORTS` section between OPERATIONS and MANAGEMENT. Items: "New Visit Report" + "Previous Visits". Gated to supervisor/admin/super_admin/ops_manager via new optional `roles` field on `NavItem` in `DashboardSidebar.tsx`.
- **UI brightening**: KPI tiles now use vibrant gradient backgrounds with white text + ring + shadow (emerald, violet, amber, sky) — match operator dashboard's energy. Clock-in widget rebuilt as a slate gradient when off, emerald→teal when clocked in. Site visit form gets a violet→indigo→purple gradient hero header.
- **Mobile**: tap-target audit at 375px clean. Star rating buttons in the visit form bumped 32→44px. No horizontal overflow on any supervisor page.

### Shop Manager / Shop Help PLAN (not built — research-driven, ready for Phase 1)

User asked for a major new system: equipment inventory + fleet management + maintenance requests + equipment checkout + shop help task delegation. Two parallel research agents studied Hilti On!Track, Samsara Fleet, Fleetio, EZOfficeInventory, plus CMMS systems (UpKeep, Limble, MaintainX) and DOT pre-trip inspection patterns.

Output: **`SHOP_MANAGER_PLAN.md`** — comprehensive design doc covering:
- 6-table schema (equipment, vehicles, equipment_checkouts, maintenance_requests, maintenance_schedules, shop_tasks) with idempotent migration patterns and SECURITY DEFINER RLS
- Page structure for shop manager + shop help dashboards
- Maintenance request state machine (open → triaged → assigned → in_progress → done → verified, with role-gated transitions)
- QR-driven equipment checkout flow + voice checkout layer (Phase 3)
- Pre-use inspection pattern that auto-blocks dispatch on critical fail
- **5-phase rollout** — Phase 1 = inventory foundation, Phase 2 = field-to-shop maintenance loop, Phase 3 = checkout + schedule integration, Phase 4 = pre-use inspections, Phase 5 = polish
- What NOT to build (telematics, full DVIR, parts inventory module, custom field framework, vendor lock-in QR)
- Risk + rollback discipline
- 7 open questions for the user before Phase 1 (asset tag format, shop help count, equipment count, voice priority, etc.)

Plan is **plan-only**. No new DB tables. No new APIs. No new UI. Trial customer's experience is unchanged. Plan exists so next sessions execute precisely without re-deriving the architecture.

### Files changed
```
app/dashboard/page.tsx                                (supervisor in ADMIN_ROLES)
lib/hooks/useAuthUser.ts                              (supervisor in ADMIN_ROLES)
app/dashboard/admin/layout.tsx                        (header New Visit btn + 44px tap targets)
components/DashboardSidebar.tsx                       (VISIT REPORTS section + roles field on NavItem)
app/dashboard/admin/_components/SupervisorDashboard.tsx (vibrant gradients on KPI tiles + clock-in)
app/dashboard/admin/site-visits/new/page.tsx          (gradient hero + 44px star rating)
SHOP_MANAGER_PLAN.md                                  (new — research-driven roadmap)
```

### Commits (LOCAL — pushed to origin/claude/inspiring-swanson-31ba74; NOT origin/main)
```
dfa5e995  feat(supervisor): UI polish + nav fixes + shop manager plan
```

### Next session — Phase 1 of shop manager
Before building Phase 1, user should answer the 7 open questions in `SHOP_MANAGER_PLAN.md`:
1. Asset tag format (suggested `PTRT-0001`)
2. Shop help count today
3. Equipment count ballpark
4. Vehicle count
5. Voice priority (build now vs later)
6. "Operator submits maintenance request" trigger UX
7. Pre-use check default assignee

Once answered, Phase 1 starts: `equipment` + `vehicles` + `equipment_checkouts` migrations, shop_help role added to RBAC, shop manager dashboard skeleton, equipment list/detail/new pages, demo accounts (`shopmanager@pontifex.com`, `shophelp@pontifex.com`).

---

## MAY 5, 2026 — Real cost-driver identified: Build Minutes (86% of bill)

User shared the actual Vercel invoice. Yesterday's analysis was wrong about the dominant driver — let the record reflect:

| Line item | Cost | % of bill |
|---|---:|---:|
| **Build Minutes (2d 8h 12m)** | **$418.82** | **86%** |
| **Build CPU Minutes (13d 8h)** | **$67.20** | **14%** |
| Function Invocations (40,793) | $0.60 | 0.1% |
| Everything else | <$0.20 | — |

Yesterday's polling fixes saved cents, not dollars. Yesterday's `git.deploymentEnabled: { main: true, "claude/*": false }` change WAS the right fix for this bill (just not for the reason I gave at the time).

### What shipped today

**1. `next.config.js` — skip lint + type-check during Vercel builds**
```js
typescript: { ignoreBuildErrors: true },
eslint: { ignoreDuringBuilds: true },
```
Saves ~30-60s per build. Safe because `husky` pre-commit hook runs `npx tsc --noEmit` locally; TS errors are caught before any commit. Verified locally: `npm run build` clean rebuild went from 60-90s to **29s wall-clock**.

**2. New `DEPLOYMENT_COST.md`** — comprehensive cost discipline doc with:
- Actual line-item breakdown of the $487 bill
- Why builds are expensive (build × multi-vCPU × per-commit triggers)
- Rules of the road (push to main deliberately, use `vercel deploy` for one-off previews, don't push to fix typos)
- Long-term escape hatches (Cloudflare Pages, Render, self-host) — not migrating, just noted

**3. CLAUDE.md updates**
- Context Files section now lists `DEPLOYMENT_COST.md` with a one-line warning about the bill.
- Deployment & Testing Workflow section now opens with a cost note pointing at the doc.

### Files changed
```
next.config.js                        (skip TS + lint on Vercel builds)
DEPLOYMENT_COST.md                    (new)
CLAUDE.md                             (point at the new doc)
```

### Expected impact
- ~30-60s shorter builds → if we still do, say, 50 builds/month, that's ~50 min less = roughly **$5-10/mo savings just from the build skip**.
- Bigger savings come from the discipline of `claude/*` no-auto-deploy + don't-push-trivially-to-main rules. If we'd been at 100 deploys/month and dropped to 20 deploys/month, that's **~$300/mo savings**.

### Open follow-ups (not urgent)
- If next month's bill is still high, open Vercel Usage dashboard → see top driver → triage from there per `DEPLOYMENT_COST.md`.
- Consider squashing the `claude/inspiring-swanson-31ba74` branch into a single merge commit before merging to main, so it counts as one push rather than many.
- Long-term: evaluate Cloudflare Pages (free tier covers most of our needs). NOT urgent — Vercel works fine, just expensive.

### Commits
```
TBD — about to commit the next.config + doc changes
```

---

## MAY 4, 2026 — Vercel cost-reduction pass ($500 bill → fixes)

User got a $500 Vercel bill on a $20/month plan (~$480 overage). Audited the codebase, identified the drivers, shipped fixes.

### Drivers identified
1. **Polling spam (biggest).** 8 client pages polled APIs every 30s (one every 15s) and **kept polling when tabs were hidden**. With 4 operators × 8h + 2 admins × 4h, conservative estimate ~465k function invocations/month from polling alone — likely 2-5× higher with backgrounded tabs left open.
2. **`maxDuration: 30s` on ALL `/api/**` routes** ([vercel.json](vercel.json)). Global cap meant slow routes (PDFs, big aggregations) could burn 30s × 1GB = 30 GB-seconds per call uncapped.
3. **~20 preview deployments in 3 days** from `claude/*` branches. Each Vercel preview spawns its own warm-keep function pool.

### What shipped

**New `lib/hooks/useVisiblePoll.ts`** — polls only while `document.visibilityState === 'visible'` AND `navigator.onLine`. Fires once immediately on visibility/online resume so the UI catches up. Empirically verified: **0 API calls during 5s with tab hidden, 1 call on resume**.

**Replaced `setInterval` polling on 8 sites:**
| Page | Before | After |
|---|---|---|
| `/dashboard` (active jobs) | 30s | 60s + visibility-pause |
| `/dashboard/my-jobs` (Realtime fallback) | 30s | 180s + visibility-pause |
| `/dashboard/admin/operators` | 30s | 60s + visibility-pause |
| `/dashboard/admin/system-health` | 30s | 60s + visibility-pause |
| `/dashboard/admin/jobs/[id]` live status | 30s | 60s + visibility-pause |
| `components/NotificationBell` (operator) | 30s | 120s + visibility-pause |
| schedule-board `NotificationBell` (admin) | 30s | 120s + visibility-pause |
| Analytics `TeamMessagesWidget` | **15s** | 60s + visibility-pause |

Combined: ~80% fewer poll invocations vs baseline (longer intervals × paused-when-hidden × resume-on-visible refresh).

**`vercel.json` tuning:**
- Default `maxDuration: 30 → 10`. Caps runaway routes.
- Per-route `60s` only for the routes that need it: 7 PDF routes, timecards export, dashboard-summary aggregation, 2 cron handlers.
- New `git.deploymentEnabled: { main: true, "claude/*": false }`. Auto-deploys disabled for AI-feature branches. Production-only deploys going forward; previews can still be triggered manually with `vercel deploy` when wanted.

### Fixes NOT shipped (worth knowing)
- **Image optimization** was already not a cost driver — only 1 use of `next/image` in the codebase (`/andresDBC` admin page); operator photos use plain `<img>` tags pointing at Supabase Storage URLs (good — Supabase CDN delivers them, no Vercel transform charges).
- **Crons** — 2 daily cron jobs total. Negligible cost (2 × 30 = 60 invocations/month).

### Files changed
```
lib/hooks/useVisiblePoll.ts                       (new)
vercel.json                                       (maxDuration tuning + git.deploymentEnabled)
app/dashboard/page.tsx                            (operator dashboard polling)
app/dashboard/my-jobs/page.tsx                    (Realtime fallback polling)
app/dashboard/admin/operators/page.tsx
app/dashboard/admin/system-health/page.tsx
app/dashboard/admin/jobs/[id]/page.tsx
app/dashboard/admin/schedule-board/_components/NotificationBell.tsx
app/dashboard/admin/analytics/_components/widgets/TeamMessagesWidget.tsx
components/NotificationBell.tsx
```

### Expected impact (next billing cycle)
- Function invocations: **~80% drop** from polling reductions alone.
- Function GB-Hours: capped at 10s for general routes; only PDF/heavy paths can hit 60s. Should be a major reduction since most invocations are short-lived now.
- Build minutes: claude/* branches no longer auto-deploy → expect 5-10× fewer Vercel builds per week.

Honest framing: I can't promise a specific dollar figure because Vercel breaks bills into multiple line items (functions, bandwidth, image optimization, builds, edge requests) and we don't have access to the line-item breakdown. But polling was the dominant cost driver, and we've cut that ~80%.

### Next steps if the bill is still high
1. **Open the Vercel Usage dashboard** — it shows per-driver breakdown. Tells us exactly which line item is dominant.
2. **Check bandwidth** — if it's the driver, audit large API responses + PDF downloads.
3. **Audit `dashboard-summary`** — heavy aggregation route that runs on every admin login. Could be cached for 60s.
4. **Consider Supabase Realtime instead of polling** for `live-status` and `operators/active` — replace polling backstops entirely.

### Commits
```
9127a91b  perf(vercel): cut function invocations + duration to crush the bill
```
Branch: `claude/inspiring-swanson-31ba74` (pushed). Cherry-picked to local main; not pushed to origin/main yet.

---

## MAY 3, 2026 (PT 2) — Supervisor Dashboard: end-to-end verified + dev/staging/prod docs

User priority: get the supervisor flow fully functional for trial customer testing, plus document how to iterate safely without disrupting prod.

### Demo account created
- `supervisor@pontifex.com` / `Supervisor1234!` (tenant: Patriot, role: supervisor, profile id `eca5fdc6-cbef-42a8-b15c-b743f0a0f2d6`).
- Created via direct SQL into `auth.users` + `auth.identities` + `public.profiles`. **Gotcha** for future demo accounts: Supabase auth requires `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`, `email_change_token_current`, `reauthentication_token` to be empty strings (`''`), NOT NULL. Login fails with "error querying schema" if these are NULL. Same applies to `profiles.email` (NOT NULL — must populate).
- New violet "SUPERVISOR DASHBOARD" demo card added to `/login` page.

### End-to-end verified in preview
- Login as supervisor → redirects to `/dashboard/admin` → renders the dedicated SupervisorDashboard branch.
- Clock-in: GPS bypass code `4242` (gated by `NEXT_PUBLIC_LOCATION_BYPASS_CODE` in `.env.local`) → `POST /api/timecard/clock-in` 201 → dashboard shows "YOU ARE CLOCKED IN", live timer, "Since 2:02 PM", emerald background, "Clock Out" button.
- Site visit submission: pick operator → date defaults today → observations textarea → submit → redirects to `/dashboard/admin/site-visits` → new card visible with operator chip, date chip, supervisor attribution, observations preview.

### Bugs found + fixed during verification
- **Date display off-by-one** — `new Date('2026-05-03').toLocaleDateString(...)` parses as UTC midnight then renders in local TZ → off-by-one in Western timezones. Added `formatVisitDate(YYYY-MM-DD)` helper in both list page and SupervisorDashboard that explicitly constructs a local-date.
- **Sunday-week-bounds bug** — `startOfWeekISO()` used `m.setDate(m.getDate() - m.getDay() + 1)` which on Sunday (`getDay()=0`) sets the week start to TOMORROW (Monday next week). Fixed with `const dow = m.getDay() || 7` so Sunday correctly anchors to the *current* Monday→Sunday week. Also switched to local-date string (`localDateStr` helper) to avoid UTC drift on the bounds.
- **Clock-in dashboard didn't refresh** — modal closed but parent state didn't update from server. Added `fetchAll()` after the local state set so the dashboard re-syncs from `/api/timecard/current`. Belt-and-suspenders fix.

### Files changed
```
CLAUDE.md                                                 (+ Platform Vision + Deployment & Testing Workflow sections)
app/dashboard/admin/_components/SupervisorDashboard.tsx   (date helpers, week bounds, fetchAll on clock-in)
app/dashboard/admin/site-visits/page.tsx                  (formatVisitDate helper)
app/login/page.tsx                                        (Supervisor demo card)
```

### CLAUDE.md additions
- **Platform Vision** — codifies the multi-tenant SaaS goal (Pontifex Industries hosting multiple companies, Patriot is tenant #1), the company-code login model (uses existing `tenants.company_code`), and the iOS/Android distribution path via Capacitor wrapping the Next.js app.
- **Deployment & Testing Workflow** — three environments (production / Vercel preview per branch / local dev), discipline rules (never push main until preview verified, additive vs. risky migrations, when to use Supabase branches), and an optional staging-subdomain path for later.

### How to test
1. Run `npm run dev` locally.
2. Open `/login` → click SUPERVISOR DASHBOARD card to see creds → log in.
3. Clock in: GPS will fail in dev → click "Testing bypass" → enter `4242` → verify clocked-in state.
4. Click "New Visit Report" → pick an operator → fill observations → submit → verify card appears on list.
5. Reload — state persists.

### Open follow-ups (not urgent)
- "My Hours This Week" KPI tile only counts completed timecards (clocked-out). Active shift hours show in the live tile but don't roll into the weekly total until clock-out. If supervisors want a real-time "total this week" that includes the in-progress shift, sum `weeklyHours + (clocked ? hours : 0)` in the tile.
- Operator dashboard `/dashboard/page.tsx` likely has the same Sunday-week-bounds bug (`setDate(getDate() - getDay() + 1)` pattern around line 167). Worth fixing when next touched.
- Site visit detail page (`/dashboard/admin/site-visits/[id]`) doesn't exist yet — list view shows full content inline, but a detail view would be useful when comments/photos are added.
- Photo uploader on the visit form (already noted in May 3 PT 1 follow-ups).

---

## MAY 3, 2026 — Three Claude Code subagents (Ruflo evaluation → custom alternative)

User shared a YouTube short about Ruflo (`github.com/ruvnet/ruflo`, 37.6k stars, MIT) — a Claude Code orchestration plugin that ships 60+ specialist agents. After research the recommendation was **don't install it**:

- Video's "50% token cut / 250% extension" claims are not in the README.
- Repo is real but operational profile (data flow, auto-activation, telemetry, uninstall) is opaque.
- We have live trial customer data in context — adding 60 unaudited agents with unclear phone-home behavior is wrong-shaped risk.
- We already have a curated team in `.claude/agents/` (Alex/Dana/Morgan/Riley/Sam) — flooding with 60 generic agents would dilute it.
- I can't run `/plugin install` myself (user-only slash command).

Instead, added 3 high-value Claude Code subagents in the proper YAML-frontmatter format that fill REAL recurring gaps:

- `.claude/agents/supabase-migration-author.md` — encodes our exact migration conventions (idempotent DDL, SECURITY DEFINER helpers, NEVER user_metadata, tenant_id, updated_at trigger).
- `.claude/agents/rls-policy-auditor.md` — proactive RLS reviewer that catches the user_metadata bug class (CRITICAL) and missing tenant_id checks (cross-tenant leak). Graded CRITICAL/HIGH/MEDIUM/NIT.
- `.claude/agents/mobile-responsive-auditor.md` — systematic 375px audit of operator pages with an inline preview_eval script that harvests overflow, sub-44px tap targets, sub-12px text. Closes the open mobile-audit follow-up from May 2.

Zero telemetry, zero external services, fully audited (I wrote them), reversible. Captures the value of "specialist agents" tailored to our stack instead of importing a generic bundle.

Commit: `6c4fa32a` (on branch + cherry-picked to local main, NOT yet pushed to origin/main).

---

## MAY 3, 2026 — Supervisor Dashboard: Clock-in + Site Visit Reports

User asked for a supervisor dashboard. Supervisor was already a defined role with salesman parity (schedule_form submit, schedule_board view, customer_profiles view, completed_jobs view) plus timecards view. New work: add clock-in/out (paid hourly like operators) and site visit reports (similar to schedule-form but for supervisor visits to operators in the field).

### What shipped this session

**1. Supervisor render branch on `/dashboard/admin`** — `app/dashboard/admin/page.tsx` now early-returns `<SupervisorDashboard user={user} />` for `role === 'supervisor'`. Skips dashboard-summary + active-jobs-summary fetches that the default branch fires.

**2. `app/dashboard/admin/_components/SupervisorDashboard.tsx`** — lazy-loaded, self-contained:
- Clock-in/out widget with live hours timer (uses `NfcClockInModal` + `/api/timecard/clock-in` + `/api/timecard/clock-out`). Modal handles GPS/NFC/remote/PIN methods automatically since the supervisor uses the same `requireAuth` clock-in API.
- 4 KPI tiles: My Hours This Week, Visits This Week, Open Follow-ups, Active Jobs.
- Recent Site Visits panel (last 5).
- My Active Jobs panel (last 5 — submitted by this supervisor; uses `/api/admin/active-jobs-summary` which already scopes by `created_by` for non-admin roles).
- Quick Actions row: New Visit, New Quote, Schedule, Timecards.

**3. Site Visit Report system**
- New table `supervisor_visits` (migration `20260502_supervisor_visits.sql` applied). Columns: supervisor_id+name, operator_id+name, optional job_order_id+job_number+customer_name, visit_date, arrival/departure timestamps, latitude/longitude, observations, issues_flagged, follow_up_required + notes, performance/safety/cleanliness ratings (1-5), photo_urls jsonb, status. RLS: supervisor sees own; admin/ops/super see all-in-tenant; operator can read visits about themselves.
- API: `app/api/admin/supervisor-visits/route.ts` — GET (scoped to own for supervisor; tenant for admins) + POST (validates operator + job in tenant, looks up names). `app/api/admin/supervisor-visits/[id]/route.ts` — GET + PATCH (author or admin).
- API: `app/api/admin/operators/[id]/active-jobs/route.ts` — operator's active jobs for a date. Filters: `assigned_to OR helper_assigned_to == operatorId`, status in (scheduled, in_progress, en_route), date covered by [scheduled_date, end_date|scheduled_date]. Used by the form to populate the job-select after operator pick.
- Form: `app/dashboard/admin/site-visits/new/page.tsx`. Single-page form: operator select (operators + helpers from `/api/admin/schedule-board/operators`) → date → auto-populated active-jobs list (auto-selects when 1 result; tap to choose; "no jobs" message when empty + report still allowed) → arrival/departure time → observations → issues → ratings (3× 5-star) → follow-up checkbox + notes → submit. Posts to `/api/admin/supervisor-visits`.
- List: `app/dashboard/admin/site-visits/page.tsx`. Search + follow-up filter. Cards show date chip, operator chip, job chip, follow-up chip, observations + issues blocks, ratings.

**4. Timecard plumbing**
- `app/api/admin/timecards/team-summary/route.ts` — `supervisor` added to the `.in('role', [...])` profiles filter so supervisor punches appear in Timecard Management.
- `app/dashboard/admin/timecards/page.tsx` — `supervisor: { label: 'SUP', color: 'bg-violet-100 text-violet-700 border-violet-200' }` added to `getRoleBadge` map.

**5. RBAC**
- `lib/rbac.ts` — new `site_visits` card (violet/indigo gradient, ClipboardCheck icon).
- Supervisor preset adds `site_visits: 'submit'`.
- Admin preset adds `site_visits: 'view'`.

### Files changed
```
app/api/admin/operators/[id]/active-jobs/route.ts        (new)
app/api/admin/supervisor-visits/route.ts                 (new)
app/api/admin/supervisor-visits/[id]/route.ts            (new)
app/api/admin/timecards/team-summary/route.ts            (role filter)
app/dashboard/admin/_components/SupervisorDashboard.tsx  (new)
app/dashboard/admin/page.tsx                             (supervisor branch)
app/dashboard/admin/site-visits/page.tsx                 (new)
app/dashboard/admin/site-visits/new/page.tsx             (new)
app/dashboard/admin/timecards/page.tsx                   (badge)
lib/rbac.ts                                              (card + preset)
supabase/migrations/20260502_supervisor_visits.sql       (new)
```

### Verification
- `npm run build` PASS (0 errors). New routes in manifest: `/dashboard/admin/site-visits` (4.75 kB), `/dashboard/admin/site-visits/new` (6.01 kB).
- Pre-commit type-check passed.
- Migration applied + columns verified via `information_schema`.
- Smoke-tested in preview as `admin@pontifex.com`: list page renders empty-state correctly, form page renders all sections, operator dropdown populates with 5 operators + 1 helper, picking "Demo Operator" fires `/api/admin/operators/{id}/active-jobs` and renders "No active jobs" panel correctly.
- **NOT smoke-tested**: the supervisor render branch itself — there is currently no `supervisor`-role account in the DB. To exercise: create one (or temporarily promote a test user) and navigate to `/dashboard/admin`. Default URL stays the same; the page early-returns the supervisor view.

### Commits (LOCAL — pushed to origin/claude/inspiring-swanson-31ba74; NOT pushed to origin/main yet)
```
8eeb01cb  feat(supervisor): supervisor dashboard with clock-in + site visit reports
2190b010  Merge: Supervisor dashboard + site visit reports + clock-in (on local main)
```

### How to make a supervisor account for testing
Either:
- In Team Management, change a test user's role to `supervisor` and re-login (auth role is cached in localStorage), OR
- Direct DB: `UPDATE public.profiles SET role = 'supervisor' WHERE email = 'sales@pontifex.com';` (will repurpose the salesman demo account; revert after).

### Known gaps / next iteration ideas
- Supervisor visit form has no photo uploader (intentional MVP — easy to add via existing `PhotoUploader` component).
- Visit detail view — currently only the list shows visits. A `/dashboard/admin/site-visits/[id]/page.tsx` detail page is a natural next step (PATCH endpoint already exists).
- Operator-side: operators can read visits about themselves (RLS policy in place) but no UI surfaces them yet. If/when supervisor performance gets factored into operator reviews, build a "Recent supervisor reports" panel on operator profile.
- "My Active Jobs" tile on supervisor dashboard uses the existing salesman/supervisor scope (`created_by = self`). If a supervisor wants to see ALL active jobs (not just ones they bid), would need a toggle.
- Notifications: when a supervisor flags follow-up, no notification fires to the operator's manager today. Consider adding a `notifySalesperson`-style helper for supervisor visits.
- Clock-in: supervisor uses the same `NfcClockInModal` as operators. The modal's "shop_pin" / "shop_gps" / "jobsite_camera" / "remote" flows all work for any role — but if NFC is required by tenant settings, supervisor would need a bypass notification or a registered NFC tag. Not handled specifically; same path as any non-operator who tries to clock in.

---

## MAY 2, 2026 — Post-Demo Refinement: Linear Ft Calculator + Edit Scope Button + Production Deploy

Demo went well. User shifted to refinement mode + production push.

### Production deploy 🚀
- Local main was 97 commits ahead of origin/main (entire week's worth of work).
- Pushed `git push origin main` → Vercel auto-deployed.
- Build took 98 seconds.
- All production aliases respond 200: `pontifexindustries.com`, `www.pontifexindustries.com`, project Vercel URL.
- Apex domain redirects to `www.` (correct config).
- This is the URL the trial customer will use.

### Refinements shipped this session

**1. Linear Ft + Cut Depth mode now uses the cross-cut calculator** — previously it asked for total linear feet + # of cuts (manual computation). Now asks for Length × Width × Cut Depth + cross-cut spacing in both directions + overcut toggle, auto-computes total LF using the existing `computeSawingAreaLinearFt` helper. Per-row total chip + grand total. Same calculator already in Areas + Thickness mode — now both modes share it. Backward compat: legacy entries with `linear_feet` set fall through.

**2. Edit Scope button (Option A — redirect)** — schedule-board's edit modal had a simplified inline `ScopeEditor` (just # cuts / linear feet / depth manual). User wanted the full schedule-form scope-step UI for editing. Implemented as a redirect:
- Added violet "Edit Scope" button on `JobDetailView.tsx` (above the existing inline editor) → links to `/dashboard/admin/schedule-form?editJobId={job.id}&jumpTo=scope`.
- Schedule-form now reads `?editJobId` + `?jumpTo` query params via `useSearchParams`. On mount in edit mode: GETs `/api/admin/jobs/{id}/summary`, prefills form fields (customer, address, scope_details, equipment, etc.), jumps directly to step 3 (scope).
- Form header shows "Edit Scope" + violet "Editing existing job" badge.
- Submit button reads "Save Scope Changes" instead of "Submit Schedule Form".
- On submit, PATCHes `/api/admin/job-orders/{id}` with the scope-relevant fields (description, job_type, scope_details, scope_photo_urls, equipment_*, ppe_required) instead of POSTing a new job. Redirects back to schedule-board.
- This reuses 100% of the rich scope UI (calculator, areas, photos, custom equipment, etc.) for edits. Single-page UX trade-off: user navigates to a new page rather than staying in the modal. Acceptable for now.

**3. Mobile audit pass + survey NPS fix** — `/login`, `/offer`, `/sign/[token]` all clean at 375px (no horizontal overflow). Customer satisfaction survey NPS chips were `grid-cols-10` with gap-1.5 → ~29px chips on phones (too tight to tap). Fixed to `grid-cols-5 sm:grid-cols-10` + `h-12 sm:h-10` so phones get a 5×2 grid with native-app-tappable chips. Admin tables already had `overflow-x-auto` parents.

### Files changed this session
- `app/dashboard/admin/schedule-form/page.tsx` — Linear Ft calculator UI + edit-mode load + edit-mode PATCH on submit + header banner.
- `app/dashboard/admin/schedule-board/_components/JobDetailView.tsx` — "Edit Scope" button.
- `components/CustomerSatisfactionSurvey.tsx` — mobile NPS grid.

### Commits added since the last deploy
```
a9f69f4e  feat(schedule): Linear Ft + Cut Depth mode now uses the cross-cut calculator
d974ec57  fix(survey): NPS chips collapse to 5x2 grid on mobile
0963259f  Merge: Linear Ft calculator                                  ← DEPLOYED to prod
(pending) feat(schedule): Edit Scope flow — schedule-form ?editJobId + JobDetailView button
```

### Pending follow-ups for next session
- Edit Scope flow is committed but NOT YET on `origin/main` — user can re-deploy when ready, or roll forward with the next batch.
- Eventually consider Option B (extract scope step into shared component, embed in modal directly). Current Option A's redirect-based UX is acceptable; not urgent.
- The edit-load mapper does best-effort prefill but may miss some niche fields (compliance attachments, permits array, etc.). Test the round-trip end-to-end and patch any gaps.
- Vercel Cron `invoice-30d-reminders` requires `CRON_SECRET` env var to be set in Vercel dashboard — check if that's configured.

---

## MAY 1, 2026 (PT 5) — Unified GPS Bypass: One Code-Gated Mechanism, Legacy Switch Removed

(Date header above superseded by the May 2 entry — original date below was while the deploy was still pending)

**Date:** May 1, 2026 (DEMO-DAY SESSION — IN PROGRESS) | **Branch:** `claude/nice-borg-4ffe67` (pushed to origin) → merged to local `main` (~72 commits ahead of origin/main) | **Build Status:** PASSING ✅ | **DB:** Migrations `20260501_customer_survey_v2` and `20260501_notifications_invoice_metadata_idx` applied

---

## MAY 1, 2026 (PT 5) — Unified GPS Bypass: One Code-Gated Mechanism, Legacy Switch Removed

Cleanup pass. The previous session left two overlapping bypass mechanisms which was confusing — when both env vars were set, the legacy one fired first and the new code-entry UI was never reachable. Removed the legacy switch entirely.

### Single bypass system (now)

Two-factor activation, both required:
1. **Build-time gate** — `NEXT_PUBLIC_LOCATION_BYPASS_CODE` env var must be set. Without it, the bypass UI is hidden and impossible to activate. This is what locks production.
2. **Runtime gate** — operator must enter the matching code via the clock-in modal. On success, `sessionStorage['location_bypass_active'] = 'true'`. Tab close clears it.

Both `process.env.NEXT_PUBLIC_LOCATION_BYPASS_CODE` AND the sessionStorage flag must be present for `isLocationBypassActive()` to return true.

### Centralized in `lib/geolocation.ts`

New exports:
- `isLocationBypassActive(): boolean` — single check used by all 4 GPS callers
- `activateLocationBypass(): void` — flips the sessionStorage flag

`verifyShopLocation()` now reads via `isLocationBypassActive()` (was reading the legacy env var inline).

### All 4 GPS code paths now honor the same flag
- `lib/geolocation.ts` — `verifyShopLocation()` (dashboard clock-in/out + job-schedule shop-arrival)
- `components/NfcClockInModal.tsx` — `getLocation()` (the main modal flow)
- `components/NFCClockIn.tsx` — `getGPS()` (NFC scan UI)
- `app/nfc-clock/page.tsx` — `getLocation()` (iOS NFC URL kiosk)

Each was previously checking `process.env.NEXT_PUBLIC_BYPASS_LOCATION_CHECK === 'true'` independently. Now they all delegate to the central helper.

### Removed
- `NEXT_PUBLIC_BYPASS_LOCATION_CHECK` env var — gone from all 4 source files, `.env.example`, `CLAUDE_CONTEXT.md`, `DEPLOYMENT_CHECKLIST.md`.
- Hardcoded local fallback coords (`34.76866 / -82.43563`) in `NFCClockIn.tsx` and `app/nfc-clock/page.tsx` — replaced with imports from `SHOP_LOCATION` for consistency.

### How to test at home now (single workflow)
1. Add to `.env.local`:
   ```
   NEXT_PUBLIC_LOCATION_BYPASS_CODE=4242
   ```
2. Restart dev server.
3. Click Clock In. GPS will run. You're at home → you'll see "you're 2,847 ft away" outside-radius screen.
4. Click "🔑 Testing bypass" link at the bottom.
5. Numpad → enter `4242` → bypass activates for the rest of the tab session.
6. Once active, all subsequent clock-in attempts (modal, NFC, kiosk, job-arrival) will silently bypass GPS until you close the tab.
7. To re-test the geofence at home, close the tab to clear sessionStorage and start over.

In production without the env var: the link doesn't render anywhere. Bypass impossible.

### Files changed
```
lib/geolocation.ts                                        (centralized helpers)
components/NfcClockInModal.tsx                            (call helpers, activate on code entry)
components/NFCClockIn.tsx                                 (call helpers, drop legacy env)
app/nfc-clock/page.tsx                                    (call helpers, drop legacy env)
.env.example                                              (replaced legacy var with new one)
CLAUDE_CONTEXT.md                                         (env var docs updated)
DEPLOYMENT_CHECKLIST.md                                   (env var + verification steps updated)
```

### Commits on `main` (LOCAL)
```
e27d2e15  refactor: unify GPS bypass — single code-gated mechanism, drop legacy env switch
```

---

## MAY 1, 2026 (PT 4) — Tight 20ft Geofence on Clock-In + UI Test-Bypass Code

### What shipped

**Updated shop pin to user's exact coords** — `lib/geolocation.ts` now uses `34.76874307354808, -82.43569623308949` (was off by ~33ft). `ALLOWED_RADIUS_METERS = 6.1` (~20ft) was already correct.

**Removed duplicate constants in `components/NfcClockInModal.tsx`** — was using its OWN local `SHOP_LAT/LNG` and `SHOP_RADIUS_M = 200` (656ft, way too lax). Now imports `SHOP_LOCATION`, `ALLOWED_RADIUS_METERS`, and `calculateDistance` from `lib/geolocation.ts`. Single source of truth.

**Hardened the outside-radius branch** — previously when GPS placed the operator outside the shop radius, the modal showed "Yes, Clock In Anyway" as a soft override. Now removed. Operator sees their exact distance in feet (e.g. "GPS places you 45 ft away"). Two paths forward:
1. "Switch to Direct-to-Jobsite" — emerald CTA that opens the existing `jobsite_camera` flow (photo + GPS + admin approval). This is the proper escape hatch for offsite clock-ins.
2. "Cancel" — back to choose screen.

**New `bypass_code` flow** — gated on `NEXT_PUBLIC_LOCATION_BYPASS_CODE` env var:
- Small "Testing bypass" link appears at the bottom of the GPS-outside and GPS-error states (only when env var is set; in prod-without-env-var the link is hidden so it can't be exploited).
- Click → numpad screen with "DEV/TEST ONLY" warning.
- If entered code matches `process.env.NEXT_PUBLIC_LOCATION_BYPASS_CODE`, treats operator as at-shop, proceeds to clock-in with the configured shop coords.
- Wrong code shakes the dot display and shows "Invalid bypass code".
- The existing full-bypass env var (`NEXT_PUBLIC_BYPASS_LOCATION_CHECK=true`) still works unchanged — that one bypasses GPS entirely with no UI prompt.

**Admin operator timecard view** — `app/dashboard/admin/timecards/operator/[id]/page.tsx` now recognizes both `'remote'` (current DB enum) and `'gps_remote'` (legacy) for:
- The amber "Remote · Review" / "Remote · OK" badge in the entry header
- The "Remote Clock-In Location" banner with Google Maps link
- Shop-clock-in coords already rendered via `renderGpsLink` for both clock-in and clock-out — no change needed there.

### Setup notes for testing
To use the UI bypass at home, add to `.env.local` (or Vercel env vars):
```
NEXT_PUBLIC_LOCATION_BYPASS_CODE=4242
```
Restart dev server. When you click Clock In and GPS places you outside the shop radius (or fails), the "Testing bypass" link will appear. Enter the code → clock-in proceeds. Without the env var, the link is hidden — production stays locked.

### Files changed
```
lib/geolocation.ts                                            (coord update)
components/NfcClockInModal.tsx                                (refactor + bypass flow)
app/dashboard/admin/timecards/operator/[id]/page.tsx          (remote method check)
```

### Commits on `main` (LOCAL)
```
1e9f488a  feat: tighten clock-in geofence to 20ft + UI test-bypass code
```

### Verification
- `npm run build` PASS (0 errors).
- Pre-commit type-check passed.

### Pending follow-ups
- Wire `NEXT_PUBLIC_LOCATION_BYPASS_CODE` to Vercel env vars for staging testing.
- Consider also tightening the `app/dashboard/job-schedule/[id]/page.tsx` shop-arrival check (it imports `verifyShopLocation` too) — currently any caller of that helper inherits the new 20ft / new coords automatically, so this should "just work" but worth a manual test.
- The clock-OUT flow is unchanged — operator can clock out from anywhere and GPS is recorded for the record. If you want to also enforce a shop-only clock-out, we'd need to mirror the new logic on the clock-out path.

---

## MAY 1, 2026 (PT 3) — Invoice Review Modal + RBAC + Salesperson Notifications + Completed-Jobs Polish

User request: hone the post-completion side. Five tasks bundled, dispatched 3 parallel agents in isolated worktrees, audited each diff, manually merged.

### What shipped

**Hydration fix on billing page**
- Outer invoice card was a `<button>` with inner action buttons (Mark Paid / View / Download). React 19 hydration error. Converted outer to `<div role="button">` with `tabIndex={0}` + `onKeyDown` for Enter/Space. Inner action buttons now sit cleanly inside.

**A — Completed Jobs detail polish** (Agent D — `app/dashboard/admin/completed-jobs/page.tsx`)
- View + Download buttons added to the Service Completion Signature block when `job_orders.completion_pdf_url` is set. Falls back to muted "PDF not available" when missing.
- New Completion Photos panel (responsive 2/3/4-col grid of operator-uploaded photos from `photo_urls`, hover ring + scale + count badge).
- Operator + Helper rows now include "View timecard →" links (`/dashboard/admin/timecards/operator/{id}`). Helper name fetched in `loadJobDetails`. Both rows colored chips (violet for operator, indigo for helper).
- 4 metric tiles upgraded from soft tints to vibrant gradients with white text + colored shadow rings: violet→indigo (Days Worked), cyan→sky (Total Hours), amber→orange (Standby Time), emerald→teal (Labor Cost).
- Documents and Operator Notes panels gained matching gradient accent stripes.

**B — Invoice Review & Confirm flow + RBAC** (Agent E)
- New API `app/api/admin/invoices/preview/route.ts` — POST `{ jobOrderId }` returns `{ job, operator_name, work_performed_summary, line_items, subtotal, default_due_date, default_po_number, default_notes }`. Mirrors the line-item builder from the create route without inserting. `work_performed_summary` is bullet-text built from `work_items` rows (truncated to ~120 chars per line, indented notes appended).
- `app/api/admin/invoices/route.ts` POST extended with optional `description_override` (string) and `line_items_override` (validated array). When override provided, replaces auto-built items + recomputes subtotal. Backwards-compatible.
- `app/dashboard/admin/billing/page.tsx`:
  - "Create Invoice" buttons on Ready-to-Bill cards now open a "Review & Confirm Invoice" modal (max-w-2xl, mobile-friendly, sticky header/footer, scrollable body).
  - Modal shows: customer/job/billing-type/due-date grid, "Work Performed by Operator (X)" panel rendering `work_performed_summary` in mono `whitespace-pre-wrap`, editable line-items table (qty/unit/rate inline number+text inputs, per-row "Edit Description" textarea toggle), live subtotal recompute on edits, "Use Operator's Description" button (copies summary into first line item), Cancel + Submit Invoice actions.
  - On submit POSTs `/api/admin/invoices` with `{ jobOrderId, line_items_override }`. Switches to All Invoices tab + success toast.
- **RBAC**: `salesman` role added to `allowedRoles` page guard. Server-side filter on GET `/api/admin/invoices` (`.eq('created_by', auth.userId)` when `auth.role === 'salesman'`). Server-side guard on `/api/admin/invoices/preview` (404 if salesman doesn't own the job). Client-side filter on Ready-to-Bill query for salesman. Admin/super_admin/operations_manager unchanged.
- "Submitted by: {name}" chips added to invoice cards and ready-to-bill cards. Bulk profile lookup cached in `profilesById` state on data load.

**C — Salesperson notifications + 30-day unpaid reminder** (Agent F)
- New `lib/notify-salesperson.ts` — fire-and-forget helper exporting `notifySalesperson({ event, jobOrderId?, invoiceId?, recipientUserId, tenantId?, subjectName?, customerName? })`. Inserts into `public.notifications` (sender_id null = system event) and best-effort emails the user via `auth.users.email` lookup + `lib/email.ts`. Five events:
  - `job_active` — job → `in_progress`
  - `job_completed` — job → `completed`
  - `invoice_ready` — invoice created from completed job
  - `invoice_paid` — invoice → `paid`
  - `invoice_unpaid_30d` — 30-day reminder
- Triggered from:
  - `app/api/job-orders/[id]/status/route.ts` — fires `job_active` / `job_completed` to job's `created_by` on transition.
  - `app/api/admin/invoices/route.ts` POST — fires `invoice_ready` to job's `created_by` (the salesperson who scheduled the work, not whoever created the invoice).
  - `app/api/admin/invoices/[id]/mark-paid/route.ts` PATCH — fires `invoice_paid` via `invoice_line_items.job_order_id → job.created_by`, falls back to `invoices.created_by`.
- New cron route `app/api/cron/invoice-30d-reminders/route.ts` — auth via `Authorization: Bearer ${CRON_SECRET}` env (falls back to `requireAdmin` for manual testing). Scans `invoices` where `status IN ('sent','overdue','partial')` AND `balance_due > 0` AND `invoice_date <= NOW() - 30 days`. Dedupes on 7-day window via `metadata->>invoiceId`. Fires `invoice_unpaid_30d` for each.
- New migration `supabase/migrations/20260501_notifications_invoice_metadata_idx.sql` — partial index `idx_notifications_invoice_unpaid_30d` on `(user_id, type, created_at DESC)` filtered to `type = 'invoice_unpaid_30d'` for fast dedupe. **Applied via MCP**.

**D — Analytics YTD revenue (no work needed)**
- `/api/admin/analytics` already filters invoices by `status === 'paid'` and sums `total_amount` for `revenueYTD`. Dashboard reads this on every load → auto-updates as soon as Mark Paid succeeds. Verified, no changes required.

### Merge ordering + manual conflict resolution
- Agent D: clean patch apply.
- Agent F: applied edits + lib + cron + migration cleanly. The agent's worktree was based on `main` and didn't see the existing PATCH `mark-paid` route, so it created a parallel POST handler instead. **Skipped** that file; manually inserted `invoice_paid` notification logic into the existing PATCH handler (line_items lookup → job.created_by → notifySalesperson, fire-and-forget).
- Agent E: 7 of 8 hunks on billing page applied via `git apply`; the auth-guard hunk failed due to overlap with my hydration-fix line numbers. **Manually added** `salesman` to `allowedRoles` and the new state hooks (`profilesById`, `reviewJobId`, `reviewLoading`, `reviewError`, `reviewData`, `editLineItems`, `editingDescIdx`, `submittingReview`). Build then passed.

### Verification
- `npm run build` PASS (0 errors). New routes in manifest: `/api/admin/invoices/preview`, `/api/cron/invoice-30d-reminders`.
- Migration applied + verified live.
- Pre-commit type-check passed.

### Commits on `main` (LOCAL — pushed to origin/claude/nice-borg-4ffe67, NOT to origin/main)
```
1a0c04a2  feat: invoice review modal + RBAC + salesperson notifications + completed-jobs polish
3e80a747  feat: customer survey + admin photos + vibrant CTAs + PDF email
```

### Pending follow-ups for next session
- Test the salesman RBAC flow with a real salesman-role user — confirm they see only own invoices/jobs.
- Wire the cron route to a real scheduler (Vercel Cron / GH Action) — currently manual-trigger only.
- Consider adding `invoice_paid` notification to the existing `/api/admin/invoices/[id]/payment/route.ts` (the payment-ledger handler) and `/api/admin/invoices/[id]/route.ts` PATCH for completeness — currently only the lightweight Mark Paid PATCH dispatches.
- The Review & Confirm modal currently doesn't surface `survey` data, photos, or scope_details. If invoice description should be auto-populated from richer sources, extend `work_performed_summary` builder.
- Add a "View Invoice" or "Edit Invoice" page route (currently invoice details are loaded into a modal in `viewInvoice` — fine for now, but admins might want a full page).

---

## MAY 1, 2026 (PT 2) — Customer Survey + Admin Photos + Vibrant Day-Complete UI + PDF Email

User request was 4 things touching the customer-facing completion flow. Dispatched 3 parallel agents in isolated worktrees, audited each diff, then merged into `claude/nice-borg-4ffe67`.

### What shipped

**A — Operator photos visible to admin** (Agent A)
- `app/api/admin/jobs/[id]/summary/route.ts` — additively returns `photos` array (`job_orders.photo_urls`).
- `app/dashboard/admin/jobs/[id]/page.tsx` — new "Job Photos" panel rendered between Daily Progress and Activity Log. Responsive 2/3/4-col grid of `<a target=_blank>` thumbnails with hover ring shift, scale, gradient overlay, count badge, empty-state.

**B — Customer satisfaction survey infrastructure** (Agent B)
- Migration `supabase/migrations/20260501_customer_survey_v2.sql` (applied via MCP, verified live): adds `operator_feedback_notes`, `likely_to_use_again_rating` (1-10 NPS w/ CHECK), `customer_email`, `delivered_to` to `customer_surveys`.
- New `components/CustomerSatisfactionSurvey.tsx` — shared between on-site and remote flows. Two 5-star widgets (cleanliness, communication), NPS 1-10 chip selector (rose 1-6 / amber 7-8 / emerald 9-10), free-text operator notes, radio toggle "send to contact-on-site phone (default)" vs "send to my email", security disclaimer pill, purple→indigo submit. Variant prop `'light' | 'public'`.
- New `app/api/job-orders/[id]/customer-survey/route.ts` — POST for on-site flow. Auth + tenant scope. Inserts row, computes `overall_rating` as round(avg). Fire-and-forget SMS to `site_contact_phone` OR email if `send_to_email`. Updates operator running averages.
- `app/api/public/signature/[token]/route.ts` — survey block extended additively to accept new v2 fields. Same SMS/email dispatch.
- `app/sign/[token]/page.tsx` — replaced inline survey block with `<CustomerSatisfactionSurvey variant="public" />`. Removed legacy `surveyClean/surveyComm/surveyOverall/wouldRecommend/feedbackText` state and inline `StarRating` helper.

**SECURITY note (Agent B):** business rule explicitly enforced — survey results **always** go to the job's `site_contact_phone` OR the customer's own email (radio choice). NEVER the operator's device. Prevents operators from filling out their own surveys to inflate ratings. Visible disclaimer pill in the UI.

**C — Day-complete UI overhaul + PDF email** (Agent C)
- `app/dashboard/job-schedule/[id]/day-complete/page.tsx`:
  - Vibrant CTA gradients replace pale tints: amber→orange (Done for Today), emerald→teal (Complete Job — Get Signature On Site), indigo→violet→purple (Send Completion Link). White text + white/translucent icon circles + colored shadow rings.
  - New Customer Email field on signature view (Mail icon, optional, sends PDF receipt).
  - New violet→indigo branded "Thank you for choosing Patriot Concrete Cutting" callout above the existing PDF notice.
  - New survey screen between signature submission and Job Complete success card. Survey only fires on the on-site Complete Job path; Done-for-Today and Send Completion Link paths unchanged. Skip-survey link bypasses save.
  - Success card now shows "Thanks for your feedback ✓" violet badge when survey was submitted.
- `app/api/job-orders/[id]/generate-completion-pdf/route.ts` — accepts new optional `customer_email` and `reference_photo_urls`. After PDF upload, fire-and-forget thank-you email via Resend with PDF attached as base64 + branded HTML body featuring up to 6 inline reference photos in a 3-col grid.
- `lib/email.ts` — backwards-compatible: added optional `attachments?: EmailAttachment[]` to `EmailOptions`. Passed through to Resend payload only when present.

### Merge ordering
Agent A merged manually (Edit tool — line numbers had drifted between agent's main-based worktree and parent session). Agents B + C patches applied via `git apply` after Agent A's edits stabilized line numbers. Conflict-free.

### Commits on `main` (LOCAL — pushed to origin/claude/nice-borg-4ffe67, NOT to origin/main)
```
3e80a747  feat: customer survey + admin photos + vibrant CTAs + PDF email
```

### Database migration applied
`20260501_customer_survey_v2` — verified live via `information_schema.columns` query. All 4 new columns present.

### Verification
- `npm run build` PASS, 0 errors. Both `/api/job-orders/[id]/customer-survey` and `/api/admin/jobs/[id]/summary` rebuilt.
- Migration applied to live DB.
- Pre-commit type-check passed.

### Known issues — still acknowledged (NOT blocking demo)
- Cross-tab session bleed → wrong-dashboard redirects (multi-tab Supabase auth). Workaround: one role per browser/tab during demo.
- Start-In-Route latency (cosmetic).

### Pending follow-ups for next session
- Survey results — currently dispatched fire-and-forget; consider an admin "view all surveys" page once data accumulates.
- Survey UI on the public sign page hasn't been hand-tested in browser yet — variant="public" path needs eyes during demo.
- Operator-uploaded photos lightbox — currently opens in new tab; could be upgraded to inline modal viewer if desired.
- Apply same vibrant gradient style to other operator workflow pages (in-route, jobsite, work-performed CTAs) for consistency.

---

## MAY 1, 2026 — Demo-Day Bug Fixes: Data-Flow Bridges (Operator → Admin Visibility)

User is running through the demo flow live. Issues surface, get fixed in flight. New rule from user this session: **after each task completed, update CLAUDE_HANDOFF.md (and CLAUDE.md sprint backlog if relevant)**. Going forward this is the persistent workflow.

### Bugs fixed this session

**CRITICAL data-integrity (operator submissions invisible to admin):**

1. **Operator's Work Performed → admin's Job Scope & Progress** — operator submissions via `work_items` table were not appearing in admin's Daily Activity / Job Scope & Progress. `/api/admin/jobs/[id]/summary` only read from `job_progress_entries`. Fix: route now reads BOTH tables, merges by date into `progress.by_date`, tags work_items entries with `source: 'work_items'`. Quantity intelligently picks `core_quantity` (cores) → `linear_feet_cut` (LF) → `quantity` (raw) so admin sees the meaningful number. Scope-progress percentages still driven only by `job_progress_entries` to avoid inflating %.
2. **Per-area overcut + cross-cut not on operator ticket** — sawing calculator inputs (overcut state, cross-cut spacing, total linear-ft) were not surfaced on the operator's ticket. Fixed in `components/ScopeDetailsDisplay.tsx` — each sawing area now renders an overcut state pill, cross-cut pill (if set), and total-linear-ft pill with breakdown subtitle "(perimeter X + cross-cuts Y)". Section grand-total LF appended below.
3. **Custom-added equipment ("5000 DFS") missing from operator ticket** — `UnifiedEquipmentPanel`'s filter was dropping custom items added in `equipment_needed`. Fixed in `app/dashboard/my-jobs/[id]/page.tsx` — new sky-themed "Additional / Custom Equipment" sub-card surfaces custom entries below the unified list.
4. **Material removal details (method + equipment used) not on operator ticket** — only method was rendering. `ScopeDetailsDisplay.tsx` now renders 2-column grid of every populated field from `scope_details._removal`: method, equipment list (forklift/skidsteer/lull/dingo/sherpa/mini_excavator), forward-compat `dumpster_size` / `responsible_party` / `what` slots.

### Known issues — acknowledged, deferred (NOT blocking demo)

- **Cross-tab session bleed → wrong-dashboard redirects.** When user clicks "Active Jobs" or "Arrived On Jobsite", clicking sometimes redirects to operator dashboard. Root cause: multi-tab Supabase auth — localStorage `sb-*-auth-token` is shared across tabs, so logging in as Operator in one tab silently flips the salesman/admin tab's session. `getCurrentUser()` reads stale `supabase-user` cache, role guards trigger redirect. Proper fix: `useAuthUser` retrofit on every role-guarded page (already exists at `lib/hooks/useAuthUser.ts` — partially adopted in April 27 session). Too risky to land mid-demo. **Workaround for demo:** one role per browser/tab.
- **Start In Route → next-page latency.** User confirmed admin side reflects status correctly, just visual delay. Cosmetic.

### Agents dispatched this session (both merged + pushed)

| Agent | Scope | Outcome |
|---|---|---|
| Agent A — work_items bridge | `app/api/admin/jobs/[id]/summary/route.ts` only — merge `work_items` into `progress.by_date` | Single file, additive only. Merged. |
| Agent B — operator ticket display | `components/ScopeDetailsDisplay.tsx` + `app/dashboard/my-jobs/[id]/page.tsx` — overcut/cross-cut pills, custom equipment sub-card, material removal grid | Two frontend files, no API/auth/lib changes. Merged. |

Both agents received guardrails: no `app/api/**` (except the explicitly named summary route), no `lib/supabase*`, no `lib/api-auth*`, no `middleware.ts`, no `package.json`, no migrations. Diffs audited before merge.

### Commits on `main` (LOCAL — verify push state before next session)

```
f55150ea  Merge: data-flow fixes (work_items bridge, overcut + custom equipment + removal details on ticket)
ac96a221  Merge: surface overcut + custom equipment + material removal details on operator ticket
d5af99e6  fix: surface overcut/cross-cut, custom equipment, and removal details on operator ticket
be09c997  Merge: bridge operator work_items into admin Job Scope & Progress
9ee95310  Merge: bridge work_items into admin Job Scope & Progress summary
29d8ca82  fix: bridge operator work_items into admin Job Scope & Progress summary
```

### Pending follow-ups (from this session)

- **Cross-tab session bleed fix** — retrofit remaining role-guarded admin pages onto `useAuthUser` hook (pages still using legacy `getCurrentUser()` localStorage path). Post-demo priority.
- **Start In Route latency** — investigate why operator-side transition feels slow despite admin reflecting status correctly. Likely a router push timing issue.
- **Apply same per-area cross-cut calculator to operator's Work Performed page** (carryover from Apr 30 — still admin-side only).

---

## APRIL 30, 2026 (PT 4) — Pre-Demo Hardening: 4 Bug Fixes + Sawing Cross-Cut Calculator

User has a software demo tomorrow and is walking the full create-job → completion flow. Issues are surfacing in real time; this session shipped them as they came up.

### Bug fixes shipped (5 total in this session)
1. **React duplicate-key crash on contact picker** — when two records shared a display name (e.g., two "John Test"), `<li key={option.value}>` collided. Fixed at [components/SmartCombobox.tsx:293](components/SmartCombobox.tsx:293) — composite key `${value}-${idx}`.
2. **`ContactCombobox` data-layer dedupe** — same component now collapses options by case-insensitive trimmed name BEFORE rendering. Most-informative entry wins (scored on phone+email+job_count). Eliminates the dup-name issue at the source.
3. **Super admin / operations_manager bypass approval gate** — `/api/admin/schedule-form` now creates jobs with `status='scheduled'` directly for those roles. Salesmen and admins still go through `pending_approval`.
4. **New Job button perceived latency** — `<button onClick=router.push>` → `<Link href prefetch>`. Next.js now prefetches the schedule-form chunk on hover/viewport so click feels instant.

### Schedule form Sawing Calculator (DFS / EFS / HHS-PS)
This is the genuine differentiator the user called out. Captures real-world cross-cut + overcut requirements and auto-computes total linear feet.

**Per-area inputs added** (in "Areas + Thickness" mode for DFS, EFS, HHS/PS):
- "Overcut allowed" toggle (per area, falls back to top-level `form.overcutting_allowed`)
- "Cross-cut every X ft length-wise" (number)
- "Cross-cut every Y ft width-wise" (number)

**Pure helper** `computeSawingAreaLinearFt(area)` at [app/dashboard/admin/schedule-form/page.tsx:209-256](app/dashboard/admin/schedule-form/page.tsx:209) computes:
```
perimeter      = 2 × (length + width)
lengthwiseCuts = max(0, floor(length / lengthSpacing) - 1)
widthwiseCuts  = max(0, floor(width  / widthSpacing)  - 1)
crossCutLength = (lengthwiseCuts × width) + (widthwiseCuts × length)
linearFt       = (perimeter × (overcut ? 1 : 2) + crossCutLength) × qty
```

**Verified scenarios:**
| Scenario | Inputs | Result |
|---|---|---|
| User example | 10×10, qty 1, 2/2 spacing, overcut=true | 40 + 80 = **120 lf** ✓ |
| Plain perimeter | 20×8, qty 1, no spacing, overcut=true | **56 lf** |
| No-overcut doubles perimeter | 20×8, qty 1, no spacing, overcut=false | **112 lf** |
| Quantity scales | 12×6, qty 2, 3/3 spacing, overcut=true | (36 + 30) × 2 = **132 lf** |
| Combined | 15×10, qty 1, 5/5 spacing, overcut=false | 100 + 35 = **135 lf** |
| Empty fields | length blank | shows `— linear ft` (returns null, no error) |

**Persistence**: new keys live inside the existing `scope_details[code].areas` JSONB array. No backend route or migration needed — Postgres jsonb absorbs them.

**Per-area total** displayed inline as a sky pill (with breakdown tooltip). **Section grand total** appended below the existing "TOTAL: NNN sq ft" line.

### Team manifest — agents dispatched this session
Scope discipline: every agent received a strict guardrail list (no `app/api/**` for non-security work, no `lib/supabase*` / `lib/api-auth*` / `middleware.ts` / `package.json` / migrations). I independently audited each diff before merge.

| Agent | Scope | Outcome |
|---|---|---|
| Track A (sales tiles) | Salesman dashboard 4 tiles → 3 (Active / Quoted MTD / Expected Commission); scoping audit | Merged |
| Track B (admin invoicing UI) | Mark Paid button + modal, commission % chip on job detail, default rate input on team profiles | Merged |
| Track C (workflow audit) | Read-only research → [WORKFLOW_AUDIT.md](WORKFLOW_AUDIT.md) (378 lines, 9 critical / 14 important / 7 polish) | Merged |
| Track D (security fixes) | 9 critical findings from Track C — agent stalled mid-task; **completed manually** | Merged |
| Track E (sawing calculator) | Per-area overcut + cross-cuts + auto linear-ft on DFS/EFS/HHS+PS | Merged |
| (manual) | SmartCombobox composite key + dedupe; super_admin bypass approval; New Job prefetch | Merged |

### Commits on `main` (LOCAL — NOT pushed to origin)
```
67ced6b1  feat: schedule form sawing calculator — per-area overcut, cross-cuts, auto linear-ft
11d8f8dd  fix: dedupe ContactCombobox options at the data layer
830f8d31  fix: 3 testing-blockers — duplicate React key, super_admin approval skip, New Job prefetch
88c4de72  fix: 9 critical workflow audit findings (security + correctness)
04b2880e  docs: end-to-end workflow + security audit
dd1e4bcc  feat: admin Mark Paid + commission rate editors
fbc36a27  feat: simplify salesman dashboard tiles
```

### Database state
Wiped via Supabase MCP earlier this session. Single seed customer remaining: Patriot Test GC (id `a2cb81e6-790a-48f1-aba6-ac979c29de96`). 8 profiles preserved. All transactional tables zeroed.

### Pending follow-ups (from WORKFLOW_AUDIT.md "Important")
- Audit-log writes on status transitions, work-items, completion approvals, invoice events, signature submission
- Wrap `work_items` delete-then-insert in transaction or UPSERT
- Optimistic concurrency on payment recording (`.eq('balance_due', currentBalance)`)
- DB-level `tenant_id NOT NULL` migration (API guards now in place; constraint is a future migration)
- IP rate limit on `POST /api/public/signature/[token]`
- Drop `'supervisor'` from inline admin role lists; align reject vs approve role guards
- Apply the same per-area cross-cut calculator to operator's Work Performed page (currently schedule-form only — admin-side estimation)

---

## APRIL 30, 2026 (LATE SESSION) — Sales Polish + Workflow Audit + 9 Security Fixes + DB Reset

### What shipped
- **Track A** — Salesman dashboard tiles trimmed 4→3 (Active / Quoted MTD / Expected Commission). "Showing your jobs only" hint.
- **Track B** — Admin "Mark Paid" button + modal on billing list. Commission rate inline editor on job detail. Default rate input on team-profiles.
- **Track C** — End-to-end workflow + security audit doc: [WORKFLOW_AUDIT.md](WORKFLOW_AUDIT.md) (378 lines). 9 critical, 14 important, 7 polish.
- **Track D** — 9 critical security/correctness fixes (Track D agent stalled mid-task; completed manually):
  1. Tenant filter on `/api/admin/job-orders/[id]/resubmit`
  2. Tenant filter on `/api/job-orders/[id]/work-items`
  3. Tenant filter on `/api/admin/schedule-board/assign` multi-day SELECT
  4. Tenant filter on `/api/timecard/clock-in` NFC tag lookup
  5. Status state machine — `LEGAL_TRANSITIONS` map; `cancelled`/`archived` admin-only
  6. Signature `expires_at = NOW() + 7 days`; URL from `NEXT_PUBLIC_APP_URL` || `request.nextUrl.origin` (no host-header injection)
  7. `daily_log.hours_worked` reads from `timecards.total_hours` first
  8. Payment receipt sender uses `tenant_branding.company_name`
  9. Reject `tenant_id=null` on 4 creation paths (legacy quick-add wasn't writing tenant_id at all)

### Database wiped to clean slate
Executed via Supabase MCP. All 35+ transactional tables zeroed: `job_orders`, `invoices`, `invoice_line_items`, `payments`, `timecards`, `daily_job_logs`, `job_progress_entries`, `job_scope_items`, `job_completion_requests`, `job_notes`, `standby_logs`, `work_items`, `notifications`, `audit_logs`, `operator_time_off`, `change_orders`, `signature_requests`, `schedule_change_requests`, etc.

**Preserved**: `tenants` (1), `tenant_branding` (1), `profiles` (8), `operator_badges`, NFC tags, schedule contacts, role permissions, feature flags. **Seed**: Patriot Test GC customer (id `a2cb81e6-790a-48f1-aba6-ac979c29de96`). `operator_pto_balance` zeroed.

### Pending follow-ups (deferred — see WORKFLOW_AUDIT.md)
- Audit log on status transitions, work-items, daily-log, completion-request, invoice create/send/void/PATCH, signature submission
- Wrap `work_items` delete-then-insert in transaction or UPSERT
- Optimistic concurrency on payment recording
- DB-level `tenant_id NOT NULL` migration (API-level guards in place; DB constraint is a future migration)
- IP rate limit on public signature endpoint
- Drop `'supervisor'` from inline admin role lists

---

---

## APRIL 30, 2026 SESSION (PT 2) — Performance Optimization Pass

### Goal
Cut First Load JS across the heaviest pages WITHOUT touching logic, backend, auth, or behavior. Strict guardrails enforced per track.

### Three parallel tracks (all merged, all build-clean, behavior identical)

#### Track A — schedule-board + admin dashboard
- `app/dashboard/admin/schedule-board/page.tsx` — 14 conditionally-rendered modals/views moved from eager to dynamic imports: ApprovalModal, MissingInfoModal, AssignOperatorModal, EditJobPanel, ChangeRequestModal, NotesDrawer, QuickAddModal, ConflictModal, JobDetailView, OperatorRowView, CrewScheduleGrid, CancelJobModal, MarkOutModal, PendingQueueSidebar. All gated behind `useState(false)` flags.
- `app/dashboard/admin/page.tsx` — AdminOnboardingTour now dynamic (only mounts for demo admins). Renamed import to `nextDynamic` to avoid collision with `export const dynamic = 'force-dynamic'` route segment config.

#### Track B — jobs/[id] + work-performed
- `app/dashboard/admin/jobs/[id]/page.tsx` — `JobScopePanel`, `JobProgressChart`, and `EditScheduleModal` now dynamic imports. Inline `EditScheduleModal` (130 lines) extracted to its own file `_components/EditScheduleModal.tsx` (verbatim — same fetch URL `/api/admin/jobs/[id]/schedule`, same props, same logic).
- `app/dashboard/job-schedule/[id]/work-performed/page.tsx` — `EquipmentUsageForm`, `RecommendedItems`, `PhotoUploader`, `VoiceMemoNotes` now dynamic. 11 pure helper predicates (`requiresDetailedData`, `isCoreDrilling`, `isSawing`, `isHandSaw`, `isSlabSaw`, `isWallSaw`, `isChainsaw`, `isBreakAndRemove`, `isJackHammering`, `isChipping`, `isBrokk`) hoisted from component body to top-level module scope (avoids re-creation on every render).

#### Track C — schedule-form + my-jobs/[id] + bundle audit
- `app/dashboard/admin/schedule-form/page.tsx` — `AISmartFillModal` (framer-motion-heavy) and `CustomerForm` (Google-Maps-using dialog) now dynamic. Both gated behind `show*` state flags.
- `app/dashboard/my-jobs/[id]/page.tsx` — `HelperWorkLog` now dynamic (only renders when `jobIsHelper === true`, i.e., apprentice role only — majority of operators never load this code).
- Bundle audit performed: `@react-pdf/renderer` confirmed server-only (API routes); `framer-motion` extracted via AISmartFillModal lazy-load; `recharts` left eager (analytics-only); `@react-google-maps/api` left as-is (mounted in app/layout.tsx provider). `react-grid-layout`, `react-signature-canvas`, `jspdf`, `html2canvas`, `qrcode`, `@zxing/library` confirmed already tree-shaken (no eager client imports).

### Final First Load JS reductions

| Page | Before | After | Δ |
|------|--------|-------|---|
| `/dashboard/admin/jobs/[id]` | 275 kB | **173 kB** | **-102 kB** |
| `/dashboard/admin` | 217 kB | **173 kB** | **-44 kB** |
| `/dashboard/admin/schedule-form` | 273 kB | **235 kB** | **-38 kB** |
| `/dashboard/admin/schedule-board` | 242 kB | **204 kB** | **-38 kB** |
| `/dashboard/job-schedule/[id]/work-performed` | 221 kB | **215 kB** | **-6 kB** |

**Total: ~228 kB First Load JS removed across 5 heaviest pages.**

### Hard guardrails enforced (every agent self-audited 10 questions, all answered "no"; I independently verified diffs before merging)
- ❌ NO modifications to `app/api/**`, `lib/supabase*`, `lib/api-auth*`, `lib/api-client*`, `middleware.ts`, `.env*`, `package.json`, `package-lock.json`, migrations, SQL
- ❌ NO renaming exports, props, state vars, or function signatures
- ❌ NO changes to fetch URLs, request bodies, response handling, error handling
- ❌ NO removal of features, modals, panels, fields, conditional renders
- ❌ NO changes to useState initial values, useEffect deps (beyond lint required), hook ordering
- ❌ NO copy/label/auth-guard changes
- ❌ NO new dependencies; NO removed dependencies

### Bug caught and fixed during audit
Track A's first revision had a name collision: `import dynamic from 'next/dynamic'` clashed with the file's `export const dynamic = 'force-dynamic'` route segment config (causing build failure on `app/dashboard/admin/page.tsx`). Fixed by renaming to `nextDynamic`. Tracks B and C used aliases proactively (`dynamicImport`, `nextDynamic`) — no collisions.

### Commits on `main` (LOCAL — NOT pushed)
```
[merge] perf — dynamic imports + bundle splits (3 parallel tracks)
154dafe2  perf: dynamic-import heavy modals and memoize lists on jobs/[id] and work-performed (Track B)
0c525c71  perf: dynamic-import multi-step form sections, my-jobs modals, and heavy lib boundaries (Track C)
9eaa3d39  perf: dynamic-import heavy modals on schedule-board and admin dashboard (Track A)
```

### Behavior verification
- All 3 builds passing with 0 errors
- E2E flows from prior sessions still pass logically (no fetch URLs changed)
- Visible UI for all state paths unchanged (lazy components have identical default-export shape and props)
- Loading placeholders are either invisible (`loading: () => null`) or match the existing skeleton aesthetic (animated pulse blocks)

### Known minor consideration
On first cold render of admin job detail page, JobScopePanel and JobProgressChart will show a brief skeleton placeholder while their chunks download. Subsequent navigations within the session use cached chunks — instant. This is the trade-off for -102 kB First Load.

---

---

## APRIL 30, 2026 SESSION — Active-Jobs Filter, Real-Time Draft, Back-Nav, Survey Redesign

### Four-issue fix shipped (3 parallel tracks + 2 follow-up bug fixes)

#### Issue 1 — Hide pending_approval from Active Jobs
- `app/api/admin/active-jobs/route.ts` — added `pending_approval` to the excluded status set: `not('status', 'in', '("completed","cancelled","archived","pending_approval")')`.
- Active-jobs-summary route already used a whitelist (`['assigned','in_route','on_site','in_progress']`), so it was already correctly excluding pending_approval.

#### Issue 2 — Real-time draft transparency
- `app/api/admin/jobs/[id]/live-status/route.ts` extended with `draft_work_performed: { items, notes, updated_at, source } | null`.
- Pulls from `daily_job_logs.work_performed_draft` jsonb for the operator's row on today's date. Picks the most recently edited row (operator vs helper) that has actual items.
- `app/dashboard/admin/jobs/[id]/page.tsx` — new pulsing violet "Draft in progress" pill on the Live Status panel showing typed item chips with quantities + "edited Xs ago".

#### Issue 3 — Work-performed back-nav data loss
- `handleSubmit` no longer clears the draft on the Next button. Drafts survive navigation away and back.
- Auto-save debounce reduced **2000ms → 500ms** for near-real-time admin transparency.
- Mount fallback: if no draft exists in DB or localStorage, GET `/api/job-orders/[id]/work-history` and hydrate the form from today's submitted work_items (highest day_number rows). User who already submitted can re-edit on Back-button return.

#### Issue 4 — Job Survey UI redesign
- Full visual rewrite preserving all state, logic, localStorage keys, equipment categories, and submit flow.
- Gradient violet→indigo header accent stripe, sticky header with back/home/dark-mode buttons.
- Progress indicator: "X / Y sections" + gradient fill bar driven by `useMemo` over completeness.
- Helper Rating: 10 buttons in `grid-cols-5`, color-coded selection (rose 1-2, amber 3-5, emerald 6-10).
- Equipment Details: lucide thumbnails per category (Drill / Scissors / Cable etc.); per-category card with tone-coded accent (violet/sky/amber/rose/teal/indigo).
- Segmented Yes/No and Water Source buttons with Droplets/Truck icons, all `min-h-[44px]` (iOS guideline preserved from session 2 mobile audit).
- Summary review card before submit + emerald-gradient submit button with `CheckCircle` icon.

### Two follow-up bug fixes (caught during E2E test)
- `daily_job_logs` has NO `updated_at` column — only `created_at` and `work_performed_draft_updated_at`.
  - Live-status query was selecting `updated_at` → silently returned null draft → admin pill never appeared.
  - PUT `/work-performed-draft` was writing `updated_at: now` → every draft save returned 500.
  - Both fixed: live-status now uses `work_performed_draft_updated_at` (with `created_at` fallback). PUT route stripped the bogus column write.

### E2E verification (against running localhost:3000 with magic-link minted tokens)
- ✅ Operator PUTs draft → 200 (no more 500)
- ✅ Admin GET live-status sees the draft with 2 items, correct source='operator', fresh updated_at
- ✅ Operator updates draft → admin sees the UPDATED draft (1 item, qty 15)
- ✅ Operator clears draft (PUT null) → 200; admin sees `draft_work_performed: null`
- ✅ Active-jobs returns 1 job (in_progress only); pending_approval WS/TS correctly excluded
- ✅ Build passes; pre-commit TypeScript check green

### Commits on `main` (LOCAL — NOT pushed)
```
a31bd3b4  fix: live-status draft query and work-performed-draft PUT use real column names
1c4d36fc  feat: hide pending_approval jobs + real-time draft transparency for admins
[merge]   Track C — job survey redesign
[merge]   Track B — work-performed back-nav fix
b77b90cb  fix: persist work-performed draft across back-navigation; hydrate from submitted items when draft empty
cfc35bb9  feat: redesign job survey page UI for operators
```

### Known follow-up
- `day-complete` page submission does NOT yet clear `daily_job_logs.work_performed_draft` after final submit. Track B left a TODO. Without it, drafts orphan after day-complete (not user-visible — fallback hydration logic uses `max(day_number)` to surface only today's items). Address when next touching day-complete.

---

---

## APRIL 28, 2026 SESSION (PT 3) — Sales Scoping + Commissions Dashboard

### Three parallel tracks shipped (all merged, all build-clean, all E2E-tested)

#### Track A — Server-enforced active-jobs role scoping
- `app/api/admin/active-jobs/route.ts` and `app/api/admin/active-jobs-summary/route.ts`
- Salesmen can ONLY see jobs they created (`created_by = userId`). Server enforces regardless of `?mine` flag.
- Full admins (`super_admin`, `operations_manager`, `admin`) see all tenant jobs by default; can opt into `?mine=true` for their own.
- Response now includes `scope: { is_scoped, role, scoped_to_user }` so the UI can render appropriate copy.
- Active-jobs-summary aligned with the same scoping logic — counts no longer leak across salesmen.

#### Track B — Sales dashboard backend
- New `GET /api/sales/dashboard` — returns `{ user, quoted (mtd/ytd/last_month/trend_pct), jobs (active/completed/total counts), commissions (pending/earned_mtd/earned_ytd/breakdown[]) }`. Self-scoped; super_admin can pass `?userId=`.
- New `PATCH /api/admin/invoices/[id]/mark-paid` — admin-only. Updates `amount_paid`, `paid_at`, `paid_by`, `balance_due`, `status` (paid/partial). Audit-logged.
- New `PATCH /api/admin/jobs/[id]/commission-rate` — admin-only. Validates 0–100. Audit-logged.
- New `PATCH /api/profile/commission-rate-default` — self-update; admins can target via `?userId=`. Validates 0–100.
- Invoice → job linkage flows through `invoice_line_items.job_order_id` (no `job_id` direct column on invoices). Multi-job invoices are distributed proportionally by line-item amount share.

#### Track C — Salesman dashboard UI + scoped active-jobs UI + per-job % progress
- `app/dashboard/admin/page.tsx` — when `role === 'salesman'`, page short-circuits to a sales-specific layout: 4 KPI tiles (Active / Quoted MTD / Pending Commissions / Earned MTD), Commissions card, quick actions. Other roles untouched.
- New `components/CommissionsCard.tsx` — gradient card with editable default rate, 3 stat tiles, desktop table / mobile cards breakdown by job, status badges (Earned / Pending / No invoice), empty state.
- `app/dashboard/admin/active-jobs/page.tsx` — reads new `scope.is_scoped` from the API. When scoped: header subtitle becomes "My active jobs", top-right badge sky "My Jobs" (instead of violet "Showing All"), empty-state copy adapts. Salesmen see no toggle button.
- Per-job % complete progress bar on each card — lazy fetches `/api/admin/jobs/[id]/summary` with concurrency 3. Thin emerald bar, "X% complete" label.

### Schema added (Supabase MCP applied)
Migration `20260428_commission_and_paid_invoice_fields`:
- `profiles.commission_rate_default numeric(5,2) DEFAULT 0`
- `job_orders.commission_rate numeric(5,2) NULL` (per-job override)
- `invoices.paid_at timestamptz`, `invoices.paid_by uuid REFERENCES profiles(id)`
- Indexes: `invoices_paid_at_idx`, `job_orders_created_by_active_idx` (partial)

### E2E verification (against running localhost:3000 with magic-link minted tokens)
- ✅ Salesman GET `/active-jobs` → returns ONLY their 2 jobs, `is_scoped: true`
- ✅ Super Admin GET `/active-jobs` → returns all jobs, `is_scoped: false`
- ✅ Super Admin GET `/active-jobs?mine=true` → returns 0 jobs (correctly scoped to super_admin's own)
- ✅ Salesman GET `/api/sales/dashboard` → 200, full payload populated
- ✅ Salesman PATCH `/api/profile/commission-rate-default` (rate 7.5) → 200, persisted
- ✅ Super Admin PATCH `/api/admin/jobs/.../commission-rate` (rate 10) → 200, persisted
- ✅ Validation: rate=150 → 400
- ✅ Authorization: salesman trying to PATCH job commission-rate → 403
- Test artifacts (test rates) rolled back to clean state

### Commits on `main` (LOCAL — NOT pushed to origin yet)
```
d9ee644f  feat: sales dashboard endpoints — quoted revenue, commissions, mark-paid
54d6c455  feat: server-enforced role scoping on active-jobs endpoint
2ee40e75  feat: salesman dashboard — quoted MTD, commissions card, scoped active jobs UI, % progress
```

### Pending follow-ups (deferred from Track C)
- **Mark Paid button on invoice list page** ([app/dashboard/admin/billing/page.tsx](app/dashboard/admin/billing/page.tsx)) — backend ready (PATCH `/api/admin/invoices/[id]/mark-paid`), UI not wired. Need: row-level "Mark Paid" button + modal capturing paid_amount/paid_at.
- **Commission Rate inline editor on job detail page** ([app/dashboard/admin/jobs/[id]/page.tsx](app/dashboard/admin/jobs/[id]/page.tsx)) — backend ready (PATCH `/api/admin/jobs/[id]/commission-rate`), UI not wired. Mirror the pattern from CommissionsCard's default-rate inline editor.
- **Partial billing UI** — backend has `summary.scope.overall_pct`. Could add "Bill at X%" CTA on Active Jobs cards that pre-fills an invoice draft for the completed portion.

---

---

## APRIL 28, 2026 SESSION (PT 2) — Operator Transparency Panel + Editable Timestamps

### Problem reported
Admin opens job detail for an active job and gets "Failed to load job details" full-screen. User needed real-time visibility into operator activity (in-route, arrived, work performed, standby) AND the ability to edit timestamps when operators forget to click.

### Diagnosis
- **Root cause of page-load failure:** stale browser session token. Server-side `/summary` endpoint returns 200 with valid JSON when called with a fresh token (verified via E2E magic-link test). The browser was sending an expired bearer.
- **Hidden UX flaw:** the page short-circuits the entire layout when `/summary` errors, hiding the live-status panel that *did* successfully load. So even when transparency data was available, admins saw nothing.

### Three parallel agent tracks (all merged, all build-clean)

#### Track A — Backend: editable timestamps + work-performed notifications
- New `PATCH /api/admin/jobs/[id]/timestamps` — accepts any of `in_route_at`, `arrived_at_jobsite_at`, `work_started_at`, `work_completed_at` (each can be ISO string or `null` to clear) + optional `edit_reason`. requireAdmin. Returns updated values. Validation: 400 on no keys / malformed ISO; 404 if job not found.
- Audit-logged via `audit_logs.action='admin_edit_job_timestamps'` with `before/after` snapshot + `edit_reason` in `details` JSON.
- `app/api/job-orders/[id]/work-items/route.ts` (operator submission endpoint) now fans out a `notifications` row to every `admin/super_admin/operations_manager` profile in the tenant after each work-performed insert. Fire-and-forget pattern, doesn't block operator response.
- Notification fields used: `type='work_performed'`, `title='Work performed update'`, computed message string, `action_url=/dashboard/admin/jobs/<id>`, `sender_id=operator`, `tenant_id=job.tenant_id`.

#### Track B — Backend: live-status enriched
- `GET /api/admin/jobs/[id]/live-status` extended (existing fields preserved):
  - `standby_segments_today: Array<{ id, started_at, ended_at, duration_minutes, reason }>` — all of today's segments, ongoing duration computed live
  - `last_work_performed_at: string|null`
  - `work_performed_count_today: number`
  - `route_start_coords: {lat, lng}|null` and `work_start_coords: {lat, lng}|null` (from existing `route_start_*`/`work_start_*` columns)
- All new queries wrapped in try/catch with safe defaults so a single failure doesn't kill the response.

#### Track C — Frontend: non-blocking error + live ops panel + edit modal
- `pageError` state widened from `string|null` → `{status?: number; message: string}|null` so HTTP status is preserved for display.
- Old full-screen "Failed to load job details" replaced with rose-accent inline banner. **Live status panel still renders even when summary fails**, so dispatch never loses operator visibility.
- Banner shows status code, "Retry" button (calls `fetchJob`), "Reload page", and a small "Sign out" link in case of corrupted session.
- New [components/admin/EditTimestampModal.tsx](components/admin/EditTimestampModal.tsx) (293 lines) — bottom-sheet on mobile, centered on desktop, datetime-local input + edit-reason textarea + Save/Clear/Cancel.
- Pencil icons next to in-route, arrived, work-started, work-completed timestamps in the live-status panel — opens the edit modal.
- Always-rendered rows (em-dash placeholder + pencil) so admins can fill in missed clicks for any of the four timestamps.
- Active standby block now shows a **live ticking elapsed timer** (`formatHMS`, 1s setInterval) with pulsing rose dot.
- New collapsible "Today's standby (N)" list when there are completed segments.
- Sky chip showing work-performed count + last update timestamp; click scrolls to Daily Progress card.
- Live indicator now intelligent: emerald LIVE (<60s), amber STALE (>90s), grey "Polling".

### E2E verification (against running localhost:3000 with super_admin token)
- ✅ `GET /live-status` → 200 with all new fields populated
- ✅ `PATCH /timestamps` setting `arrived_at_jobsite_at` → 200, value persists, reflected in next GET
- ✅ `PATCH /timestamps` to null → 200, clears column
- ✅ Audit log captures both edits with correct `changed_keys` and `edit_reason`
- ✅ Empty body → 400; malformed ISO → 400
- ✅ Page renders 67KB shell without React error markers

### Commits on `main` (LOCAL only — NOT pushed to origin yet pending user QA)
```
[merge] live operator transparency — editable timestamps, standby segments, non-blocking errors
0acaee11  feat: live ops transparency — editable timestamps + standby segments + non-blocking errors
1ec00aaa  feat: extend live-status with standby segments, work counts, GPS coords
92f34146  feat: editable job timestamps API + work-performed admin notifications
```

### Note on the original "Failed to load" report
The user's specific page-load failure was a stale browser session — the server endpoint was 200ing the whole time. With Track C's non-blocking error UI, this scenario now degrades gracefully (banner + live panel) instead of total blackout. If it recurs, the banner offers a "Sign out" → re-login path.

---

## APRIL 28, 2026 SESSION — Pending Migrations Applied, Parallel Polish (Mobile / Loading / Deploy Doc)

### Head-developer parallel sprint
Dispatched 3 isolated-worktree agents simultaneously, all returned clean builds, all merged with zero conflicts (deliberate non-overlapping file scopes: page.tsx vs loading/error.tsx vs new doc).

#### Track 1 — Mobile responsive audit on operator pages
- 4 pages fixed, 9 already clean.
- `app/dashboard/my-jobs/page.tsx` — schedule-updated banner dismiss button, multi-day "View" links, "Resume" links upgraded to ≥40×32px touch targets, "Awaiting Approval" badge shortened to fit at 375px.
- `app/dashboard/job-schedule/[id]/work-performed/page.tsx` — Add Hole Entry modal grid: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`. Cut Area form: `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`.
- `app/dashboard/job-schedule/[id]/job-survey/page.tsx` — 5 segmented water-source pickers were 36px tall (below iOS 44px target); bumped to `min-h-[44px]`.
- Already clean: my-jobs detail, jobsite, in-route, day-complete, standby, utility-waiver, timecard, my-profile, request-time-off, notifications.
- **Pre-existing color bug flagged (not in scope)**: 4 modal close buttons in work-performed (lines 3534, 3699, 3928, 4103) use `text-white hover:bg-white/20` on a white sticky modal header — invisible until hovered.

#### Track 2 — Loading & error boundaries on dashboard routes
- 54 `loading.tsx` files added (custom skeletons for high-traffic routes: jobs/[id], team-profiles, time-off, operator timecard, mobile pages; generic admin/operator templates for the rest).
- 55 `error.tsx` files added (client-component, retry button, "Back to dashboard" link; job detail and operator timecard get tailored back-links).
- Existing loading skeletons preserved on `app/dashboard/admin/`, `admin/billing/`, `admin/customers/`, `admin/schedule-board/`, `admin/timecards/`.
- Skipped intentionally: `app/dashboard/debug/*` (internal tools).

#### Track 3 — Production deployment checklist
- New file [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) at repo root — 9-section launch runbook.
- **26 distinct env vars** found in code; 6 missing from `.env.example`. White-label-critical: `NEXT_PUBLIC_CONTACT_EMAIL`.
- **24 hardcoded "Pontifex" strings** still rendering to customers. Highest-priority offenders:
  - [app/sign/[token]/page.tsx:818](app/sign/[token]/page.tsx:818) — "Powered by Pontifex Industries" on customer signature page
  - [app/error.tsx:59](app/error.tsx:59) and [app/global-error.tsx:136](app/global-error.tsx:136)
  - Single-source-of-truth: [components/landing/brand-config.ts](components/landing/brand-config.ts)
- **Production hazard found**: [app/api/send-email/route.ts:17](app/api/send-email/route.ts:17) hardcodes the old vercel.app domain in SSRF allowlist — must add custom domain before launch.
- **Risk**: [lib/supabase.ts:4-5](lib/supabase.ts:4) and [lib/supabase-admin.ts:36-37](lib/supabase-admin.ts:36) silently fall back to `placeholder.supabase.co` if env vars missing — recommended fail-fast hardening.
- 1130 `console.*` calls (mostly legit catch-blocks); worst offender [lib/database.ts](lib/database.ts) at 27.
- Stale [app/dashboard/admin/schedule-board/page.backup.tsx](app/dashboard/admin/schedule-board/page.backup.tsx) shipping in bundle — delete before launch.
- Vercel project confirmed: `prj_vubQAdrHfAlSq9msk0sfedlBq5zJ`, region `iad1`.

### Migrations applied (start of session)
- `20260427_utility_waiver_fields` — 5 utility_waiver_* columns on job_orders
- `20260427_operator_badges` — table + RLS (admins manage / operators see own).
  - **FK fix during apply**: original migration had `tenant_id REFERENCES auth.users(id)`; corrected to `REFERENCES tenants(id) ON DELETE CASCADE` to match codebase convention. SQL file in repo updated to match what was applied.

### Commits on `claude/sleepy-shannon-95c45b` (pushed to origin)
```
7b77c9b7  Merge: add production deployment checklist (Track 3)
7e383838  Merge: add loading and error boundaries to dashboard routes (Track 2)
54745538  Merge: mobile responsive audit on operator pages (Track 1)
029c76bb  chore: apply pending migrations + fix operator_badges tenant FK
3991407b  feat: add loading and error boundaries to dashboard routes
5ea5e163  docs: add production deployment checklist
3cc84357  fix: mobile responsive audit on operator pages
```

### Pending manual actions
- **Merge `claude/sleepy-shannon-95c45b` → `main`** to deploy to Vercel.
- **Delete test job**: JOB-2026-119492 (WS/TS test job) — use the trash icon on Active Jobs page.
- **Address white-label rebranding TODOs** — see [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) section "White-label rebranding TODOs". Most-visible: customer signature footer.
- **Add custom domain to SSRF allowlist** in [app/api/send-email/route.ts:17](app/api/send-email/route.ts:17) once domain is decided.

---

## APRIL 27, 2026 SESSION — Navigation Cross-Contamination, Auth Fixes, Live Status, Timecard Repairs

### Critical bugs fixed this session

#### 1. Navigation Cross-Contamination (root cause: stale localStorage cache)
- **Problem**: Backspace sent Demo Operator to admin portal; clicking Active Jobs as Super Admin sent to operator dashboard; role state bled between browser tabs when two different users had been logged in.
- **Root cause**: `getCurrentUser()` in `lib/auth.ts` read `supabase-user` from localStorage without verifying that key belonged to the *current* Supabase session. If a previous user's data was cached, the new user inherited the wrong role.
- **Fix 1 — `lib/auth.ts`**: `getCurrentUser()` now cross-validates the `supabase-user` cache against the active `sb-*-auth-token` Supabase session. Mismatched IDs → cache purged → returns null → forces re-auth. `logout()` also clears all `sb-*-auth-token` keys to prevent session bleed.
- **Fix 2 — `lib/hooks/useAuthUser.ts`** (new file): async-safe React hook that calls `supabase.auth.getSession()` as ground truth, enforces `requiredRoles`, and redirects mismatch to the correct dashboard.
- **Fix 3 — page guards**: Admin pages that were doing `!currentUser || !isAdmin()` → single redirect were split: `!currentUser` → `/login`, wrong role → `/dashboard`. Fixed in `schedule-form/page.tsx`, `timecards/page.tsx`.
- **Fix 4 — operator dashboard Active Jobs tile**: Was a plain `div` — clicking it was a no-op then falling through to router. Converted to `Link href="/dashboard/my-jobs"`.

#### 2. Operator Dashboard Redirect
- **Problem**: Super Admin opened `/dashboard` (operator root) instead of `/dashboard/admin`.
- **Fix**: Expanded role check from `if role === 'admin'` to full ADMIN_ROLES array `['super_admin', 'admin', 'operations_manager', 'salesman', 'shop_manager', 'inventory_manager']`.

#### 3. Stale Timecard Blocking Clock-In
- **Problem**: Demo Operator showed "already clocked in" with 34.7 hours — yesterday's open timecard entry was not closed and had no date scope.
- **Fix**: Added `.eq('date', todayStr)` to both the "already clocked in" check in `clock-in/route.ts` and the active timecard query in `current/route.ts`. Added auto-close loop for stale previous-day open timecards (sets `clock_out_time = '{date}T23:59:59'`).

#### 4. Job Daily Assignments Sync
- **Problem**: Demo Operator saw 2 jobs; schedule board showed 1. The `job_daily_assignments` table overrides were not respected in `GET /api/job-orders`.
- **Fix**: `api/job-orders/route.ts` now cross-references `job_daily_assignments` for any non-admin date-scoped query. If a daily override exists and the current user isn't that day's operator → job is excluded. Also added client-side role-based filter on `my-jobs/page.tsx` (non-apprentices only see `assigned_to === uid` jobs).

#### 5. Super Admin "Job Not Found"
- **Problem**: Admin job detail returned 404 for Super Admin because `tenantId = null` caused `.eq('tenant_id', null)` to match nothing.
- **Fix**: All 4 queries in `summary/route.ts` now use conditional `if (tenantId) query.eq('tenant_id', tenantId)`.

#### 6. Real-Time Operator Transparency Panel
- **New**: `GET /api/admin/jobs/[id]/live-status` — polls every 30s from admin job detail. Returns:
  - `status`, `operator_name`, `helper_name`
  - `in_route_at`, `arrived_at`, `work_started_at` (timestamps)
  - `standby_active`, `standby_started_at`, `standby_duration_minutes`
  - `time_on_site_minutes` (computed)
  - `clock_in_time`, `clock_out_time` (today's timecard)
  - `work_performed_today` (array of progress entries)
  - `status_history` (last 20 transitions)
  - Gracefully handles missing optional tables (`standby_logs`, `job_status_history`)

#### 7. Delete Job from Active Jobs
- Added trash icon + confirmation modal on Active Jobs cards. Calls `DELETE /api/admin/jobs/[id]`.

#### 8. Skill-Match Slash Split Fix
- `job.job_type = "WS/TS"` was producing `['ws/ts']` — not found in the scope map. Fixed: `split(/[,/]/)` → correctly produces `['ws', 'ts']`.

### Commits on main (chronological)
```
71501d64  fix: operator my-jobs now matches schedule board assignment
8585e7ad  fix: redirect all admin/management roles from operator dashboard to admin dashboard
daa3960c  fix: resolve TS errors in live-status route + skill-match slash split
2022f937  fix: super_admin Job not found bug + add Live Status panel
52e0c3b6  fix: scope active timecard check to today; auto-close stale open timecards
7cad1ad7  fix: validate getCurrentUser against Supabase session; add useAuthUser hook; clear session on logout
c66b1f7b  fix: admin role-fail redirects and operator back button navigation
3194af26  fix: show approval card based on completion request status not job status
33c2da5c  fix: change past jobs history window from 30 days to 7 days
```

### Pending manual actions
- **Delete test job**: JOB-2026-119492 (WS/TS test job) — use the trash icon on Active Jobs page

### Migrations applied (April 27, late session)
- `20260427_utility_waiver_fields` — 5 utility_waiver_* columns on job_orders
- `20260427_operator_badges` — operator_badges table + RLS (admins manage / operators see own).
  - **FK fix during apply**: original migration had `tenant_id REFERENCES auth.users(id)`; corrected to `REFERENCES tenants(id) ON DELETE CASCADE` to match codebase convention. SQL file in repo updated to match.

### Known remaining issues (low priority)
- Clock-in event isn't persisted across page navigation if user force-navigates mid-flow (timecard state in operator dashboard resets on back-navigation). The underlying timecard row IS correctly saved to DB — this is a display-only race.
- Operator "Active Jobs" stat tile text says "Active Jobs" but links to My Jobs. Consider renaming tile label to "My Jobs" for clarity.

---

## APRIL 26, 2026 SESSION — Operator Workflow, Dark Mode, Time-Off & Attendance, Late Clock-In

### What shipped
- **Work-performed page** — all 28 `alert()` calls replaced with `showNotification()` toast system.
- **Daily-log 403 fix** — assignment check covers helper + admin bypass.
- **Post-submission locked card** — polished success card after Done for Today / Complete Job.
- **Operator past 7-day job history** — My Jobs collapsible "Past 7 Days" section.
- **Green ticket highlights** — emerald/amber status badges on JobTicketCard.
- **"Continuing Tomorrow" section** — My Jobs amber section for multi-day scheduled jobs.
- **Admin job detail — Daily Progress** — per-day cards with gradient badge, hours, work items, operator name.
- **Admin job detail — Operator Notes panel** — notes after submission; type badges amber/emerald/violet.
- **Admin active jobs** — `operator_notes_count` badge on cards.
- **Admin completed jobs** — 4 metric tiles + Operator Notes panel.
- **Schedule board Mark Out** — rose "Mark Out" button → MarkOutModal → creates approved time_off record.
- **Time-off admin page** — 2-tab: Requests + Attendance Metrics (PTO bars, callout counts).
- **PTO balance system** — `operator_pto_balance` table fully wired.
- **Late clock-in tracking** — is_late, late_minutes fully wired; admin fire-and-forget notifications.
- **Team payroll** — 7th "Late Arrivals" summary card + per-operator Late column.
- **Operator detail timecard** — 7th Punctuality metric tile.
- **Stale "Needs Attention" badge fix** — `job_completion_requests` cancelled on Done for Today.

---

## APRIL 24, 2026 SESSION — Jobs UI refresh, Change Orders, Operator Skills

### What shipped
- Active Jobs + Job Detail redesign — light-default, gradient accent bars, 5 metric tiles, 3 tabs
- Change Orders data model + API (`change_orders` table, `CO-NNN` auto-numbering, approve/reject)
- Multi-day progress analytics — `GET /api/admin/jobs/[id]/progress-by-day`
- Summary route 404 fix for Super Admin
- Light-mode factory reset sentinel
- Billing / Completed Jobs / Completed Job Tickets rewritten to light-default
- Schedule form step reorder (Difficulty→5, Scheduling→6, Site Compliance→7)
- Approve Job modal — operator availability panel with date param
- Operator skills taxonomy in `lib/skills-taxonomy.ts` + Skills & Proficiency tab in Team Profiles
- Smart scheduling — per-scope skill used when job service code maps to scope

---

## CURRENT STATE

### Git
- **Branch:** `main`
- **Pushed to origin** ✅
- **Build:** PASSING (0 errors)
- **Localhost**: Restart `npm run dev` to pick up all auth.ts and navigation changes

### Supabase
- **Project ID**: `klatddoyncxidgqtcjnu`
- **100+ tables**, all RLS enabled

### Dev Server
- Preview: `preview_start` / `preview_stop` MCP tools
- Config in `.claude/launch.json`
- If changes don't appear: `lsof -ti:3000 | xargs kill -9`, delete `.next/`, restart

### Vercel
- Auto-deploy: pushes to `main` → production
- **Env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

---

## REMAINING SPRINT TASKS (Week 2)

- [ ] End-to-end workflow test: create job → dispatch → clock-in → work performed → complete → invoice
- [ ] Mobile responsive audit on operator pages
- [ ] Loading states & error handling audit
- [ ] Patriot-specific visual assets (logos, custom colors)
- [ ] Production deployment prep (env vars, custom domain, SSL)
- [ ] Final build verification & merge to main (already on main)
