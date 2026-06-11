# Timecard Settings Enhancements — Implementation Plan

**Status:** architecture only (no code written). Another agent implements; architecture-guardian reviews.
**Scope:** three founder-requested features — (1) admin-configurable LATE threshold, (2) NO-SHOW button on the management timecard view, (3) HOLIDAY date config + auto-apply.
**Prime directive:** extend the existing infrastructure, do not bolt on parallel systems.

---

## 0. Ground truth (verified against live DB + code)

### 0.1 The two settings tables — IMPORTANT reconciliation
There are **two** settings tables and the app currently uses the **legacy key/value one**:

| Table | Shape | Rows | Used by |
|---|---|---|---|
| `public.timecard_settings` | key/value: `setting_key text`, `setting_value jsonb`, `category`, `tenant_id`, `updated_by/at` | **20** | `app/api/admin/timecard-settings/route.ts` (GET/PUT), `app/dashboard/admin/settings/timecard/page.tsx`, and `clock-in/route.ts:115-134` |
| `public.timecard_settings_v2` | flat typed columns (`regular_hours_per_day`, `overtime_threshold_weekly`, `break_*`, `require_nfc_clock_in`, …) | **1** | `clock-in/route.ts:118-126` (read-only, tried FIRST then falls back to v1) |

> ⚠️ The settings API/page **read and write flat column names** (`require_nfc`, `auto_deduct_break`, `break_duration_minutes`, …) against `timecard_settings` — a table whose actual columns are only `setting_key`/`setting_value` (jsonb). This means the settings PUT path is effectively **inserting flat columns that the key/value table does not have**, OR a prior migration added those flat columns to `timecard_settings` too. **Implementer MUST run `\d public.timecard_settings` first.** The query I ran returned ONLY key/value columns, so the existing settings write path is likely broken/no-op and persists via `localStorage` (see `page.tsx:206`). **Do not trust that the settings PUT currently works.**

**Decision for this plan:** the late-grace setting follows the **same code path the settings page already uses** — i.e. the flat-field GET/PUT in `app/api/admin/timecard-settings/route.ts` against `timecard_settings`. To make that real and durable, the migration ADDS `late_grace_minutes int` as a real column to **`timecard_settings`** AND to **`timecard_settings_v2`** (both, since clock-in reads v2-first/v1-fallback). This keeps the new setting on the exact same rail as `require_nfc`, `break_*`, etc., rather than introducing a third storage location. (Open question 5.1 raises whether to first consolidate onto v2 — out of scope here; we mirror the existing dual-write reality.)

### 0.2 `timecards` table — verified columns & CHECK constraints
Relevant columns: `user_id uuid NOT NULL`, `tenant_id uuid`, `date date NOT NULL`, `clock_in_time timestamptz NOT NULL`, `clock_out_time timestamptz`, `total_hours numeric`, `entry_type text default 'regular'`, `hour_type text default 'regular'`, `is_late boolean default false`, `late_minutes int default 0`, `scheduled_start_time time`, `late_notified_at timestamptz`.

CHECK constraints (verified via `pg_constraint`):
- `timecards_entry_type_check` allows: `regular, overtime, double_time, time_off, holiday, no_call_no_show, late, pto, sick, manual, admin_adjustment`.
  → **`holiday` is ALREADY allowed. `no_show` is NOT — but `no_call_no_show` IS.**
- `hour_type` has **NO CHECK constraint** (free text; current values in use: `regular, night_shift, mandatory_overtime`).
- `pay_category` CHECK: `regular, night_shift, shop, overtime`.
- `pay_type_override` CHECK: `regular, night_shift_premium, overtime, double_time, mandatory_overtime`.

### 0.3 The scheduled-start source (for unifying LATE with the reminder feature)
- `clock-in/route.ts:452-468` derives the scheduled start from the operator's **job for that day**: `job_orders.shop_arrival_time` (`time`) for shop clock-ins, else `job_orders.arrival_time` (`text`). This is the **same source** the reminder feature uses.
- **`tenants.default_start_time` does NOT exist** (verified — no such column). The CLAUDE.md note about `tenants.default_start_time '07:00'` is aspirational/not-yet-shipped. So today there is exactly ONE scheduled-start source: the day's `job_orders` row. The late path already uses it. **We keep that source; we only replace the hardcoded `15`.** When/if a tenant-level default start is added later, it plugs in as the fallback when no job row is found (noted in 1.4).

