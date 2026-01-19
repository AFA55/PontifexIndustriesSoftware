i/**
 * Database Schema: Job Orders System
 *
 * Purpose: Complete job order/ticket management system for tracking work assignments
 *
 * Features:
 * - Job creation and assignment
 * - Status tracking (scheduled, in_route, in_progress, completed)
 * - Time tracking for each status (drive time, production time, etc.)
 * - Operator data collection and submission
 * - Analytics and reporting
 */

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create job_orders table
CREATE TABLE IF NOT EXISTS job_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number TEXT UNIQUE NOT NULL,

  -- Job Information
  title TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_contact TEXT,
  job_type TEXT NOT NULL,
  location TEXT NOT NULL,
  address TEXT NOT NULL,
  description TEXT,

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  foreman_name TEXT,
  foreman_phone TEXT,
  salesman_name TEXT,

  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'assigned', 'in_route', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Scheduling
  scheduled_date DATE,
  arrival_time TEXT,
  estimated_hours DECIMAL(5, 2),

  -- Time Tracking (timestamps for status changes)
  assigned_at TIMESTAMPTZ,
  route_started_at TIMESTAMPTZ,
  work_started_at TIMESTAMPTZ,
  work_completed_at TIMESTAMPTZ,

  -- Calculated Duration Fields (in minutes)
  drive_time INTEGER, -- Time from route_started_at to work_started_at
  production_time INTEGER, -- Time from work_started_at to work_completed_at
  total_time INTEGER, -- Total time from assigned_at to work_completed_at

  -- Job Details
  required_documents TEXT[], -- Array of required document types
  equipment_needed TEXT[], -- Array of equipment
  special_equipment TEXT[],

  -- Job Site Information
  job_site_number TEXT,
  po_number TEXT,
  customer_job_number TEXT,

  -- Operator Submission Data
  work_performed TEXT,
  materials_used TEXT,
  equipment_used TEXT,
  operator_notes TEXT,
  issues_encountered TEXT,
  customer_signature TEXT,
  customer_signed_at TIMESTAMPTZ,

  -- Photos/Attachments
  photo_urls TEXT[], -- Array of photo URLs

  -- Location Tracking
  route_start_latitude DECIMAL(10, 8),
  route_start_longitude DECIMAL(11, 8),
  work_start_latitude DECIMAL(10, 8),
  work_start_longitude DECIMAL(11, 8),
  work_end_latitude DECIMAL(10, 8),
  work_end_longitude DECIMAL(11, 8),

  -- Analytics Flags
  was_on_time BOOLEAN DEFAULT true,
  within_estimated_hours BOOLEAN DEFAULT true,
  customer_satisfied BOOLEAN,

  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_job_orders_job_number ON job_orders(job_number);
CREATE INDEX IF NOT EXISTS idx_job_orders_status ON job_orders(status);
CREATE INDEX IF NOT EXISTS idx_job_orders_assigned_to ON job_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_job_orders_scheduled_date ON job_orders(scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_job_orders_created_at ON job_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_orders_deleted_at ON job_orders(deleted_at) WHERE deleted_at IS NULL;

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_job_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_job_orders_timestamp ON job_orders;
CREATE TRIGGER trigger_update_job_orders_timestamp
  BEFORE UPDATE ON job_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_job_orders_updated_at();

-- Create function to automatically calculate durations when status changes
CREATE OR REPLACE FUNCTION calculate_job_durations()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate drive time (route_started to work_started in minutes)
  IF NEW.route_started_at IS NOT NULL AND NEW.work_started_at IS NOT NULL THEN
    NEW.drive_time = EXTRACT(EPOCH FROM (NEW.work_started_at - NEW.route_started_at)) / 60;
  END IF;

  -- Calculate production time (work_started to work_completed in minutes)
  IF NEW.work_started_at IS NOT NULL AND NEW.work_completed_at IS NOT NULL THEN
    NEW.production_time = EXTRACT(EPOCH FROM (NEW.work_completed_at - NEW.work_started_at)) / 60;
  END IF;

  -- Calculate total time (assigned to completed in minutes)
  IF NEW.assigned_at IS NOT NULL AND NEW.work_completed_at IS NOT NULL THEN
    NEW.total_time = EXTRACT(EPOCH FROM (NEW.work_completed_at - NEW.assigned_at)) / 60;
  END IF;

  -- Check if within estimated hours (convert estimated_hours to minutes and compare)
  IF NEW.estimated_hours IS NOT NULL AND NEW.production_time IS NOT NULL THEN
    NEW.within_estimated_hours = NEW.production_time <= (NEW.estimated_hours * 60);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_job_durations ON job_orders;
CREATE TRIGGER trigger_calculate_job_durations
  BEFORE INSERT OR UPDATE ON job_orders
  FOR EACH ROW
  EXECUTE FUNCTION calculate_job_durations();

-- Create a view for active jobs with operator details
CREATE OR REPLACE VIEW active_job_orders AS
SELECT
  jo.*,
  p.full_name as operator_name,
  p.email as operator_email,
  p.phone as operator_phone,
  CASE
    WHEN jo.work_completed_at IS NOT NULL THEN 'Completed'
    WHEN jo.work_started_at IS NOT NULL THEN 'In Progress'
    WHEN jo.route_started_at IS NOT NULL THEN 'In Route'
    WHEN jo.assigned_at IS NOT NULL THEN 'Assigned'
    ELSE 'Scheduled'
  END as readable_status,
  ROUND((jo.drive_time::DECIMAL / 60), 2) as drive_hours,
  ROUND((jo.production_time::DECIMAL / 60), 2) as production_hours,
  ROUND((jo.total_time::DECIMAL / 60), 2) as total_hours
FROM job_orders jo
LEFT JOIN profiles p ON p.id = jo.assigned_to
WHERE jo.deleted_at IS NULL
ORDER BY
  CASE jo.status
    WHEN 'in_progress' THEN 1
    WHEN 'in_route' THEN 2
    WHEN 'assigned' THEN 3
    WHEN 'scheduled' THEN 4
    WHEN 'completed' THEN 5
    ELSE 6
  END,
  jo.scheduled_date ASC,
  jo.created_at DESC;

-- Row Level Security Policies
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;

-- Policy: Operators can view jobs assigned to them
CREATE POLICY "Operators can view assigned jobs"
  ON job_orders
  FOR SELECT
  USING (
    assigned_to = auth.uid()
    AND deleted_at IS NULL
  );

-- Policy: Operators can update jobs assigned to them
CREATE POLICY "Operators can update assigned jobs"
  ON job_orders
  FOR UPDATE
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Policy: Admins can view all jobs
CREATE POLICY "Admins can view all jobs"
  ON job_orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Admins can insert jobs
CREATE POLICY "Admins can insert jobs"
  ON job_orders
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Admins can update all jobs
CREATE POLICY "Admins can update all jobs"
  ON job_orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Admins can delete jobs (soft delete)
CREATE POLICY "Admins can delete jobs"
  ON job_orders
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Grant permissions
GRANT SELECT ON active_job_orders TO authenticated;
GRANT ALL ON job_orders TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE job_orders IS 'Complete job order/ticket management system with time tracking and analytics';
COMMENT ON COLUMN job_orders.drive_time IS 'Time spent driving to job site (in minutes)';
COMMENT ON COLUMN job_orders.production_time IS 'Time spent working on job (in minutes)';
COMMENT ON COLUMN job_orders.total_time IS 'Total time from assignment to completion (in minutes)';
COMMENT ON VIEW active_job_orders IS 'Active jobs with operator details and calculated time metrics';
