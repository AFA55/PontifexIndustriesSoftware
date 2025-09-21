-- Phase 3: Real-time Tracking & Smart Features
-- Run this AFTER running database-phase2-schema.sql

-- 1. Job Status History for tracking changes
CREATE TABLE IF NOT EXISTS job_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  location JSONB,
  notes TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Crew Location Tracking
CREATE TABLE IF NOT EXISTS crew_location_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,

  -- Location Data
  location JSONB NOT NULL, -- {latitude, longitude, accuracy, heading, speed}
  activity_status TEXT DEFAULT 'on_site' CHECK (activity_status IN ('traveling', 'on_site', 'break', 'offline')),

  -- Metadata
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  device_info JSONB,
  battery_level INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Equipment Status Tracking
CREATE TABLE IF NOT EXISTS equipment_status_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  operator_id UUID REFERENCES crew_members(id) ON DELETE SET NULL,

  -- Status Information
  status TEXT NOT NULL CHECK (status IN ('idle', 'in_use', 'maintenance', 'offline')),
  location JSONB,

  -- Equipment Metrics
  fuel_level INTEGER CHECK (fuel_level >= 0 AND fuel_level <= 100),
  engine_hours DECIMAL(8,2),
  temperature INTEGER,

  -- Maintenance Alerts
  alerts JSONB, -- Array of alert codes

  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Weather Data Cache
CREATE TABLE IF NOT EXISTS weather_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location JSONB NOT NULL, -- {latitude, longitude, city, state}

  -- Current Weather
  temperature DECIMAL(5,2),
  humidity INTEGER,
  wind_speed DECIMAL(5,2),
  wind_direction INTEGER,
  precipitation DECIMAL(5,2),
  conditions TEXT,

  -- Forecast Data
  forecast_data JSONB, -- Array of hourly/daily forecasts

  -- Weather Alerts
  alerts JSONB, -- Weather warnings/watches

  -- Cache Control
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
  source TEXT DEFAULT 'openweather',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SMS/Notification Queue
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('crew_member', 'customer', 'admin')),
  recipient_id TEXT NOT NULL,

  -- Message Details
  message_type TEXT NOT NULL CHECK (message_type IN ('sms', 'email', 'push')),
  subject TEXT,
  message TEXT NOT NULL,

  -- Related Data
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5), -- 1=urgent, 5=low

  -- Delivery Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,

  -- Scheduling
  send_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Error Tracking
  error_message TEXT,
  external_id TEXT, -- ID from SMS/email service

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Add real-time fields to existing tables

-- Add location and status fields to crew_members
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS current_location JSONB;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMPTZ;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'offline';
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS device_token TEXT; -- For push notifications

-- Add location and operator fields to equipment
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS current_location JSONB;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS current_operator UUID REFERENCES crew_members(id);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS last_status_update TIMESTAMPTZ;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS telemetry_data JSONB; -- Real-time equipment data

-- Add coordinates to jobs for location checking
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS site_coordinates JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS weather_dependent BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS min_temperature DECIMAL(4,1);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_wind_speed DECIMAL(5,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS no_rain BOOLEAN DEFAULT false;

-- 7. Real-time Analytics Views

-- Current Job Status Overview
CREATE OR REPLACE VIEW real_time_job_overview AS
SELECT
  j.id,
  j.job_number,
  j.title,
  j.status,
  j.scheduled_date,
  j.address,
  j.site_coordinates,
  c.name as customer_name,
  c.phone as customer_phone,

  -- Crew Assignment Status
  COALESCE(
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'crew_member_id', cm.id,
        'name', cm.name,
        'current_location', cm.current_location,
        'current_status', cm.current_status,
        'last_update', cm.last_location_update
      )
    ) FILTER (WHERE cm.id IS NOT NULL),
    '[]'::json
  ) as assigned_crew,

  -- Equipment Status
  COALESCE(
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'equipment_id', e.id,
        'name', e.name,
        'status', e.status,
        'current_location', e.current_location,
        'current_operator', e.current_operator
      )
    ) FILTER (WHERE e.id IS NOT NULL),
    '[]'::json
  ) as assigned_equipment,

  j.created_at,
  j.updated_at

FROM jobs j
LEFT JOIN customers c ON j.customer_id = c.id
LEFT JOIN job_assignments ja ON j.id = ja.job_id
LEFT JOIN crew_members cm ON ja.crew_member_id = cm.id
LEFT JOIN job_equipment je ON j.id = je.job_id
LEFT JOIN equipment e ON je.equipment_id = e.id
WHERE j.status IN ('scheduled', 'dispatched', 'in_progress')
GROUP BY j.id, c.name, c.phone;

