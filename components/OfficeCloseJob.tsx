'use client';

/**
 * "SOME JOBS THE PMs PUT IN JUST TO PRINT A TICKET. NOBODY GETS ASSIGNED, THE
 *  WORK NEVER GETS COMPLETED IN HERE, BUT THEY FINISHED IT — I NEED A WAY TO
 *  COMPLETE IT AND GET IT OFF THE SCHEDULE."  (founder, Aug 14)
 *
 * The backend for this has existed since early August — POST/DELETE
 * /api/admin/jobs/[id]/office-complete, with unit-tested rules in
 * lib/office-completion.ts about how long the operator keeps writing. It was
 * never wired to a button, so from the office's side the feature did not exist.
 * This is the button.
 *
 * Closing from the office deliberately does NOT touch the operator's record: no
 * completion signature is forged, the job stays on the days he worked, and if
 * he is mid-day he still gets to submit that day. It closes the OFFICE side and
 * clears the schedule, which is all the founder asked for.
 *
 * The reason is required, because a job that vanishes with no explanation is
 * indistinguishable from a job that was lost.
 *
 * WHERE IT RENDERS (Aug 17): the job detail page, the schedule board's job
 * panel, each Active Jobs card, each Pending Jobs card (Active Jobs excludes
 * `on_hold`, so a parked ticket was reachable from nowhere else), and — as the
 * undo — the Completed Jobs record. It was on the job detail page alone for
 * three days and the founder never found it, which is the same failure as
 * having no button at all. Every host gates on `officeCloseAffordance()`
 * (lib/office-completion.ts), and so does the POST route before it writes, so
 * the control never appears on — nor reaches — a job it cannot help.
 */

import { useState } from 'react';
import { CheckCircle2, Loader2, Undo2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  jobId: string;
  jobNumber?: string | null;
  customerName?: string | null;
  /** ISO timestamp when the office closed it, or null if still open. */
  officeCompletedAt?: string | null;
  officeCompletedReason?: string | null;
  /** The operator's own completion — if set, this control stays hidden. */
  operatorCompletedAt?: string | null;
  onChanged?: () => void;
}

/**
 * Kept short on purpose. These are pills on a 375px phone; the 59-character
 * version of the print-only reason wrapped to three lines inside a
 * `rounded-full` chip and read as a broken layout. They are also the text the
 * operator sees in his notification, so they have to survive being quoted.
 */
const QUICK_REASONS = [
  'Finished on site — never closed out in the app',
  'Print-only ticket — no crew dispatched',
  'Customer confirmed complete',
  'Cancelled after the ticket was created',
];

export default function OfficeCloseJob({
  jobId,
  jobNumber,
  customerName,
  officeCompletedAt,
  officeCompletedReason,
  operatorCompletedAt,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The operator closed it properly — nothing for the office to do.
  if (operatorCompletedAt) return null;

  const send = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Your session expired. Sign in again.');
        return;
      }
      const res = await fetch(`/api/admin/jobs/${jobId}/office-complete`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: method === 'POST' ? JSON.stringify({ reason: reason.trim() }) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || `Could not ${method === 'POST' ? 'close' : 'reopen'} the job.`);
        return;
      }
      setOpen(false);
      setReason('');
      onChanged?.();
    } catch {
      setError('Network problem — try again.');
    } finally {
      setBusy(false);
    }
  };

  if (officeCompletedAt) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-400/25 dark:bg-emerald-400/10">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              Closed by the office
            </p>
            {officeCompletedReason ? (
              <p className="mt-0.5 break-words text-sm text-emerald-700/90 dark:text-emerald-200/75">
                {officeCompletedReason}
              </p>
            ) : null}
            <button
              onClick={() => send('DELETE')}
              disabled={busy}
              className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900 disabled:opacity-50 dark:text-emerald-300 dark:hover:text-emerald-100"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Reopen this job
            </button>
            {error ? (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="
          flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors
          text-slate-700 hover:bg-slate-50
          dark:text-white/80 dark:hover:bg-white/5
        "
      >
        <span className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-slate-400 dark:text-white/45" />
          Mark complete (office)
        </span>
      </button>
    );
  }

  const label = customerName || jobNumber || 'this job';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-white">
            Close {label}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-white/55">
            Takes it off the schedule. The crew&apos;s own record is left exactly as it is.
          </p>
        </div>
        <button
          onClick={() => { setOpen(false); setError(null); }}
          aria-label="Cancel"
          className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {QUICK_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            className={`min-h-[44px] rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
              reason === r
                ? 'bg-brand text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 1000))}
        rows={2}
        placeholder="Why is this being closed from the office?"
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:placeholder:text-white/35"
      />

      {error ? <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}

      <button
        onClick={() => send('POST')}
        disabled={busy || reason.trim().length === 0}
        className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        Close the job
      </button>
    </div>
  );
}
