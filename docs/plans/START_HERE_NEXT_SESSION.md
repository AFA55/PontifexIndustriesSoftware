# START HERE — handoff, 7 Aug 2026

You are picking up a live production system that ~13 real concrete-cutting crew
use every working day. Read this file, then the two plan files it points at.
Nothing else in the repo is required reading to be useful in the first hour.

---

## 1. Who you're working with

**Andres Altamirano**, founder. Non-technical, dictates most messages by voice —
expect typos, run-on sentences, and the occasional word the transcriber mangled
("cloud" = Claude, "Sentry DSM" = DSN). **Read for intent, not spelling.** He is
precise about what he wants and usually right about his own business.

How he works:
- He tests the live app and reports what he hits, often with screenshots.
  **Screenshots have found more real bugs than any code review this week.**
- He repeats himself across sessions on purpose. Merge duplicate items rather
  than letting the list grow.
- He will retract ideas. When he does, **record the retraction** so it isn't
  rebuilt later. There's one in the plan file marked DO NOT BUILD.
- He asks for honesty about status. Give it, including when you were wrong.

**He is right more often than you expect.** Twice this week he pushed back on a
claim of mine and was correct both times — once about headcount, once about
phone numbers being collected. Check before contradicting him.

---

## 2. What the platform is

Concrete-cutting operations platform. Next.js 15 App Router + React 19 +
TypeScript + Supabase (Postgres) + Tailwind, on Vercel. Multi-tenant.
**Patriot Concrete Cutting** is tenant #1 (company code `PATRIOT`); Pontifex
Industries is the parent/white-label brand.

iOS and Android ship as a Capacitor **remote-URL webview** pointed at
production — so **web changes reach phones with no store build**. Only native
changes (plugins, icons, Info.plist) need a release.

`CLAUDE.md` in the repo root carries the full conventions. Read it.

---

## 3. What you have

**MCP servers (connected):**
- **Supabase** — `execute_sql`, `apply_migration`, advisors, logs. This is
  production data. Read freely; write carefully.
- **Sentry** — `search_issues`, `search_events`, `analyze_issue_with_seer`.
  Org `pontifex-industries-x5`, project `javascript-nextjs`.
- **Browser / preview** — `preview_start` (dev server from `.claude/launch.json`),
  `navigate`, `read_page`, `computer`, `read_console_messages`, `preview_logs`.
- Vercel, Figma, Playwright, Chrome, computer-use, context7.

**Skills worth knowing:**
- `dev-decisions` — the decision framework. **Read before any significant
  technical choice.** Includes the honest-options rule: never answer "what's the
  fastest way" with a single route.
- `guardian-review` — adversarial review; run behind every builder.
- `prod-deploy` — the deploy gate.
- `frontend-design` — for UI work. `design-taste` is marketing pages only.
- `ios-release` / `android-release` — native builds only.

**Agents:** `general-purpose` is the workhorse. Also `principal-engineer`
(infrastructure/scale decisions), `rls-policy-auditor`, `supabase-migration-author`,
`mobile-responsive-auditor`. The founder has explicitly authorised running agents
in parallel to review behind you — **do it.** Two agent reviews this week found
defects that would otherwise have reached his crew, including one actively
destructive bug of mine.

---

## 4. Non-negotiable rules

1. **`supabaseAdmin` bypasses RLS.** Every query needs an explicit `tenant_id`
   filter. `if (tenantId) query.eq(...)` is NOT safe — null bypasses it.
2. **Never `new Date('YYYY-MM-DD')`** (parses UTC → previous day in US
   timezones) and never `toISOString().split()` for a *local* date. The server
   runs UTC on Vercel. Use `lib/dates.ts` and `lib/tenant-timezone.ts`.
3. **If a write matters, `await` it and check the error.** Fire-and-forget
   inserts hid four separate audit failures for weeks.
4. **Never rename or migrate stored JSON** operators have written. Add a field
   and derive the old one. See the rebar change for the pattern.
5. **A disabled control must say why.** An operator lost three days to a button
   that was simply below the fold.
6. **Don't run `npm run build` while the dev server is running** — it corrupts
   `.next`. Stop the preview first. (I did this three times.)
7. **Confirm before pushing** unless told otherwise — each push is a billed
   Vercel build. Batch commits; one push per session is the norm, though the
   founder has been happy with more while he's actively testing.

---

## 5. THE defect pattern — read this twice

**Almost every serious bug this week was the read path not matching the write
path, failing silently.**

- Job progress read a table **nothing ever wrote** → every job showed 0%.
- The customer signing page embedded `form_templates` with **no FK** → PostgREST
  failed the whole query → **every signing link dead since launch**.
- Rejecting a PM ticket embedded `profiles` on `created_by`, which is an FK to
  `auth.users` → answered *"Job order not found"* for every rejection.
- `profiles` has **two** phone columns; everything reads the empty one.
- `maintenance-photos` is a private bucket served via `/object/public/` URLs →
  403 → a supervisor's photos looked lost.
- `equipment_selections` is a JSONB **object**; my nullable-list fix treated it
  as a list and would have **corrupted 22 rows** on the next save. Caught by an
  agent before anyone hit it.

