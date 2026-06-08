-- Migration: UNIQUE constraint on user_invitations.token
-- Date: 2026-06-08
-- APPLIED TO PROD 2026-06-08
--
-- B3 fix: tokens are looked up with .single()/.maybeSingle() and consumed via
-- update().eq('token', token). Without a UNIQUE constraint, a (theoretical)
-- duplicate token would break single-use integrity (one consume could affect
-- multiple rows, or .single() could 500). Tokens are now 256-bit CSPRNG values
-- (collisions are astronomically unlikely), but the DB constraint makes the
-- single-use guarantee structural rather than probabilistic.
--
-- Idempotent: guarded so a re-run is a no-op. Additive only — no drops.
--
-- Pre-flight de-dup: if (improbably) duplicate tokens already exist, keep the
-- earliest row per token and null out the rest's token so the unique index can
-- be created. Consumed/duplicate invites with a null token are inert (every
-- lookup filters on a specific non-null token).

DO $$
BEGIN
  -- Null out any duplicate tokens (keep the earliest by created_at, then id).
  UPDATE public.user_invitations u
  SET token = NULL
  WHERE u.token IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_invitations o
      WHERE o.token = u.token
        AND (o.created_at, o.id) < (u.created_at, u.id)
    );
EXCEPTION WHEN undefined_column THEN
  -- created_at not present in some minimal schema — fall back to id ordering.
  UPDATE public.user_invitations u
  SET token = NULL
  WHERE u.token IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_invitations o
      WHERE o.token = u.token AND o.id < u.id
    );
END $$;

-- Unique index on token (allows multiple NULLs in Postgres). Idempotent via
-- IF NOT EXISTS; using a unique INDEX keeps it re-runnable and NULL-tolerant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_invitations_token
  ON public.user_invitations (token);
