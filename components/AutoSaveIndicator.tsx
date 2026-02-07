'use client';

import { useEffect, useState } from 'react';

interface AutoSaveIndicatorProps {
  isSaving: boolean;
  lastSaved: Date | null;
}

export function AutoSaveIndicator({ isSaving, lastSaved }: AutoSaveIndicatorProps) {
  const [timeAgo, setTimeAgo] = useState<string>('');

  useEffect(() => {
    if (!lastSaved) return;

    const updateTimeAgo = () => {
      const seconds = Math.floor((Date.now() - lastSaved.getTime()) / 1000);

      if (seconds < 5) {
        setTimeAgo('just now');
      } else if (seconds < 60) {
        setTimeAgo(`${seconds}s ago`);
      } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        setTimeAgo(`${minutes}m ago`);
      } else {
        const hours = Math.floor(seconds / 3600);
        setTimeAgo(`${hours}h ago`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [lastSaved]);

  if (!isSaving && !lastSaved) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-fadeIn">
      <div className="bg-white/90 backdrop-blur-lg rounded-xl shadow-lg border border-gray-200/50 px-4 py-2.5 flex items-center gap-2.5">
        {isSaving ? (
          <>
            {/* Saving spinner */}
            <div className="relative w-4 h-4">
              <div className="absolute inset-0 border-2 border-orange-200 rounded-full"></div>
              <div className="absolute inset-0 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <span className="text-sm font-medium text-gray-700">Saving draft...</span>
          </>
        ) : (
          <>
            {/* Saved checkmark */}
            <div className="w-4 h-4 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center">
              <svg
                className="w-3 h-3 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">
              Saved {timeAgo}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
