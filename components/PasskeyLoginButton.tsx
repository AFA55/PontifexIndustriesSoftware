'use client';

/**
 * "Sign in with fingerprint / Touch ID" button for the login screens.
 *
 * Passwordless WebAuthn login (lib/webauthn-client.ts). Renders nothing on
 * browsers without WebAuthn support. On success it mints + applies a Supabase
 * session (identical post-login wiring to the password flow) and routes to the
 * dashboard. User-cancelled prompts are a silent no-op.
 *
 * This is the WEBSITE analogue of the native app's Face ID button — the native
 * app keeps its own Keychain-based path; this serves real browsers (desktop
 * Safari/Chrome Touch ID, Chrome on Android, Windows Hello, phone passkeys).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isNativeApp } from '@/lib/is-native';
import { loginWithPasskey, passkeySupported } from '@/lib/webauthn-client';

interface Props {
  className?: string;
  /** Tailwind accent (defaults to a neutral dark style that fits both login pages). */
  variant?: 'light' | 'dark';
}

export default function PasskeyLoginButton({ className = '', variant = 'dark' }: Props) {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Hide on the native iOS app — it has its own native Face ID button, and
    // WebAuthn in the remote webview would compete with it. Web browsers only.
    setSupported(passkeySupported() && !isNativeApp());
  }, []);

  if (!supported) return null;

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    const result = await loginWithPasskey();

    if (!result.success || !result.session || !result.user) {
      setLoading(false);
      if (result.error && result.error !== 'cancelled') {
        setError(result.error);
      }
      return;
    }

    try {
      // Passkey sign-in implies "remember me" (the credential IS the convenience).
      localStorage.setItem('pontifex.rememberMe', 'true');
      await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      localStorage.setItem(
        'supabase-user',
        JSON.stringify({
          id: result.user.id,
          name: result.user.full_name,
          email: result.user.email,
          role: result.user.role,
        })
      );
      router.replace('/dashboard');
    } catch {
      setLoading(false);
      setError('Could not start your session. Please try again.');
    }
  };

  const base =
    variant === 'light'
      ? 'border-white/30 text-white hover:bg-white/10'
      : 'border-gray-300 dark:border-white/15 text-gray-700 dark:text-white/90 hover:bg-gray-50 dark:hover:bg-white/5';

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border font-semibold text-sm transition-all disabled:opacity-60 ${base} ${className}`}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Fingerprint className="w-5 h-5" />
        )}
        {loading ? 'Verifying…' : 'Sign in with fingerprint'}
      </button>
      {error && <p className="mt-2 text-xs text-red-500 text-center">{error}</p>}
    </div>
  );
}
