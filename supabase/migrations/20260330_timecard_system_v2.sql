-- ============================================================
-- TIMECARD SYSTEM V2 — Full schema audit & upgrade
-- Applied: 2026-03-30
-- ============================================================

-- ============================================================
-- 1. ADD MISSING COLUMNS TO EXISTING `timecards` TABLE
--    (This table serves as daily clock-in/out entries)
-- ============================================================

-- GPS columns with clearer names (aliases for existing numeric cols)
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS clock_in_gps_lat double precision;
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS clock_in_gps_lng double precision;
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS clock_out_gps_lat double precision;
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS clock_out_gps_lng double precision;

-- NFC booleans
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS nfc_clock_in boolean DEFAULT false;
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS nfc_clock_out boolean DEFAULT false;

-- Entry type enum
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS entry_type text DEFAULT 'regular'
  CHECK (entry_type IN ('regular', 'overtime', 'double_time', 'time_off', 'holiday', 'no_call_no_show', 'late'));

-- Break minutes
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS break_minutes integer DEFAULT 0;

-- Admin + employee notes (separate fields)
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS employee_notes text;

-- Segments JSONB — array of work segments
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS segments jsonb DEFAULT '[]'::jsonb;

-- Coworkers JSONB — array of user_ids on same job
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS coworkers jsonb DEFAULT '[]'::jsonb;

-- Week reference (for linking to weekly summary)
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS week_start date;

-- Rejected by tracking
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES profiles(id);
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

-- Backfill week_start from date for existing rows
UPDATE timecards
SET week_start = date - EXTRACT(ISODOW FROM date)::integer + 1
WHERE week_start IS NULL AND date IS NOT NULL;

-- Sync GPS lat/lng from existing numeric columns where available
UPDATE timecards
SET clock_in_gps_lat = clock_in_latitude::double precision,
    clock_in_gps_lng = clock_in_longitude::double precision,
    clock_out_gps_lat = clock_out_latitude::double precision,
    clock_out_gps_lng = clock_out_longitude::double precision
WHERE clock_in_gps_lat IS NULL AND clock_in_latitude IS NOT NULL;

-- ============================================================
-- 2. CREATE `timecard_entries` TABLE
--    (Normalized per-entry records that can link to weekly timecards)
-- ============================================================

CREATE TABLE IF NOT EXISTS timecard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timecard_id uuid,  -- optional FK to timecard_weeks
  user_id uuid NOT NULL REFERENCES profiles(id),
  tenant_id uuid REFERENCES tenants(id),
  date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  clock_in_gps_lat double precision,
  clock_in_gps_lng double precision,
  clock_out_gps_lat double precision,
  clock_out_gps_lng double precision,
  nfc_clock_in boolean DEFAULT false,
  nfc_clock_out boolean DEFAULT false,
  nfc_tag_id uuid REFERENCES nfc_tags(id),
  job_order_id uuid,
  entry_type text DEFAULT 'regular' CHECK (entry_type IN ('regular', 'overtime', 'double_time', 'time_off', 'holiday', 'no_call_no_show', 'late')),
  total_hours numeric DEFAULT 0,
  break_minutes integer DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_approved')),
  admin_notes text,
  employee_notes text,
  segments jsonb DEFAULT '[]'::jsonb,
  coworkers jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 3. CREATE `timecard_weeks` TABLE
--    (Weekly summary / approval container)
-- ============================================================

CREATE TABLE IF NOT EXISTS timecard_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  tenant_id uuid REFERENCES tenants(id),
  week_start date NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  total_regular_hours numeric DEFAULT 0,
  total_overtime_hours numeric DEFAULT 0,
  total_double_time_hours numeric DEFAULT 0,
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  rejected_by uuid REFERENCES profiles(id),
  rejected_at timestamptz,
  rejection_reason text,
  notes text,          -- admin notes (late, no-call-no-show tracking)
  employee_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, week_start)
);

-- ============================================================
-- 4. CREATE `timecard_settings_v2` TABLE
--    (Dedicated columns instead of generic key/value)
-- ============================================================

CREATE TABLE IF NOT EXISTS timecard_settings_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) UNIQUE,
  regular_hours_per_day numeric DEFAULT 8,
  overtime_threshold_daily numeric DEFAULT 8,
  overtime_threshold_weekly numeric DEFAULT 40,
  double_time_threshold_daily numeric DEFAULT 12,
  double_time_threshold_weekly numeric DEFAULT 60,
  overtime_multiplier numeric DEFAULT 1.5,
  double_time_multiplier numeric DEFAULT 2.0,
  require_nfc_clock_in boolean DEFAULT false,
  require_gps boolean DEFAULT true,
  auto_clock_out_hours numeric DEFAULT 16,
  break_duration_minutes integer DEFAULT 30,
  auto_deduct_break boolean DEFAULT true,
  break_threshold_hours numeric(4,2) DEFAULT 6,
  break_is_paid boolean DEFAULT false,
  round_to_nearest_minutes integer DEFAULT 15,
  week_start_day text DEFAULT 'monday' CHECK (week_start_day IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  require_admin_approval boolean DEFAULT true,
  allow_manual_entry boolean DEFAULT true,
  max_hours_per_day numeric DEFAULT 24,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 5. CREATE `timecard_gps_logs` TABLE
--    (Detailed GPS breadcrumbs during shifts)
-- ============================================================

CREATE TABLE IF NOT EXISTS timecard_gps_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timecard_entry_id uuid REFERENCES timecard_entries(id) ON DELETE CASCADE,
  -- Also allow linking to legacy timecards table
  legacy_timecard_id uuid REFERENCES timecards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  tenant_id uuid REFERENCES tenants(id),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  event_type text NOT NULL CHECK (event_type IN ('clock_in', 'clock_out', 'start_route', 'arrive_site', 'start_work', 'complete', 'periodic')),
  job_order_id uuid,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 6. UPDATE `nfc_tags` TABLE — add missing columns
-- ============================================================

-- Add assigned_to / assigned_at (operator_id exists but we add the canonical name)
ALTER TABLE nfc_tags ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id);
ALTER TABLE nfc_tags ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- Add status enum (replacing is_active boolean)
ALTER TABLE nfc_tags ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'
  CHECK (status IN ('active', 'inactive', 'lost', 'deactivated'));

