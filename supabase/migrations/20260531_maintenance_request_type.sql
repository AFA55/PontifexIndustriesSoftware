-- Adds repair/replace classification to maintenance_requests so that:
--   • operator-reported issues  → request_type 'repair'
--   • supervisor 'maintenance'   → request_type 'repair'
--   • supervisor 'replace'       → request_type 'replace'
-- all live in the single maintenance_requests inbox the shop manager triages.
-- Additive + idempotent.

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'repair';

DO $$
BEGIN
  ALTER TABLE public.maintenance_requests
    ADD CONSTRAINT maintenance_requests_request_type_check
    CHECK (request_type IN ('repair','replace'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
