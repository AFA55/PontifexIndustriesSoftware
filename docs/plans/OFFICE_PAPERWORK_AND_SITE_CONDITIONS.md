# Office paperwork + job site conditions — two features, one plan

> Written Aug 15, 2026 against `main`. Every route, column, helper and line number below was read out of
> the source or queried against production (`klatddoyncxidgqtcjnu`). Anything that does not exist yet is
> marked **NEW**.
>
> Companion reading: `docs/plans/SYSTEM_MAP.md` (what calls what, and where the joins are weak),
> `lib/work-ticket.ts` (the printed job ticket's rules), `lib/work-items-format.ts` (the customer-facing
> boundary).

---

## 0. The paper workflow these two features replace

The founder described the loop that runs today, on paper:

1. A project manager **hand-writes a job ticket** and photocopies it. He keeps one, the operator gets one.
2. The operator finishes and **submits a paper ticket** with his time and the work he performed.
3. The founder takes the job off the schedule and moves it to completed.
4. Admin finds the operator's filled-out ticket, **staples it to the completed ticket**.
5. The project manager fills out **one more sheet** with the invoice and the work performed.
6. The whole bundle is paperclipped and **submitted for payroll**.

Steps 1–3 are already software: the schedule board writes the job, the operator's work-performed flow
writes `work_items` + `daily_job_logs`, and `/dashboard/admin/jobs/[id]/work-ticket` prints the ticket.

**Step 4 is the gap.** That staple exists because the office's two documents are indexed differently:
the job ticket is indexed by JOB, and payroll is indexed by PERSON. Nobody can print the second one.
Feature 1 is that missing sheet.

**Step 5 is the other gap.** The PM writes a summary sheet because the digital record doesn't carry the
story — it carries quantities. "Five holes" is in the system; "five holes on five different levels,
five hundred feet from the truck, and we had to drop a generator" is not. Feature 2 captures that on the
one day it can honestly be captured: the first day the crew is on site.

His goal, verbatim: **"make this as simple as possible for the admin in the office."**

---

# FEATURE 1 — "Work Performed Tickets" print page

## 1.1 The outcome

A new office tab, **Work Performed Tickets**, that lists every crew member with the jobs they were on and
the hours they worked, for a day, a week, or a custom range. The office ticks the people they want —
or all of them — presses **Print**, and gets one sheet per person per period: their name, their days,
which job they were on each day, what they typed they did, and their hours with a total. It is the sheet
that gets stapled to the timecard and goes to payroll. In the founder's words: *"It just shows the work
performed that they did along with their schedule. It doesn't have to be nothing grand."*

## 1.2 What exists already vs what is new

### The transpose

Today's ticket (`app/dashboard/admin/jobs/[id]/work-ticket/page.tsx`) is **job-centred**: one job, its
days, and inside each day its crew. `buildTicketDays()` in `lib/work-ticket.ts` produces
`[{ date, people[] }]` for exactly one `job_order_id`.

This feature is the **person-centred transpose**: one person, their days, and inside each day the jobs
they touched — `[{ person, days: [{ date, jobs[] }] }]`. Same source rows, the grouping key rotated 90°.

### Reused verbatim (no new logic)

| Piece | File | Used for |
|---|---|---|
| `ticketRange` / `inRange` | `lib/work-ticket.ts:38,47` | day / week window, string-compared ISO dates |
| `isShopCard` | `lib/work-ticket.ts:127` | identifying shop cards — **used with the opposite verdict**, see §1.7 |
| `resolveWorkItemDate` | `lib/work-ticket.ts:175` | the 4-step date resolution for pre-`work_date` `work_items` rows |
| `normalizeLoggedWork` / `enrichFromLoggedWork` | `lib/work-ticket.ts:218,263` | reconciling `daily_job_logs.work_performed` against `work_items` so nothing prints twice |
| `ticketWorkDetail`, `workTypeUnit`, `sumFootage`, `workItemLinearFeet/Cores` | `lib/work-ticket.ts:306,617,626,589,601` | the printed measurement text and the footage subtotal |
| `CREW_ROLE_LABEL`, `resolveCrewRoles` | `lib/work-ticket.ts:71,92` | Lead / Operator / Helper / Crew badges |
| `workItemDetailLine`, `workItemQuickNote`, `summarizeWorkItem` | `lib/work-items-format.ts:210,267,278` | one work line, and the operator's Quick Note |
| `toLocalYMD`, `parseYMDLocal`, `formatDay`, `formatTime`, `weekStartOf`, `weekDatesFrom` | `lib/dates.ts` | every date. **`weekStartOf(ref, startDay)` already takes a configurable week start** (`:101`) — that matters, see §1.7 |
| The print CSS block | `work-ticket/page.tsx:511-523` | print isolation, forced white background, `.no-print` toolbar. Adapted, not copied — see §1.5 |
| `Field` / `Blank` / `SectionBar` / `WorkLine` | `work-ticket/page.tsx:100,109,199,221` | the paper-form look. Worth lifting into `app/dashboard/admin/_components/ticket-primitives.tsx` (**NEW file, same code**) so both sheets stay identical |
| `useBranding()` | `lib/branding-context` | tenant logo + accent. White-label by default |

### Genuinely new

| Thing | Why it can't be reused |
|---|---|
| **NEW** `lib/person-ticket.ts` | `buildTicketDays()` takes one job's rows and groups `date → person`. This groups `person → date → job`. Pure, unit-testable, same discipline as `lib/work-ticket.ts` (no supabase, bare-string dates). |
| **NEW** `GET /api/admin/work-performed-tickets` | Every existing ticket route is `.eq('job_order_id', jobId)`. This one starts from a date range and a tenant. |
| **NEW** `/dashboard/admin/work-performed-tickets` page | The person index + multi-select + print. |
| **NEW** multi-sheet print CSS | The job ticket's `position: absolute; left: 0; top: 0` (`:520`) deliberately overlays ONE page. N sheets need `break-after: page` instead. |

