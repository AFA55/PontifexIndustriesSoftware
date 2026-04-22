-- 20260421120000_seed_user_feature_flags_by_role.sql
-- Auto-seed user_feature_flags rows when profiles are created or their role changes.
-- Prior to this migration, new profiles never got a flags row, so non-admin users
-- fell back to the all-false DEFAULT_FLAGS. Super admins had to toggle every switch
-- manually for every hire.

-- -----------------------------------------------------------------------------
-- Helper: seed_user_feature_flags_for_role
-- -----------------------------------------------------------------------------
-- Inserts a user_feature_flags row sized to the role's baseline permissions.
-- ON CONFLICT (user_id, tenant_id) DO NOTHING so it is safe to call repeatedly.
-- The helper is SECURITY DEFINER so RLS on user_feature_flags does not block
-- the trigger when a new profile row is inserted by an unprivileged session.

CREATE OR REPLACE FUNCTION public.seed_user_feature_flags_for_role(
  p_user_id uuid,
  p_tenant_id uuid,
  p_role text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- flag defaults; overridden per role below
  f_can_create_schedule_forms      boolean := false;
  f_can_view_schedule_board        boolean := false;
  f_can_edit_schedule_board        boolean := false;
  f_can_request_schedule_changes   boolean := false;
  f_can_view_active_jobs           boolean := false;
  f_can_view_all_jobs              boolean := false;
  f_can_view_completed_jobs        boolean := false;
  f_can_view_timecards             boolean := false;
  f_can_view_customers             boolean := false;
  f_can_view_invoicing             boolean := false;
  f_can_view_analytics             boolean := false;
  f_can_view_facilities            boolean := false;
  f_can_view_nfc_tags              boolean := false;
  f_can_view_form_builder          boolean := false;
  f_can_manage_team                boolean := false;
  f_can_manage_settings            boolean := false;
  f_can_grant_super_admin          boolean := false;
  f_can_view_personal_hours        boolean := true;
  f_can_view_personal_metrics      boolean := true;
  f_admin_type                     text    := 'admin';
BEGIN
  IF p_user_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  IF p_role IN ('super_admin', 'operations_manager') THEN
    -- Full access baseline (these roles bypass flag checks, but store true for
    -- completeness so direct DB reads match the app's in-memory SUPER_ADMIN_FLAGS).
    f_can_create_schedule_forms    := true;
    f_can_view_schedule_board      := true;
    f_can_edit_schedule_board      := true;
    f_can_request_schedule_changes := true;
    f_can_view_active_jobs         := true;
    f_can_view_all_jobs            := true;
    f_can_view_completed_jobs      := true;
    f_can_view_timecards           := true;
    f_can_view_customers           := true;
    f_can_view_invoicing           := true;
    f_can_view_analytics           := true;
    f_can_view_facilities          := true;
    f_can_view_nfc_tags            := true;
    f_can_view_form_builder        := true;
    f_can_manage_team              := true;
    f_can_manage_settings          := true;
    f_can_grant_super_admin        := true;
    f_admin_type                   := 'super_admin';

  ELSIF p_role = 'admin' THEN
    -- Admin: everything except super-admin-only capabilities.
    f_can_create_schedule_forms    := true;
    f_can_view_schedule_board      := true;
    f_can_edit_schedule_board      := true;
    f_can_request_schedule_changes := true;
    f_can_view_active_jobs         := true;
    f_can_view_all_jobs            := true;
    f_can_view_completed_jobs      := true;
    f_can_view_timecards           := true;
    f_can_view_customers           := true;
    f_can_view_invoicing           := true;
    f_can_view_analytics           := false; -- super-admin-only per spec
    f_can_view_facilities          := true;
    f_can_view_nfc_tags            := true;
    f_can_view_form_builder        := true;
    f_can_manage_team              := true;
    f_can_manage_settings          := true;
    f_can_grant_super_admin        := false;
    f_admin_type                   := 'admin';

  ELSIF p_role = 'salesman' THEN
    f_can_create_schedule_forms    := true;
    f_can_view_schedule_board      := true;
    f_can_request_schedule_changes := true;
    f_can_view_active_jobs         := true;
    f_can_view_completed_jobs      := true;
    f_can_view_customers           := true;
    f_can_view_invoicing           := true;
    f_admin_type                   := 'salesman';

  ELSIF p_role = 'supervisor' THEN
    -- Supervisor = salesman + timecards visibility.
    f_can_create_schedule_forms    := true;
    f_can_view_schedule_board      := true;
    f_can_request_schedule_changes := true;
    f_can_view_active_jobs         := true;
    f_can_view_completed_jobs      := true;
    f_can_view_customers           := true;
    f_can_view_invoicing           := true;
    f_can_view_timecards           := true;
    f_admin_type                   := 'supervisor';

  ELSIF p_role IN ('shop_manager', 'inventory_manager') THEN
    f_can_view_schedule_board      := true;
    f_can_view_facilities          := true;
    f_can_view_nfc_tags            := true;
    f_can_view_active_jobs         := true;
    f_can_view_timecards           := true;
    f_admin_type                   := p_role;

  ELSIF p_role IN ('operator', 'apprentice') THEN
    -- Field staff: only personal metrics. Everything else false.
    f_admin_type                   := p_role;

  ELSE
    -- Unknown role — fall back to minimal (personal-only) defaults.
    f_admin_type                   := COALESCE(p_role, 'unknown');
  END IF;

  INSERT INTO public.user_feature_flags (
    user_id,
    tenant_id,
    can_create_schedule_forms,
    can_view_schedule_board,
    can_edit_schedule_board,
    can_request_schedule_changes,
    can_view_active_jobs,
    can_view_all_jobs,
    can_view_completed_jobs,
    can_view_timecards,
    can_view_customers,
    can_view_invoicing,
    can_view_analytics,
    can_view_facilities,
    can_view_nfc_tags,
    can_view_form_builder,
    can_manage_team,
    can_manage_settings,
    can_grant_super_admin,
    can_view_personal_hours,
    can_view_personal_metrics,
    admin_type,
    updated_at
  ) VALUES (
    p_user_id,
    p_tenant_id,
    f_can_create_schedule_forms,
    f_can_view_schedule_board,
    f_can_edit_schedule_board,
    f_can_request_schedule_changes,
    f_can_view_active_jobs,
    f_can_view_all_jobs,
    f_can_view_completed_jobs,
    f_can_view_timecards,
    f_can_view_customers,
    f_can_view_invoicing,
    f_can_view_analytics,
    f_can_view_facilities,
    f_can_view_nfc_tags,
    f_can_view_form_builder,
    f_can_manage_team,
    f_can_manage_settings,
    f_can_grant_super_admin,
    f_can_view_personal_hours,
    f_can_view_personal_metrics,
    f_admin_type,
    now()
  )
  ON CONFLICT (user_id, tenant_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.seed_user_feature_flags_for_role(uuid, uuid, text) IS
  'Idempotently inserts a user_feature_flags row matching the role preset. ON CONFLICT DO NOTHING so existing rows (possibly with manual overrides) are preserved.';

-- -----------------------------------------------------------------------------
-- Helper: reset_user_feature_flags_for_role
-- -----------------------------------------------------------------------------
-- Used by the AFTER UPDATE OF role trigger. When a profile's role changes, we
-- want to realign the flags to the new role's preset — UNLESS the user's flags
-- were manually edited recently. Heuristic: if user_feature_flags.updated_at is
-- within the last 30 days, preserve the manual overrides (a super admin touched
-- them recently and likely wants to keep their customization). Otherwise, reset.

CREATE OR REPLACE FUNCTION public.reset_user_feature_flags_for_role(
  p_user_id uuid,
  p_tenant_id uuid,
  p_role text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_updated_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT updated_at INTO v_existing_updated_at
  FROM public.user_feature_flags
  WHERE user_id = p_user_id AND tenant_id = p_tenant_id;

  IF v_existing_updated_at IS NULL THEN
    -- No row yet — delegate to the seeder.
    PERFORM public.seed_user_feature_flags_for_role(p_user_id, p_tenant_id, p_role);
    RETURN;
  END IF;

  IF v_existing_updated_at > (now() - interval '30 days') THEN
    -- Recent manual override — leave it alone.
    RETURN;
  END IF;

  -- Stale row: delete and reseed to the new role's preset.
  DELETE FROM public.user_feature_flags
  WHERE user_id = p_user_id AND tenant_id = p_tenant_id;

  PERFORM public.seed_user_feature_flags_for_role(p_user_id, p_tenant_id, p_role);
END;
$$;

COMMENT ON FUNCTION public.reset_user_feature_flags_for_role(uuid, uuid, text) IS
  'On role change: keep manual flag overrides if they were touched in the last 30 days, otherwise reset to the new role preset.';

-- -----------------------------------------------------------------------------
-- Triggers on profiles
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_profiles_seed_feature_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_user_feature_flags_for_role(NEW.id, NEW.tenant_id, NEW.role);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_profiles_reset_feature_flags_on_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.reset_user_feature_flags_for_role(NEW.id, NEW.tenant_id, NEW.role);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_seed_feature_flags ON public.profiles;
CREATE TRIGGER profiles_seed_feature_flags
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.tg_profiles_seed_feature_flags();

DROP TRIGGER IF EXISTS profiles_reset_feature_flags_on_role_change ON public.profiles;
CREATE TRIGGER profiles_reset_feature_flags_on_role_change
AFTER UPDATE OF role ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.tg_profiles_reset_feature_flags_on_role_change();

-- -----------------------------------------------------------------------------
-- Backfill: seed any existing profile without a flags row.
-- -----------------------------------------------------------------------------

DO $backfill$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.id, p.tenant_id, p.role
    FROM public.profiles p
    LEFT JOIN public.user_feature_flags ufl
      ON ufl.user_id = p.id AND ufl.tenant_id = p.tenant_id
    WHERE ufl.user_id IS NULL
      AND p.tenant_id IS NOT NULL
  LOOP
    PERFORM public.seed_user_feature_flags_for_role(r.id, r.tenant_id, r.role);
  END LOOP;
END;
$backfill$;
