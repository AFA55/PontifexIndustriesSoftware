# Agent G — Permission-Flag CONSUMER Audit

**Scope:** Verify every UI surface that gates on `user_feature_flags` row correctly shows/hides based on what a super_admin sets in Team Profiles → Permissions (`components/FeatureFlagsPanel.tsx`).

**Context of upstream fix:** `app/api/admin/user-flags/[userId]/route.ts` GET was switched from `requireAdmin` → `requireAuth` (commit `857f2527` on parallel branch). **Not yet merged into this worktree** — currently still `requireAdmin` at line 10. Everything below assumes the fix is in place; where it isn't, flagged sidebars for salesman/supervisor/inventory_manager will silently fall back to `DEFAULT_FLAGS` (all false).

---

## Summary Table

| Flag | Primary Consumer(s) | Page-Level Guard | Sidebar Link | Status |
|---|---|---|---|---|
| `can_view_schedule_board` | `app/dashboard/admin/schedule-board/page.tsx:298` | ✅ redirects if false | ❌ no `flagKey` on Schedule Board sidebar item (`DashboardSidebar.tsx:66`) | ⚠️ partial |
| `can_edit_schedule_board` | `schedule-board/page.tsx:169` (`canEdit` gate) | ✅ read-only mode | N/A (in-page) | ✅ wired |
| `can_create_schedule_forms` | — none found — | ❌ missing | ❌ Schedule Form sidebar item has no `flagKey` (`DashboardSidebar.tsx:68`) | ❌ broken |
| `can_request_schedule_changes` | — none found in gating UI — | ❌ missing | — | ❌ broken |
| `can_view_active_jobs` | — only sidebar — | ❌ no guard in `active-jobs/page.tsx` | ✅ `flagKey` set | ⚠️ partial |
| `can_view_all_jobs` | `FeatureFlagsPanel.tsx:230` (label only) | ❌ no API filter enforced in UI reads | ❌ | ❌ broken |
| `can_view_completed_jobs` | — only sidebar — | ❌ no guard in `completed-jobs/page.tsx` (only role check) | ✅ | ⚠️ partial |
| `can_view_timecards` | `timecards/page.tsx:147` | ✅ redirects if false | ✅ | ✅ wired |
| `can_view_customers` | — only sidebar — | ❌ no guard in `customers/page.tsx` (role check only, blocks supervisor/inventory_manager!) | ✅ | ⚠️ partial |
| `can_view_invoicing` | — only sidebar — | ❌ no guard in `billing/page.tsx` (role check only, blocks salesman/supervisor/inventory_manager) | ✅ | ❌ broken |
| `can_view_analytics` | — only sidebar — | ❌ no guard in `analytics` (role check only) | ✅ | ⚠️ partial |
| `can_view_facilities` | — only sidebar — | ❌ no guard in `facilities/page.tsx` (role check blocks salesman/supervisor) | ✅ | ⚠️ partial |
| `can_view_nfc_tags` | — only sidebar — | ❌ no guard in `settings/nfc-tags/page.tsx` (role check: super_admin/ops/admin only) | ✅ | ⚠️ partial |
| `can_view_form_builder` | — only sidebar — | ❌ no guard in `form-builder/page.tsx` (role check: super/ops/admin only) | ✅ | ⚠️ partial |
| `can_manage_team` | — only sidebar — | ❌ no guard in `team-profiles/page.tsx` — hard-coded `['super_admin','operations_manager','admin']` (`team-profiles/page.tsx:679`) | ✅ | ❌ broken |
| `can_manage_settings` | — only sidebar — | ❌ `settings/page.tsx:46` hard-blocks anyone except super_admin / ops_manager regardless of flag | ✅ | ❌ broken |
| `can_grant_super_admin` | `team-profiles/page.tsx:517` uses `isSuperAdmin` only, NOT the flag | N/A | — | ❌ broken |
| `can_view_personal_hours` | — no consumer found — | N/A | — | ❌ dead flag |
| `can_view_personal_metrics` | — no consumer found — | N/A | — | ❌ dead flag |
| `admin_type` | `FeatureFlagsPanel.tsx` preset selector only | — | — | ✅ wired (cosmetic) |

**Also:** Admin dashboard cards (`lib/rbac.ts` `ADMIN_CARDS`) are defined but **not rendered anywhere** in `app/dashboard/admin/page.tsx`. That page uses hard-coded KPI tiles + `ADMIN_DASHBOARD_ROLES` check only. `getCardPermission()` and `ROLE_PERMISSION_PRESETS` from `lib/rbac.ts` are effectively orphaned on the current admin home.

---

## Top 5 P0 Issues

### P0-1 — `/dashboard/admin/team-profiles` ignores `can_manage_team`
**File:** `app/dashboard/admin/team-profiles/page.tsx:678-683`
```ts
const adminRoles = ['super_admin', 'operations_manager', 'admin'];
if (!adminRoles.includes(role)) { router.push('/dashboard/admin'); return; }
```
A salesman or supervisor with `can_manage_team=true` toggled on gets bounced. The sidebar link is flag-gated (correct), but the page enforces role only. **Fix:** replace the role check with `useFeatureFlags` guard that allows when `flags.can_manage_team === true` OR role ∈ BYPASS_ROLES.

