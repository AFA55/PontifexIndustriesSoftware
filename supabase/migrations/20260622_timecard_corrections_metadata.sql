-- Add a metadata jsonb column to timecard_correction_requests so auto-flagged
-- requests can be distinguished from worker-submitted ones. The out-of-radius
-- clock-out flow inserts metadata = {"source":"auto_out_of_radius"}, which the
-- corrections approval flow reads to label/handle auto requests.
-- Additive + idempotent (safe to re-run against prod).
ALTER TABLE public.timecard_correction_requests
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Speed up the dedup lookup (pending auto requests for a given timecard).
CREATE INDEX IF NOT EXISTS tcr_pending_auto_source_idx
  ON public.timecard_correction_requests (timecard_id)
  WHERE status = 'pending' AND (metadata->>'source') = 'auto_out_of_radius';
