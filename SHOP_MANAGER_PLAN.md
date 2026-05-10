# Shop Manager + Shop Help — Build Plan

**Owner:** Pontifex Platform
**Status:** Phase 0, 1A, 1B all SHIPPED to feature branch (NOT main). Phase 2 starts when user signals.
**Driven by:** May 5, 2026 user request. Research from two parallel agents (fleet management UX and maintenance workflow patterns).

This is a substantial new module. The goal of this doc is to make sure we build it right the first time — solid schema, solid UX patterns, no regressions on the trial customer's existing experience. Read end-to-end before any code change touches any of this.

---

## Phase C — Refinements after on-site usage (May 10, 2026)

After Phase B(i) shipped to prod and the shop manager started using it, user fed back five precise refinements. Two are tiny (shipped this session); three are full sub-phases (queued).

### C(i) — SHIPPED May 10
- **Bug fix**: shop_manager hit `Forbidden. Sales staff access required` on the dashboard because the schedule-board API was gated by `requireSalesStaff` which excluded shop_manager. New `requireScheduleViewer` guard (SALES_STAFF + shop_manager) wraps `/api/admin/schedule-board`, `/api/admin/active-jobs`, `/api/admin/active-jobs-summary`. **Read-only — write routes (schedule-form POST, job-orders PATCH, etc.) keep stricter guards.**
- **shop_manager sidebar gains Schedule Board + Active Jobs** (read-only access). Hidden the "+ New Job" header button for shop_manager + shop_help since they can't create jobs.
- **Equipment storage location → dropdown** with two option groups: `🏭 Shop` or `🚚 <truck display> · <operator first name>`. Applied to both the New Equipment form and the edit modal. Trucks loaded once via `/api/admin/equipment?kind=vehicle`. Reason: free-text was creeping into noise like "shelf 3", "Carlos's truck", etc. — dropdown forces "shop or specific truck" so smart-location stays meaningful.

### C(ii) — Voice-driven Inventory Control + truck-as-custodian (next session)
User wants checkout to be voice-first. Current page asks for **operator**; should ask for **truck number** instead since trucks are persistently assigned to operators.

Scope:
- Replace operator picker in Checkout tab with truck picker (vehicles dropdown).
- Equipment dropdown → searchable combobox (current is plain `<select>` — gets unwieldy at 200 items).
- Voice button on Checkout + Check-In tabs. Phone listens, transcribes via `SpeechRecognition` API, parses against `equipment.aliases` (already auto-seeded from May 8 work).
- Confidence-tier confirm: ≥85% auto-save to tray, 60-85% show top-3 picker, <60% free-text.
- Audio recording uploaded to `equipment_checkouts.voice_note_url` for audit replay.
- Learning loop: `voice_recognition_corrections` table (schema in earlier section of this plan). After 3 successful matches of the same spoken phrase, prompt shop_manager to add as a permanent alias.

**Agent plan**: `supabase-migration-author` for `voice_recognition_corrections`. General-purpose for the page rebuild. `mobile-responsive-auditor` post-build (mic button needs ≥44px tap target on mobile).

### C(iii) — Fleet maintenance history + oil/filter change tracking (next session)
User wants Fleet detail to show service history (oil changes, filter changes, repairs) with timestamps + meters + costs.

Scope:
- New `vehicle_service_records` table — date, type (oil_change / filter / brake / tire / other), odometer_at_service, cost, vendor, notes, performed_by.
- "Add Service Record" button on `/dashboard/admin/fleet/[id]` with date, type, odometer, cost, notes.
- History panel shows records DESC + next-service-due ribbon (oil every 5000mi, etc.).
- Tie in: when a `maintenance_request` is marked `done` on a vehicle, auto-create a `vehicle_service_records` row referencing it.

**Agent plan**: `supabase-migration-author` for the table + RLS. `rls-policy-auditor` review before merge. General-purpose for the UI panel.

### C(iv) — Operator/Helper Maintenance Request card + form (next session)
The "Report Equipment Issue" card on operator dashboard already links to `/dashboard/maintenance/new` but the page is a Phase 2 placeholder. Time to build it.

Scope:
- 3-tap mobile-first form (per the research from May 4 session):
  - Step 1: Pick equipment (or auto-detect from current clocked-in job)
  - Step 2: Voice memo OR photo OR free text — "what's wrong"
  - Step 3: Priority chips (low / med / high / critical) + submit
- POST writes a `maintenance_requests` row tagged with `submitted_by = auth.uid()`, `equipment_id`, `description`, `voice_note_url`, `priority`, `status='open'`.
- Maintenance Inbox already exists as a placeholder sidebar item — Phase 2 builds the triage UI: tabs Inbox / Active / Closed, status transitions, photo gallery, voice playback.

Plus expose the same form on the shop_help dashboard (they can also file issues, not just respond to them).

**Agent plan**: `supabase-migration-author` for `maintenance_requests` table (already designed in this plan). `rls-policy-auditor` for the operator-scoped RLS. General-purpose × 2 in parallel (submit form + inbox UI). `mobile-responsive-auditor` post-build.

### C(v) — Visit-wizard equipment-issues conversion hook (parallel with C(iv))
The visit wizard already captures equipment issues into `supervisor_visits.equipment_issues` jsonb (Phase 0, May 3). Once `maintenance_requests` table exists in C(iv), a hook converts each open issue → real maintenance request row.

Scope:
- Postgres trigger OR API-side conversion on POST/PATCH of `supervisor_visits`.
- For `action='maintenance'` → insert into `maintenance_requests` with `submitted_by = supervisor_id`, `description = whats_wrong`, original visit referenced.
- For `action='replace'` → create a `shop_tasks` row (Phase 4 of original plan — table not yet built; defer until shop_tasks lands).
- Flip the visit issue's `status` from `'open'` to `'converted'`.

