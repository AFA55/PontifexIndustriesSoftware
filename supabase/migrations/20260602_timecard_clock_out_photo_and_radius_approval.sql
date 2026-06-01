-- Remote clock-OUT photo + out-of-radius clock-out approval (mirrors remote clock-IN fields).
-- Applied to prod via MCP; tracked here. Additive + idempotent.
ALTER TABLE public.timecards ADD COLUMN IF NOT EXISTS clock_out_photo_url      text;
ALTER TABLE public.timecards ADD COLUMN IF NOT EXISTS clock_out_outside_radius boolean NOT NULL DEFAULT false;
ALTER TABLE public.timecards ADD COLUMN IF NOT EXISTS clock_out_verified       boolean;     -- NULL = pending review, true = approved, false = rejected
ALTER TABLE public.timecards ADD COLUMN IF NOT EXISTS clock_out_verified_by    uuid REFERENCES public.profiles(id);
ALTER TABLE public.timecards ADD COLUMN IF NOT EXISTS clock_out_verified_at    timestamptz;
