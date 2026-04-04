'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface ScheduleDatePickerProps {
  value: string;
  onChange: (date: string) => void;
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

function fmt(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parse(dateStr: string) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { year: y, month: m - 1, day: d };
}

function formatDisplayDate(dateString: string) {
  const p = parse(dateString);
  if (!p) return '';
  const date = new Date(p.year, p.month, p.day);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dateOnly = new Date(date); dateOnly.setHours(0, 0, 0, 0);
  if (dateOnly.getTime() === today.getTime()) return 'Today';
  if (dateOnly.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function ScheduleDatePicker({ value, onChange }: ScheduleDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = parse(value);
  const today = new Date();
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());

  useEffect(() => {
    if (value) {
      const p = parse(value);
      if (p) { setViewYear(p.year); setViewMonth(p.month); }
    }
  }, [value]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function isToday(year: number, month: number, day: number) {
    return year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
  }

  function isSelected(year: number, month: number, day: number) {
    if (!parsed) return false;
    return year === parsed.year && month === parsed.month && day === parsed.day;
  }

  function isWeekend(year: number, month: number, day: number) {
    const d = new Date(year, month, day).getDay();
    return d === 0 || d === 6;
  }

  function goToPrevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }

  function goToNextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function selectDay(day: number) {
    onChange(fmt(viewYear, viewMonth, day));
    setIsOpen(false);
  }

  function goToPreviousDay() {
    const p = parse(value);
    if (!p) return;
    const d = new Date(p.year, p.month, p.day);
    d.setDate(d.getDate() - 1);
    onChange(fmt(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  function goToNextDay() {
    const p = parse(value);
    if (!p) return;
    const d = new Date(p.year, p.month, p.day);
    d.setDate(d.getDate() + 1);
    onChange(fmt(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  function goToToday() {
    const t = new Date();
    onChange(fmt(t.getFullYear(), t.getMonth(), t.getDate()));
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const isValueToday = value === fmt(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="flex items-center gap-3">
      {/* Prev Day */}
      <button
        onClick={goToPreviousDay}
        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all hover:scale-105"
      >
        <ChevronLeft className="w-5 h-5 text-gray-700" />
      </button>

      {/* Calendar Trigger */}
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-3 px-5 py-3 rounded-xl border cursor-pointer transition-all group ${
            isOpen
              ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-200 shadow-lg'
              : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-purple-300'
          }`}
        >
          <Calendar className="w-5 h-5 text-purple-600 group-hover:scale-110 transition-transform" />
          <div className="text-left">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Viewing</div>
            <span className="text-lg font-bold text-gray-900">{formatDisplayDate(value)}</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </button>

        {/* Calendar Dropdown */}
        {isOpen && (
          <div className="absolute z-50 mt-2 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-2xl shadow-2xl p-5 w-[340px] animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Month/Year Header */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={goToPrevMonth}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-600 hover:bg-purple-50 hover:text-purple-700 active:bg-purple-100 transition-all"
              >
                <ChevronLeft size={18} />
              </button>
              <h3 className="text-base font-bold text-gray-800">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </h3>
              <button
                type="button"
                onClick={goToNextMonth}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-600 hover:bg-purple-50 hover:text-purple-700 active:bg-purple-100 transition-all"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Day Names */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-wider py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((day, idx) => {
                if (day === null) return <div key={`empty-${idx}`} className="aspect-square" />;

                const selected = isSelected(viewYear, viewMonth, day);
                const todayMark = isToday(viewYear, viewMonth, day);
                const weekend = isWeekend(viewYear, viewMonth, day);

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => selectDay(day)}
                    className={`aspect-square rounded-xl flex items-center justify-center text-sm font-semibold transition-all duration-150 ${
                      selected
                        ? 'bg-gradient-to-br from-purple-600 to-pink-500 text-white shadow-lg shadow-purple-200/50 scale-110'
                        : todayMark
                          ? 'border-2 border-purple-400 text-purple-600 hover:bg-purple-50'
                          : weekend
                            ? 'text-gray-300 hover:bg-gray-50'
                            : 'text-gray-700 hover:bg-purple-50 hover:text-purple-700 active:bg-purple-100'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { goToToday(); setIsOpen(false); }}
                className="flex-1 py-2 text-xs font-bold text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              >
                Today
              </button>
              {!isCurrentMonth && (
                <button
                  type="button"
                  onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}
                  className="flex-1 py-2 text-xs font-bold text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Current Month
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Next Day */}
      <button
        onClick={goToNextDay}
        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all hover:scale-105"
      >
        <ChevronRight className="w-5 h-5 text-gray-700" />
      </button>

      {/* Today Button */}
      <button
        onClick={goToToday}
        className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
          isValueToday
            ? 'bg-purple-100 text-purple-700 border border-purple-300'
            : 'bg-gray-100 hover:bg-purple-50 text-gray-600 hover:text-purple-700 border border-gray-200 hover:border-purple-200'
        }`}
      >
        Today
      </button>
    </div>
  );
}
