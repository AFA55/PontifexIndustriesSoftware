-- Reliable email → auth.users.id lookup for server-side flows (setup-account).
--
-- Replaces the fragile listUsers({perPage:1000}) single-page scan in
-- /api/setup-account/complete that MISSED auth users buried past the first
-- page. Symptom: an approved access request whose email had any older/buried
-- auth user fell through to createUser → "A user with this email address has
-- already been registered" → setup aborted → orphaned auth user with NO profile
-- (could not log in, absent from Team Profiles). It also silently bypassed the
-- cross-tenant takeover guard, which depends on finding the existing user.
--
-- SECURITY DEFINER + service_role-only (never exposed to anon/authenticated).
-- Additive + idempotent.
CREATE OR REPLACE FUNCTION public.auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_id_by_email(text) TO service_role;
