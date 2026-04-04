-- =============================================================================
-- Timecard System Full Deployment
-- =============================================================================
-- Extends timecards with: auto-lunch deduction, OT/DT hour splits, approval
-- workflow, and configurable settings. Also adds break tracking and a
-- job_profitability view for P&L reporting.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend timecards table
-- ─────────────────────────────────────────────────────────────────────────────

-- Lunch / break tracking
ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS auto_lunch_applied      BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS lunch_duration_minutes  INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lunch_start_time        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lunch_end_time          TIMESTAMPTZ;

-- Hour-type breakdown (stored for fast reporting)
ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS gross_hours             DECIMAL(6,2), -- raw clock-in → clock-out
  ADD COLUMN IF NOT EXISTS net_hours               DECIMAL(6,2), -- after lunch deduction
  ADD COLUMN IF NOT EXISTS regular_hours           DECIMAL(6,2), -- ≤ OT threshold
  ADD COLUMN IF NOT EXISTS overtime_hours          DECIMAL(6,2), -- OT threshold → DT threshold
  ADD COLUMN IF NOT EXISTS double_time_hours       DECIMAL(6,2); -- above DT threshold

-- Approval workflow
ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS approval_status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'auto_approved')),
  ADD COLUMN IF NOT EXISTS timecard_source         TEXT NOT NULL DEFAULT 'manual'
    CHECK (timecard_source IN ('manual', 'nfc', 'gps', 'remote', 'kiosk'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_timecards_approval_status
  ON public.timecards(approval_status) WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_timecards_source
  ON public.timecards(timecard_source);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Timecard settings table (20 configurable settings per tenant)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.timecard_settings (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Auto-lunch
  auto_lunch_enabled            BOOLEAN  NOT NULL DEFAULT true,
  auto_lunch_threshold_hours    DECIMAL(4,2) NOT NULL DEFAULT 5.0,  -- lunch deducted after N hrs
  auto_lunch_duration_minutes   INTEGER  NOT NULL DEFAULT 30,
  -- OT / DT thresholds (daily)
  daily_ot_threshold_hours      DECIMAL(4,2) NOT NULL DEFAULT 8.0,
  daily_dt_threshold_hours      DECIMAL(4,2) NOT NULL DEFAULT 12.0,
  -- OT / DT thresholds (weekly)
  weekly_ot_threshold_hours     DECIMAL(5,2) NOT NULL DEFAULT 40.0,
  weekly_dt_threshold_hours     DECIMAL(5,2) NOT NULL DEFAULT 60.0,
  -- Rounding
  clock_rounding_enabled        BOOLEAN  NOT NULL DEFAULT false,
  clock_rounding_minutes        INTEGER  NOT NULL DEFAULT 15,         -- round to nearest N min
  clock_rounding_rule           TEXT     NOT NULL DEFAULT 'nearest'
    CHECK (clock_rounding_rule IN ('nearest', 'up', 'down')),
  -- Auto-approval rules
  auto_approve_enabled          BOOLEAN  NOT NULL DEFAULT false,
  auto_approve_if_nfc           BOOLEAN  NOT NULL DEFAULT true,       -- NFC clock-ins auto-approve
  auto_approve_max_hours        DECIMAL(4,2) NOT NULL DEFAULT 10.0,   -- auto-approve if ≤ N hrs
  auto_approve_no_ot            BOOLEAN  NOT NULL DEFAULT true,       -- only auto-approve if no OT
  -- Approval window
  approval_deadline_hours       INTEGER  NOT NULL DEFAULT 48,         -- hrs after shift to approve
  require_manager_approval_ot   BOOLEAN  NOT NULL DEFAULT true,       -- OT always needs manager
  -- Notifications
  notify_manager_on_clock_out   BOOLEAN  NOT NULL DEFAULT false,
  notify_operator_on_approval   BOOLEAN  NOT NULL DEFAULT true,
  -- Breaks
  paid_breaks_enabled           BOOLEAN  NOT NULL DEFAULT false,
  paid_break_duration_minutes   INTEGER  NOT NULL DEFAULT 15,
  -- Audit
  updated_by                    UUID     REFERENCES auth.users(id),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default settings row (only once)
INSERT INTO public.timecard_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001'::UUID)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.timecard_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timecard_settings_admin_all" ON public.timecard_settings
  FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN
      ('super_admin', 'operations_manager', 'admin')
  );

CREATE POLICY "timecard_settings_read_all" ON public.timecard_settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Timecard breaks table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.timecard_breaks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timecard_id     UUID NOT NULL REFERENCES public.timecards(id) ON DELETE CASCADE,
  break_start     TIMESTAMPTZ NOT NULL,
  break_end       TIMESTAMPTZ,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE WHEN break_end IS NOT NULL THEN
      EXTRACT(EPOCH FROM (break_end - break_start)) / 60
    ELSE NULL END::INTEGER
  ) STORED,
  break_type      TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (break_type IN ('lunch', 'paid', 'unpaid')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.timecard_breaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timecard_breaks_own" ON public.timecard_breaks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.timecards t
      WHERE t.id = timecard_id AND t.user_id = auth.uid()
    )
    OR (auth.jwt() -> 'user_metadata' ->> 'role') IN
      ('super_admin', 'operations_manager', 'admin', 'shop_manager')
  );