### 0.4 Existing `no_show` path (to unify, not duplicate)
- `app/api/admin/time-off/route.ts:16-25` — `operator_time_off` table is the home of time-off/callouts. `VALID_TYPES` includes `'no_show'`; `CALLOUT_TYPES = ['sick','callout','no_show','personal_day']`; POST notifies admins + bumps `operator_pto_balance.callout_count`.
- `MarkOutModal.tsx` / schedule-board `OperatorRow.tsx` write to `operator_time_off` (schedule-board "Mark Out"). This is **schedule/availability**, NOT payroll.
- The **payroll grid (`team-summary`) and operator detail read ONLY `timecards`** — they never read `operator_time_off`. So a `no_show` in `operator_time_off` is invisible on the timecard. That is exactly the gap the founder is describing.

### 0.5 Management timecard surfaces (where things render)
- `app/dashboard/admin/timecards/page.tsx` = **Team Payroll** grid. Header "Add Time" button at `:620-628` opens `AddTimeModal` (`:1600`) → POST `/api/admin/timecards/manual`. Day cells `:1073-1095`; late chip `:1087-1091`; Punctuality column `:1117-1133`; Status column `:1135-1161`; row Actions `:1163-1188`.
- `team-summary` route (`app/api/admin/timecards/team-summary/route.ts`) selects `... hour_type, is_late, late_minutes` (`:102`), builds `dailyHours[day]` and OT via `hour_type === 'mandatory_overtime'` (`:204-210`).
- Operator detail `app/dashboard/admin/timecards/operator/[id]/page.tsx` — `ENTRY_TYPE_STYLES` (`:164-173`, already has `holiday` + `no_call_no_show`), per-day cards, empty-day quick-actions (`:1534-1567`) wired to `/api/admin/timecards/manual`, Punctuality tile (`:1257`).
- `lib/timecard-utils.ts:calculateWeekSummary` — sums `total_hours`, classes mandatory OT by `hour_type`. **Holiday/no-show rows participate only via `total_hours`** (0 for no-show, N for holiday). No change strictly required for correctness, but see 3.5.

