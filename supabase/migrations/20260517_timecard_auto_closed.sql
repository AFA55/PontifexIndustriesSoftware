-- Add auto_closed column to timecards for tracking system-initiated clock-outs
ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS timecards_auto_closed_idx ON public.timecards (auto_closed)
  WHERE auto_closed = true;

-- Expand schedule_notifications type constraint to include auto_clock_out types
-- Also adds late_arrival which is already in use in code but was not yet in the constraint.
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
    'quick_add_followup',
    'late_arrival',
    'auto_clock_out',
    'auto_clock_out_admin'
  ));
