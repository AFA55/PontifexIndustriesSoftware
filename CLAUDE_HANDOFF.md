# CLAUDE_HANDOFF.md — Pontifex Industries Platform

**Last updated:** Jul 1, 2026 | **Branch:** `main` | **Prod:** ✅ LIVE (Jul 1 live-blocker sweep, pushed `ff40da25`)

> **🛎️ Jul 1 session (Sonnet 5) — non-compete scrub + 4 live prod issues fixed + team-pattern doc:**
> Founder ran a fresh 6-agent director-level audit (docs, codebase, DB/RLS, backlog, test/CI, mobile) —
> full findings in the audit itself, not re-copied here. From that audit, stood up 4 worktree-isolated
> builders + verified/merged/committed all 4 (build+tsc+jest all clean, pushed `ff40da25`):
> 1. **Non-compete leak scrubbed from the LIVE WEBSITE + Stripe checkout** (not just store listings —
>    9 files: homepage, pricing, request-demo, offer/case-study pages, Stripe description). Biggest
>    catch: the platform-WIDE login page fallback tagline was literally *"Concrete Cutting Management
>    System"*, shown to ANY tenant. See [[pontifex-positioning-noncompete]] memory.
> 2. **Live conditional-React-hooks bug fixed** — `app/dashboard/admin/settings/page.tsx`
>    `BillingSection` had hooks gated behind an early `return null`. Fixed, zero UX change.
> 3. **CI green again** — those 4 hook errors WERE the entire CI failure (had been red 30+ pushes,
>    unnoticed since Vercel deploys regardless). Plus `.eslintrc.json` needed `"root": true`.
> 4. **5 public storage buckets locked down** (`avatars`, `job-photos`, `jobsite-area-docs`,
>    `scope-photos`, `site-compliance-docs`) — removed anon-listable SELECT policies (advisor
>    `public_bucket_allows_listing` was 5/5, now 0/5). Reads still work via `getPublicUrl()`.
>
> **New reusable systems from this session:** `docs/plans/JULY1_LAUNCH_BLOCKERS_TEAM_PLAN.md` (the
> worktree-builders + fidelity-reviewer team pattern) · `docs/playbooks/TWILIO_TOLLFREE_RESUBMIT.md`
> (exact fields for the 30530 rejection) · prompt-reconfiguration "lens" table added to
> `docs/playbooks/PROMPTING_GUIDE.md` + memory (reconfigure rough/typo prompts through a
> senior-engineer lens before acting — audit/debug/perf/refactor/architect/security/devops).
>
> **⚠️ STILL OPEN — needs founder action or confirmation next session:**
> - **Twilio toll-free**: rejected (30530, Entity Misclassification — `BusinessType` was
>   `SOLE_PROPRIETOR`, should be an LLC/private-for-profit type). Founder was mid-resubmission in the
>   console at session end (had corrected Legal Business Name + was changing Company Type) —
>   **verify this actually completed/was submitted next session**, don't assume it's done.
> - **Google Play store-listing copy**: the "bridge/digital-infrastructure" positioning text is
>   written and SAVED but sits as an unsubmitted draft ("Submit 2 changes for review" button never
>   clicked, pending founder go-ahead — outward-publish action, intentionally not auto-clicked).
> - **Google Play app review**: submission #4 (Jun 22) still "In review" as of Jul 1 (10 days).
>   Founder filed a Play support ticket Jul 1 ("App publishing", Pending, case ID pending, reply
>   window 2 business days) — check for Google's reply next session.
> - **iOS 1.0.5 / Build 10**: confirmed "Ready for Distribution" (live) as of Jun 30 — no action needed.

> **Prior — 🛎️ Customer Portal completed (Jun 28):** the portal was ~70% pre-built (magic-link `/portal/[token]`,
> doc signing `/sign/[token]`, liability waiver, survey). Built the 3 gaps this session, all guardian +
> rls-auditor PASS: **(1) customer notifications** (en-route + job-complete emails w/ portal link; SMS
> dormant till Twilio toll-free verified), **(2) customer comments → management** (2-way channel: portal
> thread + admin panel, notifies admin/PM/super_admin; new `customer_comments` table), **(3) live "In Route"
> tracker** (operator broadcasts GPS while in_route → customer sees "on the way" + last-updated; new
> `operator_location_pings` table; strict privacy cutoff outside in_route). Also live-caught + fixed the
> **office-documents 500** on the job-detail page. Spec/follow-ups: `docs/plans/CUSTOMER_PORTAL_GAPS_PLAN.md`.
> **Still TODO:** Twilio toll-free verification (founder+Twilio — unblocks ALL customer SMS); v2 location
> (geocode jobsite → real ETA + map); auto-trigger liability waiver on completion; the branding admin-gate
> fix + Settings design pass (founder ask, specced). | **iOS:** ✅ v1.0.4 APPROVED (auto-releasing) | **Android:** ✅ in Google Play review — **org account, closed-testing NOT required**, auto-publishes on approval

