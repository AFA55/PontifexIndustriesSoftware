# Production Deployment Checklist

**Target:** Patriot Concrete Cutting (white-label of Pontifex Industries platform)
**Stack:** Next.js 15.5.12 + React 19 + Supabase (`klatddoyncxidgqtcjnu`) + Vercel (region `iad1`)
**Vercel project ID:** `prj_vubQAdrHfAlSq9msk0sfedlBq5zJ` (org `team_9PEEftgbKgEZCHzklblcjKKa`)
**Auto-deploy:** `main` branch → Vercel production
**Last verified:** 2026-04-27 from branch `worktree-agent-a4f93b78eec95f017`

> Read this top-to-bottom in order. Every gate in section 1 must be green before flipping DNS.

---

## Pre-deploy gates (must-pass before launch)

- [ ] `npm run build` exits 0 — last passing commit recorded in [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md)
- [ ] Node version on Vercel matches local — `package.json` has no `engines` field, so Vercel will pick its current default (Node 20.x as of 2026). Confirm in Vercel project → Settings → General → Node.js Version.
- [ ] All env vars in the table below are set in Vercel **Production** environment (and **Preview** if previews are gated to staff)
- [ ] Both pending migrations applied to `klatddoyncxidgqtcjnu`:
  - [`supabase/migrations/20260427_utility_waiver_fields.sql`](supabase/migrations/20260427_utility_waiver_fields.sql)
  - [`supabase/migrations/20260427_operator_badges.sql`](supabase/migrations/20260427_operator_badges.sql)
- [ ] Supabase Auth → URL Configuration: `Site URL` set to the new custom domain (not the `*.vercel.app` URL); `Redirect URLs` includes `https://<domain>/login`, `https://<domain>/setup-account`, `https://<domain>/sign/*`
- [ ] Supabase Storage public bucket (`branding`, etc.) hostname matches `next.config.js` `images.remotePatterns` — `klatddoyncxidgqtcjnu.supabase.co` is already whitelisted at [next.config.js:7-9](next.config.js:7)
- [ ] Stripe live mode keys swapped in (test keys today — see Env table). Webhook endpoint registered for `https://<domain>/api/webhooks/stripe` and `STRIPE_WEBHOOK_SECRET` updated.
- [ ] Resend domain (`patriotconcretecutting.com` or chosen) DNS verified; `RESEND_FROM_EMAIL` matches a verified sender.
- [ ] Cron secret rotated — `CRON_SECRET` is a fresh random value, configured in Vercel **and** the daily cron at [vercel.json:13-15](vercel.json:13) auto-uses it.
- [ ] White-label rebrand items in section 5 below resolved or explicitly deferred.
- [ ] Smoke test plan rehearsed against a Vercel Preview build (see section 8).

---

## Environment variables (full list, source of truth)

Enumerated by `grep -rEoh 'process\.env\.[A-Z_][A-Z0-9_]+' app/ lib/ middleware.ts | sort -u` — every reference cross-checked.

