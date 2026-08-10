'use client';

import { AlertCircle, MapPin, Users, Printer, Loader2 } from 'lucide-react';
import type { JobCardData } from './JobCard';
import { asArray } from '@/lib/job-arrays';

interface UnassignedSectionProps {
  jobs: JobCardData[];
  canEdit: boolean;
  onJobClick: (job: JobCardData) => void;
  onAssign: (job: JobCardData) => void;
  /** Print the paper dispatch ticket for a job with NO operator on it yet.
   *  WHY (founder, Aug 10): "not all operators are in the app, some we still
   *  have to get tickets to." The PDF has always supported an unassigned job —
   *  it prints a blank line for the name to be written on — but the only button
   *  on this card said "Assign Operator", so the paper route looked like it
   *  required assigning someone first. */
  onPrint: (job: JobCardData) => void;
  /** Job id currently generating, so the button can show it's working. */
  printingJobId?: string | null;
}

export default function UnassignedSection({
  jobs,
  canEdit,
  onJobClick,
  onAssign,
  onPrint,
  printingJobId,
}: UnassignedSectionProps) {
  if (jobs.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-dashed border-orange-300 dark:border-orange-500/40 overflow-hidden">
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-bold">Unassigned Jobs for This Date</h3>
            <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold">{jobs.length}</span>
          </div>
          <p className="text-orange-100 text-xs hidden sm:block">Approved but no operator assigned yet</p>
        </div>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              draggable={canEdit}
              onDragStart={(e) => {
                if (!canEdit) return;
                e.dataTransfer.setData('application/job-card', JSON.stringify({ jobId: job.id, sourceRowIndex: -1 }));
                e.dataTransfer.effectAllowed = 'move';
                (e.currentTarget as HTMLElement).style.opacity = '0.5';
              }}
              onDragEnd={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              onClick={() => onJobClick(job)}
              className={`rounded-xl border-2 border-orange-200 dark:border-orange-500/40 bg-orange-50/50 dark:bg-orange-500/10 p-4 hover:shadow-md transition-all cursor-pointer ${canEdit ? 'active:cursor-grabbing' : ''}`}
            >
              <h4 className="font-bold text-gray-900 dark:text-white text-sm mb-1">{job.customer_name}</h4>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-brand/10 text-brand mb-2">{job.job_type?.split(',')[0]?.trim()}</span>
              <p className="text-xs text-gray-500 flex items-center gap-1 mb-2"><MapPin className="w-3 h-3 text-gray-400" /> {job.location}</p>
              {job.equipment_needed.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {asArray<string>(job.equipment_needed).map(eq => (
                    <span key={eq} className="px-2 py-0.5 bg-indigo-50 rounded text-xs text-indigo-600 font-medium">{eq}</span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                {canEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAssign(job); }}
                    className="flex-1 py-2 bg-gradient-to-r from-brand to-brand-accent hover:from-brand-dark hover:to-brand text-white rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow-md"
                  >
                    <Users className="w-3.5 h-3.5 inline mr-1.5" /> Assign Operator
                  </button>
                )}
                {/* Printing does NOT require assigning first — see onPrint. */}
                <button
                  onClick={(e) => { e.stopPropagation(); onPrint(job); }}
                  disabled={printingJobId === job.id}
                  title="Print the paper ticket — no operator needed"
                  className={`${canEdit ? 'px-3' : 'flex-1 py-2'} py-2 bg-white dark:bg-white/10 border border-orange-300 dark:border-orange-500/40 text-orange-700 dark:text-orange-300 rounded-lg text-xs font-bold transition-all hover:bg-orange-50 dark:hover:bg-white/20 disabled:opacity-60 flex items-center justify-center gap-1.5`}
                >
                  {printingJobId === job.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Printer className="w-3.5 h-3.5" />}
                  {canEdit ? '' : 'Print Ticket'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
