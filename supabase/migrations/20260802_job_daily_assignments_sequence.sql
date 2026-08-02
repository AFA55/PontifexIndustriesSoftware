-- Migration: job_daily_assignments day_sequence (founder decision Aug 2, 2026)
-- The one-job-per-operator-per-day rule is DROPPED. An operator can now have
-- 2+ jobs on the same date, SEQUENCED: day_sequence 1 is their first job of
-- the day, 2 their second, etc. The operator-side flow gates job #2 until
-- job #1 is completed for the day (enforced in /api/job-orders/[id]/status).
--
-- Sequencing rules (mirrored in lib/reassign.ts):
--   • New assignment to an operator who already has jobs that date defaults
--     to max(day_sequence) + 1 ("add as their #2 job").
--   • "Make this their #1 job" shifts the operator's existing rows up by one
--     and inserts the new job at day_sequence 1.
--   • (job_order_id, assignment_date) stays UNIQUE — one ledger row per job
--     per day; day_sequence orders an OPERATOR's several rows within a day.
--
-- Idempotent. Safe to re-run. NOT applied automatically — apply via Supabase
-- MCP before deploying the sequencing code (the code writes day_sequence).

-- 1. Drop the old one-job-per-operator-per-day unique index.
DROP INDEX IF EXISTS public.job_daily_assignments_operator_date_unique;

-- 2. Sequence column. Existing rows were unique per (operator, date) under
--    the old index, so DEFAULT 1 is consistent — no backfill needed.
ALTER TABLE public.job_daily_assignments
  ADD COLUMN IF NOT EXISTS day_sequence integer NOT NULL DEFAULT 1;

-- 3. New uniqueness: an operator's jobs within a day are uniquely ordered.
--    Partial (operator_id IS NOT NULL) like the old index — unassigned-day
--    rows (operator NULL) carry no ordering constraint.
CREATE UNIQUE INDEX IF NOT EXISTS job_daily_assignments_operator_date_seq_unique
  ON public.job_daily_assignments (operator_id, assignment_date, day_sequence)
  WHERE operator_id IS NOT NULL;

-- 4. (unchanged, documented) UNIQUE(job_order_id, assignment_date) from the
--    original job_daily_assignments migration stays as-is.
