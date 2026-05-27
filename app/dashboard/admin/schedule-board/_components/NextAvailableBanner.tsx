'use client';

import { CalendarDays, X } from 'lucide-react';

interface NextAvailableBannerProps {
  date: string;
  availableSlots: number;
  onGo: () => void;
  onDismiss: () => void;
}

export default function NextAvailableBanner({
  date,
  availableSlots,
  onGo,
  onDismiss,
}: NextAvailableBannerProps) {
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white dark:bg-[#0e0720] dark:border-white/10 rounded-2xl shadow-2xl border-2 border-purple-200 p-4 flex items-center gap-4 max-w-md">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
          <CalendarDays className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Next Available Date</p>
          <p className="text-xs text-gray-600 dark:text-white/60">
            {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            <span className="text-purple-600 font-semibold"> — {availableSlots} slots open</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onGo}
            className="px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl text-xs font-bold transition-all hover:shadow-md"
          >
            Go
          </button>
          <button
            onClick={onDismiss}
            className="px-2 py-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
