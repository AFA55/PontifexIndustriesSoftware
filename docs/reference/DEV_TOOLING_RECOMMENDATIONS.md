# Dev Tooling Recommendations — Pontifex Platform
**Created:** Jun 2026 | **Author:** Claude (exec engineer) | **Goal:** organize the codebase + speed up development, grounded in popularity/maintenance data and tied to the *actual pain points* we've hit.

> Philosophy: **additive + incremental, never a big-bang rewrite.** The app is live with a paying trial. Each tool below is adopted page-by-page so nothing breaks. Ranked by ROI (impact ÷ effort/risk). Popularity figures verified via web search (npm trends / GitHub), Jun 2026.

---

## TL;DR — adopt in this order
1. **A real date library + one `lib/dates.ts`** → kills the UTC/local bug class (the Zack timecard bug). *Highest ROI, lowest risk.*
2. **Sentry** → we're currently *blind* to prod bugs (only found Zack's because he showed us). First-class Next.js SDK.
3. **Zod** → validate API inputs + share schemas client/server; foundation for forms.
4. **TanStack Query** → delete the dozens of hand-rolled `fetch + loadError + retry + useState` blocks.
5. **React Hook Form (+ Zod)** → the giant multi-step Schedule Form & Visit Report.
6. **shadcn/ui (Radix + Tailwind)** → accessible modals/dropdowns; helps break up the 2,850-line schedule board.
7. **TanStack Table** → payroll grid, completed jobs, schedule board data logic.
8. **Vitest + Playwright** → zero tests today; start with the date utils + money math + a login→clock-in smoke test.

---

## Tier 1 — Prevents the bugs we keep hitting (do first)

