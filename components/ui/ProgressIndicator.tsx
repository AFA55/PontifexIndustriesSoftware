'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

export interface ProgressStep {
  id: string;
  label: string;
  isCompleted: boolean;
  isActive: boolean;
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
  className?: string;
}

export function ProgressIndicator({ steps, className = '' }: ProgressIndicatorProps) {
  const completedCount = steps.filter(s => s.isCompleted).length;
  const totalSteps = steps.length;
  const progressPercentage = (completedCount / totalSteps) * 100;

  return (
    <div className={`${className}`}>
      {/* Progress Bar */}
      <div className="relative">
        {/* Background track */}
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          {/* Animated progress fill */}
          <motion.div
            className="h-full bg-gradient-to-r from-primary-500 to-primary-600"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* Step indicators */}
        <div className="absolute top-0 left-0 right-0 flex justify-between -translate-y-1/2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex flex-col items-center"
              style={{ position: 'absolute', left: `${(index / (totalSteps - 1)) * 100}%`, transform: 'translateX(-50%)' }}
            >
              {/* Circle indicator */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className={`
                  w-8 h-8 rounded-full border-4 flex items-center justify-center transition-all duration-300
                  ${step.isCompleted
                    ? 'bg-primary-500 border-primary-500 shadow-glow-blue'
                    : step.isActive
                    ? 'bg-white dark:bg-slate-800 border-primary-500 ring-4 ring-primary-100 dark:ring-primary-900'
                    : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-gray-600'
                  }
                `}
              >
                {step.isCompleted ? (
                  <Check className="w-4 h-4 text-white" strokeWidth={3} />
                ) : step.isActive ? (
                  <div className="w-3 h-3 rounded-full bg-primary-500 animate-pulse" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                )}
              </motion.div>

              {/* Label */}
              <span
                className={`
                  mt-2 text-xs font-medium text-center whitespace-nowrap transition-colors
                  ${step.isCompleted || step.isActive
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-500 dark:text-gray-400'
                  }
                `}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary text */}
      <div className="mt-12 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-primary-600 dark:text-primary-400">
            {completedCount} of {totalSteps}
          </span>
          {' '}sections completed
        </p>
      </div>
    </div>
  );
}

// Compact version for smaller spaces
export function CompactProgressIndicator({ current, total }: { current: number; total: number }) {
  const percentage = (current / total) * 100;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-primary-500 to-primary-600"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
        {current}/{total}
      </span>
    </div>
  );
}