### 0.6 Conventions confirmed
- New tables: `tenant_id uuid REFERENCES tenants(id)`, RLS ON, policies via SECURITY DEFINER helpers `public.current_user_tenant_id()`, `public.current_user_role()`, `public.current_user_has_role(...)` (pattern: `supabase/migrations/20260510_voice_recognition_corrections.sql:38-53`). Never `auth.jwt()->'user_metadata'`.
- Idempotent DDL: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DO $$ BEGIN CREATE POLICY … EXCEPTION WHEN duplicate_object THEN NULL; END $$;`.
- Date rule: `lib/dates.ts` (`toLocalYMD`, `parseYMDLocal`, `weekDatesFrom`). NEVER `new Date(ymd)` / `toISOString().split` for calendar dates.
- API auth: `requireAdmin(request)` → `{ authorized, response, userId, tenantId, role }`.

---

## 1. Feature 1 — Admin-configurable LATE threshold

**Goal:** replace hardcoded `lateMinutes >= 15` (`clock-in/route.ts:473`) with a per-tenant `late_grace_minutes` setting. Keep `is_late`/`late_minutes` semantics and the admin notification.

### 1.1 Migration — `supabase/migrations/20260605_late_grace_setting.sql` (additive, idempotent)
```sql
ALTER TABLE public.timecard_settings    ADD COLUMN IF NOT EXISTS late_grace_minutes int NOT NULL DEFAULT 15;
ALTER TABLE public.timecard_settings_v2 ADD COLUMN IF NOT EXISTS late_grace_minutes int NOT NULL DEFAULT 15;
```
`DEFAULT 15` = **behavior-preserving** (matches today's hardcoded value, so Patriot's live payroll is unchanged until an admin edits it).

### 1.2 Settings API — `app/api/admin/timecard-settings/route.ts`
- Add `'late_grace_minutes'` to `allowedFields` (`:90-96`).
- Add `late_grace_minutes: 15` to `DEFAULT_SETTINGS` (`:22-34`).
- No other change — GET already returns `*`.

### 1.3 Settings UI — `app/dashboard/admin/settings/timecard/page.tsx`
- Add `lateGraceMinutes: number` to `TimecardSettings` interface (`:13-43`) + `DEFAULT_SETTINGS` (`:45-66`, value `15`).
- Map it in the loader (`:148-159`): `lateGraceMinutes: d.late_grace_minutes ?? prev.lateGraceMinutes`.
- Map it in `handleSave` body (`:187-197`): `late_grace_minutes: settings.lateGraceMinutes`.
- Add a new control in the **"Rounding & Breaks"** or a small new **"Attendance"** card (prefer a new card titled "Attendance & Punctuality" with the `Timer` lucide icon, matching the section pattern at `:351-425`). Reuse the existing `NumberInput` component (`:96-124`):
  ```
  <NumberInput label="Late grace period"
    description="Minutes past scheduled start before an operator is flagged late"
    value={settings.lateGraceMinutes} onChange={v => updateSetting('lateGraceMinutes', v)}
    unit="minutes" min={0} max={60} />
  ```

### 1.4 Clock-in route — `app/api/timecard/clock-in/route.ts`
The route already fetches settings at `:115-134` (v2-first, v1-fallback) but only reads `require_nfc`. **Extend that same block** to also pull `late_grace_minutes`, then use it at `:473`:
- In the settings fetch (currently gated behind `clock_in_method === 'gps'`), **hoist a small settings lookup** so it runs for all methods (late detection runs regardless of method). Select `require_nfc, late_grace_minutes` from v2 then v1; default `graceMinutes = tcSettings?.late_grace_minutes ?? 15`.
- Replace `:473` `if (lateMinutes >= 15)` → `if (lateMinutes >= graceMinutes)`.
- **Scheduled-start source unchanged** — still `job.shop_arrival_time` / `job.arrival_time` (`:463`), the same source as the reminder feature (0.3). Keep writing `scheduled_start_time`, `is_late`, `late_minutes`, `late_notified_at` and the `schedule_notifications` insert.
- **Fallback hook (future, note only):** if `todayJobs` is empty, there is currently no late check at all. When `tenants.default_start_time` ships, the fallback expected-time computation plugs in here (the `if (todayJobs && todayJobs.length > 0)` else-branch at `:460`). Out of scope now.

### 1.5 Grace-after-start vs absolute cutoff (founder is deciding)
Design implements **grace-after-scheduled-start** (`actual − scheduled ≥ grace`). This is what the current code computes (`lateMs = now − expectedTime`, `:470`). If the founder later wants an **absolute cutoff** (e.g. "late if clock-in after 7:15 regardless of job start"), it plugs in at the **same line `:465-471`**: replace `expectedTime` derivation with a fixed `late_cutoff_time` setting (a new `time` column on `timecard_settings`), keeping the downstream `is_late`/`late_minutes` write identical. No schema churn beyond one more nullable column. Document both columns now; ship only `late_grace_minutes`.

---

## 2. Feature 2 — NO-SHOW button on the management timecard view

**Founder requirement:** the no-show must appear **on the timecard** (payroll grid + operator detail + dashboard counts), not just on the schedule board.

### 2.1 Unified data model (recommended)
Write a **`timecards` row** for the no-show day:
- `entry_type = 'no_call_no_show'` (already in the CHECK — **reuse it; do NOT add `no_show`**, which keeps the enum clean and matches the operator-detail `ENTRY_TYPE_STYLES['no_call_no_show']` that already exists at `:171`).
- `hour_type = 'no_show'` (hour_type has no CHECK, so this is a free, descriptive tag the grid can group on; keeps `entry_type` as the canonical taxonomy).
- `total_hours = 0`, `gross_hours = 0`, `net_hours = 0`, `regular_hours = 0` → **zero paid hours, no double-count into pay totals** (`calculateWeekSummary` sums `total_hours`, so 0 contributes nothing).
- `clock_in_time` set to the day's scheduled-start (or `date T00:00`) so the NOT NULL constraint is satisfied; `clock_out_time = clock_in_time` (0 duration). `is_approved = true`, `approval_status = 'manually_approved'`, `clock_in_method = 'manual'`, `timecard_source = 'manual'`, `work_location` derived from role (same as manual route `:78-79`).

**Reconciliation with `operator_time_off` (avoid double-count):** the timecard no-show is the **payroll record**; the `operator_time_off` no-show is the **schedule/availability + callout record**. They serve different systems and never both feed pay (operator_time_off is not read by payroll). To keep attendance metrics coherent and avoid two callout increments:
- The no-show timecard API **also upserts `operator_time_off`** (type `no_show`, `is_callout=true`, `pto_days_used=0`) using the **same `onConflict: 'operator_id,date'` upsert** the time-off route uses (`time-off/route.ts:172`). This makes the schedule board "Mark Out" and the timecard no-show **converge on one `operator_time_off` row per (operator,date)** — idempotent, no double callout.
- `operator_pto_balance.callout_count` is bumped **once**, guarded by checking whether an `operator_time_off` no_show row already existed for that date (only increment on insert, not on idempotent re-upsert). Mirror the guard style in `time-off/route.ts:upsertPtoBalance`.
- Conversely, when an admin uses the schedule-board "Mark Out → no_show", that path may **optionally** create the timecard row too (Open question 5.2 — recommend yes for symmetry, behind the same shared helper).

> Net: **one `operator_time_off` row (callout/attendance) + one zero-hour `timecards` row (payroll visibility)** per no-show day, both keyed by (operator, date), both idempotent.

### 2.2 Migration
**None required for the enum** (`no_call_no_show` already allowed; `hour_type` is unconstrained). Optionally add a partial unique index to make the timecard no-show idempotent:
```sql
-- supabase/migrations/20260605_no_show_timecard.sql
CREATE UNIQUE INDEX IF NOT EXISTS timecards_one_no_show_per_day
  ON public.timecards (user_id, date)
  WHERE entry_type = 'no_call_no_show';
