-- Allow `profile_updated` (and every other in-use value) on notifications.type.
--
-- Background: self-service profile edits (PATCH /api/my-profile) insert a
-- notification with type = 'profile_updated' for management. But the
-- notifications.type CHECK constraint has NEVER been kept in sync with the code:
-- the original (20260310) allowed only ('approved','rejected','missing_info',
-- 'date_changed','assigned'), while the app actually inserts ~14+ distinct type
-- values (job_note, change_request, operator_time_off, time_off_request,
-- maintenance_request, operator_callout, clock_in, feedback, info, warning,
-- job_order, profile, ...). Those inserts are fire-and-forget, so a too-narrow
-- CHECK silently DROPS notifications across the app instead of erroring loudly.
--
-- Fix: DROP the type CHECK entirely. `type` is a free-form event key; the
-- meaningful, maintained category enum is the separate `notification_type`
-- column (which keeps its own CHECK). Removing a CHECK never invalidates
-- existing rows — purely safe + idempotent.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
