/**
 * Database Schema: Operator Status Tracking System
 *
 * Purpose: Track operator status throughout their workday in real-time
 *
 * Status Flow:
 * 1. clocked_in - Operator starts their day
 * 2. en_route - Traveling to jobsite
 * 3. in_progress - Working on job
 * 4. job_completed - Job finished
 * 5. clocked_out - End of day
 */

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create operator_status_history table
-- This tracks every status change with timestamp and location
CREATE TABLE IF NOT EXISTS operator_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timecard_id UUID REFERENCES timecards(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('clocked_in', 'en_route', 'in_progress', 'job_completed', 'clocked_out')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  accuracy DECIMAL(10, 2),
  notes TEXT,
  job_id UUID, -- Reference to job/ticket if applicable
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_operator_status_user_id ON operator_status_history(user_id);
CREATE INDEX IF NOT EXISTS idx_operator_status_timestamp ON operator_status_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_operator_status_timecard ON operator_status_history(timecard_id);

-- Create a view for current operator status
-- This shows the latest status for each operator
CREATE OR REPLACE VIEW current_operator_status AS
SELECT DISTINCT ON (osh.user_id)
  osh.id,
  osh.user_id,
  osh.timecard_id,
  osh.status,
  osh.timestamp,
  osh.latitude,
  osh.longitude,
  osh.accuracy,
  osh.notes,
  osh.job_id,
  p.name as operator_name,
  p.email as operator_email,
  p.role as operator_role,
  tc.clock_in_time,
  tc.date as shift_date,
  EXTRACT(EPOCH FROM (NOW() - tc.clock_in_time)) / 3600 as hours_worked
FROM operator_status_history osh
JOIN profiles p ON p.id = osh.user_id
LEFT JOIN timecards tc ON tc.id = osh.timecard_id
WHERE osh.status != 'clocked_out' -- Only show active operators
ORDER BY osh.user_id, osh.timestamp DESC;

-- Row Level Security Policies
ALTER TABLE operator_status_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own status history
CREATE POLICY "Users can view own status history"
  ON operator_status_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own status updates
CREATE POLICY "Users can insert own status updates"
  ON operator_status_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can view all status history
CREATE POLICY "Admins can view all status history"
  ON operator_status_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Grant permissions
GRANT SELECT ON current_operator_status TO authenticated;
GRANT ALL ON operator_status_history TO authenticated;

-- Add status tracking fields to timecards table (if not exists)
-- This helps track the current status without needing to query history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timecards'
    AND column_name = 'current_status'
  ) THEN
    ALTER TABLE timecards
    ADD COLUMN current_status TEXT DEFAULT 'clocked_in'
    CHECK (current_status IN ('clocked_in', 'en_route', 'in_progress', 'job_completed', 'clocked_out'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timecards'
    AND column_name = 'last_status_update'
  ) THEN
    ALTER TABLE timecards
    ADD COLUMN last_status_update TIMESTAMPTZ;
  END IF;
END $$;

-- Create function to automatically update timecard status
CREATE OR REPLACE FUNCTION update_timecard_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the timecard's current status
  UPDATE timecards
  SET
    current_status = NEW.status,
    last_status_update = NEW.timestamp
  WHERE id = NEW.timecard_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update timecard when status changes
DROP TRIGGER IF EXISTS trigger_update_timecard_status ON operator_status_history;
CREATE TRIGGER trigger_update_timecard_status
  AFTER INSERT ON operator_status_history
  FOR EACH ROW
  EXECUTE FUNCTION update_timecard_status();

COMMENT ON TABLE operator_status_history IS 'Tracks operator status changes throughout their workday with GPS location';
COMMENT ON VIEW current_operator_status IS 'Shows current status of all active (not clocked out) operators';
