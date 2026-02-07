/**
 * Migration: Equipment Damage Reporting & Repair Tracking System
 *
 * Purpose: Complete damage reporting, repair workflow, and equipment accountability
 *
 * Features:
 * - Operators report damaged equipment with photos
 * - Track "who used it last" for accountability
 * - Damage severity assessment
 * - Repair workflow from report → assessment → repair → back to service
 * - Cost tracking for repairs
 * - Equipment damage history
 *
 * Tables Created:
 * 1. equipment_damage_reports - Damage reports with photos
 * 2. equipment_repair_tracking - Repair workflow and status
 */

-- ============================================================================
-- TABLE 1: EQUIPMENT DAMAGE REPORTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS equipment_damage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Equipment & Reporter
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES auth.users(id),
  reported_by_name TEXT NOT NULL,

  -- Damage Details
  damage_title TEXT NOT NULL, -- Short description
  damage_description TEXT NOT NULL, -- Detailed description
  severity TEXT DEFAULT 'moderate' CHECK (severity IN ('minor', 'moderate', 'severe', 'total_loss')),

  -- How it happened
  incident_type TEXT, -- 'normal_wear', 'operator_error', 'accident', 'manufacturing_defect', 'unknown'
  incident_description TEXT,

  -- Location & Context
  job_order_id UUID REFERENCES job_orders(id), -- If damage occurred on a specific job
  location_of_incident TEXT,
  date_of_incident TIMESTAMPTZ,

  -- Documentation
  photo_urls TEXT[], -- Array of damage photo URLs
  video_urls TEXT[], -- Optional video documentation

  -- Damage Assessment (filled by admin/mechanic)
  assessment_notes TEXT,
  estimated_repair_cost DECIMAL(10, 2),
  estimated_downtime_days INTEGER,
  parts_needed TEXT[],

  -- Equipment Status Impact
  equipment_operable BOOLEAN DEFAULT false, -- Can it still be used?
  safety_concern BOOLEAN DEFAULT false, -- Is it a safety hazard?

  -- Admin Response
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,

  -- Status & Resolution
  status TEXT DEFAULT 'reported' CHECK (status IN (
    'reported', 'under_review', 'approved_for_repair', 'repair_in_progress',
    'repair_completed', 'equipment_retired', 'no_action_needed'
  )),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Accountability (who was using it when damaged)
  last_used_by UUID REFERENCES auth.users(id),
  last_used_by_name TEXT,
  last_job_id UUID REFERENCES job_orders(id),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE 2: EQUIPMENT REPAIR TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS equipment_repair_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Equipment & Damage Report
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  damage_report_id UUID REFERENCES equipment_damage_reports(id),

  -- Repair Details
  repair_title TEXT NOT NULL,
  repair_description TEXT NOT NULL,
  repair_type TEXT NOT NULL, -- 'corrective', 'preventive', 'replacement'

  -- Scheduling
  repair_priority TEXT DEFAULT 'normal' CHECK (repair_priority IN ('low', 'normal', 'high', 'critical')),
  scheduled_start_date TIMESTAMPTZ,
  actual_start_date TIMESTAMPTZ,
  scheduled_completion_date TIMESTAMPTZ,
  actual_completion_date TIMESTAMPTZ,

  -- Assignment
  assigned_to TEXT, -- Mechanic/Technician name or "External Vendor"
  vendor_name TEXT, -- If external repair
  vendor_contact TEXT,
  vendor_invoice_number TEXT,

  -- Work Performed
  work_performed TEXT,
  parts_replaced TEXT[],
  parts_serial_numbers TEXT[],

  -- Cost Breakdown
  labor_hours DECIMAL(5, 2),
  labor_cost DECIMAL(10, 2),
  parts_cost DECIMAL(10, 2),
  vendor_cost DECIMAL(10, 2),
  other_costs DECIMAL(10, 2),
  total_cost DECIMAL(10, 2),

  -- Documentation
  before_repair_photos TEXT[],
  after_repair_photos TEXT[],
  invoice_urls TEXT[],
  warranty_info TEXT,
  warranty_expiration_date DATE,

  -- Quality Check
  quality_check_passed BOOLEAN,
  quality_check_by UUID REFERENCES auth.users(id),
  quality_check_by_name TEXT,
  quality_check_notes TEXT,
  quality_check_date TIMESTAMPTZ,

  -- Equipment Return to Service
  returned_to_service_date TIMESTAMPTZ,
  returned_to_operator UUID REFERENCES auth.users(id),
  returned_to_operator_name TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'scheduled', 'in_progress', 'awaiting_parts',
    'completed', 'cancelled', 'deferred'
  )),

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE 3: EQUIPMENT ASSIGNMENT HISTORY (for "who used it last" tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS equipment_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Equipment & Assignment
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES auth.users(id),
  assigned_to_name TEXT NOT NULL,

  -- Assignment Period
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  returned_at TIMESTAMPTZ,

  -- Job Context
  job_order_id UUID REFERENCES job_orders(id),
  job_title TEXT,

  -- Return Condition
  return_condition TEXT CHECK (return_condition IN ('good', 'minor_wear', 'needs_maintenance', 'damaged')),
  return_notes TEXT,
  damage_report_id UUID REFERENCES equipment_damage_reports(id),

  -- Usage Statistics (snapshot at return)
  hours_used DECIMAL(10, 2),
  linear_feet_cut DECIMAL(10, 2),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Damage Reports
CREATE INDEX IF NOT EXISTS idx_damage_reports_equipment ON equipment_damage_reports(equipment_id);
CREATE INDEX IF NOT EXISTS idx_damage_reports_reported_by ON equipment_damage_reports(reported_by);
CREATE INDEX IF NOT EXISTS idx_damage_reports_status ON equipment_damage_reports(status);
CREATE INDEX IF NOT EXISTS idx_damage_reports_severity ON equipment_damage_reports(severity);
CREATE INDEX IF NOT EXISTS idx_damage_reports_created ON equipment_damage_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_damage_reports_unresolved ON equipment_damage_reports(status) WHERE status NOT IN ('repair_completed', 'equipment_retired', 'no_action_needed');

-- Repair Tracking
CREATE INDEX IF NOT EXISTS idx_repair_tracking_equipment ON equipment_repair_tracking(equipment_id);
CREATE INDEX IF NOT EXISTS idx_repair_tracking_damage_report ON equipment_repair_tracking(damage_report_id);
CREATE INDEX IF NOT EXISTS idx_repair_tracking_status ON equipment_repair_tracking(status);
CREATE INDEX IF NOT EXISTS idx_repair_tracking_priority ON equipment_repair_tracking(repair_priority);
CREATE INDEX IF NOT EXISTS idx_repair_tracking_scheduled ON equipment_repair_tracking(scheduled_start_date);

-- Assignment History
CREATE INDEX IF NOT EXISTS idx_assignment_history_equipment ON equipment_assignment_history(equipment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_assigned_to ON equipment_assignment_history(assigned_to);
CREATE INDEX IF NOT EXISTS idx_assignment_history_job ON equipment_assignment_history(job_order_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_dates ON equipment_assignment_history(assigned_at DESC, returned_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE equipment_damage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_repair_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_assignment_history ENABLE ROW LEVEL SECURITY;

-- Damage Reports: Operators can create and view their own reports, Admins see all
CREATE POLICY "Operators create damage reports"
  ON equipment_damage_reports FOR INSERT
  WITH CHECK (reported_by = auth.uid());

CREATE POLICY "Operators view their own damage reports"
  ON equipment_damage_reports FOR SELECT
  USING (
    reported_by = auth.uid()
    OR last_used_by = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins manage all damage reports"
  ON equipment_damage_reports FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Repair Tracking: Admins only
CREATE POLICY "Admins manage repair tracking"
  ON equipment_repair_tracking FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Operators view repair tracking for their equipment"
  ON equipment_repair_tracking FOR SELECT
  USING (
    equipment_id IN (SELECT id FROM equipment WHERE assigned_to = auth.uid())
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Assignment History: Operators view their own history, Admins see all
CREATE POLICY "Operators view their assignment history"
  ON equipment_assignment_history FOR SELECT
  USING (
    assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins manage all assignment history"
  ON equipment_assignment_history FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "System creates assignment history"
  ON equipment_assignment_history FOR INSERT
  WITH CHECK (true); -- Allow system to create records

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

-- Update updated_at timestamps
CREATE OR REPLACE FUNCTION update_damage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER damage_reports_updated_at
  BEFORE UPDATE ON equipment_damage_reports
  FOR EACH ROW EXECUTE FUNCTION update_damage_updated_at();

CREATE TRIGGER repair_tracking_updated_at
  BEFORE UPDATE ON equipment_repair_tracking
  FOR EACH ROW EXECUTE FUNCTION update_damage_updated_at();

-- Auto-calculate total repair cost
CREATE OR REPLACE FUNCTION calculate_repair_total_cost()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_cost = COALESCE(NEW.labor_cost, 0) +
                   COALESCE(NEW.parts_cost, 0) +
                   COALESCE(NEW.vendor_cost, 0) +
                   COALESCE(NEW.other_costs, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_repair_cost_trigger
  BEFORE INSERT OR UPDATE ON equipment_repair_tracking
  FOR EACH ROW EXECUTE FUNCTION calculate_repair_total_cost();

-- Automatically update equipment status when damage is reported
CREATE OR REPLACE FUNCTION update_equipment_status_on_damage()
RETURNS TRIGGER AS $$
BEGIN
  -- If severe damage or safety concern, set equipment to maintenance
  IF NEW.severity IN ('severe', 'total_loss') OR NEW.safety_concern = true THEN
    UPDATE equipment
    SET status = 'maintenance',
        updated_at = NOW()
    WHERE id = NEW.equipment_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER equipment_status_on_damage_trigger
  AFTER INSERT ON equipment_damage_reports
  FOR EACH ROW EXECUTE FUNCTION update_equipment_status_on_damage();

-- Track assignment history when equipment is assigned/reassigned
CREATE OR REPLACE FUNCTION track_equipment_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- If equipment is being assigned (assigned_to changes from NULL or different operator)
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to) THEN
    -- Close previous assignment if exists
    IF OLD.assigned_to IS NOT NULL THEN
      UPDATE equipment_assignment_history
      SET returned_at = NOW()
      WHERE equipment_id = NEW.id
        AND assigned_to = OLD.assigned_to
        AND returned_at IS NULL;
    END IF;

    -- Create new assignment record
    INSERT INTO equipment_assignment_history (
      equipment_id, assigned_to, assigned_to_name, assigned_at
    )
    SELECT
      NEW.id,
      NEW.assigned_to,
      up.full_name,
      NOW()
    FROM user_profiles up
    WHERE up.id = NEW.assigned_to;
  END IF;

  -- If equipment is being unassigned (assigned_to becomes NULL)
  IF NEW.assigned_to IS NULL AND OLD.assigned_to IS NOT NULL THEN
    UPDATE equipment_assignment_history
    SET returned_at = NOW()
    WHERE equipment_id = NEW.id
      AND assigned_to = OLD.assigned_to
      AND returned_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_equipment_assignment_trigger
  AFTER UPDATE ON equipment
  FOR EACH ROW
  WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION track_equipment_assignment();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get who last used equipment
CREATE OR REPLACE FUNCTION get_last_equipment_user(p_equipment_id UUID)
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  last_used_date TIMESTAMPTZ,
  job_title TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ah.assigned_to,
    ah.assigned_to_name,
    COALESCE(ah.returned_at, ah.assigned_at) as last_used_date,
    ah.job_title
  FROM equipment_assignment_history ah
  WHERE ah.equipment_id = p_equipment_id
  ORDER BY COALESCE(ah.returned_at, ah.assigned_at) DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get equipment damage history count
CREATE OR REPLACE FUNCTION get_equipment_damage_count(p_equipment_id UUID)
RETURNS INTEGER AS $$
DECLARE
  damage_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO damage_count
  FROM equipment_damage_reports
  WHERE equipment_id = p_equipment_id;

  RETURN damage_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON equipment_damage_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON equipment_repair_tracking TO authenticated;
GRANT SELECT, INSERT ON equipment_assignment_history TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE equipment_damage_reports IS 'Operator-submitted damage reports with photos and severity assessment';
COMMENT ON TABLE equipment_repair_tracking IS 'Complete repair workflow tracking from damage assessment to return to service';
COMMENT ON TABLE equipment_assignment_history IS 'Audit trail of all equipment assignments for accountability';

COMMENT ON COLUMN equipment_damage_reports.severity IS 'minor: cosmetic, moderate: affects performance, severe: unsafe/inoperable, total_loss: beyond repair';
COMMENT ON COLUMN equipment_damage_reports.equipment_operable IS 'Can the equipment still be used despite damage?';
COMMENT ON COLUMN equipment_damage_reports.safety_concern IS 'Does the damage pose a safety risk?';

COMMENT ON COLUMN equipment_repair_tracking.repair_type IS 'corrective: fix damage, preventive: scheduled maintenance, replacement: part/whole unit replacement';
COMMENT ON COLUMN equipment_repair_tracking.quality_check_passed IS 'Was equipment inspected and passed quality check after repair?';

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'EQUIPMENT DAMAGE REPORTING SYSTEM CREATED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tables Created:';
  RAISE NOTICE '  - equipment_damage_reports';
  RAISE NOTICE '  - equipment_repair_tracking';
  RAISE NOTICE '  - equipment_assignment_history';
  RAISE NOTICE '';
  RAISE NOTICE 'Features Available:';
  RAISE NOTICE '  ✓ Damage reporting with photos';
  RAISE NOTICE '  ✓ "Who used it last" tracking';
  RAISE NOTICE '  ✓ Complete repair workflow';
  RAISE NOTICE '  ✓ Cost tracking for repairs';
  RAISE NOTICE '  ✓ Equipment accountability';
  RAISE NOTICE '========================================';
END $$;
