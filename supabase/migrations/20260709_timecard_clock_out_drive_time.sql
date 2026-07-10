-- Real drive-time from shop for out-of-radius clock-outs (Google Routes API,
-- computed once at clock-out; see lib/drive-time.ts). Additive + idempotent.
-- Applied to prod via Supabase MCP on 2026-07-09.
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS clock_out_drive_minutes numeric;
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS clock_out_drive_miles numeric;
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS clock_out_drive_source text;