| Var | Required | Where used (file:line) | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | YES | [lib/supabase.ts:4](lib/supabase.ts:4), [lib/supabase-admin.ts:36](lib/supabase-admin.ts:36), [app/api/auth/login/route.ts:14](app/api/auth/login/route.ts:14), [app/api/demo-request/route.ts:52](app/api/demo-request/route.ts:52) | `https://klatddoyncxidgqtcjnu.supabase.co`. Falls back to `https://placeholder.supabase.co` if missing — site will silently break. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | YES | [lib/supabase.ts:5](lib/supabase.ts:5), [app/api/auth/login/route.ts:15](app/api/auth/login/route.ts:15) | Public anon JWT. Same fallback hazard as above. |
| `SUPABASE_SERVICE_ROLE_KEY` | YES | [lib/supabase-admin.ts:37](lib/supabase-admin.ts:37), [app/api/demo-request/route.ts:53](app/api/demo-request/route.ts:53) | Server-only. Bypasses RLS — never expose to client. |
| `NEXT_PUBLIC_SITE_URL` | YES | [app/api/service-completion-agreement/save/route.ts:295](app/api/service-completion-agreement/save/route.ts:295), [app/api/service-completion-agreement/save/route.ts:322](app/api/service-completion-agreement/save/route.ts:322) | Used by completion agreement to call its own `/api/send-email`. Must be `https://<custom domain>` in prod, otherwise emails won't send. |
| `NEXT_PUBLIC_APP_URL` | YES | [lib/email.ts:57](lib/email.ts:57), [app/api/admin/jobs/[id]/send-signature-request/route.ts:82](app/api/admin/jobs/[id]/send-signature-request/route.ts:82), [app/api/admin/notifications/send/route.ts:71](app/api/admin/notifications/send/route.ts:71), [app/api/admin/notifications/send-reminder/route.ts:69](app/api/admin/notifications/send-reminder/route.ts:69), [app/api/admin/send-schedule/route.ts:233](app/api/admin/send-schedule/route.ts:233), [app/api/admin/schedule-board/dispatch/route.ts:210](app/api/admin/schedule-board/dispatch/route.ts:210), [app/api/create-offer-checkout/route.ts:18](app/api/create-offer-checkout/route.ts:18) | Customer-facing links inside emails. If unset, falls back to `http://localhost:3000` — emails will be unclickable in prod. |
| `NEXT_PUBLIC_APP_VERSION` | optional | [app/api/health/route.ts:63](app/api/health/route.ts:63), [app/api/cron/health-check/route.ts:113](app/api/cron/health-check/route.ts:113) | Defaults to `0.1.0`. Set to match `package.json` `version` for monitoring. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | YES | [lib/drive-time-calculator.ts:117](lib/drive-time-calculator.ts:117), [app/api/google-maps/distance/route.ts:31](app/api/google-maps/distance/route.ts:31) | Browser key — restrict by HTTP referrer to `https://<domain>/*` in Google Cloud Console. |
| `GOOGLE_MAPS_API_KEY` | YES | [app/api/maps/distance/route.ts:28](app/api/maps/distance/route.ts:28) | Server-side key — restrict by IP or unrestricted but rate-limited. **Distinct from the public key.** |
| `RESEND_API_KEY` | YES | [lib/email.ts](lib/email.ts), [app/api/admin/invoices/[id]/send/route.ts:248](app/api/admin/invoices/[id]/send/route.ts:248), [app/api/admin/invoices/[id]/remind/route.ts:172](app/api/admin/invoices/[id]/remind/route.ts:172), [app/api/admin/invoices/[id]/payment/route.ts:135](app/api/admin/invoices/[id]/payment/route.ts:135), [app/api/silica-plan/submit/route.ts:61](app/api/silica-plan/submit/route.ts:61), [app/api/liability-release/pdf/route.ts:141](app/api/liability-release/pdf/route.ts:141) | Required for invoices, signature requests, silica plans, demo accounts. |
| `RESEND_FROM_EMAIL` | YES | [app/api/admin/invoices/[id]/send/route.ts:249](app/api/admin/invoices/[id]/send/route.ts:249), [app/api/admin/invoices/[id]/remind/route.ts:69](app/api/admin/invoices/[id]/remind/route.ts:69), [app/api/admin/invoices/[id]/payment/route.ts:132](app/api/admin/invoices/[id]/payment/route.ts:132), [app/api/silica-plan/submit/route.ts:59](app/api/silica-plan/submit/route.ts:59) | Defaults to `Patriot Concrete Cutting <noreply@resend.dev>` — fine for dev, **must** be a verified domain sender in prod (e.g. `noreply@patriotconcretecutting.com`). |
| `STRIPE_SECRET_KEY` | YES (if billing live) | [lib/stripe.ts:9](lib/stripe.ts:9), [app/api/create-offer-checkout/route.ts:12](app/api/create-offer-checkout/route.ts:12), [app/api/create-offer-checkout/route.ts:24](app/api/create-offer-checkout/route.ts:24) | Falls back to `sk_placeholder` — checkout silently fails. Switch to `sk_live_*` for prod. |
| `STRIPE_WEBHOOK_SECRET` | YES (if billing live) | [app/api/webhooks/stripe/route.ts:42](app/api/webhooks/stripe/route.ts:42) | Re-issued every time you create/move a webhook endpoint. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | YES (if billing live) | [lib/stripe-client.ts:3](lib/stripe-client.ts:3) | `pk_live_*`. |
| `STRIPE_STARTER_PRICE_ID` | YES (if billing live) | [lib/billing-plans.ts:18](lib/billing-plans.ts:18) | Stripe Price ID for Starter tier. |
| `STRIPE_PROFESSIONAL_PRICE_ID` | YES (if billing live) | [lib/billing-plans.ts:38](lib/billing-plans.ts:38) | Stripe Price ID for Professional tier. |
| `STRIPE_ENTERPRISE_PRICE_ID` | YES (if billing live) | [lib/billing-plans.ts:58](lib/billing-plans.ts:58) | Stripe Price ID for Enterprise tier. |
| `CRON_SECRET` | YES | [app/api/cron/health-check/route.ts:21](app/api/cron/health-check/route.ts:21) | Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Cron schedule at [vercel.json:13-15](vercel.json:13). |
| `TELNYX_API_KEY` | optional | [app/api/send-sms/route.ts:31](app/api/send-sms/route.ts:31), [app/api/job-orders/[id]/send-completion-sms/route.ts:44](app/api/job-orders/[id]/send-completion-sms/route.ts:44) | Preferred SMS provider. If unset, code falls through to Twilio. |
| `TELNYX_PHONE_NUMBER` | optional | [app/api/send-sms/route.ts:32](app/api/send-sms/route.ts:32), [app/api/job-orders/[id]/send-completion-sms/route.ts:45](app/api/job-orders/[id]/send-completion-sms/route.ts:45) | E.164 format. |
| `TWILIO_ACCOUNT_SID` | optional | [lib/sms.ts:7](lib/sms.ts:7), [app/api/job-orders/[id]/send-completion-sms/route.ts:68](app/api/job-orders/[id]/send-completion-sms/route.ts:68) | Legacy fallback if Telnyx not configured. |
| `TWILIO_AUTH_TOKEN` | optional | [lib/sms.ts:8](lib/sms.ts:8), [app/api/job-orders/[id]/send-completion-sms/route.ts:69](app/api/job-orders/[id]/send-completion-sms/route.ts:69) | Pair with SID. |
| `TWILIO_PHONE_NUMBER` | optional | [lib/sms.ts:9](lib/sms.ts:9), [app/api/job-orders/[id]/send-completion-sms/route.ts:70](app/api/job-orders/[id]/send-completion-sms/route.ts:70) | E.164. |
| `NEXT_PUBLIC_LOCATION_BYPASS_CODE` | optional | [lib/geolocation.ts](lib/geolocation.ts), [components/NfcClockInModal.tsx](components/NfcClockInModal.tsx) | **MUST be unset in production.** When set, exposes a "Testing bypass" button on the clock-in modal; operator must enter this exact code to skip GPS (sessionStorage-scoped). Without the env var, the bypass UI is hidden and impossible to activate. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | optional | [components/landing/brand-config.ts:11](components/landing/brand-config.ts:11) | Defaults to `info@pontifexplatform.com`. **Set to a Patriot-branded email for white-label.** Not in `.env.example` — undocumented. |
| `VERCEL_DEPLOYMENT_ID` | auto | [app/api/health/route.ts:65](app/api/health/route.ts:65), [app/api/cron/health-check/route.ts:100](app/api/cron/health-check/route.ts:100) | Auto-injected by Vercel. Don't set manually. |
| `NODE_ENV` | auto | [app/api/health/route.ts:64](app/api/health/route.ts:64), [app/api/create-offer-checkout/route.ts:18](app/api/create-offer-checkout/route.ts:18) | Auto-set by Next/Vercel. |
| `BASE_URL`, `SMOKE_USER_*` | dev only | [scripts/smoke-test-api.ts:48](scripts/smoke-test-api.ts:48) | Local smoke-test script; do **not** set in Vercel. |

