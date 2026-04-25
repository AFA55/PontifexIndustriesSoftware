'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar,
  User,
  Briefcase,
  AlertTriangle,
} from 'lucide-react';

interface DateInfo {
  date: string;
  dayName: string;
  dayNum: number;
  month: string;
  isWeekend: boolean;
  isToday: boolean;
}

interface JobInfo {
  id: string;
  job_number: string;
  customer: string;
  job_type: string;
  status: string;
  time: string;
}

interface CellData {
  date: string;
  count: number;
  color: 'empty' | 'green' | 'amber' | 'red';
  jobs: JobInfo[];
}

interface OperatorRow {
  operator_id: string;
  name: string;
  role: string;
  skill_level: number;
  cells: CellData[];
}

interface GridData {
  dates: DateInfo[];
  rows: OperatorRow[];
  totalOperators: number;
  maxSlots: number;
  warningThreshold: number;
}

// Color schemes matching platform design
const CELL_COLORS = {
  empty: {
    bg: 'bg-gray-50',
    text: 'text-gray-400',
    border: 'border-gray-100',
    hover: 'hover:bg-gray-100',
  },
  green: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    hover: 'hover:bg-emerald-100',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    hover: 'hover:bg-amber-100',
  },
  red: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    hover: 'hover:bg-red-100',
  },
};

const CELL_DOTS = {
  empty: '',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};

interface CrewScheduleGridProps {
  onDateClick?: (date: string) => void;
}