**Agent plan**: `supabase-migration-author` writes the trigger. `rls-policy-auditor` confirms it doesn't bypass row-level security.

---

## Phase 0 — SHIPPED (May 5, 2026)

**Supervisor visit form converted to a 3-step wizard with equipment-issue capture as a placeholder bridge to the future shop manager system.**

- Migration: `supervisor_visits.equipment_issues jsonb DEFAULT '[]'::jsonb` — applied.
- Wizard steps: (1) Visit Details (operator + date + job + times), (2) What You Saw (observations + issues + ratings + follow-up), (3) Equipment Issues (toggle + dynamic rows).
- Each equipment issue captures: `equipment_name` (free-text for now), `whats_wrong`, `action: 'maintenance' | 'replace'`, `photo_urls`, `status: 'open'`.
- API POST handler validates + persists. Sticky bottom action bar for mobile (Back / Continue / Submit Report).
- All steps mobile-responsive at 375px. 44×44 tap targets throughout.

**Phase 2 will add a hook**: when the shop manager system has equipment + a maintenance_requests table, an upsert hook converts each visit's equipment_issues entries into real `maintenance_requests` (action='maintenance') or `shop_tasks` (action='replace') and flips the entry's `status` to `'converted'`. That data is held safely until then — no data loss.

---

## What we're building (summary)

Two new roles, two new dashboards, four new feature areas:

| Role | Day-to-day | Dashboard |
|---|---|---|
| **Shop Manager** | Owns equipment + vehicles. Triages maintenance requests. Assigns shop help. Confirms equipment ready for tomorrow's jobs. | Today's job equipment readiness, maintenance inbox, fleet health, inventory low-stock |
| **Shop Help** | Like a team member. Clocks in/out, files time-off, but also receives equipment prep tasks from Shop Manager (pre-use checks, fixes, deliveries). | Their schedule + assigned tasks |

Four feature areas:

1. **Equipment Inventory** — every saw, drill, generator we own as an addressable unit with a QR code, status, and current custodian
2. **Fleet (vehicles)** — same model as equipment, with vehicle-specific fields (VIN, plate, registration)
3. **Maintenance Requests** — operator submits "this saw is broken" → shop manager triages → shop help fixes → closed
4. **Equipment Checkout** — when an operator goes to a job, "check out" the specific saws/drills they take. Voice-driven for speed.

---

## Research distilled

Two research agents analyzed Hilti On!Track, Samsara Fleet, Fleetio, EZOfficeInventory, plus CMMS systems (UpKeep, Limble, MaintainX) and DOT pre-trip inspection patterns. Full transcripts in CLAUDE_HANDOFF, but the headline findings:

### Steal from EZOfficeInventory
**QR-driven mobile checkout/checkin.** Every asset gets a QR sticker. Operator scans → picks job → done in 3 taps. Asset's `current_custodian` and `status` flip transactionally. This is the #1 thing to copy.

### Steal from Fleetio
**Service Reminders dashboard as the homepage.** "What needs service this week" is the daily morning view. Hybrid time/meter-based intervals with lead time. Issues → Work Order is one-click promotion.

### Steal from Samsara DVIR
**Pre-use inspection blocks dispatch on critical fail.** Inspection lives on the asset, runs before each shift, fails on critical items auto-create maintenance requests, schedule board renders a readiness chip per job that goes red if any assigned equipment failed inspection.

### Steal from MaintainX
**3-tap maintenance request submission.** Camera-first flow (default action = take photo). Voice memo with auto-transcription. Big tap targets for gloved hands. Don't gate submission on photos.

### Anti-patterns to avoid
- Don't build telematics integration. We have no GPS hardware on equipment. Manual hour-meter entry is fine for ~100 units.
- Don't build a separate parts inventory module on day 1. Track parts as free-text line items on work orders.
- Don't lock to vendor-specific QR systems (like Hilti's labels). Generate standard QR codes printable on any sticker stock.
- Don't over-configure custom fields. Ship opinionated schemas; add fields only when a real customer asks twice.
- Don't separate "request" and "work order" into two screens for the operator. One submission. The split is internal to the shop.
- Don't notify on every comment or status nudge. Only on assignment + resolution.

---

## Database schema (designed once, applied across phases)

Six tables. Idempotent migrations, RLS via the project's SECURITY DEFINER helpers (per CLAUDE.md). Tenant-scoped throughout.

### `equipment`
The central asset table. Every saw, drill, generator. Vehicles use this table too with `kind = 'vehicle'`.

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL
asset_tag text UNIQUE                  -- printed on the QR sticker, e.g. "PTRT-0042"
kind text NOT NULL CHECK (kind IN ('powered','hand_tool','accessory','vehicle','trailer'))
category text                          -- specific class: 'slab_saw', 'core_drill', 'wall_saw', 'wire_saw', 'generator', 'compressor', 'dolly', 'chain', 'hose', etc. — drives schedule-form filtering
name text NOT NULL                     -- "Husqvarna FS5000"
short_name text                        -- "FS5000" — shown in compact lists
unit_number text                       -- "5" or "12" — what operators say; system displays as "FS5000 #5"
aliases jsonb NOT NULL DEFAULT '[]'::jsonb   -- voice-matchable alternative names ["5000 slab saw", "Husq 5000", "DFS-5"]; auto-seeded from asset_tag + short_name; user-extensible; auto-extended by voice_recognition_corrections after 3+ matches
make text
model text
serial_number text
power_source text CHECK (power_source IS NULL OR power_source IN ('diesel','gas','hydraulic','electric','pneumatic'))
requires_maintenance_schedule boolean NOT NULL DEFAULT false
reserved_for_job_id uuid REFERENCES public.job_orders(id) ON DELETE SET NULL
reserved_until timestamptz             -- auto-release reservation after this time if not checked out
status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','in_use','pending_putaway','in_maintenance','out_of_service','retired'))
current_custodian_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
current_job_order_id uuid REFERENCES public.job_orders(id) ON DELETE SET NULL
home_location text                     -- "Main Shop", "Truck #3"
hour_meter numeric DEFAULT 0           -- self-reported hours; used for hour-based PMs
photo_url text
notes text
purchase_date date
purchase_cost numeric
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
```

### `vehicles` (extends equipment 1:1)
Vehicle-specific fields. One-to-one with `equipment` rows where `kind='vehicle'`.

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
equipment_id uuid REFERENCES public.equipment(id) ON DELETE CASCADE UNIQUE NOT NULL
tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL
vin text
license_plate text
year int
fuel_type text                         -- diesel, gasoline, electric
odometer numeric DEFAULT 0
registration_expiry date
insurance_expiry date
inspection_expiry date
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
```

