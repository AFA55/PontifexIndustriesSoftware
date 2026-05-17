-- Add shop GPS location fields to tenants so each tenant can configure their own
-- shop pin for GPS clock-in/clock-out radius checks.
-- When NULL, the application falls back to the hardcoded constants in lib/geolocation.ts.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS shop_latitude           double precision,
  ADD COLUMN IF NOT EXISTS shop_longitude          double precision,
  ADD COLUMN IF NOT EXISTS shop_name               text,
  ADD COLUMN IF NOT EXISTS clock_in_radius_meters  integer,
  ADD COLUMN IF NOT EXISTS clock_out_radius_meters integer;

COMMENT ON COLUMN public.tenants.shop_latitude          IS 'GPS latitude of the tenant shop/yard. NULL → falls back to lib/geolocation SHOP_LOCATION.';
COMMENT ON COLUMN public.tenants.shop_longitude         IS 'GPS longitude of the tenant shop/yard. NULL → falls back to lib/geolocation SHOP_LOCATION.';
COMMENT ON COLUMN public.tenants.shop_name              IS 'Human-readable shop name shown in GPS error messages.';
COMMENT ON COLUMN public.tenants.clock_in_radius_meters IS 'Allowed GPS radius in meters for clock-in. NULL → uses ALLOWED_RADIUS_METERS (30.48m / 100ft).';
COMMENT ON COLUMN public.tenants.clock_out_radius_meters IS 'Allowed GPS radius in meters for clock-out. NULL → uses ALLOWED_RADIUS_CLOCKOUT_METERS (30.48m / 100ft).';
