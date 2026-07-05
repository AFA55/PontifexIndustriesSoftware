-- Security hardening (advisor: anon/authenticated_security_definer_function_executable).
-- 29 server-only functions locked to service_role (triggers don't check caller
-- EXECUTE). Deliberately untouched: lookup_tenant_by_code (login page, pre-auth)
-- and the RLS helpers (is_admin, is_admin_or_ops_manager, current_user_role,
-- current_user_has_role, current_user_tenant_id, get_current_tenant_id) which
-- MUST stay executable by authenticated for every RLS policy to work.
-- Applied to prod Jul 5 2026. Full statement list mirrors the applied migration
-- 'lock_down_server_only_functions' (29 x REVOKE FROM PUBLIC, anon, authenticated
-- + GRANT TO service_role) for these functions:
--   advance_operator_workflow, archive_completed_job, assign_equipment_from_inventory,
--   auto_approve_timecard, auto_color_code_job, auto_expire_badges,
--   calculate_operator_payroll, calculate_timecard_hours, calculate_timecard_labor_cost,
--   checkout_equipment, delete_job_order_cascade, ensure_current_pay_period,
--   flag_missing_info, generate_invoice_number, generate_job_ticket_data,
--   generate_schedule_data, get_database_stats, increment_contractor_standby,
--   next_invoice_number, nfc_clock_in, reset_user_feature_flags_for_role,
--   seed_user_feature_flags_for_role, set_daily_log_day_number,
--   sync_role_to_auth_metadata, tg_profiles_reset_feature_flags_on_role_change,
--   tg_profiles_seed_feature_flags, trigger_timecard_clock_out,
--   update_blade_total_usage, upsert_equipment_recommendation
-- Idempotent re-run block:
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'advance_operator_workflow','archive_completed_job','assign_equipment_from_inventory',
      'auto_approve_timecard','auto_color_code_job','auto_expire_badges',
      'calculate_operator_payroll','calculate_timecard_hours','calculate_timecard_labor_cost',
      'checkout_equipment','delete_job_order_cascade','ensure_current_pay_period',
      'flag_missing_info','generate_invoice_number','generate_job_ticket_data',
      'generate_schedule_data','get_database_stats','increment_contractor_standby',
      'next_invoice_number','nfc_clock_in','reset_user_feature_flags_for_role',
      'seed_user_feature_flags_for_role','set_daily_log_day_number',
      'sync_role_to_auth_metadata','tg_profiles_reset_feature_flags_on_role_change',
      'tg_profiles_seed_feature_flags','trigger_timecard_clock_out',
      'update_blade_total_usage','upsert_equipment_recommendation')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END $$;
