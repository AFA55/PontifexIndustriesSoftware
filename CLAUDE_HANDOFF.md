# CLAUDE_HANDOFF.md — Pontifex Industries Platform

**Last updated:** Jul 31, 2026 (Opus 4.8) | **Branch:** `main` | **Prod:** ✅ LIVE through `4a6d0a56`.

> ### 🧭 NEW SESSION START HERE
> 1. **[docs/reference/OPERATING_MANUAL.md](docs/reference/OPERATING_MANUAL.md)** — the one-page orientation:
>    what Pontifex is, the **tools** at your disposal (skills, MCP, the build loop), and your **team**
>    (the agent types). Read it first if you're new to this project.
> 2. **This file** (below) — what's in flight + how we work.
> 3. **[BACKLOG.md](BACKLOG.md)** — the prioritized to-do list; work top-down.
>
> The founder (Andres, non-technical, typo-heavy, live-tests prod on 3 real Patriot operators) directs;
> you architect, build, verify, ship. Truth > reassurance. **The loop:** build → guardian-review →
> LIVE-verify (login `super@pontifex.com` / `super0202!` / code `PATRIOT`) → gate
> (`rm -rf .next && npm run build` + `tsc --noEmit` + `jest`; 163 pass, 2 email-ESM `TextEncoder`
> failures are pre-existing noise) → confirm spend → `git push origin main` (~$1–2, ONCE per batch) →
> watch deploy READY. Every `supabaseAdmin` query needs `.eq('tenant_id', …)` (it bypasses RLS).

> ## 📌 Jul 30–31 session (Opus 4.8) — field-ops + timecard sprint + native GPS foundation, all shipped
> Every feature guardian-reviewed; several real BLOCKING bugs caught + fixed before push. All LIVE.
> - **Multi-operator crew (`8f7e29dc`)** — `job_crew` table; LEAD (assigned_to) does full completion, additional operators are crew (light helper ticket + clock-in), crew notes on the completed ticket; duplicated jobs stay independent. **Guardian caught a pre-existing BLOCKER: the helper work-log was mounted inside the operator-only fragment → unreachable since ~Jul 14** (apprentice helpers couldn't log field work AND the Batch-3 helper→operator reviews never rendered) — fixed by moving it into the helper view.
> - **Printable completed ticket (`4e4911fe`)** — `app/dashboard/admin/jobs/[id]/completed-print/page.tsx` mirrors Patriot's paper ticket (logo + red job# top-right, times, work performed, footage, subsistence, signature, crew notes) for the paper billing hand-off.
> - **Schedule-board Edit actually saves (`35b52036`)** — inline job Edit silently 500'd (single-day jobs sent `end_date:''` → PG rejects) + never refreshed the board. Now saves + refreshes + surfaces errors + syncs scheduled_end_date.
> - **Timecard Phase A (`3ce910e0`)** — notifications scroll fix · configurable auto-clockout (time picker default 6pm; cron reworked hourly, tenant-local, night shifts keep noon) · out-of-town subsistence prompt at clock-out (idempotent; annual report reads `subsistence_nights` as source of truth). Guardian fixed a midnight-crossing subsistence double-count.
> - **Timecard Phase B (`dafb852c`)** — double-time tag (hours × 2, OT-exempt via single-classification in calculateWeekSummary + team-summary; override populates double_time_hours; bulk apply-double-time endpoint) · 60-day tenure gate on holiday pay (grandfather null hire_date) + eligibility view · holidays on the schedule board (badge + "Mark Paid Holiday"). **Guardian caught a BLOCKING double-subtract (negative payroll hours)** — fixed.
> - **Phase C native GPS — FOUNDATION SHIPPED + LIVE (`f5541609`→`4a6d0a56`), gated for a native build.**
>   Background geofencing for auto-arrival + app-closed clock-out reminder. What's live in code (web build
>   verified safe — all native code is `isNativeApp`-gated + `registerPlugin`, so nothing native bundles
>   into the web/SSR build): jobsite lat/lng persistence (Google Places coords on create + Nominatim
>   backfill cron) · `@capacitor-community/background-geolocation` watcher (`lib/native/geofence-service.ts`,
>   0.5-mi auto-arrival + back-at-shop reminder) · consent-before-OS-prompt modal + per-user consent gate ·
>   privacy-policy v1.3 + gps-consent v2.0 rewritten to disclose on-the-clock background location ·
>   `stopGeofencing()` wired into BOTH clock-out paths (compliance: "stops when you clock out" is literally
>   true) · iOS `Info.plist` + `PrivacyInfo.xcprivacy` + Android manifest permissions. Guardian + a
>   compliance-pro review both ran; every compliance-critical code item is done.
>   **⚠️ Phase C is NOT in users' hands yet — it needs FOUNDER + native work (see the checklist below).**
>   Full plan + status + the founder checklist: `docs/plans/PHASE_C_NATIVE_GPS.md`.
> - **Docs cleanup (this session):** added `docs/reference/OPERATING_MANUAL.md` (exec summary + tools +
>   team); refreshed this handoff top; pruned dead one-off files from `docs/archive/`.
>
> ### 🚧 Phase C — remaining before it reaches operators (FOUNDER-gated; do NOT ship autonomously)
> 1. **Native builds** — bump version → `npx cap sync ios/android` → archive/build → TestFlight/internal.
>    The plugin + permissions only take effect in a fresh binary. Use `ios-release` / `android-release`.
> 2. **On-device testing/tuning** — the "Always" permission flow, `distanceFilter`, the 0.5-mi radius,
>    hysteresis, battery. The geofence logic is v1 and can't be validated without a device.
> 3. **Google Play (highest rejection risk)** — background-location Declaration Form + ≤30s demo video +
>    core-functionality justification. **Apple** — App Privacy label (Precise Location → App Functionality)
>    + "Always" justification in review notes. **Signed employee consent** in onboarding. **SC counsel**
>    sign-off on employee location monitoring. (All founder tasks — detailed in the Phase C plan.)

