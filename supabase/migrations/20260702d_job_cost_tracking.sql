-- Optional per-job financial tracking, connected to the existing job_pnl_summary
-- view + the already-present (but previously unused) cost columns on job_orders
-- (equipment_cost, fuel_cost, material_cost, other_cost, subcontractor_cost).
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS track_financials boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS drive_distance_miles numeric,
  ADD COLUMN IF NOT EXISTS mileage_rate numeric;

-- Tenant-level cost "standards" — defaults that pre-fill a job's optional
-- financial section; the admin can override per job. Mirrors the existing
-- per-tenant settings pattern (clock_in_radius_meters, default_start_time).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_mileage_rate numeric,
  ADD COLUMN IF NOT EXISTS default_equipment_cost numeric,
  ADD COLUMN IF NOT EXISTS default_other_cost numeric;
