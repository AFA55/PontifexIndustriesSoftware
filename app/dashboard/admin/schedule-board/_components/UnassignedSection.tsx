'use client';

import { AlertCircle, MapPin, Users } from 'lucide-react';
import type { JobCardData } from './JobCard';

interface UnassignedSectionProps {
  jobs: JobCardData[];
  canEdit: boolean;
  onJobClick: (job: JobCardData) => void;
  onAssign: (job: JobCardData) => void;
}

export default function UnassignedSection({
  jobs,
  canEdit,
  onJobClick,
  onAssign,
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
                  {job.equipment_needed.map(eq => (
                    <span key={eq} className="px-2 py-0.5 bg-indigo-50 rounded text-xs text-indigo-600 font-medium">{eq}</span>
                  ))}
                </div>
              )}
              {canEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAssign(job); }}
                  className="w-full py-2 bg-gradient-to-r from-brand to-brand-accent hover:from-brand-dark hover:to-brand text-white rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow-md"
                >
                  <Users className="w-3.5 h-3.5 inline mr-1.5" /> Assign Operator
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
