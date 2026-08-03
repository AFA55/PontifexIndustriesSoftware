-- Takeoffs — per-sheet VIEW rotation.
--
-- Founder ask (Aug 3 2026): an uploaded plan sheet renders vertical and there
-- was no way to turn it landscape, so it could not be read or measured on.
--
-- IMPORTANT: `takeoff_pages.rotation` already exists and holds the PDF page's
-- INTRINSIC /Rotate value, which pdf.js has ALREADY baked into the stored
-- width_pt/height_pt at parse time. Do NOT overload that column — changing it
-- would silently redefine the coordinate space every measurement is stored in.
--
-- `view_rotation` is the estimator's own quarter-turn ON TOP of the intrinsic
-- rotation, applied at RENDER time only:
--     pdf.js viewport rotation = page.rotate + view_rotation
-- Measurement geometry stays in the sheet's native PDF-point space forever and
-- is transformed through the same rotation for display/hit-testing, so there is
-- nothing to backfill and no existing takeoff can be corrupted by this change.
--
-- Additive + idempotent. Existing rows default to 0 = unchanged behavior.

ALTER TABLE public.takeoff_pages
  ADD COLUMN IF NOT EXISTS view_rotation int NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.takeoff_pages
    ADD CONSTRAINT takeoff_pages_view_rotation_chk
    CHECK (view_rotation IN (0, 90, 180, 270));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.takeoff_pages.view_rotation IS
  'Estimator-chosen quarter-turn for viewing this sheet (0/90/180/270, clockwise), applied on top of the PDF intrinsic rotation at render time. Stored measurement geometry is NEVER rotated.';
