-- blade-checkout-photos storage bucket: sticker photos captured at blade/bit
-- checkout time (manual entry v1 — no OCR). PRIVATE bucket, same access model
-- as timecard-photos (see 20260622_timecard_photos_bucket.sql): NO storage RLS
-- policies. All access is server-side via supabaseAdmin (service_role bypasses
-- RLS) — uploads go through /api/admin/equipment-checkouts/blade-photo-upload
-- (requireAuth + tenant path prefix), reads are short-lived signed URLs minted
-- server-side via lib/signed-urls.ts. A bucket-only `authenticated` policy would
-- NOT be tenant-scoped and would let any authenticated user from any tenant
-- read/list another tenant's blade photos directly via the Storage API — so,
-- matching the timecard-photos precedent, we deliberately grant none.
--
-- Applied directly to production via Supabase MCP on 2026-07-01. This file
-- documents it in the migration history.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blade-checkout-photos',
  'blade-checkout-photos',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;