**Undocumented vs. `.env.example`** — these are used in code but not listed in `.env.example`:

- `NEXT_PUBLIC_CONTACT_EMAIL` (white-label-critical)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_PROFESSIONAL_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID` (billing — referenced in handoff but missing from `.env.example`)
- `CRON_SECRET` (referenced in handoff but missing from `.env.example`)
- `GOOGLE_MAPS_API_KEY` is in `.env.example` but most code uses the `NEXT_PUBLIC_` variant — both must be set.

**Action:** before launch, update [.env.example](.env.example) so a future deploy isn't missing a key.

---

## Custom domain + SSL (Vercel steps)

> Currently on the Vercel default URL `pontifex-industries-software-z8py.vercel.app` (hardcoded in [app/api/send-email/route.ts:17](app/api/send-email/route.ts:17) — see section 5).

1. **Pick the production hostname.** `.env.example` assumes `app.patriotconcretecutting.com`. Confirm with stakeholder. TBD — needs human input: **final apex/subdomain**.
2. Vercel dashboard → Project `prj_vubQAdrHfAlSq9msk0sfedlBq5zJ` → **Settings → Domains → Add**.
3. Vercel will show DNS records (one of):
   - **Apex** (`patriotconcretecutting.com`): `A 76.76.21.21`
   - **Subdomain** (`app.patriotconcretecutting.com`): `CNAME cname.vercel-dns.com`
4. Add records at the registrar. SSL provisions automatically via Let's Encrypt — usually < 60 s after DNS propagates.
5. Set the new hostname as **Production** branch domain (not just an alias). The old `*.vercel.app` URL stays available but should not be the canonical.
6. **Update env vars** to the new hostname:
   - `NEXT_PUBLIC_SITE_URL=https://<domain>`
   - `NEXT_PUBLIC_APP_URL=https://<domain>`