### Deliberately NOT reused: `lib/job-clock-attribution.ts`

`attributableTimecards(jobId, userIds, dates)` answers *"how many of this person's hours belong to this
job?"* — and its own docblock (`:26-30`) says that on a day someone touched two jobs the split is
"genuinely unknowable", so it reports `splitDates` instead of guessing.

**The person sheet does not need that question answered, and must not pretend to.** A person-day has one
timecard and one hours figure. The sheet prints that figure **once, against the day**, and lists the jobs
beneath it. On the common single-job day the number is unambiguous; on a split day the office sees both
jobs and one honest total rather than two invented halves.

`attributableTimecards` stays where it is. `isShopCard` and the multi-card collapse rule
(`buildTicketDays` step 1, `lib/work-ticket.ts:437-451` — earliest in, latest out, summed lunch, summed
hours) are lifted into `lib/person-ticket.ts` so a re-clock-in after a bad clock-out still collapses to
one row.

## 1.3 Data model

**No new tables and no new columns.** Everything this feature prints already exists:

| Table | Columns read | Role on the sheet |
|---|---|---|
| `profiles` | `id, full_name, role, tenant_id, is_active` | who appears, and the name at the top of each sheet |
| `timecards` | `id, user_id, date, clock_in_time, clock_out_time, lunch_duration_minutes, break_minutes, net_hours, total_hours, is_shop_hours, is_shop_time, work_location, job_order_id` | Start / End / Lunch / Total. **The payroll truth.** Column list = `TIMECARD_ATTRIBUTION_SELECT` (`lib/job-clock-attribution.ts:51`) |
| `daily_job_logs` | `id, job_order_id, operator_id, log_date, day_number, hours_worked, work_performed, notes` | which job, the day note, the hours fallback |
| `helper_work_logs` | `job_order_id, helper_id, log_date, work_description, hours_worked, is_shop_ticket` | the helper's narrative (helpers file only this) |
| `work_items` | `id, job_order_id, operator_id, daily_log_id, day_number, work_date, work_type, quantity, notes, details_json, core_*, linear_feet_cut, cut_depth_inches, accessibility_rating, created_at` | the measurements, attributed to whoever filed them |
| `job_daily_assignments` | `job_order_id, assignment_date, operator_id, helper_id` | the office's own placement — catches a day worked with no log filed, and names the day's lead |
| `job_orders` | `id, job_number, customer_name, address, location, assigned_to, tenant_id` | the job label on each line |

Every one of those tables has `tenant_id`. Scope every query with it, the same way
`app/api/admin/jobs/[id]/work-ticket/route.ts:80` does (`const scoped = (q) => tenantId ? q.eq('tenant_id', tenantId) : q`).

RLS is not the boundary here — the route uses `supabaseAdmin` per project convention — but the tenant
filter in the query is, and it is not optional.

## 1.4 API routes

### `GET /api/admin/work-performed-tickets` — **NEW**

```
?from=YYYY-MM-DD & to=YYYY-MM-DD          (required, inclusive, both validated /^\d{4}-\d{2}-\d{2}$/)
&userIds=uuid,uuid                        (optional — omit for everyone with activity in range)
&detail=1                                 (optional — include work lines + notes; the index omits them)
```

**Guard: `requireAdmin`** (`lib/api-auth.ts:140`, = `admin`, `super_admin`, `operations_manager`).

Why not wider: this sheet carries hours, lunch deductions and the crew's internal notes for **every**
person in the tenant. That is the payroll set, not the schedule set.

**And the page guard must be the same three roles** — `['admin','super_admin','operations_manager']` read
from `profiles`, *not* `isAdmin()` from `lib/auth.ts`. `isAdmin()` returns true for five roles
(`lib/auth.ts:117`) and is the exact cause of `SYSTEM_MAP.md` weak join #1: the timecards page admits
supervisor and salesman and then 403s on every fetch, forever, with no error. Do not repeat it here.

If the founder later wants David (supervisor) to print these, the correct move is
`requireTimecardViewer` (`lib/api-auth.ts:190`, already exists, = admin set + supervisor) on the route
**and** `TIMECARD_VIEWER_ROLES` on the page, changed together in one commit.

Response:

```jsonc
{ "success": true, "data": {
  "range": { "from": "2026-08-09", "to": "2026-08-15" },
  "people": [{
    "user_id": "…", "name": "Dante …", "role": "operator",
    "total_hours": 47.31, "days_worked": 5, "job_count": 3,
    "days": [{
      "date": "2026-08-12",
      "clock_in": "…", "clock_out": "…", "lunch_minutes": 30,
      "hours": 10.37,
      "is_shop_day": false,
      "jobs": [{
        "job_order_id": "…", "job_number": "JOB-2026-914932",
        "customer_name": "AM King", "address": "…",
        "crew_role": "lead",              // this person's role THAT day
        "day_lead_name": "Dante …",       // who led the day, from job_daily_assignments
        "work_items": [ /* WorkItemLike */ ],
        "logged_work": [ /* normalizeLoggedWork(daily_job_logs.work_performed) */ ],
        "log_note": "…", "helper_note": null,
        "footage": { "linearFeet": 132, "cores": 7 }
      }]
    }]
  }],
  "totals": { "hours": 312.8, "people": 9 }
} }
```

### Existing routes: unchanged

Nothing about `/api/admin/jobs/[id]/work-ticket` changes. The two sheets read the same rows through
the same helpers and answer different questions.

## 1.5 The screens

### A. `/dashboard/admin/work-performed-tickets` — the index