---

## 📦 Current platform status (Jul 31, 2026)

| Surface | Status |
|---|---|
| **Web** | ✅ LIVE — `pontifexindustries.com` (`main` auto-deploys via Vercel). This IS the product; the apps are thin webviews around it. |
| **iOS** | ✅ LIVE on the App Store. New build only for NATIVE changes (Phase C GPS is the next one). |
| **Android** | ✅ LIVE in Google Play (see memory `android-play-release`). Ship future Android via `scripts/play-upload.mjs` (one command). |

**Live now:** 3 real Patriot operators clock in daily. Twilio toll-free SMS (+18336954288) approved + live.
Contracts + e-signature, customer portal, hiring/job-board module, takeoffs, Artifex AI assistant, the full
timecard/payroll + field-ops workflow — all shipped.

**Older session history** (Jun–Jul 2026, per-commit) lives in **[docs/SESSION_LOG.md](docs/SESSION_LOG.md)**
and `git log`. Only the current sprint stays in this file; prune older blocks into the log at session end.

**Founder-side open items** (only the founder can do): the Phase C store/legal checklist above · real
paper-ticket scan tests · Meta business verification (unblocks job-ad Phase 4) · exercising the $5/mo
subscription test. Feature backlog → **[BACKLOG.md](BACKLOG.md)**.

---

## 🧭 HOW WE WORK (the operating model)

