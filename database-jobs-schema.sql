-- Job Management Schema for Pontifex Industries
-- Run this in your Supabase SQL Editor after the main schema

-- 1. Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  billing_address TEXT,
  contact_person TEXT,
  preferred_contact_method TEXT DEFAULT 'phone', -- 'phone', 'email', 'text'
  notes TEXT,
  status TEXT DEFAULT 'active', -- 'active', 'inactive'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Job Types Configuration
CREATE TABLE IF NOT EXISTS job_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  estimated_duration_hours DECIMAL(4,2), -- Default hours for this job type
  required_equipment JSONB, -- Array of equipment types needed
  base_price DECIMAL(10,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Crew Members
CREATE TABLE IF NOT EXISTS crew_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT DEFAULT 'operator', -- 'operator', 'supervisor', 'driver'
  specialties JSONB, -- Array of job types they specialize in
  hourly_rate DECIMAL(6,2),
  is_active BOOLEAN DEFAULT true,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Jobs Table (Main)
CREATE TABLE IF NOT EXISTS jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  job_type_id UUID REFERENCES job_types(id),

  -- Job Details
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'dispatched', 'in_progress', 'completed', 'cancelled', 'on_hold'

  -- Location
  address TEXT NOT NULL,
  city TEXT,
  state TEXT DEFAULT 'WA',
  zip_code TEXT,
  site_contact_name TEXT,
  site_contact_phone TEXT,

  -- Schedule
  scheduled_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  estimated_duration_hours DECIMAL(4,2),
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,

  -- Financial
  quoted_price DECIMAL(10,2),
  actual_cost DECIMAL(10,2),

  -- Notes and Instructions
  job_notes TEXT,
  safety_requirements TEXT,
  access_instructions TEXT,
  special_equipment_notes TEXT,

  -- Weather considerations
  weather_dependent BOOLEAN DEFAULT false,
  min_temperature INTEGER, -- In Fahrenheit
  no_rain BOOLEAN DEFAULT false,

  -- Completion
  completion_notes TEXT,
  customer_signature TEXT, -- Base64 encoded signature
  photos JSONB, -- Array of photo URLs

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  last_updated_by TEXT
);

-- 5. Job Crew Assignments
CREATE TABLE IF NOT EXISTS job_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE,
  role_on_job TEXT DEFAULT 'operator', -- 'lead', 'operator', 'helper'
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  hours_worked DECIMAL(4,2),
  notes TEXT,
  UNIQUE(job_id, crew_member_id)
);

-- 6. Job Equipment Assignments
CREATE TABLE IF NOT EXISTS job_equipment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  checked_out_at TIMESTAMPTZ,
  checked_in_at TIMESTAMPTZ,
  condition_out TEXT DEFAULT 'good', -- 'excellent', 'good', 'fair', 'poor'
  condition_in TEXT,
  fuel_level_out INTEGER, -- Percentage
  fuel_level_in INTEGER,
  hours_used DECIMAL(4,2),
  notes TEXT,
  UNIQUE(job_id, equipment_id)
);

-- 7. Job Status History (Track all status changes)
CREATE TABLE IF NOT EXISTS job_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  reason TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default job types for concrete cutting
INSERT INTO job_types (name, description, estimated_duration_hours, required_equipment, base_price) VALUES
('Concrete Cutting', 'Standard concrete cutting services', 4.0, '["Floor Saw", "Hand Saw"]', 500.00),
('Core Drilling', 'Concrete core drilling operations', 3.0, '["Core Drill"]', 400.00),
('Wall Sawing', 'Wall and vertical concrete cutting', 5.0, '["Wall Saw"]', 750.00),
('Slab Sawing', 'Large slab cutting operations', 6.0, '["Floor Saw"]', 800.00),
('Demo Cutting', 'Demolition cutting services', 8.0, '["Floor Saw", "Wall Saw", "Hand Saw"]', 1200.00)
ON CONFLICT (name) DO NOTHING;

-- Insert crew members based on your existing users
INSERT INTO crew_members (name, role, specialties, is_active) VALUES
('Rex Z', 'supervisor', '["Concrete Cutting", "Core Drilling", "Wall Sawing"]', true),
('Skinny H', 'operator', '["Concrete Cutting", "Slab Sawing"]', true),
('Brandon R', 'operator', '["Core Drilling", "Demo Cutting"]', true),
('Matt M', 'operator', '["Concrete Cutting", "Wall Sawing"]', true)
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_customer_id ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_job_number ON jobs(job_number);
CREATE INDEX IF NOT EXISTS idx_job_assignments_job_id ON job_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_crew_member_id ON job_assignments(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_job_equipment_job_id ON job_equipment(job_id);
CREATE INDEX IF NOT EXISTS idx_job_equipment_equipment_id ON job_equipment(equipment_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

-- Enable Row Level Security
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_status_history ENABLE ROW LEVEL SECURITY;

-- Create policies for access control
CREATE POLICY "Users can view customers" ON customers FOR SELECT USING (true);
CREATE POLICY "Users can manage customers" ON customers FOR ALL USING (true);

CREATE POLICY "Users can view job types" ON job_types FOR SELECT USING (true);
CREATE POLICY "Users can manage job types" ON job_types FOR ALL USING (true);

CREATE POLICY "Users can view crew members" ON crew_members FOR SELECT USING (true);
CREATE POLICY "Users can manage crew members" ON crew_members FOR ALL USING (true);

CREATE POLICY "Users can view jobs" ON jobs FOR SELECT USING (true);
CREATE POLICY "Users can manage jobs" ON jobs FOR ALL USING (true);

CREATE POLICY "Users can view job assignments" ON job_assignments FOR SELECT USING (true);
CREATE POLICY "Users can manage job assignments" ON job_assignments FOR ALL USING (true);

CREATE POLICY "Users can view job equipment" ON job_equipment FOR SELECT USING (true);
CREATE POLICY "Users can manage job equipment" ON job_equipment FOR ALL USING (true);

CREATE POLICY "Users can view job status history" ON job_status_history FOR SELECT USING (true);
CREATE POLICY "Users can insert job status history" ON job_status_history FOR INSERT WITH CHECK (true);

-- Function to automatically generate job numbers
CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  job_number TEXT;
BEGIN
  year_part := EXTRACT(year FROM NOW())::TEXT;

  -- Get the next sequence number for this year
  SELECT COALESCE(MAX(SUBSTRING(job_number FROM 'JOB-' || year_part || '-(\d+)')::INTEGER), 0) + 1
  INTO sequence_num
  FROM jobs
  WHERE job_number LIKE 'JOB-' || year_part || '-%';

  job_number := 'JOB-' || year_part || '-' || LPAD(sequence_num::TEXT, 3, '0');

  RETURN job_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate job numbers
CREATE OR REPLACE FUNCTION set_job_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    NEW.job_number := generate_job_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_job_number
  BEFORE INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_job_number();

-- Trigger to log status changes
CREATE OR REPLACE FUNCTION log_job_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO job_status_history (job_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.last_updated_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_job_status_change
  AFTER UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION log_job_status_change();