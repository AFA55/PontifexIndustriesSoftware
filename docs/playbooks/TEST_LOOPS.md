# Journey Test Loops — run BEFORE every push that touches user-facing surfaces

> Jul 5 2026 lesson: tsc + build + jest catch type errors, not experience bugs. The
> Opifex-sees-Patriot-dashboard bug (arbitrary-tenant branding + tenant-blind cache) shipped
> through a green gate and was caught only by a persona journey. These loops are the fix:
> each is a complete persona walk, driven in a real browser (preview tools or Playwright MCP),
> checking the console after every page. Run the loops relevant to what changed; run ALL of
> them before a milestone push.

## Test credentials
- Patriot super admin (demo): `super@pontifex.com` / `super0202!` (tenant ee3d8081…, lands on Platform Hub)
- Opifex hiring-only admin (QA account): `opifex.tester@example.com` / `OpifexTest2026!` (tenant 32d26561…)
- Login URLs: `/login?tenant_id=<id>` skips the company-code step.
- Cleanup after: soft-delete test jobs (`deleted_at`), delete their publish requests, revert any
  patched job rows. Never leave test data live — Patriot is a paying customer.

## Loop 1 — Opifex customer (hiring-only tenant)
1. Login page shows **Opifex** branding → sign in → must land on **/dashboard/hiring** (NOT the ops dashboard).
2. Nav audit: Job Board present; Schedule Board / Equipment / Fleet / Timecards / Invoicing / Customers ABSENT.
3. New Job (title+description only) → Build my ad → job workspace w/ ad kit (FB/IG/TikTok) + 4-6 screeners incl. an 18+ auto-reject.
4. Activate → Overview shows "Ad review: in progress with Pontifex".
5. Billing page renders (placeholder card entry OK until Stripe publishable key exists).
6. 375px: job list + workspace no horizontal overflow.

## Loop 2 — Platform owner
1. `super@pontifex.com` → Platform Hub: KPI tiles load, Artifex tile, **Publish queue** link w/ pending badge.
2. Publish queue: pending request from Loop 1 visible (tenant, headline, channel chips) → expand ad kit
   (copy buttons + /apply URL) → **Approve** → moves to Approved → **Mark as published** → Published.
   Reject path: requires a note; pauses the customer's job; customer sees the note.
3. Regression: /dashboard/admin still the full ops dashboard for Patriot (NO redirect) + Job Board link added.
4. Artifex: Command Center loads, one chat round-trip streams a coherent reply.

## Loop 3 — Public candidate + prospect
1. `/jobs`: Opifex front door renders, mentions company code OPIFEX (never HIRE), clean at 375px.
2. Signup form: generic success; repeat with same email → identical generic success (no existence oracle).
3. `/apply/[slug]` of an ACTIVE job at 375px: full application; submit → success. Re-apply answering the
   18+ question "No" → success screen must be IDENTICAL (silent auto-reject; verify status='rejected'
   + auto_rejected=true in DB).
4. Auth edges: /forgot-password (generic confirmation), /update-password with no token (graceful),
   /setup-account with no token (graceful).
5. Branding sweep: /company-login codes OPIFEX → Opifex, PATRIOT → Patriot, ZZZZZ → clean not-found.

## Loop 4 — Patriot operator (run when ops surfaces change)
The pre-existing operator flow: login as an operator → my-jobs → jobsite → clock-in (GPS) →
work performed → day complete. Plus timecard visible to admin. (See BACKLOG/UI_CATALOG for details.)

## Known one-session-per-browser behavior (not a bug)
One browser profile holds ONE company session; logging into a second company replaces the first.
Test multi-company flows in separate browser contexts/profiles. Branding/features cache is scoped
per auth user (`patriot-branding:<userId>`) — a regression here shows as another company's branding
after switching. Multi-company account switching is a future feature.
