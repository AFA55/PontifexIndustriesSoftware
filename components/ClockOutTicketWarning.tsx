'use client';

/**
 * Clock-out ticket warning modal (founder Jul 20 / Aug 2026).
 *
 * "Before an operator clocks out, remind them to fill out the ticket. If
 * emergency, just have a button that says WARNING, then allow them to clock
 * out." — the amber button is that escape hatch: it replays the SAME clock-out
 * with `acknowledge_incomplete: true`, which the server accepts and pairs with
 * a `ticket_incomplete_reminder` notification per job. Nobody is ever walled in.
 *
 * Lifted verbatim (behavior + light-mode appearance) out of app/dashboard/page.tsx
 * so BOTH clock-out screens use it — the dashboard clock widget and
 * /dashboard/timecard, which previously dead-ended on `alert(err.error)` with no
 * way to proceed.
 *
 * Handles both soft 409 block types:
 *   - incomplete_tickets_warning (operator: work-performed ticket not submitted)
 *   - helper_work_log_warning    (apprentice: no work log for the day)
 * plus the legacy hard-block copy (work_performed_required / other), which shows
 * no "clock out anyway" button.
 */

import { useRouter } from 'next/navigation';

export interface ClockOutWarningJob {
  id: string;
  job_number: string;
  customer_name: string;
}

interface ClockOutTicketWarningProps {
  /** Server `block_type`. Empty string renders nothing. */
  blockType: string;
  jobs: ClockOutWarningJob[];
  /** Replay the clock-out with acknowledge_incomplete: true. */
  onClockOutAnyway: () => void;
  /** Close the modal (also called before navigating to a job). */
  onGoBack: () => void;
  /** Clock-out request in flight — disables both actions. */
  loading?: boolean;
}

const SOFT_WARNINGS = ['incomplete_tickets_warning', 'helper_work_log_warning'];

export default function ClockOutTicketWarning({
  blockType,
  jobs,
  onClockOutAnyway,
  onGoBack,
  loading = false,
}: ClockOutTicketWarningProps) {
  const router = useRouter();
  if (!blockType) return null;

  const isSoftWarning = SOFT_WARNINGS.includes(blockType);

  const title =
    blockType === 'incomplete_tickets_warning'
      ? 'Finish your ticket?'
      : blockType === 'helper_work_log_warning'
      ? 'Add your work log?'
      : 'Cannot Clock Out';

  const body =
    blockType === 'incomplete_tickets_warning'
      ? "You haven't completed today's job ticket. Finish it now, or clock out and we'll remind you — your work will be logged to the day it was scheduled."
      : blockType === 'helper_work_log_warning'
      ? "You haven't added a work log for today's job. Add what you did now, or clock out and we'll remind you."
      : blockType === 'work_performed_required'
      ? 'You must complete work performed for all dispatched jobs before clocking out.'
      : 'You must submit a work log for all dispatched jobs before clocking out.';

  const goToJob = (jobId: string) => {
    onGoBack();
    if (isSoftWarning) {
      router.push(`/dashboard/my-jobs/${jobId}`);
    } else if (blockType === 'work_performed_required') {
      router.push(`/dashboard/job-schedule/${jobId}/work-performed`);
    } else {
      router.push('/dashboard/my-jobs');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#160d29] rounded-3xl shadow-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-6">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              isSoftWarning ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-red-100 dark:bg-red-500/20'
            }`}
          >
            <svg
              className={`w-8 h-8 ${isSoftWarning ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
          <p className="text-gray-600 dark:text-white/70 text-sm">{body}</p>
        </div>

        <div className="space-y-2 mb-6">
          <p className="text-sm font-semibold text-gray-700 dark:text-white/80">Incomplete jobs:</p>
          {jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => goToJob(job.id)}
              className="w-full min-h-[48px] flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/30 rounded-xl transition-all text-left"
            >
              <div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">#{job.job_number}</span>
                <span className="text-sm text-gray-600 dark:text-white/70 ml-2">{job.customer_name}</span>
              </div>
              <svg className="w-4 h-4 text-gray-400 dark:text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>

        {isSoftWarning && (
          <button
            onClick={onClockOutAnyway}
            disabled={loading}
            className="w-full px-6 py-3 mb-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-xl transition-all font-semibold min-h-[48px]"
          >
            {loading ? 'Clocking out…' : '⚠️ Clock out anyway — remind me later'}
          </button>
        )}
        <button
          onClick={onGoBack}
          disabled={loading}
          className="w-full px-6 py-3 min-h-[48px] bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-60 transition-all font-semibold"
        >
          {isSoftWarning ? "Go back — I'll add it now" : 'Close'}
        </button>
      </div>
    </div>
  );
}
