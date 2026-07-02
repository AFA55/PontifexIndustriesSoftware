# Platform Hub v2 — the Pontifex control center

> Founder's ask (Jun 10): "a dashboard hub for my software company... control my software from
> within it... a sequence almost like the form scheduler when creating company code, login page and
> dashboard for other users... UI must look modern, functional, match brand."
>
> Status: Build item 1 (tenant-creation wizard) SHIPPED Jul 2 — see below. Build items 2/3
> (hub overview upgrades, brand polish) still open.

## What exists today (don't rebuild)

| Piece | State |
|---|---|
| `/dashboard/platform` overview | Tenants grid, health KPIs, bug/feedback triage, backups link |
| Tenant detail | Tabs: Overview / Users (invite, role-change, deactivate) / Modules (switchboard) / Billing |
| Create tenant | `/dashboard/platform/tenants/new` — single-page form, company_code validation, guard rails (can't suspend Patriot, etc.) |
| **Demo requests inbox** | ✅ NEW (Jun 10): `/dashboard/platform/demo-requests` — status pipeline (new → contacted → demo_scheduled → converted/closed), notes, founder email on each new lead |
| APIs | Cross-tenant user mgmt with explicit-target invariant; `lib/tenant-onboarding.ts` |

## The v2 vision: lead → client, end to end, in one surface

```
Demo request lands (email + inbox)
  → founder works the lead (status pipeline, notes)        ✅ shipped
  → "Convert to tenant" — GUIDED WIZARD (the "sequence")    ← build next
  → tenant live: branded login, modules on, first admin invited
  → ongoing: per-tenant health, usage, billing at a glance
```

### Build item 1 — Tenant-creation WIZARD (the founder's "sequence") ✅ SHIPPED Jul 2
`app/dashboard/platform/tenants/new/page.tsx` — a 5-step stepper, pre-fillable from a demo
request (`?fromLead=<id>`), verified live end-to-end (real tenant created + inspected in the DB,
then cleaned up):
1. **Company** — name, company code (live availability check against existing tenants), from-lead prefill
2. **Branding** — primary color, live login-page PREVIEW that updates as you type. Logo upload
   deliberately deferred to Settings → Branding post-creation (avoids pre-tenant file-upload plumbing).
3. **Modules** — package presets (Starter / Field Ops / Full) on top of the existing switchboard
4. **First admin** — name + email → fires the EXISTING invite flow on creation
5. **Review & launch** — summary → create → success screen with login URL + company code to send
On success: demo request auto-marked `converted` + `demo_requests.tenant_id` linked (the column
existed unused until now); the demo-requests inbox's "Convert to tenant" CTA now passes `?fromLead=`.

### Build item 2 — Hub overview as a real control center
- KPI row: clients, active users (7d), open demo requests, open feedback, error count (links Sentry when DSN set)
- Per-tenant card: last-activity signal (last login / last job created) — needs a cheap activity query
- Quick actions rail: New client wizard · Demo inbox · Feedback · Backups · System health

### Build item 3 — polish to brand (use `frontend-design` + `pontifex-brand` skills)
Keep the slate+amber "owner console" identity (deliberately distinct from client violet), apply the
journey-gradient accent on the wordmark/CTAs, kill any leftover generic gray.

## Architecture rules (guardian enforces)
- Every platform write takes an EXPLICIT target tenantId — never the caller's (existing invariant).
- Wizard reuses `lib/tenant-onboarding.ts` — no duplicate creation path.
- Demo-request → tenant link: add `demo_requests.tenant_id` usage (column already exists).
- No migrations needed for item 1 except optional `demo_requests.status` backfill — already additive.
- Module presets are UI sugar over `tenants.features` — no new gating semantics.

## Estimate
Item 1: one focused session (wizard UI + prefill + convert-link, builder + guardian).
Item 2: half session. Item 3: rides along with 1+2.
