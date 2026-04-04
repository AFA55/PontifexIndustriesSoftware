'use client';

import { CheckCircle2, Circle, Star, Wrench } from 'lucide-react';
import {
  getDisplayName,
  isMandatoryComplete,
  isItemMandatory,
  countCheckedMandatory,
} from '@/lib/equipment-map';

interface EquipmentPanelProps {
  equipmentNeeded: string[];
  mandatoryEquipment: string[];
  specialEquipment: string | null;
  checkedItems: Record<string, boolean>;
  onToggle: (item: string) => void;
  disabled?: boolean;
}

export default function EquipmentPanel({
  equipmentNeeded,
  mandatoryEquipment,
  specialEquipment,
  checkedItems,
  onToggle,
  disabled = false,
}: EquipmentPanelProps) {
  const allItems = equipmentNeeded || [];
  const totalItems = allItems.length;
  const checkedCount = allItems.filter(item => checkedItems[item]).length;
  const mandatoryComplete = isMandatoryComplete(mandatoryEquipment, checkedItems);
  const allMandatory = (mandatoryEquipment || []).length;
  const checkedMandatory = countCheckedMandatory(mandatoryEquipment, checkedItems);

  return (
    <div className="space-y-3">
      {/* Progress */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-gray-700">
          {checkedCount} / {totalItems} checked
        </span>
        {allMandatory > 0 && (
          <span className={`font-semibold ${mandatoryComplete ? 'text-green-600' : 'text-amber-600'}`}>
            <Star className="w-3.5 h-3.5 inline mr-1" />
            {checkedMandatory}/{allMandatory} required
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${mandatoryComplete ? 'bg-green-500' : 'bg-amber-500'}`}
          style={{ width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%` }}
        />
      </div>

      {/* Equipment List */}
      <div className="space-y-2 mt-3">
        {allItems.map((item) => {
          const isMandatory = isItemMandatory(item, mandatoryEquipment);
          const isChecked = checkedItems[item] || false;
          return (
            <button
              key={item}
              onClick={() => !disabled && onToggle(item)}
              disabled={disabled}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                isChecked
                  ? 'bg-green-50 border-green-300 text-green-800'
                  : isMandatory
                    ? 'bg-amber-50 border-amber-200 text-gray-800 hover:border-amber-400'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {isChecked ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-gray-400 flex-shrink-0" />
              )}
              <span className="text-sm font-medium flex-1 text-left">{getDisplayName(item)}</span>
              {isMandatory && (
                <Star className={`w-4 h-4 flex-shrink-0 ${isChecked ? 'text-green-500' : 'text-amber-500'} fill-current`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Special Equipment */}
      {specialEquipment && (
        <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-xl">
          <div className="flex items-center gap-2 text-sm font-bold text-purple-700 mb-1">
            <Wrench className="w-4 h-4" />
            Special Equipment
          </div>
          <p className="text-sm text-purple-800">{specialEquipment}</p>
        </div>
      )}
    </div>
  );
}
