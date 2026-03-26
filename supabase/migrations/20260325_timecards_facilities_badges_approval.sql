-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Timecards Table, Facilities, Badging System, Approval Workflow
-- Date: 2026-03-25
-- ══════════════════════════════════════════════════════════════════════════════
-- Creates:
--   1. timecards table (core time tracking — was missing, only time_clock existed)
--   2. facilities table (for site compliance / badging)
--   3. operator_facility_badges table (badge tracking per operator per facility)
--   4. schedule_form_submissions table (approval workflow history)
--   5. Adds approval/rejection fields to job_orders
--   6. Adds project_name to job_orders
--   7. RLS policies, indexes, triggers for all new tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 1. TIMECARDS TABLE (core time tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.timecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clock_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out_time TIMESTAMPTZ,
  total_hours DECIMAL(5,2),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,

  -- Approval
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,

  -- Location (GPS coords stored as individual columns for fast queries)
  clock_in_latitude DECIMAL(10,8),
  clock_in_longitude DECIMAL(11,8),
  clock_in_accuracy DECIMAL(8,2),
  clock_out_latitude DECIMAL(10,8),
  clock_out_longitude DECIMAL(11,8),
  clock_out_accuracy DECIMAL(8,2),

  -- Hour categorization
  is_shop_hours BOOLEAN DEFAULT false,
  is_night_shift BOOLEAN DEFAULT false,
  hour_type TEXT NOT NULL DEFAULT 'regular'
    CHECK (hour_type IN ('regular', 'night_shift', 'mandatory_overtime')),

  -- NFC verification
  clock_in_method TEXT NOT NULL DEFAULT 'gps'
    CHECK (clock_in_method IN ('nfc', 'gps', 'remote')),
  nfc_tag_id UUID REFERENCES public.nfc_tags(id),
  nfc_tag_uid TEXT,
  remote_photo_url TEXT,
  remote_verified BOOLEAN DEFAULT NULL,
  remote_verified_by UUID REFERENCES auth.users(id),
  remote_verified_at TIMESTAMPTZ,

  -- Job linkage (NULL = shop/general hours)
  job_order_id UUID REFERENCES public.job_orders(id) ON DELETE SET NULL,
  labor_cost DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.timecards IS 'Core timecard table: clock-in/out with NFC verification, GPS, hour categorization, and job linkage';
COMMENT ON COLUMN public.timecards.hour_type IS 'regular = Mon-Fri before 3PM, night_shift = Mon-Fri after 3PM (job only), mandatory_overtime = Sat/Sun';
COMMENT ON COLUMN public.timecards.clock_in_method IS 'nfc = NFC tag scan, gps = GPS location, remote = out-of-town with selfie';
COMMENT ON COLUMN public.timecards.job_order_id IS 'Job this entry is linked to (NULL = shop or general hours)';
COMMENT ON COLUMN public.timecards.labor_cost IS 'total_hours × hourly_rate at clock-out time';

-- Indexes for timecards
CREATE INDEX IF NOT EXISTS idx_timecards_user_id ON public.timecards(user_id);
CREATE INDEX IF NOT EXISTS idx_timecards_date ON public.timecards(date DESC);
CREATE INDEX IF NOT EXISTS idx_timecards_user_date ON public.timecards(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_timecards_job_order_id ON public.timecards(job_order_id) WHERE job_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timecards_clock_in_method ON public.timecards(clock_in_method);
CREATE INDEX IF NOT EXISTS idx_timecards_remote_verified ON public.timecards(remote_verified) WHERE remote_verified IS NULL;
CREATE INDEX IF NOT EXISTS idx_timecards_is_approved ON public.timecards(is_approved) WHERE is_approved = false;

-- RLS for timecards
ALTER TABLE public.timecards ENABLE ROW LEVEL SECURITY;

-- Operators see their own timecards
CREATE POLICY "timecards_select_own" ON public.timecards
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "timecards_insert_own" ON public.timecards
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "timecards_update_own" ON public.timecards
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Admins see all timecards
CREATE POLICY "timecards_admin_all" ON public.timecards
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin')
  );

-- Auto-calculate total_hours on clock-out
CREATE OR REPLACE FUNCTION public.calculate_timecard_total_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_out_time IS NOT NULL AND OLD.clock_out_time IS NULL THEN
    NEW.total_hours := ROUND(EXTRACT(EPOCH FROM (NEW.clock_out_time - NEW.clock_in_time)) / 3600.0, 2);
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_timecards_calc_hours ON public.timecards;
CREATE TRIGGER trigger_timecards_calc_hours
  BEFORE UPDATE ON public.timecards
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_timecard_total_hours();

-- Auto-calculate labor_cost on clock-out
CREATE OR REPLACE FUNCTION public.calculate_timecard_labor_cost()
RETURNS TRIGGER AS $$
DECLARE
  v_hourly_rate DECIMAL(10,2);
BEGIN
  IF NEW.clock_out_time IS NOT NULL AND NEW.total_hours IS NOT NULL AND (OLD.clock_out_time IS NULL OR OLD.total_hours IS NULL) THEN
    SELECT hourly_rate INTO v_hourly_rate
    FROM public.profiles
    WHERE id = NEW.user_id;

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

-- Timecards with users view (for admin reporting)
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
  t.nfc_tag_id,
  t.nfc_tag_uid,
  t.remote_photo_url,
  t.remote_verified,
  t.approved_by,
  t.approved_at,
  approver.full_name AS approved_by_name,
  t.job_order_id,
  jo.job_number,
  jo.customer_name AS job_customer_name,
  jo.title AS job_title,
  jo.job_quote,
  jo.scheduled_date AS job_scheduled_date,
  nt.label AS nfc_tag_label,
  nt.tag_type AS nfc_tag_type,
  t.created_at,
  t.updated_at
FROM public.timecards t
LEFT JOIN public.profiles p ON t.user_id = p.id
LEFT JOIN public.profiles approver ON t.approved_by = approver.id
LEFT JOIN public.job_orders jo ON t.job_order_id = jo.id
LEFT JOIN public.nfc_tags nt ON t.nfc_tag_id = nt.id;

-- Job P&L summary view
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
  COALESCE(tc_agg.total_labor_hours, 0) AS total_labor_hours,
  COALESCE(tc_agg.total_labor_cost, 0) AS total_labor_cost,
  COALESCE(tc_agg.worker_count, 0) AS worker_count,
  COALESCE(hwl_agg.helper_hours, 0) AS helper_hours,
  COALESCE(hwl_agg.helper_labor_cost, 0) AS helper_labor_cost,
  COALESCE(hwl_agg.helper_count, 0) AS helper_count,
  COALESCE(tc_agg.total_labor_hours, 0) + COALESCE(hwl_agg.helper_hours, 0) AS combined_labor_hours,
  COALESCE(tc_agg.total_labor_cost, 0) + COALESCE(hwl_agg.helper_labor_cost, 0) AS combined_labor_cost,
  jo.job_quote - (COALESCE(tc_agg.total_labor_cost, 0) + COALESCE(hwl_agg.helper_labor_cost, 0)) AS gross_profit,
  CASE
    WHEN jo.job_quote > 0 THEN
      ROUND(((jo.job_quote - (COALESCE(tc_agg.total_labor_cost, 0) + COALESCE(hwl_agg.helper_labor_cost, 0))) / jo.job_quote * 100)::NUMERIC, 1)
    ELSE NULL
  END AS gross_margin_pct
FROM public.job_orders jo
LEFT JOIN (
  SELECT
    t.job_order_id,
    SUM(t.total_hours) AS total_labor_hours,
    SUM(CASE
      WHEN t.labor_cost IS NOT NULL THEN t.labor_cost
      WHEN p.hourly_rate IS NOT NULL THEN ROUND((COALESCE(t.total_hours, 0) * p.hourly_rate)::NUMERIC, 2)
      ELSE 0
    END) AS total_labor_cost,
    COUNT(DISTINCT t.user_id) AS worker_count
  FROM public.timecards t
  LEFT JOIN public.profiles p ON t.user_id = p.id
  WHERE t.job_order_id IS NOT NULL AND t.clock_out_time IS NOT NULL
  GROUP BY t.job_order_id
) tc_agg ON tc_agg.job_order_id = jo.id
LEFT JOIN (
  SELECT
    hwl.job_order_id,
    SUM(hwl.hours_worked) AS helper_hours,
    SUM(CASE
      WHEN p.hourly_rate IS NOT NULL THEN ROUND((COALESCE(hwl.hours_worked, 0) * p.hourly_rate)::NUMERIC, 2)
      ELSE 0
    END) AS helper_labor_cost,
    COUNT(DISTINCT hwl.helper_id) AS helper_count
  FROM public.helper_work_logs hwl
  LEFT JOIN public.profiles p ON hwl.helper_id = p.id
  WHERE hwl.job_order_id IS NOT NULL AND hwl.hours_worked IS NOT NULL
  GROUP BY hwl.job_order_id
) hwl_agg ON hwl_agg.job_order_id = jo.id
WHERE jo.deleted_at IS NULL;


-- ============================================================================
-- 2. FACILITIES TABLE (for site compliance and badging)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  special_requirements TEXT,
  orientation_required BOOLEAN DEFAULT false,
  badging_required BOOLEAN DEFAULT false,
  compliance_documents JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.facilities IS 'Facilities/jobsites with compliance requirements, badging rules, and special instructions';

CREATE INDEX IF NOT EXISTS idx_facilities_name ON public.facilities(name);
CREATE INDEX IF NOT EXISTS idx_facilities_active ON public.facilities(is_active) WHERE is_active = true;

ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facilities_admin_all" ON public.facilities
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin', 'salesman')
  );

