-- (Jul 21, 2026) DROP the notifications.notification_type CHECK constraint.
--
-- WHY: the constraint whitelisted 12 values, but 17+ values are used across
-- the codebase (correction_request, time_off_request, job_approved, feedback,
-- invoice_confirmed, clock_in_reminder, ...). Every insert with a non-listed
-- value failed — and because ALL notification inserts are fire-and-forget
-- with swallowed errors, they failed SILENTLY. Production evidence: the only
-- notification_type ever present in the table was 'general' (61 rows).
-- The column is a display/filter label set exclusively by server code, not a
-- security boundary; a typo'd label is cosmetic, a silently dropped
-- notification is catastrophic. So: no replacement whitelist.
--
-- Applied to prod via Supabase MCP on 2026-07-21. Idempotent.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
