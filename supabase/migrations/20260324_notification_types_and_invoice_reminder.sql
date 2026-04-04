-- Migration: Expand notification types and add invoice reminder tracking
-- Date: 2026-03-24

-- 1. Expand schedule_notifications type constraint to include new workflow types
ALTER TABLE public.schedule_notifications
  DROP CONSTRAINT IF EXISTS schedule_notifications_type_check;

ALTER TABLE public.schedule_notifications
  ADD CONSTRAINT schedule_notifications_type_check
  CHECK (type IN (
    'approved',
    'rejected',
    'missing_info',
    'date_changed',
    'assigned',
    'dispatched',
    'job_assigned',
    'job_completed'
  ));

-- 2. Add metadata JSONB column to schedule_notifications (for structured data)
ALTER TABLE public.schedule_notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- 3. Add last_reminder_sent_at to invoices table
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ DEFAULT NULL;

-- 4. Allow users to mark their own notifications as read
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.schedule_notifications;
CREATE POLICY "Users can update their own notifications" ON public.schedule_notifications
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
