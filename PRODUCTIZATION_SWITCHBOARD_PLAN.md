# Productization Switchboard — Design Plan (NOT yet built)

**Goal:** A per-tenant **Module Switchboard** so the founder can stand up company #2…#N as *config + branding + selected modules*, no code fork. This is **DESIGN ONLY** — no source files are changed by adopting this doc. When we build it, every existing gate (RBAC, `user_feature_flags`, branding) stays exactly as-is; the switchboard is a thin AND-gate layered *on top*.

**Hard constraint:** Patriot is LIVE on this code. Every choice below defaults to **byte-for-byte unchanged behavior for existing tenants**. If in doubt, default-ON.

Companion: [`FEATURE_CATALOG.md`](FEATURE_CATALOG.md) (the module map + the 4 existing gating layers), [`PRODUCTIZATION_PLAYBOOK.md`](PRODUCTIZATION_PLAYBOOK.md).

---

## 1. Where the switch lives: `tenants.features` jsonb (layer 3)

We activate the **already-existing, currently-dormant** `tenants.features` column (verified live default `{nfc,billing,analytics,inventory,customer_crm,ai_scheduling}`; Patriot row `{schedule_board,timecards,facilities,billing,nfc,customer_crm,analytics}`). We do **not** add a new column and we do **not** repurpose `tenant_branding.show_*_module` (layer 4) for the primary gate — instead we fold layer 4 into layer 3 (see §6).

**Backward-compatible read shape.** The reader treats `features` as a sparse override map:
```
effectiveEnabled(moduleKey, tenantFeatures) =
   module.core                      ? true                       // core modules can't be disabled
 : tenantFeatures?.[moduleKey] === false ? false                 // explicit off
 :                                   module.defaultOn            // ABSENT key => registry default (true for all)
```
Because **absence ⇒ default-on**, Patriot's existing partial map and Apex's default map both light up every module exactly as today. **No backfill is required for correctness** (a backfill is offered in §5 only for UI clarity, and is itself all-true).

---

## 2. The canonical typed registry: `lib/features.ts` (NEW file)

A single source of truth for module keys, labels, defaults, dependencies, and which existing layer-1/2 keys each module governs. Proposed shape (illustrative — finalize against `FEATURE_CATALOG.md` §1):

```ts
// lib/features.ts  (NEW — additive, no imports from gating code)
export type ModuleKey =
  | 'scheduling' | 'jobs' | 'timecards' | 'nfc' | 'billing'
  | 'customer_crm' | 'customer_portal' | 'completed_jobs'
  | 'facilities_badging' | 'equipment_fleet' | 'inventory_control'
  | 'voice_checkout' | 'maintenance' | 'supervisor_visits'
  | 'skills_scheduling' | 'peer_ratings' | 'analytics';

export interface FeatureModule {
  key: ModuleKey;
  label: string;
  description: string;
  defaultOn: boolean;          // ALL true for safe rollout
  core?: boolean;              // true => never toggleable (jobs, team_mgmt, notifications, subscription)
  dependsOn?: ModuleKey[];     // from FEATURE_CATALOG §2
  // The existing gates this module's surface maps to (DOCUMENTATION + future composition):
  sidebarFlagKeys?: string[];  // keys in UserFeatureFlags (layer 1)
  rbacCardKeys?: string[];     // keys in ADMIN_CARDS (layer 2)
  // Legacy layer-4 alias so the switchboard can read old branding booleans during migration:
  legacyBrandingFlag?: 'show_billing_module'|'show_analytics_module'|'show_inventory_module'|'show_nfc_module'|'show_customer_crm';
}

export const FEATURE_MODULES: FeatureModule[] = [ /* one entry per catalog row */ ];

// Pure helper — the ONLY new gate primitive. No side effects, easy to unit test.
export function isModuleEnabled(
  key: ModuleKey,
  tenantFeatures: Record<string, boolean> | null | undefined
): boolean { /* implements §1 formula */ }

// Core/platform modules (jobs, notifications, team_management, subscription) are
// NOT in FEATURE_MODULES as toggleable, or are flagged core:true and short-circuit to true.
```

This file imports **nothing** from `lib/rbac.ts` / `lib/feature-flags.ts` / `BrandingProvider`, so adding it cannot perturb them. It is pure data + one pure function.

---

