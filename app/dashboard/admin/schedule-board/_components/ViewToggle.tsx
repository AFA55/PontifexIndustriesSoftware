'use client';

import { LayoutGrid, Users, CalendarDays } from 'lucide-react';

interface ViewToggleProps {
  viewMode: 'slots' | 'operators' | 'crew-grid';
  onChange: (mode: 'slots' | 'operators' | 'crew-grid') => void;
}

const VIEWS = [
  { key: 'slots' as const, label: 'Slots', icon: LayoutGrid },
  { key: 'operators' as const, label: 'Operators', icon: Users },
  { key: 'crew-grid' as const, label: 'Crew Grid', icon: CalendarDays },
];

export default function ViewToggle({ viewMode, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
      {VIEWS.map(v => (
        <button
          key={v.key}
          onClick={() => onChange(v.key)}
          className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 ${
            viewMode === v.key
              ? 'bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-md'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
          }`}
        >
          <v.icon className="w-3.5 h-3.5" /> {v.label}
        </button>
      ))}
    </div>
  );
}