1. **Claude is the executive engineer**, not an order-taker. Analyze → architect → decide → implement → verify. Don't ask permission for routine edits/refactors/migrations (autonomous mode). DO confirm before irreversible/outward-facing actions and before spending money.
2. **💰 Push discipline is the #1 cost rule.** Every `git push origin main` triggers a billed Vercel build (~$1–2); builds were ~86% of the bill. **Commits are free — batch them and push ONCE per session, only after verification, and confirm with the founder unless told "push it."** See [DEPLOYMENT_COST.md](DEPLOYMENT_COST.md). `claude/*` branches don't auto-deploy.
3. **Verification gate before every push:** `npm run build` green + `tsc` 0 errors + relevant tests + eyeball the change (preview tools where it's web-observable). Run the `prod-deploy` skill for the full gate.
4. **Batch by layer** when doing parallel work (all backend, then all UI, then migrations), use worktree-isolated subagents for independent features, and **merge worktree branches back to `main` before the session ends** (localhost runs from the main repo, not worktrees). Clean up `.claude/worktrees/` after (it has filled the disk before).
5. **End every session:** update this handoff + BACKLOG status, then push if authorized.
6. **DB changes:** additive + idempotent migrations applied via Supabase MCP; tenant_id + tenant-scoped RLS via the SECURITY DEFINER helpers — **never** `auth.jwt() -> user_metadata`. Risky migrations go through a Supabase branch first.

## 🧠 HOW TO THINK (decisions)

**Before any significant technical/product decision, invoke the `dev-decisions` skill.** Its core procedure: gather facts → enumerate ALL real options with timelines + cost + reversibility → pick the **cheapest reversible step that actually works** → verify end-to-end. Hard rule: never answer a "fastest/best way" question with a single route — give the honest options table (we used this today choosing drag-drop vs. the Play API). Bias toward facts over guesses; verify file/flag/table names against current code before asserting.

## 👥 THE TEAM (skills + subagents — don't re-derive, invoke)

**Project skills** (in `.claude/skills/` — our playbooks, encoded):
- `dev-decisions` — first-principles decision framework (read before deciding).
- `prod-deploy` — the verification gate + cost confirm + push + deploy-watch.
- `guardian-review` — architecture-guardian PASS/BLOCKING checklist. **Run after every builder/subagent**, before committing significant changes.
- `ios-release` — full App Store/TestFlight ship procedure (manual signing, Transporter, screenshot gotchas).
- `android-release` — full Google Play ship procedure (version bump, `cap sync`, signed AAB, `scripts/play-upload.mjs` API upload, declarations checklist) + how to read Play review status. Org account = no closed testing required.
- `design-taste` / `frontend-design` / `pontifex-brand` — anti-generic UI + brand application (bridge-P mark, purple→red gradient).

**Specialist subagents** (spawn via the Agent tool for the right job):
- `Explore` — broad read-only codebase search (fan-out, returns conclusions not file dumps).
- `Plan` — implementation planning / architecture trade-offs.
- `rls-policy-auditor` — **run before merging any RLS migration** (catches `user_metadata` + missing `tenant_id`).
- `supabase-migration-author` — writes correct idempotent migrations (RLS helpers, tenant_id, triggers).
- `mobile-responsive-auditor` — sweeps operator pages at 375/414px (tap targets ≥44px, overflow, contrast).
- `production-validator` — confirms a feature is wired end-to-end before shipping.
- `backend-dev` / `general-purpose` — API routes / multi-step research & build.

Operators are on phones in the field (sometimes gloved) → mobile-first is non-negotiable. Every new feature must work for **any** tenant (white-label; no hardcoded Patriot branding). Full model: [docs/DEVELOPMENT_PLAYBOOK.md](docs/DEVELOPMENT_PLAYBOOK.md).

## ▶️ HOW TO PROCEED

1. Read [BACKLOG.md](BACKLOG.md) — single source of truth (P0→P3). Work top-down unless the founder reprioritizes.
2. Pick the top unchecked item; if it's a feature, plan → build → `guardian-review` → verify → check it off.
3. Batch commits; **confirm before pushing** (or push when told "push it").
4. Update this handoff + BACKLOG STATUS at session end.

**Likely next priorities** (confirm with founder): monitor both store reviews; expand Play to more countries if desired; exercise remaining email routes live; Jarvis Phase 2 (Claude brain) pending AI-Gateway greenlight; P1/P2 polish in BACKLOG.

## 📁 WHERE THINGS LIVE (doc map)
- **[CLAUDE.md](CLAUDE.md)** — hard conventions (RLS helpers, date handling, auth/bearer pattern, email via `lib/email.ts`, Google Maps loader, push, roles). Read for any code work.
- **[BACKLOG.md](BACKLOG.md)** — all bugs/features/priorities + the STATUS dashboard.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — system design + Mermaid diagrams.
- **[DEPLOYMENT_COST.md](DEPLOYMENT_COST.md)** — why pushes cost money + the rules.
- **[APP_CHANGES.md](APP_CHANGES.md)** — native iOS/Android-only change log.
- **docs/** — `plans/` (future work) · `playbooks/` (how-tos) · `reference/` (deep context: CLAUDE_CONTEXT, FEATURE_CATALOG, **UI_CATALOG** = reusable Tailwind patterns, SCALING) · `archive/` (history, don't update) · `SESSION_LOG.md` (sprint history) · `DEVELOPMENT_PLAYBOOK.md` · `TOOLING_EVALUATION.md` (check before installing anything).
- **Auto-memory** (`~/.claude/.../memory/`) — loads into every session; `MEMORY.md` is the index. Key files: `android-play-release.md`, `supabase-pro-active.md`, `superadmin-demo-and-role-labels.md`, `resend-verified-domain.md`.

## 🔑 Key facts a new session needs
- **Stack:** Next.js 15 (App Router) + React 19 + TS + Supabase (Postgres, RLS) + Tailwind; Capacitor remote-webview for iOS/Android.
- **Supabase project:** `klatddoyncxidgqtcjnu` (Pro plan → automated backups + PITR).
- **Multi-tenant SaaS:** company-code + email + password login; everything scoped by `tenant_id`. Pontifex (code `PONTIFEX`) is the parent org → super_admin lands on the Platform Hub; Patriot (code `PATRIOT`) is tenant #1.
- **Demo logins:** `admin@pontifex.com` / `superadmin@pontifex.com` (both `PontifexDemo2026!`); super_admin `super@pontifex.com` / `super0202!`. Play reviewer login = `admin@pontifex.com` / `PontifexDemo2026!` / company code `PATRIOT`.
- **Roles (priority):** super_admin > operations_manager > admin > salesman > shop_manager > inventory_manager > operator > apprentice.
- **Three envs:** Production (`main` → prod Supabase), Vercel preview (any branch), local (`localhost:3000`, touches prod DB via `.env.local`).

---

<details><summary>📜 Older session detail (pre–Jun 20) — full sprint history in docs/SESSION_LOG.md</summary>

Highlights (also in auto-memory + git history): BofA-style web Touch ID (built then **removed** Jun 14 — the browser password manager already handles it; iOS native Face ID kept), the "Save password" full-navigation fix, the request-access account-creation fix (listUsers-pagination bug), tenant-branded emails, the time-off system rebuild, GPS-only clock-in, Jarvis Command Center Phase 1, and the Jun 9 docs reorg. Per-commit detail is in `git log`.

</details>