-- Equipment Utilization Real-time
CREATE OR REPLACE VIEW equipment_utilization_realtime AS
SELECT
  e.id,
  e.name,
  e.type,
  e.status,
  e.current_location,
  e.current_operator,
  e.last_status_update,

  -- Current Job Assignment
  CASE
    WHEN je.job_id IS NOT NULL THEN
      JSON_BUILD_OBJECT(
        'job_id', j.id,
        'job_number', j.job_number,
        'customer', cu.name,
        'address', j.address
      )
    ELSE NULL
  END as current_job,

  -- Operator Details
  CASE
    WHEN cm.id IS NOT NULL THEN
      JSON_BUILD_OBJECT(
        'operator_id', cm.id,
        'name', cm.name,
        'phone', cm.phone,
        'location', cm.current_location
      )
    ELSE NULL
  END as operator_details,

  -- Recent Status History
  (
    SELECT JSON_AGG(
      JSON_BUILD_OBJECT(
        'status', esl.status,
        'timestamp', esl.timestamp,
        'operator', esl.operator_id
      ) ORDER BY esl.timestamp DESC
    )
    FROM equipment_status_logs esl
    WHERE esl.equipment_id = e.id
    AND esl.timestamp >= NOW() - INTERVAL '24 hours'
    LIMIT 10
  ) as recent_status_history

FROM equipment e
LEFT JOIN job_equipment je ON e.id = je.equipment_id AND je.checked_in_at IS NULL
LEFT JOIN jobs j ON je.job_id = j.id
LEFT JOIN customers cu ON j.customer_id = cu.id
LEFT JOIN crew_members cm ON e.current_operator = cm.id
WHERE e.status != 'Retired';

-- 8. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_job_status_history_job_id ON job_status_history(job_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_crew_location_logs_crew_member ON crew_location_logs(crew_member_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_crew_location_logs_timestamp ON crew_location_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_equipment_status_logs_equipment ON equipment_status_logs(equipment_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status, send_at);
CREATE INDEX IF NOT EXISTS idx_weather_data_location ON weather_data USING GIN(location);
CREATE INDEX IF NOT EXISTS idx_weather_data_expires ON weather_data(expires_at);

-- 9. Triggers for Real-time Updates

-- Automatically log job status changes
CREATE OR REPLACE FUNCTION log_job_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO job_status_history (
      job_id,
      old_status,
      new_status,
      updated_by,
      timestamp
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      NEW.last_updated_by,
      NEW.updated_at
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_job_status_change ON jobs;
CREATE TRIGGER trigger_job_status_change
  AFTER UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION log_job_status_change();

-- Function to clean up old location logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_location_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM crew_location_logs
  WHERE timestamp < NOW() - INTERVAL '30 days';

  DELETE FROM equipment_status_logs
  WHERE timestamp < NOW() - INTERVAL '30 days';

  DELETE FROM weather_data
  WHERE expires_at < NOW() - INTERVAL '1 day';

  DELETE FROM notification_queue
  WHERE status IN ('delivered', 'failed')
  AND created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- 10. Enable RLS
ALTER TABLE job_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_location_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- 11. Create RLS Policies
DO $$
BEGIN
    -- Job Status History
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_status_history' AND policyname = 'Users can view job status history') THEN
        CREATE POLICY "Users can view job status history" ON job_status_history FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_status_history' AND policyname = 'Users can insert job status history') THEN
        CREATE POLICY "Users can insert job status history" ON job_status_history FOR INSERT WITH CHECK (true);
    END IF;

    -- Crew Location Logs
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crew_location_logs' AND policyname = 'Users can manage crew location logs') THEN
        CREATE POLICY "Users can manage crew location logs" ON crew_location_logs FOR ALL USING (true);
    END IF;

    -- Equipment Status Logs
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_status_logs' AND policyname = 'Users can manage equipment status logs') THEN
        CREATE POLICY "Users can manage equipment status logs" ON equipment_status_logs FOR ALL USING (true);
    END IF;

    -- Weather Data
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weather_data' AND policyname = 'Users can view weather data') THEN
        CREATE POLICY "Users can view weather data" ON weather_data FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weather_data' AND policyname = 'System can manage weather data') THEN
        CREATE POLICY "System can manage weather data" ON weather_data FOR ALL USING (true);
    END IF;

    -- Notification Queue
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_queue' AND policyname = 'Users can manage notifications') THEN
        CREATE POLICY "Users can manage notifications" ON notification_queue FOR ALL USING (true);
    END IF;
END $$;

-- 12. Sample Weather Data for Testing
INSERT INTO weather_data (location, temperature, humidity, wind_speed, conditions, forecast_data) VALUES
(
  '{"latitude": 40.7128, "longitude": -74.0060, "city": "New York", "state": "NY"}',
  72.5,
  65,
  8.2,
  'Partly Cloudy',
  '[
    {"time": "2024-01-01T10:00:00Z", "temp": 75, "conditions": "Sunny"},
    {"time": "2024-01-01T11:00:00Z", "temp": 77, "conditions": "Sunny"},
    {"time": "2024-01-01T12:00:00Z", "temp": 79, "conditions": "Partly Cloudy"}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;