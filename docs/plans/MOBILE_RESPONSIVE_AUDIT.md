# Mobile / iPhone Responsive Audit — Jun 2026
**Scope:** full operator + admin sweep at iPhone widths (375–430px) by two parallel `mobile-responsive-auditor` agents (read-only source analysis). **Goal:** fix the "still looks a bit zoomed in for some areas" report and make every screen fit snug on a phone. **Status:** ANALYSIS COMPLETE — fixes pending (next session). Operators work on phones with gloves → bar is ≥44px tap targets, ≥14px text, zero horizontal overflow, content clear of notch + home indicator.

---

## 🔴 ROOT CAUSE of "zoomed in" — fix these FIRST (global, tiny, high-impact)

The viewport meta is **correct** (`app/layout.tsx` → `width=device-width, initial-scale=1, viewport-fit=cover`, no `maximum-scale` lock). The "zoomed in" feel is TWO things:

1. **[CRITICAL · global] Missing `-webkit-text-size-adjust: 100%`** — `app/globals.css` `html {}` block (~line 353) doesn't set it, so iOS WebKit runs its **auto text-inflation** and enlarges body text inconsistently page-to-page. *Single most likely cause of the complaint.*
   ```css
   /* app/globals.css → html selector */
   html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
   ```
2. **[CRITICAL · global] Inputs < 16px trigger iOS focus-zoom** — iOS auto-zooms the whole viewport when you focus an input with font-size < 16px and often doesn't zoom back out → app "stuck zoomed." Several inputs use `text-sm`/`text-xs`. Fix globally:
   ```css
   input, textarea, select { font-size: 16px; }   /* add sm: overrides later if desired on desktop */
   ```
   (`company-login`, `login`, `maintenance/new` already avoid this — apply the pattern everywhere.)
3. **[HIGH · global] Dead class `safe-area-pb`** — used at `app/dashboard/daily-report/page.tsx:488` but **never defined** (only `pb-safe` exists). That bottom bar has zero home-indicator clearance. Define `.safe-area-pb` or change call sites to `pb-safe`.
4. **[HIGH · pattern] Sticky headers missing `pt-safe`** — only `app/dashboard/page.tsx` adds it. Add `pt-safe` to every operator sticky header (list below) so the back button/title clear the Dynamic Island.

> Doing #1–#4 alone will resolve most of the "zoomed in"/clipped feel across the app. ~30 min of work.

---

## OPERATOR PAGES — per-page findings (severity-ranked)

**`app/dashboard/timecard/page.tsx` — worst page**
- HIGH (overflow): the wide `<table>` in `overflow-x-auto` (~line 888) side-scrolls at 390px. The recent "mobile cards" commit covers the *payroll* grid but this second table path still renders the table on phones → give it a stacked/card layout `<sm` and `hidden sm:block` the table.
- HIGH (text): ~22 spots of `text-[9px]/[10px]/[11px]` (table headers ~892–898, hour chips ~811, week grid ~705/712/716) — below 14px floor. Bump to `text-xs` min (`text-sm` for the table).