### P0-2 — `/dashboard/admin/settings` ignores `can_manage_settings`
**File:** `app/dashboard/admin/settings/page.tsx:46-47`
```ts
if (user.role !== 'super_admin' && user.role !== 'operations_manager') {
  router.push('/dashboard');
```
Admin role with `can_manage_settings=true` is redirected. **Fix:** allow through if `flags.can_manage_settings` or bypass role.

### P0-3 — `/dashboard/admin/billing` ignores `can_view_invoicing`
**File:** `app/dashboard/admin/billing/page.tsx:109-110`
```ts
if (!['admin', 'super_admin', 'operations_manager'].includes(currentUser.role)) {
  router.push('/dashboard'); return;
```
Sidebar shows Invoicing link to salesman/supervisor/inventory_manager when flag is on, but clicking redirects them. **Fix:** add flag check before role fallback.

### P0-4 — Schedule Board & Schedule Form sidebar items missing `flagKey`
**File:** `components/DashboardSidebar.tsx:66` (Schedule Board), `:68` (Schedule Form)
```ts
{ label: 'Schedule Board', href: '/dashboard/admin/schedule-board', icon: Calendar }, // no flagKey
{ label: 'Schedule Form', href: '/dashboard/admin/schedule-form', icon: FileEdit },    // no flagKey
```
These two links always render regardless of `can_view_schedule_board` / `can_create_schedule_forms`. The schedule-board page itself guards correctly (`schedule-board/page.tsx:298`), so the link shows but redirects — broken UX. **Fix:** add `flagKey: 'can_view_schedule_board'` and `flagKey: 'can_create_schedule_forms'` respectively.

### P0-5 — `can_grant_super_admin` flag is ignored; only `isSuperAdmin` gates the Grant button
**File:** `app/dashboard/admin/team-profiles/page.tsx:517`
```ts
const canGrant = isSuperAdmin && !isOwnProfile && member.role !== 'super_admin';
```
The FeatureFlagsPanel exposes `can_grant_super_admin` as a toggle, but no consumer reads it — granting is hard-locked to super_admin role. Either remove the flag from the UI panel (`FeatureFlagsPanel.tsx:73`) or wire it here. Likely desired: `const canGrant = (isSuperAdmin || flags.can_grant_super_admin) && ...`.

---

## P1 Nice-to-Haves

- **`can_view_active_jobs`**: `app/dashboard/admin/active-jobs/page.tsx:59` only filters by role `adminRoles`. Add feature-flag guard so an admin with the flag toggled off can't navigate directly.
- **`can_view_completed_jobs`**: `completed-jobs/page.tsx:88` role check only; add flag guard.
- **`can_view_customers`**: `customers/page.tsx:55` blocks supervisor and inventory_manager even though sidebar gates on flag. Unify.
- **`can_view_analytics`**: `analytics/_components/AnalyticsDashboardContent.tsx:111` uses `ALLOWED_ROLES`; doesn't consult flag.
- **`can_view_facilities`**: `facilities/page.tsx:670` blocks non-admin roles; ignore flag.
- **`can_view_nfc_tags`**: `settings/nfc-tags/page.tsx:79` role-only.
- **`can_view_form_builder`**: `form-builder/page.tsx:79` role-only.
- **`can_view_all_jobs`**: No consumer found — it should influence job-list queries (`/api/admin/jobs?assignedTo=me` vs all). Currently every consumer likely shows all jobs or all assigned-to-me depending on route. Verify `/api/admin/active-jobs-summary` and `/api/admin/dashboard-summary` honor it.
- **`can_view_personal_hours`** & **`can_view_personal_metrics`**: zero consumers. Either wire into operator dashboard metrics widgets or drop from schema to reduce noise.
- **`can_request_schedule_changes`**: The "Request Change" UI on schedule board job cards should check this flag; currently grep shows no consumer. Likely means the button is always visible.
- **`ADMIN_CARDS` orphaned**: `lib/rbac.ts` defines a full dashboard-card permission system with `getCardPermission()`, but `app/dashboard/admin/page.tsx` doesn't use it. Either render cards from `ADMIN_CARDS` filtered by `getCardPermission`, or delete the array.
- **`operations_hub` / `tenant_management` / `system_health` cards** in `ADMIN_CARDS` have no corresponding flag — super_admin-only pages should probably be listed in `superAdminOnly` sidebar items instead (currently only `subscription` is).
- **Missing merge of upstream fix**: `app/api/admin/user-flags/[userId]/route.ts:10` still reads `requireAdmin`. Pull `857f2527` into this worktree or the entire audit above is moot for non-admin roles.
- **`components/InviteMemberModal.tsx`**: hard-codes per-role flag presets (`:34-110`) that overlap but don't match `FeatureFlagsPanel.tsx` `ADMIN_TYPE_PRESETS` nor `lib/rbac.ts` `ROLE_PERMISSION_PRESETS`. Three sources of truth for "what does salesman get by default." Consolidate.
- **Two `UserFeatureFlags` type declarations** (`lib/feature-flags.ts:6` and `components/FeatureFlagsPanel.tsx:5`) — drift risk. Import from one place.

---

## Summary Counts

- 20 flags defined in `UserFeatureFlags`
- 2 fully wired end-to-end (`can_view_timecards`, `can_edit_schedule_board`)
- 11 sidebar-only (link hides, page doesn't guard) → redirect-loop risk
- 5 broken (missing consumer or guard contradicts flag)
- 2 dead flags with no consumer at all