### 1. Date/time library + centralized `lib/dates.ts`  ⭐ START HERE
**Why:** The Zack timecard bug (`new Date('2026-06-01')` parsed as UTC → "Sun, May 31") is a *recurring class* — raw `Date` + `toISOString()` math is scattered across timecard, schedule, payroll, daily-logs. We've now patched it twice. A library + ONE wrapper module ends it.
- **Day.js** — ~25M weekly downloads, ~47K★, **2 KB**, Moment-like API, `utc` + `timezone` plugins. Best size/ergonomics. → **recommended default.**
- **date-fns** — ~40M weekly downloads, ~35K★, tree-shakeable, functional. Good if the team prefers pure functions; timezone via `date-fns-tz`.
- **Luxon** — ~12M weekly, ~16K★, **best timezone/DST** (built on Intl). → switch to this *if/when* we onboard a tenant in a different timezone than its operators.
- **Action:** add Day.js, create `lib/dates.ts` exporting `todayLocal()`, `weekRange(offset)`, `toLocalYMD(d)`, `formatDay(ymd)` — then replace ad-hoc `Date` math page-by-page. Add a unit test (Tier-1 #8) that locks in "June 1 = Monday."

### 2. Sentry (error + performance monitoring)  ⭐
**Why:** We have **no visibility** into production errors. The date bug, the stale-badge bug, the 403s — all found by users, not us. Sentry surfaces them with stack traces, the offending release, and breadcrumbs.
- De-facto standard for React/Next.js; `@sentry/nextjs` wires client + server + edge + source maps in minutes. Generous free tier.
- **Action:** install `@sentry/nextjs`, set DSN env var, gate to production. Immediate safety net.

### 3. Zod (schema validation)  ⭐
**Why:** API routes hand-parse `req.json()`; client forms do ad-hoc checks ("Please select a customer"). One Zod schema validates the API input **and** the form **and** generates the TS type.
- ~30M+ weekly downloads, ~34K★; the standard companion to React Hook Form and tRPC.
- **Action:** start by validating the highest-traffic POST routes (clock-in, schedule-form submit), then reuse those schemas in the forms.

---

## Tier 2 — Organization & dev speed

### 4. TanStack Query (`@tanstack/react-query`)
**Why:** Dozens of admin/operator pages repeat: `useState(loading/error/data)` + `useEffect(fetch)` + manual retry + the `loadError` pattern. TanStack Query replaces all of it with caching, auto-retry, background refetch, and built-in mutation states — and prevents stale-data bugs (e.g., the "Needs Attention" badge that didn't clear).
- **12.3M weekly downloads, ~48K★** — overtook SWR in 2024 and still growing. (SWR: 4.9M / 32K★, lighter but fewer features — viable if we want minimal.)
- **Action:** introduce a `QueryClientProvider`, migrate one page (e.g., team payroll) as the pattern, then spread.

### 5. React Hook Form (+ Zod resolver)
**Why:** The Schedule Form (multi-step, ~customer→location→service→difficulty→scheduling→compliance) and Visit Report are large controlled-input forms with manual state. RHF gives performant uncontrolled inputs, per-field validation, and clean multi-step handling.
- Most-popular React form lib (~10M+ weekly, ~43K★); `@hookform/resolvers` plugs Zod straight in.
- **Action:** adopt on the *next* new form; migrate Schedule Form opportunistically.

### 6. shadcn/ui (Radix UI primitives + Tailwind)
**Why:** We hand-roll modals/dropdowns/dialogs (schedule board edit/dispatch modals, approve modals) — accessibility + mobile focus traps are easy to get wrong. shadcn = copy-paste components built on **Radix UI** (accessible primitives) styled with **our** Tailwind tokens. No runtime dependency lock-in (code lives in our repo). Pairs with lucide-react (already used).
- shadcn/ui ~90K★ (one of the fastest-growing UI projects); Radix ~16K★.
- **Action:** `npx shadcn@latest init`, adopt `Dialog`, `DropdownMenu`, `Select`, `Popover` first — directly helps decompose the 2,850-line schedule board.

### 7. TanStack Table (`@tanstack/react-table`)
**Why:** Payroll grid, completed jobs, billing, schedule board — all are bespoke table code. Headless table gives sorting/filtering/grouping/column logic without dictating markup (keeps our Tailwind styling). Virtualization-ready for long lists.
- ~3M+ weekly downloads, ~26K★.
- **Action:** apply to the team payroll grid (we just rebuilt its mobile view — good candidate).

---

## Tier 3 — Quality & scale (start small)

### 8. Vitest (unit) + Playwright (e2e)
**Why:** **Zero automated tests today.** Every fix is manually verified. The date bug is the perfect first unit test; payroll/OT/invoice money math is the highest-risk untested logic.
- Vitest: fast, Vite-native, Jest-compatible API (~10M+ weekly). Playwright: Microsoft, the e2e standard (~12M+ weekly), great mobile-viewport emulation (matches our mobile-first bar).
- **Action:** (a) unit-test `lib/dates.ts` + payroll calc; (b) one Playwright smoke: login → clock-in → clock-out. Wire into the pre-commit/CI later.

### 9. TanStack Virtual (`@tanstack/react-virtual`)
**Why:** If equipment lists / schedule board / history grow to hundreds of rows, virtualize to keep mobile smooth. Adopt only when a list actually gets long.

---

## Already in the stack (keep)
- **lucide-react** (icons), **framer-motion** (the new splash intro), **@react-pdf/renderer** (invoices/tickets), **Supabase JS**, **Capacitor** (iOS shell). These are all current best-in-class — no change needed.

## Deliberately NOT recommending (for now)
- **Prisma/Drizzle ORM** — Supabase client + RLS already covers our data layer; an ORM would fight RLS and add migration surface. Revisit only if query complexity explodes.
- **Redux** — overkill; Zustand + TanStack Query cover client + server state.
- **Moment.js** — legacy/maintenance-mode; do not add.
- **TanStack Form** — promising but less mature than React Hook Form; prefer RHF for stability today.

---

## Suggested phased rollout (no big-bang)
- **Phase A (this/next session, ~½ day):** Day.js + `lib/dates.ts` + Sentry + a Vitest date test. *Pure safety — prevents recurring bugs, near-zero risk.*
- **Phase B:** Zod on the 3-4 hottest API routes + TanStack Query on one page as the template.
- **Phase C:** shadcn primitives + RHF on the next new form; TanStack Table on the payroll grid.
- **Phase D:** Playwright smoke test in CI.

Each phase is independently shippable and reversible. Want me to start **Phase A** now?