### `equipment_checkouts` (transactional history)
Every checkout/checkin is a row. Source of truth for "where is this saw?" and "what did this operator take to that job?"

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL
equipment_id uuid REFERENCES public.equipment(id) ON DELETE CASCADE NOT NULL
custodian_id uuid REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL
job_order_id uuid REFERENCES public.job_orders(id) ON DELETE SET NULL
truck_equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL  -- which truck it's on
checked_out_at timestamptz NOT NULL DEFAULT now()
checked_out_by uuid REFERENCES auth.users(id) ON DELETE SET NULL  -- who did the checkout (shop mgr)
checked_in_at timestamptz
checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
hour_meter_out numeric
hour_meter_in numeric
notes text
voice_note_url text                    -- voice-driven checkout transcript audio
created_at timestamptz DEFAULT now()
```

### `maintenance_requests`
Operator-submitted. Triaged by shop manager. Worked by shop help / shop manager.

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL
equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL
submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL
title text NOT NULL                    -- "Generator won't start"
description text
voice_note_url text                    -- audio file, optional
priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical'))
status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','assigned','in_progress','blocked','done','verified','cancelled'))
assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL
triaged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
triaged_at timestamptz
resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
resolved_at timestamptz
resolution_notes text
parts_cost numeric DEFAULT 0
labor_cost numeric DEFAULT 0
photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
```

### `maintenance_schedules`
Recurring service rules per equipment unit (oil change every 100 hours, registration renewal annually, etc.).

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL
equipment_id uuid REFERENCES public.equipment(id) ON DELETE CASCADE NOT NULL
task_description text NOT NULL         -- "Oil change"
interval_type text NOT NULL CHECK (interval_type IN ('time','hours','miles'))
interval_value int NOT NULL            -- 90 (days), 100 (hours), 5000 (miles)
lead_time_days int DEFAULT 7           -- start warning N days before due
last_completed_at timestamptz
last_completed_meter numeric           -- hours/miles at last completion
next_due_at timestamptz                -- precomputed for reminder dashboard
next_due_meter numeric
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
```

### `voice_recognition_corrections` (the learning loop)

Every time a user speaks something the system has to disambiguate or correct, we log the spoken phrase → resolved equipment mapping. Over time the matcher gets faster + more accurate without anyone re-typing aliases.

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL
spoken_text text NOT NULL              -- raw transcript: "DFS number 5"
normalized text NOT NULL               -- lowercase, punct stripped: "dfs number 5"
resolved_equipment_id uuid REFERENCES public.equipment(id) ON DELETE CASCADE NOT NULL
confidence numeric                     -- 0-1; how confident was the match
was_corrected boolean NOT NULL DEFAULT false  -- true if user corrected the auto-match
created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
created_at timestamptz DEFAULT now()
```

Indexes: `(tenant_id, normalized)` for lookup. Optional FTS index on `normalized`.

Phase 3 voice flow uses this in two ways:
- **Read path**: when matching a transcript, query `voice_recognition_corrections` where `tenant_id=...` AND `normalized` matches via fuzzy/trigram similarity. Direct hit → high confidence, skip equipment table search.
- **Write path**: every successful checkout (auto-confirmed OR user-corrected) inserts a row. The `aliases` column on `equipment` can also auto-extend after N successful matches of the same phrase (with user permission, opt-in).

