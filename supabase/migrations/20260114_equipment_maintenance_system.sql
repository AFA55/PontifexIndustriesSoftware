/**
 * Migration: Equipment Maintenance Management System
 *
 * Purpose: Complete preventive maintenance scheduling, alerts, and history tracking
 *
 * Features:
 * - Maintenance schedules (interval-based and date-based)
 * - Automated maintenance due calculations
 * - Operator alerts for upcoming maintenance
 * - Maintenance history tracking
 * - Turn-in workflow for equipment needing service
 *
 * Tables Created:
 * 1. equipment_maintenance_schedules - Define maintenance intervals
 * 2. equipment_maintenance_history - Track all maintenance performed
 * 3. equipment_maintenance_alerts - Active alerts for operators
 */

-- ============================================================================
-- TABLE 1: EQUIPMENT MAINTENANCE SCHEDULES
-- ============================================================================
CREATE TABLE IF NOT EXISTS equipment_maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Equipment Reference
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,

  -- Schedule Configuration
  maintenance_type TEXT NOT NULL, -- 'oil_change', 'blade_inspection', 'general_service', 'calibration', etc.
  description TEXT,

  -- Interval-Based Scheduling (choose one or both)
  interval_hours DECIMAL(10, 2), -- Service every X hours (e.g., 100 hours)
  interval_days INTEGER, -- Service every X days (e.g., 90 days)
  interval_linear_feet DECIMAL(10, 2), -- Service every X linear feet cut (e.g., 5000 ft)

  -- Alert Thresholds (when to warn operator)
  alert_hours_before DECIMAL(10, 2) DEFAULT 5, -- Alert when 5 hours remaining
  alert_days_before INTEGER DEFAULT 7, -- Alert when 7 days remaining
  alert_feet_before DECIMAL(10, 2) DEFAULT 500, -- Alert when 500 ft remaining

  -- Last Maintenance
  last_maintenance_date TIMESTAMPTZ,
  last_mainten
  nce_hours DECIMAL(10, 2) DEFAULT 0,
  last_maintenance_feet DECIMAL(10, 2) DEFAULT 0,

  -- Next Maintenance (auto-calculated)
  next_maintenance_date TIMESTAMPTZ,
  next_maintenance_hours DECIMAL(10, 2),
  next_maintenance_feet DECIMAL(10, 2),

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE 2: EQUIPMENT MAINTENANCE HISTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS equipment_maintenance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Equipment Reference
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES equipment_maintenance_schedules(id) ON DELETE SET NULL,

  -- Maintenance Details
  maintenance_type TEXT NOT NULL,
  description TEXT,

  -- Execution
  scheduled_date TIMESTAMPTZ,
  completed_date TIMESTAMPTZ,
  performed_by UUID REFERENCES auth.users(id),
  performed_by_name TEXT,

  -- Metrics at Time of Maintenance
  equipment_hours_at_maintenance DECIMAL(10, 2),
  equipment_feet_at_maintenance DECIMAL(10, 2),

  -- Cost Tracking
  labor_hours DECIMAL(5, 2),
  labor_cost DECIMAL(10, 2),
  parts_cost DECIMAL(10, 2),
  total_cost DECIMAL(10, 2),

  -- Documentation
  notes TEXT,
  issues_found TEXT,
  parts_replaced TEXT[],
  photo_urls TEXT[],

  -- Next Maintenance Scheduled
  next_maintenance_date TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE 3: EQUIPMENT MAINTENANCE ALERTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS equipment_maintenance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Equipment & Operator
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  operator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES equipment_maintenance_schedules(id) ON DELETE CASCADE,

  -- Alert Details
  alert_type TEXT NOT NULL CHECK (alert_type IN ('maintenance_due', 'maintenance_overdue', 'turn_in_requested')),
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),

  -- Message
  title TEXT NOT NULL,
  message TEXT NOT NULL,

  -- Due Information
  due_date TIMESTAMPTZ,
  hours_until_due DECIMAL(10, 2),
  feet_until_due DECIMAL(10, 2),

  -- Status
  is_read BOOLEAN DEFAULT false,
  is_acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE 4: EQUIPMENT TURN-IN REQUESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS equipment_turn_in_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Equipment & People
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_by_name TEXT NOT NULL,

  -- Request Details
  reason TEXT NOT NULL, -- 'scheduled_maintenance', 'damaged', 'not_working_properly', 'other'
  description TEXT NOT NULL,
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'critical')),

  -- Photos
  photo_urls TEXT[],

  -- Admin Response
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in_service', 'completed', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,

  -- Service Tracking
  service_started_at TIMESTAMPTZ,
  service_completed_at TIMESTAMPTZ,
  service_performed_by TEXT,
  service_cost DECIMAL(10, 2),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Maintenance Schedules
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_equipment ON equipment_maintenance_schedules(equipment_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_active ON equipment_maintenance_schedules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_next_date ON equipment_maintenance_schedules(next_maintenance_date) WHERE is_active = true;

-- Maintenance History
CREATE INDEX IF NOT EXISTS idx_maintenance_history_equipment ON equipment_maintenance_history(equipment_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_history_schedule ON equipment_maintenance_history(schedule_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_history_status ON equipment_maintenance_history(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_history_completed ON equipment_maintenance_history(completed_date);

-- Maintenance Alerts
CREATE INDEX IF NOT EXISTS idx_maintenance_alerts_equipment ON equipment_maintenance_alerts(equipment_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_alerts_operator ON equipment_maintenance_alerts(operator_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_alerts_unread ON equipment_maintenance_alerts(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_maintenance_alerts_unresolved ON equipment_maintenance_alerts(is_resolved) WHERE is_resolved = false;

-- Turn-In Requests
CREATE INDEX IF NOT EXISTS idx_turn_in_equipment ON equipment_turn_in_requests(equipment_id);
CREATE INDEX IF NOT EXISTS idx_turn_in_requested_by ON equipment_turn_in_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_turn_in_status ON equipment_turn_in_requests(status);
CREATE INDEX IF NOT EXISTS idx_turn_in_pending ON equipment_turn_in_requests(status) WHERE status = 'pending';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE equipment_maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_maintenance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_maintenance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_turn_in_requests ENABLE ROW LEVEL SECURITY;

-- Maintenance Schedules: Operators can view for their equipment, Admins manage all
CREATE POLICY "Operators view maintenance schedules for their equipment"
  ON equipment_maintenance_schedules FOR SELECT
  USING (
    equipment_id IN (
      SELECT id FROM equipment WHERE assigned_to = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins manage all maintenance schedules"
  ON equipment_maintenance_schedules FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Maintenance History: Operators can view their equipment history, Admins see all
CREATE POLICY "Operators view maintenance history for their equipment"
  ON equipment_maintenance_history FOR SELECT
  USING (
    equipment_id IN (
      SELECT id FROM equipment WHERE assigned_to = auth.uid()
    )
    OR performed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins manage all maintenance history"
  ON equipment_maintenance_history FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Maintenance Alerts: Operators see their own alerts, Admins see all
CREATE POLICY "Operators view their own alerts"
  ON equipment_maintenance_alerts FOR SELECT
  USING (operator_id = auth.uid() OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Operators update their own alerts"
  ON equipment_maintenance_alerts FOR UPDATE
  USING (operator_id = auth.uid());

CREATE POLICY "Admins manage all alerts"
  ON equipment_maintenance_alerts FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Turn-In Requests: Operators can create and view their own, Admins manage all
CREATE POLICY "Operators create turn-in requests"
  ON equipment_turn_in_requests FOR INSERT
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Operators view their own turn-in requests"
  ON equipment_turn_in_requests FOR SELECT
  USING (requested_by = auth.uid() OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins manage all turn-in requests"
  ON equipment_turn_in_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

-- Update updated_at timestamps
CREATE OR REPLACE FUNCTION update_maintenance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER maintenance_schedules_updated_at
  BEFORE UPDATE ON equipment_maintenance_schedules
  FOR EACH ROW EXECUTE FUNCTION update_maintenance_updated_at();

CREATE TRIGGER maintenance_history_updated_at
  BEFORE UPDATE ON equipment_maintenance_history
  FOR EACH ROW EXECUTE FUNCTION update_maintenance_updated_at();

CREATE TRIGGER maintenance_alerts_updated_at
  BEFORE UPDATE ON equipment_maintenance_alerts
  FOR EACH ROW EXECUTE FUNCTION update_maintenance_updated_at();

CREATE TRIGGER turn_in_requests_updated_at
  BEFORE UPDATE ON equipment_turn_in_requests
  FOR EACH ROW EXECUTE FUNCTION update_maintenance_updated_at();

-- Auto-calculate next maintenance dates
CREATE OR REPLACE FUNCTION calculate_next_maintenance()
RETURNS TRIGGER AS $$
BEGIN
  -- If interval_days is set, calculate next date
  IF NEW.interval_days IS NOT NULL AND NEW.last_maintenance_date IS NOT NULL THEN
    NEW.next_maintenance_date = NEW.last_maintenance_date + (NEW.interval_days || ' days')::INTERVAL;
  END IF;

  -- If interval_hours is set, calculate next hours
  IF NEW.interval_hours IS NOT NULL AND NEW.last_maintenance_hours IS NOT NULL THEN
    NEW.next_maintenance_hours = NEW.last_maintenance_hours + NEW.interval_hours;
  END IF;

  -- If interval_linear_feet is set, calculate next feet
  IF NEW.interval_linear_feet IS NOT NULL AND NEW.last_maintenance_feet IS NOT NULL THEN
    NEW.next_maintenance_feet = NEW.last_maintenance_feet + NEW.interval_linear_feet;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_next_maintenance_trigger
  BEFORE INSERT OR UPDATE ON equipment_maintenance_schedules
  FOR EACH ROW EXECUTE FUNCTION calculate_next_maintenance();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to create maintenance alert for operator
CREATE OR REPLACE FUNCTION create_maintenance_alert(
  p_equipment_id UUID,
  p_operator_id UUID,
  p_schedule_id UUID,
  p_alert_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_severity TEXT DEFAULT 'warning'
)
RETURNS UUID AS $$
DECLARE
  v_alert_id UUID;
BEGIN
  INSERT INTO equipment_maintenance_alerts (
    equipment_id, operator_id, schedule_id,
    alert_type, severity, title, message
  ) VALUES (
    p_equipment_id, p_operator_id, p_schedule_id,
    p_alert_type, p_severity, p_title, p_message
  ) RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check and create alerts for due maintenance
CREATE OR REPLACE FUNCTION check_maintenance_due()
RETURNS void AS $$
DECLARE
  schedule_record RECORD;
  equipment_record RECORD;
  alert_message TEXT;
BEGIN
  -- Loop through active maintenance schedules
  FOR schedule_record IN
    SELECT * FROM equipment_maintenance_schedules WHERE is_active = true
  LOOP
    -- Get equipment details
    SELECT * INTO equipment_record FROM equipment WHERE id = schedule_record.equipment_id;

    -- Check if maintenance is due (simplified - in production, compare current usage)
    IF schedule_record.next_maintenance_date IS NOT NULL
       AND schedule_record.next_maintenance_date <= NOW() + (schedule_record.alert_days_before || ' days')::INTERVAL THEN

      -- Create alert if equipment is assigned
      IF equipment_record.assigned_to IS NOT NULL THEN
        alert_message := 'Your ' || equipment_record.name || ' needs ' || schedule_record.maintenance_type || ' maintenance';

        -- Check if alert already exists
        IF NOT EXISTS (
          SELECT 1 FROM equipment_maintenance_alerts
          WHERE equipment_id = schedule_record.equipment_id
          AND schedule_id = schedule_record.id
          AND is_resolved = false
        ) THEN
          PERFORM create_maintenance_alert(
            schedule_record.equipment_id,
            equipment_record.assigned_to::UUID,
            schedule_record.id,
            'maintenance_due',
            'Maintenance Due',
            alert_message,
            'warning'
          );
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON equipment_maintenance_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE ON equipment_maintenance_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON equipment_maintenance_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON equipment_turn_in_requests TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE equipment_maintenance_schedules IS 'Defines preventive maintenance schedules for equipment with interval-based triggers';
COMMENT ON TABLE equipment_maintenance_history IS 'Complete audit trail of all maintenance performed on equipment';
COMMENT ON TABLE equipment_maintenance_alerts IS 'Active alerts for operators about upcoming or overdue maintenance';
COMMENT ON TABLE equipment_turn_in_requests IS 'Operator requests to turn in equipment for maintenance or repair';

COMMENT ON COLUMN equipment_maintenance_schedules.interval_hours IS 'Service interval based on operating hours (e.g., every 100 hours)';
COMMENT ON COLUMN equipment_maintenance_schedules.interval_days IS 'Service interval based on calendar days (e.g., every 90 days)';
COMMENT ON COLUMN equipment_maintenance_schedules.interval_linear_feet IS 'Service interval based on linear feet cut (e.g., every 5000 ft)';

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'EQUIPMENT MAINTENANCE SYSTEM CREATED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tables Created:';
  RAISE NOTICE '  - equipment_maintenance_schedules';
  RAISE NOTICE '  - equipment_maintenance_history';
  RAISE NOTICE '  - equipment_maintenance_alerts';
  RAISE NOTICE '  - equipment_turn_in_requests';
  RAISE NOTICE '';
  RAISE NOTICE 'Features Available:';
  RAISE NOTICE '  ✓ Preventive maintenance scheduling';
  RAISE NOTICE '  ✓ Automated maintenance alerts';
  RAISE NOTICE '  ✓ Turn-in workflow for equipment';
  RAISE NOTICE '  ✓ Complete maintenance history';
  RAISE NOTICE '  ✓ Cost tracking per maintenance';
  RAISE NOTICE '========================================';
END $$;
