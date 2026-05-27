'use client';

import type { JobCardData } from './JobCard';
import { parseLocalDate, toDateString } from './helpers';

interface WeeklyViewProps {
  weekData: Record<string, JobCardData[]>;
  selectedDate: string;
  capacityMaxSlots: number;
  canEdit: boolean;
  onDayClick: (date: string) => void;
}

export default function WeeklyView({
  weekData,
  selectedDate,
  capacityMaxSlots,
  canEdit,
  onDayClick,
}: WeeklyViewProps) {
  return (
    <div className="container mx-auto px-4 md:px-6 pb-6">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-x-auto">
        <div className="grid grid-cols-1 md:grid-cols-7 divide-x divide-gray-200 dark:divide-slate-700 min-w-0 md:min-w-[1000px]">
          {Object.entries(weekData).sort(([a], [b]) => a.localeCompare(b)).map(([date, jobs]) => {
            const d = parseLocalDate(date);
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = d.getDate();
            const monthName = d.toLocaleDateString('en-US', { month: 'short' });
            const isToday = toDateString(new Date()) === date;
            const isSelected = selectedDate === date;
            return (
              <div key={date} className="min-w-0">
                {/* Day header */}
                <button
                  onClick={() => onDayClick(date)}
                  className={`w-full px-3 py-2.5 text-center border-b-2 transition-all ${
                    isToday ? 'bg-purple-50 dark:bg-purple-500/15 border-purple-500' :
                    isSelected ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-400' :
                    'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10'
                  }`}
                >
                  <p className={`text-xs font-bold uppercase ${isToday ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-white/60'}`}>{dayName}</p>
                  <p className={`text-lg font-bold ${isToday ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-white'}`}>{monthName} {dayNum}</p>
                  <p className={`text-[10px] font-semibold ${
                    jobs.length === 0 ? 'text-green-500 dark:text-green-400' :
                    jobs.length >= capacityMaxSlots ? 'text-red-500 dark:text-red-400' :
                    'text-gray-400 dark:text-white/50'
                  }`}>
                    {jobs.length} job{jobs.length !== 1 ? 's' : ''}
                  </p>
                </button>
                {/* Jobs list */}
                <div className="p-2 space-y-1.5 max-h-[60vh] overflow-y-auto">
                  {jobs.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-white/50 text-center py-6 italic">No jobs</p>
                  ) : (
                    jobs.map(job => (
                      <div
                        key={job.id}
                        draggable={canEdit}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/job-card', JSON.stringify({ jobId: job.id, sourceRowIndex: -1 }));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onClick={() => onDayClick(date)}
                        className="p-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{job.customer_name}</p>
                        <p className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold truncate">{job.job_type?.split(',')[0]?.trim()}</p>
                        {job.arrival_time && (
                          <p className="text-[10px] text-gray-400 mt-0.5">⏰ {job.arrival_time}</p>
                        )}
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {job.equipment_needed.slice(0, 3).map(eq => (
                            <span key={eq} className="px-1 py-0.5 bg-indigo-50 rounded text-[8px] text-indigo-600 font-medium">{eq}</span>
                          ))}
                          {job.equipment_needed.length > 3 && (
                            <span className="text-[8px] text-gray-400">+{job.equipment_needed.length - 3}</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
