'use client';

import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

interface ModernInputProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'email' | 'tel' | 'date';
  placeholder?: string;
  icon?: React.ReactNode;
  showStepper?: boolean;
  quickValues?: number[];
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  error?: string;
  tooltip?: string;
}

export function ModernInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  icon,
  showStepper = false,
  quickValues = [],
  min,
  max,
  step = 1,
  required = false,
  error,
  tooltip,
}: ModernInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = value !== '' && value !== null && value !== undefined;

  const handleIncrement = () => {
    if (type === 'number') {
      const currentValue = parseFloat(value as string) || 0;
      const newValue = max !== undefined ? Math.min(currentValue + step, max) : currentValue + step;
      onChange(newValue.toString());
    }
  };

  const handleDecrement = () => {
    if (type === 'number') {
      const currentValue = parseFloat(value as string) || 0;
      const newValue = min !== undefined ? Math.max(currentValue - step, min) : currentValue - step;
      onChange(newValue.toString());
    }
  };

  const handleQuickValue = (quickValue: number) => {
    const currentValue = parseFloat(value as string) || 0;
    onChange((currentValue + quickValue).toString());
  };

  return (
    <div className="relative">
      <div className="relative">
        {/* Icon */}
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 z-10">
            {icon}
          </div>
        )}

        {/* Input */}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          required={required}
          min={min}
          max={max}
          step={step}
          className={`
            w-full px-4 py-3 rounded-xl
            ${icon ? 'pl-10' : ''}
            ${showStepper ? 'pr-20' : ''}
            bg-white dark:bg-slate-800
            border-2 transition-all duration-200
            ${error
              ? 'border-red-500 focus:border-red-600'
              : isFocused
              ? 'border-primary-500 shadow-glow-blue'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }
            text-gray-900 dark:text-gray-100
            placeholder:text-gray-400 dark:placeholder:text-gray-500
            focus:outline-none focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          title={tooltip}
        />

        {/* Floating Label */}
        <label
          className={`
            absolute left-4 transition-all duration-200 pointer-events-none
            ${icon ? 'left-10' : 'left-4'}
            ${isFocused || hasValue
              ? '-top-2.5 text-xs bg-white dark:bg-slate-900 px-2 text-primary-600 dark:text-primary-400'
              : 'top-1/2 -translate-y-1/2 text-base text-gray-500 dark:text-gray-400'
            }
          `}
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>

        {/* Number Steppers */}
        {showStepper && type === 'number' && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            <button
              type="button"
              onClick={handleDecrement}
              className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95"
            >
              <Minus className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
            <button
              type="button"
              onClick={handleIncrement}
              className="p-1.5 rounded-lg bg-primary-100 dark:bg-primary-900 hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors active:scale-95"
            >
              <Plus className="w-4 h-4 text-primary-600 dark:text-primary-400" />
            </button>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400 animate-slide-up">
          {error}
        </p>
      )}

      {/* Quick Value Buttons */}
      {quickValues.length > 0 && type === 'number' && (
        <div className="mt-2 flex flex-wrap gap-2">
          {quickValues.map((qv) => (
            <button
              key={qv}
              type="button"
              onClick={() => handleQuickValue(qv)}
              className="px-3 py-1 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-primary-100 dark:hover:bg-primary-900 text-gray-700 dark:text-gray-300 hover:text-primary-700 dark:hover:text-primary-300 transition-all active:scale-95"
            >
              +{qv}
            </button>
          ))}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          💡 {tooltip}
        </div>
      )}
    </div>
  );
}
