'use client';

/**
 * UnifiedEquipmentPanel
 *
 * Replaces both the read-only EquipmentSelectionsDisplay and the old
 * EquipmentPanel checklist with a single unified confirmation panel.
 *
 * Features:
 *   - Smart deduplication across service types
 *   - Quantities summed (e.g. hydraulic hose 80 ft total)
 *   - Grouped by truck-loading category
 *   - Service-context tags on every item
 *   - Progress tracking with gate for "Start In Route"
 *   - Mobile-first, large touch targets
 */

import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  Wrench,
  Cog,
  CircleDot,
  Scissors,
  Cable,
  Container,
  Package,
} from 'lucide-react';
import {
  type UnifiedEquipmentItem,
  type EquipmentCategory,
  CATEGORY_META,
  SERVICE_TAG_LABELS,
  unifyEquipmentSelections,
  groupByCategory,
} from '@/lib/equipment-unifier';

// ── Category Icons ──────────────────────────────────────────

const CATEGORY_ICONS: Record<EquipmentCategory, React.ElementType> = {
  machines_power: Cog,
  core_bits: CircleDot,
  cutting_accessories: Scissors,
  hoses_cords: Cable,
  drums_containment: Container,
  supplies: Package,
};

// ── Category Color Classes ──────────────────────────────────

const CATEGORY_COLORS: Record<EquipmentCategory, { border: string; bg: string; text: string; icon: string }> = {
  machines_power:      { border: 'border-l-blue-500',   bg: 'bg-blue-50',   text: 'text-blue-700',   icon: 'text-blue-500'  },
  core_bits:           { border: 'border-l-rose-500',   bg: 'bg-rose-50',   text: 'text-rose-700',   icon: 'text-rose-500'  },
  cutting_accessories: { border: 'border-l-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', icon: 'text-orange-500' },
  hoses_cords:         { border: 'border-l-cyan-500',   bg: 'bg-cyan-50',   text: 'text-cyan-700',   icon: 'text-cyan-500'  },
  drums_containment:   { border: 'border-l-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-700',  icon: 'text-amber-500' },
  supplies:            { border: 'border-l-gray-400',   bg: 'bg-gray-50',   text: 'text-gray-600',   icon: 'text-gray-400'  },
};

// ── Service Tag Colors ──────────────────────────────────────

const SERVICE_TAG_COLORS: Record<string, string> = {
  'ECD':     'bg-rose-100 text-rose-700',
  'HFCD':    'bg-pink-100 text-pink-700',
  'HCD':     'bg-red-100 text-red-700',
  'DFS':     'bg-violet-100 text-violet-700',
  'WS/TS':   'bg-orange-100 text-orange-700',
  'CS':      'bg-amber-100 text-amber-700',
  'HHS/PS':  'bg-emerald-100 text-emerald-700',
  'WireSaw': 'bg-teal-100 text-teal-700',
  'GPR':     'bg-indigo-100 text-indigo-700',
  'Demo':    'bg-stone-100 text-stone-700',
  'Brokk':   'bg-stone-100 text-stone-700',
};

// ── Props ───────────────────────────────────────────────────

interface UnifiedEquipmentPanelProps {
  equipmentSelections: Record<string, Record<string, string>> | null | undefined;
  equipmentNeeded: string[];
  mandatoryEquipment: string[];
  specialEquipment: string | null;
  checkedItems: Record<string, boolean>;
  onToggle: (itemId: string) => void;
  disabled?: boolean;
}

// ── Component ───────────────────────────────────────────────

