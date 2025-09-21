-- Phase 2: Daily Job Tickets & Equipment Tracking
-- Run this AFTER running database-jobs-schema.sql

-- 1. Daily Job Tickets
CREATE TABLE IF NOT EXISTS daily_job_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE,

  -- Date & Time Tracking
  work_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  break_duration_minutes INTEGER DEFAULT 0,
  total_hours_worked DECIMAL(4,2),

  -- Work Completed
  cutting_completed TEXT,
  linear_feet_cut DECIMAL(8,2),
  square_feet_cut DECIMAL(8,2),
  holes_drilled INTEGER DEFAULT 0,

  -- Material Conditions
  concrete_thickness_inches DECIMAL(4,1),
  rebar_present BOOLEAN DEFAULT false,
  rebar_density TEXT,
  concrete_hardness TEXT DEFAULT 'normal',

  -- Weather & Site Conditions
  weather_conditions TEXT,
  site_conditions TEXT,
  access_issues TEXT,

  -- Equipment Used
  equipment_scanned JSONB,

  -- Blade Usage
  blades_used JSONB,

  -- Issues & Notes
  equipment_issues TEXT,
  safety_incidents TEXT,
  delays_encountered TEXT,
  notes TEXT,

  -- Completion Status
  work_completed BOOLEAN DEFAULT false,
  ready_for_next_day BOOLEAN DEFAULT true,
  requires_follow_up BOOLEAN DEFAULT false,

  -- Photos
  progress_photos JSONB,

  -- Submission
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(job_id, crew_member_id, work_date)
);

-- 2. Blade Database
CREATE TABLE IF NOT EXISTS blades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blade_id TEXT NOT NULL UNIQUE,
  blade_type TEXT NOT NULL,
  blade_size TEXT NOT NULL,
  manufacturer TEXT,
  model_number TEXT,

  -- Specifications
  max_cutting_depth DECIMAL(4,2),
  recommended_rpm INTEGER,
  material_types JSONB,

  -- Tracking
  purchase_date DATE,
  purchase_cost DECIMAL(8,2),
  current_condition TEXT DEFAULT 'new',

  -- Usage Statistics
  total_linear_feet_cut DECIMAL(10,2) DEFAULT 0,
  total_hours_used DECIMAL(8,2) DEFAULT 0,
  jobs_used_on INTEGER DEFAULT 0,

  -- Current Status
  current_location TEXT,
  assigned_to_equipment TEXT,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Blade Usage Logs
CREATE TABLE IF NOT EXISTS blade_usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  daily_ticket_id UUID REFERENCES daily_job_tickets(id) ON DELETE CASCADE,
  blade_id UUID REFERENCES blades(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,

  -- Usage Details
  start_condition TEXT DEFAULT 'good',
  end_condition TEXT DEFAULT 'good',
  linear_feet_cut DECIMAL(8,2) DEFAULT 0,
  cutting_time_minutes INTEGER DEFAULT 0,

  -- Cutting Conditions
  material_cut TEXT DEFAULT 'concrete',
  material_hardness TEXT DEFAULT 'normal',
  rebar_encountered BOOLEAN DEFAULT false,
  cutting_depth DECIMAL(4,2),

  -- Performance
  cutting_speed DECIMAL(6,2),
  blade_performance TEXT DEFAULT 'good',

  -- Issues
  problems_encountered TEXT,
  blade_damage TEXT,
  replacement_needed BOOLEAN DEFAULT false,

  -- Photos
  blade_photos JSONB,

  logged_at TIMESTAMPTZ DEFAULT NOW(),
  logged_by TEXT NOT NULL
);

-- 4. Add columns to qr_scan_logs if they don't exist
ALTER TABLE qr_scan_logs ADD COLUMN IF NOT EXISTS daily_ticket_id UUID REFERENCES daily_job_tickets(id);
ALTER TABLE qr_scan_logs ADD COLUMN IF NOT EXISTS verified_equipment BOOLEAN DEFAULT false;
ALTER TABLE qr_scan_logs ADD COLUMN IF NOT EXISTS equipment_condition TEXT DEFAULT 'good';
ALTER TABLE qr_scan_logs ADD COLUMN IF NOT EXISTS fuel_level INTEGER;
ALTER TABLE qr_scan_logs ADD COLUMN IF NOT EXISTS operator_notes TEXT;

