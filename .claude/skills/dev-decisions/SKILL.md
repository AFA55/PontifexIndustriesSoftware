---
name: dev-decisions
description: First-principles decision framework for the Pontifex platform. CONSULT THIS before any significant technical or product decision — architecture, schema/migrations, security, API shape, a build/deploy, a vendor/account path, or any "which option do we pick" question. Encodes how a senior full-stack engineer decides, grounded in facts not guesses. (v2 — §11 carries primary-source-verified facts from a 113-agent deep-research pass on Next.js 15/Supabase/Capacitor/Vercel.)
---

# How I make software decisions (Pontifex)

> Read this BEFORE deciding. The job is the *most correct, truthful* answer for the founder — who is non-technical and trusts the analysis. Optimize for: truth > speed of reply, reversibility, and the founder's real goal (ship a reliable product without surprise cost or rework).

## 0. THE DECISION PROCEDURE (run this every time)
1. **State the real goal**, not the literal ask. ("Publish to Play fast" = a public listing ASAP, not "convert this account.")
2. **Gather facts before acting.** Read the actual code/schema/DB/console state. Never assert from memory when it's verifiable in seconds (DB columns, which table a feature reads, redirect behavior, account type). Most of this session's misses were asserting before verifying.
3. **Enumerate ALL viable options — not the first one.** For each: the real **timeline**, **cost**, **what's reversible vs permanent**, and the **hidden constraint** (e.g. "package names are permanent + per-account"). Put them in a table.
4. **Identify the irreversible parts.** Permanent choices (package name, account type, dropping data, public posts, money) get extra scrutiny + founder confirmation.
5. **Pick the cheapest reversible experiment** that proves the path before committing big. Prefer a 2-min check or a preview over a 2-week bet.
6. **Communicate options honestly** to the founder — including the one that's slower-but-safer and the tradeoffs — then recommend one. Don't anchor on a single route and hide the alternatives.
7. **Verify end-to-end after acting** (see §9). "It builds" ≠ "it works."

## 1. FIRST PRINCIPLES (non-negotiable)
- **The read path must match the write path.** If you write to table/column/shape X, the reader must read X. (Bugs this session: correction notifications written to `schedule_notifications` but the bell reads `notifications`; schedule edit summary omitted the fields the form saved.) Always trace both ends.
- **Truth over reassurance.** If something is broken, pending, or uncertain, say so plainly with the evidence. Never report fake success.
- **Reversible by default.** Favor additive, idempotent, gated changes. Make rollback obvious.
- **Tenant isolation is sacred.** Every query/policy is scoped by `tenant_id`. Never trust client-writable identity (`auth.jwt() -> user_metadata`) for authz — use SECURITY DEFINER helpers off `public.profiles`.
- **Cost is a constraint.** Every push to `main` is a billed Vercel build. Batch; verify before pushing; confirm spend.
- **One bundle, three surfaces.** The same web build serves browser + iOS + Android (Capacitor remote-URL). A code path must be correct in all three; gate native-only behavior behind `isNativeApp()`.

## 2. DATA & SCHEMA
- Model the data first; UI follows. One source of truth per fact — avoid duplicate columns that drift.
- JSONB for flexible/sparse sub-objects; real columns for anything you filter/join/sort on.
- Confirm columns exist (query `information_schema`) before adding to a SELECT — a bad column 42703s the whole query.
- Name read fields to match what writers/readers expect; if they differ, map explicitly and document it.

## 3. MIGRATIONS
- Additive + idempotent (`IF NOT EXISTS`, `EXCEPTION WHEN duplicate_object`). Re-runnable = safe.
- Additive (new table/column/index) → apply directly via Supabase MCP. Risky (drop/alter heavy table/backfill) → branch DB first.
- New tables: `tenant_id` + RLS via SECURITY DEFINER helpers + `updated_at` trigger + sensible indexes.

## 4. SECURITY / AUTHZ
- authn (who) ≠ authz (what they may do). Gate every mutating endpoint with `requireAuth/requireAdmin` + a rank/role check from server state, never from the request body.
- Block self-action where it's an integrity risk (self-approval, removing a peer/superior).
- Secrets never in client code, logs, or URLs. The founder pastes secret values; I never type them.

## 5. API / CONTRACTS
- Stable request/response shapes. Validate inputs; return real error statuses.
- Fire-and-forget is ONLY for logging/notifications — never for the user's actual action.
- When you change a write, find every reader (and vice versa). Adding a field to one side without the other is the classic break.

## 6. FRONTEND
- All React hooks before any conditional return (no hook-order bugs). Guard redirects inside `useEffect`, not as early returns above hooks.
- Mobile-first: tap targets ≥44px, inputs ≥16px (iOS zoom), no overflow at 375px, legible text ≥12–14px. Operators are on phones in the field.
- Dates: use `lib/dates.ts`. Never `new Date('YYYY-MM-DD')` (UTC parse → off-by-one) or `toISOString().split` for a local date.

