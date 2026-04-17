-- Migration: Add quick_add_followup to schedule_notifications type constraint
-- Date: 2026-04-16

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
    'quick_add_followup'
  ));