export default function UnifiedEquipmentPanel({
  equipmentSelections,
  equipmentNeeded,
  mandatoryEquipment,
  specialEquipment,
  checkedItems,
  onToggle,
  disabled = false,
}: UnifiedEquipmentPanelProps) {
  // Compute unified items
  const unifiedItems = useMemo(
    () => unifyEquipmentSelections(equipmentSelections, equipmentNeeded, mandatoryEquipment),
    [equipmentSelections, equipmentNeeded, mandatoryEquipment],
  );

  // Group by category
  const groups = useMemo(() => groupByCategory(unifiedItems), [unifiedItems]);

  // Collapsed state per category (all expanded by default)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Progress
  const totalItems = unifiedItems.length;
  const checkedCount = unifiedItems.filter(i => checkedItems[i.id]).length;
  const allDone = totalItems > 0 && checkedCount === totalItems;

  if (totalItems === 0) {
    return (
      <div className="text-center py-6 text-gray-400 dark:text-white/40 text-sm">
        No equipment required for this job.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Progress Header ────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className={`font-bold ${allDone ? 'text-green-600' : 'text-gray-700 dark:text-white/80'}`}>
            {checkedCount} / {totalItems} confirmed
          </span>
          {allDone && (
            <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
              ✓ All Set
            </span>
          )}
        </div>
        <div className="w-full bg-gray-200 dark:bg-white/10 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${
              allDone ? 'bg-green-500' : checkedCount > 0 ? 'bg-amber-500' : 'bg-gray-300'
            }`}
            style={{ width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* ── Category Groups ────────────────────────── */}
      {groups.map(({ category, items }) => {
        const meta = CATEGORY_META[category];
        const colors = CATEGORY_COLORS[category];
        const Icon = CATEGORY_ICONS[category];
        const isCollapsed = collapsed[category] || false;
        const catChecked = items.filter(i => checkedItems[i.id]).length;

        return (
          <div
            key={category}
            className={`rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden ${colors.border} border-l-4`}
          >
            {/* Category Header */}
            <button
              onClick={() => toggleCollapse(category)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 ${colors.bg} hover:brightness-95 transition-all`}
            >
              <Icon className={`w-4 h-4 ${colors.icon} flex-shrink-0`} />
              <span className={`text-xs font-bold uppercase tracking-wider ${colors.text} flex-1 text-left`}>
                {meta.label}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                catChecked === items.length
                  ? 'bg-green-100 text-green-700'
                  : 'bg-white/80 text-gray-500'
              }`}>
                {catChecked}/{items.length}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-white/40 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
              />
            </button>

            {/* Equipment Rows */}
            {!isCollapsed && (
              <div className="divide-y divide-gray-100 dark:divide-white/5">
                {items.map(item => (
                  <EquipmentCheckRow
                    key={item.id}
                    item={item}
                    isChecked={checkedItems[item.id] || false}
                    onToggle={() => !disabled && onToggle(item.id)}
                    disabled={disabled}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Special Equipment Note ─────────────────── */}
      {specialEquipment && (
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
          <div className="flex items-center gap-2 text-sm font-bold text-purple-700 mb-1">
            <Wrench className="w-4 h-4" />
            Special Equipment Note
          </div>
          <p className="text-sm text-purple-800">{specialEquipment}</p>
        </div>
      )}
    </div>
  );
}

// ── Equipment Check Row ─────────────────────────────────────

function EquipmentCheckRow({
  item,
  isChecked,
  onToggle,
  disabled,
}: {
  item: UnifiedEquipmentItem;
  isChecked: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-3 transition-all ${
        isChecked
          ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
          : 'bg-white dark:bg-transparent text-gray-700 dark:text-white/80 hover:bg-gray-50 dark:hover:bg-white/5'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer active:scale-[0.99]'}`}
    >
      {/* Checkbox */}
      {isChecked ? (
        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
      ) : (
        <Circle className="w-5 h-5 text-gray-300 dark:text-white/20 flex-shrink-0" />
      )}

      {/* Label + Quantity */}
      <div className="flex-1 text-left min-w-0">
        <span className="text-sm font-semibold">{item.label}</span>
        {item.quantity !== null && (
          <span className={`ml-1.5 text-xs font-bold ${isChecked ? 'text-green-600' : 'text-blue-600'}`}>
            {item.unit === 'ft' ? `${item.quantity} ft` : `x${item.quantity}`}
          </span>
        )}
      </div>

      {/* Service Tags */}
      {item.sourceServices.length > 0 && (
        <div className="flex flex-wrap gap-1 flex-shrink-0">
          {item.sourceServices.map(svc => (
            <span
              key={svc}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                SERVICE_TAG_COLORS[svc] || 'bg-gray-100 text-gray-600'
              }`}
            >
              {SERVICE_TAG_LABELS[svc] || svc}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
