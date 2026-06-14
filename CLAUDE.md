# Pontifex Industries Platform — Claude Instructions

## Project
Concrete cutting operations platform for Patriot Concrete Cutting (white-label as Pontifex Industries).
Next.js 15 (App Router) + React 19 + TypeScript + Supabase (PostgreSQL) + Tailwind CSS.

## Autonomous Mode
- Make all code changes directly — do not ask for confirmation on edits, file creation, or refactors
- Apply database migrations via Supabase MCP when ready
- Run `npm run build` after significant changes to verify no errors
- Commit work in logical chunks with descriptive messages
- **💰 BUDGET (May 2026): ~$5–6 Vercel build credit left. Each push to `main` = ~$1–2 build. BATCH commits and push only ONCE per session/batch — never per-feature or docs-only. Commits are free; pushes cost money. Confirm before pushing unless told "push it." See `DEPLOYMENT_COST.md`.**
- Push to feature branch when commits are ready
- When starting a new session, read CLAUDE_HANDOFF.md first to resume context
- At the END of every session, update CLAUDE_HANDOFF.md with what was done and what's next

## Session Workflow
1. **Start of session:** Read CLAUDE_HANDOFF.md → pick up where last session left off
2. **During session:** Work through `BACKLOG.md` top-to-bottom (P0 first) unless user reprioritizes
3. **After each feature:** Run `npm run build` to verify, commit with descriptive message
4. **End of session:** Update CLAUDE_HANDOFF.md + push to branch
5. **If user says "pick up next task":** Read `BACKLOG.md` and start the next unchecked item

## Parallel Work
- User can request multiple features built simultaneously using parallel agents
- Each agent works in an isolated worktree to avoid conflicts
- Batch by layer when possible: all backend API routes → all UI pages → all migrations
- **CRITICAL**: Worktree branches MUST be merged back to the working branch before session ends. User's localhost runs from the main repo, not worktrees.
- **CRITICAL**: Worktrees do NOT inherit `.env.local` — copy it from the main repo or Supabase calls will fail.
- If `.next/` cache causes "routes-manifest.json" errors, delete `.next/` and restart the dev server.

