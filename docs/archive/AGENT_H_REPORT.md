# Agent H — Permission-Flag Writer & Schema Audit

Audit date: 2026-04-21
Scope: `user_feature_flags` writer path + schema parity end-to-end.

---

## 1. Parity table: `UserFeatureFlags` type ↔ DB columns

Source of truth TS: `lib/feature-flags.ts:6-27`
DB: Supabase `user_feature_flags` (project `klatddoyncxidgqtcjnu`).

| Key / Column | In TS type | In DB column | Status |
|---|---|---|---|
| `can_create_schedule_forms` | YES | YES (bool, default false) | OK |
| `can_view_schedule_board` | YES | YES | OK |
| `can_edit_schedule_board` | YES | YES | OK |
| `can_request_schedule_changes` | YES | YES (default true) | OK |
| `can_view_active_jobs` | YES | YES | OK |
| `can_view_all_jobs` | YES | YES | OK |
| `can_view_completed_jobs` | YES | YES | OK |
| `can_view_timecards` | YES | YES | OK |
| `can_view_customers` | YES | YES | OK |
| `can_view_invoicing` | YES | YES | OK |
| `can_view_analytics` | YES | YES | OK |
| `can_view_facilities` | YES | YES | OK |
| `can_view_nfc_tags` | YES | YES | OK |
| `can_view_form_builder` | YES | YES | OK |
| `can_manage_team` | YES | YES | OK |
| `can_manage_settings` | YES | YES | OK |
| **`can_grant_super_admin`** | YES | **YES (confirmed present)** | OK |
| `can_view_personal_hours` | YES | YES (default true) | OK |
| `can_view_personal_metrics` | YES | YES (default true) | OK |
| `admin_type` | YES (string) | YES (varchar, default 'admin') | OK |
| `id` / `user_id` / `tenant_id` / `created_at` / `updated_at` | n/a | YES | OK (metadata cols) |

**Verdict: FULL PARITY.** Every key in `UserFeatureFlags` maps to a real DB column and vice versa. No orphan columns, no missing columns.

---

## 2. Parity table: Toggle UI ↔ `UserFeatureFlags` type

Source: `components/FeatureFlagsPanel.tsx:28-84` (`FLAG_GROUPS`).

| Toggle key rendered in UI | Exists in `UserFeatureFlags`? | Status |
|---|---|---|
| `can_create_schedule_forms` | YES | OK |
| `can_view_schedule_board` | YES | OK |
| `can_edit_schedule_board` | YES | OK |
| `can_request_schedule_changes` | YES | OK |
| `can_view_active_jobs` | YES | OK |
| `can_view_all_jobs` | YES | OK |
| `can_view_completed_jobs` | YES | OK |
| `can_view_timecards` | YES | OK |
| `can_view_customers` | YES | OK |
| `can_view_invoicing` | YES | OK |
| `can_view_analytics` | YES | OK |
| `can_view_facilities` | YES | OK |
| `can_view_nfc_tags` | YES | OK |
| `can_view_form_builder` | YES | OK |
| `can_manage_team` | YES | OK |
| `can_manage_settings` | YES | OK |
| `can_grant_super_admin` | YES | OK |
| `can_view_personal_hours` | YES | OK |
| `can_view_personal_metrics` | YES | OK |

Keys only in type (not in UI toggles): `admin_type` — intentional, it is driven by the Quick Preset section (`FeatureFlagsPanel.tsx:142-145`), not a toggle.

**Verdict: NO ORPHANS.** All 19 boolean flags render as toggles. `admin_type` is presented via preset chooser. OK.

> **Secondary concern (P1):** `FeatureFlagsPanel.tsx:5-26` **redeclares** `UserFeatureFlags` locally instead of importing from `lib/feature-flags.ts`. The two shapes currently agree, but the duplication invites future drift — the next dev adding a flag will update one but not the other. Fix: `import type { UserFeatureFlags } from '@/lib/feature-flags';`.

---

## 3. Parity table: `ROLE_PERMISSION_PRESETS` ↔ `ADMIN_CARDS`

Cards (`lib/rbac.ts:34-165`): `timecards, schedule_form, schedule_board, team_management, analytics, operator_profiles, completed_jobs, billing, customer_profiles, operations_hub, tenant_management, system_health, settings` (13 keys).

Presets live at `lib/rbac.ts:207-292`.

