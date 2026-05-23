-- Push notifications + reminder system foundation
-- Powers: native push (iOS/Android), per-user notification preferences,
-- and timed reminders (clock-in, work-performed) with idempotent dedup.

-- ── 1. Device push tokens ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios','android','web')),
  device_id text,
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS push_tokens_tenant_idx ON push_tokens(tenant_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own push tokens" ON push_tokens
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Per-user notification preferences ─────────────────────────────────────
-- Categories: clock_in_reminder, work_performed_reminder, time_off_status,
--             job_dispatched, document_to_sign, maintenance_update
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  push_enabled boolean DEFAULT true,
  sms_enabled boolean DEFAULT false,
  email_enabled boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, category)
);

CREATE INDEX IF NOT EXISTS notification_preferences_user_idx ON notification_preferences(user_id);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own notification prefs" ON notification_preferences
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Reminder dedup log ────────────────────────────────────────────────────
-- reminder_key examples: 'clock_in:2026-05-23', 'work_lunch:2026-05-23',
--                        'work_overdue:2026-05-23'
-- The UNIQUE constraint guarantees each reminder fires at most once per user/day.
CREATE TABLE IF NOT EXISTS reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_key text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  UNIQUE (user_id, reminder_key)
);

CREATE INDEX IF NOT EXISTS reminder_log_user_idx ON reminder_log(user_id, sent_at DESC);

ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;
-- Server-only writes (via supabaseAdmin which bypasses RLS). No client policy = deny.

-- ── 4. Fix schedule_notifications type CHECK (was rejecting many valid types) ─
-- The old CHECK only allowed 8 values, silently failing inserts for
-- time_off_approved, auto_clock_out, clock_in_reminder, etc.
-- Drop it — notification types are controlled in application code (TS unions).
ALTER TABLE schedule_notifications DROP CONSTRAINT IF EXISTS schedule_notifications_type_check;