export default function CrewScheduleGrid({ onDateClick }: CrewScheduleGridProps) {
  const [data, setData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0];
  });
  const [days, setDays] = useState(14);
  const [hoveredCell, setHoveredCell] = useState<{ opId: string; date: string } | null>(null);
  const [popoverCell, setPopoverCell] = useState<{ opId: string; date: string; jobs: JobInfo[]; rect: DOMRect } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const fetchGrid = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(
        `/api/admin/schedule-board/crew-grid?startDate=${startDate}&days=${days}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch (err) {
      console.error('Error fetching crew grid:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, days]);

  useEffect(() => {
    fetchGrid();
  }, [fetchGrid]);

  const shiftDates = (direction: number) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + (direction * 7));
    setStartDate(d.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setStartDate(new Date().toISOString().split('T')[0]);
  };

  const handleCellClick = (opId: string, cell: CellData, e: React.MouseEvent) => {
    if (cell.count === 0) {
      // Click empty cell → navigate to that date on the schedule board
      onDateClick?.(cell.date);
      return;
    }

    // Show popover with job details
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverCell(prev =>
      prev?.opId === opId && prev?.date === cell.date
        ? null
        : { opId, date: cell.date, jobs: cell.jobs, rect }
    );
  };

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverCell && gridRef.current && !gridRef.current.contains(e.target as Node)) {
        setPopoverCell(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popoverCell]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600 dark:text-white/60 font-medium">Loading crew schedule...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div ref={gridRef} className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftDates(-1)}
            className="p-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-50 dark:hover:bg-white/10 transition-all text-gray-600 dark:text-white/70 shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToToday}
            className="px-4 py-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-50 dark:hover:bg-white/10 transition-all text-gray-700 dark:text-white/80 text-sm font-medium shadow-sm"
          >
            Today
          </button>
          <button
            onClick={() => shiftDates(1)}
            className="p-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-50 dark:hover:bg-white/10 transition-all text-gray-600 dark:text-white/70 shadow-sm"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 dark:text-white/60 ml-2">
            {data.dates[0]?.month} {data.dates[0]?.dayNum} — {data.dates[data.dates.length - 1]?.month} {data.dates[data.dates.length - 1]?.dayNum}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Day range selector */}
          <div className="inline-flex rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-1 shadow-sm">
            {[7, 14, 21].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  days === d
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                    : 'text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 ml-3 text-xs text-gray-500 dark:text-white/50">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500"></span> Available</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500"></span> Near Cap</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500"></span> Full</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-300"></span> Open</span>
          </div>
        </div>
      </div>

      {/* Grid Table */}
      <div className="bg-white dark:bg-white/5 rounded-3xl border border-gray-200/80 dark:border-white/10 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            {/* Date Header */}
            <thead>
              <tr className="bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 dark:from-white/5 dark:via-white/5 dark:to-white/5 border-b border-gray-200 dark:border-white/10">
                <th className="sticky left-0 z-10 bg-gray-100 dark:bg-[#0b0618] px-4 py-3 text-left text-xs font-bold text-gray-700 dark:text-white/70 uppercase tracking-wider w-[140px] min-w-[140px]">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-500 dark:text-white/40" />
                    Operator
                  </div>
                </th>
                {data.dates.map(d => (
                  <th
                    key={d.date}
                    className={`px-1 py-3 text-center text-xs font-medium min-w-[70px] cursor-pointer hover:bg-gray-200 dark:hover:bg-white/10 transition-colors ${
                      d.isToday
                        ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400'
                        : d.isWeekend
                          ? 'text-gray-400 dark:text-white/30'
                          : 'text-gray-600 dark:text-white/60'
                    }`}
                    onClick={() => onDateClick?.(d.date)}
                  >
                    <div className="leading-tight">
                      <div className={`text-[10px] uppercase tracking-wider ${d.isToday ? 'text-blue-600 dark:text-blue-400 font-bold' : ''}`}>
                        {d.dayName}
                      </div>
                      <div className={`text-sm font-bold ${d.isToday ? 'text-blue-700 dark:text-blue-300' : 'dark:text-white'}`}>
                        {d.dayNum}
                      </div>
                      {(d.dayNum === 1 || d === data.dates[0]) && (
                        <div className="text-[9px] text-gray-500 dark:text-white/40 uppercase">{d.month}</div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Operator Rows */}
            <tbody>
              {data.rows.map((row, rowIdx) => {
                const isUnassigned = row.operator_id === 'unassigned';

                return (
                  <tr
                    key={row.operator_id}
                    className={`border-t border-gray-100 dark:border-white/5 transition-colors ${
                      isUnassigned
                        ? 'bg-red-50/50 dark:bg-red-500/5'
                        : rowIdx % 2 === 0
                          ? 'bg-white dark:bg-transparent'
                          : 'bg-gray-50/50 dark:bg-white/[0.02]'
                    } hover:bg-blue-50/30 dark:hover:bg-white/5`}
                  >
                    {/* Operator Name */}
                    <td className={`sticky left-0 z-10 px-4 py-2 text-sm font-semibold whitespace-nowrap ${
                      isUnassigned
                        ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-r-2 border-red-200 dark:border-red-500/30'
                        : rowIdx % 2 === 0
                          ? 'bg-white dark:bg-[#0b0618] text-gray-800 dark:text-white/80 border-r border-gray-100 dark:border-white/5'
                          : 'bg-gray-50 dark:bg-[#0b0618] text-gray-800 dark:text-white/80 border-r border-gray-100 dark:border-white/5'
                    }`}>
                      <div className="flex items-center gap-2">
                        {isUnassigned ? (
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {row.name.charAt(0)}
                          </div>
                        )}
                        <div className="truncate max-w-[90px]">
                          <div className="truncate">{row.name}</div>
                          {!isUnassigned && row.role === 'apprentice' && (
                            <div className="text-[10px] text-gray-400 dark:text-white/30 font-normal">Helper</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Date Cells */}
                    {row.cells.map(cell => {
                      const colors = CELL_COLORS[cell.color];
                      const dotColor = CELL_DOTS[cell.color];
                      const isHovered = hoveredCell?.opId === row.operator_id && hoveredCell?.date === cell.date;
                      const isWeekend = data.dates.find(d => d.date === cell.date)?.isWeekend;
                      const isToday = data.dates.find(d => d.date === cell.date)?.isToday;

                      return (
                        <td
                          key={cell.date}
                          className={`px-1 py-1.5 text-center relative ${isToday ? 'bg-blue-50/50' : ''}`}
                          onMouseEnter={() => setHoveredCell({ opId: row.operator_id, date: cell.date })}
                          onMouseLeave={() => setHoveredCell(null)}
                        >
                          <button
                            onClick={(e) => handleCellClick(row.operator_id, cell, e)}
                            className={`w-full px-2 py-2 rounded-xl text-xs font-bold transition-all ${colors.bg} ${colors.text} ${colors.hover} border ${colors.border} ${
                              isHovered ? 'scale-110 shadow-md z-10' : ''
                            } ${isWeekend && cell.count === 0 ? 'opacity-40' : ''}`}
                          >
                            <div className="flex items-center justify-center gap-1">
                              {dotColor && <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>}
                              <span>{cell.count}</span>
                            </div>
                          </button>

                          {/* Job Popover */}
                          {popoverCell?.opId === row.operator_id && popoverCell?.date === cell.date && popoverCell.jobs.length > 0 && (
                            <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 w-64 bg-white dark:bg-[#0e0720] dark:border dark:border-white/10 rounded-2xl shadow-2xl border border-gray-200 p-3 text-left">
                              <div className="text-xs font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(cell.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </div>
                              <div className="space-y-1.5 max-h-48 overflow-auto">
                                {popoverCell.jobs.map(job => (
                                  <div key={job.id} className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                                    <Briefcase className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">{job.job_number}</p>
                                      <p className="text-[10px] text-gray-500 dark:text-white/50 truncate">{job.customer}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {job.time && <span className="text-[10px] text-blue-600">{job.time}</span>}
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                          job.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' :
                                          job.status === 'in_progress' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' :
                                          job.status === 'in_route' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' :
                                          'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/60'
                                        }`}>{job.status.replace('_', ' ')}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Legend */}
      <div className="flex sm:hidden items-center justify-center gap-4 text-xs text-gray-500 dark:text-white/50">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> Available</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500"></span> Near Cap</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500"></span> Full/Over</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-300"></span> Open</span>
      </div>
    </div>
  );
}
