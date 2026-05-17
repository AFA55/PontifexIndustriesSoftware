-- Prevent double-booking: one operator can only be in one job_daily_assignment per date.
-- This is a partial index (not a full constraint) so it only covers non-null operator_id rows.
-- Note: one historical duplicate (2026-05-04) was cleaned up manually before this index was applied.
CREATE UNIQUE INDEX IF NOT EXISTS job_daily_assignments_operator_date_unique
  ON public.job_daily_assignments (operator_id, assignment_date)
  WHERE operator_id IS NOT NULL;
