# Configurable Start Time + Late Entries — Architecture Plan

> **Status:** DESIGN (Jun 20, 2026). Build is multi-session; nothing here is shipped yet.
> **Founder goal:** *"Have a set standard start time managed in the timecard dashboard. When someone
> works nights / midday, the system knows their start time and doesn't false-flag them. Every other
> Monday is a safety-training day → set 6:30 AM for everyone that day. Once digital tickets roll out,
> a 'different start time' checkbox on the schedule ticket tells the backend that operator's start
> time for that job — so they're only flagged late vs THEIR start time, not everyone's."*

---

## 1. The bug this fixes (root cause, verified in code)

Late detection lives in `app/api/timecard/clock-in/route.ts` (~line 451). Today it works like this:

1. Look up the operator's **job for today** (`jobs` table) → read `arrival_time` (jobsite) or `shop_arrival_time` (shop).
2. If that time exists and clock-in is ≥ `late_grace_minutes` (default **7**) past it → set `is_late`, `late_minutes`, `scheduled_start_time`, notify admins.

**The hole:** if the operator has **no job assigned today** (the normal case — digital tickets aren't live), `expectedTimeStr` is `null` and the **entire late check is skipped**. That is exactly why an 8:00 clock-in was never flagged: there was no start time to compare against. The grace period (7 min) and the late columns already exist and work — they just never get a baseline when there's no job.

**The fix is a resolution chain**, not new flagging logic.

---

## 2. Effective-start-time resolution (the core design)

For a given `(operator, tenant, local date, shop-vs-field)`, resolve the **effective scheduled start** in this precedence (highest wins):

| # | Source | Where it lives | Status |
|---|--------|----------------|--------|
| 1 | **Per-job ticket start time** | `jobs.arrival_time` / `jobs.shop_arrival_time` for the operator's assigned job today | ✅ data model exists; clock-in already reads it |
| 2 | **Per-day override** | NEW `timecard_day_overrides` (tenant + date + scope) — e.g. safety-training Monday 6:30 AM for everyone | ⬜ to build |
| 3 | **Tenant standard start time** | `timecard_settings.default_start_time` (`time`, currently `'07:00'`) | ✅ column exists |
| — | **None** → skip late check (fail-open; never false-flag) | | current behavior |

> All comparisons happen in the **tenant's timezone** (the route already resolves the expected
> instant for today's tenant-local date — keep that; never `new Date('YYYY-MM-DD')`). Use `lib/dates.ts`.

This means **the bug fix = add steps 2 and 3 as fallbacks** when step 1 is null. With the standard
start time at 07:00, an 8:00 clock-in is 60 min late → flagged. Night/midday crews assigned to a job
with a later `arrival_time` (step 1) are measured against THAT, so they're never false-flagged.

---

## 3. Schema (additive + idempotent, per platform conventions)

### 3a. Reuse `timecard_settings.default_start_time` (no new column)
Already per-tenant. The dashboard's "standard start time" control just edits this. Confirm it is
read in the resolution chain (today it is **not** — clock-in only reads `late_grace_minutes` + `require_nfc`).

### 3b. NEW table `timecard_day_overrides`
```sql
CREATE TABLE IF NOT EXISTS public.timecard_day_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  override_date date NOT NULL,              -- the specific calendar day
  start_time  time NOT NULL,               -- e.g. 06:30 for safety training
  scope       text NOT NULL DEFAULT 'all'  -- 'all' | 'role' | 'operator'
              CHECK (scope IN ('all','role','operator')),
  role        text,                        -- when scope='role'
  operator_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- when scope='operator'
  note        text,                        -- "Safety training day"
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- one override per (tenant, date, scope, role, operator) — partial uniqueness handled in app layer
CREATE INDEX IF NOT EXISTS idx_tc_day_overrides_lookup
  ON public.timecard_day_overrides (tenant_id, override_date);
```
- RLS via SECURITY DEFINER helpers: read = any authed user in tenant; write = `current_user_has_role('admin','operations_manager','super_admin') AND tenant_id = current_user_tenant_id()`.
- `updated_at` trigger (standard).
- Resolution for step 2: pick the most specific matching row for the day — `operator` > `role` > `all`.

> **No new table for per-job start time** — `jobs.arrival_time` already is the per-job override. The
> schedule form just needs a "Different start time" affordance that writes it (see §5). Future digital
> tickets reuse the same column.

---

## 4. Backend changes

1. **`lib/timecard-start.ts` (new):** `resolveEffectiveStart({ supabaseAdmin, tenantId, operatorId, role, localDate, isShopHours })` → `{ startTime: 'HH:MM' | null, source: 'job'|'day_override'|'standard'|null }`. Single source of truth, unit-tested. Encodes the §2 precedence.
2. **`clock-in/route.ts`:** replace the job-only lookup with `resolveEffectiveStart(...)`. Keep the existing grace-period + flagging + admin-notification code unchanged (it already works once it has a baseline). Store `scheduled_start_time` + the resolved `source` (add a nullable `late_source text` column for auditability — optional).
3. **Settings API:** `GET/PUT /api/admin/timecards/settings` to read/write `default_start_time` + `late_grace_minutes` (the dashboard control). `GET/POST/DELETE /api/admin/timecards/day-overrides` for the per-day overrides. All `requireAdmin`, tenant-scoped.

---

## 5. Frontend changes

1. **Timecard dashboard → Settings:** "Standard start time" (time picker → `default_start_time`) + "Late grace" (minutes). A "Day overrides" mini-manager: add a date + start time + scope (Everyone / Role / Operator) + note; list/remove upcoming ones.
2. **Late Entries page** (`/dashboard/admin/timecards/late` or a tab on the timecards dashboard): list `timecards WHERE is_late = true` for the tenant, filterable by week/day; columns = operator, date, scheduled start (+ source badge: Job / Day override / Standard), actual clock-in, minutes late, job (if any). Mobile-first.
3. **Schedule form:** a "Start time" control defaulting to "Standard" with a "Different start time" toggle that, when on, writes `jobs.arrival_time` / `shop_arrival_time`. (Largely a UI affordance over the existing column.) This is the bridge to digital tickets — same field, same backend path.

---

## 6. Build order (each step: build → guardian-review → verify → hold push)

1. **Migration** (`timecard_day_overrides` + optional `late_source`) via `supabase-migration-author` + `rls-policy-auditor`.
2. **`lib/timecard-start.ts`** + unit tests (precedence + tz).
3. **Wire into `clock-in/route.ts`** — this alone fixes the founder's "8:00 not flagged" bug. Functional trace: no-job operator at 8:00 with standard 07:00 → `is_late=true, late_minutes=60`.
4. **Settings + day-overrides API** + dashboard UI.
5. **Late Entries page.**
6. **Schedule-form "different start time"** affordance.

Steps 1–3 are the high-value core (fixes the live bug + gives the standard start time). 4–6 layer on management UX. Per-job/digital-ticket smart override is already satisfied by `jobs.arrival_time` at the data layer.

---

## 7. Open questions for the founder
- **Recurrence:** "every other Monday" safety day — manual per-date entry for now, or a recurring rule? (Recommend: manual dates first — cheapest reversible step; add recurrence later if it's painful.)
- **Standard start = shop vs field:** one standard time, or separate standard for shop hours vs jobsite? (Today the job path already distinguishes shop vs jobsite; recommend one tenant standard now, split later only if needed.)
- **No-show vs late:** there's a separate no-show setting (`20260605_timecard_late_grace_and_noshow`). Confirm the start-time resolution should also feed no-show detection (likely yes — same baseline).