| Card key | super_admin | ops_mgr | admin | supervisor | salesman | inventory_mgr | operator | apprentice |
|---|---|---|---|---|---|---|---|---|
| timecards | full | full | view | view | none | view | none | none (missing) |
| schedule_form | full | full | submit | submit | submit | none | none | none |
| schedule_board | full | full | view | view | view | view | none | none |
| team_management | full | full | view | none | none | none | none | none |
| analytics | full | full | view | none | none | none | none | none |
| operator_profiles | full | full | view | none | none | none | none | none |
| completed_jobs | full | full | view | view | view | view | none | view |
| billing | full | full | view | none | none | view | none | none |
| customer_profiles | full | full | full | none | none | view | none | none |
| operations_hub | full | full | none | none | none | none | none | none |
| **tenant_management** | full | full | **MISSING** | **MISSING** | **MISSING** | **MISSING** | none | **MISSING** |
| **system_health** | full | full | **MISSING** | **MISSING** | **MISSING** | **MISSING** | none | **MISSING** |
| settings | full | full | none | none | none | none | none | none |

Preset keys that reference **non-existent cards** (orphan presets):
- `active_jobs` — used by supervisor, salesman, inventory_manager, apprentice. **Not in `ADMIN_CARDS`** (no card with key `active_jobs`).
- `customers` — used by supervisor, salesman, inventory_manager, apprentice. Actual card key is `customer_profiles`. **Typo / legacy mismatch.**
- `invoicing` — used by supervisor, salesman, inventory_manager, apprentice. Actual card key is `billing`. **Typo / legacy mismatch.**
- `notifications` — used by supervisor, salesman, inventory_manager, apprentice. **Not a card at all.**