```
(Partial index — does not affect normal multi-entry days.)

### 2.3 API route — `app/api/admin/timecards/no-show/route.ts` (new)
- `POST` → `requireAdmin`, tenant-scoped. Body `{ user_id, date, notes? }`. Validates date `YYYY-MM-DD`, verifies target profile in tenant (mirror `manual/route.ts:62-70`). Inserts the zero-hour timecard row (2.1), upserts `operator_time_off` (2.1), conditionally bumps `callout_count`, fires admin notification + audit log (reuse the `time-off/route.ts:186-225` notification block + `manual/route.ts:156-165` audit block). Idempotent via the partial unique index (`ON CONFLICT DO NOTHING`).
- `DELETE` (`?id=` or `?user_id=&date=`) → removes the no-show timecard row AND the matching `operator_time_off` no_show row; decrements `callout_count` if it was counted. Lets an admin undo a mistaken no-show.

**Alternative considered:** route everything through the existing `/api/admin/timecards/manual` by adding `no_call_no_show` to its `VALID_ENTRY_TYPES`. Rejected as the *primary* path because manual route forces `hours 0.25–16` (`:54`) and PTO bookkeeping branching; a no-show is 0 hours + callout semantics. A dedicated route is cleaner. (Could later fold in, see 5.2.)

### 2.4 Button placement (management timecard view)
1. **Row-level (primary):** in the Team Payroll grid Actions cell (`page.tsx:1163-1188`), add a small "No-Show" button (rose, `UserX` lucide icon) next to "View"/"Approve". Opens a tiny confirm popover with a date defaulting to today (or the selected week's day) → POST. Matches the existing `opacity-60 group-hover:opacity-100` action-button styling.
2. **Day-cell (operator detail):** in the empty-day quick-actions array (`operator/[id]/page.tsx:1543-1547`), add a 5th button `{ type:'no_show', label:'No-Show', tone:<rose> }`. It calls the new no-show API (not `/manual`). This is the most natural place — admin is looking at a specific empty day.

### 2.5 Rendering
- **Payroll grid day cell (`page.tsx:1073-1095`):** `team-summary` must surface no-show. Add `entry_type` to its select (`:102`) and, in the per-day reducer, set a `dayInfo.isNoShow` flag when any entry has `entry_type==='no_call_no_show'`. Render a rose "No-Show" chip in the day cell (sibling to the late chip at `:1087-1091`). Because `total_hours=0`, the cell shows `-` for hours today; the chip disambiguates.
- **Status column (`:1135-1161`):** optionally add a `no_show` status badge; not required.
- **Operator detail:** already styled — `ENTRY_TYPE_STYLES['no_call_no_show']` (`:171`) renders the badge automatically once the row exists; the entry shows `0.00` hrs.
- **Dashboard counts:** the Punctuality column (`page.tsx:1117`) counts late days; add a parallel "callouts/no-shows this week" count derived from `dayInfo.isNoShow`. The time-off admin page "Attendance Metrics" tab already counts `operator_time_off` callouts — since we upsert there too, **that count stays correct with no change**.

---

## 3. Feature 3 — Holiday settings (date config + auto-apply)

**Goal:** admin marks specific DATES as company holidays with a per-holiday `pay_hours`; eligible employees auto-receive a holiday-pay `timecards` entry.

### 3.1 New table — `public.company_holidays`
```sql
-- supabase/migrations/20260605_company_holidays.sql
CREATE TABLE IF NOT EXISTS public.company_holidays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name         text NOT NULL,
  pay_hours    numeric NOT NULL DEFAULT 8 CHECK (pay_hours >= 0 AND pay_hours <= 24),
  is_active    boolean NOT NULL DEFAULT true,
  -- eligibility scope; see 3.4. 'all' | 'field' | 'shop' | 'full_time'
  applies_to   text NOT NULL DEFAULT 'all'
               CHECK (applies_to IN ('all','field','shop','full_time')),
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, holiday_date)
);

ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "company_holidays_tenant_read" ON public.company_holidays
    FOR SELECT
    USING (tenant_id = public.current_user_tenant_id() OR public.current_user_role() = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "company_holidays_admin_write" ON public.company_holidays
    FOR ALL
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id())
    )
    WITH CHECK (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```
RLS/helpers/idempotency pattern copied verbatim from `20260510_voice_recognition_corrections.sql:38-53`. All server writes go through `supabaseAdmin` (bypasses RLS) anyway; policies protect any client-side read.

### 3.2 API — `app/api/admin/company-holidays/route.ts` (new)
- `GET` (`?year=`) → `requireAdmin`, tenant-scoped, returns holidays ordered by `holiday_date`.
- `POST` → create `{ holiday_date, name, pay_hours, applies_to }`. Upsert `onConflict: 'tenant_id,holiday_date'` so re-adding a date edits it.
- `PATCH /[id]` and `DELETE /[id]` (or PUT/DELETE with `?id=`) → edit pay_hours/name/active, remove.
- All tenant-scoped via `auth.tenantId` exactly like `timecard-settings/route.ts`.

### 3.3 Settings UI — `app/dashboard/admin/settings/holidays/page.tsx` (new)
- New page reachable from the admin settings area (add a card/link next to "Timecard Settings"). Reuse the **header + card shell** from `settings/timecard/page.tsx:220-260` (sticky header, `max-w-[900px]`, white cards, purple gradient icon) so it visually matches.
- Content: a **list of holiday rows** (date · name · pay_hours · applies_to · active toggle · edit/delete) + an **"Add holiday"** inline form (date picker, name, hours `NumberInput`, applies_to select). Use `lib/dates.ts` `formatDayLong` for display, raw `YYYY-MM-DD` for storage.
- An **"Apply to timecards"** button per holiday (or for the selected year) — triggers the auto-apply endpoint (3.4). Shows "applied N entries / skipped M existing".

### 3.4 Auto-apply mechanism — recommend **admin "Apply" action (idempotent), with optional cron later**
**Recommendation: an explicit admin-triggered apply endpoint**, `POST /api/admin/company-holidays/[id]/apply`, NOT an automatic cron — justification:
- Patriot is a **single live tenant on real payroll**; auto-creating pay entries silently is risky. An explicit "Apply" gives the admin control over **who** is eligible and **when** (e.g. after the roster is finalized). The founder is still deciding recipient scope (5.3), so silent automation is premature.
- It is trivially **idempotent** and re-runnable, which a cron would also need; building the idempotent apply first means a cron is later just a thin caller.

**Apply logic (the endpoint):**
1. Load the holiday row (tenant-scoped).
2. Resolve eligible employees: `profiles` where `tenant_id = auth.tenantId` AND role ∈ payroll roles, filtered by `applies_to` (`all`; `field`/`shop` via `profiles.work_location`; `full_time` via a future flag — for now treat `full_time` = all non-apprentice, noting 5.3).
3. For each eligible user, **insert a `timecards` row only if none exists** for `(user_id, holiday_date, entry_type='holiday')`:
   - `entry_type = 'holiday'` (already in CHECK), `hour_type = 'regular'`, `total_hours = gross_hours = net_hours = regular_hours = pay_hours`, `clock_in_time = holiday_date T08:00`, `clock_out_time = +pay_hours`, `is_approved = true`, `approval_status='manually_approved'`, `clock_in_method='manual'`, `timecard_source='manual'`, `work_location` from role, `notes = 'Holiday: ' || name`.
   - This reuses the **exact manual-entry insert shape** (`manual/route.ts:81-107`) — same column set, so it renders in the grid + operator detail with the existing `holiday` badge (`ENTRY_TYPE_STYLES['holiday']`, `:170`) and counts into pay via `total_hours`.
4. **Idempotency guard:** a partial unique index makes re-apply a no-op:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS timecards_one_holiday_per_day
     ON public.timecards (user_id, date)
     WHERE entry_type = 'holiday';
   ```
   Insert with `ON CONFLICT DO NOTHING`; return inserted vs skipped counts.
5. Audit log per apply (reuse `manual/route.ts:156-165`).

**Later cron (optional, noted only):** `vercel.json` cron at ~06:00 → `/api/cron/apply-holidays` that finds today's active holidays per tenant and calls the same apply logic. Gated on `CRON_SECRET`. Not built now.

### 3.5 Payroll totals flow
- Holiday rows carry `total_hours = pay_hours`, so they flow into `calculateWeekSummary.totalHours` and the grid weekly total automatically. **Behavior to confirm with founder (5.4):** holiday hours currently would count toward the **40-hr weekly OT threshold** in `calculateWeekSummary:77-79` (because they're added to `weekdayHours`). Many shops treat holiday pay as **non-worked, OT-exempt**. Recommended (pending 5.4): in `calculateWeekSummary`, **exclude `entry_type IN ('holiday','pto','sick')` rows from `weekdayHours`/OT math** while still summing them into a separate `holidayHours`/`paidLeaveHours` bucket. This requires passing `entry_type` into `TimecardEntry` (currently the util only reads `hour_type`/flags — add `entry_type?: string` to the interface at `lib/timecard-utils.ts:24`). Keep this change **gated/behavior-flagged** so Patriot's existing computations don't shift unexpectedly mid-pay-period.

---

## 4. File-by-file change list

### Migrations (all additive + idempotent)
| File | Change | Matches pattern |
|---|---|---|
| `20260605_late_grace_setting.sql` | `ADD COLUMN late_grace_minutes` to `timecard_settings` + `_v2` | `20260425_timecard_late_tracking.sql` (ADD COLUMN IF NOT EXISTS) |
| `20260605_no_show_timecard.sql` | partial unique index `timecards_one_no_show_per_day` | partial-index convention |
| `20260605_company_holidays.sql` | new table + RLS + `timecards_one_holiday_per_day` index | `20260510_voice_recognition_corrections.sql` RLS block |

### Backend (API)
| File | Change |
|---|---|
| `app/api/admin/timecard-settings/route.ts` | add `late_grace_minutes` to `DEFAULT_SETTINGS` + `allowedFields` |
| `app/api/timecard/clock-in/route.ts` | hoist settings read; replace hardcoded `15` with `graceMinutes` (`:473`); keep `job_orders` start source |
| `app/api/admin/timecards/no-show/route.ts` | **new** POST/DELETE — zero-hour timecard + idempotent `operator_time_off` upsert + callout guard + notify/audit |
| `app/api/admin/company-holidays/route.ts` | **new** GET/POST(upsert) |
| `app/api/admin/company-holidays/[id]/route.ts` | **new** PATCH/DELETE |
| `app/api/admin/company-holidays/[id]/apply/route.ts` | **new** idempotent holiday-pay apply |
| `app/api/admin/timecards/team-summary/route.ts` | add `entry_type` to select; set `dayInfo.isNoShow` |
| `lib/timecard-utils.ts` | add `entry_type` to `TimecardEntry`; (gated) exclude holiday/pto/sick from OT math + add `holidayHours` bucket |

### Frontend (UI)
| File | Change |
|---|---|
| `app/dashboard/admin/settings/timecard/page.tsx` | add `lateGraceMinutes` to interface/defaults/load/save + a "Attendance & Punctuality" `NumberInput` |
| `app/dashboard/admin/settings/holidays/page.tsx` | **new** holiday list/add/edit page (reuse timecard-settings shell) |
| `app/dashboard/admin/timecards/page.tsx` | row-level "No-Show" button in Actions (`:1163`); rose No-Show chip in day cell (`:1087` sibling); optional no-show count |
| `app/dashboard/admin/timecards/operator/[id]/page.tsx` | add 5th empty-day quick-action "No-Show" (`:1543`) → no-show API |
| admin settings hub page (the page linking to `settings/timecard`) | add a "Holidays" card/link |

---

## 5. Open questions for the founder
1. **Settings storage drift (5.1):** the settings page appears to persist via `localStorage` while the DB write path targets a key/value table with mismatched columns. Should we (a) just add the column on both tables as planned, or (b) first consolidate the whole settings UI onto `timecard_settings_v2`? (Plan ships (a); (b) is a separate cleanup.)
2. **No-show symmetry (5.2):** when an admin marks no-show on the **schedule board** ("Mark Out → no_show"), should that ALSO create the zero-hour timecard row (recommended: yes, via shared helper), or stay schedule-only?
3. **Holiday eligibility scope (5.3):** who gets auto holiday pay — all employees, field-only, full-time only, exclude apprentices? Drives `applies_to` semantics and the `full_time` definition (no full-time flag exists on `profiles` today).
4. **Holiday + OT interaction (5.4):** do holiday hours count toward the 40-hr weekly OT threshold (current behavior if untouched) or are they OT-exempt paid-leave (recommended)? Affects `calculateWeekSummary`.
5. **Late grace model (being decided):** grace-after-scheduled-start (this plan) vs absolute cutoff time. Plan ships grace; absolute cutoff documented as a one-column add at `clock-in/route.ts:465`.
6. **No-show pay (5.6):** confirmed 0 paid hours (assumed). Any scenario where a no-show is partially paid? (If yes, it's just a non-zero `total_hours`.)

---

## 6. Guardian compliance checklist
- [x] **tenant_id + RLS on new table** — `company_holidays` has `tenant_id NOT NULL REFERENCES tenants`, RLS ON, SELECT + ALL policies via `current_user_tenant_id()` / `current_user_has_role()` (no `user_metadata`).
- [x] **No `auth.jwt() -> user_metadata`** anywhere — only SECURITY DEFINER helpers.
- [x] **Additive + idempotent migrations** — `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object`. No drops/destructive alters.
- [x] **Behavior-preserving for live payroll** — `late_grace_minutes DEFAULT 15` = current behavior; no-show/holiday rows are net-new and zero/explicit-hour; `calculateWeekSummary` OT change is **gated** so existing totals don't shift mid-period.
- [x] **Date rule** — all new date handling via `lib/dates.ts` (`toLocalYMD`/`parseYMDLocal`/`formatDayLong`); no `new Date(ymd)` / `toISOString().split` for calendar dates.
- [x] **No double-count** — no-show converges on ONE `operator_time_off` row (idempotent upsert) + ONE zero-hour timecard row; `callout_count` bumped once via insert-only guard; holiday apply guarded by partial unique index + `ON CONFLICT DO NOTHING`.
- [x] **Auth** — every new/changed admin route uses `requireAdmin`, tenant-scoped via `auth.tenantId`; super_admin tenant-null handling matches existing routes.
- [x] **Reuse over rebuild** — extends `timecard_settings` settings rail, the `/manual` insert shape, `operator_time_off` upsert, existing `entry_type` enum values (`holiday`, `no_call_no_show`), and existing `ENTRY_TYPE_STYLES` badges. No parallel systems introduced.
