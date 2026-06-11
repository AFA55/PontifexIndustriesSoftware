# Pontifex Platform Console — Architecture Plan

**Author:** System Architecture Designer · **Date:** 2026-06-05 · **Status:** Design only (no code/migrations in this doc)

**Prime directive:** extend existing infra; never break the live client (Patriot, `tenant_id = ee3d8081-cec2-47f3-ac23-bdc0bb2d142d`). Every claim below cites a verified file:line or live table/column.

---

## 0. TL;DR

The foundation is ~70% built. `app/dashboard/admin/tenant-management/page.tsx` is already a super_admin-only screen that lists tenants, creates them, and suspends/reactivates them via a working CRUD API (`app/api/admin/tenants/route.ts` + `[id]/route.ts`). What's missing for the founder's ask ("add users to client accounts, manage their accounts, control those apps, with hierarchy"):

1. A **tenant detail** view with **Users** and **Modules** tabs (today there is only a flat card grid — no drill-in).
2. **Cross-tenant user management** APIs (add/invite/role-change/deactivate a user *inside a target tenant*). Today's invite/users routes (`app/api/admin/invite/route.ts:44`, `app/api/admin/users/route.ts:59`) hard-scope to the **caller's own** `tenantId` — a super_admin can't act on another tenant through them.
3. The **module switchboard UI** (writes `tenants.features`; the registry `lib/features.ts` and `PATCH .../tenants/[id]` already exist — they just aren't wired to a UI).
4. **Sidebar entry** — `components/DashboardSidebar.tsx` has no link to `tenant-management` at all (verified: grep returns nothing). Only `Billing` uses `superAdminOnly` (line 146).

Recommendation: **rebrand/extend `tenant-management` into a dedicated `/dashboard/platform/*` area** rather than bolting tabs onto one page. Reuse all existing APIs; add three new super-admin user routes. Write `features` now; **do not** turn on feature-gating reads yet (riskiest step — keep Patriot/Apex unaffected).

---

## 1. Where it lives

### 1.1 Route area — recommend `/dashboard/platform/*`

Today's screen lives at `app/dashboard/admin/tenant-management/page.tsx`. It is **inside the client-admin namespace** (`/dashboard/admin/*`), which blurs the two audiences the founder explicitly wants separated (Pontifex-the-platform vs. Patriot-the-client).

**Decision: create a new top-level area `app/dashboard/platform/*`** and migrate the existing page's logic into it.

| Reason | Detail |
|---|---|
| Conceptual clarity | `/dashboard/admin/*` = "I run my company." `/dashboard/platform/*` = "I run the platform that hosts companies." |
| Visual distinction | Platform area gets its own shell (dark slate + amber/crown accent, "PONTIFEX PLATFORM" wordmark) vs. the client admin's tenant-branded purple shell. Prevents a super_admin from thinking a destructive action applies to "their" dashboard. |
| Single guard surface | One `useEffect` role check (`super_admin` only) at the layout level instead of per-page. |
| Keeps tenant-management working | Leave a thin redirect at `/dashboard/admin/tenant-management` → `/dashboard/platform/tenants` so any existing bookmark/link still resolves. Low risk, additive. |

The existing `tenant-management/page.tsx` logic (fetch, create modal, suspend/reactivate, backups tab) is **lifted wholesale** into the new area — nothing is rewritten from scratch, just relocated and split into sub-pages. The **Backups tab** stays as a `/dashboard/platform/backups` page (it's already super_admin-only and reuses `/api/admin/backups`).

### 1.2 Gating — `super_admin` ONLY

- **Sidebar:** add a `PLATFORM` section (crown/amber accent) to `SECTIONS` in `components/DashboardSidebar.tsx` (insert after the `ADMIN` block ending line 148). Every item carries `superAdminOnly: true` — the filter already exists at lines 394 & 402 (`if (item.superAdminOnly && userRole !== 'super_admin') return false;`). No new gating mechanism needed.
- **Page layout:** mirror the existing guard in `tenant-management/page.tsx:84-89`:
  ```
  const u = getCurrentUser();
  if (!u || u.role !== 'super_admin') { router.push('/dashboard'); return; }
  ```
  Put it once in `app/dashboard/platform/layout.tsx`.
- **APIs:** every platform route uses `requireSuperAdmin(request)` from `lib/api-auth.ts:174` (already the guard on all `tenants` routes — `route.ts:13`, `[id]/route.ts:16,51,108`).

### 1.3 How a `super_admin` (tenant_id NULL or stale) operates across tenants safely

This is the central safety question. The platform owner has **no home tenant** for cross-tenant work. The codebase already has the machinery:

- `requireSuperAdmin` returns `tenantId: string | null` — null is **allowed only** for super_admin (`lib/api-auth.ts:28,112`).
- `resolveTenantScope(request, auth)` (`lib/api-auth.ts:331`) is the canonical "which tenant am I acting on?" resolver: for super_admin it **requires `?tenantId=<uuid>`**, validates it exists, and 404s otherwise (lines 352-362).
- The known footgun is documented in the file header (`lib/api-auth.ts:13-17`): the old `if (tenantId) query.eq('tenant_id', tenantId)` pattern **silently returns ALL tenants' rows when tenantId is NULL**. Platform routes must **never** use that pattern.

**Console rule (non-negotiable):** every platform API that touches tenant-scoped data takes an **explicit `tenantId` target** (query param for reads, body field for writes), resolves it via `resolveTenantScope`, and applies `.eq('tenant_id', resolvedTenantId)` to every write. The super_admin's own (possibly NULL or stale) `tenant_id` is never used as an implicit scope. This is the single most important invariant in the whole design.

> Note: Patriot's super_admin today has a real `profiles.tenant_id` (so they can also use the normal admin dashboard). `resolveTenantScope` will happily fall back to that profile tenant if `?tenantId` is omitted (lines 365-373) — so **platform routes must always send `tenantId` explicitly** and not rely on the fallback, or a super_admin could accidentally operate on Patriot while intending another tenant.

---

## 2. Pages

All pages reuse the existing visual vocabulary already in `tenant-management/page.tsx`: white cards `rounded-2xl border border-gray-200`, violet primary buttons, `lucide-react` icons, `useNotifications()` toasts, `statusColors`/`planIcons` maps (lines 162-173), `getHeaders()` bearer-token helper (lines 54-57). The **platform shell** swaps the violet header accent for slate+amber to signal "platform, not client."

### 2.1 Tenants list — `/dashboard/platform/tenants`

The existing card grid (`tenant-management/page.tsx:273-340`), lifted in. Each card already shows name, slug, status badge, plan, max_users, jobs/mo, created date, and a suspend/reactivate action. **Add per card:**

- **#users** (live count) — the list API already returns `tenant_users(count)` (`api/admin/tenants/route.ts:19`). Better: a real `profiles` count per tenant (the live data shows Patriot=17 profiles, Apex=8) since `tenant_users` may be sparsely populated. Add `profiles(count)` to the select, or compute server-side.
- **#modules on** — derive from `tenant.features` using `isModuleEnabled` + `TOGGLEABLE_MODULES` from `lib/features.ts:80,88` (e.g. "18/19 modules").
- **Click target** → navigates to tenant detail (today the card has no drill-in).

Search box (lines 246-255) and "New Tenant" button (lines 204-210) carry over unchanged.

### 2.2 Tenant detail — `/dashboard/platform/tenants/[id]` (tabbed)

New page. Loads from `GET /api/admin/tenants/[id]` which already returns `{ ...tenant, users: [...] }` with joined profile info (`[id]/route.ts:33-37`). Tabs:

**Overview tab**
- Branding (logo_url, primary_color), plan, limits (max_users, max_jobs_per_month), status, company_code, domain, timezone, shop name/coords, subscription_status.
- **Edit** writes via existing `PATCH /api/admin/tenants/[id]` — `allowedFields` already includes `name, domain, logo_url, primary_color, status, plan, max_users, max_jobs_per_month, features, billing_email, billing_address` (`[id]/route.ts:60-64`). **company_code/slug are intentionally NOT editable** (immutable login keys) — keep them read-only; do not add them to `allowedFields`.
- **Activate / Suspend** toggle reuses `handleUpdateStatus` logic (`tenant-management/page.tsx:137-155`) → `PATCH { status }`. Guard rails in §5.

**Users tab** (the founder's core ask: "add users to client accounts")
- List the tenant's users. Source of truth = `profiles` where `tenant_id = :id` (richer than `tenant_users`; matches what `GET /api/admin/users` returns — `users/route.ts:66-73`). Show full_name, email, role, `active` flag, created_at.
- **Add user / Invite** → new platform invite route (§3.2) that targets `:id`, not the caller's tenant.
- **Change role** → new route (§3.3). Dropdown over the role list (CLAUDE.md roles: super_admin > operations_manager > admin > salesman > shop_manager > inventory_manager > operator > apprentice). Guard: see §5 (cannot strip the last admin/owner; granting super_admin is a separate, audited action — `api/admin/grant-super-admin/route.ts`).
- **Deactivate** → set `profiles.active = false` (column confirmed via `users/route.ts:68` `.eq('active', true)`). Soft, reversible. Never hard-delete.

**Modules tab** — the switchboard (§4)
- Render `TOGGLEABLE_MODULES` (`lib/features.ts:80`) as labeled toggles. Initial state from `isModuleEnabled(key, tenant.features)` (`lib/features.ts:88`) so legacy spellings (`schedule_board`, `ai_scheduling`, `inventory`) normalize correctly (`LEGACY_ALIASES` lines 67-72).
- `core: true` modules render as **locked "Always on" rows** (greyed, no toggle) — matches the registry contract (lines 30-34) and `buildFeaturesMap` skipping core (`scripts/new-tenant.ts:124`).
- Save → `PATCH /api/admin/tenants/[id]` with a merged `features` map. **Default-ON semantics preserved:** never write a core key; absence ⇒ on.

**Billing tab**
- Link out to the existing per-tenant subscription surface. `resolveBillingTenant` (`lib/api-auth.ts:394`) already lets a super_admin act on a specific tenant via `?tenantId=`. The sidebar `Billing` item (`DashboardSidebar.tsx:146`) and `/dashboard/admin/subscription` are the existing UI. v1: just deep-link with `?tenantId=:id`; full embedding is a later phase.

### 2.3 Create tenant — `/dashboard/platform/tenants/new` (or keep modal)

The `CreateTenantModal` already exists (`tenant-management/page.tsx:470-621`) and posts to `POST /api/admin/tenants`. **Gaps to close so it matches `scripts/new-tenant.ts`:**

| Field | Modal today | `new-tenant.ts` / POST today | Action |
|---|---|---|---|
| `company_code` | **missing** | script requires it (`new-tenant.ts:42`); **POST does NOT accept it** (`route.ts:46` destructure omits it) | **Add to modal + POST allowed body.** Without company_code the tenant can't be logged into (login = company_code + email). This is the single most important create-flow gap. Validate `^[A-Z0-9_]{3,20}$` (`new-tenant.ts:93`). |
| Module selection | missing | `enabledModules` (`new-tenant.ts:52`) | Add an optional "modules" step using `TOGGLEABLE_MODULES`; pass through as `features`. Default all-on. |
| First admin user | `owner_email` only (looked up, invited later) | script creates the auth user + profile + sends invite (`new-tenant.ts:191-226`) | Have POST optionally create the first admin (auth user + profile + `tenant_users` + invite), mirroring the script. Keeps onboarding one-click. |
| branding seed | none | `seedBranding` (`new-tenant.ts:170`) | POST should upsert a `tenant_branding` row (company_name, primary_color) so login is white-labeled day one. |

**Recommendation:** the create UI is a thin wrapper over the **same logic** `new-tenant.ts` already encodes. Rather than duplicate, **extract the script's steps (`createTenantRow`/`seedBranding`/`createAdminUser`) into a shared `lib/tenant-onboarding.ts`** that both `scripts/new-tenant.ts` and `POST /api/admin/tenants` import. One source of truth; the script keeps its guards for CLI use, the API gets the same battle-tested flow. (Note the script already exports `run`/`buildFeaturesMap` — `new-tenant.ts:282`.)

---

## 3. APIs — reuse vs. add

### 3.1 Reuse as-is (verified working, super_admin-guarded)

| Route | Verb | Purpose | File |
|---|---|---|---|
| `/api/admin/tenants` | GET | list all tenants (+counts) | `route.ts:12` |
| `/api/admin/tenants` | POST | create tenant (extend body — §2.3) | `route.ts:39` |
| `/api/admin/tenants/[id]` | GET | tenant + users | `[id]/route.ts:12` |
| `/api/admin/tenants/[id]` | PATCH | update incl. `features`, `status`, branding | `[id]/route.ts:47` |
| `/api/admin/tenants/[id]` | DELETE | soft-cancel (`status='cancelled'`) | `[id]/route.ts:104` |
| `/api/admin/backups` | GET/POST | backups tab | (existing) |
| `/api/admin/grant-super-admin` | POST | promote a user (audited) | `grant-super-admin/route.ts` |

### 3.2–3.4 Add — cross-tenant user management (super_admin, explicit target)

The existing `invite` and `users` routes scope to the **caller's** tenant (`invite/route.ts:44,60,88`; `users/route.ts:59`). A super_admin acting on *another* tenant cannot use them. Add a small **platform-namespaced** set so the cross-tenant capability is obvious and auditable. All use `requireSuperAdmin` + `resolveTenantScope` (explicit `tenantId`).

| New route | Verb | Body / params | Behavior |
|---|---|---|---|
| `/api/admin/platform/tenants/[id]/users` | GET | path `id` | List `profiles` where `tenant_id = id`. Mirrors `users/route.ts` select but with an explicit, super-admin-resolved tenant — never the caller's. |
| `/api/admin/platform/tenants/[id]/users` | POST | `{ email, name, role, tempPassword? }` | Add a user **to tenant `id`**. Reuse `createAdminUser`-style logic from `new-tenant.ts:191` but parameterized on target tenant + role. If no password → invite email (Resend, like `invite/route.ts:132`). |
| `/api/admin/platform/tenants/[id]/users/[userId]` | PATCH | `{ role?, active? }` | Change role or (de)activate. **Must verify the target user's `profiles.tenant_id === id`** before writing (the same cross-tenant-escalation guard `grant-super-admin/route.ts:17-25` already does). |

**Why a new namespace and not extend `/api/admin/invite`?** Extending the existing route to accept an arbitrary `tenantId` would silently widen a tenant-admin route into a cross-tenant one — easy to misuse, hard to audit. A dedicated `platform/` prefix makes the privilege boundary explicit and keeps the blast radius contained.

**Security model for every platform write:**
1. `requireSuperAdmin` (401/403 if not platform owner).
2. Resolve **explicit** target `tenantId` (path param) via `resolveTenantScope` — 404 if tenant doesn't exist.
3. For user mutations, **re-fetch the target user and assert `user.tenant_id === targetTenantId`** before writing (prevents operating on a user who isn't actually in the named tenant).
4. `.eq('tenant_id', targetTenantId)` on every write. Never rely on RLS alone — `supabaseAdmin` bypasses RLS (CLAUDE.md), so the app layer is the enforcement boundary.
5. Audit (see §6 — and note the existing audit bug below).

> **Bug found (flag for fix, not in scope here):** `grant-super-admin/route.ts:42-48` inserts audit columns `actor_id`/`target_id`/`tenant_id`, but the live `audit_logs` table has **`user_id`/`resource_type`/`resource_id`/`details`** (verified — no `actor_id`/`target_id` columns). That insert is silently failing (it's `.catch(() => {})`). The `tenants` routes use the correct columns (`tenants/route.ts:114-122`). New platform routes should follow the **tenants** pattern, and the grant route's audit insert should be corrected separately.

---

## 4. Module switchboard activation

### 4.1 Write path (build now — low risk)

The Modules tab (§2.2) writes `tenants.features` via the **already-existing** `PATCH /api/admin/tenants/[id]` (`allowedFields` includes `features` — `[id]/route.ts:63`). No new write API needed.

Save algorithm (client builds, server persists):
1. Start from the tenant's current `features`.
2. For each `TOGGLEABLE_MODULES` key, set `true/false` from the toggle.
3. **Never** include a `core: true` key (registry contract — `lib/features.ts:30-34`; `buildFeaturesMap` skips them — `new-tenant.ts:124`).
4. PATCH the merged map. Re-render from `isModuleEnabled` so legacy aliases stay normalized.

Live `tenants.features` defaults today are the **legacy** spellings (`{nfc, billing, analytics, inventory, ai_scheduling, customer_crm}` — verified column default). `isModuleEnabled`'s `LEGACY_ALIASES` already maps `inventory→inventory_control`, `ai_scheduling→skills_scheduling`, etc. (`lib/features.ts:67-72,92`), so the switchboard renders correctly against old data. **The switchboard should write canonical keys going forward** (don't perpetuate legacy spellings on save).

### 4.2 Read/gating path (do NOT build yet — riskiest step)

`lib/features.ts:5-9` is explicit: the registry is **DATA-ONLY**; nothing gates on it yet, and activating gating is "a deliberate, separately-reviewed step." Honor that.

- **v1 console = writes only.** Toggling a module records intent in `tenants.features`. The app's behavior does **not** change. Patriot and Apex keep every module regardless of what's stored (absence ⇒ on; core ⇒ on; unknown ⇒ on — `lib/features.ts:94-98`).
- **Later, opt-in gating.** When ready, introduce a `requireModule(request, auth, moduleKey)` guard (composes `resolveTenantScope` + `isModuleEnabled`) and apply it **only to NEW routes or net-new features** — never retrofit it onto routes Patriot depends on. The safe-by-default read semantics mean an un-migrated tenant is never accidentally locked out.
- **UI gating (sidebar) before API gating.** A gentle first step is hiding sidebar items for disabled modules (extend the existing `flagKey` mechanism in `DashboardSidebar.tsx` to also consult `tenant.features`), which is cosmetic and reversible, before any API enforces it. Even this should ship after the write-only console is proven.

**Explicit recommendation: console-writes-features now; gating-reads later & opt-in.** This is the line that protects the live trial.

---

## 5. Hierarchy & safety

**Hierarchy:** Pontifex (platform owner = `super_admin`, the only role `requireSuperAdmin` admits) → Tenants (`tenants` rows) → Users (`profiles.tenant_id` + `tenant_users`). The console is the only surface that crosses tenant boundaries; everything else is tenant-locked by the guards in `lib/api-auth.ts`.

**Can the console lock Patriot out? Yes, without guard rails.** Concrete failure modes and mitigations:

| Risk | Mitigation (enforce in the new platform routes/UI) |
|---|---|
| Suspend the only/last active tenant → nobody can log in | Block suspending a tenant if it would leave zero `active` tenants; **hard-protect** Patriot's id `ee3d8081-...` (the same `PROTECTED_TENANT_IDS` list `new-tenant.ts:91` already encodes) and `company_code='PATRIOT'`. |
| Strip the last admin / change the only owner's role to operator | Before a role downgrade or deactivate, count remaining `active` users with `role in (admin, super_admin, operations_manager)` in that tenant; refuse if it would hit zero. |
| Disable a `core` module | Structurally impossible if the switchboard renders core as locked (§4.1) and the save path never emits core keys. Defend server-side too: PATCH should drop any core key from an incoming `features` map. |
| Super_admin accidentally acts on the wrong tenant (NULL/stale profile tenant fallback) | Platform routes **always** send explicit `tenantId`; never rely on `resolveTenantScope`'s profile fallback (`lib/api-auth.ts:365-373`). UI shows the target tenant name prominently in the platform shell. |
| Super_admin removes their own super_admin / deletes themselves | Refuse self-demotion and self-deactivation in the platform user route. |
| Destructive actions (suspend, cancel, role-strip, deactivate) | Require an explicit confirm modal that **types the tenant/user name** (matches the delete-confirmation pattern already used on Active Jobs — CLAUDE.md backlog "Delete job — trash icon + confirmation modal"). |

**Least privilege for the platform owner's reach:** the console can manage users and modules but should **not** silently read tenant operational data (customer lists, job financials) beyond counts in v1 — keep the cross-tenant surface narrow to reduce both blast radius and any future data-handling concerns.

---

## 6. Migrations

**v1 needs none.** Everything required exists: `tenants` (incl. `status`, `features`, `company_code`, `plan`, limits — all verified live), `tenant_branding`, `tenant_users`, `profiles.active`, `user_invitations`, `audit_logs`.

**Optional, additive, later:**
- **Platform audit log.** The existing `audit_logs` table is **tenant-scoped** (has `tenant_id`) and already used by the tenants routes (`tenants/route.ts:114`). Platform actions (cross-tenant) can log there with `resource_type='tenant'` and `details` JSON — no new table strictly required. If a clean separation is wanted, add `platform_audit_logs` (additive, RLS: super_admin-only read; no `tenant_id` since these are cross-tenant). Keep it additive + RLS per CLAUDE.md.
- **`tenants.suspended_reason` / `tenants.activated_at`** (text/timestamptz, nullable, additive) — nice-to-have for the Overview tab. Not required.
- **Do NOT** add a migration just to fix the `grant-super-admin` audit-column bug; that's an app-code fix (use the table's real columns), not a schema change.

Any future migration follows the additive + idempotent convention (`CREATE TABLE IF NOT EXISTS`, tenant_id where applicable, SECURITY DEFINER RLS helpers — CLAUDE.md). The switchboard does **not** need migrations because `features` is an existing `jsonb` column.

---

## 7. File-by-file build plan + phasing

### Phase 1 (v1) — tenants list/detail/create + user mgmt + module switchboard (write-only)

**New files**
- `app/dashboard/platform/layout.tsx` — super_admin guard + platform shell (slate/amber).
- `app/dashboard/platform/tenants/page.tsx` — list (lift card grid from `tenant-management/page.tsx`, add #users + #modules + drill-in).
- `app/dashboard/platform/tenants/[id]/page.tsx` — tabbed detail (Overview / Users / Modules / Billing).
- `app/dashboard/platform/tenants/new/page.tsx` (or reuse `CreateTenantModal`) — create flow incl. company_code + modules + first admin.
- `app/dashboard/platform/backups/page.tsx` — lift the Backups tab.
- `components/platform/ModuleSwitchboard.tsx` — toggles over `TOGGLEABLE_MODULES`, core locked.
- `components/platform/TenantUsersTab.tsx` — list/add/role-change/deactivate.
- `lib/tenant-onboarding.ts` — extracted shared create logic (used by both the API and `scripts/new-tenant.ts`).
- `app/api/admin/platform/tenants/[id]/users/route.ts` — GET/POST cross-tenant users.
- `app/api/admin/platform/tenants/[id]/users/[userId]/route.ts` — PATCH role/active.

**Edited files**
- `components/DashboardSidebar.tsx` — add `PLATFORM` section (`superAdminOnly: true` items: Tenants, Backups) after line 148.
- `app/api/admin/tenants/route.ts` (POST) — accept `company_code` (validate `^[A-Z0-9_]{3,20}$`), `features`, optional first-admin + branding seed (delegate to `lib/tenant-onboarding.ts`).
- `app/dashboard/admin/tenant-management/page.tsx` — replace body with a redirect to `/dashboard/platform/tenants` (or leave as a deprecated alias).
- `app/api/admin/tenants/[id]/route.ts` (PATCH) — server-side: strip any `core` key from an incoming `features` map; add last-admin / last-active-tenant guards for `status` changes (§5).

**No migrations.**

### Phase 2 — billing overview + usage metrics
- Embed per-tenant subscription/usage (jobs this month vs `max_jobs_per_month`, users vs `max_users`) in the detail Billing/Overview tabs. Reuse `resolveBillingTenant` (`lib/api-auth.ts:394`).
- Cross-tenant platform dashboard (MRR, active tenants, trials ending) at `/dashboard/platform`.

### Phase 3 — audit log + (opt-in) feature gating
- Platform audit view (read `audit_logs`/`platform_audit_logs`).
- Introduce `requireModule()` and apply to **new** routes only; optional sidebar `features` gating. Separately reviewed per `lib/features.ts:5-9`.

---

## 8. Open questions for the founder

1. **Route naming** — `/dashboard/platform/*` (recommended) vs. keeping `/dashboard/admin/tenant-management`? The former cleanly separates "platform owner" from "client admin."
2. **First-admin on create** — when you create a tenant, should the console immediately create + email-invite their first admin (one-click onboarding, like `new-tenant.ts`), or just create the empty tenant and invite users afterward?
3. **Cross-tenant visibility depth** — should the platform console let you *view* a client's operational data (jobs, customers, financials), or strictly manage accounts/users/modules/billing? Recommend the narrow version for v1 (smaller blast radius).
4. **"Impersonate / log in as tenant admin"** — a common SaaS console feature for support. Powerful but sensitive. Want it? If so it needs its own audited, time-boxed flow (out of v1 scope).
5. **Module gating timeline** — confirm: v1 only *writes* `tenants.features` (no behavior change); actual gating is a later, separately-reviewed phase. (Strongly recommended to protect Patriot.)
6. **Plan ↔ modules coupling** — should selecting a plan (starter/professional/enterprise) auto-preset which modules are on, or are modules always independently toggled? (Affects the create flow and switchboard defaults.)
7. **company_code immutability** — confirm company_code (and slug) are permanent once set. Changing them breaks existing users' login and branding lookups; recommend read-only after creation.

---

## Appendix — verified facts

- **Live tenants (2):** Patriot (`ee3d8081-cec2-47f3-ac23-bdc0bb2d142d`, `PATRIOT`, enterprise, 17 profiles) and Apex (`ade00000-...`, `APEX`, professional, 8 profiles).
- **`tenants` columns (verified):** id, name, slug, domain, logo_url, primary_color (default `#7c3aed`), status (default `active`), plan (default `professional`), max_users (50), max_jobs_per_month (500), features jsonb (legacy default `{nfc,billing,analytics,inventory,ai_scheduling,customer_crm}`), owner_id, billing_email, billing_address, trial_ends_at, subscription_*, stripe_*, company_code, timezone, shop_latitude/longitude/name, clock_in/out_radius_meters, default_start_time.
- **`tenant_users`:** id, tenant_id, user_id, role, invited_by, joined_at.
- **`tenant_branding`:** keyed by tenant_id; company_name, primary_color, logo_url + many theming cols, plus legacy `show_*_module` booleans (predecessor of the features switchboard).
- **`audit_logs`:** id, user_id, user_email, user_role, action, resource_type, resource_id, details jsonb, ip_address, user_agent, created_at, tenant_id. (NOT actor_id/target_id — see §3 bug note.)
- **`profiles`:** has `active` boolean (soft-deactivate), role, tenant_id.
- **Guards:** `requireSuperAdmin` (`lib/api-auth.ts:174`), `resolveTenantScope` (`:331`), `resolveBillingTenant` (`:394`). Sidebar `superAdminOnly` filter (`DashboardSidebar.tsx:394,402`). No existing sidebar link to tenant-management.
- **Registry:** `lib/features.ts` — 24 modules, `core`/`defaultOn`, `LEGACY_ALIASES`, `isModuleEnabled` (data-only, no gating yet).
</content>
</invoke>
