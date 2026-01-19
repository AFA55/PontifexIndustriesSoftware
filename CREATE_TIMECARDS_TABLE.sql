-- Create timecards table with geolocation tracking
-- This table stores clock in/out times for operators with GPS location verification

CREATE TABLE IF NOT EXISTS timecards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Clock In Data
  clock_in_time TIMESTAMPTZ NOT NULL,
  clock_in_latitude DECIMAL(10, 8),
  clock_in_longitude DECIMAL(11, 8),
  clock_in_accuracy DECIMAL(10, 2), -- GPS accuracy in meters

  -- Clock Out Data
  clock_out_time TIMESTAMPTZ,
  clock_out_latitude DECIMAL(10, 8),
  clock_out_longitude DECIMAL(11, 8),
  clock_out_accuracy DECIMAL(10, 2),

  -- Calculated Fields
  total_hours DECIMAL(5, 2),
  date DATE NOT NULL,

  -- Additional Info
  notes TEXT,
  is_approved BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_timecards_user_id ON timecards(user_id);
CREATE INDEX IF NOT EXISTS idx_timecards_date ON timecards(date);
CREATE INDEX IF NOT EXISTS idx_timecards_user_date ON timecards(user_id, date);
CREATE INDEX IF NOT EXISTS idx_timecards_clock_in ON timecards(clock_in_time);

-- Add comments
COMMENT ON TABLE timecards IS 'Employee time tracking with GPS location verification';
COMMENT ON COLUMN timecards.clock_in_latitude IS 'Latitude where user clocked in';
COMMENT ON COLUMN timecards.clock_in_longitude IS 'Longitude where user clocked in';
COMMENT ON COLUMN timecards.clock_in_accuracy IS 'GPS accuracy in meters at clock in';
COMMENT ON COLUMN timecards.total_hours IS 'Calculated work hours (clock_out - clock_in)';
COMMENT ON COLUMN timecards.is_approved IS 'Whether timecard has been approved by admin';

-- Row Level Security (RLS) Policies
ALTER TABLE timecards ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own timecards
CREATE POLICY "Users can view own timecards"
  ON timecards
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own timecards
CREATE POLICY "Users can insert own timecards"
  ON timecards
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own timecards (only if not approved)
CREATE POLICY "Users can update own timecards"
  ON timecards
  FOR UPDATE
  USING (auth.uid() = user_id AND is_approved = FALSE);

-- Policy: Admins can view all timecards
CREATE POLICY "Admins can view all timecards"
  ON timecards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Admins can update all timecards
CREATE POLICY "Admins can update all timecards"
  ON timecards
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timecards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
DROP TRIGGER IF EXISTS update_timecards_updated_at_trigger ON timecards;
CREATE TRIGGER update_timecards_updated_at_trigger
  BEFORE UPDATE ON timecards
  FOR EACH ROW
  EXECUTE FUNCTION update_timecards_updated_at();

-- Create a view for easy timecard reporting with user details
CREATE OR REPLACE VIEW timecards_with_users AS
SELECT
  t.id,
  t.user_id,
  p.full_name,
  p.email,
  p.role,
  t.date,
  t.clock_in_time,
  t.clock_out_time,
  t.total_hours,
  t.clock_in_latitude,
  t.clock_in_longitude,
  t.clock_out_latitude,
  t.clock_out_longitude,
  t.notes,
  t.is_approved,
  t.approved_by,
  t.approved_at,
  approver.full_name as approved_by_name,
  t.created_at,
  t.updated_at
FROM timecards t
LEFT JOIN profiles p ON t.user_id = p.id
LEFT JOIN profiles approver ON t.approved_by = approver.id;

COMMENT ON VIEW timecards_with_users IS 'Timecards joined with user profile information for reporting';
