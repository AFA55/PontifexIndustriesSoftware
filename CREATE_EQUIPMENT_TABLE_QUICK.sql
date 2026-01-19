-- Quick Equipment Usage Table Setup
-- Copy and paste this entire file into Supabase SQL Editor

CREATE TABLE IF NOT EXISTS equipment_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES profiles(id),
  equipment_type TEXT NOT NULL,
  equipment_id TEXT,
  linear_feet_cut DECIMAL(10, 2) DEFAULT 0,
  task_type TEXT NOT NULL,
  difficulty_level TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty_level IN ('easy', 'medium', 'hard', 'extreme')),
  difficulty_notes TEXT,
  blade_type TEXT,
  blades_used INTEGER DEFAULT 0,
  blade_wear_notes TEXT,
  hydraulic_hose_used_ft DECIMAL(10, 2) DEFAULT 0,
  water_hose_used_ft DECIMAL(10, 2) DEFAULT 0,
  power_hours DECIMAL(10, 2) DEFAULT 0,
  location_changes INTEGER DEFAULT 0,
  setup_time_minutes DECIMAL(10, 2) DEFAULT 0,
  feet_per_hour DECIMAL(10, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_equipment_usage_job ON equipment_usage(job_order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_usage_operator ON equipment_usage(operator_id);
CREATE INDEX IF NOT EXISTS idx_equipment_usage_equipment_type ON equipment_usage(equipment_type);
CREATE INDEX IF NOT EXISTS idx_equipment_usage_created_at ON equipment_usage(created_at);

-- Enable RLS
ALTER TABLE equipment_usage ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Operators can view own equipment usage"
  ON equipment_usage FOR SELECT
  USING (
    auth.uid() = operator_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Operators can insert own equipment usage"
  ON equipment_usage FOR INSERT
  WITH CHECK (auth.uid() = operator_id);

CREATE POLICY "Operators can update own equipment usage"
  ON equipment_usage FOR UPDATE
  USING (auth.uid() = operator_id);

CREATE POLICY "Admins can do everything"
  ON equipment_usage FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Auto-update timestamp trigger
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

-- Verify the table was created
SELECT 'Equipment usage table created successfully!' as message;
