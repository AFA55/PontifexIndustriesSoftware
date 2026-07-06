'use client';

import { useState, useEffect, useCallback } from 'react';
import { Fingerprint, Trash2, Plus, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isNativeApp } from '@/lib/is-native';

/**
 * Passkey management for My Profile (web only). Lists the user's registered
 * passkeys and lets them add (register a Face ID/Touch ID/security-key passkey)
 * or remove one. Uses Supabase WebAuthn: auth.registerPasskey + auth.passkey.*
 *
 * The iOS app uses its own native Face ID and hides this (isNativeApp).
 */
interface PasskeyRow {
  id: string;
  friendly_name?: string;
  created_at?: string;
  last_used_at?: string | null;
}

export default function PasskeySettings() {
  const [supported, setSupported] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await (supabase.auth as any).passkey.list();
      setPasskeys(Array.isArray(data) ? data : data?.passkeys ?? []);
    } catch {
      // list unavailable — leave empty; register still works.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const can =
      !isNativeApp() &&
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined';
    setSupported(can);
    if (can) load();
    else setLoading(false);
  }, [load]);

  if (!supported) return null;

  const register = async () => {
    setBusy(true); setError(null); setOk(null);
    try {
      const { error: regError } = await (supabase.auth as any).registerPasskey();
      if (regError) {
        const msg = String(regError.message || regError.code || '');
        if (/cancel|not allowed|abort/i.test(msg)) { setBusy(false); return; }
        if (/exists/i.test(msg)) { setError('This device already has a passkey for your account.'); setBusy(false); return; }
        setError('Could not set up the passkey. Please try again.');
        setBusy(false);
        return;
      }
      setOk('Passkey added — you can now sign in with Face ID / Touch ID.');
      await load();
    } catch {
      // dismissed
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true); setError(null); setOk(null);
    try {
      await (supabase.auth as any).passkey.delete({ passkeyId: id });
      setOk('Passkey removed.');
      await load();
    } catch {
      setError('Could not remove the passkey.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-brand" />
        <h3 className="font-bold text-gray-900 dark:text-white">Face ID / Touch ID sign-in</h3>
      </div>
      <p className="text-sm text-gray-500 dark:text-white/50 mb-4">
        Add a passkey to sign in with your fingerprint or face instead of a password.
        Passkeys are stored by your device and password manager (iCloud Keychain,
        Google Password Manager) and sync across your devices.
      </p>

      {loading ? (
        <div className="h-10 rounded-lg bg-gray-100 dark:bg-white/10 animate-pulse" />
      ) : passkeys.length > 0 ? (
        <ul className="space-y-2 mb-4">
          {passkeys.map((pk) => (
            <li key={pk.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2.5">
              <span className="flex items-center gap-2 min-w-0">
                <Fingerprint className="w-4 h-4 text-brand flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-white/80 truncate">
                  {pk.friendly_name || 'Passkey'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(pk.id)}
                disabled={busy}
                aria-label="Remove passkey"
                className="flex items-center justify-center min-w-[44px] min-h-[44px] text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400 dark:text-white/40 mb-4">No passkeys yet.</p>
      )}

      <button
        type="button"
        onClick={register}
        disabled={busy}
        className="flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-60"
      >
        <Plus className="w-4 h-4" />
        {busy ? 'Follow the prompt…' : 'Add a passkey'}
      </button>

      {error && <p className="mt-3 text-xs text-red-500 font-medium">{error}</p>}
      {ok && <p className="mt-3 text-xs text-emerald-600 font-medium">{ok}</p>}
    </div>
  );
}
