'use client';

import { LayoutGrid, Users } from 'lucide-react';

interface ViewToggleProps {
  viewMode: 'slots' | 'operators';
  onChange: (mode: 'slots' | 'operators') => void;
}

export default function ViewToggle({ viewMode, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
      <button
        onClick={() => onChange('slots')}
        className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 ${
          viewMode === 'slots'
            ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-md'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5" /> Slots
      </button>
      <button
        onClick={() => onChange('operators')}
        className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 ${
          viewMode === 'operators'
            ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-md'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
        }`}
      >
        <Users className="w-3.5 h-3.5" /> Operators
      </button>
    </div>
  );
}
