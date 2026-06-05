# Subsistence Nights — Architecture Plan

**Status:** Design only. No code/migrations applied. Another agent implements; architecture-guardian reviews.
**Author:** System Architecture Designer · **Date:** 2026-06-05

---

## 1. Problem & verified context

Operators who work **out-of-town** jobs stay overnight and earn **subsistence (per-diem) pay per night away**. The founder wants the app to (a) **ask** the operator if they stayed overnight, (b) **categorize + count** subsistence nights on the timecard, so management can **see how many nights each operator stayed out of town** and pay accordingly. Pay computation (count-only vs `$/night` rate) is **founder-undecided** — design must support both with no rework.

### What already exists (verified)

| Fact | Evidence |
|---|---|
| Out-of-town flag is set on the schedule form | `app/dashboard/admin/schedule-form/page.tsx:425` (type), `:511` (default), `:3654-3659` (Toggle), `:1660` (payload) |
| It is **persisted as JSONB**, not a column: `job_orders.scheduling_flexibility->>'out_of_town'` (boolean) | `app/dashboard/admin/schedule-form/page.tsx:1653-1662` builds `scheduling_flexibility{ out_of_town, hotel_directions, ... }`; `app/api/admin/schedule-form/route.ts:123` persists `scheduling_flexibility: body.scheduling_flexibility`. Live DB: `job_orders` has **no** `out_of_town` column; the value lives in the JSONB. |
| `out_of_town` not yet populated on legacy rows | Live query: 13 `job_orders`, **0** have the `out_of_town` JSONB key. Feature is new; only jobs created/edited after the toggle shipped carry it. **Implication: gating must treat a missing key as `false`.** |
| `create-estimate` `perDiems` is **customer billing**, not operator pay | Out of scope — do not touch. |
| End-of-day operator flow funnels through one API | `app/dashboard/job-schedule/[id]/day-complete/page.tsx` "done for today" (`continueNextDay:true`, `:294`) and "complete" (`continueNextDay:false`, `:380`) **both** POST `/api/job-orders/[id]/daily-log`. |
| `daily-log` route already: auths user, resolves tenant, loads the job, links operator + job + date | `app/api/job-orders/[id]/daily-log/route.ts:53` (`getTenantId`), `:68-73` (job, tenant-scoped), `:156-178` upserts `daily_job_logs` on `(job_order_id, operator_id, log_date)`. |
| `timecards` has `is_overnight` **already** — a DIFFERENT concept | Live schema: `timecards.is_overnight boolean`. This flags a **shift that crosses midnight** (clock-in late night → clock-out next morning), NOT "stayed in a hotel." Also `is_night_shift boolean` = night-rate shift. **Neither equals subsistence.** Must not reuse. |
| `timecards` links to a job | `timecards.job_order_id uuid` (live schema). |
| SECURITY DEFINER RLS helpers exist | Live DB confirms `public.current_user_tenant_id()`, `public.is_admin()`, `public.current_user_has_role(text[])`, `public.current_user_role()`. |
| Canonical additive-table + RLS pattern to copy | `supabase/migrations/20260502_supervisor_visits.sql` (full table, tenant_id, indexes, `updated_at` trigger, `DO $$ … EXCEPTION WHEN duplicate_object` policies, super_admin tenant bypass). |
| Per-year per-operator balance table precedent | `operator_pto_balance` exists (live). |
| Tenant payroll config table | `timecard_settings_v2` (live: `tenant_id`, multipliers, thresholds, `night_shift_multiplier`, etc.) — the natural home for a `subsistence_rate`. |
| Local-date helper (date-rule compliant) | `lib/dates.ts:36 toLocalYMD()`. **Note:** `daily-log/route.ts:115` currently uses `new Date().toISOString().split('T')[0]` (a date-rule violation, pre-existing). New code must use `toLocalYMD()`. |
| Week summary calc | `lib/timecard-utils.ts:54 calculateWeekSummary()`; team payroll grid `app/dashboard/admin/timecards/page.tsx`; per-operator API `app/api/admin/timecards/team-summary/route.ts`; operator detail tiles `app/dashboard/admin/timecards/operator/[id]/page.tsx:1240-1310`. |

---

## 2. Data model — DECISION: dedicated `subsistence_nights` table

