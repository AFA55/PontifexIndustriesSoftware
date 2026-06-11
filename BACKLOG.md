# BACKLOG — single source of truth

> Every bug, feature, and chore lives HERE — not in CLAUDE.md, not in the handoff, not in chat.
> Priorities: **P0** = broken in prod / blocking · **P1** = this week · **P2** = soon · **P3** = someday.
> When work completes: check it off, move to "Recently shipped" (keep ~2 sessions), then delete.

## 📊 STATUS (update every session — this is the at-a-glance progress dashboard)

| | |
|---|---|
| **Phase** | Launched → **Fine-tuning & productization** (post-App-Store) |
| **Prod** | ✅ LIVE — pontifexindustries.com (`a56a2322` deployed READY) |
| **iOS** | v1.0.2 live · v1.0.3/Build 8 (Face ID) awaiting founder device test |
| **Open** | P0: 2 · P1: 7 · P2: 11 · P3: 8 |
| **In flight** | Jun 10 fix batch built+tested, awaiting push: branding flash, logo 1.5x, demo-funnel 500 fix, demo-requests inbox, diagnostic revert |
| **Blocked on founder** | Push confirmation · Supabase Pro upgrade · Build 8 device test · Sentry DSN |
| **Unpushed commits** | Docs commits (`4cb515c8`+) + Jun 10 code batch |
| **Last groomed** | Jun 10, 2026 |

## 🔴 P0 — Verify / unblock now

- [x] ~~Verify invite email works on prod~~ — ✅ Jun 10: founder's resend hit `PUT /api/admin/invite`
      → **200** (was 502 before the sanitizer). Email outage CONFIRMED resolved. Adam Ingalls'
      invite went out — confirm he received it.
- [x] ~~Revert temp invite diagnostic~~ — ✅ Jun 10: EMAIL DIAG logging + raw-error response removed.
- [ ] **Supabase Free → Pro ($25/mo)** — founder action. Payroll data currently has NO automated
      backups. Highest-leverage 5 minutes available. (See docs/plans/BACKUP_AND_CLOUD_STRATEGY.md.)
- [ ] **Push the Jun 10 fix batch** (founder confirms): branding-flash fix + logo 1.5x + demo-funnel
      500 fix + demo-requests inbox + diagnostic revert.

## 🟠 P1 — This week

- [ ] **iOS Build 8 (Face ID)** — founder: install from TestFlight, test Face ID on device →
      submit v1.0.3 for App Store review (`.claude/skills/ios-release/SKILL.md`).
- [ ] **Exercise remaining email routes live** (invoices send/remind/payment, demo-request,
      silica-plan, liability PDF) — all now use the sanitized key + verified domain, but untested in prod.
- [ ] **Sentry DSN** — code is fully wired & gated; founder sets `SENTRY_DSN` +
      `NEXT_PUBLIC_SENTRY_DSN` in Vercel → instant prod error visibility. (Phase A, docs/plans/PHASE_A_KICKOFF.md)
- [ ] **Supabase Auth rate limits** — Dashboard → Auth → Settings (HIGH-2 from security audit).
- [ ] **Clean up Vercel env vars** — founder: delete unused `RESEND_FROM_EMAIL`; optionally fix the
      malformed `RESEND_API_KEY` value (code now self-heals it, so cosmetic).

## 🟠 P1 (added Jun 10)

- [ ] **Platform Hub v2** — tenant-creation WIZARD (schedule-form-style sequence, pre-fill from a
      demo lead, branding preview, module presets, first-admin invite) + control-center overview.
      Plan: docs/plans/PLATFORM_HUB_V2_PLAN.md. Phase 1 (demo-requests inbox) shipped Jun 10.
- [ ] **Login title/tagline still swap during branding load** on `/login` — logo flash fixed Jun 10
      with a skeleton; "Welcome Back" → "Welcome to Patriot" text swap remains (minor polish).

## 🟡 P2 — Soon

- [ ] **Module gating phase 3: API enforcement** — apply `requireModule()` to non-core API routes
      (UI + deep-link gating already live; data is still served on direct API calls).
- [ ] **Mobile audits remaining**: maintenance wizard, maintenance inbox, inventory new-item modal.
- [ ] **Schedule board extraction** — `schedule-board/page.tsx` ~2,850 lines → extract OperatorRow,
      JobCard, EditModal, DispatchModal.
- [ ] **Loading/error-state audit** on remaining low-traffic admin pages (~45 pages, round 4).
- [ ] **SEO homepage rewrite** — custom-software + agentic-automations positioning, robots/sitemap/
      OG/JSON-LD, Patriot case study (docs/plans/SEO_HOMEPAGE_PLAN.md).
- [ ] **Date-lib migration follow-ups** — `operator/[id]/page.tsx` getWeekStart/getWeekEnd still UTC.
- [ ] **Consolidate timecard settings tables** — key/value `timecard_settings` is bypassed; converge on v2.
- [ ] **`grant-super-admin` audit-log insert uses wrong columns** — silently failing (pre-existing).
- [ ] **Patriot visual assets** — founder uploads logo → Settings → Company Branding.
- [ ] **Google Maps API key in Vercel** (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) → restores address autocomplete.
- [ ] **Twilio**: toll-free verification + rotate auth token.
- [ ] **Understand-Anything pilot** — founder runs `/plugin install understand-anything` in Claude
      Code → `/understand` → commit the JSON graph → visual codebase dashboard for the team.

## 🟢 P3 — Someday / strategic

- [ ] **APNs**: wire `lib/send-push.ts` into `/api/push/route.ts` end-to-end + confirm token registration.
- [ ] **Android app** (`npx cap add android`, $25 Google Play) — after iOS settles.
- [ ] **CSP nonce-based** (replace unsafe-inline, MED-5).
- [ ] **codegraph pilot** — local MCP code index (~47% token savings for agents). Stage after
      Understand-Anything proves value; don't run two indexers at once.
- [ ] **Per-tenant subdomains** (`patriot.pontifexindustries.com`).
- [ ] **Project rating system** (memory: project_rating_system_plan.md).
- [ ] **TanStack Query / Zod / RHF adoption** — phased (docs/reference/DEV_TOOLING_RECOMMENDATIONS.md).
- [ ] **Restore drill** for backups once Supabase Pro is on.

## ✅ Recently shipped (context for current work)

- **Jun 9:** `RESEND_API_KEY` defensive sanitizer — self-heals the malformed Vercel env var that
  502'd ALL outbound email; 9 unit tests; deployed READY (`a56a2322`).
- **Jun 9:** Docs reorganization — 119 root MDs → organized `docs/` tree + ARCHITECTURE.md +
  BACKLOG.md + DEVELOPMENT_PLAYBOOK.md + project skills.
- **Jun 8:** Invite system (guardian-hardened), editable team emails, light-mode invite/setup pages,
  branding flash fix, verified-domain email fix, iOS Build 8 (Face ID) → TestFlight.
