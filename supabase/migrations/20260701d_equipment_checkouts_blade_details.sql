-- Adds blade_details jsonb to equipment_checkouts so blade/bit checkouts can
-- carry manual-entry sticker data (serial number, size, spec) + a photo path,
-- without needing a separate table. NULL for non-blade equipment.
-- Shape: { serial_number, size, spec, photo_url }
--
-- Applied directly to production via Supabase MCP on 2026-07-01 (additive,
-- idempotent). This file documents it in the migration history.

ALTER TABLE public.equipment_checkouts ADD COLUMN IF NOT EXISTS blade_details jsonb;

COMMENT ON COLUMN public.equipment_checkouts.blade_details IS
  'Manual-entry blade sticker data captured at checkout time: { serial_number, size, spec, photo_url }. photo_url is a storage path in the private "blade-checkout-photos" bucket, resolved to a signed URL server-side at read time (see lib/signed-urls.ts). NULL for non-blade equipment. v1 is manual entry only — OCR auto-extraction is out of scope.';

NOTIFY pgrst, 'reload schema';
