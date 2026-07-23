# Security Audit — Pontifex Platform

**Date:** July 23, 2026
**Method:** Adversarial penetration audit across four attack surfaces, run as four independent expert passes: (1) authentication & authorization, (2) database RLS / tenant isolation, (3) injection / input / uploads / SSRF, (4) secrets / rate-limiting / tokens / info-disclosure. Each surface reported ranked findings with file:line and a concrete exploit.
**Context that shapes severity:** production is **single-tenant today** (Patriot + the Pontifex parent). Cross-tenant findings are therefore **latent** — near-zero blast radius now, but they become live data leakage the moment a second tenant onboards. The app does server-side DB work via the service-role client (bypasses RLS), so **an explicit `.eq('tenant_id', …)` in each handler is the real isolation boundary** — RLS is defense-in-depth, not the primary gate.

---

## What's already strong (verified, no action)
- No hardcoded secrets in the repo; `.env*` gitignored (only `.env.example` committed).
- Service-role key + all vendor keys (Resend/Twilio/Telnyx/Stripe/Anthropic/ElevenLabs/Google) are server-only — none reach a client bundle.
- Invite / portal / signature / contract tokens are **256-bit CSPRNG**, single-use, expiring; setup token rotates on use.
- `forgot-password` is enumeration-safe (constant generic response).
- All `/api/cron/*` fail-closed on `CRON_SECRET`.
- Privilege escalation is well-gated: `grant-super-admin` / `create-super-admin` are `requireSuperAdmin`; role/tenant come from server state or the invite, never the request body; `setup-account/complete` has a real cross-tenant-takeover guard.
- RLS enabled on every `public` table; **no policy references `user_metadata`**; SECURITY DEFINER helpers read from `public.profiles`, owned by a BYPASSRLS role, `search_path` pinned.
- AI agents (Artifex write-tools, ticket-analysis, takeoffs-analyze, scan-ticket) are correctly caller-scoped or read/suggest-only — model-processed text has no path to a privilege-escalating or cross-tenant write.
- No raw SQL / string-built `.rpc()`; XSS sinks (`dangerouslySetInnerHTML` ×4) are all static/escaped; outbound fetches use fixed hosts with encoded params.

---

