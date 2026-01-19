/**
 * Database Schema: Silica Exposure Control Plans
 *
 * Purpose: Store completed silica exposure control plan documents
 */

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create silica_exposure_plans table
CREATE TABLE IF NOT EXISTS silica_exposure_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Employee Information
  employee_name TEXT NOT NULL,
  employee_phone TEXT NOT NULL,
  employees_on_job TEXT[] NOT NULL,

  -- Work Information
  work_types TEXT[] NOT NULL,
  water_delivery_integrated TEXT NOT NULL,
  work_location TEXT NOT NULL,
  cutting_time TEXT NOT NULL,
  apf10_required TEXT NOT NULL,
  other_safety_concerns TEXT,

  -- Signature
  signature TEXT NOT NULL,
  signature_date DATE NOT NULL,

  -- PDF Storage
  pdf_data TEXT NOT NULL,  -- Base64 encoded PDF

  -- Timestamps
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_silica_plans_job_id ON silica_exposure_plans(job_id);
CREATE INDEX IF NOT EXISTS idx_silica_plans_user_id ON silica_exposure_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_silica_plans_submitted_at ON silica_exposure_plans(submitted_at DESC);

-- Row Level Security Policies
ALTER TABLE silica_exposure_plans ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own plans
CREATE POLICY "Users can view own silica plans"
  ON silica_exposure_plans
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own plans
CREATE POLICY "Users can insert own silica plans"
  ON silica_exposure_plans
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can view all plans
CREATE POLICY "Admins can view all silica plans"
  ON silica_exposure_plans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Grant permissions
GRANT ALL ON silica_exposure_plans TO authenticated;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_silica_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_silica_plans_updated_at ON silica_exposure_plans;
CREATE TRIGGER trigger_update_silica_plans_updated_at
  BEFORE UPDATE ON silica_exposure_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_silica_plans_updated_at();

COMMENT ON TABLE silica_exposure_plans IS 'Stores completed OSHA silica exposure control plan documents';
