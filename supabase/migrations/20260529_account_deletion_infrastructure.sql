-- Account deletion infrastructure (App Store Guideline 5.1.1(v))
--
-- Self-service account deletion for a system where ~30 tables reference
-- auth.users(id): some NO ACTION (a hard delete is blocked once the user has any
-- job note / work item / NFC scan / skill row / etc.) and some CASCADE (e.g.
-- timecards — a hard delete would DESTROY payroll records that must be retained
-- by law, OSHA/IRS). A hard DELETE of the auth user or profile is therefore
-- neither possible in general nor desirable.
--
-- Strategy = full anonymization + permanent login lockout (no row deletion):
--   * close_account() (below) anonymizes the profile, purges purely-personal
--     records, and revokes sessions.
--   * The API (app/api/account/delete) then anonymizes + permanently bans the
--     auth.users identity (tombstone email, random password, 100-year ban).
-- Legally-required records (payroll/timecards/invoices) are retained but
-- de-identified — exactly what the privacy policy promises.

-- 1. Tombstone column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Atomic profile-anonymization + personal-data purge (reusable)
CREATE OR REPLACE FUNCTION public.close_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN; -- nothing to do
  END IF;

  -- Purely-personal records (not legally required) — safe to remove.
  DELETE FROM public.notifications WHERE user_id = p_user_id;
  DELETE FROM public.push_tokens   WHERE user_id = p_user_id;
  IF v_email IS NOT NULL THEN
    DELETE FROM public.access_requests WHERE lower(email) = lower(v_email);
  END IF;

  -- Revoke all active auth sessions so the deleted user is logged out everywhere.
  DELETE FROM auth.sessions WHERE user_id = p_user_id;

  -- Anonymize the profile: strip PII, keep the row so retained payroll/timecard
  -- records stay valid but de-identified. email is NOT NULL, so use a per-user
  -- tombstone address rather than nulling it.
  UPDATE public.profiles SET
    full_name = 'Deleted User',
    email = 'deleted+' || p_user_id::text || '@deleted.invalid',
    phone = NULL,
    phone_number = NULL,
    nickname = NULL,
    date_of_birth = NULL,
    profile_picture_url = NULL,
    avatar_url = NULL,
    emergency_contact_name = NULL,
    emergency_contact_phone = NULL,
    emergency_contact_relationship = NULL,
    notes = NULL,
    certification_documents = NULL,
    certifications = NULL,
    drivers_license_class = NULL,
    waiver_ip = NULL,
    active = false,
    deleted_at = now(),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Only the service role (server-side admin client) may invoke this directly.
REVOKE ALL ON FUNCTION public.close_account(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_account(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_account(uuid) TO service_role;
