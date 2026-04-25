'use client';

import { GripVertical, X } from 'lucide-react';

interface WidgetWrapperProps {
  title: string;
  editMode: boolean;
  onRemove?: () => void;
  children: React.ReactNode;
}

export default function WidgetWrapper({ title, editMode, onRemove, children }: WidgetWrapperProps) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 transition-all duration-300 flex flex-col h-full overflow-hidden dark:bg-white/5 dark:border-white/10 ${editMode ? 'ring-1 ring-blue-300 dark:ring-blue-400/40' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40">{title}</h3>
        <div className="flex items-center gap-1">
          {editMode && (
            <>
              <div className="drag-handle cursor-grab active:cursor-grabbing p-1.5 hover:bg-blue-50 dark:hover:bg-white/10 rounded-lg transition-colors">
                <GripVertical className="w-4 h-4 text-blue-400 dark:text-white/40" />
              </div>
              {onRemove && (
                <button
                  onClick={onRemove}
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg transition-colors text-gray-400 dark:text-white/30 hover:text-red-500 dark:hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {/* Body */}
      <div className="flex-1 px-3 pb-2.5 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
