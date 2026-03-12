'use client';

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface DayNavigatorProps {
  selectedDate: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  hasLongDurationJob: boolean;
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplay(dateStr: string) {
  const date = parseDate(dateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const d = new Date(date); d.setHours(0, 0, 0, 0);

  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function diffDays(a: string, b: string) {
  const da = parseDate(a);
  const db = parseDate(b);
  return Math.floor((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
}

export default function DayNavigator({ selectedDate, onChange, hasLongDurationJob }: DayNavigatorProps) {
  const todayStr = toDateString(new Date());

  const canGoForward = () => {
    const diff = diffDays(selectedDate, todayStr);
    if (diff < 1) return true; // Can always go to tomorrow
    if (hasLongDurationJob && diff < 7) return true; // Up to 7 days for long jobs
    return false;
  };

  const canGoBack = () => {
    const diff = diffDays(todayStr, selectedDate);
    return diff < 14; // 2 weeks lookback
  };

  const goForward = () => {
    if (!canGoForward()) return;
    const d = parseDate(selectedDate);
    d.setDate(d.getDate() + 1);
    onChange(toDateString(d));
  };

  const goBack = () => {
    if (!canGoBack()) return;
    const d = parseDate(selectedDate);
    d.setDate(d.getDate() - 1);
    onChange(toDateString(d));
  };

  const goToday = () => onChange(todayStr);

  const isToday = selectedDate === todayStr;
  const displayLabel = formatDisplay(selectedDate);
  const fullDate = parseDate(selectedDate).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="flex items-center justify-between bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-3">
      <button
        onClick={goBack}
        disabled={!canGoBack()}
        className="p-2.5 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-5 h-5 text-gray-700" />
      </button>

      <div className="flex-1 text-center">
        <button
          onClick={goToday}
          className="inline-flex items-center gap-2"
        >
          {isToday && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600"></span>
            </span>
          )}
          <div className={`text-lg font-bold ${isToday ? 'bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent' : 'text-gray-900'}`}>
            {displayLabel}
          </div>
          {!isToday && (
            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">
              Today
            </span>
          )}
        </button>
        <div className="text-xs text-gray-500 mt-0.5">{fullDate}</div>
      </div>

      <button
        onClick={goForward}
        disabled={!canGoForward()}
        className="p-2.5 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-5 h-5 text-gray-700" />
      </button>
    </div>
  );
}
