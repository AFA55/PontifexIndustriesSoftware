-- ============================================================================
-- WORK ITEMS NEED TO KNOW WHAT DAY THEY BELONG TO.
--
-- A work item's day was a `day_number` supplied by the CLIENT, and the two
-- write paths derived it differently. The replace-on-resubmit logic keyed its
-- DELETE on that number, so the moment the two disagreed the delete matched
-- nothing and the insert simply added on top. Day numbers also moved when they
-- became calendar positions — which no billing row should ever be exposed to.
--
-- A date is a fact about the work. A day number is a label that gets
-- recomputed. Billing rows get the fact.
--
-- See app/api/job-orders/[id]/work-items/route.ts for the other half of this:
-- the GET returned EVERY day and EVERY operator, and the day-complete screen
-- resubmitted the lot as today's work. Pratt reached 2,800 linear feet on day 3
-- against a real day a fraction of that.
-- ============================================================================

ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS work_date date;

COMMENT ON COLUMN public.work_items.work_date IS
  'The calendar day this work was performed (tenant-local). THE identity of a work item together with job_order_id + operator_id — day_number is a display label and must never be used as a replace key.';

-- 1. Rows that know their log take its date. Unambiguous.
UPDATE public.work_items w
   SET work_date = l.log_date
  FROM public.daily_job_logs l
 WHERE w.daily_log_id = l.id AND w.work_date IS NULL;

-- 2. Orphans map through (job, day_number) to the nth proven day on that job.
WITH ranked AS (
  SELECT job_order_id, work_date,
         DENSE_RANK() OVER (PARTITION BY job_order_id ORDER BY work_date) AS n
    FROM public.job_workday_evidence
)
UPDATE public.work_items w
   SET work_date = r.work_date
  FROM ranked r
 WHERE w.work_date IS NULL
   AND r.job_order_id = w.job_order_id
   AND r.n = w.day_number;

-- 3. Anything still unplaced falls back to the day it was written, in the
--    TENANT's calendar — not the server's UTC one. Vercel runs UTC, so a 7pm
--    Eastern write would otherwise book to tomorrow.
UPDATE public.work_items w
   SET work_date = (w.created_at AT TIME ZONE COALESCE(t.timezone, 'America/New_York'))::date
  FROM public.job_orders j
  LEFT JOIN public.tenants t ON t.id = j.tenant_id
 WHERE w.work_date IS NULL AND j.id = w.job_order_id;

-- The lookup every read and every replace now uses.
CREATE INDEX IF NOT EXISTS idx_work_items_job_operator_date
  ON public.work_items (job_order_id, operator_id, work_date);
