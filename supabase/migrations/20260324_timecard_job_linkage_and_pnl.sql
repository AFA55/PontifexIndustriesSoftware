-- =============================================================================
-- Timecard Job Linkage + P&L System
-- =============================================================================
-- Links timecards to specific jobs so we can calculate labor cost per project
-- and generate P&L reports comparing labor cost vs quoted revenue.
-- =============================================================================

-- 1. Add job_order_id to timecards (nullable: NULL = shop/general work)
ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS job_order_id UUID REFERENCES public.job_orders(id) ON DELETE SET NULL;

-- Index for job-based lookups
CREATE INDEX IF NOT EXISTS idx_timecards_job_order_id
  ON public.timecards(job_order_id) WHERE job_order_id IS NOT NULL;

-- 2. Add labor_cost column (stored for fast reporting; auto-calculated on insert/update)
ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS labor_cost DECIMAL(10, 2);

COMMENT ON COLUMN public.timecards.job_order_id IS 'Job this timecard entry is linked to (NULL = shop or general hours)';
COMMENT ON COLUMN public.timecards.labor_cost IS 'Labor cost for this entry: total_hours × employee hourly_rate at time of clock-out';

-- 3. Function to calculate and store labor_cost on clock-out
CREATE OR REPLACE FUNCTION public.calculate_timecard_labor_cost()
RETURNS TRIGGER AS $$
DECLARE
  v_hourly_rate DECIMAL(10,2);
BEGIN
  -- Only run when clock_out_time is being set and total_hours is available
  IF NEW.clock_out_time IS NOT NULL AND NEW.total_hours IS NOT NULL AND OLD.clock_out_time IS NULL THEN
    -- Look up the employee's hourly rate
    SELECT hourly_rate INTO v_hourly_rate
    FROM public.profiles
    WHERE id = NEW.user_id;

    -- Calculate labor cost if rate exists
    IF v_hourly_rate IS NOT NULL AND v_hourly_rate > 0 THEN
      NEW.labor_cost := ROUND((NEW.total_hours * v_hourly_rate)::NUMERIC, 2);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_calculate_labor_cost ON public.timecards;
CREATE TRIGGER trigger_calculate_labor_cost
  BEFORE UPDATE ON public.timecards
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_timecard_labor_cost();

-- 4. Update the timecards_with_users view to include job info
CREATE OR REPLACE VIEW public.timecards_with_users AS
SELECT
  t.id,
  t.user_id,
  p.full_name,
  p.email,
  p.role,
  p.hourly_rate,
  t.date,
  t.clock_in_time,
  t.clock_out_time,
  t.total_hours,
  t.labor_cost,
  t.clock_in_latitude,
  t.clock_in_longitude,
  t.clock_out_latitude,
  t.clock_out_longitude,
  t.notes,
  t.is_approved,
  t.is_shop_hours,
  t.is_night_shift,
  t.hour_type,
  t.clock_in_method,
  t.approved_by,
  t.approved_at,
  approver.full_name AS approved_by_name,
  t.job_order_id,
  jo.job_number,
  jo.customer_name AS job_customer_name,
  jo.title AS job_title,
  jo.job_quote,
  jo.scheduled_date AS job_scheduled_date,
  t.created_at,
  t.updated_at
FROM public.timecards t
LEFT JOIN public.profiles p ON t.user_id = p.id
LEFT JOIN public.profiles approver ON t.approved_by = approver.id
LEFT JOIN public.job_orders jo ON t.job_order_id = jo.id;

COMMENT ON VIEW public.timecards_with_users IS 'Timecards joined with user profiles and job order info for reporting and P&L';

