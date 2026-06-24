-- Per-day out-of-town flag on the clock-in row.
-- Set at REMOTE clock-in so the operator's time view can show the shift as
-- out-of-town even before day-complete records the subsistence night.
-- Subsistence pay (per NIGHT away) still lives in public.subsistence_nights;
-- this boolean is just the per-shift marker for surfacing. Additive + idempotent.
-- Inherits the existing timecards RLS — no new policy needed.

ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS out_of_town boolean NOT NULL DEFAULT false;
