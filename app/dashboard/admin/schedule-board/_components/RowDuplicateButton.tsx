'use client';

import { useState, useRef, useEffect } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import type { JobCardData } from './JobCard';

/**
 * "Duplicate" action for an operator ROW header (next to Mark Out / Time Off).
 *
 * A duplicate exists for exactly ONE reason (founder, Aug 2026): to dispatch a
 * SECOND CREW to the same job. One ticket normally holds the whole crew — to
 * add one more person you use the "+" on the job card, NOT this. The copy lands
 * unassigned with nobody on it, which is correct for crew B.
 *
 * Row can hold several jobs, so:
 *  - 0 jobs  → disabled, tooltip says why
 *  - 1 job   → duplicates it straight away
 *  - 2+ jobs → tiny picker ("Which job?") listing customer + job number
 */
export default function RowDuplicateButton({
  jobs,
  onDuplicate,
  showLabel = true,
}: {
  jobs: JobCardData[];
  onDuplicate: (job: JobCardData) => Promise<void> | void;
  /** Hide the text label on small screens like the neighbouring row actions. */
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const run = async (job: JobCardData) => {
    setOpen(false);
    setBusy(true);
    try {
      await onDuplicate(job);
    } finally {
      setBusy(false);
    }
  };

  const handleClick = () => {
    if (busy || jobs.length === 0) return;
    if (jobs.length === 1) {
      void run(jobs[0]);
      return;
    }
    setOpen(o => !o);
  };

  const disabled = jobs.length === 0 || busy;

  // Same padding/idiom as Mark Out + Time Off so the cluster stays one row.
  // The `after` pseudo-element grows the TOUCH target to 44px vertically
  // without changing the rendered size (horizontal bounds are untouched, so it
  // can never steal a neighbour's click).
  const base =
    'relative flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors ' +
    "after:content-[''] after:absolute after:inset-x-0 after:top-1/2 after:-translate-y-1/2 after:h-11";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-haspopup={jobs.length > 1 ? 'menu' : undefined}
        aria-expanded={jobs.length > 1 ? open : undefined}
        className={`${base} ${
          disabled
            ? 'bg-gray-50 dark:bg-white/5 text-gray-300 dark:text-white/20 border-gray-200 dark:border-white/10 cursor-not-allowed'
            : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 border-blue-200 dark:border-blue-500/30'
        }`}
        title={
          jobs.length === 0
            ? 'No job on this row to duplicate'
            : 'Duplicate — dispatch a second crew to this job. The copy starts with nobody on it. (Adding one more person to THIS crew? Use the "+" on the job card instead.)'
        }
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
        {showLabel && <span className="hidden sm:inline">Duplicate</span>}
      </button>

      {/* Which job? — only when the row holds more than one */}
      {open && jobs.length > 1 && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-[#1a0f35] rounded-xl shadow-xl border border-gray-200 dark:border-white/10 z-50 p-3"
        >
          <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-1">Which job?</h4>
          <p className="text-[11px] text-gray-500 dark:text-white/50 mb-2">
            Creates a second ticket so another crew can work it. It starts with nobody on it.
          </p>
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {jobs.map(job => (
              <button
                key={job.id}
                type="button"
                role="menuitem"
                onClick={() => void run(job)}
                className="w-full min-h-[44px] text-left px-3 py-2 rounded-lg text-xs bg-gray-50 dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-500/15 text-gray-800 dark:text-white/80 transition-colors"
              >
                <span className="block font-semibold truncate">{job.customer_name}</span>
                <span className="block text-[10px] text-gray-500 dark:text-white/50">{job.job_number}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
