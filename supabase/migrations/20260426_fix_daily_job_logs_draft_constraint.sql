-- Fix unique constraint on daily_job_logs to include operator_id.
-- The original constraint (job_order_id, log_date) blocked a helper and
-- primary operator from both having a draft row on the same job+date,
-- causing the work-performed-draft PUT route to fail with a unique violation
-- whenever a skeleton draft row was inserted for a new job day.

-- Drop the old overly-broad unique constraint
ALTER TABLE daily_job_logs
  DROP CONSTRAINT IF EXISTS daily_job_logs_job_order_id_log_date_key;

-- New constraint: one row per (job_order_id, operator_id, log_date)
-- This allows the primary operator and helper to each have their own log row.
ALTER TABLE daily_job_logs
  ADD CONSTRAINT daily_job_logs_job_order_id_operator_id_log_date_key
  UNIQUE (job_order_id, operator_id, log_date);

-- Add UPDATE policy so operators can update their own log rows
-- (supabaseAdmin bypasses RLS but this closes the gap for future client-side use)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'daily_job_logs'
    AND policyname = 'Operators can update own daily logs'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Operators can update own daily logs"
        ON daily_job_logs
        FOR UPDATE
        USING (operator_id = auth.uid())
        WITH CHECK (operator_id = auth.uid())
    $policy$;
  END IF;
END;
$$;