**Chosen:** a dedicated table keyed `(operator_id, night_date)` unique, tenant-scoped, optional `job_order_id`.

**Rejected — boolean/int column on `timecards`:** A timecard row is per **clock-in shift per day**, and an operator can have multiple timecard rows in a day (segments, split shifts) or **none** on the night a job spans (they answer "stayed overnight" at *day-complete*, which may not coincide 1:1 with a timecard row). A column on `timecards` would make "one night per calendar day" hard to enforce (no natural unique key per operator/date across multiple rows) and would entangle a behavior-preserving payroll table. A separate table gives a clean `UNIQUE(operator_id, night_date)` = **exactly one subsistence night per operator per date** (idempotent by construction), an obvious admin-override surface, and zero risk to live payroll math.

**Semantics:** one row = "operator was away overnight following work on `night_date`." `night_date` = the **work day** the operator finished (the date they answered "yes" at day-complete). Counting "nights" = counting rows. Multi-day out-of-town job → one row per day worked (the operator answers once per day-complete). Multiple jobs same day → still one row (unique constraint collapses it).

### Migration DDL (additive, idempotent) — `supabase/migrations/20260605_subsistence_nights.sql`

```sql
-- Subsistence (per-diem) nights: one row per operator per calendar night away.
-- Recorded when an operator finishes a day on an out-of-town job and confirms
-- they stayed overnight. Counted for payroll; rate (if any) lives in timecard_settings_v2.

CREATE TABLE IF NOT EXISTS public.subsistence_nights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,

  operator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The work day the operator finished and confirmed an overnight stay.
  -- "Nights away" = COUNT(*) of these rows. One per operator per calendar day.
  night_date date NOT NULL,

  -- Optional context: which out-of-town job drove this night.
  job_order_id uuid REFERENCES public.job_orders(id) ON DELETE SET NULL,
  job_number text,

  -- Provenance: how the row was created.
  source text NOT NULL DEFAULT 'operator',          -- 'operator' | 'admin'
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- admin override actor
  note text,                                          -- optional correction reason

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Exactly one subsistence night per operator per calendar date (idempotency).
  CONSTRAINT subsistence_nights_operator_date_key UNIQUE (operator_id, night_date)
);

CREATE INDEX IF NOT EXISTS idx_subsistence_nights_tenant      ON public.subsistence_nights(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subsistence_nights_operator    ON public.subsistence_nights(operator_id, night_date DESC);
CREATE INDEX IF NOT EXISTS idx_subsistence_nights_job         ON public.subsistence_nights(job_order_id);
CREATE INDEX IF NOT EXISTS idx_subsistence_nights_tenant_date ON public.subsistence_nights(tenant_id, night_date);

-- updated_at trigger (mirrors supervisor_visits pattern)
CREATE OR REPLACE FUNCTION public.subsistence_nights_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_subsistence_nights_updated_at ON public.subsistence_nights;
CREATE TRIGGER set_subsistence_nights_updated_at
  BEFORE UPDATE ON public.subsistence_nights
  FOR EACH ROW EXECUTE FUNCTION public.subsistence_nights_set_updated_at();

-- RLS
ALTER TABLE public.subsistence_nights ENABLE ROW LEVEL SECURITY;

-- Operator: read + write (insert) their own nights, within their tenant.
DO $$ BEGIN
  CREATE POLICY "subsistence_nights_operator_own" ON public.subsistence_nights
    FOR ALL
    USING (
      operator_id = auth.uid()
      AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
    )
    WITH CHECK (
      operator_id = auth.uid()
      AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admin / ops / super_admin: full access in tenant; super_admin bypasses tenant.
DO $$ BEGIN
  CREATE POLICY "subsistence_nights_admin_all" ON public.subsistence_nights
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

COMMENT ON TABLE public.subsistence_nights IS
  'One row per operator per calendar night away on an out-of-town job. Counted for subsistence/per-diem pay.';
```

> Server writes use `supabaseAdmin` (bypasses RLS, per project convention); RLS above is the defense-in-depth backstop for any client-side reads.

### Optional rate setting (Section 4) — additive column, no behavior change

