-- notifications.action_url already exists in production but was never captured in
-- a tracked migration. This is an additive, idempotent no-op against prod that
-- brings the column under migration control. action_url is the deep-link the
-- in-app bell's "View" button navigates to (e.g. the corrections approval page).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url text;
