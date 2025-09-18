-- Enhanced Database Schema for Pontifex Industries
-- Run these SQL commands in your Supabase SQL editor

-- 1. Equipment Usage Tracking (for analytics)
CREATE TABLE IF NOT EXISTS equipment_usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL, -- 'checked_out', 'checked_in', 'maintenance_start', 'maintenance_end'
  location TEXT,
  notes TEXT,
  duration_minutes INTEGER, -- for calculating usage time
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Job Site Operations (track where equipment is used)
CREATE TABLE IF NOT EXISTS job_sites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  client_name TEXT,
  project_type TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'paused'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Equipment Deployments (which equipment is at which job site)
CREATE TABLE IF NOT EXISTS equipment_deployments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  job_site_id UUID REFERENCES job_sites(id) ON DELETE CASCADE,
  deployed_by TEXT NOT NULL,
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  returned_at TIMESTAMPTZ,
  notes TEXT,
  fuel_level INTEGER, -- percentage
  condition_notes TEXT
);

-- 4. Maintenance Records (detailed tracking)
CREATE TABLE IF NOT EXISTS maintenance_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL, -- 'routine', 'repair', 'inspection', 'emergency'
  description TEXT NOT NULL,
  technician_name TEXT NOT NULL,
  cost DECIMAL(10,2),
  parts_used JSONB, -- array of parts: [{"name": "air filter", "cost": 25.99}]
  hours_worked DECIMAL(4,2),
  service_date TIMESTAMPTZ DEFAULT NOW(),
  next_service_date TIMESTAMPTZ,
  status TEXT DEFAULT 'completed', -- 'scheduled', 'in_progress', 'completed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. User Activity Logs (track all user actions)
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL, -- 'login', 'add_equipment', 'update_equipment', 'scan_qr', etc.
  details JSONB, -- flexible data storage for action-specific info
  ip_address TEXT,
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Equipment Performance Metrics (for predictive maintenance)
CREATE TABLE IF NOT EXISTS equipment_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL, -- 'usage_hours', 'fuel_consumption', 'temperature', 'vibration'
  value DECIMAL(10,4),
  unit TEXT, -- 'hours', 'gallons', 'celsius', 'hz'
  recorded_by TEXT,
  notes TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Automated Alerts (for notifications and automation)
CREATE TABLE IF NOT EXISTS automated_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'maintenance_due', 'overdue_return', 'low_fuel', 'usage_limit'
  severity TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  message TEXT NOT NULL,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  status TEXT DEFAULT 'active' -- 'active', 'resolved', 'dismissed'
);

-- 8. QR Code Scans (track when/where QR codes are scanned)
CREATE TABLE IF NOT EXISTS qr_scan_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  scanned_by TEXT,
  scan_location TEXT,
  scan_purpose TEXT, -- 'checkout', 'checkin', 'inspection', 'maintenance'
  device_info JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_equipment_usage_logs_equipment_id ON equipment_usage_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_usage_logs_timestamp ON equipment_usage_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_equipment_id ON maintenance_records(equipment_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_date ON maintenance_records(service_date);
CREATE INDEX IF NOT EXISTS idx_equipment_deployments_equipment_id ON equipment_deployments(equipment_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_name ON user_activity_logs(user_name);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_timestamp ON user_activity_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_automated_alerts_equipment_id ON automated_alerts(equipment_id);
CREATE INDEX IF NOT EXISTS idx_automated_alerts_status ON automated_alerts(status);
CREATE INDEX IF NOT EXISTS idx_qr_scan_logs_equipment_id ON qr_scan_logs(equipment_id);

-- Enable Row Level Security (RLS) for better security
ALTER TABLE equipment_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE automated_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_scan_logs ENABLE ROW LEVEL SECURITY;

-- Create policies (allow authenticated users to access their data)
CREATE POLICY "Users can view all equipment data" ON equipment_usage_logs FOR SELECT USING (true);
CREATE POLICY "Users can insert equipment usage logs" ON equipment_usage_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view job sites" ON job_sites FOR SELECT USING (true);
CREATE POLICY "Users can manage job sites" ON job_sites FOR ALL USING (true);

CREATE POLICY "Users can view deployments" ON equipment_deployments FOR SELECT USING (true);
CREATE POLICY "Users can manage deployments" ON equipment_deployments FOR ALL USING (true);

CREATE POLICY "Users can view maintenance records" ON maintenance_records FOR SELECT USING (true);
CREATE POLICY "Users can manage maintenance records" ON maintenance_records FOR ALL USING (true);

CREATE POLICY "Users can view activity logs" ON user_activity_logs FOR SELECT USING (true);
CREATE POLICY "Users can insert activity logs" ON user_activity_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view equipment metrics" ON equipment_metrics FOR SELECT USING (true);
CREATE POLICY "Users can insert equipment metrics" ON equipment_metrics FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view alerts" ON automated_alerts FOR SELECT USING (true);
CREATE POLICY "Users can manage alerts" ON automated_alerts FOR ALL USING (true);

CREATE POLICY "Users can view QR scan logs" ON qr_scan_logs FOR SELECT USING (true);
CREATE POLICY "Users can insert QR scan logs" ON qr_scan_logs FOR INSERT WITH CHECK (true);