7. **Update Supabase**:
   - Auth → URL Configuration → Site URL = `https://<domain>`
   - Auth → URL Configuration → Redirect URLs add: `https://<domain>/login`, `https://<domain>/setup-account`, `https://<domain>/sign/*`
8. **Update Stripe webhook endpoint** → `https://<domain>/api/webhooks/stripe` and copy the new signing secret into `STRIPE_WEBHOOK_SECRET`.
9. **Update Google Maps key restriction** → HTTP referrer `https://<domain>/*`.
10. Redeploy (env-var change requires it).
11. Verify SSL (A+ on SSL Labs is the bar — `next.config.js` already sets `Strict-Transport-Security` via Vercel default + the X-Frame, X-Content-Type, Referrer-Policy, Permissions-Policy headers at [next.config.js:25-49](next.config.js:25)).

---

## Database / Supabase pre-flight

- **Project:** `klatddoyncxidgqtcjnu` (one project — no separate prod vs. dev today; consider branching later).
- **Migrations:** 137 SQL files in [supabase/migrations/](supabase/migrations/). Two unapplied as of this checklist:
  - [`20260427_utility_waiver_fields.sql`](supabase/migrations/20260427_utility_waiver_fields.sql) — adds 5 columns to `job_orders`
  - [`20260427_operator_badges.sql`](supabase/migrations/20260427_operator_badges.sql) — creates `operator_badges` table with RLS
