'use client';

/**
 * Post-login "Sign in faster with Touch ID / Face ID?" prompt — the Bank-of-
 * America-style offer shown right after a successful password login on a
 * biometric-capable browser (website only; hidden on the native app).
 *
 * On enable: registers a PLATFORM passkey (one Touch ID prompt) and remembers
 * the credential + username on THIS device, so next time the login screen shows
 * the saved username + a "Use Touch ID" button. Passwordless — no password is
 * ever stored.
 */

import { useState } from 'react';
import { Fingerprint, Loader2, X } from 'lucide-react';
import { registerPasskey, setEnrolledBiometric, biometricLabel } from '@/lib/webauthn-client';

interface Props {
  email: string;
  /** Called when the user finishes (enabled OR skipped) — caller then redirects. */
  onDone: () => void;
}

export default function BiometricEnrollPrompt({ email, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = biometricLabel();

  const enable = async () => {
    setBusy(true);
    setError(null);
    const res = await registerPasskey(`${label} · ${platformName()}`);
    if (res.success && res.credentialId) {
      setEnrolledBiometric({ credentialId: res.credentialId, email, label });
      onDone();
      return;
    }
    if (res.error && res.error !== 'cancelled') {
      setError(res.error);
    }
    setBusy(false); // cancelled or failed → let them retry or skip
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 p-6 relative">
        <button
          onClick={onDone}
          aria-label="Skip"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg">
            <Fingerprint className="w-8 h-8 text-white" />
          </span>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Sign in faster with {label}?
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
            Next time, just use {label} — no password to type. Your sign-in stays on this device.
          </p>

          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

          <button
            onClick={enable}
            disabled={busy}
            className="mt-5 w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm transition-all disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}
            {busy ? 'Follow the prompt…' : `Enable ${label}`}
          </button>
          <button
            onClick={onDone}
            disabled={busy}
            className="mt-2 w-full min-h-[44px] text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors disabled:opacity-60"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function platformName(): string {
  if (typeof navigator === 'undefined') return 'this device';
  const p = navigator.platform || '';
  if (/Mac/.test(p)) return 'Mac';
  if (/Win/.test(p)) return 'Windows';
  if (/iPhone|iPad/.test(p)) return 'iOS';
  if (/Linux/.test(p)) return 'Linux';
  return 'this device';
}
