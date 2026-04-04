'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

interface DayData {
  count: number;
  jobs: { id: string; job_number: string; customer: string; status: string; time?: string }[];
}

const DOT_COLORS: Record<string, string> = {
  scheduled: '#3b82f6',
  completed: '#10b981',
  in_progress: '#f59e0b',
  cancelled: '#ef4444',
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export default function MiniCalendarWidget({ data, isLoading }: WidgetProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const dates: Record<string, DayData> = data?.dates ?? {};

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Upcoming jobs (next 5 from today)
  const upcomingJobs = useMemo(() => {
    const allJobs: { date: string; job_number: string; customer: string; time?: string }[] = [];
    for (const [dateStr, dayData] of Object.entries(dates)) {
      if (dateStr >= todayStr) {
        for (const job of dayData.jobs) {
          allJobs.push({ date: dateStr, ...job });
        }
      }
    }
    return allJobs.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  }, [dates, todayStr]);

  const selectedDayData = selectedDay ? dates[selectedDay] : null;

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-0.5 hover:bg-gray-100 rounded">
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        </button>
        <span className="text-xs font-semibold text-gray-700">{monthLabel}</span>
        <button onClick={nextMonth} className="p-0.5 hover:bg-gray-100 rounded">
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] text-gray-400 font-medium py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {calendarCells.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} />;

          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
          const dayData = dates[dateStr];
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDay;

          // Collect unique statuses for dots
          const statuses = dayData
            ? [...new Set(dayData.jobs.map((j) => j.status))].slice(0, 3)
            : [];
          const overflow = dayData && dayData.count > 3;

          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDay(isSelected ? null : dateStr)}
              className={`flex flex-col items-center py-1 rounded-lg transition-colors ${
                isToday ? 'ring-2 ring-blue-500 bg-blue-50' : ''
              } ${isSelected ? 'bg-blue-100' : 'hover:bg-gray-50'}`}
            >
              <span className="text-xs text-gray-700">{day}</span>
              {statuses.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {statuses.map((s, i) => (
                    <span
                      key={i}
                      className="w-1 h-1 rounded-full"
                      style={{ backgroundColor: DOT_COLORS[s] ?? '#6b7280' }}
                    />
                  ))}
                  {overflow && <span className="text-[7px] text-gray-400 leading-none">+</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day popover */}
      {selectedDayData && (
        <div className="border border-gray-200 rounded-xl p-2 bg-gray-50 space-y-1">
          <p className="text-[10px] text-gray-500 font-medium">
            {new Date(selectedDay! + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} &mdash; {selectedDayData.count} job{selectedDayData.count !== 1 ? 's' : ''}
          </p>
          {selectedDayData.jobs.slice(0, 5).map((job, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: DOT_COLORS[job.status] ?? '#6b7280' }} />
              <span className="font-medium text-gray-700">{job.job_number}</span>
              <span className="text-gray-400 truncate">{job.customer}</span>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming */}
      {!selectedDayData && upcomingJobs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Upcoming</p>
          {upcomingJobs.map((job, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <Calendar className="w-3 h-3 text-gray-300 flex-shrink-0" />
              <span className="font-medium text-gray-700">{job.job_number}</span>
              <span className="text-gray-400 truncate flex-1">{job.customer}</span>
              <span className="text-[10px] text-gray-400 flex-shrink-0">
                {new Date(job.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
