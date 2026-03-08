'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface CalendarPickerProps {
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
  label?: string;
  required?: boolean;
  icon?: any;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateString(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { year: y, month: m - 1, day: d };
}

export function CalendarPicker({ value, onChange, minDate, icon: Icon }: CalendarPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine which month to show
  const parsed = parseDateString(value);
  const today = new Date();
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());

  // Update view when value changes externally
  useEffect(() => {
    if (value) {
      const p = parseDateString(value);
      if (p) {
        setViewYear(p.year);
        setViewMonth(p.month);
      }
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const minParsed = parseDateString(minDate || '');

  function isDisabled(year: number, month: number, day: number): boolean {
    if (!minParsed) return false;
    const d = new Date(year, month, day);
    const min = new Date(minParsed.year, minParsed.month, minParsed.day);
    return d < min;
  }

  function isToday(year: number, month: number, day: number): boolean {
    return year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
  }

  function isSelected(year: number, month: number, day: number): boolean {
    if (!parsed) return false;
    return year === parsed.year && month === parsed.month && day === parsed.day;
  }

  function goToPrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  }

  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  }

  function selectDay(day: number) {
    if (isDisabled(viewYear, viewMonth, day)) return;
    onChange(toDateString(viewYear, viewMonth, day));
    setIsOpen(false);
  }

  // Format display
  const displayValue = value
    ? new Date(value + 'T00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  // Build calendar grid
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  // Check if prev month should be disabled
  const isPrevMonthDisabled = (() => {
    if (!minParsed) return false;
    // If viewing the same month as minDate or earlier, disable prev
    if (viewYear < minParsed.year) return true;
    if (viewYear === minParsed.year && viewMonth <= minParsed.month) return true;
    return false;
  })();

  const IconComponent = Icon || Calendar;

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 sm:py-4 bg-white border rounded-xl text-base transition-all duration-200 text-left ${
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <IconComponent size={18} className="text-slate-400 flex-shrink-0" />
        <span className={displayValue ? 'text-slate-800 font-medium' : 'text-slate-400'}>
          {displayValue || 'Select a date...'}
        </span>
      </button>

      {/* Calendar Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 w-full sm:w-80 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Month/Year Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={goToPrevMonth}
              disabled={isPrevMonthDisabled}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isPrevMonthDisabled
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200'
              }`}
            >
              <ChevronLeft size={20} />
            </button>
            <h3 className="text-base font-bold text-slate-800">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </h3>
            <button
              type="button"
              onClick={goToNextMonth}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Day Names */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="aspect-square" />;
              }

              const disabled = isDisabled(viewYear, viewMonth, day);
              const selected = isSelected(viewYear, viewMonth, day);
              const todayMark = isToday(viewYear, viewMonth, day);

              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(day)}
                  className={`aspect-square rounded-xl flex items-center justify-center text-sm font-semibold transition-all duration-150 ${
                    disabled
                      ? 'text-slate-300 cursor-not-allowed'
                      : selected
                        ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-blue-200/50'
                        : todayMark
                          ? 'border-2 border-blue-400 text-blue-600 hover:bg-blue-50'
                          : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                if (!isDisabled(today.getFullYear(), today.getMonth(), today.getDate())) {
                  onChange(todayStr);
                  setIsOpen(false);
                }
              }}
              className="flex-1 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="flex-1 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
