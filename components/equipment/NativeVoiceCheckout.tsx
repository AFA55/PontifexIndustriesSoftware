'use client';

/**
 * NativeVoiceCheckout — NATIVE-ONLY multi-item voice equipment checkout.
 *
 * Companion to the web VoiceMic in app/dashboard/admin/inventory-control/page.tsx
 * (which uses the browser's Web Speech API and is correctly web-only — that
 * API does not work inside the iOS Capacitor WKWebView). This component:
 *
 *   1. Renders NOTHING unless isNativeApp() is true (checked on mount; SSR-safe).
 *   2. Mic button -> lib/native-speech.ts starts on-device transcription
 *      (native Capacitor plugin bridge, not the Web Speech API).
 *   3. On stop, POSTs the raw transcript to
 *      /api/admin/equipment-checkouts/voice-parse-multi for LLM-based
 *      structured multi-item extraction (handles messy real speech like
 *      "zack gas power pack number 4, baker scaffold, chainsaw 4, 2 chains
 *      and binders, done" or "checkin all").
 *   4. Shows a CONFIRM screen listing every parsed item before committing
 *      anything — this is a real inventory-write action and voice parsing
 *      is probabilistic, so nothing is ever blind-committed. Low/medium
 *      confidence or unmatched items are editable/removable inline.
 *   5. On confirm, calls the shared checkoutEquipmentItem()/checkinEquipmentItem()
 *      primitive from lib/equipment-checkout-client.ts (see that file's
 *      header for the interim-shim wiring note for the parallel manual-
 *      checkout team).
 *
 * Does NOT touch equipment_checkouts directly and does NOT modify the
 * existing deterministic web voice-parse flow.
 */

import { useEffect, useMemo, useState } from 'react';
import { Mic, Loader2, CheckCircle2, XCircle, AlertTriangle, X, Sparkles, PackageCheck } from 'lucide-react';
import { isNativeApp } from '@/lib/is-native';
import {
  nativeSpeechAvailability,
  requestSpeechPermission,
  startListening,
  stopListening,
  cancelListening,
} from '@/lib/native-speech';
import { supabase } from '@/lib/supabase';
import {
  checkoutEquipmentItem,
  checkinEquipmentItem,
  listOpenCheckouts,
} from '@/lib/equipment-checkout-client';

interface ParsedItem {
  spokenText: string;
  itemNameOrId: string | null;
  itemMatched: boolean;
  quantity: number;
  operatorNameOrId: string | null;
  operatorMatched: boolean;
  confidence: 'high' | 'medium' | 'low';
}

interface ParseMultiResponse {
  success: boolean;
  checkinAll: boolean;
  items: ParsedItem[];
  transcript: string;
  error?: string;
}

/** One row in the confirm tray, editable before commit. */
interface ConfirmRow extends ParsedItem {
  localId: string;
  /** Display label shown to the user; falls back to spokenText for unmatched items. */
  displayLabel: string;
  operatorDisplayLabel: string | null;
  excluded: boolean; // user removed it from the batch
}

/**
 * One row in the "check in all" confirm tray. Populated from the REAL open
 * checkouts (via listOpenCheckouts()) so a "check in all" / "done" voice
 * command shows the user exactly what will be checked in before they confirm
 * — never a blind "confirm?" against an unseen, tenant-wide list. See
 * guardian-review finding: a generic confirm sentence for checkinAll doesn't
 * meet the same bar as the itemized flow's per-item confirm screen.
 */
interface CheckinRow {
  checkoutId: string;
  localId: string;
  displayLabel: string; // "<equipment> — <custodian>"
  excluded: boolean;
}

type Phase = 'idle' | 'listening' | 'parsing' | 'confirm' | 'committing' | 'done' | 'error';

