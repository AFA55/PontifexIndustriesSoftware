# Enterprise-Grade Assessment & Hardening Roadmap — Jul 5, 2026

> Live-data assessment: Supabase security advisor run Jul 5 (106 findings, **0 ERROR-level** —
> every past critical is cleared), plus the codebase's standing security architecture.
> Scorecard = where we already meet the enterprise bar / what's left, ranked by real risk.

## Scorecard by pillar

### 1. Identity & access — STRONG core, 2 gaps
✅ RLS on every table, tenant_id everywhere; SECURITY DEFINER helpers off profiles (never
user_metadata — linter-clean); server-side role checks on every mutating route; bearer-token
auth; invitation tokens CSPRNG/single-use/expiring; self-serve signup can't touch protected
tenants; per-user-scoped branding/features (Jul 5 fix).
⬜ GAP (founder, 1 click): **enable leaked-password protection** (Supabase Auth settings —
advisor WARN). ⬜ GAP (later, enterprise-sales gate): **MFA + SSO/SAML** — first serious
enterprise buyer will ask; Supabase supports TOTP MFA natively (moderate build).

### 2. Data security & tenant isolation — STRONG
✅ Isolation adversarially re-verified on every new module (5 guardian reviews on hiring alone);
private buckets + signed URLs (timecards, resumes, docs); cost-basis (margin) unreadable by
tenants at the DB layer; `close_account()` hard-delete path exists; Supabase Pro = encrypted at
rest + PITR backups.
⬜ GAP: **restore drill never performed** — backups you haven't restored are hopes, not backups.
One session: restore PITR to a branch DB, verify row counts. ⬜ GAP: data-retention policy doc
(what we keep, how long, deletion SLA) — needed for enterprise procurement questionnaires.

### 3. Application security / SDLC — GOOD, automate next
✅ Guardian adversarial reviews on money/auth code (caught double-charge race, margin leak,
enumeration oracle pre-ship); journey test loops (docs/playbooks/TEST_LOOPS.md); CI green;
pre-commit tsc; secrets server-side only (env vars, founder pastes values).
⬜ GAPS: **npm audit: 59 vulns to triage** (1 critical/11 high — likely mostly transitive/dev;
needs a careful pass, NO blind --force); enable **GitHub Dependabot** (free, automatic);
secrets rotation schedule (Supabase service key, Stripe, Resend — rotate on a calendar +
after any contractor access); rate limits currently in-memory per-instance (fine at this
scale; move to Upstash/Postgres when hiring signup traffic is real).

### 4. Reliability & disaster recovery — the thinnest pillar
✅ Vercel serverless (multi-AZ by default) + Supabase Pro PITR; deploy-watch discipline;
rollback = redeploy previous build (isRollbackCandidate).
⬜ GAPS: **no uptime monitoring/alerting** — we'd learn prod is down from Patriot. Fix cheap:
UptimeRobot/BetterStack free tier pinging / + /api/health (add a trivial health route), alerts
to your phone. **Sentry DSN still unset** (code fully wired — founder pastes 1 env var).
DR runbook: one page — who does what when Vercel/Supabase is down, incl. Supabase status page
links + restore steps. RTO/RPO targets: PITR gives RPO ≈ 2 min; document RTO target (e.g. 4h).

### 5. Observability — wired, not lit
✅ error_logs + ai_usage + hiring_events audit trails; platform health-alert crons + owner
dashboard; fire-and-forget logging convention.
⬜ GAPS: Sentry DSN (above); per-tenant usage metrics rollup (monthly active users, jobs
created — needed for billing disputes + health scores); define 2-3 SLOs (login p95, API error
rate) once monitoring exists.

### 6. Money movement — ENTERPRISE-PATTERN ALREADY
✅ CAS balance claims, per-attempt idempotency keys, awaited audit events before money moves,
unknown-outcome = hold-and-reconcile (never blind retry), margin invisible to customers,
threshold billing with crons. This code was adversarially reviewed twice. Keep the rule:
**any change to lib/hiring/settle.ts or charge paths gets a guardian review, forever.**

### 7. Compliance & trust (the enterprise sales unlock)
⬜ SOC 2: not started — and correctly so (premature at this stage; costs $20-60k/yr + process
overhead). TRIGGER: first enterprise prospect that requires it → start with Type I via
Vanta/Drata (evidence automation, ~3 months). TODAY'S cheap wins: a /security page on the
marketing site (practices, encryption, backups, isolation — sales collateral), a one-page
security-practices PDF for procurement, privacy policy already live ✅, DPA template when a
customer asks.

## Advisor burn-down (106 findings, all WARN/INFO)
- ✅ DONE Jul 5: 16× function_search_path_mutable — pinned (migration 20260705).
- ⬜ 36× SECURITY DEFINER functions executable by anon/authenticated: needs a per-function
  call-site audit (some ARE legitimately client-called via rpc; blanket REVOKE would break
  them). One careful session: list → grep call sites → REVOKE the unused ones. HIGH VALUE.
- ⬜ 12× rls_policy_always_true: mostly INTENTIONAL public inserts (demo_requests,
  access_requests, error_logs, consent_records...). Audit each: add WITH CHECK constraints
  where possible (e.g. rate-limit-friendly shapes), document the intentional ones inline.
- ⬜ 1× extension_in_public (pg_trgm): move to extensions schema — low risk but touches
  indexes; do in a quiet window.
- ⬜ 1× leaked-password protection OFF: founder toggle (Supabase → Auth → Passwords).
- INFO 4× rls_enabled_no_policy (hiring_billing, hiring_spend_ledger, +2): **BY DESIGN** —
  service-role-only money tables; the absence of client policies IS the security. Documented here.

## Priority order
1. FOUNDER 15-MIN BATCH: Supabase URL config (still pending from Jul 4!) · leaked-password
   toggle · SENTRY_DSN env · Stripe publishable key · sign up UptimeRobot → /api/health.
2. CLAUDE next hardening session: /api/health route · SECURITY DEFINER execute audit ·
   npm-audit triage · Dependabot config · DR runbook page.
3. WHEN ENTERPRISE DEAL APPEARS: MFA → SOC 2 Type I (Vanta/Drata) → SSO/SAML → status page.
