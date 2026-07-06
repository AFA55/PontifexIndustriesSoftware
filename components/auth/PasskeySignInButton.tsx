'use client';

import { useState, useEffect } from 'react';
import { Fingerprint } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isNativeApp } from '@/lib/is-native';

/**
 * "Sign in with Face ID / Touch ID" — passwordless passkey sign-in via
 * Supabase WebAuthn (auth.signInWithPasskey). Discoverable credentials: the
 * authenticator resolves the account, so no email is needed up front.
 *
 * Web only. The iOS app keeps its own NATIVE Face ID (lib/biometric.ts) and
 * hides this. WebAuthn is unavailable in the iOS WKWebview anyway.
 *
 * On success the parent's onSignedIn runs (it should do the full-navigation
 * redirect the password path uses). Errors are shown inline; a user cancelling
 * the OS prompt is silent (not an error).
 */
export default function PasskeySignInButton({
  onSignedIn,
  className = '',
}: {
  onSignedIn: () => void;
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only show when the browser can do WebAuthn and we're not in the native app.
    setSupported(
      !isNativeApp() &&
        typeof window !== 'undefined' &&
        typeof window.PublicKeyCredential !== 'undefined'
    );
  }, []);

  if (!supported) return null;

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: signInError } = await (supabase.auth as any).signInWithPasskey();
      if (signInError) {
        // User cancellation / no credential is not a hard error — stay quiet so
        // they can just use their password. Surface only genuine failures.
        const msg = String(signInError.message || signInError.code || '');
        if (/cancel|not allowed|abort|no.*credential|timed out/i.test(msg)) {
          setBusy(false);
          return;
        }
        setError('Could not sign in with a passkey. Use your password, or set up a passkey in My Profile after signing in.');
        setBusy(false);
        return;
      }
      if (data?.session) {
        onSignedIn();
        return; // leave busy=true through the redirect
      }
      setBusy(false);
    } catch {
      // WebAuthn threw (e.g. user dismissed) — silent, fall back to password.
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-brand/40 bg-brand/5 text-brand font-semibold hover:bg-brand/10 transition-colors disabled:opacity-60"
      >
        <Fingerprint className="w-5 h-5" />
        {busy ? 'Waiting for Face ID / Touch ID…' : 'Sign in with Face ID / Touch ID'}
      </button>
      {error && <p className="mt-2 text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}