-- Backfill: sync assigned_to from operator_id, status from is_active
UPDATE nfc_tags SET assigned_to = operator_id WHERE assigned_to IS NULL AND operator_id IS NOT NULL;
UPDATE nfc_tags SET status = CASE WHEN is_active = true THEN 'active' ELSE 'inactive' END WHERE status IS NULL;

-- Update tag_type CHECK to include new types
ALTER TABLE nfc_tags DROP CONSTRAINT IF EXISTS nfc_tags_tag_type_check;
ALTER TABLE nfc_tags ADD CONSTRAINT nfc_tags_tag_type_check
  CHECK (tag_type IN ('shop', 'truck', 'jobsite', 'clock_in', 'equipment', 'location'));

-- ============================================================
-- 7. INDEXES for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_timecard_entries_user_date ON timecard_entries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_timecard_entries_tenant ON timecard_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_timecard_entries_timecard_id ON timecard_entries(timecard_id);
CREATE INDEX IF NOT EXISTS idx_timecard_entries_status ON timecard_entries(status);

CREATE INDEX IF NOT EXISTS idx_timecard_weeks_user_week ON timecard_weeks(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_timecard_weeks_tenant ON timecard_weeks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_timecard_weeks_status ON timecard_weeks(status);

CREATE INDEX IF NOT EXISTS idx_timecard_gps_logs_entry ON timecard_gps_logs(timecard_entry_id);
CREATE INDEX IF NOT EXISTS idx_timecard_gps_logs_user ON timecard_gps_logs(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_timecard_gps_logs_event ON timecard_gps_logs(event_type);

CREATE INDEX IF NOT EXISTS idx_timecards_week_start ON timecards(week_start);
CREATE INDEX IF NOT EXISTS idx_timecards_entry_type ON timecards(entry_type);
CREATE INDEX IF NOT EXISTS idx_timecards_tenant_id ON timecards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_timecards_user_date ON timecards(user_id, date);

CREATE INDEX IF NOT EXISTS idx_nfc_tags_assigned_to ON nfc_tags(assigned_to);
CREATE INDEX IF NOT EXISTS idx_nfc_tags_status ON nfc_tags(status);

-- ============================================================
-- 8. ENABLE RLS on new tables
-- ============================================================

ALTER TABLE timecard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE timecard_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE timecard_settings_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE timecard_gps_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. RLS POLICIES — JWT metadata pattern
-- ============================================================

-- == timecard_entries ==
CREATE POLICY "tc_entries_operators_read_own" ON timecard_entries
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tc_entries_operators_insert_own" ON timecard_entries
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tc_entries_operators_update_own" ON timecard_entries
  FOR UPDATE USING (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "tc_entries_admin_all" ON timecard_entries
  FOR ALL USING (
    ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin'))
  );

-- == timecard_weeks ==
CREATE POLICY "tc_weeks_operators_read_own" ON timecard_weeks
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tc_weeks_operators_insert_own" ON timecard_weeks
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tc_weeks_operators_update_own" ON timecard_weeks
  FOR UPDATE USING (user_id = auth.uid() AND status IN ('draft', 'rejected'));

CREATE POLICY "tc_weeks_admin_all" ON timecard_weeks
  FOR ALL USING (
    ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin'))
  );

-- == timecard_settings_v2 ==
CREATE POLICY "tc_settings_v2_read_all" ON timecard_settings_v2
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "tc_settings_v2_admin_write" ON timecard_settings_v2
  FOR ALL USING (
    ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin'))
  );

-- == timecard_gps_logs ==
CREATE POLICY "tc_gps_operators_read_own" ON timecard_gps_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tc_gps_operators_insert_own" ON timecard_gps_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tc_gps_admin_all" ON timecard_gps_logs
  FOR ALL USING (
    ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin'))
  );

-- ============================================================
-- 10. UPDATE existing timecards RLS to use JWT pattern
-- ============================================================

-- Drop old profile-subquery-based policies on timecards
DROP POLICY IF EXISTS "Admins can view all timecards" ON timecards;
DROP POLICY IF EXISTS "Admins can update all timecards" ON timecards;

-- Recreate with JWT metadata pattern
CREATE POLICY "timecards_admin_all" ON timecards
  FOR ALL USING (
    ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin'))
  );

-- ============================================================
-- 11. SEED default timecard_settings_v2 for Patriot tenant
-- ============================================================

INSERT INTO timecard_settings_v2 (tenant_id)
VALUES ('ee3d8081-cec2-47f3-ac23-bdc0bb2d142d')
ON CONFLICT (tenant_id) DO NOTHING;

-- ============================================================
-- 12. Updated_at triggers for new tables
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_timecard_entries_updated_at
  BEFORE UPDATE ON timecard_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timecard_weeks_updated_at
  BEFORE UPDATE ON timecard_weeks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timecard_settings_v2_updated_at
  BEFORE UPDATE ON timecard_settings_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
