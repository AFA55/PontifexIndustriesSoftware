# Feature Catalog — Pontifex Industries Platform

**Purpose:** The plug-and-play map. Every sellable FEATURE MODULE in the app, with its surface (routes, APIs, tables), the roles that use it, and — most importantly — **how it is gated TODAY**. The founder uses this to decide what a new client's tenant gets turned on.

**Status:** DOCUMENTATION ONLY. Nothing here changes behavior. It is the inventory that the [`PRODUCTIZATION_SWITCHBOARD_PLAN.md`](PRODUCTIZATION_SWITCHBOARD_PLAN.md) builds the per-tenant switchboard on top of.

> Companion docs: [`PRODUCTIZATION_PLAYBOOK.md`](PRODUCTIZATION_PLAYBOOK.md) (strategy), [`PRODUCTIZATION_SWITCHBOARD_PLAN.md`](PRODUCTIZATION_SWITCHBOARD_PLAN.md) (the build plan), `scripts/new-tenant.ts` (onboarding scaffold).

---

## 0. The gating layers that exist today (READ THIS FIRST)

There are **four** independent gating mechanisms in the live app. The switchboard must compose with all of them, not replace them. Understanding the difference is the whole game.

| # | Layer | Where | Scope | Status |
|---|---|---|---|---|
| 1 | **`user_feature_flags`** | `lib/feature-flags.ts` → `useFeatureFlags()` → consumed in `components/DashboardSidebar.tsx:79-148` (`flagKey`) | **Per USER** (e.g. `can_view_timecards`). Resolved via `GET /api/admin/user-flags/[userId]`. Super_admin/ops_manager/supervisor get hard-coded presets (`lib/feature-flags.ts:54-67`). | **ACTIVE — this is the primary nav gate today.** |
| 2 | **RBAC cards** | `lib/rbac.ts` — `ADMIN_CARDS[]` (`:34`), `ROLE_PERMISSION_PRESETS` (`:320`), `getCardPermission()` (`:394`) | **Per ROLE** (+ optional per-user override). Drives Team Management permission editor + a few API checks. | **ACTIVE.** Note: `getCardPermission` is consumed by `team-management` UI + `api/admin/schedule-board/dispatch`; the dashboard nav itself uses layer 1, not this. |
| 3 | **`tenants.features` jsonb** | `public.tenants.features` column. Patriot row = `{schedule_board, timecards, facilities, billing, nfc, customer_crm, analytics}` (all true). | **Per TENANT.** | **DORMANT — stored & editable (`/api/admin/tenants/[id]` PATCH allows `features`), but NOT read for any UI/route gating yet.** This is the column the switchboard will activate. |
| 4 | **`tenant_branding.show_*_module` booleans** | `lib/branding-context.tsx:37-41` (`show_billing_module`, `show_analytics_module`, `show_inventory_module`, `show_nfc_module`, `show_customer_crm`). Edited in `app/dashboard/admin/settings/branding/page.tsx:529-537`. | **Per TENANT** (subset). | **DORMANT — stored, surfaced in `useBranding()`, editable in Settings → Branding, but NOT consumed by any gate.** Partial/legacy overlap with layer 3. |

**Implication for the switchboard:** Layer 3 (`tenants.features`) is the canonical home for the module switchboard. Layers 1 & 2 stay as the role/user gate *within* an enabled module. Layer 4 is legacy duplication to be folded into layer 3 (see plan). **A module is visible to a user only if BOTH the tenant has it enabled (layer 3) AND the user's role/flags allow it (layers 1/2).** Tenant-gate is additive AND — it can only *hide*, never *grant*.

### Verified DB facts (live project `klatddoyncxidgqtcjnu`, queried 2026-06-04)
- `tenants.features` **column default** = `{nfc, billing, analytics, inventory, customer_crm, ai_scheduling}` — **does NOT match** the Patriot row's actual keys (`schedule_board, timecards, facilities, billing, nfc, customer_crm, analytics`). Key vocabulary is already inconsistent. The registry in the plan must define the canonical key set and a normalizer. **(Risk — see plan §Risks.)**
- A **second tenant already exists**: `Apex Sawing & Drilling` (`company_code=APEX`, `id=ade00000-…`) with the *default* feature set. So the live system is already multi-tenant; the new-tenant script must guard **PATRIOT specifically**, not assume single-tenant.
- `profiles` columns relevant to onboarding: `id, email, full_name, role, tenant_id` (no `is_active`/`status` column).
- `tenant_branding` is keyed by `tenant_id` and carries the dormant `show_*_module` flags.

---

## 1. Module inventory

