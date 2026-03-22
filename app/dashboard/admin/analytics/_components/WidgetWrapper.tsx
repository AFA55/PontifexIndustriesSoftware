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
    <div className={`bg-gradient-to-br from-white to-gray-50 rounded-3xl border border-gray-200/80 shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col h-full overflow-hidden ${editMode ? 'ring-2 ring-blue-200 ring-offset-2' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        <div className="flex items-center gap-1">
          {editMode && (
            <>
              <div className="drag-handle cursor-grab active:cursor-grabbing p-1.5 hover:bg-blue-50 rounded-lg transition-colors">
                <GripVertical className="w-4 h-4 text-blue-400" />
              </div>
              {onRemove && (
                <button
                  onClick={onRemove}
                  className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {/* Body */}
      <div className="flex-1 px-5 pb-4 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
