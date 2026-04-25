'use client';

import { useState } from 'react';
import {
  X,
  Settings,
  LayoutTemplate,
  Paintbrush,
  Check,
  Briefcase,
  DollarSign,
  Receipt,
  BarChart3,
  PieChart,
  Users,
  Calendar,
  Activity,
  Shield,
  TrendingUp,
  Target,
} from 'lucide-react';
import { WIDGET_REGISTRY, WidgetCategory } from './WidgetRegistry';
import { LayoutPreset, LAYOUT_PRESETS } from './LayoutPresets';

const ICON_MAP: Record<string, React.ElementType> = {
  BarChart3, PieChart, DollarSign, Users, Calendar, Activity, Shield, TrendingUp, Briefcase, Target, Receipt,
};

const PRESET_ICON_MAP: Record<string, React.ElementType> = {
  Briefcase, DollarSign, Receipt,
};

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  financial: 'Financial',
  operations: 'Operations',
  communication: 'Communication',
  personal: 'Personal',
};

const CATEGORY_ORDER: WidgetCategory[] = ['financial', 'operations', 'communication', 'personal'];

type Tab = 'widgets' | 'presets' | 'appearance';

const DENSITY_OPTIONS = [
  { label: 'Compact', value: 60 },
  { label: 'Normal', value: 72 },
  { label: 'Relaxed', value: 90 },
] as const;

interface DashboardSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  activeWidgetIds: string[];
  userRole: string;
  onToggleWidget: (widgetId: string, active: boolean) => void;
  onApplyPreset: (preset: LayoutPreset) => void;
  density: number;
  onDensityChange: (rowHeight: number) => void;
}

export default function DashboardSettingsPanel({
  open,
  onClose,
  activeWidgetIds,
  userRole,
  onToggleWidget,
  onApplyPreset,
  density,
  onDensityChange,
}: DashboardSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('widgets');

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'widgets', label: 'Widgets', icon: Settings },
    { id: 'presets', label: 'Presets', icon: LayoutTemplate },
    { id: 'appearance', label: 'Appearance', icon: Paintbrush },
  ];

  // Group widgets by category, filtered by role
  const allWidgets = Object.values(WIDGET_REGISTRY);
  const widgetsByCategory: Record<string, typeof allWidgets> = {};
  for (const cat of CATEGORY_ORDER) {
    const widgets = allWidgets.filter(
      (w) => w.category === cat && w.roles.includes(userRole)
    );
    if (widgets.length > 0) {
      widgetsByCategory[cat] = widgets;
    }
  }

  // Filter presets by role
  const availablePresets = LAYOUT_PRESETS.filter((p) => p.roles.includes(userRole));

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-80 bg-white dark:bg-[#0e0720] dark:border-l dark:border-white/10 shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
          <h2 className="text-sm font-bold text-gray-800 dark:text-white">Dashboard Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all dark:text-white/40 dark:hover:text-white/70 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-white/10">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50 dark:text-blue-400 dark:border-blue-400 dark:bg-blue-500/10'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-white/40 dark:hover:text-white/70 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'widgets' && (
            <div className="p-4 space-y-5">
              {Object.entries(widgetsByCategory).map(([category, widgets]) => (
                <div key={category}>
                  <h3 className="text-xs font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-2">
                    {CATEGORY_LABELS[category as WidgetCategory] ?? category}
                  </h3>
                  <div className="space-y-1">
                    {widgets.map((widget) => {
                      const isActive = activeWidgetIds.includes(widget.id);
                      const Icon = ICON_MAP[widget.icon] ?? BarChart3;
                      return (
                        <button
                          key={widget.id}
                          onClick={() => onToggleWidget(widget.id, !isActive)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all text-left group dark:border-white/5 dark:hover:border-white/10 dark:hover:bg-white/5"
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                              isActive
                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
                                : 'bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-white/30'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700 dark:text-white/80 truncate">
                              {widget.title}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-white/40 truncate">
                              {widget.description}
                            </p>
                          </div>
                          <div
                            className={`w-9 h-5 rounded-full flex items-center transition-all flex-shrink-0 ${
                              isActive ? 'bg-blue-600 justify-end' : 'bg-gray-200 dark:bg-white/10 justify-start'
                            }`}
                          >
                            <div className="w-4 h-4 bg-white rounded-full shadow-sm mx-0.5" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(widgetsByCategory).length === 0 && (
                <p className="text-sm text-gray-400 dark:text-white/40 text-center py-8">No widgets available for your role.</p>
              )}
            </div>
          )}

          {activeTab === 'presets' && (
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-500 dark:text-white/40 mb-3">
                Apply a pre-built layout optimized for your workflow.
              </p>
              {availablePresets.map((preset) => {
                const Icon = PRESET_ICON_MAP[preset.icon] ?? Briefcase;
                return (
                  <button
                    key={preset.id}
                    onClick={() => onApplyPreset(preset)}
                    className="w-full flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all text-left group dark:border-white/10 dark:hover:border-blue-400/40 dark:hover:bg-blue-500/10"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-all">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white">{preset.name}</p>
                      <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">{preset.description}</p>
                      <p className="text-xs text-gray-400 dark:text-white/30 mt-1">
                        {preset.widgets.length} widgets
                      </p>
                    </div>
                  </button>
                );
              })}
              {availablePresets.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-white/40 text-center py-8">No presets available for your role.</p>
              )}
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="p-4 space-y-5">
              <div>
                <h3 className="text-xs font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-3">
                  Grid Density
                </h3>
                <p className="text-xs text-gray-500 dark:text-white/40 mb-3">
                  Controls how tall each grid row is. Compact fits more on screen.
                </p>
                <div className="space-y-2">
                  {DENSITY_OPTIONS.map((option) => {
                    const isSelected = density === option.value;
                    return (
                      <button
                        key={option.value}
                        onClick={() => onDensityChange(option.value)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-blue-300'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:text-white/60 dark:hover:border-white/20 dark:hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected ? 'border-blue-600 dark:border-blue-400' : 'border-gray-300 dark:border-white/20'
                            }`}
                          >
                            {isSelected && (
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                            )}
                          </div>
                          <span className="text-sm font-medium">{option.label}</span>
                        </div>
                        <span className="text-xs text-gray-400 dark:text-white/30">{option.value}px</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