### `shop_tasks`
Things shop manager assigns to shop help. Pre-use checks, deliveries, "go pick up X from vendor", etc.

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL
title text NOT NULL                    -- "Pre-use check Generator #3 for tomorrow"
description text
assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL
assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL
due_date date
related_equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL
related_job_order_id uuid REFERENCES public.job_orders(id) ON DELETE SET NULL
related_maintenance_request_id uuid REFERENCES public.maintenance_requests(id) ON DELETE SET NULL
checklist jsonb NOT NULL DEFAULT '[]'::jsonb   -- [{label, critical, checked, photo_url, note, failed_reason}]
status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','blocked','cancelled'))
completed_at timestamptz
completion_notes text
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
```

### RLS pattern (consistent across all six)

- **Operators**: read own checkouts, read maintenance_requests they submitted OR are assigned to, read shop_tasks they're assigned. Insert maintenance_requests.
- **Shop Help**: same as operators + read all shop_tasks in tenant + update shop_tasks they're assigned + read all equipment + insert maintenance_requests.
- **Shop Manager**: full read/write on all six tables within their tenant.
- **Admin / Super Admin / Operations Manager**: full access.
- **Salesman / Supervisor**: read equipment status (so the schedule form can show "available slab saws"), read fleet (so supervisor can know what trucks exist), no write.

Use `public.current_user_has_role(...)` and `public.current_user_tenant_id()` everywhere — never `user_metadata`.

---

## Page structure

### Shop Manager dashboard `/dashboard/admin` (when role=shop_manager)
Vibrant gradient KPIs at top, action-oriented tabs below. Mobile-first.

- **Header gradient hero**: "Welcome back, [name]" + today's date.
- **Clock-in widget**: same component supervisor uses, hourly clock-in.
- **4 KPI tiles** (the operator/supervisor pattern):
  - **Maintenance Inbox** — count of `maintenance_requests` where status in (open, triaged) — links to `/admin/maintenance`
  - **Tomorrow's Equipment** — count of equipment scheduled for tomorrow's jobs that hasn't been pre-checked — links to `/admin/yard`
  - **Service Due** — count of maintenance schedules where `next_due_at <= now() + lead_time` — links to `/admin/equipment?filter=service_due`
  - **Vehicles Out of Service** — count of equipment where `kind='vehicle'` and `status='out_of_service'` — links to `/admin/fleet`
- **Today's Job Equipment Readiness** — table per scheduled job, equipment list, readiness chip (green = pre-checked, amber = pending, red = failed)
- **Recent Maintenance Requests** — last 5, click into request detail
- **Quick Actions**: New Equipment, New Vehicle, Assign Shop Task, View Inventory

### Shop Manager pages (sidebar items, gated by role)

| Page | Path | Purpose |
|---|---|---|
| Equipment Inventory | `/admin/equipment` | All equipment grid, filterable by kind/status/category. Click → detail. |
| Equipment Detail | `/admin/equipment/[id]` | Full record + maintenance history + checkouts + work orders + QR sticker print |
| Fleet | `/admin/fleet` | Vehicles only, filtered view of equipment with `kind='vehicle'`. Vehicle-specific fields visible. |
| Vehicle Detail | `/admin/fleet/[id]` | Vehicle record + maintenance schedule + odometer log + registration/insurance |
| Maintenance Inbox | `/admin/maintenance` | Triage queue (Inbox / Active / Closed tabs) |
| Maintenance Detail | `/admin/maintenance/[id]` | Full request + photos + voice + status history + parts/cost |
| Yard Readiness | `/admin/yard` | Tomorrow's equipment, pre-use checks pending |
| Schedule Board | `/admin/schedule-board` | Same as admin's schedule board but with equipment readiness chips per job |
| Schedule (theirs) | `/admin/my-schedule` | Their assigned tasks, time-off, hours |

### Shop Help pages (subset — they're effectively a team member with a task list)

| Page | Path | Purpose |
|---|---|---|
| Dashboard | `/dashboard` | Operator-style: clock-in widget, today's tasks list, request time-off |
| Tasks | `/dashboard/my-jobs` (reused) | Tasks assigned to them — pre-use checks, deliveries, equipment fixes |
| Task Detail | `/dashboard/my-jobs/[taskId]` (reused) | Run through the checklist, photo on fail, sign off |
| Request Time Off | `/dashboard/request-time-off` (existing) | Same as operator |
| Maintenance Request Form | `/dashboard/maintenance/new` | Submit a maintenance request (same form as operator) |

### Operator-side additions (existing operators get these)

| Where | What |
|---|---|
| Operator dashboard | "Report Issue" button (wrench icon) — opens maintenance request form |
| `/dashboard/maintenance/new` | The 3-tap mobile-first request form |
| Job detail page | "Equipment Issue?" link near the equipment list — pre-fills equipment_id |

### Schedule Form integration (existing form, smarter equipment picker)

Currently the schedule form has free-text equipment fields. After Phase 2, when shop manager has populated inventory:

- Equipment selector reads from `equipment` filtered by `category` matching service type (e.g. DFS service → show available slab saws)
- Shows availability per unit: green chip "Available" / amber "In use on JOB-XXX" / red "Out of service"
- If user picks a specific unit, the schedule form pre-creates an `equipment_checkouts` row when the job is approved (held in pending state until day-of)

---

## Maintenance request flow (state machine)

```
        ┌──────────────────────┐
        │  Operator submits    │
        │  /maintenance/new    │
        │  (3 taps + voice)    │
        └──────────┬───────────┘
                   │
                   ▼
              ┌─────────┐
              │  open   │  ← shop manager Inbox tab
              └────┬────┘
                   │ shop manager triages (sets priority, optionally assigns)
                   ▼
       ┌──────────────────────┐
       │  triaged             │  ← still in Inbox, but seen
       └──────────┬───────────┘
                  │ shop manager assigns to shop help / themselves
                  ▼
            ┌──────────┐
            │ assigned │  ← Active tab
            └─────┬────┘
                  │ assignee starts work
                  ▼
        ┌─────────────────┐
        │  in_progress    │  ← Active tab
        └────────┬────────┘
                 │
       ┌─────────┼──────────────┐
       │         │              │
       ▼         ▼              ▼
   ┌─────┐  ┌─────────┐  ┌──────────┐
   │ done│  │ blocked │  │cancelled │
   └──┬──┘  └────┬────┘  └──────────┘
      │          │ resolved by ops
      │          ▼
      │     ┌─────────────┐
      │     │ in_progress │
      │     └─────────────┘
      │
      │ shop manager verifies
      ▼
  ┌────────┐
  │verified│  ← Closed tab
  └────────┘
