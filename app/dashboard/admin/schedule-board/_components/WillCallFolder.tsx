'use client';

import { FolderOpen, MapPin, Timer, Users } from 'lucide-react';
import type { JobCardData } from './JobCard';
import { parseLocalDate, daysAgo } from './helpers';

interface WillCallFolderProps {
  willCallJobs: JobCardData[];
  canEdit: boolean;
  onMoveToSchedule: (job: JobCardData) => void;
  onAssign: (job: JobCardData) => void;
}

export default function WillCallFolder({
  willCallJobs,
  canEdit,
  onMoveToSchedule,
  onAssign,
}: WillCallFolderProps) {
  return (
    <div className="container mx-auto px-4 md:px-6 pb-4">
      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/10 rounded-2xl border-2 border-amber-200 dark:border-amber-500/30 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-gray-900 dark:text-white">Will Call Folder</h3>
            <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-xs font-bold">{willCallJobs.length} jobs</span>
          </div>
          <p className="text-xs text-amber-600">Jobs waiting for an open slot — schedule when availability opens up</p>
        </div>
        {willCallJobs.length === 0 ? (
          <div className="text-center py-8 text-amber-500">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-semibold">No will-call jobs</p>
            <p className="text-xs">Salesmen can mark jobs as will-call when submitting the schedule form</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {willCallJobs.map((job) => {
              const daysWaiting = job.scheduled_date ? daysAgo(job.scheduled_date) : 0;
              return (
                <div key={job.id} className="bg-white dark:bg-white/5 rounded-xl border-2 border-amber-300 dark:border-amber-500/30 p-3 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-1">
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">{job.customer_name}</h4>
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold whitespace-nowrap">WILL CALL</span>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-brand/10 dark:bg-brand/20 text-brand dark:text-brand mb-1">{job.job_type}</span>
                  <p className="text-xs text-gray-500 dark:text-white/60 flex items-center gap-1 mb-1"><MapPin className="w-3 h-3" /> {job.location}</p>

                  <div className="flex items-center justify-between mt-2 mb-2">
                    <span className="text-xs text-gray-400 dark:text-white/40">
                      Tentative: {job.scheduled_date ? parseLocalDate(job.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                    </span>
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      daysWaiting >= 7 ? 'bg-red-100 text-red-700' : daysWaiting >= 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      <Timer className="w-3 h-3" />
                      {daysWaiting === 0 ? 'Today' : `${daysWaiting}d waiting`}
                    </span>
                  </div>

                  {canEdit && (
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => onMoveToSchedule(job)}
                        className="flex-1 py-1.5 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors"
                      >
                        Schedule Now
                      </button>
                      <button
                        onClick={() => onAssign(job)}
                        className="py-1.5 px-2.5 text-xs font-bold text-brand bg-brand/5 hover:bg-brand/10 border border-brand rounded-lg transition-colors"
                      >
                        <Users className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
