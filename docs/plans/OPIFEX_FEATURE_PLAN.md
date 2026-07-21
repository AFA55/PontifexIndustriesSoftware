# Opifex → Platform Feature (fold-in architecture)

**Date:** July 21, 2026 (founder-directed: "make Opifex a feature instead of independent app — clean architecture")
**Status:** ✅ EXECUTED same day. This doc records the target architecture and what changed.
**Supersedes:** the standalone-product model in `docs/plans/HIRELINE_MODULE_PLAN.md` §5.1 (front-door tenant + self-serve signup). Everything else in that doc (ad-kit generation, ADEA guardrails, billing spread, agency Meta model, publish queue) still applies — it describes the module internals.

---

## The insight that made this cheap

Opifex was **never a separate app**. It was already path-based routes inside the one Next.js monolith (`/dashboard/hiring/*`, `/api/hiring/*`, `/apply/[slug]`, `/jobs`), with tenant-scoped `hiring_*` tables (all 9 with `tenant_id` + RLS), gated by `tenants.features.hiring`. What made it FEEL like an independent product was four bolt-ons:

1. A front-door tenant (`OPIFEX`, company code entry point, "sign in with code OPIFEX")
2. A public self-serve signup (`POST /api/hiring/public/signup`) that minted hiring-only tenants outside the Platform Hub
3. A standalone-product landing page (`/jobs`) selling "Opifex" with its own signup form
4. Special-case code: `HIRE_TENANT_ID` implicitly always-on in the API guard

The fold-in = remove those four. The module itself didn't move.

## Target architecture (now live)

- **Hiring is a module like any other.** Enabled per tenant via `tenants.features.hiring` (registry: `lib/features.ts`, `defaultOn: false`). Sidebar "Job Board" + "Job Board Billing" appear for admin/ops roles when enabled. API boundary: `requireHiringAdmin()` = role ∈ {admin, super_admin, operations_manager} AND feature on — **no tenant is special-cased**.
- **One front door.** All tenants sign in through their own company code. Tenant creation happens in ONE place: the Platform Hub (future Hub v2 wizard). To sell hiring to a non-ops company later, create a tenant in the Hub with `{ hiring: true, scheduling: false, ... }` — the hiring-only dashboard redirect (`app/dashboard/admin/page.tsx`) already routes such tenants to `/dashboard/hiring`. That capability is a **module configuration, not a product**.
- **Public surfaces unchanged where they earn their keep:**
  - `/apply/[slug]` — candidate application, white-labeled to the posting tenant. KEPT (it's how candidates apply).
  - `/jobs` — now a **feature marketing page** (Pontifex-branded, same design), CTAs → `/request-demo` + generic `/company-login`. No signup form, no OPIFEX code.
- **Billing unchanged:** ad-spend passthrough × markup per tenant (`hiring_billing`, settle engine, daily cron). Patriot's billing row untouched.

## What was removed (all recoverable via git / re-runnable)

| Item | Action |
|---|---|
| `app/api/hiring/public/signup/route.ts` | Deleted (self-serve tenant minting — Hub is the only tenant factory now) |
| `HIRE_TENANT_ID` / `HIRE_COMPANY_CODE` (`lib/hiring/types.ts`) + implicit always-on in `lib/hiring/api-guard.ts` | Deleted |
| `/jobs` signup form + "code OPIFEX" CTAs | Replaced with demo-request funnel |
| **OPIFEX tenant in prod DB** (id `32d26561-0b88-4b4f-b879-ec0b33b033ea`) | Deleted with all rows: 1 test job, 5 screeners, 5 events, billing row, branding, invitations, feature flags, health alert, and BOTH accounts — `opifex.tester@example.com` (QA) and `pontifexindustries@gmail.com` (founder's self-serve signup test; his real logins in PONTIFEX/PATRIOT are untouched) |
| Stale "Opifex signups" comments (`lib/features.ts`, `app/dashboard/admin/page.tsx`, `components/DashboardSidebar.tsx`) | Reworded to module language |

## What was deliberately kept

- `OPIFEX`/`opifex` in `PROTECTED_COMPANY_CODES`/`PROTECTED_SLUGS` (`lib/tenant-onboarding.ts`) — name stays reserved so no customer can squat it.
- The hiring-only dashboard redirect — it's module-driven (`hiring && !scheduling`), not Opifex-specific, and future hiring-only tenants need it.
- `app/dashboard/hiring/layout.tsx`, all `/api/hiring/*` authenticated routes, `lib/hiring/*`, `components/hiring/*`, both hiring crons, the publish queue — the module internals.
- The "Opifex violet" `#7C3AED` fallback on `/apply/[slug]` — it's just the Pontifex brand violet.

## Naming note

"Opifex" survives as internal/brand vocabulary (the -fex family: Pontifex, Artifex, Opifex) but customer-facing copy says "Job Board" / "hiring module." Don't reintroduce a separate product identity.
