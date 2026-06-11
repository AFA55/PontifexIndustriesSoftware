# SMART Clock-In / Clock-Out Reminder System — Implementation Plan

**Status:** Design only. No code, migrations, or feature work performed. Another agent implements; an architecture-guardian reviews.
**Author:** System Architecture Designer
**Date:** 2026-06-04

---

## 0. TL;DR — what already exists vs. what's missing

This is **mostly a wiring + extension job, not a greenfield build.** A full reminder pipeline already ships in the repo. The founder's brief assumes none of it exists; in reality:

| Capability | Status | Evidence |
|---|---|---|
| Reminder cron infra (auth, per-tenant loop, tz math) | **BUILT** | `app/api/cron/clock-in-reminders/route.ts`, `app/api/cron/work-performed-reminders/route.ts` |
| Idempotent dedup (`reminder_log` UNIQUE) | **BUILT** | `lib/send-reminder.ts:130` `sendReminderOnce()`; table in `supabase/migrations/20260523_push_and_reminders.sql:55` |
| Unified dispatch: in-app + APNs push + SMS, respecting prefs | **BUILT** | `lib/send-reminder.ts:73` `sendNotification()` → `lib/send-push.ts:97` `sendPushToUser()` |
| Clock-IN reminder at ±5 min of start | **BUILT** (pre + post) | `clock-in-reminders/route.ts`; `lib/reminder-timing.ts:41` `clockInReminderPhase()` |
| Cron registered `*/5 * * * *` | **BUILT** | `vercel.json:47` |
| Skip already-clocked-in operators | **BUILT** | `clock-in-reminders/route.ts:118` |
| "Start time" source field | **PARTIAL** | cron reads `job_orders.arrival_time`; **the schedule FORM never writes it** (see §1) |
| Skip days off / PTO | **MISSING** | no `operator_time_off` check in clock-in cron |
| Clock-OUT reminders at 10h / 12h / 15h | **MISSING** | only `work-performed-reminders` exists (4h/7h, different purpose) |
| Night-shift-aware reminders | **PARTIAL** | `auto-clockout` is night-aware; reminder crons are not |

**So the real work is four things:**
1. **Close the start-time gap** — make the schedule form persist a start time into `job_orders.arrival_time` (today it only stores `scheduling_flexibility.special_arrival_time` JSON, which the cron does not read). §1, §2.
2. **Build the clock-OUT reminder cron** (10h/12h/15h after clock-in). §3B.
3. **Make both reminder crons "smart"** — add PTO/time-off skip + night-shift handling + default start time to the existing clock-in cron. §3A, §5.
4. **Notification copy** for the 4 reminder types. §4.

Do **not** invent a new notification mechanism or a new dedup table — reuse `sendReminderOnce` + `reminder_log`.

---

## 1. Data model decision — where `start_time` lives

### 1.1 What exists today (verified)

- `job_orders.arrival_time` **already exists** (a time/text column, formatted via `TO_CHAR(jo.arrival_time, 'HH12:MI AM')` in `supabase/migrations/20260325_printable_documents_full_deployment.sql:659`, and read across ~15 schedule-board views/routes).
- `job_orders.shop_arrival_time` also exists (separate "report to shop first" time).
- The clock-in cron **already treats `arrival_time` as the start-time source** (`clock-in-reminders/route.ts:54-57`), taking the **earliest `arrival_time`** across an operator's jobs that day (direct `assigned_to`/`helper_assigned_to` **and** `job_daily_assignments` overrides — `route.ts:60-84`).
- **The gap:** `arrival_time` is written by the schedule **board** (`app/dashboard/admin/schedule-board/page.tsx:1136` → `/api/admin/job-orders` PATCH, `app/api/admin/job-orders/route.ts:223`) but **never by the schedule form**. The form collects `special_arrival_time` and buries it in `scheduling_flexibility` JSON (`schedule-form/page.tsx:1652`; persisted as JSONB at `app/api/admin/schedule-form/route.ts:122`). A job created via the form therefore has `arrival_time = NULL` and the cron skips it (`.not('arrival_time','is',null)`).

### 1.2 Grain analysis — per-job-day vs per-assignment vs per-operator