**`app/dashboard/.../day-complete/page.tsx`**
- HIGH (functional): signature canvas backing buffer is `600×160` but renders `w-full` (~358px) and the draw handlers write raw `clientX-rect.left` **without scaling by `canvas.width/rect.width`** → ink is offset/compressed, doesn't track finger on the customer-facing signature. Fix: scale coords `x=(clientX-rect.left)*(canvas.width/rect.width)` (same for y).
- HIGH (zoom): notes textarea (~1401) `text-sm` → iOS focus-zoom (fixed by global #2).
- HIGH (notch): sticky header (~903) needs `pt-safe`.

**`app/dashboard/.../work-performed/page.tsx` — most-used data entry**
- HIGH (notch): sticky header (~1522) needs `pt-safe`.
- HIGH (home indicator): fixed bottom submit bar (~2269) `pb-6` (24px) < home indicator (~34px) → CTA partly under indicator. Use `pb-safe`.
- MEDIUM (zoom): supervisor-note + modal textareas `text-sm` (fixed by global #2).

**`app/dashboard/my-jobs/[id]/jobsite/page.tsx`** — HIGH notch (sticky header ~191 `pt-safe`); MEDIUM "Arrived" CTA (~423) `pb-6`→`pb-safe`. Body otherwise exemplary.
**`app/dashboard/my-jobs/page.tsx`** — HIGH notch (sticky header ~437 `pt-safe`); else clean.
**`app/dashboard/my-profile/page.tsx`** — HIGH no top safe padding (~193); MEDIUM input (~306) `text-sm`; NIT `text-[10px]` (~277).
**`app/dashboard/daily-report/page.tsx`** — HIGH dead `safe-area-pb` (~488 → `pb-safe`); verify top clears island.
**`app/dashboard/page.tsx` (operator home)** — reference for notch (`pt-safe` ~781). NITs only: `text-[11px]`(~1105), `text-[10px]`(~1198).

**CLEAN (use as reference patterns):** `app/dashboard/maintenance/new/page.tsx` (best — `min-h-[44px]`, `text-base sm:text-sm` inputs), `app/login/page.tsx`, `app/company-login/page.tsx`, `app/offer/page.tsx`.

---

## ADMIN PAGES — per-page findings

> Note: `globals.css` sets `html,body{overflow-x:hidden}` so over-wide content is **silently clipped, not scrollable** — wide inner elements just look cramped/cut. The fixes are reflow, not scroll.

**CRITICAL — `schedule-board/_components/JobDetailView.tsx:448`** — Job Detail modal is `max-w-6xl` (1152px) crammed into ~374px AND has **0 `dark:` classes** (renders white in dark mode). Biggest "zoomed in" surface on the board. Fix: stack interior rows `flex-col sm:flex-row`, reflow the embedded `min-w-[800px]` CrewScheduleGrid, add `bg-white dark:bg-[#1a0f35] text-slate-900 dark:text-white` + pair all hardcoded `bg-white`/`text-slate-*` with `dark:`.

**HIGH — `schedule-form/page.tsx:2736,2744`** — scope inputs `grid-cols-4` (Length/Width/Thickness/Qty) at ~76px/col with `text-lg` + `ft` suffix → clip/cram. Fix: `grid-cols-2 sm:grid-cols-4`, `text-base px-2.5` on mobile. Same for `# Holes/Bit Size/Depth` `grid-cols-3` (~2343/2350).

**HIGH — both NotificationBell dropdowns are single-theme:**
- `schedule-board/_components/NotificationBell.tsx:147` — hardcoded `bg-white` (0 `dark:`) → white box in dark admin theme.
- `components/NotificationBell.tsx:182` — hardcoded `bg-slate-900` (0 `dark:`) → dark box on the now-light admin shell.
- Fix both: `bg-white dark:bg-slate-900` (+ light/dark text/border pairs). They're on every admin screen.

**MEDIUM** — `ScheduleDatePicker.tsx:163` fixed `w-[340px]` center-anchored → clips off-screen; use `w-[min(340px,calc(100vw-2rem))]` + `dark:` variant. `DashboardSidebar.tsx:652` drawer close button ~28px → add `min-h-[44px] min-w-[44px]`.

**NIT** — dense sub-12px labels in `inventory-control` (29×), timecards mobile cards (`text-[9px]` day initials), sidebar badge `text-[10px]` — defensible in dense contexts; floor to `text-[11px]` if readability complaints.

**CLEAN:** schedule-board shell/toolbar, OperatorRow, EditJobPanel (exemplary `dark:` + `inset-4 sm:inset-6`), timecards payroll **card** view (verified snug), active-jobs, billing, equipment, fleet, site-visits, time-off, DashboardSidebar shell.

---

## Fix order (recommended)
1. **Global #1–#4** (text-size-adjust, 16px input floor, `safe-area-pb`, `pt-safe` on sticky headers) — kills the "zoomed in" feel app-wide.
2. **`timecard` table → cards** + bump tiny text.
3. **`day-complete` signature scaling** (functional, customer-facing) + textareas.
4. **`work-performed`** notch + home-indicator.
5. **Admin: `JobDetailView` reflow+dark**, scope-form `grid-cols-4`, both `NotificationBell` dark/light.
6. Date picker width, sidebar close tap target, NIT text floors.

> Want visual proof? The auditors ran source analysis (admin pages are auth-gated). With test creds + a running preview, a follow-up can screenshot each at 390px.
