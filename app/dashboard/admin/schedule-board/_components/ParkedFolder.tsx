'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PauseCircle, Timer, PlayCircle, Eye, X, Loader2, AlertTriangle } from 'lucide-react';
import type { JobCardData } from './JobCard';
import { daysParked } from '@/lib/job-phases';
import { toLocalYMD } from '@/lib/dates';
import {
  formatDaysParked,
  formatDaysWorked,
  parkedChipClasses,
} from '@/lib/parked-board';

/**
 * THE PARKED FOLDER — the column that would have caught Leifeng.
 *
 * JOB-2026-400368 sat parked ten days and nobody saw it, because a parked job
 * is absent from the board: its scheduled date stopped meaning anything the
 * moment the contractor pushed the crew off, and a date is the only thing the
 * board files a job under. Five more were sitting in production the day this was
 * written, the oldest since Jul 28.
 *
 * It is modelled on `WillCallFolder` and lives beside it — a GLOBAL folder, not
 * a date-scoped section, because "how long has this been sitting" is the one
 * question the board could not answer. What it does NOT copy from that folder is
 * the button size: will-call's `py-1.5` buttons land around 28px, and these are
 * pressed on a phone. Every control here is at least 44px tall.
 */

export interface RestartPayload {
  /** First day of the new run. A bare 'YYYY-MM-DD' — never a Date. */
  scheduled_date: string;
  end_date?: string;
  /** The scope for THIS run. The old wording is kept, not overwritten. */
  scope_text: string;
  reason?: string;
}

interface ParkedFolderProps {
  parkedJobs: JobCardData[];
  /** Only the roles that can already park a job may restart one. */
  canRestart: boolean;
  /** Returns true when the restart landed; the page owns toasts + refetch. */
  onRestart: (job: JobCardData, payload: RestartPayload) => Promise<boolean>;
}

