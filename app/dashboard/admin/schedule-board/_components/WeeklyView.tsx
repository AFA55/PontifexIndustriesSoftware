'use client';

import { UserPlus, Users } from 'lucide-react';
import type { JobCardData } from './JobCard';
import { crewSummary } from './JobCard';
import { parseLocalDate, toDateString } from './helpers';

interface WeeklyViewProps {
  weekData: Record<string, JobCardData[]>;
  selectedDate: string;
  capacityMaxSlots: number;
  canEdit: boolean;
  onDayClick: (date: string) => void;
  holidaysByDate?: Record<string, { id: string; name: string; pay_hours: number }>;
  /** "+" on a week card — jump to that job's day and open its Crew section so
   *  another person can be added without hunting for the job first. */
  onAddCrewJob?: (job: JobCardData, date: string) => void;
}

export default function WeeklyView({
  weekData,
  selectedDate,
  capacityMaxSlots,
  canEdit,
  onDayClick,
  holidaysByDate = {},
  onAddCrewJob,
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
            const holiday = holidaysByDate[date];
            return (
              <div key={date} className="min-w-0">
                {/* Day header */}
                <button
                  onClick={() => onDayClick(date)}
                  className={`w-full px-3 py-2.5 text-center border-b-2 transition-all ${
                    isToday ? 'bg-brand/5 dark:bg-brand/15 border-brand' :
                    isSelected ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-400' :
                    'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10'
                  }`}
                >
                  <p className={`text-xs font-bold uppercase ${isToday ? 'text-brand dark:text-brand' : 'text-gray-500 dark:text-white/60'}`}>{dayName}</p>
                  <p className={`text-lg font-bold ${isToday ? 'text-brand-dark dark:text-brand' : 'text-gray-900 dark:text-white'}`}>{monthName} {dayNum}</p>
                  <p className={`text-[10px] font-semibold ${
                    jobs.length === 0 ? 'text-green-500 dark:text-green-400' :
                    jobs.length >= capacityMaxSlots ? 'text-red-500 dark:text-red-400' :
                    'text-gray-400 dark:text-white/50'
                  }`}>
                    {jobs.length} job{jobs.length !== 1 ? 's' : ''}
                  </p>
                  {holiday && (
                    <span
                      title={`${holiday.name} — ${holiday.pay_hours}h paid`}
                      className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-400/20 text-amber-700 dark:text-amber-300 text-xs font-semibold border border-amber-300 dark:border-amber-400/40"
                    >
                      ★ Paid Holiday
                    </span>
                  )}
                </button>
                {/* Jobs list */}
                <div className="p-2 space-y-1.5 max-h-[60vh] overflow-y-auto">
                  {jobs.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-white/50 text-center py-6 italic">No jobs</p>
                  ) : (
                    jobs.map(job => {
                    // Week cells are thin, so the crew shows as "Lead +N" with
                    // the full roster (names + roles) in the tooltip — the day
                    // views carry the expandable list.
                    const crew = job.crew ?? [];
                    const people = [
                      job.operator_name ? `${job.operator_name} (lead)` : null,
                      job.helper_name ? `${job.helper_name} (helper)` : null,
                      crew.length ? crewSummary(crew) : null,
                    ].filter(Boolean).join(', ');
                    const extraCount = (job.helper_name ? 1 : 0) + crew.length;
                    return (
                      <div
                        key={job.id}
                        draggable={canEdit}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/job-card', JSON.stringify({ jobId: job.id, sourceRowIndex: -1 }));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onClick={() => onDayClick(date)}
                        className="relative min-h-[44px] p-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 hover:shadow-md transition-all cursor-pointer group"
                      >
                        {/* Add a person to this job — same affordance as the day
                            views, so the week view isn't a dead end. 44px target. */}
                        {canEdit && onAddCrewJob && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onAddCrewJob(job, date); }}
                            className="absolute top-0 right-0 flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-white/10 transition-colors"
                            title="Add crew — another operator or helper on this job"
                            aria-label="Add crew member to this job"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                        )}
                        {/* pr-9 on BOTH lines: the 44px button is taller than the
                            title alone, so without it the button's lower half sits
                            over the job-type line and a tap there opens crew instead
                            of the day. */}
                        <p className={`text-xs font-bold text-gray-900 dark:text-white truncate ${canEdit && onAddCrewJob ? 'pr-9' : ''}`}>{job.customer_name}</p>
                        <p className={`text-[10px] text-purple-600 dark:text-purple-400 font-semibold truncate ${canEdit && onAddCrewJob ? 'pr-9' : ''}`}>{job.job_type?.split(',')[0]?.trim()}</p>
                        {job.arrival_time && (
                          <p className="text-[10px] text-gray-400 mt-0.5">⏰ {job.arrival_time}</p>
                        )}
                        {people && (
                          <p
                            className={`flex items-center gap-1 text-[10px] text-gray-500 dark:text-white/60 mt-0.5 min-w-0 ${canEdit && onAddCrewJob ? 'pr-9' : ''}`}
                            title={`Crew: ${people}`}
                          >
                            <Users className="w-2.5 h-2.5 flex-shrink-0 text-gray-400 dark:text-white/40" />
                            <span className="truncate">{job.operator_name || 'Unassigned'}</span>
                            {extraCount > 0 && (
                              <span className="flex-shrink-0 font-semibold text-indigo-600 dark:text-indigo-300">+{extraCount}</span>
                            )}
                          </p>
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
                    );
                    })
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
