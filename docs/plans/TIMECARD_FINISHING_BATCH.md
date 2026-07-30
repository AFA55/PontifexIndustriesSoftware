# Timecard Finishing Batch — plan (Jul 30, 2026)

Founder's "final touches" for the timecard/timeclock system. Payroll-adjacent → **highest
scrutiny**: additive migrations, guardian behind every builder, rigorous testing, one source
of truth per fact. Below is the mapped current state + phased build. Legend: **NOW** = web/backend,
ships without an app-store build · **NATIVE** = needs an iOS/Android rebuild + store review.

---

## 0. Notifications can't scroll — ✅ FIXED (committed, pending push)
`components/NotificationBell.tsx`: a capturing `window` scroll listener closed the dropdown when
the user scrolled the list itself. Now it ignores scrolls that originate inside the panel.

## 1. Configurable auto-clockout time (default 6pm) — **NOW**
**Current:** `app/api/cron/auto-clockout/route.ts` exists but closes cards at hardcoded local
**midnight/noon** (scheduled `0 0` + `0 12` UTC in `vercel.json`). An orphaned setting
`timecard_settings_v2.auto_clock_out_hours` (default 16) shows in the admin UI ("Auto Clock-Out
After [hours]") but **the cron never reads it** — dead.
**Build:** add `auto_clockout_time TIME DEFAULT '18:00'` (+ `auto_clockout_enabled bool`) to
`timecard_settings_v2`; admin control on `app/dashboard/admin/settings/timecard/page.tsx` (a time
picker + toggle, default 6pm) wired via `app/api/admin/timecard-settings/route.ts`; rework the cron
to run frequently (e.g. hourly) and close each tenant's open cards once local wall-clock ≥ the
configured time, setting `clock_out_time` to that local instant (reuse the per-tenant tz loop +
`wallTimeToUTC`). Keep the >4h guard + `auto_closed` + notification. Also reconcile the second
auto-close path (clock-in route closes prior-day cards to 23:59:59).

## 2. Continuous GPS + auto-arrival + "back at shop" reminder — **MOSTLY NATIVE (founder decision)**
**Reality:** the app is a remote-URL **webview**; all location is browser `navigator.geolocation`,
which only runs **while the app is open/foregrounded**. `@capacitor/geolocation` is installed but
**unused**; there is **no** background-geolocation plugin. The privacy policy + GPS consent docs
**explicitly promise "never in the background or when the app is closed."** There is also **no
stored jobsite lat/lng** to geofence against (addresses aren't geocoded+saved).
- **True all-day tracking / background auto-arrival / app-closed shop reminder** = a native
  background-geolocation plugin + iOS "Always" permission + `UIBackgroundModes: location` + Android
  `ACCESS_BACKGROUND_LOCATION` + **new iOS+Android builds & store review** + **rewriting the privacy/
  consent docs & re-consenting users** + battery cost. Real project, weeks + review risk.
- **Ships NOW without any of that:**
  - **(a) Time-based clock-out reminder** — a push near the configured auto-clockout time (or X hrs
    after clock-in) "Ready to clock out?" Reuses `@capacitor/local-notifications` + `lib/send-reminder.ts`
    + `reminder_log`. Directly solves "they forget." **Recommended immediate win.**
  - **(b) Foreground auto-arrival** — while the app is open + In-Route, compare each `watchPosition`
    ping (existing `hooks/useLocationBroadcast.ts`) against a stored jobsite pin → auto-stamp arrival.
    Requires persisting a geocoded jobsite lat/lng on the job (additive). Partial (app must be open).
  - **(c) Foreground "at shop" nudge** — same, against the shop geofence in `lib/geolocation.ts`.
- **Recommendation:** ship (a) now; treat (b)/(c) background version as a separate native initiative
  the founder explicitly greenlights (privacy/battery/store tradeoffs understood).

## 3. Out-of-town subsistence prompt at clock-out — **NOW**
**Current:** `subsistence_nights` table (idempotent UNIQUE `(operator_id, night_date)`) + rate
setting exist. Subsistence is captured at **day-complete** and **remote clock-in** — **not** at the
normal clock-out. `job.scheduling_flexibility.out_of_town` + per-shift `timecards.out_of_town` mark
out-of-town.
**Build:** on clock-out, if the active card is `out_of_town`, prompt "Did you stay overnight?"; on
yes, fire-and-forget upsert one `subsistence_nights` row for `night_date = today` (tenant-tz — MUST
match the clock-in/daily-log derivation so the unique row converges). Never blocks clock-out.
**Watch-out:** two divergent readers — operator-report counts `timecards.out_of_town`; team-summary/
operator view count `subsistence_nights` rows. Pick **`subsistence_nights` as the source of truth**
and make operator-report read it too (small fix), else the two reports disagree.

## 4. Double-time tag (pay = regular × 2 for chosen people/days) — **NOW (payroll — high scrutiny)**
**Current (partial):** `timecards.double_time_hours` column, `pay_type_override='double_time'`
(CHECK-valid), `timecard_settings_v2.double_time_multiplier` (2.0), and a DT badge all exist. **Gaps:**
setting the override recomputes `labor_cost` but does NOT populate `double_time_hours`; and the
aggregators (`team-summary`, `operator-report`, `lib/timecard-utils.ts calculateWeekSummary`) ignore
DT entirely — so a tag is invisible in payroll totals.
**Build:** (i) a bulk "mark double-time for these people on this date" admin tool (model on the
holiday `apply` endpoint) that sets `pay_type_override='double_time'` on the target cards; (ii) make
DT flow into hours/pay — populate `double_time_hours = total_hours` on override, and carve DT out of
the 40-hr base in `calculateWeekSummary` (OT-exempt, mirroring holiday/subsistence) + read it in
team-summary/operator-report. **Watch-out:** the legacy DB trigger `calculate_timecard_hours` also
writes daily-threshold DT (>12h/day) — reconcile so a >12h day + a holiday-DT tag don't double-apply.

## 5. Holidays + calendar + "Paid Holiday" on the schedule board — **NOW (mostly built)**
**Current (~80% built):** `company_holidays` table, full CRUD (`/api/admin/company-holidays`), an
idempotent **apply-holiday-pay** endpoint (`/[id]/apply` — inserts `entry_type='holiday'` timecards,
OT-exempt), an admin settings page (`settings/holidays`), and holiday-aware pay math. **Gap:** the
**schedule board is holiday-unaware** (no badge, no prompt).
**Build:** fetch `company_holidays` for the visible week (mirror the daily-notes/time-off per-day
overlay pattern); render a "Paid Holiday" badge in `WeeklyView.tsx` day header (+ single-day header);
an "approaching holiday → Paid Holiday" action that prompts hours-to-pay and calls the **existing**
apply endpoint (no new pay path). Calendar "smart" = the board surfacing the already-stored holidays.

## 6. 60-day tenure eligibility — **NOW (payroll gate — needs a founder rule)**
**Current:** does NOT exist. `profiles.hire_date` is stored + admin-editable, but no tenure logic
anywhere; holiday eligibility is **role-only**.
**Build:** (i) add a tenure filter to the holiday `apply` endpoint — eligible = `holiday_date −
hire_date ≥ 60 days`; report a "skipped (under 60 days)" count. (ii) a read-only "Who's past 60 days"
admin view (derive `daysEmployed` from `hire_date`). Consider a per-tenant threshold setting (default
60). **Open decision:** employees with a **null hire_date** — ineligible, or grandfathered eligible?
(This directly gates pay, so the founder must choose.)

---

## Phasing (each phase = its own guarded build + push-batch)
- **Phase A (quick, low-risk):** #0 notifications (done) · #5 holiday board badge+prompt (reuses
  built pay path) · #1 configurable 6pm auto-clockout · #3 subsistence-on-clockout prompt.
- **Phase B (payroll math, high scrutiny):** #4 double-time tag + make DT flow through payroll ·
  #6 60-day tenure gate + "past 60 days" view.
- **Phase C (native, founder-gated):** #2 background GPS geofencing (auto-arrival + app-closed shop
  reminder). Ship the #2(a) time-based clock-out reminder in Phase A as the interim.

## Founder decisions (Jul 30 — locked)
1. **GPS → COMMIT TO NATIVE.** Pursue the native background-geolocation project (auto-arrival +
   app-closed shop reminder). This is **Phase C** — its own initiative: native plugin, iOS "Always"
   review, privacy-policy rewrite + re-consent, iOS+Android builds. Ship the **time-based clock-out
   reminder in Phase A** as the interim; do the non-native groundwork (persist geocoded jobsite
   lat/lng) alongside. The native build + store submission is separate and needs its own sign-off.
2. **60-day → GRANDFATHER.** Null `hire_date` = eligible (assume past 60 days). Only a hire_date that
   is set AND < 60 days ago excludes.
3. **Double-time → HOURS × 2 RATE.** Per-day, per-person tag on their real timecard; the hours they
   actually worked that day are paid at 2× the regular rate (not 2× on top). A holiday can be tagged
   double-time (2×) instead of the normal 1× holiday pay.
4. **Subsistence source of truth → `subsistence_nights` table.** Standardize on it; fix the annual
   report (operator-report) to read the table instead of `timecards.out_of_town` so numbers agree.