CREATE POLICY "facilities_read_all" ON public.facilities
  FOR SELECT USING (true);


-- ============================================================================
-- 3. OPERATOR FACILITY BADGES (badge tracking per operator per facility)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.operator_facility_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  badge_number TEXT,
  issued_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked', 'pending')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(operator_id, facility_id)
);

COMMENT ON TABLE public.operator_facility_badges IS 'Tracks which operators are badged at which facilities, with badge numbers and expiry dates';

CREATE INDEX IF NOT EXISTS idx_badges_operator ON public.operator_facility_badges(operator_id);
CREATE INDEX IF NOT EXISTS idx_badges_facility ON public.operator_facility_badges(facility_id);
CREATE INDEX IF NOT EXISTS idx_badges_expiry ON public.operator_facility_badges(expiry_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_badges_status ON public.operator_facility_badges(status);

ALTER TABLE public.operator_facility_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badges_admin_all" ON public.operator_facility_badges
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin')
  );

CREATE POLICY "badges_read_own" ON public.operator_facility_badges
  FOR SELECT USING (operator_id = auth.uid());

-- Auto-expire badges past their expiry_date
CREATE OR REPLACE FUNCTION public.auto_expire_badges()
RETURNS void AS $$
BEGIN
  UPDATE public.operator_facility_badges
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active'
    AND expiry_date IS NOT NULL
    AND expiry_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- View: badges with operator and facility info
