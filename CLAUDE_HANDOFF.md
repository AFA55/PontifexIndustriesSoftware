# CLAUDE_HANDOFF.md — Pontifex Industries Platform

**Last updated:** Jun 23, 2026 | **Branch:** `main` | **Prod:** ✅ LIVE (web deployed at `113cd77a`; only 1 docs commit unpushed) | **iOS:** ✅ v1.0.4 APPROVED (auto-releasing) | **Android:** in Google Play review

> **New session? Read this top-to-bottom once, then work from [BACKLOG.md](BACKLOG.md).**
> This file = where we are + how we work. BACKLOG.md = what to do next. [CLAUDE.md](CLAUDE.md) = the hard conventions (RLS, dates, auth, email, push-cost). [docs/SESSION_LOG.md](docs/SESSION_LOG.md) = older history.

---

## ⚡ WHERE WE ARE (Jun 22, 2026) — LAUNCH IN PROGRESS

The platform is **live on the web** with a paying trial customer (Patriot Concrete Cutting) and **both mobile apps are in store review**.

| Surface | Status |
|---|---|
| **Web** | ✅ LIVE — `pontifexindustries.com` (deployed `113cd77a`, Jun 23). This is the product; the mobile apps are thin wrappers around it. |
| **iOS** | ✅ **v1.0.4 APPROVED — "Ready for Distribution"** + set to **Automatically release** (the Jun-24-11am date in ASC is the *unselected* third option, ignore it). Developer Agreement re-accept = DONE. Releasing v1.0.4 delivers the native Face ID plugin to users. |
| **Android** | **v1.0.1 / versionCode 2 — IN REVIEW** on Google Play. Auto-publishes when Google approves. |

**The mobile apps are a remote-URL Capacitor webview that loads `pontifexindustries.com`.** This is the single most important architectural fact: **web/UI/API changes ship to BOTH apps instantly via a Vercel deploy — no App Store / Play build needed.** Only *native* changes (icon, splash, plugins, Info.plist/AndroidManifest, Capacitor config) require a store build.

### Shipped + LIVE (Jun 22–23) — all pushed, verified
**Jun 23 batch (deployed `113cd77a`):**
- **Maps address autocomplete FIXED** (`113cd77a`) — TRUE root cause was our **CSP in `middleware.ts`** (`script-src` lacked `maps.googleapis.com` → browser blocked the Maps script client-side; zero traffic reached Google). Added the Google origins to `script-src`/`connect-src`. **Verified live: `fetchAutocompleteSuggestions` returns 5 suggestions.** (Also done: dedicated website-restricted key "Pontifex Web Maps Key" in GCP project `quantum-conduit-482219-a1` w/ www referrer + Maps JS + Places New + billing; `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` swapped in Vercel. The old key `AIzaSyB4kg…` was orphaned/unmanageable — retired.)
- **Time-off** (`b77ca30e`+`4d120ecd`) — Log modal lists ALL company profiles; rank approval (admin→below-admin incl. PM/salesman+supervisor, super_admin→all, no auto/self-approve); **callouts/no-shows immediate + notify ALL management**, planned requests pending + notify approvers; schedule-board **"Out Today"** card for non-operators.
- **Email header** (`e67d39f2`) — logo renders/centers/spacing (Outlook-safe), no dup name, white-label-safe.
- **Remember Me default OFF** (`c736406b`) — opt-in; existing remembered users unaffected.
- **Secure biometric Face ID** (`dca49afd`) — stores Supabase **refresh token** (not password) in Keychain, **OS-enforced** (`BIOMETRY_CURRENT_SET`), decoupled from Remember Me, explicit opt-in (post-login prompt + My Profile→Security toggle), per-user-bound. **Web-only — no new iOS build** (Build 9 has plugin 8.4.5). Plan: `docs/plans/BIOMETRIC_LOGIN_ARCHITECTURE.md`.

**Jun 22 batch (deployed `0aaf111d`):** email white-label migration · notif-bell deep-link · remote-photo storage + out-of-radius auto-edit-request + storage RLS fix · late-recompute-on-edit · email UI polish (invoice clipping).

> **Only 1 unpushed commit:** `9faf1194` (BACKLOG.md doc note) — held to avoid a billed build for a doc-only change; rides the next real change.
> **DB migrations applied to prod** (additive/idempotent): `timecard_photos_bucket`, `timecard_photos_drop_broad_policies`, `timecard_corrections_metadata`, `notifications_action_url` (Jun 22). No new migrations Jun 23.

### What shipped recently (the launch arc, Jun 20–22)
- **Timecards batch** (live `a0bf8bcb`): correction-request 404 fix, km→**miles** distance everywhere, **configurable start-time + late-entries** system (`lib/timecard-start.ts` resolution chain: job ticket > per-day override > tenant standard; new `/dashboard/admin/timecards/late` page + `timecard_day_overrides` table), geofence detail + remote-clock-in review tab.
- **Emails redesigned** to **react-email** (`emails/` component system, white-label via `getTenantEmailBranding`, dark-mode-proof, glossy red→navy, 72px logo).
- **iOS Build 9** archived/signed/uploaded/submitted to App Store review.
- **Google Play** taken from zero to in-review: app created on the **business** account (id `4973761380467352338`, package `com.pontifexindustries.platform`), all 11 App-content declarations + all 11 setup tasks + store listing (PII-scrubbed screenshots) done, production release submitted.
- **Play photo-permission block fixed** (this session): Google held the submit for declaring `READ_MEDIA_IMAGES` on an app with only infrequent photo use. Removed it (`tools:node="remove"`; the app uses the web `<input type=file>` system picker, not the unused `@capacitor/camera`), rebuilt vc2, resubmitted — passed.
- **Play Developer API upload automated** (`scripts/play-upload.mjs`): no more manual `.aab` file-pick. One-time setup done — Android Publisher API enabled on GCP project `pontifex-ind-1dc89`; SA `firebase-adminsdk-fbsvc@pontifex-ind-1dc89.iam.gserviceaccount.com` granted Admin in Play. Future Android ships = one command.

### Blocked on the founder (only the founder can do these)
- 🍎 **Apple Developer Agreement** — Account Holder must re-accept it in App Store Connect or iOS updates can't submit.
- 🤖 **Apple/Google review** — out of our hands; both auto-notify by email.
- 🗺️ **Enable Places API (New)** in Google Cloud (address autocomplete; degrades to manual entry until then).
- 👤 **Approve Bryan's access request** · **Sentry DSN** · (optional) **AI Gateway greenlight + $ ceiling** for Jarvis Phase 2.

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