> **⚡ NEW — the dev-velocity engine (Jun 27 PT2):** we now run **parallel-burndown** — fan out N independent backlog items as concurrent reviewed builders instead of fixing 2–3 by hand. Engine: `.claude/workflows/parallel-burndown.js`; playbook: `docs/playbooks/PARALLEL_BURNDOWN.md`; tool verdicts: `docs/TOOLING_EVALUATION.md` Batch 3. Removed the dormant ruflo/claude-flow swarm (never invoked); added **Playwright MCP** (in-loop UI verification). Proven this session on a real 3-item batch incl. a P1 security fix. Default to this for multi-item work.
>
> **🚀 PATRIOT LAUNCH is the #1 priority now (revenue-first).** Founder needs revenue; fastest path =
> finish Patriot → they pay → LinkedIn proof. Full strategy: `docs/plans/PONTIFEX_STRATEGY_AND_ROADMAP.md`
> (resist scope creep; tenants≠apps; Hermes=personal-ops-only; Perplexity=research copilot). The launch
> definition + tiered punch list = the **PATRIOT LAUNCH EPIC** at the top of BACKLOG.md. **Tier 1 (launch
> fixes) ✅ DONE + LIVE (pushed `2f3143c3`):** clock-in reminder now admin-configurable (cron honors
> notification_settings), job-completion PDF hardened, shop inbox count wired + dead route removed,
> schedule-board duplicate bug fixed (was double-assigning operators). **NEXT = Tier 2** (the showcase
> data UIs, design-sensitive, use `frontend-design` skill): (1) operator production-input form (linear
> ft/holes per operator/job → existing `equipment_usage` table; add holes modeling), (2) cost input +
> Project P&L/production dashboard (surface the existing `job_pnl_summary` view + per-operator production).
> Then **Tier 3 = Artifex** (post-launch showcase; data already exists). Audit details: BACKLOG epic.
>
> **🎨 Tenant brand-token system (Jun 27 PT2, pushed `7c60735d`):** the recurring "UI ignores the tenant's color palette" bug had a ROOT CAUSE — `tailwind.config` never mapped a token to the `--color-*` vars BrandingProvider sets, so code hardcoded Pontifex purple across ~305 files. FIXED: added tenant-aware **`brand` / `brand-dark` / `brand-secondary` / `brand-accent`** Tailwind tokens (backed by `--color-*-rgb` channel vars for opacity; safelisted; `:root` defaults in globals.css; verified live = Patriot red/navy). **Use `bg-brand`/`text-brand`/`from-brand to-brand-accent`/`bg-brand/10` for ALL tenant-facing accents — never hardcoded purple/violet.** 16 highest-impact files swept (~213 swaps); ~290-file long tail tracked in BACKLOG P1 (run more parallel-burndown waves; preserve semantic status/category colors).

> **New session? Read this top-to-bottom once, then work from [BACKLOG.md](BACKLOG.md).**
> This file = where we are + how we work. BACKLOG.md = what to do next. [CLAUDE.md](CLAUDE.md) = the hard conventions (RLS, dates, auth, email, push-cost). [docs/SESSION_LOG.md](docs/SESSION_LOG.md) = older history.

---

## ⚡ WHERE WE ARE (Jun 27, 2026) — LAUNCH IN PROGRESS

The platform is **live on the web** with a paying trial customer (Patriot Concrete Cutting) and **both mobile apps are in store review**.

| Surface | Status |
|---|---|
| **Web** | ✅ LIVE — `pontifexindustries.com` (latest `0e8c1506`, Jun 27). This is the product; the mobile apps are thin wrappers around it. |
| **iOS** | ✅ **v1.0.5 / Build 10 — "Ready for Distribution"** (live since Jun 30 — App Store metadata non-compete scrub) + **Automatically release**. Don't cut a new build for web/bugfix changes. |
| **Android** | **v1.0.1 / versionCode 2 — STILL IN REVIEW** (Submission 4, Jun 22 — 10 days as of Jul 1), US-only, Managed publishing OFF → auto-publishes on approval. Founder filed a Play support ticket Jul 1 asking for a status check (case ID pending, 2-business-day reply window). **Separately:** an unrelated store-listing copy edit (non-compete positioning fix) is saved as an unsubmitted draft — "Submit 2 changes for review" not yet clicked, awaiting founder go-ahead. Procedure in the **`android-release`** skill. |