Sidebar entry in `components/DashboardSidebar.tsx`, next to **Timecards** (`:154`) rather than next to
Completed Jobs — it is a payroll document, and that is where the office's hands already are.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Work Performed Tickets                                               │
│ [ Day ] [ Week ] [ Custom ]   ◀ [ Aug 9 ] – [ Aug 15 ] ▶             │
│ ☑ Select all (9)                       Selected: 4 · ~4 pages  [Print]│
├──────────────────────────────────────────────────────────────────────┤
│ ☑ Dante ……… Lead      5 days   3 jobs   47.31 hrs   AM King, Pratt…  │
│ ☑ Zack ………… Operator  4 days   2 jobs   38.02 hrs   Parkk, Collins   │
│ ☐ Micah ……… Helper    5 days   1 job    41.50 hrs   Parkk            │
│ ☑ Keontre …… Operator  3 days   2 jobs   26.75 hrs   Harper, Pratt    │
└──────────────────────────────────────────────────────────────────────┘
```

- Rows are **people**, sorted by role rank then name (`ROLE_RANK` from `lib/work-ticket.ts:78`).
- Anyone with a timecard, a log, a helper log or a placement in range gets a row — including a person
  whose whole week was shop time or PTO. Payroll cannot lose a person because they never touched a job.
- The right-hand column is the job list, truncated. It is the founder's *"show what jobs they've been on."*
- Multi-select + select-all, and a page estimate before the print dialog opens.

### B. The printed sheet — one per person per period

**Portrait**, not landscape. The job ticket went landscape (`work-ticket/page.tsx:516`) because it packs
day blocks side by side; this sheet is a tall list of days for one person.

```
[logo]  PATRIOT CONCRETE CUTTING            WORK PERFORMED TICKET
        269 S Old Piedmont Hwy · (xxx)      Aug 9 – Aug 15, 2026

  DANTE ………………                                    LEAD
  ──────────────────────────────────────────────────────────────
  WED  AUG 12        JOB-2026-914932 · AM King · 474 Oconee …
                     7:04a – 5:26p   30 min lunch          10.37 hrs
    • WALL SAW — 132 LF @ 6" (rebar #4)
    • CORE DRILL — 7 holes — 2× 4" @ 10", 5× 6" @ 12"
    Notes: set poly, waited on the contractor until 9:30
  ──────────────────────────────────────────────────────────────
  THU  AUG 13        JOB-2026-895358 · Pratt · Westminster
                     6:58a – 4:12p   30 min lunch           8.73 hrs
    • SLAB SAW — 400 LF @ 8"
    Notes: ______________________________________________
  ──────────────────────────────────────────────────────────────
  FRI  AUG 14        SHOP                                   8.00 hrs
  ──────────────────────────────────────────────────────────────
                                        TOTAL TIME    47.31 hrs
  Office use: ______________  Payroll: ______________
