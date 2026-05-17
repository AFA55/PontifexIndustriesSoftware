-- Phase C(iii): Fleet service history
-- vehicle_service_records tracks oil changes, inspections, repairs, etc.
-- References equipment.id (vehicles are equipment rows with kind='vehicle').
-- Service summary columns are added to the vehicles table (where other
-- vehicle-specific fields like odometer live).

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Core service records table
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_service_records (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES public.tenants(id),
  vehicle_id             uuid        NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  service_date           date        NOT NULL,
  service_type           text        NOT NULL CHECK (service_type IN (
                           'oil_change','filter','brake','tire','inspection','repair','other'
                         )),
  odometer_miles         integer,
  cost                   numeric(10,2),
  vendor                 text,
  notes                  text,
  performed_by           uuid        REFERENCES public.profiles(id),
  maintenance_request_id uuid,
  created_by             uuid        REFERENCES public.profiles(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ──────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS vsr_vehicle_date ON public.vehicle_service_records (vehicle_id, service_date DESC);
CREATE INDEX IF NOT EXISTS vsr_tenant       ON public.vehicle_service_records (tenant_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vehicle_service_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "vsr_read" ON public.vehicle_service_records
    FOR SELECT USING (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role(
        'admin','super_admin','operations_manager',
        'shop_manager','shop_help','supervisor'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "vsr_write" ON public.vehicle_service_records
    FOR ALL USING (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role(
        'admin','super_admin','operations_manager','shop_manager'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. updated_at trigger
-- ──────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS vsr_updated_at ON public.vehicle_service_records;
CREATE TRIGGER vsr_updated_at
  BEFORE UPDATE ON public.vehicle_service_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Service summary columns on vehicles table
--    (vehicle-specific data lives here alongside odometer, expiry dates, etc.)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS last_service_date      date,
  ADD COLUMN IF NOT EXISTS last_service_odometer  integer,
  ADD COLUMN IF NOT EXISTS next_oil_change_miles  integer;