`getCardPermission()` (`lib/rbac.ts:302-317`) falls back to `'none'` when a card key is missing from a preset, so users in those roles silently get **no access** to `tenant_management`, `system_health`, and the real `customer_profiles` / `billing` cards (because presets set `customers` and `invoicing` which don't match). This is the #1 behavior bug uncovered by this audit.

**Verdict: MISMATCH.** 2 cards have no preset coverage for 6 of 8 roles; 4 preset keys reference non-cards.

---

## 4. Seeding verdict

**Non-admins are NOT auto-seeded with their role preset.**

Evidence:
- `information_schema.triggers`: **zero** triggers on `user_feature_flags` and **zero** trigger functions reference it. Confirmed via `select ... from information_schema.triggers where event_object_table = 'user_feature_flags' or action_statement ilike '%user_feature_flags%'` → empty result.
- No migration file matches `*user_feature_flags*` under `supabase/migrations/` (the table exists in DB but the migration source is not in the repo — indicates manual creation or a historical migration that no longer carries the original name).
- The **only** server-side writers are:
  1. `PUT /api/admin/user-flags/[userId]` (`app/api/admin/user-flags/[userId]/route.ts:30-64`) — super_admin/ops_mgr manual toggle.
  2. `POST /api/setup-account/complete` (`app/api/setup-account/complete/route.ts:125-142`) — upserts **only** the `initial_flags` blob that the inviter optionally attached to the invitation. If the inviter left `initialFlags` empty (as is the case for most defaults), **no row is inserted at all.**
- No signup/OAuth flow, no `handle_new_user` trigger, no `on_auth_user_created` function touches `user_feature_flags`.
- Live DB: 5 profiles, only 2 `user_feature_flags` rows. Confirms most users have no row and fall back to `DEFAULT_FLAGS` at the client (`lib/feature-flags.ts:83`).

**Consequence:** When `useFeatureFlags()` runs for a non-bypass user with no row, the client hydrates with `DEFAULT_FLAGS` — which is everything-off except `can_request_schedule_changes`, `can_view_personal_hours`, `can_view_personal_metrics`. A `salesman`, `supervisor`, or `admin` role user who was never manually toggled will see **an almost-empty dashboard** despite `ROLE_PERMISSION_PRESETS` implying broader access. The presets in `lib/rbac.ts` drive the `ADMIN_CARDS` dashboard via `getCardPermission()` (which **does** fall back to the preset), but the sidebar/section-level flags from `useFeatureFlags()` do **not** consult `ROLE_PERMISSION_PRESETS` at all. The two systems are siloed.

---

## 5. PUT authorization

`app/api/admin/user-flags/[userId]/route.ts:30-40`:

```ts
const auth = await requireAdmin(request);
if (!auth.authorized) return auth.response;
if (!['super_admin', 'operations_manager'].includes(auth.role || '')) {
  return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
}
```

`requireAdmin` (`lib/api-auth.ts:29-78`) accepts `admin, super_admin, operations_manager, supervisor, salesman`, but the explicit second check narrows writers to super_admin + ops_manager. **Correct.**

GET (line 10) uses only `requireAdmin`, so any admin-tier user (including salesman/supervisor) can read **any other user's** flags within their tenant. This is lenient but tenant-scoped (line 19 filters `.eq('tenant_id', auth.tenantId)`). **Acceptable but worth flagging (P2):** a salesman can introspect a super_admin's flag toggles via this GET endpoint.

**Verdict: WRITER AUTH = CORRECT. READER AUTH = OVER-PERMISSIVE BUT TENANT-SCOPED.**

---

## Top 5 P0 Issues

### P0-1 — Non-admin users are stuck at DEFAULT_FLAGS (all off) until super_admin manually toggles them
**Files:** `app/api/setup-account/complete/route.ts:125-142`, `lib/feature-flags.ts:64-87`, no migration trigger exists.
**Effect:** Every newly invited `admin`, `salesman`, `supervisor`, `inventory_manager` user logs in and sees a dashboard with nothing enabled (because the invite rarely carries `initial_flags`). The operator hired yesterday cannot view their jobs until a super_admin opens Team Profiles and clicks Save.
**Fix proposal:** Add a Postgres trigger on `profiles` INSERT (or `auth.users` INSERT) that seeds `user_feature_flags` from a role→flags lookup. Alternatively, change `useFeatureFlags()` to hydrate from role-based defaults when the DB row is missing. The DB trigger is the durable fix. SQL draft below.

### P0-2 — `ROLE_PERMISSION_PRESETS` references 4 card keys that do not exist
**File:** `lib/rbac.ts:226-290`.
**Orphans:** `active_jobs`, `customers`, `invoicing`, `notifications`.
**Effect:** `supervisor`, `salesman`, `inventory_manager`, `apprentice` presets set permissions on non-cards. The actual cards they should be gating (`customer_profiles`, `billing`) are **not** in the preset, so `getCardPermission()` falls through to `'none'` — these roles get zero access to those cards regardless of intent.
**Fix proposal:** Rename `customers` → `customer_profiles`, `invoicing` → `billing`, delete `active_jobs` / `notifications` entries (or add corresponding cards).

### P0-3 — `tenant_management` and `system_health` cards are missing from every non-bypass preset
**File:** `lib/rbac.ts:210-291`, cards defined at `lib/rbac.ts:136-154`.
**Effect:** `admin` role cannot see these cards (fallthrough to `'none'`). Acceptable for tenant_management (super_admin only) but `system_health` should probably be viewable by `admin` / `operations_manager`. Explicit entries document intent; silent fallthrough hides it.
**Fix proposal:** Add explicit `tenant_management: 'none'` and `system_health: 'view'|'none'` entries in every preset so intent is auditable.

### P0-4 — `UserFeatureFlags` interface is duplicated in `FeatureFlagsPanel.tsx`
**File:** `components/FeatureFlagsPanel.tsx:5-26` redeclares the type instead of importing from `lib/feature-flags.ts:6-27`.
**Effect:** Two sources of truth. Adding a flag in one place without the other silently breaks `PUT` payload shape.
**Fix proposal:** `import type { UserFeatureFlags } from '@/lib/feature-flags';` and delete the local interface. Re-export `UserFeatureFlags` from the panel if needed for page consumers.

### P0-5 — Two parallel permission systems (flags vs. presets) are not reconciled
**Files:** `lib/feature-flags.ts` (boolean flags, per-user DB) vs. `lib/rbac.ts` (`PermissionLevel` presets, role-based in-memory).
**Effect:** Dashboard cards (driven by `getCardPermission` → presets) and sidebar/section visibility (driven by `useFeatureFlags` → DB row) can disagree: a user can see the "Billing" card preset-granted as `view` yet their `can_view_invoicing` flag is `false`. No code path fuses the two.
**Fix proposal:** Pick one canonical source. Options: (a) derive `UserFeatureFlags` from presets + overrides at read time, (b) have the writer compute presets-level answers from flags, or (c) document that flags gate sections while cards gate the dashboard and never the twain shall meet. Currently undocumented.

---

## SQL Migration Draft

### A) No schema columns are missing — all 20 `UserFeatureFlags` keys are present as DB columns (confirmed).

### B) Seed trigger so new users get their role preset

```sql
-- supabase/migrations/20260421000000_seed_user_feature_flags.sql

-- Role -> default flags mapping, mirrored from lib/rbac.ts ROLE_PERMISSION_PRESETS
-- but expressed in UserFeatureFlags boolean shape.
create or replace function public.seed_user_feature_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_type text := 'admin';
begin
  -- Super admins and ops managers bypass flags entirely; seed all-true for consistency.
  if NEW.role in ('super_admin', 'operations_manager') then
    insert into public.user_feature_flags (
      user_id, tenant_id, admin_type,
      can_create_schedule_forms, can_view_schedule_board, can_edit_schedule_board,
      can_request_schedule_changes, can_view_active_jobs, can_view_all_jobs,
      can_view_completed_jobs, can_view_timecards, can_view_customers,
      can_view_invoicing, can_view_analytics, can_view_facilities,
      can_view_nfc_tags, can_view_form_builder, can_manage_team,
      can_manage_settings, can_grant_super_admin,
      can_view_personal_hours, can_view_personal_metrics
    ) values (
      NEW.id, NEW.tenant_id, 'super_admin',
      true, true, true, true, true, true, true, true, true,
      true, true, true, true, true, true, true,
      NEW.role = 'super_admin', -- only super_admin can grant super_admin
      true, true
    )
    on conflict (user_id, tenant_id) do nothing;
    return NEW;
  end if;

  if NEW.role = 'admin' then
    insert into public.user_feature_flags (
      user_id, tenant_id, admin_type,
      can_create_schedule_forms, can_view_schedule_board, can_edit_schedule_board,
      can_request_schedule_changes, can_view_active_jobs, can_view_all_jobs,
      can_view_completed_jobs, can_view_timecards, can_view_customers,
      can_view_invoicing, can_view_analytics, can_view_facilities,
      can_view_nfc_tags, can_view_form_builder, can_manage_team,
      can_manage_settings, can_view_personal_hours, can_view_personal_metrics
    ) values (
      NEW.id, NEW.tenant_id, 'admin',
      true, true, true, true, true, true, true, true, true,
      true, true, true, true, true, true, true, true, true
    )
    on conflict (user_id, tenant_id) do nothing;
    return NEW;
  end if;

  if NEW.role in ('salesman', 'supervisor') then
    insert into public.user_feature_flags (
      user_id, tenant_id, admin_type,
      can_create_schedule_forms, can_view_schedule_board,
      can_request_schedule_changes, can_view_active_jobs,
      can_view_completed_jobs, can_view_customers,
      can_view_personal_hours, can_view_personal_metrics
    ) values (
      NEW.id, NEW.tenant_id, 'sales_admin',
      true, true, true, true, true, true, true, true
    )
    on conflict (user_id, tenant_id) do nothing;
    return NEW;
  end if;

  if NEW.role = 'inventory_manager' then
    insert into public.user_feature_flags (
      user_id, tenant_id, admin_type,
      can_view_schedule_board, can_view_active_jobs, can_view_completed_jobs,
      can_view_timecards, can_view_customers, can_view_invoicing,
      can_view_personal_hours, can_view_personal_metrics
    ) values (
      NEW.id, NEW.tenant_id, 'operations_admin',
      true, true, true, true, true, true, true, true
    )
    on conflict (user_id, tenant_id) do nothing;
    return NEW;
  end if;

  -- operator / apprentice / everyone else: personal metrics + active jobs only
  insert into public.user_feature_flags (
    user_id, tenant_id, admin_type,
    can_view_active_jobs, can_view_timecards,
    can_view_personal_hours, can_view_personal_metrics
  ) values (
    NEW.id, NEW.tenant_id,
    case when NEW.role = 'apprentice' then 'team_member' else 'operator' end,
    true, NEW.role = 'operator', true, true
  )
  on conflict (user_id, tenant_id) do nothing;
  return NEW;
end;
$$;

drop trigger if exists trg_seed_user_feature_flags on public.profiles;
create trigger trg_seed_user_feature_flags
after insert on public.profiles
for each row execute function public.seed_user_feature_flags();

-- Backfill existing profiles that are missing a flags row
insert into public.user_feature_flags (user_id, tenant_id, admin_type, can_view_personal_hours, can_view_personal_metrics)
select p.id, p.tenant_id, 'admin', true, true
from public.profiles p
left join public.user_feature_flags f on f.user_id = p.id and f.tenant_id = p.tenant_id
where f.id is null and p.tenant_id is not null
on conflict do nothing;
```

Note: backfill inserts bare rows; run a one-time script (or re-run the trigger manually) to apply per-role presets to existing users.

### C) (Optional) Add unique index if not present
Confirm `(user_id, tenant_id)` has a unique constraint (the upserts `onConflict: 'user_id,tenant_id'` require it). Verify with:
```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.user_feature_flags'::regclass
  and contype in ('u','p');
```

---

## 5-Line Summary

1. Type ↔ DB column parity is PERFECT — all 20 `UserFeatureFlags` keys exist as DB columns.
2. Toggle UI ↔ type parity is CLEAN — no orphan toggles; `admin_type` handled via presets.
3. `ROLE_PERMISSION_PRESETS` references 4 non-card keys (`active_jobs`, `customers`, `invoicing`, `notifications`) and omits `tenant_management` / `system_health` — causes silent `'none'` fallthrough for non-bypass roles.
4. **Seeding is BROKEN**: no DB trigger, no signup hook — non-bypass users are stuck at `DEFAULT_FLAGS` (almost everything off) until a super_admin manually toggles them in Team Profiles. Live DB shows 5 profiles, 2 flag rows.
5. PUT auth is correctly locked to super_admin + operations_manager; GET is readable by any admin-tier user within the tenant (P2).