## Key Conventions
- API routes use `requireAuth()`, `requireAdmin()`, `requireSuperAdmin()`, or `requireScheduleBoardAccess()` from `lib/api-auth.ts`
- Client pages use `getCurrentUser()` from `lib/auth.ts` with role array checks in useEffect
- Supabase admin client (`lib/supabase-admin.ts`) for all server-side DB operations (bypasses RLS)
- Supabase public client (`lib/supabase.ts`) for client-side. **Auth session persistence is "Remember me"-aware:** `lib/supabase.ts` uses a custom `rememberAwareStorage` adapter keyed off `pontifex.rememberMe` (localStorage) — remembered → session in `localStorage` (survives restart), not remembered → `sessionStorage` (cleared on close). The login flow writes that flag BEFORE `setSession()`. Don't revert the client to default storage or you re-break the toggle.
- **Authenticated client → API calls must send `Authorization: Bearer <access_token>`** (from `supabase.auth.getSession()`); `requireAuth()` reads the bearer token, NOT cookies. See `app/dashboard/my-profile/page.tsx` and `lib/webauthn-client.ts` for the pattern.
- **Passkey / fingerprint login (WebAuthn, `@simplewebauthn` v13):** the website's biometric sign-in (Touch ID / Windows Hello / Android), the web analogue of the app's native Face ID. Server helpers `lib/webauthn.ts`, browser glue `lib/webauthn-client.ts`, ceremonies `app/api/auth/webauthn/*`, credentials in `webauthn_credentials`. rpID/origin are derived from the request (works on localhost/preview/prod/iOS-webview); passkeys are domain-bound (one made on prod won't verify on a preview URL). Passwordless: a verified assertion mints a Supabase session via `admin.generateLink('magiclink')` + `verifyOtp` (no password). UI: `PasskeySettings` (enroll/manage in My Profile), `PasskeyLoginButton` (login pages; hidden on the native app via `isNativeApp()`).
- API response format: `{ success: true, data: {...} }` or `{ error: 'message' }` with HTTP status
- All logging is fire-and-forget via `Promise.resolve(supabaseAdmin.from(...).insert(...)).then(...).catch(() => {})`
- Job numbers: `JOB-{year}-{6 digits}` (schedule form) or `QA-{year}-{6 digits}` (quick add)
- Purple/dark theme aesthetic with Tailwind
- Use lucide-react icons throughout
- Mobile-first responsive design
- **Dates (avoid the recurring timezone bug):** a DB `date` column comes back as a bare `'YYYY-MM-DD'` string. **NEVER** do `new Date('2026-06-01')` (parsed as UTC midnight → renders as the *previous day* in US timezones → "Sun, May 31") and **NEVER** use `d.toISOString().split('T')[0]` to get a *local* calendar date. To DISPLAY a bare date, parse local: `new Date(dateStr + 'T00:00:00')`. To EXTRACT a local YYYY-MM-DD from a Date, use local components (`getFullYear`/`getMonth`/`getDate`), not `toISOString()`. **The shared date lib EXISTS: `lib/dates.ts` — use it** (`toLocalYMD`, `parseYMDLocal`, `formatDay`, `mondayOf`, ...); `lib/timecard-utils.ts` delegates to it.
- **Google Maps / Places (do NOT reintroduce `@react-google-maps/api`):** that library's `useJsApiLoader` spammed two console errors on any page where the script can't load — a "unique key prop" warning (its internal `GoogleMapsLoader` renders a keyless array) and a **tight retry loop** ("Failed to load Google Maps script, retrying in 2 ms") that floods the console and hammers the network. It was removed (Jun 2026). The loader is now `components/providers/GoogleMapsProvider.tsx`: a module-level single-flight that injects **one** `<script id="gmaps-bootstrap" …loading=async&libraries=places>` and rejects **once** on error (no retry). Address autocomplete uses the **Places API New** (`google.maps.importLibrary('places')` + `AutocompleteSuggestion.fetchAutocompleteSuggestions`) in `components/ui/GoogleAddressAutocomplete.tsx` — the legacy `Autocomplete`/`<GoogleMap>` widgets are gone. On **localhost the prod key is referrer-restricted**, so `window.google` stays undefined and the address field degrades to manual entry — this is expected, not a bug; it works on the deployed domains. Consumers read `useGoogleMaps()` → `{ isLoaded, loadError }`.
- **React keys in layouts (the "unique key prop" warning attributed to a Provider):** a **Client Component layout** that renders multiple children where one is the dynamic `children` prop (e.g. `<Provider><A/><B/>{children}</Provider>`) makes React's dev reconciler treat the children as a *runtime array* and validate every element for a `key`. The static siblings warn, and React blames the **nearest named ancestor** (often a Provider like `GoogleMapsProvider`) — the named component is a red herring, the real fix is at the mount site. Give **every** sibling an explicit key, including the page subtree wrapped in a keyed Fragment: `<Provider><A key="a"/><B key="b"/><Fragment key="page">{children}</Fragment></Provider>`. See `app/dashboard/layout.tsx`. (Production-stripped warning, but keep the console clean.)

## Database
- Supabase project: `klatddoyncxidgqtcjnu`
- 70+ migrations in `supabase/migrations/`
- 90+ tables in production
- All tables have RLS enabled
- **DO NOT use `auth.jwt() -> 'user_metadata'` in RLS.** `user_metadata` is client-writable via `supabase.auth.updateUser({ data: { role: 'super_admin' } })`, so any operator could self-promote. Supabase's linter flags this as `rls_references_user_metadata` (ERROR).
- For role/tenant checks in RLS, use the SECURITY DEFINER helpers that read from `public.profiles`:
  - `public.is_admin()` — true for `admin` or `super_admin`
  - `public.current_user_role()` — returns the caller's `profiles.role`
  - `public.current_user_tenant_id()` — returns the caller's `profiles.tenant_id`
  - `public.current_user_has_role(VARIADIC text[])` — membership check against an allowed list
- Example: `USING ( public.current_user_has_role('admin','super_admin','operations_manager') AND tenant_id = public.current_user_tenant_id() )`
- If you need immutable identity claims, `auth.jwt() -> 'app_metadata'` is acceptable (server-only writable) — `user_metadata` is never safe for authorization.

## Roles (priority order)
super_admin > operations_manager > admin > salesman > shop_manager > inventory_manager > operator > apprentice

## Branch
`main` = production (auto-deploys via Vercel, ~$1–2 per push). Feature branches get free preview URLs; `claude/*` branches don't auto-deploy.

## Build & Test
```bash
npm run dev        # Dev server on port 3000
npm run build      # Production build check (must pass with 0 errors)
```

## Documentation Map (reorganized Jun 9, 2026 — keep it this way)
- `README.md` — front door
- `ARCHITECTURE.md` — system design + Mermaid diagrams (update when architecture changes)
- `BACKLOG.md` — **single source of truth for ALL bugs/features/priorities.** New issues go HERE, not into this file or the handoff.
- `CLAUDE_HANDOFF.md` — latest session handoff (ALWAYS update at end of session; prune old entries into `docs/SESSION_LOG.md`)
- `DEPLOYMENT_COST.md` — Vercel cost discipline. **86% of the bill was build minutes — every push to main costs money.**
- `APP_CHANGES.md` — native iOS-only change log
- `docs/DEVELOPMENT_PLAYBOOK.md` — how we build (executive engineer + builders + guardian)
- `docs/TOOLING_EVALUATION.md` — third-party tool verdicts; consult + update BEFORE installing anything
- `docs/SESSION_LOG.md` — historical sprint log (was in this file)
- `docs/plans/` (future work) · `docs/playbooks/` (how-tos) · `docs/reference/` (deep context: CLAUDE_CONTEXT, CLAUDE_SESSION_CONTEXT, FEATURE_CATALOG, SCALING, DEV_TOOLING_RECOMMENDATIONS, **UI_CATALOG** = reusable Tailwind component patterns — check BEFORE building a card/button/modal, add to it AFTER shipping a new reusable pattern) · `docs/archive/` (history — don't update)
- **Do not create new root-level MD files.** Plans → `docs/plans/`, how-tos → `docs/playbooks/`, finished-work reports → `docs/archive/`.

## Engineering Playbooks → now project SKILLS (don't re-derive, invoke)
- **`ios-release`** (.claude/skills/) — full App Store/TestFlight ship procedure incl. manual signing, Transporter automation, 6.9″ screenshot gotchas
- **`prod-deploy`** — the verification gate + cost confirmation + push + deploy-watch sequence
- **`guardian-review`** — the architecture-guardian checklist (run after EVERY builder)
- **`design-taste`** — anti-generic-slop UI instructions (landing/marketing pages — adopted from Leonxlnx/taste-skill)
- **Big agent jobs:** worktree-isolated subagents for parallel work, but **clean up `.claude/worktrees/` after** (hit 81 GB once and filled the disk). `git worktree remove` clean ones; strip `.next`/`node_modules` from any with unsaved changes.

---

## Platform Vision

The end-state is a multi-tenant SaaS called **Pontifex Industries** that hosts multiple concrete-cutting / construction-services companies on a single platform. Tenant #1 is Patriot Concrete Cutting (currently in trial). Each tenant has its own brand, users, jobs, customers — fully isolated by `tenant_id` and RLS.

### Login model (multi-tenant)
- Every tenant has a `company_code` in `public.tenants` (Patriot's is `PATRIOT`).
- Login UI takes **company code + email + password**. The company code disambiguates which tenant the user belongs to + drives the white-label branding (logo, primary color) on the login page itself.
- One email = one tenant for now. (If a single user ever needs to belong to multiple tenants, that's a profiles refactor — punt until needed.)
- White-label fields already in `tenants`: `name`, `slug`, `domain`, `logo_url`, `primary_color`, `plan`, `max_users`, `max_jobs_per_month`, `features` jsonb. `BrandingProvider` reads these client-side.

### Distribution roadmap
1. **Web (live now)** — `pontifexindustries.com` is the primary access point. Trial customer (Patriot) running here.
2. **Mobile apps (planned)** — wrap the existing Next.js app with **Capacitor** (or Tauri for desktop). Same codebase, same APIs, ships to App Store + Google Play. No React Native rewrite. Why Capacitor: zero refactor, native plugins (NFC, geolocation, camera, push) available, fast to ship.
3. **Per-tenant subdomain (longer-term, optional)** — `patriot.pontifexindustries.com` with tenant-aware routing. Useful when multiple tenants are live and we want to brand the URL.

### Non-negotiables
- Every new table has `tenant_id` and tenant-scoped RLS. Use the SECURITY DEFINER helpers (`current_user_tenant_id()`, etc.) — never `auth.jwt() -> 'user_metadata'`.
- Every new feature works for any tenant out of the box — no Patriot-specific branding hardcoded. Use `BrandingProvider` / `tenants.primary_color` / `tenants.logo_url`.
- Mobile-first. Operators are on phones. Tap targets ≥ 44px, no horizontal overflow at 375px. Use the `mobile-responsive-auditor` subagent before merging operator-page changes.

---

## Deployment & Testing Workflow

We have **production live on Vercel + a single Supabase project**. Trial customer using prod. The discipline is to make changes safely without disrupting their data.

> **Cost note:** Vercel charges per build minute, and builds are ~86% of our bill. **Every `git push origin main` triggers a billed build (~60-120s wall-clock + multi-vCPU).** Branches in `claude/*` no longer auto-deploy (configured in `vercel.json`). See [`DEPLOYMENT_COST.md`](DEPLOYMENT_COST.md) for the rules and the actual line-item breakdown of why this matters.

### Three environments (no extra hosting cost)

| Environment | URL | Branch | Supabase | When to use |
|---|---|---|---|---|
| **Production** | `pontifexindustries.com` | `main` (origin) | Production project `klatddoyncxidgqtcjnu` | Customer-facing. Push only after verification. |
| **Vercel preview** | `pontifex-industries-software-awja-git-<branch>-...vercel.app` | Any non-main branch on origin | Same prod project (read/write — careful) | Test UI / client-only changes against real data on a sharable URL. Auto-created by Vercel on every branch push. |
| **Local dev** | `localhost:3000` | Whatever you have checked out | Same prod project via `.env.local` | Active iteration. Hot reload, fast cycle. |

### Rules of the road

1. **Never `git push origin main` until you've verified** — preview URL is green, build passes, you've eyeballed the change. The trial is using `main`.
2. **Code-only changes** (UI, API routes, business logic) — push branch → use the auto-generated Vercel preview URL → verify → THEN merge to main.
3. **Schema changes (migrations)** — these hit the live DB regardless of which branch the code is on. Two options:
   - **Risky migration** (drops a column, alters a heavily-used table, backfills data): create a Supabase Database Branch first via the Supabase MCP `create_branch` tool. Apply + test against the branch DB. When green, apply to production.
   - **Additive migration** (new table, new column with default, new index): apply directly to prod via MCP `apply_migration`. The convention is idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `CREATE POLICY ... EXCEPTION WHEN duplicate_object`) so re-runs are no-ops.
4. **Cron jobs** (`/api/cron/*`) — defined in `vercel.json` and run only against production. Don't expect them to fire on previews. The `CRON_SECRET` env var must be set in Vercel for the route to authorize.

### Quick reference

```bash
# Local dev (touches prod DB unless you swap .env.local)
npm run dev

# Push to branch — Vercel auto-creates a preview URL
git push origin <branch>

# Find the preview URL after pushing
gh pr view --json url   # if a PR is open
# or check Vercel dashboard

# Promote to prod (only after preview is verified)
git checkout main && git merge <branch> && git push origin main
```

### When you want a fully-isolated staging URL

Optional — not set up by default. To add later:
1. Create a `staging` branch in git.
2. In the Vercel dashboard, alias the staging branch's deployment to `staging.pontifexindustries.com`.
3. Optionally configure separate "Preview" env vars in Vercel that point at a second Supabase project (creating one is free on hobby tier — but data sync becomes a chore).

For now, the auto-preview URL per branch is enough.

---


## Backlog & history
- Current work: **`BACKLOG.md`** (P0→P3). Pick from the top unless the founder reprioritizes.
- Completed-session history: `docs/SESSION_LOG.md` + `CLAUDE_HANDOFF.md`.