Legend for **Current gating**:
- **Always-on** — no flag gates it; ships to every tenant/role that can reach the route.
- **flag:`x`** — gated by `user_feature_flags` key `x` (layer 1) in the sidebar.
- **rbac:`key`** — has an `ADMIN_CARDS` entry `key` (layer 2).
- **role:[…]** — sidebar `roles`/`excludeRoles` restriction (layer 1 mechanism).
- **tenants.features:`k`** — a key that EXISTS in `tenants.features` today (layer 3, dormant).
- **branding:`show_*`** — a dormant layer-4 toggle exists.

| # | Module key (proposed canonical) | One-line | Primary pages | Primary APIs | Owns tables (representative) | Roles | Current gating |
|---|---|---|---|---|---|---|---|
| 1 | `scheduling` | Schedule board + 8-step schedule form + dispatch + daily assignments | `/dashboard/admin/schedule-board`, `/dashboard/admin/schedule-form`, `/dashboard/admin/upcoming-projects` | `/api/admin/schedule-board/*`, `/api/admin/schedule-form*`, `/api/admin/send-schedule`, `/api/admin/schedule-contacts` | `job_daily_assignments`, `schedule_*`, `operator_row_notes` | admin, salesman, supervisor, ops, super | flag:`can_view_schedule_board` + `can_create_schedule_forms`; rbac:`schedule_board`/`schedule_form`; tenants.features:`schedule_board` |
| 2 | `jobs` | Active jobs, job detail, daily logs, work-performed gate | `/dashboard/admin/active-jobs`, `/dashboard/admin/jobs`, `/dashboard/my-jobs` | `/api/admin/jobs/*`, `/api/admin/active-jobs*`, `/api/job-orders`, `/api/jobs` | `job_orders`, `daily_job_logs`, `job_status_history`, `work_items` | all field + office | flag:`can_view_active_jobs`; rbac:`active_jobs` (preset key); largely **always-on core** (operator workflow depends on it) |
| 3 | `change_orders` | Auto-numbered `CO-NNN` change orders on a job | (tab inside Job Detail) | `/api/admin/jobs/[id]/change-orders`, `/api/admin/job-change-requests` | `change_orders` | admin, ops, super | Always-on within `jobs` (no dedicated flag) |
| 4 | `timecards` | Clock-in/out (GPS+NFC), payroll grid, lunch rules, PTO, late tracking | `/dashboard/admin/timecards`, `/dashboard/timecard`, `/dashboard/admin/time-off` | `/api/admin/timecards*`, `/api/time-clock`, `/api/timecard*`, `/api/admin/time-off`, `/api/admin/timecard-settings`, `/api/admin/pay-config` | `timecards`, `operator_pto_balance`, `time_off_*`, `timecard_settings` | operators, shop, supervisor, admins | flag:`can_view_timecards`; rbac:`timecards`; tenants.features:`timecards` |
| 5 | `nfc` | NFC tag clock-in/out + tag management | `/dashboard/admin/settings/nfc-tags`, `/dashboard/admin/nfc-management` | `/api/admin/nfc-tags` | `nfc_tags` | admin, ops, super | flag:`can_view_nfc_tags`; tenants.features:`nfc`; branding:`show_nfc_module` |
| 6 | `billing` | Invoices, PDF, QuickBooks CSV export, billing milestones | `/dashboard/admin/billing`, `/dashboard/admin/billing-milestones` | `/api/admin/billing*`, `/api/admin/invoices`, `/api/billing` | `invoices`, `invoice_line_items`, `billing_milestones` | admin, inventory_manager, ops, super | flag:`can_view_invoicing`; rbac:`billing`; tenants.features:`billing`; branding:`show_billing_module` |
| 7 | `subscription_billing` | Stripe self-serve subscription + paywall (the SaaS meta-billing) | `/dashboard/admin/subscription`, `/pricing` | `/api/stripe/*`, `/api/create-offer-checkout`, `/api/webhooks/stripe` | `tenants.stripe_*`, `subscription_*` | super_admin | role-gated (`superAdminOnly` in sidebar `:146`); hidden in native app. **Platform-level — keep always-on for owner.** |
| 8 | `customer_crm` | Customer profiles, contacts, job history | `/dashboard/admin/customers` | `/api/admin/customers`, `/api/admin/schedule-contacts` | `customers`, `customer_contacts` | admin, salesman, supervisor, ops, super | flag:`can_view_customers`; rbac:`customer_profiles`; tenants.features:`customer_crm`; branding:`show_customer_crm` |
| 9 | `customer_portal` | Public signature pages, surveys, form builder, portal links | `/dashboard/admin/form-builder` + public portal routes | `/api/admin/portal-links`, `/api/admin/form-templates`, `/api/public/*`, `/api/liability-release`, `/api/service-completion-agreement` | `form_templates`, `portal_links`, signature/consent tables | admin, ops, super (public for customers) | flag:`can_view_form_builder` (builder only); public pages always-on |
| 10 | `completed_jobs` | Completed job tickets, signatures, feedback, labor metrics | `/dashboard/admin/completed-jobs`, `/dashboard/admin/completed-job-tickets` | `/api/admin/jobs` (completed filter), `/api/admin/operator-reports` | `job_orders` (completed), feedback tables | most office roles | flag:`can_view_completed_jobs`; rbac:`completed_jobs` |
| 11 | `facilities_badging` | Facility CRUD + operator badge tracking + auto-expiry | `/dashboard/admin/facilities` | `/api/admin/facilities`, `/api/admin/badges` | `facilities`, `operator_facility_badges` | admin, ops, super | flag:`can_view_facilities`; tenants.features:`facilities` |
| 12 | `equipment_fleet` | Equipment + fleet CRUD, asset tags, custodian tracking | `/dashboard/admin/equipment`, `/dashboard/admin/fleet` | `/api/admin/equipment/*`, `/api/admin/fleet/*` | `equipment`, `equipment_units`, `fleet*` | shop_manager, admin, ops, super | role:[shop_manager,admin,super,ops]; rbac:`equipment`/`fleet`; tenants.features:`inventory` |
| 13 | `inventory_control` | Unified inventory page: checkout / check-in / history, truck custodian | `/dashboard/admin/inventory-control` | `/api/admin/equipment-checkouts`, `/api/inventory` | `equipment_checkouts`, location tables | shop_manager, supervisor, admin, ops, super | role-gated; tenants.features:`inventory`; branding:`show_inventory_module` |
| 14 | `voice_checkout` | Voice-driven equipment checkout (speech + audio audit + alias learning) | `/dashboard/admin/equipment/voice` (+ in inventory-control) | `/api/admin/equipment-checkouts/voice-note-upload`, equipment alias APIs | `voice_recognition_corrections`, `equipment_checkouts.voice_note_url` | shop_manager, supervisor, shop_help | rbac:`voice_checkout` (preset `submit`) |
| 15 | `maintenance` | Maintenance inbox — triage operator-submitted equipment issues | `/dashboard/admin/maintenance`, `/dashboard/maintenance` | `/api/admin/maintenance-requests`, `/api/maintenance-requests` | `maintenance_requests` | shop_manager, admin, ops, super | role:[shop_manager,admin,super,ops]; rbac:`maintenance` |
| 16 | `shop_tasks` | Pre-use checks + delegated shop-helper tasks | (redirects to maintenance) | `/api/admin/shop`, `/api/shop` | `shop_tasks` | shop_help, shop_manager | rbac:`shop_tasks` (route currently redirects to maintenance) |
| 17 | `supervisor_visits` | Site-visit reports on field operators | `/dashboard/admin/site-visits`, `/site-visits/new` | `/api/admin/supervisor-visits`, `/api/admin/operators/[id]/active-jobs` | `supervisor_visits` | supervisor, admin, ops, super | role:[supervisor,…]; rbac:`site_visits` |
| 18 | `skills_scheduling` | Operator skills taxonomy + smart skill-match scheduling | (Team Profiles tab; Approve-Job modal) | `/api/admin/team-profiles/[id]/skills`, `/api/admin/schedule-board/skill-match` | `profiles.skill_levels` (jsonb), `skill_categories` | admin, ops, super | Always-on within scheduling; tenants.features:`ai_scheduling` (default-only key) |
| 19 | `notifications` | In-app + email + APNs push, auto-reminders, NotificationBell | `/dashboard/admin/notifications`, `/dashboard/notifications` | `/api/notifications`, `/api/push*`, `/api/send-email`, `/api/send-sms`, `/api/notification-preferences` | `notifications`, `notification_settings`, `push_tokens` | all | **always-on core** (no flag); `notifications` is a sidebar item without `flagKey` (`:144`) |
| 20 | `peer_ratings` | Team performance reviews + operator/peer rating forms | `/dashboard/admin/peer-ratings` | `/api/admin/rating-forms`, `/api/operator-ratings`, `/api/ratings` | `rating_forms`, `operator_ratings` | admin, ops, super | rbac:`peer_ratings` |
| 21 | `analytics` | Revenue dashboards, P&L, operator performance, KPIs | `/dashboard/admin/analytics`, `/dashboard/admin/job-pnl` | `/api/admin/analytics*`, `/api/admin/job-pnl`, `/api/admin/commission` | (reads across modules) | admin, ops, super | flag:`can_view_analytics`; rbac:`analytics`; tenants.features:`analytics`; branding:`show_analytics_module` |
| 22 | `team_management` | Team directory, access requests, role + per-card permission editor | `/dashboard/admin/team-management`, `/dashboard/admin/team-profiles`, `/dashboard/admin/operator-profiles` | `/api/admin/team-profiles`, `/api/admin/user-flags`, `/api/admin/role-permissions`, `/api/access-requests` | `profiles`, `user_feature_flags`, `access_requests` | admin, ops, super | flag:`can_manage_team`; rbac:`team_management`. **CORE — gates the other gates; keep always-on.** |
| 23 | `daily_reports` | Operator daily report flow | `/dashboard/daily-report` | `/api/operator`, `/api/work-items` | `daily_job_logs`, report tables | operators | Always-on (operator workflow) |
| 24 | `silica_jha` | Silica exposure plans + job hazard analysis + liability/agreements | (within job/compliance flows) | `/api/silica-plan`, `/api/job-hazard-analysis`, `/api/work-order-agreement`, `/api/consent` | `silica_plans`, `jha_*`, agreement tables | operators, admins | Always-on within compliance |