export default function NativeVoiceCheckout({ onCommitted }: { onCommitted?: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [liveText, setLiveText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checkinAll, setCheckinAll] = useState(false);
  const [rows, setRows] = useState<ConfirmRow[]>([]);
  const [checkinRows, setCheckinRows] = useState<CheckinRow[]>([]);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  // Native-only gate — SSR and web render nothing. Checked once on mount.
  useEffect(() => {
    setMounted(true);
    (async () => {
      if (!isNativeApp()) return;
      const status = await nativeSpeechAvailability();
      setAvailable(status.available);
    })();
  }, []);

  // All hooks (including this one) must run on every render, in the same
  // order, before any early return below — otherwise React's hook order
  // invariant breaks on the render where `mounted` flips true. See CLAUDE.md
  // "React keys in layouts" note for the sibling class of bug this avoids.
  const activeCount = useMemo(() => rows.filter((r) => !r.excluded).length, [rows]);
  const activeCheckinCount = useMemo(() => checkinRows.filter((r) => !r.excluded).length, [checkinRows]);

  if (!mounted || !isNativeApp()) return null;

  async function handleMicTap() {
    setError(null);
    setResultMsg(null);

    if (phase === 'listening') {
      setPhase('parsing');
      const transcript = await stopListening();
      if (!transcript) {
        setError("Didn't catch that — try again.");
        setPhase('idle');
        return;
      }
      await parseTranscript(transcript);
      return;
    }

    const granted = await requestSpeechPermission();
    if (!granted) {
      setError('Speech recognition permission denied. Enable it in device Settings.');
      setPhase('error');
      return;
    }
    setLiveText('');
    const started = await startListening({ onPartialResult: setLiveText });
    if (!started) {
      setError('Voice recognition unavailable on this device.');
      setPhase('error');
      return;
    }
    setPhase('listening');
  }

  async function parseTranscript(transcript: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired — please sign in again.');
      const res = await fetch('/api/admin/equipment-checkouts/voice-parse-multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ transcript }),
      });
      const json: ParseMultiResponse = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not understand that.');
        setPhase('error');
        return;
      }
      setCheckinAll(json.checkinAll);
      if (json.checkinAll) {
        setRows([]);
        // Fetch the REAL open checkouts so the confirm screen enumerates
        // exactly what "check in all" will affect — never a blind blanket
        // confirm. See CheckinRow doc comment.
        const openRes = await listOpenCheckouts();
        if (!openRes.success) {
          setError(openRes.error || 'Could not load open checkouts.');
          setPhase('error');
          return;
        }
        const open = openRes.data || [];
        if (open.length === 0) {
          setError('Nothing is currently checked out — nothing to check in.');
          setPhase('idle');
          return;
        }
        setCheckinRows(
          open.map((co: any, i: number) => {
            const eqLabel = co.equipment?.short_name && co.equipment?.unit_number
              ? `${co.equipment.short_name} #${co.equipment.unit_number}`
              : co.equipment?.name || 'Unknown item';
            const custodian = co.custodian?.full_name || co.custodian?.email || 'Unassigned';
            return {
              checkoutId: co.id,
              localId: `${Date.now()}-${i}`,
              displayLabel: `${eqLabel} — ${custodian}`,
              excluded: false,
            };
          })
        );
        setPhase('confirm');
        return;
      }
      if (json.items.length === 0) {
        setError("Didn't catch any equipment items — try again.");
        setPhase('idle');
        return;
      }
      setRows(
        json.items.map((it, i) => ({
          ...it,
          localId: `${Date.now()}-${i}`,
          displayLabel: it.itemMatched ? it.itemNameOrId! : it.itemNameOrId || it.spokenText,
          operatorDisplayLabel: it.operatorNameOrId,
          excluded: false,
        }))
      );
      setPhase('confirm');
    } catch (err: any) {
      setError(err?.message || 'Voice parsing failed.');
      setPhase('error');
    }
  }

  function toggleExclude(localId: string) {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, excluded: !r.excluded } : r)));
  }

  function toggleCheckinExclude(localId: string) {
    setCheckinRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, excluded: !r.excluded } : r)));
  }

  async function handleCancel() {
    await cancelListening();
    setPhase('idle');
    setLiveText('');
    setRows([]);
    setCheckinRows([]);
    setError(null);
  }

  async function handleConfirm() {
    setPhase('committing');
    setError(null);
    try {
      if (checkinAll) {
        // Commit exactly the rows the user reviewed + left checked (checkinRows
        // was populated from the real open-checkouts list back in
        // parseTranscript) — never a re-fetch-and-blindly-check-in-everything.
        const toCheckin = checkinRows.filter((r) => !r.excluded);
        let okCount = 0;
        for (const row of toCheckin) {
          const res = await checkinEquipmentItem(row.checkoutId, { statusAfterCheckin: 'pending_putaway' });
          if (res.success) okCount++;
        }
        setResultMsg(`Checked in ${okCount} of ${toCheckin.length} item${toCheckin.length === 1 ? '' : 's'}.`);
      } else {
        const toCommit = rows.filter((r) => !r.excluded);
        let okCount = 0;
        const failures: string[] = [];
        for (const row of toCommit) {
          if (!row.itemMatched || !row.itemNameOrId) {
            failures.push(`${row.displayLabel} — no matching equipment, skipped`);
            continue;
          }
          const res = await checkoutEquipmentItem({
            itemId: row.itemNameOrId,
            itemName: row.displayLabel,
            operatorId: row.operatorMatched ? row.operatorNameOrId! : undefined,
            operatorName: row.operatorDisplayLabel || undefined,
            quantity: row.quantity,
            // equipment_checkouts has no quantity column today (guardian-review
            // finding: one row = one physical asset). Rather than silently
            // dropping a spoken "2 chains and binders" with a UI that implied
            // it was tracked, record the true spoken count in the note so it's
            // at least visible on the checkout record / audit trail — the
            // confirm screen below is also honest that only 1 unit is tracked.
            notes:
              row.quantity > 1
                ? `Voice checkout: "${row.spokenText}" (spoken qty ${row.quantity} — only 1 unit tracked per checkout row; check out the rest separately)`
                : `Voice checkout: "${row.spokenText}"`,
            voiceCorrections: [
              {
                phrase: row.spokenText,
                normalized: row.spokenText.toLowerCase().trim(),
                kind: 'equipment' as const,
                resolved_id: row.itemNameOrId,
                confidence: row.confidence === 'high' ? 0.95 : row.confidence === 'medium' ? 0.75 : 0.5,
                was_corrected: false,
              },
            ],
          });
          if (res.success) okCount++;
          else failures.push(`${row.displayLabel} — ${res.error}`);
        }
        setResultMsg(
          `Checked out ${okCount} of ${toCommit.length} item${toCommit.length === 1 ? '' : 's'}.` +
          (failures.length ? ` ${failures.length} failed.` : '')
        );
      }
      setPhase('done');
      onCommitted?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to commit checkout.');
      setPhase('error');
    }
  }

  function reset() {
    setPhase('idle');
    setRows([]);
    setCheckinRows([]);
    setLiveText('');
    setError(null);
    setResultMsg(null);
  }

  return (
    <div className="rounded-2xl border-2 border-rose-200 dark:border-rose-900/50 bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20 p-4 space-y-3">
      {!available && phase === 'idle' && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Voice recognition isn't available on this device. Use manual checkout below.
        </div>
      )}

      {(phase === 'idle' || phase === 'listening' || phase === 'parsing') && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleMicTap}
            disabled={phase === 'parsing' || (!available && phase === 'idle')}
            className={`relative flex items-center justify-center w-14 h-14 rounded-full transition-all flex-shrink-0 disabled:opacity-50 ${
              phase === 'listening'
                ? 'bg-white text-rose-600 shadow-xl ring-4 ring-white/40'
                : 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30 hover:scale-105'
            }`}
            aria-label={phase === 'listening' ? 'Stop and parse' : 'Start native voice checkout'}
          >
            {phase === 'parsing' ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Mic className={`w-6 h-6 ${phase === 'listening' ? 'animate-pulse' : ''}`} />
            )}
            {phase === 'listening' && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold flex items-center gap-1 text-rose-700 dark:text-rose-300">
              <Sparkles className="w-3.5 h-3.5" />
              {phase === 'listening' ? 'Listening…' : phase === 'parsing' ? 'Understanding…' : 'Native voice checkout'}
            </p>
            {liveText ? (
              <p className="text-xs mt-0.5 italic truncate text-rose-700/80 dark:text-rose-300/80">"{liveText}"</p>
            ) : (
              <p className="text-[11px] mt-0.5 text-rose-700/70 dark:text-rose-300/70">
                Tap, say multiple items in one breath, tap again to finish. Or say "check in all".
              </p>
            )}
          </div>
          {phase === 'listening' && (
            <button
              type="button"
              onClick={handleCancel}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-rose-500 hover:bg-white/50"
              aria-label="Cancel"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {phase === 'confirm' && checkinAll && (
        <ConfirmShell
          onCancel={reset}
          onConfirm={handleConfirm}
          confirmLabel={`Check in ${activeCheckinCount} item${activeCheckinCount === 1 ? '' : 's'}`}
          disabled={activeCheckinCount === 0}
        >
          <p className="text-sm text-gray-700 dark:text-slate-200 flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            Review what "check in all" will affect — remove anything that shouldn't go back yet:
          </p>
          <div className="space-y-2">
            {checkinRows.map((row) => (
              <div
                key={row.localId}
                className={`flex items-center gap-2 rounded-xl border p-2.5 ${
                  row.excluded
                    ? 'opacity-40 border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900'
                    : 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/10'
                }`}
              >
                <p className="flex-1 min-w-0 text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {row.displayLabel}
                </p>
                <button
                  type="button"
                  onClick={() => toggleCheckinExclude(row.localId)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-rose-600 hover:bg-white/70 flex-shrink-0"
                  aria-label={row.excluded ? 'Include item' : 'Remove item'}
                >
                  {row.excluded ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </ConfirmShell>
      )}

      {phase === 'confirm' && !checkinAll && (
        <ConfirmShell
          onCancel={reset}
          onConfirm={handleConfirm}
          confirmLabel={`Check out ${activeCount} item${activeCount === 1 ? '' : 's'}`}
          disabled={activeCount === 0}
        >
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.localId}
                className={`flex items-start gap-2 rounded-xl border p-2.5 ${
                  row.excluded
                    ? 'opacity-40 border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900'
                    : row.confidence === 'high'
                    ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/10'
                    : row.confidence === 'medium'
                    ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10'
                    : 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {row.displayLabel}
                    {!row.itemMatched && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-red-600 dark:text-red-400">
                        no match
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 italic truncate">"{row.spokenText}"</p>
                  {row.quantity > 1 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      Heard qty {row.quantity} — this checks out 1 unit; check out the rest separately.
                    </p>
                  )}
                  {row.operatorDisplayLabel && (
                    <p className="text-xs text-gray-600 dark:text-slate-300 mt-0.5">
                      → {row.operatorDisplayLabel}
                      {!row.operatorMatched && <span className="text-red-600 dark:text-red-400"> (unmatched)</span>}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleExclude(row.localId)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-rose-600 hover:bg-white/70 flex-shrink-0"
                  aria-label={row.excluded ? 'Include item' : 'Remove item'}
                >
                  {row.excluded ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </ConfirmShell>
      )}

      {phase === 'committing' && (
        <div className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
          <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
        </div>
      )}

      {phase === 'done' && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> {resultMsg}
          </p>
          <button type="button" onClick={reset} className="text-xs font-semibold text-rose-600 dark:text-rose-400 underline">
            New voice checkout
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-700 dark:text-rose-300 bg-white/80 dark:bg-slate-800/80 rounded p-2 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </p>
      )}
      {phase === 'error' && (
        <button type="button" onClick={reset} className="text-xs font-semibold text-rose-600 dark:text-rose-400 underline">
          Try again
        </button>
      )}
    </div>
  );
}

function ConfirmShell({
  children,
  onCancel,
  onConfirm,
  confirmLabel,
  disabled,
}: {
  children: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      {children}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-xl border border-gray-300 dark:border-slate-600 text-sm font-semibold text-gray-700 dark:text-slate-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          className="min-h-[44px] rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white text-sm font-semibold shadow-md shadow-rose-500/30 disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
