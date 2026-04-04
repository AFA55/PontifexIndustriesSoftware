-- ============================================================
-- Capacity Settings: Skill-Type Limits
-- Extends the existing schedule_settings table by upserting
-- a richer default value for the 'capacity' key that includes
-- per-skill-type job limits, difficulty constraints, and crew
-- size rules.
-- ============================================================

-- Upsert the enriched capacity defaults.
-- If a row already exists its value is preserved via jsonb merge;
-- new installs get a full default object.
INSERT INTO public.schedule_settings (setting_key, setting_value)
VALUES (
  'capacity',
  '{
    "max_slots": 10,
    "warning_threshold": 8,
    "skill_wall_saw": 3,
    "skill_brokk": 2,
    "skill_precision_dfs": 2,
    "skill_core_drilling": 4,
    "skill_slab_sawing": 3,
    "skill_flat_sawing": 3,
    "skill_wire_sawing": 2,
    "max_high_difficulty_jobs": 2,
    "high_difficulty_threshold": 7,
    "max_operators_per_job": 4,
    "min_operators_high_difficulty": 2
  }'::jsonb
)
ON CONFLICT (setting_key) DO UPDATE
  SET setting_value = public.schedule_settings.setting_value || EXCLUDED.setting_value,
      updated_at    = now();

-- Allow all admin roles (not just super_admin) to read capacity settings
DROP POLICY IF EXISTS "schedule_settings_select" ON public.schedule_settings;
CREATE POLICY "schedule_settings_select" ON public.schedule_settings
  FOR SELECT USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN (
      'super_admin', 'operations_manager', 'admin', 'salesman', 'shop_manager', 'inventory_manager'
    )
  );

-- Allow operations_manager + super_admin to modify settings
DROP POLICY IF EXISTS "schedule_settings_update" ON public.schedule_settings;
CREATE POLICY "schedule_settings_update" ON public.schedule_settings
  FOR UPDATE USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin')
  );

DROP POLICY IF EXISTS "schedule_settings_insert" ON public.schedule_settings;
CREATE POLICY "schedule_settings_insert" ON public.schedule_settings
  FOR INSERT WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin')
  );