CREATE OR REPLACE VIEW public.badges_with_details AS
SELECT
  b.id,
  b.operator_id,
  p.full_name AS operator_name,
  p.email AS operator_email,
  p.role AS operator_role,
  b.facility_id,
  f.name AS facility_name,
  f.address AS facility_address,
  b.badge_number,
  b.issued_date,
  b.expiry_date,
  b.status,
  b.notes,
  CASE
    WHEN b.expiry_date IS NULL THEN 'no_expiry'
    WHEN b.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN b.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'valid'
  END AS expiry_status,
  b.created_at
FROM public.operator_facility_badges b
JOIN public.profiles p ON b.operator_id = p.id
JOIN public.facilities f ON b.facility_id = f.id;


-- ============================================================================
-- 4. SCHEDULE FORM SUBMISSIONS (approval workflow history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.schedule_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID REFERENCES public.job_orders(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES auth.users(id),
  submitted_by_name TEXT,
  action TEXT NOT NULL
    CHECK (action IN ('submitted', 'approved', 'rejected', 'resubmitted', 'edited')),
  notes TEXT,
  form_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.schedule_form_submissions IS 'Tracks schedule form submission, approval, rejection, and resubmission history';

CREATE INDEX IF NOT EXISTS idx_form_submissions_job ON public.schedule_form_submissions(job_order_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_by ON public.schedule_form_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_form_submissions_action ON public.schedule_form_submissions(action);

ALTER TABLE public.schedule_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "form_submissions_admin_all" ON public.schedule_form_submissions
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin', 'salesman')
  );

CREATE POLICY "form_submissions_read_own" ON public.schedule_form_submissions
  FOR SELECT USING (submitted_by = auth.uid());


-- ============================================================================
-- 5. ADD APPROVAL/REJECTION FIELDS TO JOB_ORDERS
-- ============================================================================
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS rejection_notes TEXT;
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id);
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS last_submitted_at TIMESTAMPTZ;
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS project_name TEXT;
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id);

