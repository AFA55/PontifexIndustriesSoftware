# Phase A — Tooling Kickoff (fine-tuning foundation)
**From:** `DEV_TOOLING_RECOMMENDATIONS.md` (Phase A = highest ROI, lowest risk). **Do this first** in the fine-tuning stage. Each step is independently shippable + reversible. Bundle into ONE Vercel push at the end (budget).

> Goal of Phase A: permanently kill the recurring **date bug class**, get **eyes on production errors**, lay the **global mobile fixes**, and start an **automated test** safety net — without touching feature behavior.

---

## A1. Date library + centralized `lib/dates.ts`  (prevents the Zack bug class)
**Why:** raw `Date` + `toISOString()` math is scattered and keeps producing UTC/local off-by-one bugs (Zack's "Jun 1 → Sun May 31"). Centralize it.

**Steps:**
1. `npm i dayjs` (2 KB; ~25M weekly downloads). Plugins: `utc`, `timezone`.
2. Create `lib/dates.ts`:
   ```ts
   import dayjs from 'dayjs';
   import utc from 'dayjs/plugin/utc';
   import timezone from 'dayjs/plugin/timezone';
   dayjs.extend(utc); dayjs.extend(timezone);

   /** Local YYYY-MM-DD from a Date (NEVER toISOString — that's UTC). */
   export const toLocalYMD = (d = new Date()) =>
     `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
   /** Parse a bare 'YYYY-MM-DD' as LOCAL midnight (NEVER new Date(str) — that's UTC). */
   export const parseYMDLocal = (ymd: string) => new Date(ymd + 'T00:00:00');
   /** Display a bare date, e.g. "Mon, Jun 1". */
   export const formatDay = (ymd: string, opts: Intl.DateTimeFormatOptions = { weekday:'short', month:'short', day:'numeric' }) =>
     parseYMDLocal(ymd).toLocaleDateString('en-US', opts);
   /** Mon..Sun YYYY-MM-DD for the week containing `ref`, with optional week offset. */
   export const weekDatesMonSun = (offset = 0, ref = new Date()): string[] => { /* port from timecard toLocalDateStr/getWeekBounds */ };
   ```
3. Replace existing ad-hoc date logic to import from `lib/dates.ts` (start with `app/dashboard/timecard/page.tsx` `toLocalDateStr` + `getWeekBounds`, and `lib/timecard-utils.ts`). Then sweep `grep -rn "new Date(" app | grep -E "\.date|YYYY|toISOString"` and migrate the date-only ones.
**Acceptance:** unit test (A4) proves "2026-06-01 → Monday, displays Jun 1"; `npm run build` green.

## A2. Sentry (production error visibility)
**Why:** we found Zack's bug by luck. Sentry surfaces prod errors with stack traces + the release.
**Steps:**
1. `npx @sentry/wizard@latest -i nextjs` (or `npm i @sentry/nextjs` + manual config). Creates `sentry.client/server/edge.config.ts` + wraps `next.config`.
2. Add `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN` to Vercel env (production). Gate: only init when DSN present (so local/dev is quiet).
3. `tracesSampleRate` low (e.g. 0.1); enable source-map upload in CI/build.
**Acceptance:** a deliberate test throw appears in Sentry; no PII in events (scrub emails if needed).

## A3. Global mobile fixes (from `MOBILE_RESPONSIVE_AUDIT.md` §root cause)
Fold the tiny global CSS wins in here (they're "fine-tuning everything"):
1. `app/globals.css` `html {}`: add `-webkit-text-size-adjust:100%; text-size-adjust:100%;`
2. `app/globals.css`: `input,textarea,select{ font-size:16px; }` (kills iOS focus-zoom).
3. Define `.safe-area-pb` (or replace the one call site with `pb-safe`).
4. Add `pt-safe` to operator sticky headers (my-jobs, jobsite, work-performed, day-complete, my-profile).
**Acceptance:** app no longer "zooms in" on input focus; headers clear the notch.

## A4. Vitest + first test (safety net)
**Why:** zero tests today; the date util is the perfect first lock.
**Steps:**
1. `npm i -D vitest @vitest/ui`; add `"test": "vitest"` to package.json; `vitest.config.ts` (jsdom env if needed).
2. `lib/dates.test.ts` — assert `toLocalYMD`, `parseYMDLocal`, `formatDay('2026-06-01')==='Mon, Jun 1'`, `weekDatesMonSun(0, new Date('2026-06-03T12:00'))` starts Mon Jun 1 ends Sun Jun 7.
3. (Optional) add the payroll/OT money math as test #2.
**Acceptance:** `npm test` green; consider adding to the pre-commit hook later.

---

## Definition of done (Phase A)
- [ ] `lib/dates.ts` exists + timecard/utils migrated to it
- [ ] Sentry live in production (DSN set, test error received)
- [ ] Global mobile CSS fixes in (`text-size-adjust`, 16px inputs, `pb-safe`, `pt-safe`)
- [ ] `npm test` runs with ≥1 passing date test
- [ ] `npm run build` green → ONE push → verify Vercel READY
- [ ] Update `CLAUDE_HANDOFF.md` + check the Ongoing item in `CLAUDE.md`

**Est:** ~½–1 day. All additive; no feature behavior changes.
