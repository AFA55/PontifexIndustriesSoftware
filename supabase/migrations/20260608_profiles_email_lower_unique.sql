-- Case-insensitive global uniqueness for profiles.email.
--
-- Context: admins can now edit a team member's login email (Team Profiles →
-- Edit Info). auth.users is GLOBAL (one row per email platform-wide), so the
-- email must be unique across ALL tenants. The existing `profiles_email_key`
-- unique index is case-SENSITIVE (plain btree on email), which would let
-- "Bob@x.com" and "bob@x.com" coexist and desync from auth.users (which is
-- case-insensitive). The API already normalizes to lowercase + does an `ilike`
-- pre-check, but this index is the durable backstop.
--
-- IDEMPOTENT + SAFE: only creates the functional unique index if it does not
-- already exist. Does NOT drop profiles_email_key (kept as a belt-and-suspenders
-- exact-match guard). If any case-variant duplicates already exist, the CREATE
-- will FAIL — resolve duplicates first (see the SELECT in the comment below).
--
-- APPLIED TO PROD 2026-06-08 (verified 0 case-variant duplicates first via:
--   SELECT lower(email) e, count(*) FROM public.profiles
--   WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1;  → [] )

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND indexname = 'profiles_email_lower_key'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX profiles_email_lower_key
             ON public.profiles (lower(email))
             WHERE email IS NOT NULL';
  END IF;
END $$;