```

Details that matter:

- **A day with no typed work still prints its row and two ruled lines**, exactly like the job ticket does
  (`work-ticket/page.tsx:313, 388`). The founder's standing rule: the sheet has the same shape every time,
  so the office knows where to look and the crew knows where to write.
- The **office-use** line at the foot is the ruled blank the staple used to carry.
- Tenant-branded from `useBranding()`. No Patriot string is hardcoded.

**Print CSS — the one real change.** The job ticket isolates a single page:

```css
body * { visibility: hidden; }
.work-ticket, .work-ticket * { visibility: visible; }
.work-ticket { position: absolute; left: 0; top: 0; width: 100%; }
```

`position: absolute` stacks every sheet on top of the first. For N sheets:

```css
@page { size: letter portrait; margin: 0.4in; }
body * { visibility: hidden; }
.print-root, .print-root * { visibility: visible; }
.print-root { position: absolute; left: 0; top: 0; width: 100%; }
.person-sheet { break-after: page; break-inside: auto; }
.person-sheet:last-child { break-after: auto; }
.day-block { break-inside: avoid; }
```

## 1.6 What is allowed on this sheet that is forbidden on the customer's

This is an **internal office document**, and the distinction is enforced by code, not by intent.

`lib/work-items-format.ts` has a section headed *"Customer-facing boundary"* (`:290`). Two functions
strip the operator's Quick Note at the trust boundary:

- `toCompletionPdfWorkItems()` (`:318`) — the only work-item shape allowed onto a customer-signed
  completion PDF. Drops `notes` and `details_json.notes` so no caller can opt back in.
- `stripInternalNotes()` (`:353`) — recursive scrub applied on READ before `daily_job_logs.work_performed`
  crosses the public token boundary.

And on the printed job ticket, `WorkLine` is called with `showNote={false}` (`work-ticket/page.tsx:298`)
because the customer signs that sheet; the office-notes toggle exists to strip the typed narrative for
the customer copy (`:580`).

**The person sheet never touches either boundary.** It is served by a `requireAdmin` route, rendered on
an admin-guarded page, printed in the office, stapled to a timecard and filed with payroll. No customer,
no token, no PDF bucket, no portal. So:

| Field | Customer sheet | Person sheet | Why the difference is safe |
|---|---|---|---|
| `work_items.notes` / `details_json.notes` (Quick Notes) | ❌ stripped | ✅ printed | Prep, access, delays, who held us up. It is the reason payroll can read a 10-hour day as honest. Never leaves the office. |
| `daily_job_logs.notes` (day note) | toggle-gated | ✅ printed | Same. |
| `helper_work_logs.work_description` | toggle-gated | ✅ printed | It is often the only record a helper's day exists. |
| `accessibility_rating` / `_description` | ❌ | ✅ (badge) | Difficulty is an internal judgement about the site, not a claim to the customer. |
| Clock in / out / lunch / hours | partial | ✅ full | This IS the payroll document. |
| **NEW** site-conditions free text (Feature 2) | ❌ never | ✅ on the first day | Same reasoning. §2.6. |
| `hourly_rate`, `labor_cost`, any money | ❌ | ❌ **also forbidden here** | Payroll needs hours, not wages. Wages are `SYSTEM_MAP.md` weak join #4 and stay out of this payload entirely. |

**One rule this sheet inverts, and the reason it is correct to invert it.**

The printed job ticket carries the day LEAD's measurements only — `quantitiesFrom: 'lead'`, set at
`work-ticket/route.ts:245` and implemented at `lib/work-ticket.ts:500-535`. The lead walks the job at the
end of the day and measures the whole scope; printing a second crew member's figures counts the same
footage twice (Westminster printed 3,200 LF for 1,100).

On a **person** sheet, blanking a non-lead's entries would print an empty sheet for every helper — the
exact opposite of the founder's ask, which is *"what work performed THEY did."* So:

- Each person prints **their own** entries. Effectively `quantitiesFrom: 'everyone'`, per person.
- The per-person footage subtotal is labelled **"entered by this person — not the job total"**, and the
  sheet carries **no** job-wide footage figure. The double-count the lead rule prevents is a *summing*
  error; this sheet never sums across people.
- Each job line shows **"lead that day: <name>"** from `job_daily_assignments`, so the office can see at
  a glance whose numbers are the billing numbers. The billing figure stays exactly where it is — on the
  job ticket, lead-only.

Write this rule as a docblock at the top of `lib/person-ticket.ts`, the way `quantitiesFrom` is
documented at `lib/work-ticket.ts:366-384`. It is the kind of thing a future change quietly breaks.

## 1.7 Build order — each piece shippable on its own

**Piece 1 — the index API.** `GET /api/admin/work-performed-tickets?from=&to=` returning the index only
(name, role, days worked, job count, hours, job labels). No work lines, no print. Ships the founder's
*"show everybody's name and what jobs they've been on."*

**Piece 2 — the index page.** `/dashboard/admin/work-performed-tickets` + sidebar entry. Day / Week /
Custom range, multi-select, select-all, page estimate. Print button disabled with a "coming next" hint,
or wired to `window.print()` on the index itself so week 1 gets a roster sheet.

**Piece 3 — `lib/person-ticket.ts` + `?detail=1`.** The pure builder and its unit tests
(`lib/person-ticket.test.ts`, mirroring `lib/work-ticket.test.ts`). Test the four things that will
actually break: shop days are kept, two cards on one day collapse, a day worked with no log still
appears, and a `work_items` row with a null `work_date` lands on the right day.

**Piece 4 — the printed sheet.** Portrait layout, multi-sheet break CSS, tenant branding, the ruled
blanks, the office-use footer.

**Piece 5 — deep links.** "Print work performed tickets" on `/dashboard/admin/timecards` carrying the
week already selected, and on the job ticket page ("print this crew's person sheets").

**Piece 6 — the payroll week.** See below; can also lead if the founder's weekend hurts sooner.

## 1.8 What could go wrong

1. **🔴 The payroll week is Saturday→Friday and nothing in the codebase knows it.** `SYSTEM_MAP.md` §3.2:
   `mondayOf()` is the only week anchor, `timecard_settings.week_start_day` exists in the schema and a
   grep of `app/` and `lib/` returns exactly one hit — the migration itself. A sheet that gets stapled to
   payroll and runs Mon→Sun puts Saturday and Sunday in the wrong pay week.
   **Mitigation:** make **Custom range** the primary control (From / To pickers), with Day and Week as
   shortcuts. `weekStartOf(ref, startDay)` (`lib/dates.ts:101`) already accepts a start day — pass
   `'saturday'` for the Week shortcut on this page and label the button "Payroll week (Sat–Fri)". Do not
   silently change `mondayOf()` platform-wide from inside this feature.

2. **🔴 Shop time is excluded from the job ticket and must be included here.** `isShopCard()`
   (`lib/work-ticket.ts:127`) is used at `buildTicketDays` step 1 (`:439`) to `continue` — shop time is
   never job labor and must never be billed to a customer. On a **payroll** sheet those are real paid
   hours. Include shop cards, label the line `SHOP`, exclude them from the job footage subtotal, include
   them in TOTAL TIME. This is the single most likely bug in the feature: it will be introduced by
   copy-pasting `buildTicketDays`.

3. **A person with hours and no job disappears.** PTO, holiday stubs, a pure shop week. If the person
   list is built from `daily_job_logs` the payroll sheet loses them. Build it from the union of
   timecards ∪ logs ∪ helper logs ∪ assignments.

4. **`work_items` rows with a null `work_date`.** The column is new (`20260814c_work_items_carry_their_own_date.sql`)
   and older rows rely on `resolveWorkItemDate`'s inference chain, which needs the job's `daily_job_logs`
   in hand. Fetch logs for the same person set and date range and pass them in — same as
   `work-ticket/route.ts:230-247`. Items that resolve to nothing are dropped, never guessed onto a day.

5. **Volume.** 41 profiles × a month is fine, but only if the route runs a fixed number of batched
   queries (one per table, `.in('user_id', …).in('date', …)`), never per-person. Print volume needs the
   page estimate before the dialog.

6. **The double-count question resurfacing.** Someone will eventually ask why the person sheets' footage
   doesn't add up to the job ticket's. The label on the subtotal and the docblock in `lib/person-ticket.ts`
   are the answer; write both on day one.

7. **Duplicated jobs.** A job duplicated for a second crew is a separate `job_order_id` with its own
   number (`parent_job_id` links them). The person sheet lists jobs by number, so this is naturally
   correct — but show the parent number in parentheses so the office recognises the pair.

---

# FEATURE 2 — Job site conditions, captured on the first day on site

## 2.1 The outcome

On the first day a crew is on a job, the operator's work-performed screen opens with one card at the
top: **"Job site conditions — write down anything that prevents you or slows you down from doing your
job."** Underneath it a large, obvious text box, a voice-dictation button, and five or six one-tap
answers — how far from the truck, water from site or truck and how much hose, power from site or a
generator, how many levels the work spans, and whether what they're looking at matches the scope they
were sent. Photos optional. Nothing is required, nothing blocks the ticket, and it never appears again
after day one. In the founder's words: *"I really want them to write this down and not necessarily just
be clicking buttons for everything."* The buttons exist so the writing box doesn't have to carry the
easy parts.

The office reads it on the job page and on the printed internal ticket. It is the sheet the project
manager currently writes by hand at step 5.

## 2.2 What exists already vs what is new

### Exists

| Piece | Where | Reuse |
|---|---|---|
| `job_orders.jobsite_conditions` (jsonb) | written by `app/api/admin/schedule-form/route.ts:179`, read by 6 surfaces | **Read-only reference.** See §2.3 — this is the office's PLAN, not the crew's observation. |
| `job_workday_evidence` view | `supabase/migrations/20260814_day_number_is_a_calendar_position.sql:42` | **The "first day" test.** Service-role only (`:58-59`), so server-side. |
| The calendar-position expression | same migration, `:70-73` | Reused verbatim so the prompt can never disagree with the Day N printed on the ticket. |
| `PhotoUploader` | `components/PhotoUploader.tsx` | `bucket="job-photos"`, `captureLocation`, `jobId`. Already used at `work-performed/page.tsx:2945`. |
| `VoiceMemoNotes` | `app/dashboard/job-schedule/[id]/work-performed/_components/VoiceMemoNotes.tsx` | **The most important reuse.** Dictation is how a gloved operator writes a paragraph. |
| `NumberInput` | `components/ui/NumberInput.tsx` | The numeric taps (distance, hose feet, levels). |
| `workDate` (operator-local YMD) | `work-performed/page.tsx:290`, posted at `:1892` | The exact date discipline the report row must follow. |
| The crew-slot auth check | `app/api/job-orders/[id]/photos/route.ts:12-59` | `assigned_to` / `helper_assigned_to` / `job_crew` / same-tenant admin. Copy this shape. |
| `job_orders.photo_urls` + `POST /api/job-orders/[id]/photos` | same file | Available, but see §2.3 — conditions photos get their own column. |

### New

- **NEW** table `job_site_condition_reports` + RLS + indexes (one additive migration).
- **NEW** `lib/site-conditions.ts` — the pure "is this day one, and has anyone filed?" rule.
- **NEW** `GET/POST /api/job-orders/[id]/site-conditions` (operator).
- **NEW** `GET /api/admin/jobs/[id]/site-conditions` (office).
- **NEW** `SiteConditionsCard.tsx` (operator) and `SiteConditionsPanel.tsx` (office).

## 2.3 `job_orders.jobsite_conditions` — what it holds, and why we do not extend it

**Queried in production, Aug 15:** 29 of 41 jobs carry a non-empty `jobsite_conditions`, and **all 29
carry exactly the same 19 keys** — `water_available`, `water_available_ft`, `water_control`,
`manpower_provided`, `scaffolding_provided`, `electricity_available`, `electricity_available_ft`,
`inside_outside`, `proper_ventilation`, `overcutting_allowed`, `cord_480`, `cord_480_ft`,
`clean_up_required`, `high_work`, `high_work_ft`, `high_work_access`, `hyd_hose`, `hyd_hose_ft`,
`plastic_needed`.

That is step 8 of the schedule form, written once at intake by the office
(`app/dashboard/admin/schedule-form/page.tsx:1934-1953`). **The operator app only ever reads it** —
`my-jobs/[id]/jobsite/page.tsx:213`, `my-jobs/[id]/page.tsx:500`, the dispatch PDF
(`dispatch-pdf/route.tsx:106`), the print page (`jobs/[id]/print/page.tsx:165`). Nothing an operator does
writes a single key of it.

**Recommendation: a NEW table, `job_site_condition_reports`.** Four reasons, in order of weight:

1. **It is the plan, and this is the observation. Keeping them apart is the feature.** The founder's own
   ask — *"does the original scope match what they're about to do"* — is a comparison between the two.
   Merge them into one blob and the comparison becomes impossible to express, and worse, the office can
   no longer tell what it promised from what the crew found.
2. **Cardinality.** `jobsite_conditions` is one object on one job. A report is per (job, day, person): a
   lead and a helper can both file, and a second crew on a duplicated job files its own. A jsonb column
   would make the second writer overwrite the first.
3. **It gets copied.** `lib/duplicate-job-order.ts` copies `jobsite_conditions` through its 67-column
   allowlist, and so does `app/api/admin/job-orders/[id]/resubmit/route.ts:71`. A duplicate landing with
   another crew's field observation pre-filled as if it were the plan is a real integrity bug. A separate
   table is copied by nothing, because nothing copies it.
4. **Photos and provenance need columns.** `who`, `when`, `which day number`, `photo_urls[]`,
   `nothing_unusual`. Cramming those into the plan blob loses them the first time the office edits
   conditions from `JobDetailView.tsx:1314-1370`, which writes the whole object back.

**What we do keep from the existing column:** the operator card pre-renders the office's answers as
read-only chips at the top ("Office said: water available 150ft · hang poly · overcutting OK") so the
crew is correcting a stated expectation rather than filling a blank page. That is what makes
`scope_matches` a two-second answer instead of a memory test.

## 2.4 Data model — `job_site_condition_reports` (**NEW**)

```sql
CREATE TABLE IF NOT EXISTS public.job_site_condition_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id),
  job_order_id      uuid NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  reported_by       uuid NOT NULL REFERENCES public.profiles(id),

  -- The operator's LOCAL calendar date, same discipline as work_items.work_date.
  -- Never derived from a timestamp with toISOString().
  report_date       date NOT NULL,
  -- The calendar position at write time (job_workday_evidence). Stored, not
  -- recomputed, so the office can see it was filed on day 1 even if the job's
  -- evidence later gains an earlier day.
  day_number        integer,

  -- ── THE POINT OF THE FEATURE ─────────────────────────────────────────────
  conditions_notes  text,          -- the prominent free-text box

  -- ── The fast structured answers. ALL NULLABLE. Nothing blocks. ───────────
  truck_distance_ft integer,       -- truck → work area
  water_source      text,          -- 'site' | 'truck' | 'none'
  water_hose_ft     integer,       -- how much hose they ran
  power_source      text,          -- 'site' | 'generator' | 'none'
  levels_count      integer,       -- "five holes on five different levels"
  scope_matches     text,          -- 'matches' | 'differs'
  scope_difference  text,          -- one line, only when 'differs'

  photo_urls        text[] NOT NULL DEFAULT '{}',

  -- Distinguishes "clean site, nothing to say" from "never asked".
  nothing_unusual   boolean NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT job_site_condition_reports_water_source_chk
    CHECK (water_source IS NULL OR water_source IN ('site','truck','none')),
  CONSTRAINT job_site_condition_reports_power_source_chk
    CHECK (power_source IS NULL OR power_source IN ('site','generator','none')),
  CONSTRAINT job_site_condition_reports_scope_chk
    CHECK (scope_matches IS NULL OR scope_matches IN ('matches','differs')),
  CONSTRAINT job_site_condition_reports_one_per_person_day
    UNIQUE (job_order_id, reported_by, report_date)
);

