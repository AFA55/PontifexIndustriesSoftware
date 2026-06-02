-- 20260601_fix_timecard_lunch_role_aware.sql
-- APPLIED TO PROD via Supabase MCP on 2026-06-01.
--
-- Bug: the live clock-out trigger (on_timecard_clock_out -> calculate_timecard_hours)
-- deducted a FLAT 30 min at a 5h threshold, reading the key/value `timecard_settings`
-- table and IGNORING profiles.default_lunch_minutes and the shop-60/field-30 rule.
-- This contradicted lib/lunch.ts and the "Auto-deducts ... when a shift exceeds 6h"
-- text in the Edit Time Entry modal, so admins saw lunch "not deducting" as configured.
--
-- Fix: make the function role-aware and align the threshold to 6h:
--   lunch_minutes = profiles.default_lunch_minutes
--                   ELSE (shop_manager/shop_help = 60, else 30)
--   threshold     = 6h (timecard_settings.auto_lunch_threshold_hours bumped 5 -> 6)
--   default_lunch_minutes = 0 is respected (user opted out of lunch)
--   manual breaks in timecard_breaks still take precedence over auto-lunch
-- CREATE OR REPLACE only; no trigger added/removed; affects future recalcs only.

UPDATE timecard_settings
   SET setting_value = '6'
 WHERE setting_key = 'auto_lunch_threshold_hours';

CREATE OR REPLACE FUNCTION public.calculate_timecard_hours(p_timecard_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_timecard RECORD;
  v_role TEXT;
  v_profile_lunch INTEGER;
  v_gross_hours NUMERIC;
  v_lunch_minutes INTEGER;
  v_manual_breaks INTEGER;
  v_lunch_threshold NUMERIC;
  v_role_lunch_default INTEGER;
  v_auto_lunch_enabled BOOLEAN;
  v_net_hours NUMERIC;
  v_regular NUMERIC;
  v_overtime NUMERIC;
  v_double_time NUMERIC;
  v_ot_daily NUMERIC;
  v_dt_daily NUMERIC;
  v_result JSONB;
BEGIN
  SELECT * INTO v_timecard FROM timecards WHERE id = p_timecard_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Timecard not found');
  END IF;

  SELECT (setting_value)::boolean INTO v_auto_lunch_enabled
    FROM timecard_settings WHERE setting_key = 'auto_lunch_enabled';
  SELECT (setting_value)::numeric INTO v_lunch_threshold
    FROM timecard_settings WHERE setting_key = 'auto_lunch_threshold_hours';
  SELECT (setting_value)::numeric INTO v_ot_daily
    FROM timecard_settings WHERE setting_key = 'overtime_daily_threshold';
  SELECT (setting_value)::numeric INTO v_dt_daily
    FROM timecard_settings WHERE setting_key = 'double_time_daily_threshold';

  v_auto_lunch_enabled := COALESCE(v_auto_lunch_enabled, true);
  v_lunch_threshold := COALESCE(v_lunch_threshold, 6);
  v_ot_daily := COALESCE(v_ot_daily, 8);
  v_dt_daily := COALESCE(v_dt_daily, 12);

  SELECT role, default_lunch_minutes INTO v_role, v_profile_lunch
    FROM profiles WHERE id = v_timecard.user_id;
  v_role_lunch_default := CASE WHEN v_role IN ('shop_manager','shop_help') THEN 60 ELSE 30 END;
  v_lunch_minutes := COALESCE(v_profile_lunch, v_role_lunch_default);

  IF v_timecard.clock_out_time IS NULL THEN
    RETURN jsonb_build_object('error', 'Clock-out time not set');
  END IF;

  v_gross_hours := EXTRACT(EPOCH FROM (v_timecard.clock_out_time - v_timecard.clock_in_time)) / 3600.0;

  SELECT COALESCE(SUM(duration_minutes), 0) INTO v_manual_breaks
    FROM timecard_breaks WHERE timecard_id = p_timecard_id;

  IF v_manual_breaks > 0 THEN
    v_lunch_minutes := v_manual_breaks;
  ELSIF v_auto_lunch_enabled AND v_lunch_minutes > 0 AND v_gross_hours >= v_lunch_threshold THEN
    INSERT INTO timecard_breaks (timecard_id, break_type, start_time, end_time, duration_minutes, is_auto_applied)
    VALUES (
      p_timecard_id,
      'lunch',
      v_timecard.clock_in_time + (v_lunch_threshold * INTERVAL '1 hour'),
      v_timecard.clock_in_time + (v_lunch_threshold * INTERVAL '1 hour') + (v_lunch_minutes * INTERVAL '1 minute'),
      v_lunch_minutes,
      true
    );
  ELSE
    v_lunch_minutes := 0;
  END IF;

  v_net_hours := GREATEST(v_gross_hours - (v_lunch_minutes::numeric / 60.0), 0);

  IF v_net_hours > v_dt_daily THEN
    v_double_time := v_net_hours - v_dt_daily;
    v_overtime := v_dt_daily - v_ot_daily;
    v_regular := v_ot_daily;
  ELSIF v_net_hours > v_ot_daily THEN
    v_double_time := 0;
    v_overtime := v_net_hours - v_ot_daily;
    v_regular := v_ot_daily;
  ELSE
    v_double_time := 0;
    v_overtime := 0;
    v_regular := v_net_hours;
  END IF;

  UPDATE timecards SET
    gross_hours = ROUND(v_gross_hours, 2),
    net_hours = ROUND(v_net_hours, 2),
    regular_hours = ROUND(v_regular, 2),
    overtime_hours = ROUND(v_overtime, 2),
    double_time_hours = ROUND(v_double_time, 2),
    total_hours = ROUND(v_net_hours, 2),
    lunch_duration_minutes = v_lunch_minutes,
    auto_lunch_applied = (v_lunch_minutes > 0 AND v_manual_breaks = 0),
    is_overnight = (v_timecard.clock_out_time::date > v_timecard.clock_in_time::date),
    updated_at = now()
  WHERE id = p_timecard_id;

  v_result := jsonb_build_object(
    'gross_hours', ROUND(v_gross_hours, 2),
    'lunch_deducted_minutes', v_lunch_minutes,
    'net_hours', ROUND(v_net_hours, 2),
    'regular_hours', ROUND(v_regular, 2),
    'overtime_hours', ROUND(v_overtime, 2),
    'double_time_hours', ROUND(v_double_time, 2),
    'auto_lunch_applied', (v_lunch_minutes > 0 AND v_manual_breaks = 0),
    'is_overnight', (v_timecard.clock_out_time::date > v_timecard.clock_in_time::date)
  );

  RETURN v_result;
END;
$function$;