**None of these errored anywhere.** They returned empty, or wrong, or "not
found". Before believing data is missing, check for a second column, a missing
FK, or a bucket/URL mismatch.

---

## 6. Where things are

**Everything is pushed. Working tree clean. 686 tests, build green.**
(Two test suites fail on a pre-existing `postal-mime`/`resend` import error —
unrelated, confirmed by stashing.)

**Shipped this week:** progress off 0% · timecard PDF times (production printed
11:07 for a 7:07 clock-in) · liability waiver flow end to end · the SC waiver
text · shop location + ETA engine · admin job pages that wouldn't open · the
supervisor's photos · PM rejection · work-item double-counting · rebar size
picker · camera-or-gallery + zoom · four uncleaarable input fields · doubled
crew · daily reset · waiver SMS wording · four silent audit failures.

**The queue: 68 tasks, 18 done.** Two plan files:
- **`docs/plans/OPERATOR_FLOW_REBUILD.md`** — 15 batches, operator/crew side
- **`docs/plans/MANAGEMENT_DASHBOARD_REBUILD.md`** — 6 batches, admin side

Both carry the founder's decisions, his retractions, and open questions. **Read
both before building.**

---

## 7. What to do first

In this order. The first three are P0 and affect his crew on Monday.

1. **Task #64 — four bugs from his operator walkthrough.** "Continue adding
   work" lands on a **blank page**; the work-item search dropdown **won't
   close**; "Send link & complete job" gives no feedback and the SMS arrives
   **~5 minutes late**; "Rate your crew" still shows after someone has rated
   (completion must be tracked **per rater**).
2. **Task #66 — the dashboard is lying.** "Jobs today" reads **0** while the
   schedule board beside it lists jobs. Suspect a UTC-vs-tenant "today".
   Notifications won't stay dismissed — there are **two** notification tables
   and mark-read likely touches one while the count reads the other.
3. **Task #60 — the two phone columns.** `phone_number` is populated for every
   crew member; `phone` is empty; everything reads `phone`. Unblocks #59.
4. **Batch 1** in the operator plan — the page moving while they type,
   remembering the step, then work-types-first with "Other". The biggest piece.

**Work two or three items, then have an agent review behind you, then continue.**
That is his explicit instruction and it has already caught real damage.

---

## 8. Testing

Demo ticket **`DEMO-2026-000002`** — 2 days, wall sawing + core drilling + slab
sawing, scope targets set, sitting at the start with In Route untapped.

| Role | Login |
|---|---|
| Lead operator | `zztest.operator@pontifexqa.com` |
| Team member | `zztest.helper@pontifexqa.com` |

Password `DemoTest2026!`, company code `PATRIOT`.

**Founder / demo site contact: Andres Altamirano, 470-658-6313.** Use this on
demo tickets so waivers and notifications reach him. **Never invent a phone
number** — it may reach a real person. Use his, or the reserved 555-01xx range.

⚠️ Seeding `scope_details`: the display reads `linear_feet` / `depth` /
`num_cuts` for cuts and `qty` / `bit_size` / `depth` for holes. Using
`length`/`width` makes the ticket render half-empty.

---

## 9. Blocked on the founder

- **Sentry is LIVE ✅ (confirmed Aug 10).** The founder set the DSN and is
  receiving notifications. Verified via the MCP: events arriving, most recent 10
  minutes old. This section previously said "receives nothing" — that was stale,
  and I repeated it to him before checking. **Query the MCP before asserting
  anything about Sentry.**
  It immediately earned its keep: `JAVASCRIPT-NEXTJS-2` —
  *"NativeBiometric.then() is not implemented on ios"*, 91 events, **20 users**,
  culprit `/login`. Cause: `getPlugin()` was an async function RETURNING the
  Capacitor plugin proxy, and promise resolution probes any returned value for
  `.then` — which the proxy forwarded as a native call. Fixed by returning the
  plugin wrapped in a plain object.
- **Wages** — `hourly_rate` is NULL on all 37 profiles and there is nowhere in
  the UI to enter it (batch 4b). Labor cost reads "not set" everywhere until
  both are fixed.
- **The invoicing sheet photo** — he's sending it. Build task #67's invoice
  draft to that, not to a guess.
- **Attorney review of the waiver** (`lib/legal/utility-waiver.ts`). Researched
  against SC law (§ 32-2-10, Title 58 Ch. 36) but not lawyer-reviewed. Note also
  that "Sign in person" currently opens a **different page with different,
  unreviewed wording** — task #58, and it matters because he's confirmed on-site
  signing is a normal path.

---

## 10. Things I got wrong — so you don't repeat them

- Told him **38 people** needed wages. It's ~18 real people; the rest are
  deactivated tombstones and QA accounts. He pushed back and was right.
- Told him phone numbers were **never collected**. They were — I read the wrong
  column. He pushed back and was right.
- Added `equipment_selections` to a list normalizer. It's an object. Would have
  corrupted 22 rows.
- My progress fix made `entries` non-empty for the first time and **detonated a
  latent crash** on every admin job page. A fix working correctly can expose
  code that only survived because it never ran.
- Ran `npm run build` with the dev server up, three times, corrupting `.next`.

The pattern: **verify against the database before asserting.** It costs one
query and it is the difference between help and confident noise.
