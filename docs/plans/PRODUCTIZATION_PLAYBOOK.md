# Productization Playbook — Plug-and-Play Custom Software Base
**Vision (founder):** Pontifex builds **custom software solutions** per company. Patriot is the **base/flagship**. From here, when another company wants similar features, it should be **plug-and-play** — pick the modules they need, brand it, spin up their tenant, go. This doc defines how to get from "one bespoke Patriot build" to "a reusable base you assemble custom solutions from." **Status:** ARCHITECTURE PLAN — adopt incrementally (no big-bang refactor; the app is live).

> Good news: the multi-tenant **foundation already exists**. The work is (1) defining clean **feature modules**, (2) a per-tenant **feature catalog/entitlements**, and (3) a repeatable **new-tenant onboarding** flow.

---

## 1. What we already have (the base is real)
- **Tenant isolation:** `tenant_id` on tables + tenant-scoped RLS via SECURITY DEFINER helpers (`current_user_tenant_id()` etc.). Every new table follows this.
- **White-label:** `public.tenants` (name, slug, logo_url, primary_color, plan, max_users, `features` jsonb) + `BrandingProvider` (client reads branding). Company-code login disambiguates tenant + drives branding.
- **Entitlements (partial):** `user_feature_flags` (e.g. `can_manage_team`), `tenants.features` jsonb, `ADMIN_CARDS` + `ROLE_PERMISSION_PRESETS` in `lib/rbac.ts` drive dashboard visibility.
- **Roles:** 8-role hierarchy in `lib/rbac.ts`.
→ This is ~70% of a plug-and-play platform. We just haven't formalized **modules** or **tenant-level feature toggles**.

## 2. Define feature MODULES (the plug-and-play units)
Treat each domain as a module with a clear boundary (its tables + API routes + pages + components + types). Candidate modules (each independently enable-able per tenant):
- **scheduling** (schedule board, schedule form, dispatch, daily assignments)
- **timecards** (clock-in/out, GPS/NFC, payroll grid, lunch rules, PTO)
- **jobs** (active jobs, job detail, change orders, daily logs, work-performed)
- **billing** (invoices, QuickBooks export, Stripe subscription)
- **equipment + fleet** (inventory control, checkouts, voice checkout)
- **maintenance** (inbox, requests, repair/replace)
- **supervisor-visits** (site visit reports)
- **facilities + badging**, **customer portal / signatures**, **notifications (in-app + APNs + email)**, **skills & smart scheduling**, **daily reports**.

**Action (incremental, low-risk):** start by **documenting** each module's surface in a `FEATURE_CATALOG.md` (tables, routes, pages, deps, which roles use it). Then, as files are touched, migrate toward co-location — e.g. a `features/<module>/` (ui/, api-helpers, types, hooks) or at minimum consistent naming so a module can be reasoned about as a unit. **Do NOT** do a giant move-everything refactor; convert opportunistically + when extracting big files (e.g. the 2,850-line schedule board is already being decomposed into `_components/`).

## 3. Per-tenant feature catalog / entitlements
Turn `tenants.features` jsonb into a real **module switchboard**:
- Define a typed `MODULES` registry (key, label, dependencies, default-on roles).
- `tenants.features = { scheduling:true, billing:false, equipment:true, ... }`.
- Gate **sidebar cards, routes, and APIs** off the tenant's enabled modules (extend `lib/rbac.ts` `ADMIN_CARDS` to also check tenant module flags, not just role).
- **Super-admin "Tenant Modules" admin page:** toggle modules per company (the plug-and-play control panel).
→ Then "company X wants scheduling + timecards but not billing" = flip flags, no code fork.

## 4. New-tenant onboarding playbook (spin up company #2 from the base)
Document + eventually script (`scripts/new-tenant.ts`):
1. Insert `tenants` row (name, slug, company_code, primary_color, logo_url, plan, enabled `features`).
2. Create the first admin user (auth + profile + tenant_id + role).
3. Seed defaults: roles/permissions, payroll/lunch settings, notification settings, service-code→scope map, any taxonomies.
4. (Optional) seed demo data for their trial (like the `demopontifex` demo tenant).
5. Branding assets (logo square + color) → Settings → Company Branding.
6. Smoke test: company-code login → dashboard shows only enabled modules.
→ Target: a new tenant live in **minutes**, not a code branch.

## 5. Guardrails so the base stays reusable
- **No tenant-specific hardcoding** (already a CLAUDE.md non-negotiable) — everything via tenant/branding/feature flags. Audit for any "Patriot"/concrete hardcodes and replace.
- **Every new table:** `tenant_id` + tenant-scoped RLS (existing rule).
- **Module independence:** a disabled module's absence must not break others (guard cross-module reads).
- **Shared core vs module code:** keep auth, tenancy, branding, notifications, RBAC in a stable "core"; features plug into core.

## 6. Roadmap (incremental)
- **Step 1 (doc):** write `FEATURE_CATALOG.md` — inventory every module's tables/routes/pages/roles/deps. *(low effort, high clarity)*
- **Step 2:** typed `MODULES` registry + tenant `features` gating in sidebar/routes/APIs.
- **Step 3:** super-admin Tenant Modules toggle page.
- **Step 4:** `scripts/new-tenant.ts` onboarding script + seed library.
- **Step 5:** opportunistic file co-location into `features/` as code is touched.
- **Step 6:** extract a few flagship modules as clean, documented references (scheduling, timecards).

> Net: Patriot stays the proven base; new clients become configuration + branding + selected modules — true plug-and-play, matching the "custom software solutions company" positioning.