The founder schedules **per job, per day**, and an operator can be on different jobs on different days. The cron already resolves this correctly by taking the **earliest arrival_time among that operator's jobs for `today`**, including per-day overrides. Three options:

| Option | Where start time lives | Pros | Cons |
|---|---|---|---|
| **A (RECOMMENDED): reuse `job_orders.arrival_time`** | per job (the time the crew is told to be on site) | Zero new columns; the cron already reads it; matches the mental model ("the job starts at 7"); already surfaced on board, dispatch PDF, schedule emails | Multi-day jobs share one arrival_time across days (acceptable — see §5); if two ops on one job they share it (correct — same crew, same arrival) |
| B: `job_daily_assignments.start_time` | per operator per day | Most precise for split crews | New column; cron must prefer it over job arrival; the form doesn't create daily_assignments (board does) — so form jobs still wouldn't get a time |
| C: per-operator default schedule table | per operator | Good for fixed-shift shops | Patriot is job-driven, not shift-driven; over-engineered; founder explicitly wants it pulled from the schedule |

**Decision: Option A.** The "start time field" the founder wants already exists as `job_orders.arrival_time`. The fix is **plumbing the schedule form into it**, plus adding a per-day override fallback for the split-crew case (Option B as an *optional* secondary source the cron already partly supports via `job_daily_assignments` join).

### 1.3 Migration DDL

`arrival_time` already exists, so the only schema work is **idempotent guards + a cron-supporting index + an optional per-day override + an optional night-shift hint.** All additive → apply directly to prod per CLAUDE.md.

```sql
-- supabase/migrations/20260604_clock_reminders.sql
-- Additive + idempotent. Safe to re-run.

-- 1. Guarantee the start-time column exists with the right type.
--    (It already exists; this is a defensive no-op for fresh DBs.)
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS arrival_time time;   -- bare clock time, tenant-local wall clock

-- 2. Per-day operator start override (split-crew case). Optional secondary source.
--    Cron prefers this over the job's arrival_time when present.
ALTER TABLE public.job_daily_assignments
  ADD COLUMN IF NOT EXISTS start_time time;

-- 3. Night-shift hint on the job so the cron can widen clock-out windows
--    and skip "previous-day" false positives. (pay_type_override already
--    encodes night premium, but is pay-not-schedule; a boolean is clearer.)
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS is_night_shift boolean NOT NULL DEFAULT false;

-- 4. Index the cron's hot query: "jobs for tenant X scheduled today with a start time".
CREATE INDEX IF NOT EXISTS job_orders_tenant_date_arrival_idx
  ON public.job_orders (tenant_id, scheduled_date)
  WHERE arrival_time IS NOT NULL;

-- 5. (No new reminder table needed — reuse reminder_log from 20260523.)
```

> **Type note:** if the existing `arrival_time` is `text` (it is read with `TO_CHAR(...)` in one view but written as a bare HH:MM string by the board), **do not** blindly `ALTER ... TYPE time` — that's a destructive migration requiring a Supabase DB branch (CLAUDE.md rule 3). The cron parses with `parseHHMM()` (`lib/reminder-timing.ts:9`) which accepts both `text` and `time` renderings, so leaving it `text` is fine. The `ADD COLUMN IF NOT EXISTS` above is a no-op on the existing column regardless of its current type. **Verify the live type first** (`\d job_orders`) before touching it.

**RLS:** no new tables → no new policies. `reminder_log`, `notifications`, `notification_preferences`, `push_tokens` already have RLS (`20260523_push_and_reminders.sql`). All cron reads/writes use `supabaseAdmin` (bypasses RLS) per convention.

---

## 2. Schedule-form change — wire the start-time picker into `arrival_time`

### 2.1 The component already exists

`schedule-form/page.tsx:3608-3627` already renders an `<InputField type="time">` (a 16px-floored styled `<input type="time">`) bound to `form.special_arrival_time`, gated behind a "Special Arrival Time?" toggle in **Step 5 (Scheduling)**. Two changes:

**(a) Make a start time always collectable (not just "special").** Keep the existing "Special Arrival Time?" toggle for the edge case, but add a primary **"Crew start time"** picker in the Step 5 `SectionCard` (`schedule-form/page.tsx:3600`). Default value: empty → falls back to the tenant default at cron time (§5). Add a sibling **"Night shift?"** toggle that sets `form.is_night_shift`.

Recommended component (matches existing pattern at line 3611):
```tsx
<Label>Crew Start Time (on-site arrival)</Label>
<InputField
  icon={Clock}
  type="time"                       // renders 16px+, mobile-safe
  value={form.arrival_time}
  onChange={e => updateForm({ arrival_time: e.target.value })}
/>
<Toggle
  checked={form.is_night_shift}
  onChange={v => updateForm({ is_night_shift: v })}
  label="Night Shift?"
  icon={Moon}
/>
```

**(b) Add the fields to form state + payload.**
- Add `arrival_time: string` and `is_night_shift: boolean` to the form-state interface near `special_arrival_time` (`schedule-form/page.tsx:419`) and its initializer (`:504`).
- In `handleSubmit`'s `payload` (`schedule-form/page.tsx:1613`), add top-level:
  ```ts
  arrival_time: form.arrival_time || form.special_arrival_time || null,
  is_night_shift: form.is_night_shift || false,
  ```
  (Falling back to `special_arrival_time` keeps the existing toggle meaningful and back-fills the cron source for forms that only used the old field.)

### 2.2 Persist it in the API route

`app/api/admin/schedule-form/route.ts` builds `jobOrderData` (`:90-144`) and inserts into `job_orders` (`:147`). Add to that object, in the Step 5 block (`:119-122`):
```ts
arrival_time: body.arrival_time || null,
is_night_shift: body.is_night_shift || false,
```

### 2.3 Edit-mode path

The form's edit mode PATCHes `/api/admin/job-orders/${editJobId}` with a whitelist (`schedule-form/page.tsx:1714-1725`) that currently omits scheduling fields. Add `arrival_time` and `is_night_shift` to that PATCH body **and** to the PATCH route's allowed-field list (`app/api/job-orders/[id]/route.ts:65`, which already lists `'arrival_time'`). The schedule-board edit modal already writes `arrival_time` (`schedule-board/page.tsx:1136`) so that path needs no change beyond optionally exposing the night-shift toggle there too.

---

## 3. The crons

### 3.0 Cadence — `*/5 * * * *` is already in use and valid

`vercel.json:47-49` already registers `/api/cron/clock-in-reminders` at `*/5 * * * *`, and `work-performed-reminders` at `*/15`. So 5-minute granularity **is available on the current plan** (Vercel Pro allows minute-level cron; Hobby is limited to daily, but this project is clearly on Pro given the existing `*/5` and `*/15` entries). The "5 min after 7:00 start" requirement is met by the existing `clockInReminderPhase` post-window `[start+3, start+8]` (`lib/reminder-timing.ts:43`) — a `*/5` tick always lands inside an 11-minute-wide window, so the reminder fires exactly once.

> If Vercel ever rejects the cron count (Pro cap is generous but finite), the clock-out reminder can **piggyback on the existing `work-performed-reminders` `*/15` cron** instead of adding a new cron entry — 15-min granularity is plenty for 10h/12h/15h thresholds. **Recommended: piggyback** (see §3B) to avoid burning a cron slot and a separate function.

### 3A. Make `clock-in-reminders` smart (extend existing route)

The existing route is 90% there. Add to `app/api/cron/clock-in-reminders/route.ts`:

1. **PTO / time-off skip.** Before building candidates, fetch the day's time-off and remove those operators:
   ```ts
   const { data: off } = await supabaseAdmin
     .from('operator_time_off')
     .select('operator_id')
     .eq('date', today)
     .in('operator_id', [...earliestStart.keys()]);
   const offSet = new Set((off||[]).map(o => o.operator_id));
   // skip candidate if offSet.has(opId)
   ```
   (`operator_time_off` schema: `operator_id`, `date`, `type ∈ {pto,unpaid,worked_last_night,sick,other}`, UNIQUE(operator_id,date) — `supabase/migrations/20260326_time_off_and_status_tracking.sql:7`.)
   Note `worked_last_night` is the night-shift recovery flag — treat it as "off this morning."

