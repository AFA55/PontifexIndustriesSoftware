-- Additional safety requirements (Step 5 of the schedule form).
-- Distinct from the standard PPE list (job_orders.ppe_required) — these are
-- job-specific safety controls (fall protection, confined space, LOTO, hot work,
-- silica control, traffic control, etc.) plus free-text "other:<text>" entries.
-- Additive + idempotent: safe to re-run.

ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS additional_safety_requirements JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN job_orders.additional_safety_requirements IS
  'Array of additional job-specific safety requirement keys selected on the schedule form (Step 5), distinct from ppe_required. Curated keys (e.g. fall_protection, confined_space, lockout_tagout) plus custom free-text entries stored as "other:<text>".';