**Module count: 24.**

### Platform-core modules (NEVER add to the tenant switchboard — disabling them breaks the app)
- `team_management` (#22) — it administers users/flags; turning it off would lock out admins.
- `notifications` (#19) — used cross-module for reminders/approvals.
- `subscription_billing` (#7) — this is how YOU bill the tenant; owner-only, platform meta.
- `jobs` (#2) + `daily_reports` (#23) — the operator execution spine; almost everything reads `job_orders`.

These four (five) are documented here so the switchboard registry can mark them `core: true` (always-on, not toggleable).

---

## 2. Cross-module dependencies (so a disabled module can't break a live one)

The CLAUDE.md non-negotiable "a disabled module's absence must not break others" requires guarding these reads:

- `billing` reads completed `job_orders` → depends on `jobs`.
- `analytics` (#21) reads across `jobs`, `timecards`, `billing` → if any are off, analytics tiles must degrade, not crash.
- `scheduling` skill-match (#18) reads `profiles.skill_levels` → soft dependency on `skills_scheduling`.
- `voice_checkout` / `inventory_control` depend on `equipment_fleet` tables → bundle them or enforce dependency in the registry.
- `supervisor_visits` auto-pulls a field operator's active jobs → depends on `jobs`.
- `customer_portal` signature pages reference `job_orders` + `customers` → depends on `jobs` + `customer_crm`.

The registry in the plan encodes these as `dependsOn: [...]` so the switchboard UI can prevent enabling a module without its prerequisites (or auto-enable them).

---

## 3. How a tenant is created today (baseline the onboarding script extends)

- `POST /api/admin/tenants` (`app/api/admin/tenants/route.ts:39`) — super_admin only. Inserts `name, slug, domain, plan, max_users, max_jobs_per_month, owner_id, billing_email, status`. **It does NOT set `company_code` (required for login!) or `features`** — so a tenant created via this API today cannot be logged into and has no module config. The onboarding script (`scripts/new-tenant.ts`) closes that gap.
- `PATCH /api/admin/tenants/[id]` (`:47`) allowed fields include `features` — so per-tenant module flags can already be written; nothing reads them yet.
- Company-code login resolves the tenant via `supabase.rpc('lookup_tenant_by_code')` (migration `20260521_public_tenant_lookup_fn`). A new tenant MUST have a unique `company_code` matching `^[A-Z0-9_]{3,20}$` (CHECK constraint from `20260328_multi_tenant_foundation.sql`).
- Branding is a separate row in `tenant_branding` (keyed by `tenant_id`), read client-side by `BrandingProvider` via `/api/admin/branding`.

---

## 4. Source citations (verified file:line)

- `lib/rbac.ts:34` `ADMIN_CARDS`; `:320` `ROLE_PERMISSION_PRESETS`; `:394` `getCardPermission`; `:288` `BYPASS_ROLES`.
- `lib/feature-flags.ts:7` `UserFeatureFlags`; `:69` `useFeatureFlags`; `:54` super-admin preset; `:59` supervisor preset.
- `components/DashboardSidebar.tsx:73-149` `NAV_SECTIONS` (the live nav gate); `:389-409` the flag/role filter.
- `lib/branding-context.tsx:37-41` dormant `show_*_module` booleans; `:44` `DEFAULT_BRANDING`.
- `app/api/admin/tenants/route.ts:39` POST create; `app/api/admin/tenants/[id]/route.ts:60` PATCH allowed fields (incl. `features`).
- `supabase/migrations/20260328_multi_tenant_foundation.sql` — tenants `company_code`, Patriot seed with `features` jsonb, `tenant_id` on all tables.
- Live DB (`klatddoyncxidgqtcjnu`): `tenants.features` default `{nfc,billing,analytics,inventory,customer_crm,ai_scheduling}`; Patriot row keys `{schedule_board,timecards,facilities,billing,nfc,customer_crm,analytics}`; second tenant `APEX` exists; `profiles` has `id,email,full_name,role,tenant_id`.
