-- Per-USER dashboard card preferences.
--
-- The founder asked to "allow them to remove things or add cards to their
-- dashboard". This is a PREFERENCE, not a permission: `user_card_permissions`
-- + ROLE_PERMISSION_PRESETS still decide what a user is ALLOWED to open, and
-- lib/dashboard-cards.ts intersects these arrays with that decision on every
-- render. Writing a card key in here by hand opens nothing.
--
--   dashboard_hidden_cards — built-in dashboard SECTIONS the user removed
--   dashboard_added_cards  — ADMIN_CARDS shortcuts the user chose to ADD
--
-- Both live on `profiles`, so the layout follows the user to any device and
-- inherits the table's existing tenant-scoped RLS (a profile row is already
-- only readable/writable by its owner and their tenant's management). Writes
-- go through /api/my-profile, which is `requireAuth` + `.eq('id', auth.userId)`
-- — a user can only ever edit their own row.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_hidden_cards text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_added_cards text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.profiles.dashboard_hidden_cards IS
  'Dashboard section ids this user removed. Preference only — never widens access. See lib/dashboard-cards.ts.';

COMMENT ON COLUMN public.profiles.dashboard_added_cards IS
  'ADMIN_CARDS shortcut ids (prefixed "card:") this user added to their dashboard. Always intersected with getCardPermission at render. See lib/dashboard-cards.ts.';
