-- "Finish your profile" welcome nudge — make it smart + one-time.
--
-- The WelcomeProfileModal nags whenever a profile is missing photo/nickname/
-- phone, and the only "dismiss" was session-scoped — so it re-asked on every
-- login forever (founder hit this on the admin account). Add a persistent flag
-- so the nudge is shown to a user AT MOST until they act on it once: completing
-- their profile (the missing-fields check goes false) OR dismissing the modal
-- (this timestamp is set) permanently silences it.
--
-- Additive + idempotent.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_dismissed_at timestamptz;