COMMENT ON COLUMN public.job_orders.rejection_reason IS 'Category of rejection (e.g., missing_info, incorrect_scope, budget_issue)';
COMMENT ON COLUMN public.job_orders.rejection_notes IS 'Detailed notes from super_admin explaining why the form was rejected';
COMMENT ON COLUMN public.job_orders.project_name IS 'Project name for grouping multiple jobs at same site';
COMMENT ON COLUMN public.job_orders.facility_id IS 'Link to facility for compliance/badging requirements';

-- Add 'rejected' to job_orders status if not already there
-- (safe: ALTER TYPE ... ADD VALUE IF NOT EXISTS only works in PG 11+)
DO $$
BEGIN
  -- Check if the status column uses an enum or check constraint
  -- Our job_orders uses a TEXT with CHECK constraint, so we need to update the constraint
  -- Drop the old constraint and recreate with 'rejected' included
  BEGIN
    ALTER TABLE public.job_orders DROP CONSTRAINT IF EXISTS job_orders_status_check;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.job_orders ADD CONSTRAINT job_orders_status_check
      CHECK (status IN ('pending_approval', 'scheduled', 'assigned', 'in_route', 'in_progress', 'completed', 'cancelled', 'rejected'));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- Index for approval workflow queries
CREATE INDEX IF NOT EXISTS idx_job_orders_status_approval
  ON public.job_orders(status) WHERE status IN ('pending_approval', 'rejected');
CREATE INDEX IF NOT EXISTS idx_job_orders_project_name
  ON public.job_orders(project_name) WHERE project_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_orders_facility_id
  ON public.job_orders(facility_id) WHERE facility_id IS NOT NULL;


-- ============================================================================
-- 6. UPDATE SCHEDULE BOARD VIEW to include new fields
-- ============================================================================
CREATE OR REPLACE VIEW public.schedule_board_view AS
SELECT
  jo.id,
  jo.job_number,
  jo.title,
  jo.customer_name,
  jo.job_type,
  jo.location,
  jo.address,
  jo.status,
  jo.priority,
  jo.scheduled_date,
  jo.end_date,
  jo.arrival_time,
  jo.shop_arrival_time,
  jo.equipment_needed,
  jo.is_will_call,
  jo.assigned_to,
  jo.helper_assigned_to,
  jo.estimated_hours,
  jo.estimated_cost,
  jo.description,
  jo.difficulty_rating,
  jo.created_via,
  jo.created_at,
  jo.project_name,
  jo.facility_id,
  jo.rejection_reason,
  jo.rejection_notes,
  jo.rejected_at,
  op.full_name AS operator_name,
  hp.full_name AS helper_name,
  creator.full_name AS created_by_name,
  (SELECT COUNT(*) FROM public.job_notes jn WHERE jn.job_order_id = jo.id) AS notes_count,
  (SELECT COUNT(*) FROM public.change_requests cr WHERE cr.job_order_id = jo.id AND cr.status = 'pending') AS pending_change_requests_count
FROM public.job_orders jo
LEFT JOIN public.profiles op ON jo.assigned_to = op.id
LEFT JOIN public.profiles hp ON jo.helper_assigned_to = hp.id
LEFT JOIN public.profiles creator ON jo.created_by = creator.id
WHERE jo.deleted_at IS NULL;


-- ============================================================================
-- Done! Summary:
-- - timecards: Full time tracking with NFC, GPS, remote, hour categories, job linkage
-- - facilities: Site compliance tracking with requirements
-- - operator_facility_badges: Per-operator badge tracking with auto-expiry
-- - schedule_form_submissions: Approval workflow history
-- - job_orders: rejection fields, project_name, facility_id
-- - Updated schedule_board_view with new fields
-- ============================================================================