## 3. Reading the tenant's flags client-side: `TenantFeaturesProvider` (NEW)

Today nothing exposes the *current tenant's* `features` to the client. We add a small provider (mirrors `BrandingProvider`'s cache-then-fetch pattern in `lib/branding-context.tsx`):

- `GET /api/tenant/features` (NEW, thin) → `requireAuth()`, returns `tenants.features` for the caller's `current_user_tenant_id()`. Read-only.
- `useTenantFeatures()` hook → `{ features, isEnabled(key) }`, with the same localStorage TTL cache style as branding, and a **fail-open default of all-enabled** if the fetch fails (so a network blip never hides Patriot's modules).

**Precedence is explicit and AND-only.** A sidebar/route/card is shown iff:
```
tenantEnabled(module)                // layer 3 (NEW) — can only HIDE
  && existingGate                    // layers 1 & 2 (UNCHANGED) — role/user
```
We never let the tenant flag *grant* access a role wouldn't have. Super_admin/ops_manager keep their layer-1 bypass for *role* purposes, but a module the tenant disabled stays hidden for everyone **except** core modules. (Decision: even super_admin sees only enabled modules, so the owner previews exactly what the client sees — except `subscription_billing`/`team_management` which are `core`.)

---

## 4. Composition points (where the AND-gate attaches) — additive wrappers only

We do **not** edit the gating logic inside `DashboardSidebar` / `rbac.ts`. We attach at the call sites:

1. **Sidebar (`components/DashboardSidebar.tsx`)** — add one optional field `moduleKey?: ModuleKey` to `NavItem`, and in the existing `.filter(...)` (`:401-409`) add a single clause: `if (item.moduleKey && !tenantEnabled(item.moduleKey)) return false;`. This is purely subtractive and only fires when `moduleKey` is set AND the tenant explicitly set it false — so existing items (no `moduleKey`) and existing tenants (no false flags) are unaffected. *(This is the one edit to an existing file; it is guarded to be a no-op for current data.)*
2. **Dashboard cards (`app/dashboard/admin/page.tsx`)** — same idea: filter `ADMIN_CARDS` by `isModuleEnabled` before render, mapping card→module via the registry's `rbacCardKeys`.
3. **API routes (defense in depth)** — a helper `requireModule(req, key)` in a NEW `lib/api-module-guard.ts` that returns 404 if the tenant has the module off. Apply **only to new/non-core routes** opportunistically; never retrofit core routes (`jobs`, `notifications`, auth).

Routes for a disabled module should **404, not 500** — and only if the module is non-core. Cross-module reads (catalog §2) must be guarded so a disabled module degrades the consumer gracefully.

---

## 5. Super-admin "Module Switchboard" admin page (NEW)

- **Location:** `/dashboard/admin/tenant-management/[id]/modules` (sub-page of the existing Platform Management card, which is already super_admin-gated via `tenant_management` rbac key). Reuses `requireSuperAdmin`.
- **UI:** a grid of toggles built from `FEATURE_MODULES`. Core modules render as locked/on. Toggling respects `dependsOn` (can't enable `billing` UI message if `jobs` off — though `jobs` is core so always on; relevant for `voice_checkout`→`equipment_fleet`).
- **Persistence:** `PATCH /api/admin/tenants/[id]` **already accepts `features`** (`app/api/admin/tenants/[id]/route.ts:60`). The page sends a merged `features` object. **No new write endpoint or migration needed.** (We will add server-side validation that the body only contains known `ModuleKey`s and never disables a `core` module.)
- **Safety:** the page writes the *full* normalized map (every known key explicit), so future "absence ⇒ default" ambiguity disappears for tenants edited via the switchboard.

### Optional, all-true backfill migration (cosmetic only)
`UPDATE tenants SET features = <full all-true map> || features` — left-biased merge keeps any explicit values, fills missing keys as true. **Idempotent, additive, changes no behavior** (absence already meant true). Apply only if we want the switchboard UI to show every toggle as explicitly-on. Patriot/Apex stay fully enabled.

---

## 6. Folding the legacy `show_*_module` (layer 4) into layer 3

`tenant_branding.show_billing_module / show_analytics_module / show_inventory_module / show_nfc_module / show_customer_crm` are dormant (catalog §0). Plan:
- The registry's `legacyBrandingFlag` lets the reader OR-consider the old value during a transition (`isModuleEnabled` returns false only if BOTH the new key is false and, if present, the legacy flag is false — i.e. legacy can't silently hide a Patriot module because Patriot's are all true).
- Leave the Settings → Branding toggles in place but mark them "(legacy — use Module Switchboard)" later. **Do not delete the columns** (avoids a destructive migration on a live table). Eventual cleanup is a separate, optional task.

---

## 7. Safe rollout sequence (each step independently shippable, behavior-preserving)

1. **Land `lib/features.ts` + `FEATURE_CATALOG.md`** (pure data/docs) — zero runtime effect.
2. **Add `GET /api/tenant/features` + `TenantFeaturesProvider`** but consume nowhere yet — zero effect.
3. **Wire the single sidebar `.filter` clause** behind `moduleKey` — no-op until a tenant sets a flag false. Verify Patriot + Apz nav unchanged on a preview URL before merge.
4. **Add the super-admin switchboard page** — gives the founder the control surface; still no-op for tenants left default.
5. **(Optional) all-true backfill** for UI clarity.
6. **Opportunistically add `requireModule` to new non-core routes.**

**Verification gate before any merge to main:** log in as Patriot super_admin AND a Patriot operator on a Vercel preview; confirm the sidebar, dashboard cards, and a spot-check of routes are identical to production. Repeat for Apex.

---

## 8. Exact files to ADD / CHANGE when we build it

**Add (new files — zero risk to existing behavior):**
- `lib/features.ts` — registry + `isModuleEnabled`.
- `lib/tenant-features-context.tsx` — `TenantFeaturesProvider` + `useTenantFeatures` (fail-open).
- `lib/api-module-guard.ts` — `requireModule()` (404 on disabled non-core).
- `app/api/tenant/features/route.ts` — read-only GET of caller-tenant features.
- `app/dashboard/admin/tenant-management/[id]/modules/page.tsx` — switchboard UI.

**Change (minimal, guarded to be no-ops for current data):**
- `components/DashboardSidebar.tsx` — add optional `moduleKey` to `NavItem` + one subtractive `.filter` clause; tag nav items with their module. *(No change to the existing flag/role logic.)*
- `app/dashboard/admin/page.tsx` — filter `ADMIN_CARDS` by `isModuleEnabled` before render.
- `app/api/admin/tenants/[id]/route.ts` — add validation that PATCHed `features` keys are known `ModuleKey`s and never disable a `core` module. *(Tightening only; the field is already allowed.)*
- Wrap the app tree once with `TenantFeaturesProvider` (same place `BrandingProvider` is mounted).

**NOT touched:** `lib/rbac.ts`, `lib/feature-flags.ts`, `lib/branding-context.tsx` logic, `requireAuth/requireAdmin/requireSuperAdmin`, any operator-workflow route.

---

## 9. Top risks to the live tenant (and mitigations)

1. **Accidentally hiding a module Patriot relies on.** Mitigation: absence ⇒ default-on (§1); fail-open provider (§3); core modules can't be disabled; AND-only composition (tenant flag can hide but the new clause only fires when a key is *explicitly* false, which no existing tenant has); mandatory Patriot-as-super_admin + Patriot-as-operator preview verification before merge (§7).
2. **Key-vocabulary drift.** The live `tenants.features` default keys (`inventory`, `ai_scheduling`) differ from Patriot's row keys (`schedule_board`, `timecards`, `facilities`). If the registry picks one spelling and a tenant stored the other, a gate could misfire. Mitigation: registry defines the **canonical** `ModuleKey` set; reader normalizes legacy aliases (`inventory→inventory_control/equipment_fleet`, `ai_scheduling→skills_scheduling`, `schedule_board→scheduling`) and treats any *unknown* key as non-gating (ignored), never as "disable."
3. **Over-broad API enforcement.** Bolting `requireModule` onto a shared/core route (e.g. `jobs`, `notifications`, branding, auth) would 404 Patriot mid-session. Mitigation: `requireModule` is opt-in per route, forbidden on `core` modules by a registry assertion, and rolled out only to *new* non-core routes — never retrofit the operator spine.

> Net: the switchboard is a subtractive, default-open, AND-only layer over the existing gates. The worst a misconfiguration can do is hide a *non-core* module from a *new* tenant — it cannot grant access, and it cannot change Patriot, whose modules are all explicitly or implicitly enabled.
