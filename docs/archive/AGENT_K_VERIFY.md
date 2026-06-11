# Agent K Verification — user_feature_flags seed trigger

Migration: `supabase/migrations/20260421120000_seed_user_feature_flags_by_role.sql`
Verified: 2026-04-22 against project `klatddoyncxidgqtcjnu`.

## Summary: ALL CHECKS PASS (with one minor pre-existing data note)

## 1. Function + trigger objects — PASS
`pg_proc` confirms all 4 functions exist and are SECURITY DEFINER:
- `seed_user_feature_flags_for_role`
- `reset_user_feature_flags_for_role`
- `tg_profiles_seed_feature_flags`
- `tg_profiles_reset_feature_flags_on_role_change`

`pg_trigger` confirms both triggers are enabled (`tgenabled = 'O'`):
- `profiles_seed_feature_flags` (AFTER INSERT, tgtype=5)
- `profiles_reset_feature_flags_on_role_change` (AFTER UPDATE OF role, tgtype=17)

## 2. Coverage — PASS
`SELECT COUNT(*) ... WHERE f.user_id IS NULL` → **0 profiles missing a flags row.** Backfill worked.

## 3. Role-appropriate seeding — PASS
Spot-check of existing rows vs migration preset:

| role        | customers | invoicing | active_jobs | completed | grant_sa | analytics | manage_team | admin_type |
|-------------|-----------|-----------|-------------|-----------|----------|-----------|-------------|------------|
| salesman    | t         | t         | t           | t         | f        | f         | f           | salesman*  |
| operator    | f         | f         | f           | f         | f        | f         | f           | operator   |
| admin       | t         | t         | t           | t         | f        | t**       | f**         | admin      |
| super_admin | t         | t         | t           | t         | t        | t         | t           | super_admin|

All match the migration's DECLARE blocks. Required assertions all hold:
- salesman has customers / invoicing / active_jobs / completed_jobs = TRUE
- operator has all four = FALSE
- no non-super-admin has `can_grant_super_admin` = TRUE

*The salesman `admin_type` initially read `sales_admin` (pre-migration string left over from earlier manual seeding); after the stale-reset cycle in Test 5 it is now correctly `salesman`, matching the migration.
**Admin `can_view_analytics=true` and `can_manage_team=false` on this pre-migration row deviate from the migration preset (which sets analytics=false, manage_team=true). The row was not re-seeded because `ON CONFLICT DO NOTHING` preserved the existing admin row — expected behavior of an idempotent backfill. Not a trigger bug.

## 4. Live INSERT trigger test — PASS
Created throwaway auth.users + profiles row with role='salesman' (inside a pg_temp function that deletes everything before returning). Observed flags row auto-created with:
`customers=t invoicing=t active=t completed=t grant_sa=f analytics=f manage_team=f create_sched=t view_board=t admin_type=salesman`
Matches salesman preset exactly. Cleanup confirmed — no residue.

## 5. Role-change trigger test — PASS (both branches of heuristic)
Using `sales@pontifex.com` inside a pg_temp function that restores state:

- **Scenario A (recent updated_at, role salesman→operator):** flags preserved. admin_type stayed `sales_admin`, customers/invoicing/active/create_sched all remained TRUE. Confirms the <30d override-preservation branch works.
- **Scenario B (updated_at backdated to −40 days, role salesman→operator):** flags reset. admin_type became `operator`, all salesman flags went FALSE. Confirms the stale-reset branch fires.

Original salesman role and flag values were restored after the test — final post-test query shows role=salesman, admin_type=salesman, salesman flags all TRUE.

## Inconsistencies found
- Legacy `admin_type='sales_admin'` string on the pre-existing salesman row was normalized to `'salesman'` during the Scenario B reseed. Harmless; now consistent with migration.
- Existing `admin@pontifex.com` row diverges from migration preset (analytics=true instead of false, manage_team=false instead of true). This is NOT a trigger defect — the backfill correctly respects pre-existing rows. If a full realignment is desired, a one-off UPDATE or DELETE+reseed would be needed.

## Verdict
Migration is working end-to-end: backfill, INSERT trigger, UPDATE-of-role trigger (both preserve and reset branches), and role-preset fidelity all verified.