2. **Default start time** when `arrival_time` is null. Today the cron `.not('arrival_time','is',null)` **silently skips** jobs with no time. Change to: if an operator is scheduled today but has no resolved start time, fall back to `tenants.default_start_time` (new nullable column, default `'07:00'`) so they still get a reminder. Add to the migration:
   ```sql
   ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS default_start_time time NOT NULL DEFAULT '07:00';
   ```

3. **Night-shift handling.** If the operator's earliest job today is `is_night_shift = true`, the "start time" is an evening wall-clock (e.g. 18:00). The existing `nowMinutesInTz` + `clockInReminderPhase` math already works for any minutes-since-midnight value, so **no special casing needed for clock-IN** — an 18:00 start reminds at 18:05. The only night-shift nuance is on clock-OUT (§3B) and PTO (`worked_last_night` above).

### 3B. NEW: clock-OUT reminders at 10h / 12h / 15h

**Recommendation: add a thin handler, piggybacked on the `work-performed-reminders` `*/15` cron** (or a dedicated `*/15` cron if you prefer separation — both are fine; piggyback saves a slot). Below is a standalone route for clarity; the logic is identical if folded into the existing file.

New file: `app/api/cron/clock-out-reminders/route.ts` (mirror auth + per-tenant loop exactly from `clock-in-reminders/route.ts:27-45`).

**Dedup mechanism:** reuse `reminder_log` via `sendReminderOnce`. Keys: `clock_out_10h:<today>`, `clock_out_12h:<today>`, `clock_out_15h:<today>`. The UNIQUE(user_id, reminder_key) constraint guarantees each of the three fires at most once per operator per day, even across overlapping `*/15` ticks. **Recommended over a new column set** — `reminder_log` is the established pattern (`lib/send-reminder.ts:130`) and needs no schema change.

> **Night-shift / midnight-crossing caveat for the `today` key:** a night-shift operator clocks in at 18:00 and crosses midnight; at the 10h mark (04:00 next day) `todayInTz()` returns a *new* date, so `clock_out_10h:<newday>` is a fresh key — correct, no double-send risk, but the key date is the *firing* date not the clock-in date. That's fine (still one-per-threshold). Use the **clock-in date** in the key if you want the three keys grouped to the shift: `clock_out_10h:${clockInDate}`. **Recommended: key off the clock-in date** to keep a shift's three reminders together and immune to the midnight boundary.

#### Pseudocode (full handler)

```ts
export const dynamic = 'force-dynamic';
import { sendReminderOnce } from '@/lib/send-reminder';
import { todayInTz } from '@/lib/reminder-timing';
import { supabaseAdmin } from '@/lib/supabase-admin';

// thresholds in hours → reminder key suffix
const OUT_THRESHOLDS = [
  { hours: 10, key: '10h', title: 'Still on the clock',
    body: "You've been clocked in 10 hours. Don't forget to clock out when you're done." },
  { hours: 12, key: '12h', title: 'Clock out reminder',
    body: "12 hours on the clock — please clock out if your shift has ended." },
  { hours: 15, key: '15h', title: 'Final clock-out reminder',
    body: "15 hours clocked in. Clock out now — your timecard will be auto-closed soon." },
];

export async function GET(request) {
  // 1. Auth — Bearer CRON_SECRET, fail-closed (copy clock-in-reminders:27-36)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return 503;
  if (auth !== `Bearer ${cronSecret}`) return 401;

  const nowMs = Date.now();
  let sent = 0;

  for (const tenant of tenants) {            // SELECT id,timezone FROM tenants
    const tz = tenant.timezone || 'America/New_York';

    // 2. Open timecards: clocked in, NOT clocked out. (mirrors work-performed-reminders:47-53)
    //    No date filter — a night-shift card may belong to "yesterday" but still open.
    const { data: open } = await supabaseAdmin
      .from('timecards')
      .select('user_id, clock_in_time, date, is_night_shift')
      .eq('tenant_id', tenant.id)
      .not('clock_in_time', 'is', null)
      .is('clock_out_time', null);

    if (!open?.length) continue;

    // 3. Phone map for SMS fallback (mirrors clock-in-reminders:109-115)
    const phoneMap = ...;

    for (const tc of open) {
      const hoursIn = (nowMs - new Date(tc.clock_in_time).getTime()) / 3_600_000;
      // Night shift legitimately runs long — still remind, copy already neutral.
      // Pick the HIGHEST threshold crossed so a late cron tick doesn't fire 10h after 15h.
      const hit = [...OUT_THRESHOLDS].reverse().find(t => hoursIn >= t.hours);
      if (!hit) continue;

      // 4. Idempotent dispatch. Key off clock-in DATE so the 3 reminders group per shift.
      const res = await sendReminderOnce(`clock_out_${hit.key}:${tc.date}`, {
        userId: tc.user_id,
        tenantId: tenant.id,
        category: 'clock_in_reminder',     // reuse existing pref category (or add 'clock_out_reminder')
        inAppType: 'reminder',
        title: hit.title,
        message: hit.body,
        actionUrl: '/dashboard/timecard',
        smsPhone: phoneMap.get(tc.user_id) ?? null,
      });
      if (res) sent++;
    }
  }
  return NextResponse.json({ success: true, remindersSent: sent });
}
```

