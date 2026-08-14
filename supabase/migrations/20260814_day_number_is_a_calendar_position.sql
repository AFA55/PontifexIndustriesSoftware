-- ============================================================================
-- "IT SHOWS DAY ONE AS THURSDAY INSTEAD OF WEDNESDAY"
--
-- Dante was at AM King (JOB-2026-914932) Wednesday Aug 12 AND Thursday Aug 13.
-- The printed ticket showed one day, labelled Day 1, dated Thursday.
--
-- The old trigger numbered days by COUNTING SUBMISSIONS:
--
--     SELECT COALESCE(MAX(day_number), 0) + 1 ... WHERE job_order_id = ...
--
-- so a day number was never a fact about the calendar — it was a fact about how
-- many times somebody had tapped "day complete" on that job. Dante did not tap
-- it Wednesday night (he was coming back in the morning), so Wednesday produced
-- no row, and Thursday's tap — the first one — became Day 1. The day did not
-- move; it was never counted. Every screen downstream inherited the hole: the
-- work ticket, Daily Progress, the invoice day breakdown. Same root cause as
-- Aiden's missing Aug 4 on Parkk: he clocked 9.89 hours and filed no ticket.
--
-- MAX+1 is also global to the job rather than per date, so an operator and
-- their helper closing out the same Wednesday got Day 1 and Day 2.
--
-- A day number is a CALENDAR POSITION, so this computes it as one: the ordinal
-- of the log's date among the days this job has PROOF a crew was on it.
--
-- What counts as proof — and what deliberately does not:
--
--   • a filed daily log                                    → proof
--   • the office placed a named crew that day AND that
--     person clocked in that day                           → proof
--   • the office placed a named crew and NOBODY clocked in  → NOT proof
--
-- That last line is the whole difference between a fact and a guess. Aiden is
-- assigned to Parkk on Saturday Aug 8 and Sunday Aug 9 and has no timecard for
-- either — the board was holding a span open, he was not there. Counting the
-- assignment alone would have pushed his Monday from Day 4 to Day 7 and printed
-- two weekend days he never worked onto a customer's ticket. A plan is not
-- attendance; the clock is.
-- ============================================================================

-- One definition of "this job had a crew on site that day", shared by the
-- trigger and the backfill so they can never drift apart.
CREATE OR REPLACE VIEW public.job_workday_evidence AS
  SELECT l.job_order_id, l.log_date AS work_date
    FROM public.daily_job_logs l
  UNION
  SELECT a.job_order_id, a.assignment_date
    FROM public.job_daily_assignments a
   WHERE (a.operator_id IS NOT NULL OR a.helper_id IS NOT NULL)
     AND EXISTS (
       SELECT 1
         FROM public.timecards t
        WHERE t.date = a.assignment_date
          AND t.user_id IN (a.operator_id, a.helper_id)
     );

-- Server-side only: it joins across every tenant's timecards and assignments,
-- and a view is not covered by the RLS on its base tables.
REVOKE ALL ON public.job_workday_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.job_workday_evidence TO service_role;

CREATE OR REPLACE FUNCTION public.set_daily_log_day_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day integer;
BEGIN
  SELECT COUNT(*) + 1 INTO v_day
    FROM public.job_workday_evidence e
   WHERE e.job_order_id = NEW.job_order_id
     AND e.work_date < NEW.log_date;

  NEW.day_number := v_day;

  -- total_days_worked is maintained by trigger_update_total_days_worked below.
  -- Writing it here as well is how AM King reached total_days_worked = 2 off a
  -- single log row.
  UPDATE public.job_orders
     SET is_multi_day = CASE WHEN v_day > 1 THEN TRUE ELSE is_multi_day END
   WHERE id = NEW.job_order_id;

  RETURN NEW;
END;
$function$;

-- Renumber when a log is re-dated — the late-completion backfill does exactly
-- that — not only on first insert.
DROP TRIGGER IF EXISTS set_daily_log_day_number_trigger ON public.daily_job_logs;
CREATE TRIGGER set_daily_log_day_number_trigger
  BEFORE INSERT OR UPDATE OF log_date ON public.daily_job_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_daily_log_day_number();

-- total_days_worked must span the same universe or a ticket reads "Day 2 of 1".
CREATE OR REPLACE FUNCTION public.update_total_days_worked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.job_orders
     SET total_days_worked = (
       SELECT COUNT(*) FROM public.job_workday_evidence e
        WHERE e.job_order_id = NEW.job_order_id
     )
   WHERE id = NEW.job_order_id;
  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL — ORDER MATTERS.
--
-- work_items carry their own day_number and 62 of 76 production rows have no
-- daily_log_id to re-derive it from, so those billing rows are reachable only
-- through the OLD number. Renumbering the logs first would strand them: the
-- ticket would file Day 2's footage under a Day 1 heading, or drop it. So the
-- old→new map is captured first, the billing rows are moved with it, and only
-- then are the logs renumbered.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS day_remap;
CREATE TEMP TABLE day_remap AS
WITH ranked AS (
  SELECT job_order_id, work_date,
         DENSE_RANK() OVER (PARTITION BY job_order_id ORDER BY work_date) AS n
    FROM public.job_workday_evidence
)
SELECT l.id AS log_id, l.job_order_id, l.day_number AS old_day, r.n AS new_day
  FROM public.daily_job_logs l
  JOIN ranked r
    ON r.job_order_id = l.job_order_id AND r.work_date = l.log_date;

-- 1. Billing rows that know their log move exactly.
UPDATE public.work_items w
   SET day_number = m.new_day
  FROM day_remap m
 WHERE w.daily_log_id = m.log_id
   AND w.day_number IS DISTINCT FROM m.new_day;

-- 2. Orphans move by (job, old number). The old numbering was MAX+1, so within
--    a job each old number pointed at exactly one log — the map is a function.
--    Any job where that does not hold is left alone rather than guessed at.
UPDATE public.work_items w
   SET day_number = m.new_day
  FROM (
    SELECT job_order_id, old_day, MIN(new_day) AS new_day
      FROM day_remap
     GROUP BY job_order_id, old_day
    HAVING COUNT(DISTINCT new_day) = 1
  ) m
 WHERE w.daily_log_id IS NULL
   AND w.job_order_id = m.job_order_id
   AND w.day_number = m.old_day
   AND w.day_number IS DISTINCT FROM m.new_day;

-- 3. Now the logs themselves.
UPDATE public.daily_job_logs l
   SET day_number = m.new_day
  FROM day_remap m
 WHERE m.log_id = l.id
   AND l.day_number IS DISTINCT FROM m.new_day;

-- 4. And every job's total.
UPDATE public.job_orders j
   SET total_days_worked = t.n
  FROM (
    SELECT job_order_id, COUNT(*) AS n
      FROM public.job_workday_evidence
     GROUP BY job_order_id
  ) t
 WHERE t.job_order_id = j.id
   AND j.total_days_worked IS DISTINCT FROM t.n;

DROP TABLE IF EXISTS day_remap;