```sql
-- timecard_settings_v2: per-tenant subsistence rate. 0 / NULL = count-only (default), no pay shown.
ALTER TABLE public.timecard_settings_v2
  ADD COLUMN IF NOT EXISTS subsistence_rate numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.timecard_settings_v2.subsistence_rate IS
  'Per-night subsistence pay ($). 0 = count nights only (no auto-computed pay).';
```

---

## 3. Operator prompt — one tap at day-complete, gated to out-of-town jobs

**Where:** `app/dashboard/job-schedule/[id]/day-complete/page.tsx`. This is the single natural "operator finishes a day" point; both terminal actions already route through it.

**Gating (so non-traveling operators never see it):** the page already fetches the job (`:148 /api/job-orders/[id]` → `setJob(jobData)`). Read `job.scheduling_flexibility?.out_of_town === true`. **Missing key ⇒ false ⇒ no prompt** (covers all legacy jobs). Only when `true` do we render the question.

**UI:** a single yes/no question shown in the day-complete card *before* the operator taps "Done for Today" / "Complete":

> **Did you stay overnight away from home tonight?**  [ Yes, I stayed ]  [ No ]

- One tap. Default unselected; operator must pick before the terminal button enables **only if out_of_town** (don't block normal jobs).
- Selection held in local state `stayedOvernight: boolean | null`.
- On submit (both `handleDoneForToday`/`continueNextDay:true` path `:294` and the complete path `:380`), include `stayed_overnight: stayedOvernight` in the **existing** `daily-log` POST body. No new network round-trip.
- Mirror the existing dark-mode / toast / locked-success-card conventions already in this file.

**API that records the night:** extend `app/api/job-orders/[id]/daily-log/route.ts` (the route that already has user, tenant, job, and date in hand):

1. Parse `stayed_overnight` from body (`:42-50` destructure block).
2. Server-side authority check (never trust the client for the gate): the job is already loaded at `:73`. Compute `const jobIsOutOfTown = job?.scheduling_flexibility?.out_of_town === true;`.
3. Compute the night date with the **date-rule helper**: `import { toLocalYMD } from '@/lib/dates';` then `const nightDate = toLocalYMD();` (do **not** reuse the route's existing `today` at `:115`, which is UTC-based — see guardian checklist).
4. **Idempotent record/remove** (fire-and-forget, never blocks day-complete):
   - If `jobIsOutOfTown && stayed_overnight === true` → **upsert** on the unique key:
     ```ts
     Promise.resolve(
       supabaseAdmin.from('subsistence_nights').upsert({
         tenant_id: tenantId,
         operator_id: user.id,
         night_date: nightDate,
         job_order_id: jobId,
         job_number: job.job_number ?? null,
         source: 'operator',
       }, { onConflict: 'operator_id,night_date' })
     ).then(() => {}).catch(() => {});
     ```
     Re-submitting the same day is a harmless no-op (same row). Stayed-on-job-A then job-B same day → unique key collapses to one night.
   - If `jobIsOutOfTown && stayed_overnight === false` → **delete** any existing row for `(operator_id, night_date)` (operator corrected an earlier "yes" on a re-submit). Also fire-and-forget.
   - If `!jobIsOutOfTown` → do nothing (defense in depth; UI already hid the prompt).

This keeps the day-complete flow's existing success/lock behavior intact; subsistence recording is a side effect, never a failure path.

---

## 4. Pay — design for BOTH count-only (now) and rate (later), no hard-wiring

- **Count is the source of truth.** Pay is always *derived* (`nights × rate`), never stored as a baked number on the night row — so flipping the rate or count never leaves stale money.
- **Rate location:** `timecard_settings_v2.subsistence_rate` (per-tenant, Section 2 DDL). Default `0` ⇒ **count-only**, exactly today's ask. No UI shows a dollar amount while it's `0`.
- **Where the amount is computed:** the same surfaces that already read `timecard_settings_v2` and render payroll:
  - `app/api/admin/timecards/team-summary/route.ts` already fetches settings-adjacent data per operator/week; add `subsistenceNights` (count) per operator and, if `subsistence_rate > 0`, `subsistencePay = nights × rate`.
  - The team payroll page (`app/dashboard/admin/timecards/page.tsx`) already loads `timecard_settings_v2` (`:244-266`) — read `subsistence_rate` there to decide whether to show the pay column or just the count.
- **Settings UI:** add a "Subsistence rate ($/night)" input wherever `timecard_settings_v2` is edited (same form that exposes `night_shift_multiplier` / thresholds). Leaving it blank/0 preserves count-only.
- **Export:** wherever payroll/QuickBooks export is generated, add a "Subsistence Nights" column and (only when rate > 0) a "Subsistence Pay" column. Subsistence is a **flat per-night add**, OT-exempt — it must **not** enter the 40-hr weekly-OT base in `calculateWeekSummary` (same isolation principle already applied to `holidayHours` at `lib/timecard-utils.ts:72,89`).

---

## 5. Edge cases & how the design handles each

| Case | Handling |
|---|---|
| **Multi-day out-of-town job** (one night per night, not per shift) | Operator answers once per **day-complete**; `UNIQUE(operator_id, night_date)` ⇒ one row per calendar day regardless of how many shifts/segments that day. |
| **Operator on multiple jobs in one day** | Both day-completes upsert the same `(operator_id, night_date)` ⇒ **one** night. `job_order_id` reflects the last writer (acceptable; count is what matters). |
| **Night shift vs overnight stay** (distinct concepts) | Explicitly separate. `timecards.is_night_shift` = night pay-rate shift; `timecards.is_overnight` = shift crossing midnight. Neither is reused. Subsistence = "slept away from home," captured only by the new table. Documented in DDL comment + this plan. |
| **Didn't actually stay (answered "No")** | No row created; if a prior "Yes" exists for that date, the `false` branch **deletes** it. |
| **Retroactive correction** | Admin override endpoint (`POST`/`DELETE`, Section 6) writes `source:'admin'`, `created_by`, `note`. Same unique key keeps it idempotent. |
| **Idempotency on re-submit** | Upsert on the unique key. Re-tapping "Done for Today" or resubmitting after a draft is a no-op. Matches the existing `daily_job_logs` upsert philosophy (`daily-log/route.ts:160`). |
| **Legacy/quick-add jobs without the key** | `out_of_town` missing ⇒ treated `false` ⇒ no prompt, no row. Verified: 0 of 13 current jobs carry the key. |
| **Timezone / off-by-one** | `night_date` from `toLocalYMD()` (`lib/dates.ts:36`), never `toISOString()`. |
| **Super_admin (null tenant) writing** | `tenant_id` taken from the resolved tenant; daily-log route already special-cases super_admin (`:61`). RLS admin policy bypasses tenant for super_admin. |

---

## 6. File-by-file change list

### Migrations (apply via Supabase MCP `apply_migration` — additive, safe to run on prod)
1. **`supabase/migrations/20260605_subsistence_nights.sql`** — new table + indexes + `updated_at` trigger + RLS. Pattern: clone of `20260502_supervisor_visits.sql`.
2. **`supabase/migrations/20260605_subsistence_rate_setting.sql`** — `ALTER TABLE timecard_settings_v2 ADD COLUMN IF NOT EXISTS subsistence_rate numeric NOT NULL DEFAULT 0`. Additive, default preserves behavior.

### Backend
3. **`app/api/job-orders/[id]/daily-log/route.ts`** — parse `stayed_overnight`; compute server-side `jobIsOutOfTown` from already-loaded `job.scheduling_flexibility`; `import { toLocalYMD }`; fire-and-forget upsert/delete on `subsistence_nights`. *Pattern:* existing fire-and-forget logging + the existing `daily_job_logs` upsert in the same file.
4. **`app/api/admin/timecards/team-summary/route.ts`** — fetch `subsistence_nights` for the week (`night_date` in `[mondayStr, sundayStr]`, tenant-scoped), aggregate `subsistenceNights` per operator; if `subsistence_rate > 0`, add `subsistencePay`. *Pattern:* the existing per-user timecard aggregation loop (`:127-256`).
5. **`app/api/admin/subsistence-nights/route.ts`** *(new)* — admin override. `GET ?operatorId=&weekStart=` (list), `POST {operator_id, night_date, job_order_id?, note?}` (upsert, `source:'admin'`), `DELETE {operator_id, night_date}` (remove). Guard with `requireAdmin()` from `lib/api-auth.ts`. *Pattern:* existing admin timecard routes (`/api/admin/timecards/*`).

### Frontend
6. **`app/dashboard/job-schedule/[id]/day-complete/page.tsx`** — render the yes/no card only when `job.scheduling_flexibility?.out_of_town === true`; hold `stayedOvernight` state; include `stayed_overnight` in both daily-log POST bodies (`:294`, `:380`). *Pattern:* existing toast + dark-mode + success-lock conventions in this file.
7. **`app/dashboard/admin/timecards/page.tsx`** — per-operator card: show "Subsistence nights: N" chip (next to the existing Late chip); read `subsistence_rate` from the already-loaded `timecard_settings_v2` (`:244-266`) to decide whether to also show pay. *Pattern:* the existing `lateArrivalsThisWeek` chip.
8. **`app/dashboard/admin/timecards/operator/[id]/page.tsx`** — add a "Subsistence Nights" tile to the tile grid alongside Night Shift / Days Worked / Punctuality (`:1240-1310`), plus inline +/- admin override calling route #5. *Pattern:* the Punctuality tile.
9. **Timecard settings form** (component editing `timecard_settings_v2`, sibling to the `night_shift_multiplier` field) — add "Subsistence rate ($/night)" input.

### Shared (optional, recommended)
10. **`lib/timecard-utils.ts`** — extend `WeekSummary` with `subsistenceNights: number` (and optional `subsistencePay`). Because subsistence comes from a different table (not `TimecardEntry[]`), pass the count **into** the summary builder rather than deriving it inside `calculateWeekSummary` — keep that function's pure hour math untouched (behavior-preserving). Surface the count where `WeekSummary` is consumed.

---

## 7. Open questions for the founder

1. **Pay model:** count-only now, or set a `$/night` rate immediately? (Design ships count-only by default; rate is a single number whenever you want it.)
2. **Rate scope:** one tenant-wide `subsistence_rate`, or per-operator / per-job overrides later? (Plan assumes tenant-wide; per-operator would mirror `operator_pto_balance`.)
3. **Who answers — operator only, or supervisor/admin too?** Currently operator at day-complete + admin override. Should a supervisor be able to log it during a site visit?
4. **Half-rate / partial nights** (e.g., drove home late)? Current model is binary (1 night per date).
5. **Approval:** should subsistence nights ride the existing timecard approval workflow, or count as soon as the operator confirms? (Plan: count on confirm; admin can correct.)
6. **Backfill:** any past out-of-town stays to seed manually before go-live?
7. **Auto-suggest:** if the job is out_of_town, should the prompt default to "Yes" (operator un-checks if they went home), or default to unselected (current plan)?

---

## 8. Guardian compliance checklist

- [x] **tenant_id + RLS** on the new table; policies use SECURITY DEFINER helpers (`current_user_tenant_id()`, `current_user_has_role()`, `current_user_role()`) — all verified to exist. No raw role subqueries.
- [x] **No `auth.jwt() -> 'user_metadata'`** anywhere in the RLS.
- [x] **Additive & idempotent** migrations: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object`. Safe to apply directly to prod (no drops, no alters of hot columns).
- [x] **Date rule:** `night_date` via `toLocalYMD()` (`lib/dates.ts:36`); never `new Date(ymd)` / `toISOString().split('T')[0]`. (Pre-existing UTC `today` in `daily-log/route.ts:115` is left untouched; new code does not reuse it.)
- [x] **Behavior-preserving payroll:** subsistence stored in a **separate** table; `calculateWeekSummary` hour math unchanged; subsistence is OT-exempt and never enters the 40-hr base. `subsistence_rate` defaults to `0` ⇒ no dollar amounts surface until the founder opts in.
- [x] **Auth:** new admin route guarded by `requireAdmin()`; operator write path runs through the already-authed `daily-log` route. Server re-derives `out_of_town` from the DB job (never trusts the client gate).
- [x] **Server writes** via `supabaseAdmin`; **fire-and-forget** for the subsistence side effect so it can never fail an operator's day-complete.
- [x] **Multi-tenant out of the box:** no Patriot-specific hardcoding; works for any tenant via `tenant_id` + `timecard_settings_v2`.
- [x] **Mobile-first:** the prompt is a single full-width yes/no in the existing day-complete card (≥44px tap targets, no new horizontal overflow).