**Why "highest threshold crossed" (not all crossed):** if the cron is late/skips a tick, an operator at 15.2h would otherwise fire 10h, 12h, and 15h in one run. Picking the single highest unfired threshold + the `reminder_log` dedup means they get exactly the 15h message once. The 10h/12h keys for that day stay unclaimed but are now moot (they've passed) — acceptable. If you want *each* milestone guaranteed even when ticks are missed, drop the "highest only" and loop all thresholds where `hoursIn >= t.hours`; `sendReminderOnce` still dedups each. **Recommended: highest-only** to avoid burst-spam after an outage.

**Interaction with `auto-clockout`:** the 15h reminder is the last nudge before `auto-clockout` (`app/api/cron/auto-clockout/route.ts`) closes the card at tenant-midnight (day shift) / tenant-noon (night shift). 15h is intentionally *before* auto-close in most cases. No conflict — they read different state.

---

## 4. Notification dispatch — exact calls + copy

**Every reminder uses the same one function:** `sendReminderOnce(reminderKey, opts)` from `lib/send-reminder.ts:130`. It (a) claims the `reminder_log` slot (dedup), then (b) calls `sendNotification` which writes the in-app `notifications` row **and** fires APNs push via `sendPushToUser` (`lib/send-push.ts:97`) **and** optional SMS — all gated by the user's `notification_preferences` row (default push ON, SMS OFF). **Do not call `sendPushToUser` or insert into `notifications` directly** — go through `sendReminderOnce`.

| Reminder | reminder_key | category | title | message | actionUrl |
|---|---|---|---|---|---|
| Clock-in (pre, ~5 min before) | `clock_in_pre:<today>` *(exists)* | `clock_in_reminder` | `Clock in soon` | `Your shift starts at <7:00 AM>. Don't forget to clock in.` | `/dashboard/timecard` |
| Clock-in (post, ~5 min after) | `clock_in_post:<today>` *(exists)* | `clock_in_reminder` | `Time to clock in` | `You're scheduled to have started at <7:00 AM>. Please clock in now.` | `/dashboard/timecard` |
| Clock-out 10h | `clock_out_10h:<clockInDate>` | `clock_in_reminder` *(or new `clock_out_reminder`)* | `Still on the clock` | `You've been clocked in 10 hours. Don't forget to clock out when you're done.` | `/dashboard/timecard` |
| Clock-out 12h | `clock_out_12h:<clockInDate>` | same | `Clock out reminder` | `12 hours on the clock — please clock out if your shift has ended.` | `/dashboard/timecard` |
| Clock-out 15h | `clock_out_15h:<clockInDate>` | same | `Final clock-out reminder` | `15 hours clocked in. Clock out now — your timecard will be auto-closed soon.` | `/dashboard/timecard` |

The founder asked specifically for the **5-min-after** in-reminder; that's the existing `clock_in_post` row — already implemented, just needs the start-time source (§2) to be populated.

> **Optional pref category:** to let operators toggle clock-out reminders independently, add `'clock_out_reminder'` to the `NotificationCategory` union (`lib/send-reminder.ts:22`) and the comment in `20260523_push_and_reminders.sql:29`. Low effort; otherwise reuse `clock_in_reminder` and they share one toggle.

---

## 5. Edge cases + "smart" rules (explicit)

| Case | Handling |
|---|---|
| **Already clocked in** | Clock-in cron skips via `clockedIn` set (`clock-in-reminders/route.ts:104,118`). |
| **Already clocked out** | Clock-out cron only selects `clock_out_time IS NULL`. |
| **Day off / PTO / sick** | §3A.1 — skip operators with an `operator_time_off` row for `today`. Includes `worked_last_night` (night-shift recovery). |
| **Unassigned today** | Cron only builds candidates from operators with a job assignment today (`assigned_to`/`helper_assigned_to`/`job_daily_assignments`). No assignment → no reminder. |
| **No start time set** | §3A.2 — fall back to `tenants.default_start_time` (`'07:00'` default). Don't silently drop them. |
| **Multi-day jobs** | One `arrival_time` applies to all days of a multi-day job (acceptable — same crew, same site, same arrival). If a specific day differs, the board can set a `job_daily_assignments.start_time` override (§1.3 Option B), which the cron prefers. |
| **Operator on multiple jobs in a day** | Clock-in cron already takes the **earliest** arrival across all their jobs (`earliestStart` map, `route.ts:66-84`) — they get reminded for their first start. |
| **Night shift** | Clock-in: evening start works unchanged (minutes-since-midnight math is tz-agnostic). Clock-out: thresholds are hours-since-clock-in, so a long night shift still gets 10/12/15h nudges; copy is neutral ("if your shift has ended"). PTO `worked_last_night` suppresses the next-morning clock-in nudge. |
| **DST** | All wall-clock math goes through `Intl.DateTimeFormat` with the tenant IANA tz (`lib/reminder-timing.ts:20-32`) — DST-correct by construction. Hours-since-clock-in uses epoch ms (DST-immune). Never use `new Date('YYYY-MM-DD')` or `toISOString().split('T')[0]` for local dates (CLAUDE.md date rule; `lib/dates.ts` helpers available). |
| **Cron runs late / skips a tick** | Clock-IN windows are 6 min (pre) / 6 min (post) wide vs a 5-min cadence → one late tick still lands in-window; if it fully misses, that day's reminder is lost (acceptable, low frequency). Clock-OUT uses "highest threshold crossed" + dedup so a late tick sends one correct message, not a burst (§3B). |
| **Idempotency on cron re-run / concurrent invocation** | `sendReminderOnce` claims the `reminder_log` UNIQUE slot **before** sending; a duplicate insert errors → returns null → no send (`lib/send-reminder.ts:135-142`). Safe under Vercel's at-least-once cron delivery and overlapping runs. |
| **Operator with push disabled** | `notification_preferences` gates push; in-app bell still always written. |
| **Tenant isolation** | Every query filters `tenant_id`; reminders never cross tenants. |
| **Apprentices / helpers** | Open question §7 — `helper_assigned_to` is already considered for clock-in; decide whether helpers should get reminders. |

---

## 6. File-by-file change list

### Migrations (1 new, additive → apply directly to prod via MCP `apply_migration`)
- **NEW** `supabase/migrations/20260604_clock_reminders.sql` — DDL from §1.3 + `tenants.default_start_time` (§3A.2). All `IF NOT EXISTS`. **Verify `job_orders.arrival_time` live type before running** (§1.3 type note).

### Backend / cron
- **EDIT** `app/api/cron/clock-in-reminders/route.ts` — add PTO skip (§3A.1), default-start-time fallback (§3A.2). Remove the hard `.not('arrival_time','is',null)` drop in favor of the fallback.
- **NEW** `app/api/cron/clock-out-reminders/route.ts` — §3B (or fold into `work-performed-reminders/route.ts` if piggybacking the `*/15` cron).
- **EDIT** `app/api/admin/schedule-form/route.ts` — persist `arrival_time` + `is_night_shift` into `jobOrderData` (§2.2).
- **EDIT** `app/api/job-orders/[id]/route.ts` — ensure `is_night_shift` is in the PATCH allow-list (`arrival_time` already is, `:65`).
- **EDIT (optional)** `lib/send-reminder.ts` — add `'clock_out_reminder'` to `NotificationCategory` if using a separate pref toggle (§4).

### Frontend
- **EDIT** `app/dashboard/admin/schedule-form/page.tsx` — add `arrival_time` + `is_night_shift` to form interface (`:419`) + initializer (`:504`); add the "Crew Start Time" `InputField type="time"` + "Night Shift?" `Toggle` in Step 5 SectionCard (`:3600`); add both to `payload` (`:1613`) and the edit-mode PATCH body (`:1714`).
- **EDIT (optional)** `app/dashboard/admin/schedule-board/page.tsx` — surface a night-shift toggle in the edit modal (arrival_time field already wired, `:1136`).

### `vercel.json`
- If **standalone clock-out cron**: add a function entry + a cron entry:
  ```jsonc
  // functions:
  "app/api/cron/clock-out-reminders/route.ts": { "maxDuration": 60 },
  // crons:
  { "path": "/api/cron/clock-out-reminders", "schedule": "*/15 * * * *" }
  ```
- If **piggybacking `work-performed-reminders`**: no `vercel.json` change.

### No changes needed (reuse as-is)
`lib/send-reminder.ts` (dispatch + dedup), `lib/send-push.ts` (APNs), `lib/reminder-timing.ts` (window math — clock-out adds its own threshold list), `reminder_log` / `notifications` / `notification_preferences` / `push_tokens` tables.

---

## 7. Open questions for the founder

1. **Default start time** — confirm `07:00` as the tenant-wide fallback when a job has no `arrival_time`. Should it be per-tenant configurable (planned as `tenants.default_start_time`) or hard-coded for Patriot?
2. **Apprentices / helpers** — should `helper_assigned_to` operators get the same clock-in/out reminders, or only the lead operator? (`helper_assigned_to` is currently included in the clock-in candidate set.)
3. **Quiet hours** — any wall-clock window where push should be suppressed (e.g. don't push between 22:00–05:00)? Relevant for the 15h clock-out reminder on a day shift (could land near midnight) and night-shift reminders.
4. **Clock-out thresholds** — confirm 10h / 12h / 15h. Note `auto-clockout` already closes forgotten cards at tenant-midnight (day) / tenant-noon (night). Should the 15h reminder text reference auto-close, and should auto-close timing be aligned with the 15h nudge?
5. **Separate pref toggle** — should operators be able to turn clock-out reminders on/off independently of clock-in (`clock_out_reminder` category), or share one toggle?
6. **Night-shift on the form** — should "Night Shift?" be a per-job toggle on the schedule form (proposed), or inferred from `arrival_time` being in the evening?
7. **Multi-day jobs** — is one shared `arrival_time` across all days acceptable, or do per-day start times need first-class UI (the `job_daily_assignments.start_time` override exists but has no form/board UI yet)?

---

## 8. Conventions compliance checklist (for the architecture-guardian)

- [x] No new table without `tenant_id` + RLS — **no new tables added**; reuses RLS-enabled `reminder_log`/`notifications`/`notification_preferences`.
- [x] No `auth.jwt() -> 'user_metadata'` in any policy — N/A (no new policies; crons use `supabaseAdmin`).
- [x] CRON auth = `Bearer ${CRON_SECRET}`, fail-closed — mirrors `clock-in-reminders/route.ts:29-36` exactly.
- [x] Date handling — all local/tz math via `Intl.DateTimeFormat` + tenant IANA tz; no `new Date('YYYY-MM-DD')` / `toISOString().split('T')` for local dates.
- [x] Fire-and-forget pattern preserved — `sendNotification` swallows per-channel errors; cron continues per-tenant on error.
- [x] Reuse existing notification infra (in-app + APNs + SMS) — single entry point `sendReminderOnce`.
- [x] Idempotent migration DDL (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- [x] Mobile-first — start-time picker uses existing 16px-floored `InputField type="time"`.
- [x] Multi-tenant — every cron query filters `tenant_id`; tenant default start time per-tenant.
- [x] Deploy cost — one push covers form + cron + migration; cron changes are config-only beyond the new route.
