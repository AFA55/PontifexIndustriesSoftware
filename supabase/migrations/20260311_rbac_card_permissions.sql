-- ============================================================
-- RBAC Card-Level Permissions Migration
-- ============================================================
-- Evolves user_card_permissions from boolean visible to 3-level permission
-- Adds supervisor role to profiles constraint
-- ============================================================

-- 1. Add permission_level column
ALTER TABLE public.user_card_permissions
  ADD COLUMN IF NOT EXISTS permission_level TEXT NOT NULL DEFAULT 'none';

-- 2. Add CHECK constraint for valid permission levels
ALTER TABLE public.user_card_permissions
  ADD CONSTRAINT valid_permission_level
  CHECK (permission_level IN ('none', 'view', 'full'));

-- 3. Migrate existing data: visible=true -> 'full', visible=false -> 'none'
UPDATE public.user_card_permissions
SET permission_level = CASE WHEN visible = true THEN 'full' ELSE 'none' END;

-- 4. Drop the old visible column
ALTER TABLE public.user_card_permissions DROP COLUMN IF EXISTS visible;

-- 5. Update profiles role constraint to include supervisor
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS valid_role;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

ALTER TABLE public.profiles ADD CONSTRAINT valid_role
  CHECK (role IN (
    'operator', 'apprentice', 'admin', 'super_admin',
    'salesman', 'inventory_manager', 'operations_manager', 'supervisor'
  ));
