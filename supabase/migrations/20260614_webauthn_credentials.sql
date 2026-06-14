-- WebAuthn / passkey credentials for biometric (fingerprint / Touch ID / Windows
-- Hello) sign-in on the WEBSITE — the web analogue of the native app's Face ID.
--
-- Passwordless: a passkey proves possession of a private key held in the device's
-- secure hardware, gated by the user's biometric. On a successful assertion the
-- server mints a Supabase session for the owning user (no password involved).
--
-- One row per registered authenticator. A user may register several (laptop +
-- phone). All ceremony reads/writes go through the admin client (server-side),
-- so RLS exists only to protect any direct client reads.
--
-- Additive + idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id       uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Base64URL credential ID returned by the authenticator (globally unique).
  credential_id   text NOT NULL UNIQUE,
  -- Base64URL-encoded COSE public key bytes.
  public_key      text NOT NULL,
  -- Signature counter for clone detection (0 for many platform authenticators).
  counter         bigint NOT NULL DEFAULT 0,
  -- Hints the browser uses to find the authenticator next time.
  transports      text[] NOT NULL DEFAULT '{}',
  -- 'singleDevice' | 'multiDevice' (synced passkey) — informational.
  device_type     text,
  -- Whether the passkey is backed up / synced (e.g. iCloud Keychain).
  backed_up       boolean NOT NULL DEFAULT false,
  -- Friendly label shown in the user's passkey list ("Andres's MacBook").
  nickname        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_user_id_idx
  ON public.webauthn_credentials (user_id);
CREATE INDEX IF NOT EXISTS webauthn_credentials_tenant_id_idx
  ON public.webauthn_credentials (tenant_id);

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- A user can see / delete their own passkeys.
DO $$ BEGIN
  CREATE POLICY webauthn_select_own ON public.webauthn_credentials
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY webauthn_delete_own ON public.webauthn_credentials
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admins can see passkeys within their own tenant (audit / support).
DO $$ BEGIN
  CREATE POLICY webauthn_select_tenant_admin ON public.webauthn_credentials
    FOR SELECT USING (
      public.is_admin() AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