## 7. MOBILE / CAPACITOR
- Native app must navigate IN the webview (SPA router), not a full `window.location` that can hop hosts → Safari kick-out. Web keeps full-nav for the save-password prompt. Gate by `isNativeApp()`.
- Web/UI/API changes reach the app via Vercel (remote webview) — NO store build. ONLY native changes (plugins, Info.plist, config, version, icons) need a build + store submission.
- Time math that compares to a wall-clock schedule must use the **tenant's timezone** — the server runs UTC on Vercel.

## 8. DEPLOY / COST
- Gate before push: `npm run build` (tsc + build) clean; guardian/reviewer behind every builder; BLOCKING findings fixed + re-verified.
- Batch commits; one push per session; confirm the spend. Watch the deploy to READY.

## 9. VERIFICATION (prove it works)
- Trace the actual data path end-to-end, as the user experiences it — don't trust the build.
- Behind every builder: a guardian/adversarial reviewer + (for anything subtle) a functional trace agent. They disagree sometimes → verify the falsifiable claim against the DB/code, don't pick a side.
- Payroll/billing/auth changes get the highest scrutiny.

## 10. HONEST-OPTIONS RULE (the Play Store lesson)
When the founder asks "what's the fastest/best way," NEVER answer with a single route. Give a table of every viable route with real timeline + cost + reversibility + the hidden permanent constraint, flag the irreversible ones, then recommend. The founder is non-technical and is trusting the *completeness* of the analysis, not just the recommendation.

## 11. VERIFIED FACTS — primary sources (deep-research Jun 19 2026; 10 facts, each 3-0 adversarially verified)
**Security / RLS**
- authz data NEVER in `user_metadata` — it's user-writable via `supabase.auth.update()` (Supabase linter `0015` = ERROR). Use `app_metadata` (server-only) or SECURITY DEFINER helpers off `public.profiles`.
- RLS enabled on EVERY Data-API-exposed table/view; with RLS on, no rows are readable via anon/publishable key until a policy exists. Roles: `anon` + `authenticated` are RLS-filtered; `service_role` has BYPASSRLS → backend only, never shipped to client.
- RLS perf: write `(select auth.uid())` (caches per-statement, not per-row); push join/tenant/role lookups into a SECURITY DEFINER function (private schema, owner has BYPASSRLS). Benchmarked 95–99.99% — but magnitude is schema-dependent (others saw 15–61%); the mechanism is what matters.
**Frontend (App Router, Next 15 + React 19)**
- Components are **Server Components by default**. `'use client'` is a *boundary*: that file + everything it imports/renders ships to the client; don't repeat it on descendants. (Refuted framing: there is NO rigid "Server MUST do X / Client MUST do Y" list — it's default-server, opt-into-client.)
- You **cannot import a Server Component into a Client Component** — pass it as a prop/`children` (it renders on the server, passed in as output).
- Next 15 BREAKING (re-verify on any upgrade): (1) fetch / GET route handlers / client router nav are **no longer cached by default** — opt in explicitly; (2) `cookies/headers/draftMode/params/searchParams` are **async** — `await` them.
- Hydration errors = server render ≠ client first render (window/localStorage/Date used in render). Fix: gate client-only behind `useEffect` (isClient flag), or `dynamic(… ssr:false)`.
- Server-only secrets: env vars without `NEXT_PUBLIC_` are blanked on the client; import the `server-only` package so a leak into a client bundle fails the build.
**Mobile / Capacitor (this remote-webview app)**
- Tokens/keys live ONLY in memory or native **Keychain/Keystore** — Capacitor Preferences/localStorage is NOT secure storage. (Confirms the biometric plan: store the Supabase *refresh token*, Keychain/biometric-gated.)
- No secrets in the client bundle (it's inspectable) — secret-key ops are server-side.
- Deep-link routing is NOT automatic — handle the App API `appUrlOpen` event and parse the URL to navigate.
- OAuth2: PKCE mandatory; prefer Universal/App Links over custom URL schemes (interception risk).

*Sources: supabase.com/docs (row-level-security, securing-your-api, roles, rls-performance); nextjs.org/docs (server/client components, caching, async request APIs, hydration, server-only); capacitorjs.com; OWASP MASVS; IETF RFC 8252.*

---
*Anti-patterns seen this session (learn from them): asserting before verifying; read/write path mismatch; a single-route answer to a "fastest path" question; a full-nav login that externalized to Safari; a UTC-vs-tenant-tz time comparison. Each maps to a principle above.*
