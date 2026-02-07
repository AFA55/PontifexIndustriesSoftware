/**
 * Migration: Create Equipment Usage Tracking System
 *
 * Purpose: Track equipment usage, blade wear, resource consumption per job
 * This enables accurate job costing and operator performance analysis
 *
 * Tables:
 * - equipment_usage: Tracks equipment usage per job with detailed metrics
 *
 * Key Metrics Tracked:
 * - Linear feet cut (categorized by task type)
 * - Blade usage and wear
 * - Job difficulty rating (affects productivity calculations)
 * - Hydraulic hose usage (feet)
 * - Water hose usage (feet)
 * - Power consumption (hours)
 */

-- =====================================================
-- EQUIPMENT USAGE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS equipment_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Job & Operator References
  job_order_id UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES profiles(id),

  -- Equipment Information
  equipment_type TEXT NOT NULL, -- 'hand_saw', 'wall_saw', 'core_drill', 'slab_saw', etc.
  equipment_id TEXT, -- Specific equipment identifier (e.g., "BROKK-001")

  -- Linear Footage Tracking
  linear_feet_cut DECIMAL(10, 2) DEFAULT 0,
  task_type TEXT NOT NULL, -- 'core_drilling', 'slab_sawing', 'wall_sawing', 'hand_sawing', etc.

  -- Job Difficulty (affects production rates)
  difficulty_level TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty_level IN ('easy', 'medium', 'hard', 'extreme')),
  difficulty_notes TEXT, -- Why was it difficult? (e.g., "tight space", "thick rebar", "multiple location changes")

  -- Blade Tracking
  blade_type TEXT, -- e.g., "14-inch diamond", "concrete blade"
  blades_used INTEGER DEFAULT 0, -- Number of blades consumed
  blade_wear_notes TEXT, -- e.g., "1 blade used 50%, 1 blade fully worn"

  -- Resource Consumption
  hydraulic_hose_used_ft DECIMAL(10, 2) DEFAULT 0, -- Feet of hydraulic hose used
  water_hose_used_ft DECIMAL(10, 2) DEFAULT 0, -- Feet of water hose used
  power_hours DECIMAL(10, 2) DEFAULT 0, -- Hours of power used (for cost calculation)

  -- Movement & Setup Time
  location_changes INTEGER DEFAULT 0, -- Number of times equipment was moved
  setup_time_minutes DECIMAL(10, 2) DEFAULT 0, -- Time spent setting up equipment

  -- Performance Metrics (auto-calculated)
  feet_per_hour DECIMAL(10, 2), -- Linear feet cut per hour

  -- Additional Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_equipment_usage_job ON equipment_usage(job_order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_usage_operator ON equipment_usage(operator_id);
CREATE INDEX IF NOT EXISTS idx_equipment_usage_equipment_type ON equipment_usage(equipment_type);
CREATE INDEX IF NOT EXISTS idx_equipment_usage_task_type ON equipment_usage(task_type);
CREATE INDEX IF NOT EXISTS idx_equipment_usage_difficulty ON equipment_usage(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_equipment_usage_created_at ON equipment_usage(created_at);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE equipment_usage ENABLE ROW LEVEL SECURITY;

-- Policy: Operators can view their own equipment usage
CREATE POLICY "Operators can view own equipment usage"
  ON equipment_usage
  FOR SELECT
  USING (
    auth.uid() = operator_id
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Operators can insert their own equipment usage
CREATE POLICY "Operators can insert own equipment usage"
  ON equipment_usage
  FOR INSERT
  WITH CHECK (auth.uid() = operator_id);

-- Policy: Operators can update their own equipment usage
CREATE POLICY "Operators can update own equipment usage"
  ON equipment_usage
  FOR UPDATE
  USING (auth.uid() = operator_id);

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage all equipment usage"
  ON equipment_usage
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_equipment_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER equipment_usage_updated_at
  BEFORE UPDATE ON equipment_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_usage_updated_at();

-- Auto-calculate feet per hour
CREATE OR REPLACE FUNCTION calculate_feet_per_hour()
RETURNS TRIGGER AS $$
BEGIN
  -- Only calculate if we have both linear feet and setup time
  IF NEW.linear_feet_cut > 0 AND NEW.setup_time_minutes > 0 THEN
    NEW.feet_per_hour = (NEW.linear_feet_cut / (NEW.setup_time_minutes / 60.0));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER equipment_usage_calculate_fph
  BEFORE INSERT OR UPDATE ON equipment_usage
  FOR EACH ROW
  EXECUTE FUNCTION calculate_feet_per_hour();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE equipment_usage IS 'Tracks equipment usage, resource consumption, and performance metrics per job';
COMMENT ON COLUMN equipment_usage.difficulty_level IS 'Job difficulty affects production rates: easy (open areas, simple cuts), medium (standard job), hard (tight spaces, thick material), extreme (very difficult access/conditions)';
COMMENT ON COLUMN equipment_usage.linear_feet_cut IS 'Total linear feet cut with this equipment on this job';
COMMENT ON COLUMN equipment_usage.hydraulic_hose_used_ft IS 'Feet of hydraulic hose used (affects job cost)';
COMMENT ON COLUMN equipment_usage.water_hose_used_ft IS 'Feet of water hose used (affects job cost)';
COMMENT ON COLUMN equipment_usage.power_hours IS 'Hours of power consumption (for cost calculation)';
COMMENT ON COLUMN equipment_usage.location_changes IS 'Number of times equipment was moved between cut locations (affects productivity)';
COMMENT ON COLUMN equipment_usage.feet_per_hour IS 'Auto-calculated: linear feet cut per hour (production rate)';

-- =====================================================
-- GRANTS
-- =====================================================
GRANT SELECT, INSERT, UPDATE ON equipment_usage TO authenticated;

-- =====================================================
-- VERIFICATION
-- =====================================================
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'equipment_usage'
ORDER BY ordinal_position;
