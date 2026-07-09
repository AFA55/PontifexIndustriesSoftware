# Patriot Reports — Attendance Tracker + Payroll Worksheet (Jul 8, 2026)

> Source: two paper reports from Patriot's admin/owner (photos analyzed Jul 8). These are the
> formats the owner already knows how to read — our reports should carry the same information,
> modernized. Founder also wants Artifex to answer all of it conversationally.

## Report 1 — Employee Attendance Tracker (per employee, per year)

Excel sheet, one page per employee. Header: name, employee ID, hire date, termination +
rehire dates, vacation recap (current/future days available, days taken, rollover) and a
per-anniversary-year vacation table. Body: a YEAR × MONTH × DAY grid (rows = months,
columns = day 1–31, weekends shaded, invalid days blacked out) where each cell holds an
**attendance code**. Right edge: totals per month (vac days, holidays, med leave, absent PTO)
and yearly totals.

**Patriot's attendance code list (model these verbatim):**

| Code | Meaning |
|---|---|
| EA | Excused Absence / called in sick (Dr.'s note) |
| UA | Unexcused Absence / called in sick (NO Dr.'s note) |
| NCNS | No Call / No Show |
| STO | Scheduled Time Off / UNPAID |
| ML | Medical Leave of Absence |
| FL | Family Leave of Absence |
| S | Suspension |
| LE | Leave Early |
| T | Tardy |
| V | Vacation |
| W | Weather |
| NW | No Work |
| H | Holiday |
| GD | Guard Duty |
| WH | Work From Home |

**What we already track:** T (is_late on timecards), V/STO (operator_time_off approved
requests), late minutes.
**What's new:** a first-class `attendance_events` table (tenant_id, user_id, date, code,
note, created_by) for the codes that are *judgment calls an admin records* (EA vs UA,
NCNS, S, LE, W, NW, GD, WH, ML, FL). Codes tenant-configurable later; ship Patriot's list
as the default set.

**Build (post-demo):**
1. Migration: `attendance_events` + `attendance_codes` (tenant-scoped, seeded with the table above).
2. Admin UI: month-grid per employee (visually mirrors the paper sheet: codes in day cells,
   weekend shading, totals column), quick "mark today" entry from the attendance page,
   monthly/quarterly/yearly rollups, all-employees summary table, CSV/PDF export.
3. Auto-derive where possible: T from is_late, V/STO from approved time-off, H from a
   tenant holiday calendar — admin only records the judgment codes.
4. Artifex tool `get_attendance_summary(person?, startDate, endDate)` → counts per code.
5. Vacation accrual recap (days available/taken/rollover per anniversary year) — needs a
   tenant vacation-policy setting; Phase 2 of this feature.

## Report 2 — Bi-weekly Payroll Worksheet (whole crew, per pay period)

One row per employee, columns: **Reg Hours (wk 1&2), Overtime, Shop Hours, Training Hours,
Mandatory OT, Holiday Hours, Double Time, Vacation Hours, Total Hours, Regular Shift Premium
Hours, QB Total Hrs** + a hand-check column for QuickBooks entry. Side tables: **Subsistence**
(name, dates, # nights, amount — $60/night, before-noon return ≠ extra night), **Mandatory OT**
log, **Late Job Tickets** log, **Employee Loan Payments** (balance, per-check payment),
**Automatic Deductions** (401k loan etc.). Pay period 6/20→7/3, paid 7/10 (bi-weekly; must
also support weekly tenants → pay-period config on tenant).

**What we already track (timecards table):** regular_hours, overtime_hours,
double_time_hours, night_shift_premium_hours (= their "premium"), is_shop_hours,
net/gross/total hours, is_late/late_minutes, out_of_town (subsistence nights), week_start,
hour_type/pay_category (training/holiday candidates), labor_cost.
**Gaps:** vacation hours as payroll hours (derive from approved time-off days × 8),
mandatory-OT flag, loan/deduction ledger (QuickBooks stays the system of record for
deductions — we replicate the WORKSHEET, not the paycheck).

**Build:**
1. ✅ SHIPPED Jul 8: Artifex `get_hours_summary(startDate, endDate, person?)` — per-employee
   regular/OT/DT/shop/night-premium/total + late days + out-of-town nights + weekly split.
2. Post-demo: Payroll Worksheet page — pay-period picker (tenant pay_schedule: weekly |
   biweekly + anchor date), the exact column set above, per-week split, subsistence side
   table ($ amount from tenant setting), CSV export formatted for QuickBooks entry.
3. Later: training/mandatory-OT/holiday buckets once hour_type usage is confirmed in the
   field; loan-payment ledger only if they want off QuickBooks for it.

## Artifex schedule history + quick search (✅ SHIPPED Jul 8)

`search_job_history` tool: full schedule history by person (operator OR helper), customer,
date range, status — "what jobs has Marcus done", "who was on the hospital job in May" —
no more scrolling the schedule board. Backed by schedule_board_view (operator_name,
helper_name, scheduled_date already there; zero schema changes).
