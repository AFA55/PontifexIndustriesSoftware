# Pontifex — Operating Manual (Executive Summary · Tools · Team)

> **Read this first each session, alongside `CLAUDE_HANDOFF.md` (what's in flight) and
> `BACKLOG.md` (the priority list).** This is the "what is this, what can I use, and who's on
> the team" orientation. Last refreshed: **Jul 31, 2026**.

---

## 1. Executive summary — what Pontifex is + where it stands

**Pontifex Industries** is a multi-tenant SaaS for construction/field-service companies — one
platform hosting multiple companies, fully isolated by `tenant_id` + RLS. **Tenant #1 is Patriot
Concrete Cutting** (paying trial, ~3 real operators using it daily). The end-state is white-label:
each tenant gets its own brand, users, jobs, customers.

- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Supabase (Postgres, 90+ tables, RLS on
  all) · Tailwind. Hosted on **Vercel** (`pontifexindustries.com`).
- **Three surfaces, one web build:** the browser + the **iOS app** (App Store, live) + the **Android
  app** (Play, live) are all the SAME Next.js app — the mobile apps are a **Capacitor remote-URL
  webview** loading the live site. So web/UI/API changes reach all three instantly via a Vercel push;
  **only NATIVE changes** (plugins, `Info.plist`, `capacitor.config`, icons, permissions) need a store
  build + submission. Gate native behavior behind `isNativeApp()`.
- **What's live:** scheduling/dispatch (the schedule board is the most complex admin surface), the
  operator field workflow (my-jobs → jobsite → work-performed → day-complete → signature → PDF),
  timecards/payroll, billing/invoicing, customer CRM + portal, a hiring/job-board module, equipment/
  shop, analytics, the Platform Hub (super-admin, cross-tenant), and an "Artifex" AI 2nd-brain.
- **Positioning (non-negotiable, see [[pontifex-positioning-noncompete]] memory):** market Pontifex as
  the bridge for companies to build **custom software / digital infrastructure** (industry-agnostic) —
  NEVER as "concrete cutting software." Patriot is a client, not the product.
- **North star:** revenue via getting Patriot fully live + happy; resist scope creep
  (`docs/plans/PONTIFEX_STRATEGY_AND_ROADMAP.md`).

**Current phase:** launching / hardening on live use. Recent big work: field-ops fixes, the full
timecard finishing batch, and Phase C native GPS geofencing (foundation shipped; store submission +
on-device testing pending the founder). See `CLAUDE_HANDOFF.md` for the exact in-flight state.

---

## 2. The toolkit — what's at your disposal

### Skills (invoke by name; they load instructions or run a subagent)
Project skills live in `.claude/skills/`; invoke the relevant one BEFORE doing that kind of work.
- **`dev-decisions`** — the first-principles decision framework. **Read before ANY significant
  technical/product decision** (architecture, schema, security, API shape, a build/deploy, "which
  option"). Enforces: gather facts → enumerate ALL options with real cost/timeline/reversibility →
  cheapest reversible step → verify end-to-end. Includes the HONEST-OPTIONS rule.
- **`prod-deploy`** — the production deploy gate: clean `npm run build` + `tsc` + `jest`, confirm the
  spend, push ONCE per session, watch the Vercel deploy to READY.
- **`guardian-review`** — the adversarial architecture-guardian checklist; run behind every builder.
- **`ios-release` / `android-release`** — full store-ship procedure (version bump, `cap sync`, signing,
  Transporter/Play upload, submission). ONLY for native changes.
- **`frontend-design` / `design-taste` / `pontifex-brand`** — UI taste (any screen / marketing-only /
  Pontifex-branded assets respectively).
- **`parallel-burndown`** — fan out N independent backlog items as worktree-isolated builders, each
  guardian-reviewed. Default for 3+ independent items.
- **`loop` / `schedule`** — recurring / scheduled tasks. **`Workflow`** tool — deterministic multi-agent
  orchestration (opt-in; large token cost — only when explicitly asked or "ultracode").

### MCP servers (external capabilities)
- **Supabase** (`mcp__…__apply_migration` / `execute_sql` / `list_tables` / `get_advisors`) — apply
  additive/idempotent migrations straight to prod; run read queries; check RLS advisors. Project
  `klatddoyncxidgqtcjnu`.
- **Vercel** (`list_deployments` / `get_deployment` / build logs) — watch deploys to READY; project
  `prj_vubQAdrHfAlSq9msk0sfedlBq5zJ`, team `team_9PEEftgbKgEZCHzklblcjKKa`.
- **Browser** (`mcp__Claude_Browser__*`) — the in-app browser: `preview_start` the dev server
  (`.claude/launch.json`, port 3000), navigate, `read_page`, `computer` clicks, console/network reads.
  Use for live end-to-end verification. (Demo login: PATRIOT / super@pontifex.com / super0202!.)
- **iOS Simulator** (`mcp__Claude_Code_iOS_Simulator__*`) — run/screenshot the iOS app.
- **visualize** — inline diagrams/mockups. **context7 / playwright** — library docs / browser automation
  (connect on demand).
- Many claude.ai connectors (Slack, Linear, Notion, GitHub, …) are listed but **need OAuth** in an
  interactive session before use — surface that, don't assume they're available.

### The build loop (the "loop function" that governs every change)
```
read handoff + backlog  →  build (self or builder agents)  →  guardian-review behind each builder
  →  fix BLOCKING findings + re-review  →  GATE: rm -rf .next && npm run build && tsc --noEmit && jest
  →  confirm the spend  →  push ONCE per session  →  watch deploy to READY  →  update handoff
```
Cost discipline: **every push to `main` is a billed Vercel build (~$1–2)** — batch commits, push once,
confirm before pushing (see `DEPLOYMENT_COST.md`). Migrations are free + applied via Supabase MCP.

---

## 3. The team — the "team members" (agent types) you dispatch

Spawn via the `Agent` tool; run several in parallel (one message, multiple calls) for independent work.
**Put a guardian behind every builder** — this session alone, reviewers caught a negative-payroll-hours
bug, a GPS-watcher-leak-after-logout, and a background-tracking compliance hole, all before shipping.

| "Team member" (agent type) | Role | Use for |
|---|---|---|
| **Explore** | Read-only fan-out search | Mapping the codebase / "where does X live" — returns conclusions, not file dumps |
| **Plan** | Architect | Designing an implementation approach before building |
| **general-purpose** | Builder / researcher | Implementing a scoped feature; also the default for a bespoke **adversarial guardian review** or a **compliance/legal analysis** (give it the mandate + web research) |
| **guardian-review** (skill) | Adversarial reviewer | Behind every builder — PASS/BLOCKING verdict |
| **rls-policy-auditor** | Security | Before merging any RLS migration — catches `user_metadata` + missing tenant checks |
| **supabase-migration-author** | Schema | Authoring a correct idempotent tenant-scoped migration |
| **mobile-responsive-auditor** | Mobile QA | After any operator-facing UI change (375px, tap targets ≥44px) |
| **Vercel / Figma / brand-voice / seo / etc.** | Domain specialists | As their descriptions fit |

Dispatch patterns: **parallel by layer** (all backend, then all UI) when files don't overlap;
**worktree isolation** (`isolation: "worktree"`) when agents mutate files concurrently — but clean up
`.claude/worktrees/` after (it once hit 81 GB). Payroll/auth/RLS get the highest scrutiny; verify a
guardian's falsifiable claim against the DB/code rather than trusting either side blindly.

---

## 4. Guardrails you must not break (from CLAUDE.md — read it in full)
- **Tenant isolation is sacred:** every table has `tenant_id` + tenant-scoped RLS via the SECURITY
  DEFINER helpers (`current_user_tenant_id()`, `is_admin()`, `current_user_has_role()`). **NEVER**
  `auth.jwt() -> 'user_metadata'` for authz (client-writable → self-promotion).
- **Read path must match write path** — when you change a write, find every reader (and vice versa).
- **Dates:** use `lib/dates.ts`; never `new Date('YYYY-MM-DD')` (UTC off-by-one).
- **Auth:** API calls send `Authorization: Bearer <token>`; `requireAuth/requireAdmin/…` read the bearer.
- **Migrations:** additive + idempotent (`IF NOT EXISTS`, `EXCEPTION WHEN duplicate_object`).
- **Truth over reassurance:** if something's broken/pending/uncertain, say so with evidence; never fake success.

---

## 5. Documentation map (where things live)
- **`README.md`** front door · **`ARCHITECTURE.md`** system design + diagrams · **`CLAUDE.md`** the
  operating instructions (authoritative) · **`DEPLOYMENT_COST.md`** cost discipline.
- **`BACKLOG.md`** — single source of truth for all bugs/features/priorities (work top-down).
- **`CLAUDE_HANDOFF.md`** — latest session handoff (what's in flight); update at end of every session.
- **`APP_CHANGES.md`** — native-only change log.
- `docs/plans/` future work · `docs/playbooks/` how-tos (`HOW_WE_BUILD.md`, `PROMPTING_GUIDE.md`,
  `PARALLEL_BURNDOWN.md`, `TEST_LOOPS.md`) · `docs/reference/` deep context (this file, `FEATURE_CATALOG`,
  `UI_CATALOG`, `SCALING`) · `docs/archive/` history (don't update) · `docs/SESSION_LOG.md` sprint history.
- **Memory:** `MEMORY.md` + the memory files hold durable facts (who the founder is, launch status,
  positioning, verified decisions) — recalled each session.
- **Do NOT create new root-level MD files.** Plans → `docs/plans/`, how-tos → `docs/playbooks/`,
  finished reports → `docs/archive/`.
