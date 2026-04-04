-- Notification system for timecards: add missing columns to existing notifications table
-- and create notification_settings table for auto-notification configuration.

-- Add missing columns to notifications table
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES auth.users(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS bypass_nfc BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_email_sent BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Create notification_settings table for auto-notification configuration
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  auto_clock_in_reminder BOOLEAN DEFAULT true,
  clock_in_reminder_time TEXT DEFAULT '07:30',
  auto_overtime_alert BOOLEAN DEFAULT false,
  overtime_alert_threshold NUMERIC DEFAULT 40,
  auto_timecard_approval_reminder BOOLEAN DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on notification_settings
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for notification_settings
CREATE POLICY "Admin can view notification_settings" ON notification_settings
  FOR SELECT USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('admin', 'super_admin', 'operations_manager')
  );

CREATE POLICY "Admin can update notification_settings" ON notification_settings
  FOR ALL USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('admin', 'super_admin', 'operations_manager')
  );

-- Create indexes for efficient notification lookups
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
