-- Notifications table for schedule board events
CREATE TABLE IF NOT EXISTS schedule_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_name TEXT,
  job_order_id UUID REFERENCES job_orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('approved', 'rejected', 'missing_info', 'date_changed', 'assigned')),
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE schedule_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Super admin can read all notifications" ON schedule_notifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Users can read their own notifications" ON schedule_notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "Super admin can create notifications" ON schedule_notifications
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
  );

ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS missing_info_items TEXT[] DEFAULT '{}';
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS missing_info_note TEXT;

CREATE INDEX IF NOT EXISTS idx_schedule_notifications_recipient ON schedule_notifications(recipient_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_notifications_job ON schedule_notifications(job_order_id);