CREATE INDEX IF NOT EXISTS idx_timecard_breaks_timecard_id
  ON public.timecard_breaks(timecard_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. calculate_timecard_hours() — auto-lunch + OT/DT split on clock-out
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_timecard_hours()
RETURNS TRIGGER AS $$
DECLARE
  v_settings             public.timecard_settings%ROWTYPE;
  v_gross                DECIMAL(6,2);
  v_lunch_deduct         DECIMAL(6,2) := 0;
  v_net                  DECIMAL(6,2);
  v_regular              DECIMAL(6,2);
  v_overtime             DECIMAL(6,2) := 0;
  v_double_time          DECIMAL(6,2) := 0;
BEGIN
  -- Only run on clock-out event
  IF NEW.clock_out_time IS NULL OR OLD.clock_out_time IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Load settings (use defaults if table is empty)
  SELECT * INTO v_settings
  FROM public.timecard_settings
  LIMIT 1;

  -- Gross hours = clock-out minus clock-in
  v_gross := ROUND(
    (EXTRACT(EPOCH FROM (NEW.clock_out_time - NEW.clock_in_time)) / 3600)::NUMERIC,
    2
  );
  NEW.gross_hours := v_gross;

  -- Auto-lunch deduction
  IF v_settings.auto_lunch_enabled IS NOT DISTINCT FROM true
     AND v_gross >= v_settings.auto_lunch_threshold_hours
     AND NOT COALESCE(NEW.auto_lunch_applied, false)
  THEN
    v_lunch_deduct           := ROUND((v_settings.auto_lunch_duration_minutes / 60.0)::NUMERIC, 2);
    NEW.auto_lunch_applied   := true;
    NEW.lunch_duration_minutes := v_settings.auto_lunch_duration_minutes;
  END IF;

  -- Net hours after lunch
  v_net        := GREATEST(v_gross - v_lunch_deduct, 0);
  NEW.net_hours := v_net;

  -- Daily OT / DT split
  IF v_net <= COALESCE(v_settings.daily_ot_threshold_hours, 8.0) THEN
    v_regular := v_net;
  ELSIF v_net <= COALESCE(v_settings.daily_dt_threshold_hours, 12.0) THEN
    v_regular   := v_settings.daily_ot_threshold_hours;
    v_overtime  := v_net - v_settings.daily_ot_threshold_hours;
  ELSE
    v_regular     := v_settings.daily_ot_threshold_hours;
    v_overtime    := v_settings.daily_dt_threshold_hours - v_settings.daily_ot_threshold_hours;
    v_double_time := v_net - v_settings.daily_dt_threshold_hours;
  END IF;

  NEW.regular_hours     := ROUND(v_regular,     2);
  NEW.overtime_hours    := ROUND(v_overtime,    2);
  NEW.double_time_hours := ROUND(v_double_time, 2);

  -- Keep total_hours in sync (net hours)
  NEW.total_hours := v_net;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. auto_approve_timecard() — auto-approval logic post-clock-out
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_approve_timecard()
RETURNS TRIGGER AS $$
DECLARE
  v_settings public.timecard_settings%ROWTYPE;
BEGIN
  -- Only run immediately after clock-out is first recorded
  IF NEW.clock_out_time IS NULL OR OLD.clock_out_time IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_settings FROM public.timecard_settings LIMIT 1;

  IF NOT COALESCE(v_settings.auto_approve_enabled, false) THEN
    RETURN NEW;
  END IF;

  -- Conditions for auto-approval
  IF (
    -- NFC clocked-in and setting says auto-approve NFC
    (COALESCE(v_settings.auto_approve_if_nfc, true) AND NEW.clock_in_method = 'nfc')
    OR
    -- Within max hours and no OT
    (
      COALESCE(NEW.net_hours, NEW.total_hours, 0) <= COALESCE(v_settings.auto_approve_max_hours, 10.0)
      AND COALESCE(NEW.overtime_hours, 0) = 0
      AND COALESCE(v_settings.auto_approve_no_ot, true)
    )
  ) THEN
    NEW.approval_status := 'auto_approved';
    NEW.is_approved     := true;
    NEW.approved_at     := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Trigger: fire both functions on clock-out (BEFORE UPDATE, sequential)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_timecard_clock_out ON public.timecards;
CREATE TRIGGER on_timecard_clock_out
  BEFORE UPDATE ON public.timecards
  FOR EACH ROW
  WHEN (OLD.clock_out_time IS NULL AND NEW.clock_out_time IS NOT NULL)
  EXECUTE FUNCTION public.calculate_timecard_hours();

DROP TRIGGER IF EXISTS on_timecard_auto_approve ON public.timecards;
CREATE TRIGGER on_timecard_auto_approve
  BEFORE UPDATE ON public.timecards
  FOR EACH ROW
  WHEN (OLD.clock_out_time IS NULL AND NEW.clock_out_time IS NOT NULL)
  EXECUTE FUNCTION public.auto_approve_timecard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. job_profitability view — P&L per job including OT cost multipliers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.job_profitability AS
SELECT
  jo.id                  AS job_order_id,
  jo.job_number,
  jo.title,
  jo.customer_name,
  jo.status,
  jo.scheduled_date,
  jo.job_quote           AS quoted_revenue,
  jo.estimated_hours,

  -- Labor hours by type
  COALESCE(SUM(t.regular_hours),     0) AS total_regular_hours,
  COALESCE(SUM(t.overtime_hours),    0) AS total_overtime_hours,
  COALESCE(SUM(t.double_time_hours), 0) AS total_double_time_hours,
  COALESCE(SUM(t.net_hours),         0) AS total_net_hours,

  -- Labor cost (rate × multiplier)
  COALESCE(SUM(
    COALESCE(t.regular_hours,     0) * COALESCE(p.hourly_rate, 0) * 1.0  +
    COALESCE(t.overtime_hours,    0) * COALESCE(p.hourly_rate, 0) * 1.5  +
    COALESCE(t.double_time_hours, 0) * COALESCE(p.hourly_rate, 0) * 2.0
  ), 0)                   AS total_labor_cost,

  -- Worker count
  COUNT(DISTINCT t.user_id) AS worker_count,

  -- P&L
  jo.job_quote - COALESCE(SUM(
    COALESCE(t.regular_hours,     0) * COALESCE(p.hourly_rate, 0) * 1.0  +
    COALESCE(t.overtime_hours,    0) * COALESCE(p.hourly_rate, 0) * 1.5  +
    COALESCE(t.double_time_hours, 0) * COALESCE(p.hourly_rate, 0) * 2.0
  ), 0)                   AS gross_profit,

  CASE
    WHEN jo.job_quote > 0 THEN ROUND(
      ((jo.job_quote - COALESCE(SUM(
        COALESCE(t.regular_hours,     0) * COALESCE(p.hourly_rate, 0) * 1.0  +
        COALESCE(t.overtime_hours,    0) * COALESCE(p.hourly_rate, 0) * 1.5  +
        COALESCE(t.double_time_hours, 0) * COALESCE(p.hourly_rate, 0) * 2.0
      ), 0)) / jo.job_quote * 100)::NUMERIC, 1)
    ELSE NULL
  END                     AS gross_margin_pct

FROM public.job_orders jo
LEFT JOIN public.timecards t
  ON t.job_order_id = jo.id
  AND t.clock_out_time IS NOT NULL
LEFT JOIN public.profiles p ON p.id = t.user_id
WHERE jo.deleted_at IS NULL
GROUP BY
  jo.id, jo.job_number, jo.title, jo.customer_name,
  jo.status, jo.scheduled_date, jo.job_quote, jo.estimated_hours;

COMMENT ON VIEW public.job_profitability IS
  'Per-job P&L with OT/DT cost multipliers (1×/1.5×/2×) vs quoted revenue';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Backfill approval_status for existing approved timecards
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.timecards
SET approval_status = 'approved'
WHERE is_approved = true
  AND approval_status = 'pending';
