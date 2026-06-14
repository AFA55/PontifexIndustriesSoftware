'use client';

/**
 * Bank-of-America-style "Use Touch ID / Face ID" sign-in button for the login
 * screens. Renders ONLY when this device has a biometric enrolled (set up via
 * the post-login prompt or My Profile) — otherwise nothing shows, matching how
 * native apps reveal "Use Face ID" only after the first sign-in.
 *
 * Tapping it fires a DIRECT biometric prompt (we target the credential enrolled
 * on this device, so no passkey chooser), then mints + applies a Supabase
 * session and routes to the dashboard. Passwordless — no password is stored.
 * Hidden on the native app, which has its own native Face ID path.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isNativeApp } from '@/lib/is-native';
import {
  loginWithPasskey,
  passkeySupported,
  getEnrolledBiometric,
  clearEnrolledBiometric,
  type EnrolledBiometric,
} from '@/lib/webauthn-client';

interface Props {
  className?: string;
  variant?: 'light' | 'dark';
}

export default function PasskeyLoginButton({ className = '', variant = 'dark' }: Props) {
  const router = useRouter();
  const [enrolled, setEnrolled] = useState<EnrolledBiometric | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Show only on a real browser that supports WebAuthn AND has an enrollment
    // saved on this device.
    if (isNativeApp() || !passkeySupported()) return;
    setEnrolled(getEnrolledBiometric());
  }, []);

  if (!enrolled) return null;

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    const result = await loginWithPasskey(enrolled.credentialId);

    if (!result.success || !result.session || !result.user) {
      setLoading(false);
      // A "not recognized" credential means the enrollment is stale (e.g. the
      // passkey was removed) — forget it locally so the button stops lying.
      if (result.error && /not recognized|verification failed/i.test(result.error)) {
        clearEnrolledBiometric();
        setEnrolled(null);
      } else if (result.error && result.error !== 'cancelled') {
        setError(result.error);
      }
      return;
    }

    try {
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
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}
        {loading ? 'Verifying…' : `Use ${enrolled.label}`}
      </button>
      {error && <p className="mt-2 text-xs text-red-500 text-center">{error}</p>}
    </div>
  );
}