- **RLS sanity:** Run Supabase Linter (Database → Advisors). Confirm zero `rls_references_user_metadata` errors — see [CLAUDE.md](CLAUDE.md) for why `auth.jwt() -> 'user_metadata'` is unsafe and which `public.*` helpers to use.
- **Storage:** Confirm public buckets (`branding`, `signatures`, `photos`, etc.) exist and have policies. Image domain `klatddoyncxidgqtcjnu.supabase.co` is whitelisted at [next.config.js:7-9](next.config.js:7).
- **Seed data:** Confirm `tenants`, `tenant_branding`, default `profiles` (super_admin) exist for Patriot. The "Pontifex Industries" fallback at [app/api/setup-account/validate/route.ts:49](app/api/setup-account/validate/route.ts:49) and [app/api/admin/invite/route.ts:128](app/api/admin/invite/route.ts:128) only fires when `tenant.name` is null — ensure Patriot's `tenants.name = 'Patriot Concrete Cutting'`.
- **Backups:** Verify Supabase PITR is enabled (Pro plan or higher) and confirm last successful backup timestamp.
- **Connection limits:** Pooler URL — verify `pg` direct-connection paths (only `pg` import is in [package.json:34](package.json:34); confirm no naked `Pool` instances in serverless routes that would exhaust the connection pool).

---

## White-label rebranding TODOs

User-visible "Pontifex" strings still rendered to customers. Tenant branding (`BrandingProvider` + `tenant_branding` table) covers the dashboard chrome — these are the static fallbacks that ship in code.