```

Transition guards (RLS or API-side):
- Operator can: `open → cancelled` (own), nothing else
- Shop help can: `assigned → in_progress`, `in_progress → blocked`, `in_progress → done` (when assigned)
- Shop manager can: any transition within tenant
- Admin / super_admin / operations_manager: any

Notifications:
- `open`: in-app to all shop_managers in tenant. Email digest if more than 5 open.
- `assigned`: in-app + push to assignee.
- `done`: in-app to submitter + shop_manager.
- `verified`: in-app to submitter only.

No notification on every comment. No SMS unless priority=critical.

---

## Equipment checkout flow

### Manual flow (Phase 2)
- Shop manager / supervisor / admin opens `/admin/equipment` or scans QR on mobile.
- Picks operator + job from autocomplete.
- Optionally picks truck equipment.
- Submits → `equipment_checkouts` row inserted, `equipment.status = 'in_use'`, `current_custodian_id` set, `current_job_order_id` set.

### Voice flow (Phase 3, layered on top — designed for speed)

**The reality**: shop manager + supervisor is moving fast, often without looking at the screen. They speak as they walk past gear. The system has to be tolerant: hear it, infer it, save it, let them keep going.

**Sequence per checkout** (configurable order, this is the default):
1. Equipment name (with aliases) — "5000 slab saw number 2" or "DFS-5" or "Husqvarna FS5000 #2"
2. Item number — "PTRT-0042" (optional if equipment name uniquely resolves)
3. Truck OR operator — "truck 3" or "going with Carlos"

**Design**:
- Tap mic. Speak in any order. Tap mic again to add another piece (no need to confirm between items — they queue up as draft checkouts).
- Browser `SpeechRecognition` API transcribes inline. Each transcript hits the parser:
  1. Look up in `voice_recognition_corrections` (fuzzy match on `normalized` text). If high-confidence hit → use the cached `resolved_equipment_id`.
  2. Else search `equipment.aliases` jsonb (case-insensitive contains).
  3. Else search `equipment.short_name` + `equipment.name` with trigram/Levenshtein similarity (Postgres `pg_trgm` extension — already enabled).
  4. Disambiguate operator/truck the same way against profiles + vehicles.
- Each parsed checkout becomes a draft row in a "Pending Confirmation" tray (top of page). The supervisor can keep speaking; the tray fills up.
- When they're done (or before leaving), they review the tray:
  - Green check on each row that auto-resolved with high confidence
  - Amber warning on rows where confidence < threshold — show top 3 suggestions, one tap to pick
  - Red on rows where nothing matched — show free-text edit
- Tap "Confirm All" → all drafts become real `equipment_checkouts` rows.

**Learning loop**:
- Every confirmed row writes to `voice_recognition_corrections` with the original spoken phrase, the resolved equipment, and a `was_corrected` flag (true if the user picked something other than the top suggestion).
- After N (e.g. 3) successful matches of the same normalized phrase, prompt the shop manager: "Want to add 'DFS-5' as an alias for Husqvarna FS5000 #5?" — one-tap confirm extends `equipment.aliases`.
- Audio recording is stored on the checkout row (`equipment_checkouts.voice_note_url`) for audit when something goes wrong.

**Failure modes**:
- Parser confidence too low → row goes to amber state in the tray, supervisor picks from top 3.
- Background noise / no speech detected → friendly nudge, retry.
- No browser SpeechRecognition (rare on iOS Safari without HTTPS in dev) → graceful fallback to manual selectors with autocomplete.

**Offline support (Phase 3.5, optional)**:
- Queue draft checkouts in IndexedDB when offline. Sync on reconnect.

**Permissions**: voice checkout permission is toggleable per role. Defaults: shop_manager + supervisor + admin can use it. Ops_manager + super_admin always. Everyone else off.

This is achievable in Phase 3, after manual checkout (Phase 2) ships. Voice is enhancement, not foundation — but it's a real productivity win once the inventory exists.

---

## Pre-use inspection flow

### Templates
Stored as JSONB on `maintenance_schedules` rows OR on a new `equipment_inspection_templates` table (defer). For Phase 1, just embed checklists in `shop_tasks.checklist` JSONB.

Example checklist for a generator:
```json
[
  { "label": "Oil level", "critical": true },
  { "label": "Coolant", "critical": true },
  { "label": "Fuel level", "critical": false },
  { "label": "Tires (visible damage)", "critical": true },
  { "label": "Tail lights working", "critical": true },
  { "label": "Trailer tongue + safety chains", "critical": true }
]
```

### Schedule integration (Phase 3)
Cron job nightly: for each job scheduled tomorrow that has equipment assigned, create a `shop_tasks` row of type "Pre-use Check" with the equipment's checklist embedded. Assigned to a default shop helper or unassigned.

Schedule board shows readiness chip per job:
- Gray: no inspection scheduled
- Amber: inspection drafted, not done
- Green: inspection done, all pass
- Red: inspection failed on a critical item — **dispatch blocked**

Critical fail auto-creates a `maintenance_requests` row linked to the equipment. Shop manager sees in Inbox.

---

## Phased rollout

Each phase is one focused session, ~2-3 days of work, ends with a working slice.

### Phase 1A — Foundation — ✅ SHIPPED May 5, 2026 (commit `f42bd372`)

**Goal:** Roles + dashboards + clock-in toggle work end-to-end. No equipment data yet.

- DB migrations:
  - `equipment` table (with all the new columns: `unit_number`, `aliases`, `power_source`, `requires_maintenance_schedule`, `reserved_for_job_id`, expanded status enum)
  - `vehicles` table (1:1 with equipment for kind='vehicle')
  - `equipment_checkouts` table (no UI yet)
  - `timecards.work_location text DEFAULT 'field' CHECK (work_location IN ('field','shop'))`
  - All RLS policies via SECURITY DEFINER helpers (no `user_metadata`)
- RBAC:
  - `shop_help` role added to `lib/rbac.ts`
  - `shop_manager` preset filled in (was empty)
  - New cards in `ADMIN_CARDS`: `equipment`, `fleet`, `pull_equipment`, `voice_checkout`, `returned_equipment`
- Demo accounts:
  - `shopmanager@pontifex.com` / `Shop1234!`
  - `shophelp@pontifex.com` / `Help1234!`
  - Both in Patriot tenant
  - Demo cards on login page
- Shop Manager dashboard skeleton (vibrant gradient KPIs all reading 0 at first):
  - Maintenance Inbox (will populate Phase 2)
  - Pending Pre-Use Checks (will populate Phase 2/3)
  - Returned Equipment (will populate Phase 3)
  - Vehicles Out of Service
  - Hourly clock-in widget (same as supervisor)
  - "Pull Equipment List" CTA card
- Shop Help dashboard skeleton:
  - Operator-style: clock-in widget, today's tasks list (empty until Phase 2/3 generates them), request time-off link
- Field/Shop toggle at clock-in:
  - 2-button picker after GPS verification: "Field" (default) or "Shop"
  - Apprentices + operators see this; shop_help users default to Shop and don't need to pick
  - Choice writes to `timecards.work_location`
- Sidebar reflects role + work_location:
  - `shop_manager`: Dashboard, Schedule Board, Pull Equipment, Equipment, Fleet, Maintenance Inbox, Returned Queue, Yard Readiness, Timecards
  - `shop_help`: Dashboard (today's tasks), Request Time Off, Submit Maintenance Request
  - Apprentice in Field mode: existing operator sidebar
  - Apprentice in Shop mode: same items as `shop_help`
- Operator dashboard gets a new "Report Equipment Issue" card (links to `/dashboard/maintenance/new` — page is a placeholder until Phase 2)

**Done when:** Both demo accounts log in, see their dashboards, the clock-in toggle works for apprentices, and the report-issue card is on operator dashboard. Trial customer's experience unchanged.

### Phase 1B — Equipment + Fleet CRUD — ✅ SHIPPED May 5, 2026 (commit `934e8055`)

**Goal:** Shop manager can populate the inventory.

- Equipment list page (`/admin/equipment`):
  - Grid view, filter chips (kind, power_source, category, status), search
  - Pagination (50/page; 200 items = 4 pages)
  - Quick actions per row (View / Edit / Mark Out of Service)
- Equipment detail page (`/admin/equipment/[id]`):
  - Full record + photo + maintenance history (empty until Phase 2)
  - QR sticker preview + print button
- New Equipment form (`/admin/equipment/new`):
  - Name (required) / Short name / **Unit number (required)** / Aliases / Kind / Power source / Category / Maintenance-schedule-required toggle
  - Asset tag auto-generated `PTRT-NNNN` server-side
- Fleet list (`/admin/fleet`) — same pattern but kind='vehicle' with vehicle-specific columns (plate, registration expiry, odometer)
- Fleet detail + New Vehicle form
- Once data exists: dashboard KPIs start showing real numbers.

**Done when:** Shop manager has populated ~10 equipment + 2 vehicles as a smoke test. List/detail pages render. Mobile audit clean.

**Phase 1B post-mortem (smoke-test discoveries that turned into migration patches):**
The legacy `equipment` table had several columns the API expected but legacy schema lacked. All patched additively:
- `category text` (legacy had `equipment_category varchar` with different values)
- `make text` (legacy had `brand`)
- `current_custodian_id uuid` (legacy had `assigned_to`)
- `serial_number` was `NOT NULL` — relaxed to nullable

PostgREST schema cache had to be reloaded after each ALTER (`NOTIFY pgrst, 'reload schema'`).

**Phase 1B verification:** end-to-end test on mobile 375px as `shopmanager@pontifex.com` — login → New Equipment → fill form → submit → asset tag `PTRT-0001` returned → list page shows the new piece. Equipment detail page renders + edit mode works. Fleet pages mirror equipment patterns. Dashboard KPIs query real counts.

### Phase 2 — Maintenance Requests (the field-to-shop loop)
**Goal:** Operator submits → shop manager triages → shop help fixes → closed.

- DB migration: `maintenance_requests`.
- API: GET/POST list, GET/PATCH single. RLS strict.
- Operator-side mobile request form at `/dashboard/maintenance/new`. Camera-first, voice memo, equipment autocomplete from inventory, 3-tap target.
- "Report Issue" wrench icon on operator dashboard + my-jobs.
- Shop manager Maintenance Inbox at `/admin/maintenance` — Inbox / Active / Closed tabs, batch actions.
- Maintenance detail page with status transitions, photo gallery, voice playback.
- Notifications wired (in-app on assignment + resolution).
- Equipment detail page now shows linked maintenance history.

**Done when:** End-to-end flow works on a real demo: operator files request from mobile → shop manager assigns → shop help marks done → operator gets notified.

### Phase 3 — Checkout + Schedule Form integration
**Goal:** Equipment movement is tracked. Schedule form gets smarter.

- DB migration: `equipment_checkouts` UI built out + APIs.
- Manual checkout form on equipment detail page.
- Voice checkout (browser SpeechRecognition + parse + confirm). Permission gate: shop_manager + supervisor + admin (toggleable).
- Schedule form's equipment picker now reads from `equipment` filtered by `category`. Shows availability chips.
- "Where is my saw?" search: type asset_tag or name → see current custodian + job.
- Operator's job detail page shows equipment they have checked out.

**Done when:** A schedule form picks specific equipment units; on job approval, those units flip to `in_use`.

### Phase 4 — Maintenance Schedules + Pre-use Inspections
**Goal:** Proactive maintenance. Schedule board enforces equipment readiness.

- DB migration: `maintenance_schedules`.
- Service Reminders dashboard panel on shop manager dashboard ("Due this week", "Overdue").
- Equipment detail page can add/edit schedules.
- DB migration: `shop_tasks`.
- Cron job nightly: generate pre-use checks for tomorrow's equipment.
- Shop helper sees tasks on `/dashboard/my-jobs`-style page.
- Pre-use check page: checklist UI, photo on fail, sign-off, `Fail` on `critical:true` auto-creates maintenance_request.
- Schedule board shows readiness chip per job + blocks dispatch on red.
- Vehicle expiry alerts (registration/insurance/inspection).

**Done when:** A scheduled job has an associated pre-use check, shop helper signs it off, schedule board shows green readiness, dispatch is allowed.

### Phase 5 (later) — Polish
- Reservation calendar (book equipment for a future date).
- Cost rollup per equipment (total maintenance spent over its life).
- Parts inventory (track on-hand, reorder points).
- Vendor/supplier management.
- QR sticker printing UX (printable sheet of stickers).

These are nice-to-haves. Don't build until Phase 1-4 are real and used.

---

## What I will NOT build

Encoded here so it doesn't creep in:

1. **GPS / telematics integration on equipment.** No hardware budget. Manual hour-meter entry is fine.
2. **Separate parts inventory module on day 1.** Parts as free-text on work orders.
3. **DOT-compliant DVIR engine.** A simplified pre-use check captures 80% of the value with 10% of the build.
4. **Custom field framework.** Ship opinionated schemas; add fields when a real customer asks twice.
5. **Vendor lock-in for QR codes.** Print standard QR codes on standard sticker stock.

---

## Agents I'll dispatch per phase

Each phase gets agents matched to the work:

- **Phase 1**: `supabase-migration-author` for the schema, then a general-purpose agent for the dashboard scaffold. `rls-policy-auditor` reviews before merge.
- **Phase 2**: `supabase-migration-author` for `maintenance_requests`. Two parallel general-purpose agents — one for operator-side form, one for shop manager triage UI. `mobile-responsive-auditor` audits operator form on mobile.
- **Phase 3**: `supabase-migration-author` for `equipment_checkouts`. General-purpose agent extends schedule form. Voice checkout is a focused isolated build.
- **Phase 4**: `supabase-migration-author` for `maintenance_schedules` + `shop_tasks`. General-purpose agent for cron + nightly task generation. `rls-policy-auditor` reviews.

If we hit gaps, I'll write specialized subagents for them (e.g., a `pre-use-inspection-template-author` agent that knows the equipment inspection patterns).

---

## Risk + rollback

- **Trial customer is on prod.** Every phase ships behind a feature flag where possible (especially the maintenance request operator-side button — they shouldn't see "Report Issue" on day 1 if shop manager isn't ready to receive).
- **Schema changes are additive.** Idempotent migrations. New tables; no ALTERs to job_orders or other production-critical tables.
- **Each phase ends with `npm run build` + smoke-test in preview** before commit.
- **Pre-commit hook covers TS check.** RLS auditor runs before each migration commits.
- **Don't push to origin/main until phase ends + verified.** Per `DEPLOYMENT_COST.md` — every push is a billed Vercel build.

---

## Locked-in answers from user (May 5, 2026)

These are settled. Do not re-derive.

**1. Asset tag format:** `PTRT-0001`, 4-digit padded, prefix derives from tenant slug. ✅

**2. Shop helper count:** 1 permanent helper at Patriot. Plus team members (apprentices) sometimes work at the shop and need to see the shop help dashboard view when they do. **Design implication:**
- New column on `timecards`: `work_location text DEFAULT 'field' CHECK (work_location IN ('field','shop'))`.
- At clock-in, team members + operators get a 2-button picker: **Field** (default) or **Shop**.
- The dashboard renders shop-help cards when `work_location='shop'` instead of operator-style "My Jobs" cards.
- Shop manager can see "who's at the shop today" by querying timecards where `date=today AND work_location='shop'`.
- Toggle is also reachable from a sidebar item ("Switch to Shop View" / "Switch to Field View") so they can flip mid-day if needed without re-clocking.

**3. Equipment count + taxonomy:** ~200 items spanning: diesel/gas-powered, hydraulic, electric motor, hand tools, accessories (dollys, chains, hoses). **Schema refinement** (replaces the simpler `kind` enum from earlier in this doc):
- `kind text NOT NULL CHECK (kind IN ('powered','hand_tool','accessory','vehicle','trailer'))`
- `power_source text CHECK (power_source IN ('diesel','gas','hydraulic','electric','pneumatic',NULL))` — null for non-powered
- `category text` — specific class: `'slab_saw' | 'core_drill' | 'wall_saw' | 'wire_saw' | 'generator' | 'compressor' | 'dolly' | 'chain' | 'hose' | 'extension_cord' | ...`
- `requires_maintenance_schedule boolean NOT NULL DEFAULT false` — default true for kind in (powered, vehicle); false for hand_tool + accessory. Drives whether the maintenance schedule UI shows up for that asset.
- Equipment list page gets filter chips by `kind`, `power_source`, `category`, `status`. Pagination at 50/page (200 items total = 4 pages).

**4. Vehicle count:** ~15 (9 operator trucks + shop trucks + spare work trucks). At 15+, **Fleet gets its own dedicated nav item**: `/dashboard/admin/fleet`. Shows vehicles only with vehicle-specific columns (plate, registration expiry, odometer). Equipment page filters out vehicles by default.

**5. "Report Issue" trigger UX:** Full card on the operator dashboard (not a small icon). Card sits alongside "My Schedule" and "View Timecard" cards. Wrench icon, label "Report Equipment Issue", description "Submit a request for the shop". Links to `/dashboard/maintenance/new` (the 3-tap mobile-first form).

## All 7 questions — RESOLVED (May 5, 2026)

**Q6 — Pre-use check defaults**
- **Part A:** Unassigned. Shop manager delegates from inbox.
- **Part B:** **No auto-cron.** Replaced with a manual "Pull Equipment List" feature on the shop manager dashboard — see new section below.

**Q7 — Aliases + voice auto-confirm thresholds** — confirmed as proposed.
- Aliases: auto-seed `asset_tag` + `short_name`, manual extensions, learn from 3+ voice corrections, no pattern pre-seeding.
- Voice: ≥85% auto-save to pending tray (green ✓); 60-85% amber + top 3 suggestions; <60% red free-text. Undo Last button prominent. Audio recording for audit.

## NEW: "Pull Equipment List" feature (replaces auto-cron)

Inspired by the existing "Push Tickets" button on the schedule board. Manual control + days-ahead support so shop manager can prep when they have bandwidth.

**Page:** `/dashboard/admin/equipment/pull`

**Flow:**
1. Shop manager opens the Pull page.
2. Date picker — defaults to tomorrow. Buttons for "+1 day", "+2 days", "+3 days", "Custom date".
3. System lists all jobs scheduled in that range with their assigned equipment.
4. Checkbox per job (default all checked) — shop manager can deselect any job they don't want to pull yet.
5. **"Pull Equipment for Selected"** button:
   - For each selected job, generates `shop_tasks` rows of type `pre_use_check`, one per equipment unit, **unassigned**.
   - Marks each piece of equipment as `reserved_for_job_id` (so the schedule form sees them as unavailable for double-booking).
   - Equipment status stays `available` (it hasn't moved physically yet) but the reserved flag prevents conflicts.
6. Returns shop manager to a "Pulled Today" view showing what was just generated, with a delegate-tasks shortcut.

**Data:**
- New column `equipment.reserved_for_job_id uuid REFERENCES public.job_orders(id) ON DELETE SET NULL`
- New column `equipment.reserved_until timestamptz` — releases the reservation on or after this date if not checked out yet.

**When equipment moves from reserved → in_use:** at checkout time on the dispatch day. The voice/manual checkout flow flips status, clears reservation, fills `current_custodian_id` + `current_job_order_id`.

## NEW: Voice Check-In + Returned Equipment queue

Same voice infrastructure as checkout, opposite direction. Page has a top toggle: **Check Out** ⇄ **Check In**.

**Voice phrase examples (check-in mode):** "FS5000 number 5 back", "Return DFS-5", "Generator 3 returned"

**Flow:**
1. Tap mic, speak equipment identifier.
2. System finds the open `equipment_checkouts` row (where `checked_in_at IS NULL`) for that unit. If multiple matches, asks supervisor to disambiguate.
3. Sets `checked_in_at = now()`, `checked_in_by = auth.uid()`.
4. Equipment status flips to `'pending_putaway'` (NEW state — see status enum below).
5. Equipment shows up in the "Returned Equipment — Needs Put-Away" queue on shop helper + shop manager dashboards.

**Returned Equipment queue:** `/dashboard/admin/equipment/returned`
- Lists all equipment with `status='pending_putaway'`, ordered by `checked_in_at DESC`.
- Each row: equipment thumb + name + last custodian + checked-in time.
- Click row → full record + "Mark put away" button + "Mark needs maintenance" link (creates a maintenance request).
- Marking put-away flips status to `'available'` and clears `current_custodian_id` + `current_job_order_id`.

**Updated equipment.status enum:**
```
'available' | 'reserved' | 'in_use' | 'pending_putaway' | 'in_maintenance' | 'out_of_service' | 'retired'
```

## NEW: equipment.unit_number field

Operators say equipment by unit number ("FS5000 number 5"), not asset tag (`PTRT-0042`). The asset tag is the printed-on-the-sticker QR ID, internally unique. The unit number is the human-friendly identifier within a model line.

**Schema additions:**
```sql
unit_number text                       -- "5", "12", "3A" — what operators speak
short_name text                        -- "FS5000" — compact model name shown in lists
display_name text GENERATED ALWAYS AS (
  COALESCE(short_name, name) || ' #' || COALESCE(unit_number, '?')
) STORED                               -- e.g. "FS5000 #5"
```

**Add Equipment form fields (Phase 1B):**
- Name (full; required) — "Husqvarna FS5000"
- Short name (optional) — "FS5000"
- **Unit number (required)** — "5"
- Asset tag (auto-generated `PTRT-NNNN`)
- Aliases (optional, comma-separated) — "5000 slab saw, big saw"
- Kind / power_source / category / requires_maintenance_schedule (per Q3 taxonomy)

**Voice matching priority:**
1. Cached `voice_recognition_corrections` row matches normalized phrase
2. `aliases` jsonb contains the phrase
3. `short_name + " " + unit_number` (or "number" + unit_number) trigram match
4. `asset_tag` exact match
5. `name` trigram fallback

---

Answer these and I can kick off Phase 1 the next session.

_(Resolved — see "Locked-in answers" section above. Q6 + Q7 still pending user confirmation.)_

---

## TL;DR

- Six tables, four feature areas, two new roles. All tenant-scoped.
- Steal QR-driven checkout from EZOfficeInventory, Service Reminders dashboard from Fleetio, pre-use-blocks-dispatch from Samsara DVIR, 3-tap submission from MaintainX.
- Phase 1 is foundation (inventory list + role + dashboard). Phase 2 is the field-to-shop loop. Phase 3 is checkout + schedule integration. Phase 4 is proactive maintenance + pre-use checks. Phase 5+ is polish.
- Don't build telematics, full DVIR, parts inventory, or custom-field framework on day 1.
- Every phase: migration → API → UI → mobile audit → smoke test → commit. Don't push to main until verified.

This plan is not yet code. Start of Phase 1 begins on user's next "let's go" signal.