CREATE INDEX IF NOT EXISTS idx_jscr_job_date
  ON public.job_site_condition_reports (job_order_id, report_date);
CREATE INDEX IF NOT EXISTS idx_jscr_tenant_date
  ON public.job_site_condition_reports (tenant_id, report_date);

ALTER TABLE public.job_site_condition_reports ENABLE ROW LEVEL SECURITY;
```

Plus the standard `updated_at` trigger used elsewhere in `supabase/migrations/`.

### RLS — SECURITY DEFINER helpers only, never `user_metadata`

```sql
-- Office + supervisor read everything in their tenant.
CREATE POLICY jscr_read_management ON public.job_site_condition_reports
  FOR SELECT USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_has_role('admin','super_admin','operations_manager','supervisor','salesman')
  );

-- The author reads their own.
CREATE POLICY jscr_read_own ON public.job_site_condition_reports
  FOR SELECT USING (
    tenant_id = public.current_user_tenant_id() AND reported_by = auth.uid()
  );

-- Crew on the job read the job's reports (so the second person sees what the
-- first already filed instead of typing it twice).
CREATE POLICY jscr_read_crew ON public.job_site_condition_reports
  FOR SELECT USING (
    tenant_id = public.current_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.job_orders j
       WHERE j.id = job_site_condition_reports.job_order_id
         AND (j.assigned_to = auth.uid() OR j.helper_assigned_to = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.job_crew c
       WHERE c.job_order_id = job_site_condition_reports.job_order_id
         AND c.user_id = auth.uid()
    )
  );