## FIXED this session (commit — Jul 23)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| H1 | **HIGH — exploitable today** | `/api/send-email` + `/api/send-sms` gated on `requireAuth` only → any logged-in user (operator/apprentice) could send arbitrary HTML email / SMS from the verified `admin.pontifexindustries.com` + company Telnyx identity (phishing/smishing with real SPF/DKIM). Both audits flagged this #1. | Raised both to `requireAdmin`. `send-email` had zero callers; `send-sms` only the admin schedule board. |
| H2 | HIGH (latent, cross-tenant) | IDOR: `admin/timecards/[id]/pdf`, `admin/facilities/[id]/badges`, `admin/facilities/[id]/badged-operators`, `admin/jobs/[id]/helper-logs` fetched by id with **no tenant filter** — an admin could pull another tenant's employee timecard PDF / badges / helper logs by id. | Added tenant-ownership gate (`.eq('tenant_id', auth.tenantId)` on the record or its parent; super_admin unrestricted). |
| M1 | MEDIUM (latent) | job-orders `[id]` admin branch skipped tenant scope: `photos` (append), `survey` (read/overwrite), `documents/[docId]` (delete) reachable cross-tenant by an admin. | Admin branch now also requires `job.tenant_id === auth.tenantId`. |
| M2 | MEDIUM | `admin/create-user` inserted profiles with **no `tenant_id`** → new accounts unscoped (broken login + weak tenant binding). | Pin `tenant_id = auth.tenantId` on insert. |
| M3 | MEDIUM | `operator-ratings/update`: tenant check wrapped in `if (tenantId)` → skipped when null, letting a tenant-less caller rate any operator in any tenant. | Tenant match now unconditional; tenant-less caller rejected 403. |
| Inj-M1/M2/M3 | MEDIUM | PostgREST filter injection: `search_customers` (Artifex), `admin/equipment` search, `ticket-analysis` keyword search interpolated user/model text into `.or()` without stripping `,()` → a stray comma/paren rewrites the filter group (dump full tenant list / 500). Bounded within-tenant (the `.eq('tenant_id')` AND can't be escaped). | Strip `[%,()]` before building the `.or()` string, matching the sibling tools that already did. |
| Inj-M4 | MEDIUM | `inventory` create spread the whole request body into the insert (`{...inventoryData}`) → client could set `id`/`created_by`/`total_value`/any column (mass assignment). | Allowlist writable columns; `tenant_id` + `created_by` server-derived. |
| Exp-M3 | MEDIUM | `/api/auth/login` returned Supabase's raw auth message ("Email not confirmed", "User is banned") → account-state enumeration. | Collapse all auth failures to one generic 401; real reason logged only. |
| Exp-M4 | MEDIUM (defense-in-depth) | Token-guessing paths (`setup-account/validate`, `public/portal|signature|contract`) not in the rate limiter. Tokens are 256-bit so guessing is infeasible, but no throttle. | Added the four paths to `RATE_LIMITED_PATHS`. |
| Exp-L3 | LOW | `send-email` PDF-fetch followed 3xx → an allowlisted host redirecting to an internal address could bypass the SSRF allowlist. | `fetch(pdfUrl, { redirect: 'manual' })`. |
| — | (bonus) | Raw DB error text echoed in a few of the routes touched above (helper-logs). | Genericized those responses. |

Also fixed alongside (not strictly security): the Platform-Hub "add user to tenant" flow was sending Supabase's native invite email (homepage link) — rewired to our branded `/setup-account` email (`lib/invitations.ts` `sendSetupInviteForExistingAuthUser`).

---

## FLAGGED — needs a founder decision (NOT rushed; a careless fix breaks live features)

### F1 — Public storage buckets hold customer/PII documents (RLS audit C1)
`contracts`, `certification-documents`, `completion-pdfs`, `job-photos`, `jobsite-area-docs`, `scope-photos`, `site-compliance-docs` are `public=true` — anyone with (or guessing) the URL fetches the file, no auth, RLS bypassed.
**Why not auto-fixed:** these URLs are **emailed to customers** (contracts, completion PDFs, signature pages) who have **no login** — flipping the buckets to private breaks customer document delivery. Paths are `tenant_id/record_id/type-timestamp.pdf` (UUIDs, hard to enumerate but not secret).
**The real fix (a small project):** switch customer-facing delivery to **short-lived signed URLs** (`createSignedUrl`), then flip the buckets private + add tenant-scoped `storage.objects` policies. Prioritize `contracts` + `certification-documents` (worker PII). **Decision needed:** greenlight the signed-URL migration (est. ~1 session).

### F2 — Rate limiter is per-instance, weak under Vercel scaling (Exposure H1)
`middleware.ts` uses an in-memory `Map` — every serverless instance has its own, so the real login limit is far above the intended 10/min. Credential-stuffing on `/api/auth/login` is the exposure.
**Why not auto-fixed:** a real fix needs a **shared store** — Upstash Redis / Vercel KV (new vendor + env vars you'd paste) or Vercel WAF rate rules (dashboard).
**Decision needed:** pick the backing store; I wire it.

### F3 — ~25 admin RLS policies lack a tenant predicate (RLS audit H1)
Tables like `profiles`, the `pay_*` set, `invoice_line_items`, `user_card_permissions`, `customers`, `inventory`, … have admin/`is_admin()` policies with no `tenant_id` clause. Latent (single-tenant today); the API-layer tenant filters we hardened above are the active guard. This is the **must-close-before-tenant-#2** item — a defense-in-depth migration AND-ing `tenant_id = current_user_tenant_id()` into each admin policy.
**Decision needed:** schedule before onboarding a second company (not urgent while Patriot is the only tenant).

---

## BACKLOG (lower priority, tracked)
- **Exp-M2:** ~37 routes echo raw DB error text in 500s (recon aid) → genericize + Sentry-only detail. Mechanical sweep.
- **Authz-L1:** the fragile `if (tenantId) q.eq('tenant_id', tenantId)` pattern in ~40 routes — standardize on the shared guards + unconditional `.eq`. Root cause of the IDOR class.
- **Exp-L5:** `NEXT_PUBLIC_LOCATION_BYPASS_CODE` ships in the client bundle (geofence bypass) → move server-side. Integrity nuisance, not a breach.
- **Exp-L6:** CSP `script-src 'unsafe-inline'` → nonce-based CSP; add HSTS `preload`.
- **M1/M2 (RLS):** rate-limit + minimal `WITH CHECK` on anon-facing insert tables (`access_requests`, `demo_requests`, …); `lookup_tenant_by_code` company-code enumeration.
- **operator-ratings:** add a role gate + one-rating-per-rater/subject dedup (product-integrity; needs the intended-rater list confirmed).
- Storage MIME is client-declared on signed uploads (label-only) — low, files are tenant-private + sandboxed.

---

## How penetration testing works (for reference)
A pentest probes each surface an attacker would: **authentication** (can I get in / forge identity?), **authorization** (can I act above my role or reach another tenant's data — privilege escalation & IDOR?), **injection** (can I smuggle control through an input — SQL/PostgREST/XSS/SSRF/prompt?), and **exposure** (are secrets, tokens, or error details leaking; can I brute-force?). For each finding you write the *concrete request that exploits it*, rank by real-world impact, then patch highest-severity-first and re-verify. This audit did exactly that across the four surfaces; the fixes above are the highest-severity, safe-to-ship subset, with the three that risk breaking live features escalated to a decision instead of a rushed patch.
