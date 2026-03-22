'use client';

import { X, BarChart3, PieChart, DollarSign, Users, Calendar, Activity, Shield, FileText, TrendingUp, Briefcase, Target, Receipt } from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  BarChart3, PieChart, DollarSign, Users, Calendar, Activity, Shield, FileText, TrendingUp, Briefcase, Target, Receipt,
};

interface WidgetOption {
  id: string;
  title: string;
  description: string;
  icon: string;
}

interface AddWidgetModalProps {
  open: boolean;
  onClose: () => void;
  availableWidgets: WidgetOption[];
  onAdd: (widgetId: string) => void;
}

export default function AddWidgetModal({ open, onClose, availableWidgets, onAdd }: AddWidgetModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Add Widget</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-3">
          {availableWidgets.length === 0 ? (
            <p className="text-center text-gray-500 py-8">All widgets are already on your dashboard.</p>
          ) : (
            availableWidgets.map((widget) => {
              const Icon = ICON_MAP[widget.icon] ?? BarChart3;
              return (
                <button
                  key={widget.id}
                  onClick={() => {
                    onAdd(widget.id);
                    onClose();
                  }}
                  className="w-full flex items-start gap-4 p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50/30 transition-all text-left"
                >
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{widget.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{widget.description}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