| File:Line | Current text | Action |
|---|---|---|
| [app/error.tsx:59](app/error.tsx:59) | `Pontifex Industries Platform` | Replace with `{BRAND.companyName}` or hardcode `Patriot Concrete Cutting`. Top-level error boundary — visible to all users on a crash. |
| [app/global-error.tsx:136](app/global-error.tsx:136) | `Pontifex Industries Platform` | Same as above — root error boundary. |
| [app/page.tsx:439](app/page.tsx:439) | `Pontifex Platform` (header brand) | Landing page header. Pull from `BRAND` config. |
| [app/page.tsx:1141](app/page.tsx:1141) | `Pontifex Platform` (footer) | Landing page footer. |
| [app/setup-account/page.tsx:356](app/setup-account/page.tsx:356) | `Last updated: April 2026 — Pontifex Platform` | Setup account footer. |
| [app/sign/[token]/page.tsx:818](app/sign/[token]/page.tsx:818) | `Powered by Pontifex Industries` | **Customer-facing signature page** — highest-priority change for white-label. |
| [app/pricing/page.tsx:158](app/pricing/page.tsx:158) | `Pontifex Industries` | Pricing page header. |
| [app/pricing/page.tsx:303](app/pricing/page.tsx:303) | `Join concrete cutting companies using Pontifex...` | Pricing page CTA copy. |
| [app/offer/page.tsx:484](app/offer/page.tsx:484), [app/offer/page.tsx:658](app/offer/page.tsx:658), [app/offer/page.tsx:710](app/offer/page.tsx:710), [app/offer/page.tsx:852](app/offer/page.tsx:852), [app/offer/page.tsx:974](app/offer/page.tsx:974), [app/offer/page.tsx:977](app/offer/page.tsx:977) | Multiple `Pontifex` mentions | This is the Patriot 30-day-trial offer page — **decide**: keep "Pontifex" branding (it's selling the platform to Patriot, so Pontifex-the-vendor is correct) OR remove `/offer` from prod entirely. |
| [app/offer/success/page.tsx:183](app/offer/success/page.tsx:183) | `Pontifex Industries` | Same as above. |
| [components/landing/brand-config.ts:2-5](components/landing/brand-config.ts:2) | `companyName: 'Pontifex Platform'` | Single source of truth for landing brand — change here to flip header/footer/CTAs. |
| [components/landing/ComparisonTable.tsx:114](components/landing/ComparisonTable.tsx:114), [137](components/landing/ComparisonTable.tsx:137), [180](components/landing/ComparisonTable.tsx:180) | `Pontifex` (column header) | Comparison table. Likely stays "Pontifex" if the landing is selling the SaaS. Confirm with stakeholder. |
| [app/api/send-email/route.ts:17](app/api/send-email/route.ts:17) | `'pontifex-industries-software-z8py.vercel.app'` in `ALLOWED_PDF_DOMAINS` | Add the new custom domain (and Patriot domain) to the SSRF allowlist. Removing the `*.vercel.app` entry is OK if the new domain is the only PDF host. |
| [app/api/liability-release/pdf/route.ts:138](app/api/liability-release/pdf/route.ts:138), [140](app/api/liability-release/pdf/route.ts:140) | Falls back to `'Pontifex Industries'` / `'support@pontifexindustries.com'` | These default only when `pdf_branding` row is missing. Confirm Patriot's `pdf_branding` is seeded in Supabase. |
| [app/api/setup-account/validate/route.ts:49](app/api/setup-account/validate/route.ts:49) | Fallback `'Pontifex Industries'` if tenant unnamed | Same — seed Patriot tenant correctly and the fallback never fires. |
| [app/api/admin/invite/route.ts:128](app/api/admin/invite/route.ts:128), [176](app/api/admin/invite/route.ts:176) | Fallback `'Pontifex Industries'`; `'Powered by Pontifex Platform'` in invite email footer | Decide if "Powered by" footer stays in invite emails (small-print attribution). |
| [app/api/admin/invite/route.ts:126](app/api/admin/invite/route.ts:126), [133](app/api/admin/invite/route.ts:133) | `https://platform.pontifexindustries.com`, `noreply@admin.pontifexindustries.com` defaults | Replace with Patriot domain or rely on env vars. |
| [app/api/create-offer-checkout/route.ts:19](app/api/create-offer-checkout/route.ts:19), [52](app/api/create-offer-checkout/route.ts:52), [70](app/api/create-offer-checkout/route.ts:70) | `https://pontifexindustries.com`, `'Pontifex Operations Platform — 30-Day Trial'`, `'Pontifex Industries — 30-Day Trial for Patriot Concrete Cutting'` | Stripe checkout product names — visible to whoever pays. Decide on naming. |
| [app/nfc-clock/page.tsx:8](app/nfc-clock/page.tsx:8) | Comment-only example URL | Cosmetic only — comment in source. Can defer. |

---

## Code hygiene before launch

### Console logging
- **Total:** 1130 `console.log/warn/error` calls across [app/](app/) and [lib/](lib/) (`grep -rEn 'console\.(log|warn|error)' --include='*.tsx' --include='*.ts' app/ lib/ | wc -l`).
- **Top noisy files** (by call count):
  - 27 — [lib/database.ts](lib/database.ts)
  - 14 — [app/api/send-sms/route.ts](app/api/send-sms/route.ts)
  - 12 — [app/api/liability-release/pdf/route.ts](app/api/liability-release/pdf/route.ts)
  - 12 — [app/api/admin/job-orders/[id]/route.ts](app/api/admin/job-orders/[id]/route.ts)
  - 11 — [app/dashboard/admin/schedule-board/page.backup.tsx](app/dashboard/admin/schedule-board/page.backup.tsx) — **delete this `.backup.tsx` file before launch**
  - 11 — [app/api/access-requests/[id]/delete/route.ts](app/api/access-requests/[id]/delete/route.ts)
  - 10 — [app/dashboard/job-schedule/[id]/day-complete/page.tsx](app/dashboard/job-schedule/[id]/day-complete/page.tsx)
- **Action:** these are mostly legitimate `console.error` paths used for fire-and-forget catch-blocks. No need to strip universally, but consider:
  - Removing emoji-laden `console.log('🔍 Checking admin authentication status...')` etc. at [app/admin/page.tsx:14-35](app/admin/page.tsx:14) (5 calls — pure dev breadcrumbs).
  - Removing the `.backup.tsx` file entirely.

### TODO/FIXME inventory
- **Result:** zero `\bTODO\b|\bFIXME\b|\bHACK\b` markers in [app/](app/) or [lib/](lib/) — clean. (Verified with `grep -rEn '\bTODO\b|\bFIXME\b|\bHACK\b' --include='*.tsx' --include='*.ts' app/ lib/`.)

### Hardcoded localhost / vercel.app URLs to fix

| File:Line | Current | Action |
|---|---|---|
| [app/api/send-email/route.ts:17](app/api/send-email/route.ts:17) | `'pontifex-industries-software-z8py.vercel.app'` in `ALLOWED_PDF_DOMAINS` | Replace with the Patriot custom domain — see white-label table. |
| [app/api/job-orders/[id]/request-signature/route.ts:116](app/api/job-orders/[id]/request-signature/route.ts:116) | `'http://localhost:3000'` fallback | OK as a fallback (only fires if request has no Origin header), but verify Vercel always supplies one. |
| [app/api/service-completion-agreement/save/route.ts:295](app/api/service-completion-agreement/save/route.ts:295), [322](app/api/service-completion-agreement/save/route.ts:322) | `process.env.NEXT_PUBLIC_SITE_URL \|\| 'http://localhost:3000'` | Just ensure `NEXT_PUBLIC_SITE_URL` is set in Vercel. |
| [app/api/admin/jobs/[id]/send-signature-request/route.ts:82](app/api/admin/jobs/[id]/send-signature-request/route.ts:82), [174](app/api/admin/jobs/[id]/send-signature-request/route.ts:174) | `process.env.NEXT_PUBLIC_APP_URL \|\| 'http://localhost:3000'` | Same — set `NEXT_PUBLIC_APP_URL`. |
| [app/api/admin/notifications/send/route.ts:71](app/api/admin/notifications/send/route.ts:71), [send-reminder/route.ts:69](app/api/admin/notifications/send-reminder/route.ts:69) | `… \|\| 'http://localhost:3000'` | Same. |
| [app/api/billing/create-checkout-session/route.ts:49](app/api/billing/create-checkout-session/route.ts:49), [create-portal-session/route.ts:32](app/api/billing/create-portal-session/route.ts:32) | `request.headers.get('origin') \|\| 'http://localhost:3000'` | OK — Vercel always supplies Origin for browser-initiated requests. |
| [lib/email.ts:57](lib/email.ts:57) | `process.env.NEXT_PUBLIC_APP_URL \|\| 'http://localhost:3000'` | Set the env var. |

### Other hygiene items
- Delete or `.gitignore` the backup file [app/dashboard/admin/schedule-board/page.backup.tsx](app/dashboard/admin/schedule-board/page.backup.tsx) — it ships in the bundle today.
- Review the placeholder fallbacks in [lib/supabase.ts:4-5](lib/supabase.ts:4) and [lib/supabase-admin.ts:36-37](lib/supabase-admin.ts:36) — they keep the build green if env vars are missing. Consider failing fast in production by checking `NODE_ENV === 'production'` and throwing.
- 100+ root-level loose `.sql`, `AGENT_*.md`, `CHECK_*.sql` files. They don't affect deploy but inflate the repo. Consider moving to `docs/legacy/` post-launch.

---

## Post-deploy smoke test

Run against the new custom domain immediately after the first prod deploy. Each check should be a fresh incognito session.

| # | URL path | Expected | What to verify |
|---|---|---|---|
| 1 | `GET /api/health` | 200 JSON `{ status: 'healthy' }` | `checks.database`, `checks.auth`, `checks.storage` all `ok`. Response includes the new `version` and `VERCEL_DEPLOYMENT_ID`. |
| 2 | `GET /` | 200 HTML | Landing renders. Brand name reflects Patriot (or "Pontifex" if intentionally kept). Hero CTA "Enter Company Code" → `/company`. |
| 3 | `GET /login` | 200 HTML | Login page renders. Submit a known super_admin email/password → lands on `/dashboard/admin` (not `/dashboard`). |
| 4 | `GET /dashboard` (as operator) | 200 HTML | Operator dashboard. "Active Jobs" tile is now a `<Link>` (regression from April 27). NotificationBell renders. |
| 5 | `GET /dashboard/admin/schedule-board` (as super_admin) | 200 HTML | Schedule board loads, no floating role badge overlapping logout, drag-and-drop works. |
| 6 | `GET /dashboard/admin/jobs/[id]` (an active job) | 200 HTML | Job detail loads with Live Status panel polling every 30 s. No Super Admin "Job not found" 404 (April 27 fix). |
| 7 | `POST /api/auth/login` with bad creds | 401 + `Cache-Control: no-store` | Confirms middleware sec headers + rate-limit kicks in after 10/min. |
| 8 | `POST /api/demo-request` (rate-limit) | First 10 → 200, 11th → 429 | Validates middleware rate limiter works in prod (Edge runtime). |
| 9 | `GET /api/cron/health-check` (no auth) | 401 | Should reject without `Authorization: Bearer $CRON_SECRET`. With correct header → 200. |
| 10 | `GET /sign/<token>` (a real signature token) | 200 HTML | Public signature page loads. "Powered by …" footer matches white-label decision. |
| 11 | `GET /nfc-clock?tag=<id>` | 200 HTML | NFC clock-in page loads. **Confirm `NEXT_PUBLIC_LOCATION_BYPASS_CODE` is NOT set** — GPS check should run. |
| 12 | Send invoice email via admin UI | Email received | Resend `from` matches `RESEND_FROM_EMAIL`; links inside email use `https://<domain>` (not localhost or `*.vercel.app`). |

Plus: open the deployed site in a logged-in admin tab and a logged-in operator tab in the same browser. Click around in both. **Confirm no role bleed** (April 27 fix — `getCurrentUser()` cross-validates against Supabase session). If the operator sees admin chrome, roll back immediately.

---

## Rollback plan

**Trigger:** any of —
- `/api/health` returns `down` for > 2 minutes.
- Auth completely broken (no logins succeed).
- Customer-facing pages render the wrong brand at scale.
- Stripe webhook signature failures (incident with billing).

**Steps:**

1. **Vercel-level rollback** (fastest, < 30 s):
   - Vercel dashboard → Deployments → previous green deployment → **Promote to Production**.
   - This reverts code only — env vars stay as they are.
2. **DNS rollback** (if SSL or domain is the issue):
   - Vercel → Settings → Domains → remove the custom domain (it remains accessible via `*.vercel.app` URL).
   - Communicate the temporary URL to stakeholders.
3. **Database rollback** (only if a migration broke things):
   - The two pending migrations (`20260427_utility_waiver_fields.sql`, `20260427_operator_badges.sql`) are additive — utility waiver columns are nullable, `operator_badges` is a new table. Both can be dropped without affecting older code paths.
   - Drop SQL (run in Supabase SQL editor):
     ```sql
     DROP TABLE IF EXISTS public.operator_badges CASCADE;
     ALTER TABLE public.job_orders
       DROP COLUMN IF EXISTS utility_waiver_signed,
       DROP COLUMN IF EXISTS utility_waiver_signed_at,
       DROP COLUMN IF EXISTS utility_waiver_signed_by,
       DROP COLUMN IF EXISTS utility_waiver_signature_url,
       DROP COLUMN IF EXISTS utility_waiver_notes;
     ```
     (TBD — needs human input: confirm exact column names from the migration file before running.)
   - For Supabase PITR-eligible accounts: Database → Backups → Restore to a timestamp before the migration.
4. **Stripe rollback**:
   - In Stripe dashboard, disable the new webhook endpoint and re-enable the previous one.
   - No code change required if `STRIPE_WEBHOOK_SECRET` is the only thing that changed.
5. **Communication**:
   - Update stakeholders via the same channel used for launch announcement.
   - Post a status note to the in-app NotificationBell if reachable.

**Verify rollback:** repeat smoke tests 1–6 above against the rolled-back deployment.

---

## Appendix: things this doc does not cover

- Operator mobile UX audit (Week 2 backlog item — see [CLAUDE.md](CLAUDE.md)).
- Loading-states / error-handling audit (Week 2 backlog).
- Patriot-specific visual assets (logos, custom colors) — see [CLAUDE.md](CLAUDE.md) sprint backlog.
- Custom Patriot fonts — none currently configured; Tailwind defaults ship today.
- Performance budgets / Lighthouse targets — TBD, needs human input.
- SOC 2 / compliance evidence collection — out of scope for this checklist.