function formatParkedOn(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ParkedFolder({
  parkedJobs,
  canRestart,
  onRestart,
}: ParkedFolderProps) {
  const [restartTarget, setRestartTarget] = useState<JobCardData | null>(null);

  return (
    <div className="container mx-auto px-4 md:px-6 pb-4">
      <div className="bg-gradient-to-r from-slate-50 to-red-50 dark:from-slate-900/40 dark:to-red-900/10 rounded-2xl border-2 border-slate-300 dark:border-red-500/30 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <PauseCircle className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-gray-900 dark:text-white">Parked</h3>
            <span className="px-2 py-0.5 bg-red-200 text-red-800 rounded-full text-xs font-bold">
              {parkedJobs.length} {parkedJobs.length === 1 ? 'job' : 'jobs'}
            </span>
          </div>
          {/* Says only what is true. Four of the six jobs sitting in production
              still carry an operator — a parked job is not necessarily a
              crewless one, and claiming otherwise on the column built to end a
              blind spot would be its own small lie. */}
          <p className="text-xs text-red-600 dark:text-red-300">
            Stopped jobs — they do not appear on any day until they are restarted
          </p>
        </div>

        {parkedJobs.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-white/50">
            <PauseCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-semibold">Nothing parked</p>
            <p className="text-xs">A job lands here when it is put on hold, and stays until it is restarted</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {parkedJobs.map((job) => {
              // The API computes this in the TENANT's timezone; the local
              // fallback only matters if the migration appending the on_hold
              // columns has not run, in which case both are null and the chip
              // simply does not render. Never "NaN days".
              const days = job.days_parked ?? daysParked(job);
              const daysLabel = formatDaysParked(days);
              const workedLabel = formatDaysWorked(job.total_days_worked);
              const parkedOn = formatParkedOn(job.on_hold_placed_at);

              return (
                <div
                  key={job.id}
                  className="bg-white dark:bg-white/5 rounded-xl border-2 border-slate-300 dark:border-red-500/30 p-3 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm break-words min-w-0">
                      {job.customer_name}
                    </h4>
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold whitespace-nowrap shrink-0">
                      PARKED
                    </span>
                  </div>

                  <p className="text-[11px] font-mono text-gray-500 dark:text-white/50 break-all">
                    {job.job_number}
                  </p>
                  {job.project_name ? (
                    <p className="text-xs text-gray-600 dark:text-white/70 break-words mt-0.5">
                      {job.project_name}
                    </p>
                  ) : null}

                  {/* THE NUMBER NOBODY COULD SEE. */}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {daysLabel ? (
                      <span
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold ${parkedChipClasses(days)}`}
                      >
                        <Timer className="w-3 h-3" />
                        {daysLabel}
                      </span>
                    ) : null}
                    {parkedOn ? (
                      <span className="text-[11px] text-gray-400 dark:text-white/40">
                        since {parkedOn}
                      </span>
                    ) : null}
                  </div>

                  {job.on_hold_reason ? (
                    <p className="mt-2 text-xs text-gray-600 dark:text-white/60 break-words">
                      <span className="font-semibold text-gray-700 dark:text-white/80">Why: </span>
                      {job.on_hold_reason}
                    </p>
                  ) : null}

                  {workedLabel ? (
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-white/50">{workedLabel}</p>
                  ) : null}

                  {/* Tap targets: 44px minimum. These get pressed on a phone. */}
                  <div className="flex gap-2 mt-3">
                    {canRestart ? (
                      <button
                        type="button"
                        onClick={() => setRestartTarget(job)}
                        className="flex-1 min-h-[44px] px-3 inline-flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                      >
                        <PlayCircle className="w-4 h-4" />
                        Restart
                      </button>
                    ) : null}
                    <Link
                      href={`/dashboard/admin/jobs/${job.id}`}
                      className={`min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-1.5 text-sm font-bold text-brand bg-brand/5 hover:bg-brand/10 border border-brand rounded-lg transition-colors ${canRestart ? '' : 'flex-1'}`}
                      aria-label={`View ${job.job_number}`}
                    >
                      <Eye className="w-4 h-4" />
                      {canRestart ? null : <span>View job</span>}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {restartTarget ? (
        <RestartModal
          job={restartTarget}
          onClose={() => setRestartTarget(null)}
          onSubmit={onRestart}
        />
      ) : null}
    </div>
  );
}

// ─── Restart modal ─────────────────────────────────────────────────────────
//
// The founder's constraint is the whole design: *"same job ID should stay
// because same contract info"*. So this asks for the two things that actually
// changed — WHEN it comes back and WHAT the crew is doing this time — and
// nothing else. The old scope is not overwritten in the record; it is kept as
// the previous phase.

function RestartModal({
  job,
  onClose,
  onSubmit,
}: {
  job: JobCardData;
  onClose: () => void;
  onSubmit: (job: JobCardData, payload: RestartPayload) => Promise<boolean>;
}) {
  // toLocalYMD, never toISOString().split('T')[0] — the latter is UTC and puts
  // the office a day out for half of every day.
  const [scheduledDate, setScheduledDate] = useState(toLocalYMD());
  // The floor for "back on it". A restart dated into days the crew already
  // worked re-files billed hours under a scope that did not exist then, so the
  // picker will not offer a past day. This is a courtesy, NOT the guard — the
  // server rejects anything on or before the job's last proven work date, which
  // is the only place that knows what those days are.
  const todayYMD = toLocalYMD();
  const [endDate, setEndDate] = useState('');
  const [scopeText, setScopeText] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const invalidRange = !!endDate && endDate < scheduledDate;
  // A typed-in past date bypasses `min` in some browsers, so it is caught here
  // as well. The server still has the last word — it knows the days worked.
  const pastDate = !!scheduledDate && scheduledDate < todayYMD;
  const canSubmit =
    !!scheduledDate && scopeText.trim().length > 0 && !invalidRange && !pastDate && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    const ok = await onSubmit(job, {
      scheduled_date: scheduledDate,
      ...(endDate ? { end_date: endDate } : {}),
      scope_text: scopeText.trim(),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#140b28] w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl border border-gray-200 dark:border-white/10 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-200 dark:border-white/10">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <PlayCircle className="w-5 h-5 text-green-600" />
              Restart job
            </h3>
            <p className="text-xs text-gray-500 dark:text-white/50 break-words">
              {job.customer_name} · {job.job_number} — same job number, new scope
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold text-gray-700 dark:text-white/70">Back on it</span>
              <input
                type="date"
                value={scheduledDate}
                min={todayYMD}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-base"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-700 dark:text-white/70">
                Through <span className="font-normal text-gray-400">(optional)</span>
              </span>
              <input
                type="date"
                value={endDate}
                min={scheduledDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-base"
              />
            </label>
          </div>

          {invalidRange ? (
            <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> The end date is before the start date.
            </p>
          ) : null}

          {pastDate ? (
            <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> A restart cannot be dated into days
              already worked — pick today or later.
            </p>
          ) : null}

          <label className="block">
            <span className="text-xs font-bold text-gray-700 dark:text-white/70">
              What are they doing this time?
            </span>
            <textarea
              value={scopeText}
              onChange={(e) => setScopeText(e.target.value)}
              rows={4}
              placeholder="Core drill 12 penetrations through the north wall."
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-base"
            />
            <span className="text-[11px] text-gray-400 dark:text-white/40">
              The previous scope is kept on the ticket, so the reader can see the job stopped and came back.
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-bold text-gray-700 dark:text-white/70">
              Note <span className="font-normal text-gray-400">(optional)</span>
            </span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contractor called us back"
              className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-base"
            />
          </label>
        </div>

        <div className="flex gap-2 p-4 border-t border-gray-200 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] px-4 rounded-lg border border-gray-300 dark:border-white/15 text-sm font-bold text-gray-700 dark:text-white/80 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="flex-1 min-h-[44px] px-4 rounded-lg text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            {saving ? 'Restarting…' : 'Restart job'}
          </button>
        </div>
      </div>
    </div>
  );
}