**The mobile apps are a remote-URL Capacitor webview that loads `pontifexindustries.com`.** This is the single most important architectural fact: **web/UI/API changes ship to BOTH apps instantly via a Vercel deploy — no App Store / Play build needed.** Only *native* changes (icon, splash, plugins, Info.plist/AndroidManifest, Capacitor config) require a store build.

### Shipped + LIVE (Jun 27 PT2) — dev-velocity + security batch (pushed `96964571`)
- **Dev-velocity engine** (`e25e8074`) — killed dormant ruflo/claude-flow (`.claude-flow/` + ~23 swarm agent-stub dirs, never invoked) + 4 dead npm deps + a stale duplicate component; added **Playwright MCP** + the **parallel-burndown Workflow** + playbook + TOOLING_EVALUATION Batch 3 (Hermes/Fugu/ruflo all rejected with reasons). Context: founder sent 5 IG videos → fact-checked by a 109-agent deep-research pass; the real "10x" was native Claude Code parallelism, not any IG tool.
- **🔒 voice-checkouts RLS leak FIXED + APPLIED to prod** (`96964571`, migration `20260627_voice_checkouts_drop_broad_policies.sql`) — dropped 3 broad authenticated storage policies; verified zero remain; access stays server-side via `supabaseAdmin`. rls-policy-auditor PASS.
- **grant-super-admin audit log FIXED** (`96964571`) — was silently never writing (wrong/missing columns); now correct `audit_logs` schema. guardian-review PASS.
- **Jest ignores `.claude/`** (`96964571`) — no more stale worktree suite pickup.
- ⚠️ **New follow-ups in BACKLOG (Jun 27 PT2):** 5 PUBLIC buckets allow listing (P1 security), `npm audit` 59 vulns (P2), Claude Context/Conductor trials staged (P2), grant-super-admin→logAuditEvent NIT (P3).

### Shipped + LIVE (Jun 24–27) — pushed, build-verified
- **Time Edit Requests redesign (white-label brand palette)** (`0e8c1506`) — accents now come from the tenant brand via `useBranding()` (Patriot → navy chrome/fills + red accents) instead of hardcoded purple/yellow/green; every company code gets its own palette. Geofence callout redesigned with distance + drive-time pills. **Don't reintroduce hardcoded `violet`/`amber`/`emerald` accents on tenant-facing screens — drive them from `branding.primary_color`/`secondary_color`.**
- **Drive-time auto-suggest** (`0e8c1506`) — Modify on a geofence flag pre-fills clock-out = recorded − estimated drive time from the shop (free distance-based estimate via `estimateDriveMinutes`, tenant-correct, works on localhost). Optional future upgrade: live Google driving time.
- **Smart notification auto-ack** (`0e8c1506`) — `mark-read` gained a `{ types }` mode (caller-scoped); opening the corrections page clears the admin's `timecard_review` bell items; resolving a flag clears the matching notifications tenant-wide. Fixes the "bell still shows N after I caught up" mismatch.
- **Resend acceptance email** (`0e8c1506`) — approved access requests expose `invitation_id` and show a "Resend email" button reusing `PUT /api/admin/invite` (rotates token, refreshes 7-day TTL).
- **Geofence clock-outs split into their own section + drive-time estimate + access-request bell alerts** (`e742d403`) — and fixed two worker notifications that were silently dropped by the `notification_type` CHECK (now use the allowed `'general'` value; keep the event key in `type`).
- **Permanently Delete user** (`61a809b0`) — `close_account()` scrub + frees the email (auth/profile renamed to a sentinel + permanent ban) + purges pending invitations/access_requests.
- **Subsistence out-of-town** (`3806f3f4`) — remote clock-in asks "working out of town?"; per-day "Subs." surfacing; night_date aligned to tenant timezone.