CREATE POLICY jscr_write_own ON public.job_site_condition_reports
  FOR INSERT WITH CHECK (
    tenant_id = public.current_user_tenant_id() AND reported_by = auth.uid()
  );

CREATE POLICY jscr_update_own ON public.job_site_condition_reports
  FOR UPDATE USING (
    tenant_id = public.current_user_tenant_id() AND reported_by = auth.uid()
  ) WITH CHECK (
    tenant_id = public.current_user_tenant_id() AND reported_by = auth.uid()
  );
```

`public.current_user_tenant_id()`, `public.current_user_has_role()` and `public.is_admin()` all exist in
prod (verified). **No policy here reads `auth.jwt() -> 'user_metadata'`** — that blob is client-writable
via `supabase.auth.updateUser()` and Supabase's linter flags it as `rls_references_user_metadata` (ERROR).

All real writes go through the API with `supabaseAdmin` per project convention; these policies are
defence in depth. Run `rls-policy-auditor` on the migration before it is applied.

The migration is **additive** (new table only), so per `CLAUDE.md` §"Rules of the road" #3 it can be
applied directly to prod via the Supabase MCP `apply_migration`, with idempotent DDL.

## 2.5 "First day" — the exact determination

Reuse the rule the day number already uses, so the two can never disagree.

`set_daily_log_day_number()` (`20260814_day_number_is_a_calendar_position.sql:70-73`) computes:

```sql
SELECT COUNT(*) + 1
  FROM public.job_workday_evidence e
 WHERE e.job_order_id = NEW.job_order_id
   AND e.work_date < NEW.log_date;
```

and `job_workday_evidence` (`:42-54`) defines a proven workday as **a filed daily log**, OR **the office
placed a named crew that day AND that person clocked in** — a placement with nobody on the clock is
deliberately not proof (that is why Aiden's Saturday and Sunday on the board don't count).

**NEW** `lib/site-conditions.ts`:

```ts
/** The calendar position of `todayYMD` among the days this job can PROVE a crew
 *  was on it — the same expression set_daily_log_day_number() uses. */
export function dayPositionFrom(evidenceDates: string[], todayYMD: string): number

