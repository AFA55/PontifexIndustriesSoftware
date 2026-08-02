-- Midday "log your morning work" reminder settings (founder request, Aug 2026).
-- Adds a per-tenant toggle + configurable tenant-local wall-clock time to
-- notification_settings. Consumed by /api/cron/work-performed-reminders
-- (new wall-clock phase) and the admin Notifications → Auto Settings tab.
--
-- Additive + idempotent: safe to re-run.

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS auto_midday_work_reminder boolean DEFAULT true;

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS midday_work_reminder_time text DEFAULT '11:55';

COMMENT ON COLUMN public.notification_settings.auto_midday_work_reminder IS
  'When true, clocked-in operators on an active dispatched job who have not logged work items today get a lunch-time reminder.';
COMMENT ON COLUMN public.notification_settings.midday_work_reminder_time IS
  'Tenant-local HH:MM wall-clock anchor for the midday work reminder (default 11:55).';
