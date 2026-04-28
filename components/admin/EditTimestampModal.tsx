'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, AlertCircle, Clock, Edit2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export type EditTimestampField =
  | 'in_route_at'
  | 'arrived_at_jobsite_at'
  | 'work_started_at'
  | 'work_completed_at';

interface Props {
  jobId: string;
  field: EditTimestampField;
  currentValue: string | null; // ISO string
  label: string; // human-friendly e.g. "In Route Time"
  onClose: () => void;
  onSaved: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...opts?.headers,
    },
  });
}

/**
 * Convert an ISO timestamp into the format required by `<input type="datetime-local">`,
 * which is `YYYY-MM-DDTHH:mm` in the user's *local* timezone.
 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // pad helpers
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const M = pad(d.getMonth() + 1);
  const D = pad(d.getDate());
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  return `${y}-${M}-${D}T${h}:${m}`;
}

/**
 * Convert a `<input type="datetime-local">` string (interpreted as local time)
 * to a UTC ISO string for the API.
 */
function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EditTimestampModal({
  jobId,
  field,
  currentValue,
  label,
  onClose,
  onSaved,
}: Props) {
  const [value, setValue] = useState<string>(() => isoToLocalInput(currentValue));
  const [reason, setReason] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock body scroll while modal open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const submit = async (clear: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const iso = clear ? null : localInputToIso(value);
      if (!clear && !iso) {
        setError('Enter a valid date and time, or use Clear to unset.');
        setSaving(false);
        return;
      }

      const body: Record<string, unknown> = { [field]: iso };
      if (reason.trim().length > 0) body.edit_reason = reason.trim();

      const res = await apiFetch(`/api/admin/jobs/${jobId}/timestamps`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let msg = `Save failed (HTTP ${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          // ignore JSON parse failure
        }
        setError(msg);
        setSaving(false);
        return;
      }

      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error — please try again.');
      setSaving(false);
    }
  };

  const handleSave = () => submit(false);
  const handleClear = () => submit(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 dark:bg-black/60 p-0 sm:p-4"
      onClick={(e) => {
        // click on backdrop closes (only when not actively saving)
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${label}`}
    >
      <div
        className="
          w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl
          bg-white border border-slate-200
          dark:bg-gradient-to-br dark:from-[#180c2c] dark:to-[#0e0720]
          dark:border-white/10
          max-h-[90vh] overflow-y-auto
        "
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
            <Edit2 className="w-4 h-4" />
          </span>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Edit {label}
          </h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-slate-500 dark:text-white/60" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 space-y-4">
          {/* Current value summary */}
          <div className="text-xs text-slate-500 dark:text-white/55 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {currentValue ? (
                <>Current: <span className="font-mono font-medium text-slate-700 dark:text-white/85">
                  {new Date(currentValue).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span></>
              ) : (
                <span className="italic">Not set</span>
              )}
            </span>
          </div>

          {/* Datetime input */}
          <div>
            <label
              htmlFor="edit-timestamp-input"
              className="block text-sm font-medium text-slate-700 dark:text-white/80 mb-1.5"
            >
              New time
            </label>
            <input
              id="edit-timestamp-input"
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={saving}
              className="
                w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500
                bg-white border border-slate-300 text-slate-900
                dark:bg-white/5 dark:border-white/10 dark:text-white dark:[color-scheme:dark]
                disabled:opacity-50
              "
            />
          </div>

          {/* Edit reason */}
          <div>
            <label
              htmlFor="edit-timestamp-reason"
              className="block text-sm font-medium text-slate-700 dark:text-white/80 mb-1.5"
            >
              Edit reason <span className="font-normal text-slate-400 dark:text-white/40">(optional)</span>
            </label>
            <textarea
              id="edit-timestamp-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={saving}
              rows={2}
              placeholder="e.g. operator forgot to click in-route"
              className="
                w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500
                bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400
                dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/30
                disabled:opacity-50 resize-none
              "
            />
          </div>

          {/* Inline error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-400/30">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-300 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700 dark:text-rose-200">{error}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 pb-5 sm:pb-5 pt-1 flex flex-col-reverse sm:flex-row sm:items-center gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="
              w-full sm:w-auto px-4 py-2 text-sm rounded-lg transition-colors
              text-slate-600 hover:bg-slate-100
              dark:text-white/70 dark:hover:bg-white/10
              disabled:opacity-50
            "
          >
            Cancel
          </button>

          {currentValue && (
            <button
              onClick={handleClear}
              disabled={saving}
              className="
                w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-lg transition-colors
                text-rose-600 bg-white border border-rose-200 hover:bg-rose-50
                dark:text-rose-200 dark:bg-white/5 dark:border-rose-400/30 dark:hover:bg-rose-500/10
                disabled:opacity-50
              "
            >
              Clear
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !value}
            className="
              w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
              text-white bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500
              hover:from-violet-700 hover:via-fuchsia-600 hover:to-pink-600
              disabled:opacity-50 transition-all shadow-sm shadow-violet-500/20
            "
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
