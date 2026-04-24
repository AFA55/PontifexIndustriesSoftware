-- Migration: Add schedule_updated notification type and index for per-day dispatch tracking
-- Date: 2026-04-05

-- 1. Expand schedule_notifications type constraint to include 'schedule_updated'
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
    'job_completed',
    'schedule_updated'
  ));

-- 2. Add index on (job_order_id, type) to speed up per-day dispatch status queries
CREATE INDEX IF NOT EXISTS idx_schedule_notifications_job_type
  ON public.schedule_notifications (job_order_id, type)
  WHERE job_order_id IS NOT NULL;