/** Ask on day one, once per job, and never nag. */
export function shouldPromptSiteConditions(input: {
  dayPosition: number;          // from dayPositionFrom()
  reportsOnJob: number;         // any report by anyone on this job
  dismissedDays: number;        // how many days the crew has skipped the card
}): 'modal' | 'card' | 'none'
```

The rule:

| Condition | Result |
|---|---|
| `dayPosition === 1` and no report exists on the job | **`'modal'`** — the card sits at the TOP of work-performed, above the work-type picker. Not an actual blocking modal; the top slot. |
| `dayPosition` 2 or 3, still no report on the job | **`'card'`** — a dismissible card at the BOTTOM of the page. The crew that forgot on day 1 gets two more chances, out of the way. |
| A report exists on the job (by anyone) | **`'none'`** for prompting. The card collapses to a read-only summary with an "Add to this" button so a second crew member can append rather than re-type. |
| `dayPosition >= 4` | **`'none'`.** |

Three consequences worth stating:

- **Per job, not per person.** Once the lead files it, the helper is not asked. That is the anti-nag rule.
- **A duplicated job is its own job id** with its own evidence, so a second crew sent later gets its own
  day 1 — which is correct: they are arriving on a site for the first time.
- **The prompt is computed server-side** in the `GET` route, because `job_workday_evidence` is
  `service_role`-only. The client never decides what day it is.

## 2.6 API routes

### `GET /api/job-orders/[id]/site-conditions` — **NEW**

**Guard: `requireAuth`** + the crew-slot check copied from `app/api/job-orders/[id]/photos/route.ts:12-59`
(assigned lead, assigned helper, any `job_crew` row, or an admin **in the same tenant** — the tenant
clause at `:52-53` is there because of a real IDOR finding; keep it).

Returns:
```jsonc
{ "success": true, "data": {
  "prompt": "modal" | "card" | "none",
  "day_position": 1,
  "report": { /* this person's row for today, or null */ },
  "job_reports": [ /* everyone's rows on this job, newest first */ ],
  "office_conditions": { /* job_orders.jobsite_conditions, read-only chips */ }
} }
```

### `POST /api/job-orders/[id]/site-conditions` — **NEW**

Same guard. Upsert on `(job_order_id, reported_by, report_date)`. `tenant_id` and `reported_by` come from
the resolved auth + the job row, **never from the request body**. `report_date` comes from the client as
`workDate` (the operator's local YMD, the same value `work-performed/page.tsx:1892` already posts),
server-validated `/^\d{4}-\d{2}-\d{2}$/` and clamped to the same backfill window the work-performed page
already allows (`work-performed/page.tsx:290-294`). `day_number` is computed server-side from
`job_workday_evidence`, not accepted from the client.

Photo URLs are stored on the report row. They may *also* be appended to `job_orders.photo_urls` via the
existing route if the founder wants them in the job gallery — recommend **not**, initially: the job
gallery is the "showcase your work" set and mixing in a photo of a blocked egress path muddies both.

### `GET /api/admin/jobs/[id]/site-conditions` — **NEW**

**Guard: `requireSalesStaff`** (`lib/api-auth.ts:299`, = admin, super_admin, operations_manager,
supervisor, salesman) — matching the page guard on `/dashboard/admin/jobs/[id]`
(`page.tsx:608`, the same five roles). Guard and page agree by construction.

### Nothing public

No token route, no portal route, no PDF generator reads this table. `generate-completion-pdf`,
`app/api/public/portal/*` and `app/api/public/signature/*` are untouched. Add a one-line comment on the
table's docblock saying so, next to the `stripInternalNotes` reasoning in `lib/work-items-format.ts:290`.

## 2.7 The screens

### A. Operator — `SiteConditionsCard` (**NEW**)

Mounted at the top of `app/dashboard/job-schedule/[id]/work-performed/page.tsx` when
`prompt === 'modal'`, at the bottom when `'card'`, and as a read-only summary otherwise. A compact
"conditions filed ✓" line also goes on `app/dashboard/my-jobs/[id]/jobsite/page.tsx`, which is where the
crew already reads the office's conditions.

```
┌────────────────────────────────────────────────────┐
│ 📋 JOB SITE CONDITIONS — DAY 1                     │
│                                                    │
│ Write down anything that prevents you or slows     │
│ you down from doing your job.                      │
│                                                    │
│ ┌────────────────────────────────────────────────┐ │
│ │                                                │ │
│ │  (6 lines tall, 16px, autogrow)                │ │
│ │                                                │ │
│ └────────────────────────────────────────────────┘ │
│                       [ 🎤 Hold to talk ]          │
│                                                    │
│ Office said: water 150ft · hang poly · overcut OK  │
│                                                    │
│ Truck to the work area      [ − ]  500  [ + ] ft   │
│ Water from                  [ Site ][ My truck ]   │
│   Hose run                  [ − ]  200  [ + ] ft   │
│ Power from                  [ Site ][ Generator ]  │
│ Levels / elevations         [ − ]   5   [ + ]      │
│ Does this match the scope?  [ Matches ][ Differs ] │
│   ↳ (one line, revealed on Differs)                │
│                                                    │
│ [ 📷 Add photos ]                                  │
│                                                    │
│ [        Save conditions        ]                  │
│ [ Nothing unusual — skip ]                         │
└────────────────────────────────────────────────────┘
```

Mobile-first constraints, non-negotiable per `CLAUDE.md`:

- Every button, stepper and segment ≥ **44 × 44 px**. `NumberInput` already meets this.
- Inputs at **16px minimum** — anything smaller triggers iOS input zoom
  (see the `ios-mobile-gotchas` memory: needs a mobile `!important` 16px floor because Tailwind beats a
  bare `input` selector).
- **No horizontal overflow at 375px.** Segments stack rather than scroll.
- **Dictation is the primary input for the free text.** `VoiceMemoNotes` already exists in this page's
  `_components/`. A crew in gloves will not type a paragraph; they will talk. If dictation isn't wired,
  the free text will be empty and the feature will have failed for the exact reason the founder is asking
  for it.
- **Autosave the free text to the existing `work_performed_draft`** mechanism (`daily_job_logs.work_performed_draft`,
  the page's 500ms debounce at `:695-728`) so nothing is lost when LTE drops mid-sentence.

**Skippable, and never blocking:**

- `handleSubmit` (`work-performed/page.tsx:1860+`) is **not touched**. No new validation, no new gate.
  The precedent is explicit in that function's own comment: photos were made optional in Aug 2026 because
  *"an operator was standing on a jobsite unable to submit his day."* The same reasoning applies here with
  more force — a required field at 5pm gets garbage typed into it, and garbage is worse than silence
  because it looks like data.
- "Nothing unusual — skip" writes a row with `nothing_unusual = true` and everything else null. That is a
  real answer the office can read, and it stops the prompt. Closing the card without pressing anything
  leaves no row and the card returns tomorrow, twice.

### B. Office — `SiteConditionsPanel` (**NEW**)

A panel on `/dashboard/admin/jobs/[id]`, between **Crew & Clock-Ins** (~`:2236`) and **Change Requests**
(~`:2335`) — the slot `BACKLOG.md` already names for site-visit reports, so the two land together.

Shows: who filed, when, day number, the free text in full (it is the point — no truncation), the
structured answers as labelled values, the photos, and a **side-by-side diff against the office's
`jobsite_conditions`** when `scope_matches = 'differs'`. That diff is the thing that turns a complaint
into a change order.

### C. On the printed sheets

- **Work ticket** (`/dashboard/admin/jobs/[id]/work-ticket`): a compact block under the day-1 heading,
  rendered **only when the "Print crew notes" toggle is on** (`work-ticket/page.tsx:579`). That toggle
  already means "this is the internal copy"; the customer copy must not carry it.
- **Person sheet** (Feature 1): on the person's first day on that job, one line —
  `Site conditions: 500 ft from truck · water from truck, 200 ft hose · 5 levels · scope differs`
  plus the first ~200 characters of the free text. Internal document, so allowed (§1.6).

## 2.8 Build order — each piece shippable on its own

**Piece 1 — the migration.** Table + RLS + indexes + `updated_at` trigger. `rls-policy-auditor` before
apply. Ships nothing visible; unblocks everything.

**Piece 2 — `lib/site-conditions.ts` + the two operator routes.** The pure day-position rule with unit
tests (`lib/site-conditions.test.ts`: day 1 prompts, day 2 with a report doesn't, day 2 without one shows
the soft card, day 4 never, a second crew member sees the lead's row).

**Piece 3 — the card, free text + skip only.** No structured fields, no photos. This is the piece that
delivers the founder's actual ask; ship it alone and see whether the crew writes.

**Piece 4 — the structured answers + photos.** Distance, water/hose, power, levels, scope match. Added
around the text box that is already working.

**Piece 5 — the office panel** on the job page, including the diff against `jobsite_conditions`.

**Piece 6 — the print blocks** on the work ticket (behind the crew-notes toggle) and the person sheet.

## 2.9 What could go wrong

1. **🔴 Nagging.** Get the day rule wrong and the card shows every day, and the crew learns to dismiss it
   without reading — which kills the feature permanently. Gate on **both** `dayPosition === 1` **and**
   "no report exists on this job", and compute both server-side.

2. **🔴 It becomes a blocker.** Any future change that adds `if (!conditionsFiled) return;` to
   `handleSubmit` undoes this. Write the reason in a comment at the mount site, next to the existing
   photos-are-optional comment (`work-performed/page.tsx:1860-1867`).

3. **The free text stays empty and only buttons get pressed** — the precise failure the founder is trying
   to avoid. Countermeasures, in order of effect: dictation wired on day one; the text box rendered
   **above** the structured fields and physically larger than all of them combined; the structured fields
   deliberately limited to six, so they cannot feel like the whole job.

4. **Timezone.** `report_date` must be `toLocalYMD()`, never `toISOString().split('T')[0]`. This bug has
   recurred often enough that `CLAUDE.md` has a section on it and `lib/dates.ts` exists to prevent it.

5. **GPS-gated photo upload.** `PhotoUploader` with `captureLocation` requires a position before upload.
   The docblock (`components/PhotoUploader.tsx:50-70`) says a missing position is no longer fatal after
   the Aug 3 fix — **verify that on a real phone with location denied** before shipping, or a denied
   permission silently eats the photos.

6. **Two crew members writing the same thing.** Solved by the per-job prompt plus showing what is already
   filed, but the "Add to this" path must create the second person's own row, not edit the first person's
   — the unique key is `(job, person, date)` for exactly this reason.

7. **Leaking to the customer.** The free text will contain "the GC had us sitting for two hours." It must
   never reach the portal, a completion PDF or a signed sheet. Nothing public reads the table today;
   the risk is a future convenience join. State it in the table docblock and keep the customer-copy
   toggle honest on the work ticket.

8. **Duplicate/resubmit paths.** `lib/duplicate-job-order.ts` (67-column allowlist) and
   `resubmit/route.ts:71` copy `jobsite_conditions`. They copy columns on `job_orders`, so a separate
   table is copied by neither — which is the intended behaviour. Add a test asserting a duplicated job
   has zero condition reports, so a future "copy everything" refactor fails loudly.

---

# The smallest useful first slice

If there is only half a day, build these two things and nothing else.

### Feature 1 — one route, one page, print works

`GET /api/admin/work-performed-tickets?from=&to=` (`requireAdmin`) returning the **full** week payload in
one call — people, their days, jobs, hours, work lines and notes — and
`/dashboard/admin/work-performed-tickets` rendering it as a person list with checkboxes, a From/To range,
and a Print button that prints one portrait sheet per selected person using `break-after: page`.

Skip: the sidebar entry (reach it by URL), `?detail=1` as a separate mode, the Day/Week shortcut buttons
(custom range covers both), deep links from the timecards page, and the branded header polish. Include:
**shop days, labelled and counted** — the one rule that must be right on the first version, because a
payroll sheet that silently drops eight hours is worse than no sheet.

### Feature 2 — one column's worth of value, no structured fields

The migration (table + RLS), `GET/POST /api/job-orders/[id]/site-conditions`, and a card at the top of
work-performed on day 1 with **only** the heading, the big text box, the dictation button, Save, and
"Nothing unusual — skip".

Skip: the structured answers, photos, the office panel, the printed blocks — the office can read the
text on the job page's raw JSON view or from the person sheet in the same session. Include: the
server-side `dayPosition` check (so it never nags) and the untouched `handleSubmit` (so it never blocks).
The writing box is the feature; everything else is trim.
