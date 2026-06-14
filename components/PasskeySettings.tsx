'use client';

/**
 * Passkey management for My Profile — enroll / list / remove fingerprint
 * (Touch ID / Windows Hello) sign-in for the website. Web analogue of the
 * native app's Face ID setup.
 *
 * Renders a graceful "not supported" note on browsers without WebAuthn so the
 * section never silently disappears.
 */

import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Plus, Trash2, Loader2, ShieldCheck, Check } from 'lucide-react';
import {
  registerPasskey,
  listPasskeys,
  deletePasskey,
  passkeySupported,
  type SavedPasskey,
} from '@/lib/webauthn-client';
import { formatDay } from '@/lib/dates';

export default function PasskeySettings() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [passkeys, setPasskeys] = useState<SavedPasskey[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  const refresh = useCallback(async () => {
    setPasskeys(await listPasskeys());
    setLoading(false);
  }, []);

  useEffect(() => {
    const ok = passkeySupported();
    setSupported(ok);
    if (ok) refresh();
    else setLoading(false);
  }, [refresh]);

  const handleAdd = async () => {
    setAdding(true);
    setError(null);
    setJustAdded(false);
    const result = await registerPasskey();
    setAdding(false);
    if (result.success) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 3000);
      refresh();
    } else if (result.error && result.error !== 'cancelled') {
      setError(result.error);
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    const ok = await deletePasskey(id);
    setRemovingId(null);
    if (ok) {
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
    } else {
      setError('Could not remove that passkey.');
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-1">
        <span className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
          <Fingerprint className="w-5 h-5 text-violet-600 dark:text-violet-300" />
        </span>
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Fingerprint sign-in</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Use Touch ID, Windows Hello, or your phone to sign in — no password.
          </p>
        </div>
      </div>

      {supported === false && (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          This browser or device doesn&apos;t support passkeys. Try a recent version of Safari,
          Chrome, or Edge on a device with a fingerprint reader or Face/Touch ID.
        </p>
      )}

      {supported && (
        <>
          {loading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading your passkeys…
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {passkeys.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No passkeys yet. Add one to sign in with your fingerprint next time.
                </p>
              )}
              {passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {pk.nickname || 'Passkey'}
                        {pk.backed_up && (
                          <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-violet-500">
                            synced
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        Added {formatDay(pk.created_at.slice(0, 10))}
                        {pk.last_used_at ? ` · Last used ${formatDay(pk.last_used_at.slice(0, 10))}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(pk.id)}
                    disabled={removingId === pk.id}
                    aria-label="Remove passkey"
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                  >
                    {removingId === pk.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="mt-4 w-full sm:w-auto min-h-[44px] px-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm transition-all disabled:opacity-60"
          >
            {adding ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : justAdded ? (
              <Check className="w-5 h-5" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
            {adding ? 'Follow the prompt…' : justAdded ? 'Passkey added' : 'Add a passkey'}
          </button>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </>
      )}
    </div>
  );
}