-- 5. Create job_pnl_summary view for fast P&L reporting
CREATE OR REPLACE VIEW public.job_pnl_summary AS
SELECT
  jo.id AS job_order_id,
  jo.job_number,
  jo.title,
  jo.customer_name,
  jo.status,
  jo.scheduled_date,
  jo.job_quote,
  jo.estimated_hours,

  -- Operator labor (from timecards)
  COALESCE(tc_agg.total_labor_hours, 0) AS total_labor_hours,
  COALESCE(tc_agg.total_labor_cost, 0) AS total_labor_cost,
  COALESCE(tc_agg.worker_count, 0) AS worker_count,

  -- Helper labor (from helper_work_logs)
  COALESCE(hwl_agg.helper_hours, 0) AS helper_hours,
  COALESCE(hwl_agg.helper_labor_cost, 0) AS helper_labor_cost,
  COALESCE(hwl_agg.helper_count, 0) AS helper_count,

  -- Combined totals
  COALESCE(tc_agg.total_labor_hours, 0) + COALESCE(hwl_agg.helper_hours, 0) AS combined_labor_hours,
  COALESCE(tc_agg.total_labor_cost, 0) + COALESCE(hwl_agg.helper_labor_cost, 0) AS combined_labor_cost,

  -- P&L
  jo.job_quote - (COALESCE(tc_agg.total_labor_cost, 0) + COALESCE(hwl_agg.helper_labor_cost, 0)) AS gross_profit,
  CASE
    WHEN jo.job_quote > 0 THEN
      ROUND(
        ((jo.job_quote - (COALESCE(tc_agg.total_labor_cost, 0) + COALESCE(hwl_agg.helper_labor_cost, 0))) / jo.job_quote * 100)::NUMERIC,
        1
      )
    ELSE NULL
  END AS gross_margin_pct

FROM public.job_orders jo

-- Aggregate timecard labor per job
LEFT JOIN (
  SELECT
    t.job_order_id,
    SUM(t.total_hours) AS total_labor_hours,
    SUM(
      CASE
        WHEN t.labor_cost IS NOT NULL THEN t.labor_cost
        WHEN p.hourly_rate IS NOT NULL THEN ROUND((COALESCE(t.total_hours, 0) * p.hourly_rate)::NUMERIC, 2)
        ELSE 0
      END
    ) AS total_labor_cost,
    COUNT(DISTINCT t.user_id) AS worker_count
  FROM public.timecards t
  LEFT JOIN public.profiles p ON t.user_id = p.id
  WHERE t.job_order_id IS NOT NULL
    AND t.clock_out_time IS NOT NULL
  GROUP BY t.job_order_id
) tc_agg ON tc_agg.job_order_id = jo.id

-- Aggregate helper work log labor per job
LEFT JOIN (
  SELECT
    hwl.job_order_id,
    SUM(hwl.hours_worked) AS helper_hours,
    SUM(
      CASE
        WHEN p.hourly_rate IS NOT NULL THEN ROUND((COALESCE(hwl.hours_worked, 0) * p.hourly_rate)::NUMERIC, 2)
        ELSE 0
      END
    ) AS helper_labor_cost,
    COUNT(DISTINCT hwl.helper_id) AS helper_count
  FROM public.helper_work_logs hwl
  LEFT JOIN public.profiles p ON hwl.helper_id = p.id
  WHERE hwl.job_order_id IS NOT NULL
    AND hwl.hours_worked IS NOT NULL
  GROUP BY hwl.job_order_id
) hwl_agg ON hwl_agg.job_order_id = jo.id

WHERE jo.deleted_at IS NULL;

COMMENT ON VIEW public.job_pnl_summary IS 'Per-job P&L: labor hours, labor cost (operators + helpers), vs quoted revenue and gross margin';

-- 6. Backfill labor_cost for existing completed timecards that have a job
UPDATE public.timecards t
SET labor_cost = ROUND((t.total_hours * p.hourly_rate)::NUMERIC, 2)
FROM public.profiles p
WHERE t.user_id = p.id
  AND t.clock_out_time IS NOT NULL
  AND t.total_hours IS NOT NULL
  AND p.hourly_rate IS NOT NULL
  AND p.hourly_rate > 0
  AND t.labor_cost IS NULL;
