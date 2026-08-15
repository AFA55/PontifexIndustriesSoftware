'use client';

/**
 * "Day 3 was worked but never wrapped up" — and the button that does something
 * about it.
 *
 * FOUNDER (Aug 15): "the PM should have known they haven't completed their job.
 * That job is done but the operator hasn't pressed submit or completed job. We
 * should have a button that sends a notification to them to complete their
 * job."
 *
 * The job view was already SAYING this ("Work logged; day not wrapped up yet")
 * on each open day. What it lacked was a verb, so the PM's only option was to
 * go find a phone number. This banner sits above the day list — one place, not
 * one button per day — names the days that are open, and sends the reminder to
 * the operators who worked them.
 *
 * Renders nothing at all when every day is wrapped up, so it can be mounted
 * unconditionally.
 */

import { useState } from 'react';
import { AlertTriangle, BellRing, Loader2, CheckCircle2 } from 'lucide-react';
import { authedFetch, isSessionExpired } from '@/lib/authed-fetch';
import { formatDay } from '@/lib/dates';
import { canNudgeCloseout, describeOpenDays, type OpenDay } from '@/lib/closeout-nudge';

/** Who may press it — the API enforces the same set. */
const CLOSEOUT_NUDGE_ROLES = ['admin', 'super_admin', 'operations_manager', 'salesman', 'supervisor'];

export default function JobCloseoutNudge({
  jobId,
  jobStatus,
  userRole,
  openDays,
  className = '',
}: {
  jobId: string;
  jobStatus?: string | null;
  userRole?: string | null;
  openDays: OpenDay[];
  className?: string;
}) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  if (!canNudgeCloseout({ jobStatus, openDays })) return null;

  const mayNudge = !!userRole && CLOSEOUT_NUDGE_ROLES.includes(userRole);
  const daysLabel = describeOpenDays(openDays, (d) =>
    formatDay(d, { weekday: 'short', month: 'short', day: 'numeric' })
  );
  const plural = openDays.length === 1 ? 'day' : 'days';

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await authedFetch(`/api/admin/jobs/${jobId}/closeout-nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setResult({ kind: 'err', msg: json?.error || 'Could not send the reminder.' });
        return;
      }
      setResult({ kind: 'ok', msg: json?.data?.message || 'Reminder sent.' });
    } catch (e) {
      setResult({
        kind: 'err',
        msg: isSessionExpired(e)
          ? 'Your session expired — sign in again and the reminder will send.'
          : 'Network error — the reminder was not sent.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={`
        rounded-xl border border-amber-300 bg-amber-50 p-4
        dark:border-amber-400/30 dark:bg-amber-500/10
        ${className}
      `}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {openDays.length} {plural} never wrapped up
          </p>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/70 mt-1 leading-relaxed">
            Work is logged for {daysLabel}, but nobody pressed{' '}
            <span className="font-semibold">Done for Today</span>, so the ticket is still open
            and the hours may be incomplete.
          </p>

          {mayNudge && (
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="
                mt-3 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg
                text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700
                disabled:opacity-60 disabled:cursor-not-allowed transition-colors
              "
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BellRing className="w-4 h-4" />
              )}
              {sending ? 'Sending…' : 'Remind crew to close out'}
            </button>
          )}

          {/* Every outcome gets a sentence — "already sent within the hour" is a
              real answer, and a button that appears to do nothing is the exact
              failure this banner exists to end. */}
          {result && (
            <p
              className={`mt-2 text-xs flex items-start gap-1.5 ${
                result.kind === 'ok'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              {result.kind === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-px" />}
              <span>{result.msg}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
