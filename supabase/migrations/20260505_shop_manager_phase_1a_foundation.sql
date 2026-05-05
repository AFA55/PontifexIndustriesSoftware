-- Phase 1A foundation: extend equipment, create vehicles + equipment_checkouts, add work_location.
-- The equipment table already exists from a prior feature with 4 rows of test data.
-- We ALTER it (additive only) and widen the legacy CHECK constraints; we never drop old columns.

-- ───────────────────────── equipment (ALTER) ─────────────────────────
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS asset_tag text;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS short_name text;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS unit_number text;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS aliases jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS power_source text;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS requires_maintenance_schedule boolean NOT NULL DEFAULT false;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS current_job_order_id uuid REFERENCES public.job_orders(id) ON DELETE SET NULL;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS reserved_for_job_id uuid REFERENCES public.job_orders(id) ON DELETE SET NULL;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS reserved_until timestamptz;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS hour_meter numeric DEFAULT 0;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS photo_url text;

ALTER TABLE public.equipment DROP CONSTRAINT IF EXISTS equipment_status_check;
ALTER TABLE public.equipment ADD CONSTRAINT equipment_status_check
  CHECK (status IN ('available','assigned','reserved','in_use','pending_putaway','maintenance','in_maintenance','out_of_service','retired'));

ALTER TABLE public.equipment DROP CONSTRAINT IF EXISTS equipment_kind_check;
ALTER TABLE public.equipment ADD CONSTRAINT equipment_kind_check
  CHECK (kind IS NULL OR kind IN ('powered','hand_tool','accessory','vehicle','trailer'));

ALTER TABLE public.equipment DROP CONSTRAINT IF EXISTS equipment_power_source_check;
ALTER TABLE public.equipment ADD CONSTRAINT equipment_power_source_check
  CHECK (power_source IS NULL OR power_source IN ('diesel','gas','hydraulic','electric','pneumatic'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_asset_tag ON public.equipment(tenant_id, asset_tag) WHERE asset_tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_kind ON public.equipment(kind);
CREATE INDEX IF NOT EXISTS idx_equipment_status_v2 ON public.equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_reserved_job ON public.equipment(reserved_for_job_id) WHERE reserved_for_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_current_job ON public.equipment(current_job_order_id) WHERE current_job_order_id IS NOT NULL;

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "equipment_tenant_read_v2" ON public.equipment
    FOR SELECT
    USING (tenant_id = public.current_user_tenant_id() OR public.current_user_role() = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "equipment_admin_write_v2" ON public.equipment
    FOR ALL
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager','shop_manager')
      AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id())
    )
    WITH CHECK (
      public.current_user_has_role('admin','super_admin','operations_manager','shop_manager')
      AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────── vehicles (CREATE) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  equipment_id uuid REFERENCES public.equipment(id) ON DELETE CASCADE UNIQUE NOT NULL,
  vin text,
  license_plate text,
  year int,
  fuel_type text,
  odometer numeric DEFAULT 0,
  registration_expiry date,
  insurance_expiry date,
  inspection_expiry date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON public.vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_equipment ON public.vehicles(equipment_id);

CREATE OR REPLACE FUNCTION public.vehicles_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER set_vehicles_updated_at BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_set_updated_at();

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "vehicles_tenant_read" ON public.vehicles
    FOR SELECT USING (tenant_id = public.current_user_tenant_id() OR public.current_user_role() = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "vehicles_admin_write" ON public.vehicles
    FOR ALL
    USING (public.current_user_has_role('admin','super_admin','operations_manager','shop_manager') AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id()))
    WITH CHECK (public.current_user_has_role('admin','super_admin','operations_manager','shop_manager') AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────── equipment_checkouts (CREATE) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.equipment_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  equipment_id uuid REFERENCES public.equipment(id) ON DELETE CASCADE NOT NULL,
  custodian_id uuid REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  job_order_id uuid REFERENCES public.job_orders(id) ON DELETE SET NULL,
  truck_equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL,
  checked_out_at timestamptz NOT NULL DEFAULT now(),
  checked_out_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_in_at timestamptz,
  checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hour_meter_out numeric,
  hour_meter_in numeric,
  notes text,
  voice_note_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkouts_tenant ON public.equipment_checkouts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_checkouts_equipment ON public.equipment_checkouts(equipment_id, checked_out_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkouts_open ON public.equipment_checkouts(equipment_id) WHERE checked_in_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checkouts_custodian ON public.equipment_checkouts(custodian_id, checked_out_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkouts_job ON public.equipment_checkouts(job_order_id) WHERE job_order_id IS NOT NULL;

ALTER TABLE public.equipment_checkouts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "checkouts_tenant_read" ON public.equipment_checkouts
    FOR SELECT USING (tenant_id = public.current_user_tenant_id() OR public.current_user_role() = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "checkouts_admin_write" ON public.equipment_checkouts
    FOR ALL
    USING (public.current_user_has_role('admin','super_admin','operations_manager','shop_manager','supervisor') AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id()))
    WITH CHECK (public.current_user_has_role('admin','super_admin','operations_manager','shop_manager','supervisor') AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────── timecards.work_location ─────────────────────────
ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS work_location text NOT NULL DEFAULT 'field'
  CHECK (work_location IN ('field','shop'));

CREATE INDEX IF NOT EXISTS idx_timecards_date_location ON public.timecards(date, work_location);

COMMENT ON COLUMN public.timecards.work_location IS
  'Where the user was working that day. Set at clock-in; team members rotating to shop pick "shop". Drives whether they see operator or shop-help dashboard.';