### Prior batches (Jun 22–23) — pushed, verified
**Jun 23 batch (deployed `113cd77a`):**
- **Maps address autocomplete FIXED** (`113cd77a`) — TRUE root cause was our **CSP in `middleware.ts`** (`script-src` lacked `maps.googleapis.com` → browser blocked the Maps script client-side; zero traffic reached Google). Added the Google origins to `script-src`/`connect-src`. **Verified live: `fetchAutocompleteSuggestions` returns 5 suggestions.** (Also done: dedicated website-restricted key "Pontifex Web Maps Key" in GCP project `quantum-conduit-482219-a1` w/ www referrer + Maps JS + Places New + billing; `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` swapped in Vercel. The old key `AIzaSyB4kg…` was orphaned/unmanageable — retired.)
- **Time-off** (`b77ca30e`+`4d120ecd`) — Log modal lists ALL company profiles; rank approval (admin→below-admin incl. PM/salesman+supervisor, super_admin→all, no auto/self-approve); **callouts/no-shows immediate + notify ALL management**, planned requests pending + notify approvers; schedule-board **"Out Today"** card for non-operators.
- **Email header** (`e67d39f2`) — logo renders/centers/spacing (Outlook-safe), no dup name, white-label-safe.
- **Remember Me default OFF** (`c736406b`) — opt-in; existing remembered users unaffected.
- **Secure biometric Face ID** (`dca49afd`) — stores Supabase **refresh token** (not password) in Keychain, **OS-enforced** (`BIOMETRY_CURRENT_SET`), decoupled from Remember Me, explicit opt-in (post-login prompt + My Profile→Security toggle), per-user-bound. **Web-only — no new iOS build** (Build 9 has plugin 8.4.5). Plan: `docs/plans/BIOMETRIC_LOGIN_ARCHITECTURE.md`.

**Jun 22 batch (deployed `0aaf111d`):** email white-label migration · notif-bell deep-link · remote-photo storage + out-of-radius auto-edit-request + storage RLS fix · late-recompute-on-edit · email UI polish (invoice clipping).

> **All commits through `0e8c1506` are pushed** (Jun 27 batch shipped with the docs cleanup).
> **No new DB migrations in the Jun 24–27 work** — all of it was code-only (the brand redesign, drive-time, smart-ack, and resend reuse existing tables/columns; the `notification_type` CHECK was worked *around* with the allowed `'general'` value, not altered). Prior additive/idempotent migrations: `timecard_photos_bucket`, `timecard_photos_drop_broad_policies`, `timecard_corrections_metadata`, `notifications_action_url`, `timecards_out_of_town` (subsistence).

### What shipped recently (the launch arc, Jun 20–22)
- **Timecards batch** (live `a0bf8bcb`): correction-request 404 fix, km→**miles** distance everywhere, **configurable start-time + late-entries** system (`lib/timecard-start.ts` resolution chain: job ticket > per-day override > tenant standard; new `/dashboard/admin/timecards/late` page + `timecard_day_overrides` table), geofence detail + remote-clock-in review tab.
- **Emails redesigned** to **react-email** (`emails/` component system, white-label via `getTenantEmailBranding`, dark-mode-proof, glossy red→navy, 72px logo).
- **iOS Build 9** archived/signed/uploaded/submitted to App Store review.
- **Google Play** taken from zero to in-review: app created on the **business** account (id `4973761380467352338`, package `com.pontifexindustries.platform`), all 11 App-content declarations + all 11 setup tasks + store listing (PII-scrubbed screenshots) done, production release submitted.
- **Play photo-permission block fixed** (this session): Google held the submit for declaring `READ_MEDIA_IMAGES` on an app with only infrequent photo use. Removed it (`tools:node="remove"`; the app uses the web `<input type=file>` system picker, not the unused `@capacitor/camera`), rebuilt vc2, resubmitted — passed.
- **Play Developer API upload automated** (`scripts/play-upload.mjs`): no more manual `.aab` file-pick. One-time setup done — Android Publisher API enabled on GCP project `pontifex-ind-1dc89`; SA `firebase-adminsdk-fbsvc@pontifex-ind-1dc89.iam.gserviceaccount.com` granted Admin in Play. Future Android ships = one command.

### Blocked on the founder (only the founder can do these)
- 🤖 **Google Play review** — out of our hands; auto-notifies by email; auto-publishes on approval (~day 5 of up-to-7). Nothing else to do on Play. (iOS v1.0.4 already approved/auto-releasing.)
- 👤 **Sentry DSN** · (optional) **AI Gateway greenlight + $ ceiling** for Jarvis Phase 2 · (optional) expand Play beyond US.
- ✅ Resolved since last handoff: Apple Developer Agreement re-accepted; Maps autocomplete fixed (was our CSP, not the API); Android closed-testing question settled (org-exempt).

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