-- 5. Job Progress Tracking
CREATE TABLE IF NOT EXISTS job_progress_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  daily_ticket_id UUID REFERENCES daily_job_tickets(id) ON DELETE CASCADE,

  -- Progress Metrics
  overall_completion_percentage INTEGER DEFAULT 0,
  work_completed_today TEXT,
  work_planned_tomorrow TEXT,

  -- Timeline
  days_worked INTEGER DEFAULT 1,
  estimated_days_remaining INTEGER,
  on_schedule BOOLEAN DEFAULT true,

  -- Updates
  status_update TEXT,
  customer_communication TEXT,

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_job_tickets_work_date ON daily_job_tickets(work_date);
CREATE INDEX IF NOT EXISTS idx_daily_job_tickets_crew_member ON daily_job_tickets(crew_member_id, work_date);
CREATE INDEX IF NOT EXISTS idx_daily_job_tickets_job_id ON daily_job_tickets(job_id, work_date);
CREATE INDEX IF NOT EXISTS idx_blade_usage_logs_blade_id ON blade_usage_logs(blade_id);
CREATE INDEX IF NOT EXISTS idx_blade_usage_logs_daily_ticket ON blade_usage_logs(daily_ticket_id);

-- Sample blade data
INSERT INTO blades (blade_id, blade_type, blade_size, manufacturer, model_number, max_cutting_depth, recommended_rpm, material_types, purchase_cost) VALUES
('BLADE-001', 'diamond', '14"', 'Husqvarna', 'Elite-Cut S45', 5.5, 4300, '["concrete", "asphalt"]', 89.99),
('BLADE-002', 'diamond', '20"', 'Husqvarna', 'Elite-Cut S65', 8.0, 3600, '["concrete", "asphalt"]', 159.99),
('BLADE-003', 'abrasive', '14"', 'Norton', 'Masonry Cut-Off', 5.5, 4300, '["concrete", "stone"]', 24.99),
('BLADE-004', 'diamond', '16"', 'Makita', 'Diamond Master', 6.0, 4000, '["concrete", "stone", "asphalt"]', 119.99),
('BLADE-005', 'diamond', '12"', 'DeWalt', 'Premium Diamond', 4.5, 5000, '["concrete", "brick"]', 79.99)
ON CONFLICT (blade_id) DO NOTHING;

-- Enable RLS
ALTER TABLE daily_job_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE blades ENABLE ROW LEVEL SECURITY;
ALTER TABLE blade_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_progress_updates ENABLE ROW LEVEL SECURITY;

-- Create policies (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_job_tickets' AND policyname = 'Users can view daily job tickets') THEN
        CREATE POLICY "Users can view daily job tickets" ON daily_job_tickets FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_job_tickets' AND policyname = 'Users can manage daily job tickets') THEN
        CREATE POLICY "Users can manage daily job tickets" ON daily_job_tickets FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blades' AND policyname = 'Users can view blades') THEN
        CREATE POLICY "Users can view blades" ON blades FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blades' AND policyname = 'Users can manage blades') THEN
        CREATE POLICY "Users can manage blades" ON blades FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blade_usage_logs' AND policyname = 'Users can view blade usage logs') THEN
        CREATE POLICY "Users can view blade usage logs" ON blade_usage_logs FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blade_usage_logs' AND policyname = 'Users can manage blade usage logs') THEN
        CREATE POLICY "Users can manage blade usage logs" ON blade_usage_logs FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_progress_updates' AND policyname = 'Users can view job progress updates') THEN
        CREATE POLICY "Users can view job progress updates" ON job_progress_updates FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_progress_updates' AND policyname = 'Users can manage job progress updates') THEN
        CREATE POLICY "Users can manage job progress updates" ON job_progress_updates FOR ALL USING (true);
    END IF;
END $$;