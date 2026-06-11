# Agent L Verification Report — Sales User Feature-Flag Gating

**Date:** 2026-04-22
**Tester:** Verification agent (salesman login flow)
**Preview server:** http://localhost:60707 (serverId d5f2d62f-e1cd-4943-be6f-620d45bd3fc6)
**Salesman user:** `sales@pontifex.com` (id `91e8e8ac-990b-4c53-8fd5-2d3564474c83`, tenant `ee3d8081-...`)

## TL;DR
Gating **partially works**, with **one confirmed regression** and **one behavioral anomaly**.

- Page-level guards correctly block `team-profiles`, `settings`, `billing` (all redirect out).
- Sidebar correctly hides `team-profiles`, `settings`, `billing`, `timecards`, `analytics`, `facilities`, `nfc`, `form_builder`.
- **Regression**: `GET /api/admin/user-flags/:userId` returns **401 Unauthorized** on first load (the exact bug Agent L was supposed to have fixed).
- **Anomaly**: Even though the first fetch 401s and client flags stay at DEFAULT (all `false`), the sidebar still renders Schedule Board + Schedule Form. Per `components/DashboardSidebar.tsx:349` the filter is `flags[item.flagKey] !== false`, which with `false` flag values should hide them — so one of the two items is showing contrary to the flag logic. Net effect is harmless for the salesman (they're entitled to both) but indicates the gate isn't deterministic.

## Environment setup blockers hit
- Worktree was missing `.env.local` (per CLAUDE.md this is expected). Initial login failed with `fetch failed` and `NEXT_PUBLIC_SUPABASE_URL is not set`. Copied `.env.local` from main repo → new preview server started on port 60707 → login succeeded.

## Sidebar items seen vs expected

**Seen (salesman, viewport 1440×900, `/dashboard/admin`):**
```
OPERATIONS
  - Dashboard
  - Schedule Board
  - Schedule Form
ADMIN
  - Notifications
```
(Active Jobs, Timecards, Team Profiles, Customers, Invoicing, Completed Jobs, Facilities, NFC Tags, Form Builder, Settings, Analytics, Billing/subscription — all hidden)

**Expected per salesman `ROLE_PERMISSION_PRESETS` (`lib/rbac.ts:248-253`):** `schedule_form`, `schedule_board`, `customer_profiles`, `completed_jobs` — note: *no* `billing` and *no* `active_jobs` card key exists in that preset.

**Expected per DB-stored user flags (API returns 200 when called with valid bearer):**
```
can_create_schedule_forms: true
can_view_schedule_board: true
can_view_active_jobs: true
can_view_customers: true
can_view_completed_jobs: true
can_view_invoicing: true
(all others false)
```
So the salesman *should* also see Active Jobs, Customers, Invoicing, Completed Jobs — they do not.

**Why not:** initial sidebar render fetched `/api/admin/user-flags/:userId` before Supabase client produced a session; server saw no `Authorization` header and returned 401. `useFeatureFlags` swallowed the failure, leaving state at `DEFAULT_FLAGS`. Effect only re-runs when `userId`/`role` change, so the flags never refresh. Sampling the live React fiber on `<SidebarContent>` confirms: `flagsLoading: false`, `flags.can_view_schedule_board: false`, all other `can_view_*` also `false`.

React fiber snapshot (live):
```json
{ "flagsLoading": false, "board": false, "cust": false, "inv": false }
```
Manual refetch with proper bearer token returned `200` with full correct flag payload, so the API itself works — the race is in the client hook.

## Gated page navigation results

| Path | Expected | Observed |
|---|---|---|
| `/dashboard/admin/schedule-form` | load | loads (H1 "Schedule Form") ✓ |
| `/dashboard/admin/schedule-board` | load | redirects to `/dashboard/admin` ✗ (should load per salesman preset + flag) |
| `/dashboard/admin/team-profiles` | redirect (no `can_manage_team`) | redirects to `/dashboard/admin` ✓ |
| `/dashboard/admin/settings` | redirect (no `can_manage_settings`) | redirects to `/dashboard` (operator view) ✓ |
| `/dashboard/admin/billing` | load per flag `can_view_invoicing: true` | redirects to `/dashboard` ✗ (stricter than flag) |

Schedule Board and Billing redirecting is a **likely additional regression** — the page-level guards may still be using role-only checks rather than the feature flag.

## Network / console

- Failed requests observed:
  - `GET /api/admin/user-flags/91e8e8ac-990b-4c53-8fd5-2d3564474c83` → **401** (initial render; repeated on reload)
  - `GET /api/admin/active-jobs-summary` → **500** (unrelated to flag gating; tenant-scope or query bug)
- No red console errors related to flags/auth after Supabase env was fixed.

## Toggle test
Skipped — admin credential toggle path not exercised because the salesman-side regression is already diagnostic.

## Screenshots
Captured in-session via `preview_screenshot`. Full-sidebar desktop view shows the 4 visible nav items listed above. No on-disk path saved (Bash mkdir was denied).

## Recommended fixes
1. **Race in `lib/feature-flags.ts`**: wait for Supabase session before firing fetch, or retry on 401 after a short delay. Today any first-page render before `supabase.auth.getSession()` resolves silently degrades to DEFAULT_FLAGS with no recovery.
2. **Investigate Schedule Board page-level guard** — it redirects despite salesman having the flag AND the role entry in the preset. Check `app/dashboard/admin/schedule-board/page.tsx` role array.
3. **Investigate Billing page-level guard** — flag grants access but page redirects. Either page-level check is role-only (salesman not listed) or intentionally stricter than the flag. Reconcile.
4. **Sidebar filter determinism**: with DEFAULT_FLAGS (all false) the sidebar should show *zero* gated items, but currently shows Schedule Board + Schedule Form. Trace why those slip through the `flags[item.flagKey] !== false` filter.
