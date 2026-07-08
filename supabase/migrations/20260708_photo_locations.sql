-- GPS-stamped photos (founder ask Jul 8): coordinates captured at the moment an
-- operator takes a jobsite photo. Keyed by the photo's storage URL so NO
-- existing photo-array format changes anywhere (least-invasive design).
-- Applied to prod Jul 8 2026.
CREATE TABLE IF NOT EXISTS public.photo_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  job_id uuid REFERENCES public.job_orders(id) ON DELETE SET NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m double precision,
  captured_at timestamptz NOT NULL DEFAULT now(),
  taken_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_locations_url ON public.photo_locations(photo_url);
CREATE INDEX IF NOT EXISTS idx_photo_locations_tenant ON public.photo_locations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_photo_locations_job ON public.photo_locations(job_id) WHERE job_id IS NOT NULL;

ALTER TABLE public.photo_locations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY photo_locations_tenant_read ON public.photo_locations
    FOR SELECT USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Writes go through the service-role API route only (no client INSERT policy).
