'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, Phone, MessageSquare, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { getWorkflowProgress } from '@/types/workflow';
import type { JobOrder } from '@/types/job';

interface WorkflowProgressBarProps {
  job: Partial<JobOrder>;
  operatorName?: string | null;
  operatorPhone?: string | null;
  operatorEmail?: string | null;
  /** Compact mode for small cards (calendar view) */
  compact?: boolean;
}

export default function WorkflowProgressBar({
  job,
  operatorName,
  operatorPhone,
  operatorEmail,
  compact = false,
}: WorkflowProgressBarProps) {
  const [expanded, setExpanded] = useState(false);
  const progress = getWorkflowProgress(job);

  if (compact) {
    return (
      <div className="mt-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap">
            {progress.completedCount}/{progress.totalSteps}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 mb-1">
      {/* Clickable progress bar section */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left group"
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
            Workflow Progress
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-gray-900">
              {progress.completedCount}/{progress.totalSteps}
            </span>
            <span className="text-[10px] font-semibold text-gray-500">
              ({progress.percentComplete}%)
            </span>
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            }
          </div>
        </div>

        {/* Gradient progress bar */}
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 rounded-full transition-all duration-500"
            style={{ width: `${progress.percentComplete}%` }}
          />
        </div>

        {/* Step dots */}
        <div className="flex justify-between mt-1.5 px-0.5">
          {progress.steps.map(step => (
            <div key={step.key} className="group/dot relative">
              <div
                className={`w-2 h-2 rounded-full transition-all ${
                  step.completed
                    ? 'bg-green-500 shadow-sm shadow-green-200'
                    : progress.currentStep === step.key
                      ? 'bg-blue-400 animate-pulse'
                      : 'bg-gray-300'
                }`}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover/dot:opacity-100 pointer-events-none transition-opacity z-10">
                {step.label}
              </div>
            </div>
          ))}
        </div>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2 animate-in slide-in-from-top-1 duration-200">
          {/* Step list */}
          {progress.steps.map(step => (
            <div
              key={step.key}
              className={`flex items-center gap-2.5 py-1 ${
                progress.currentStep === step.key ? 'bg-blue-50 -mx-2 px-2 rounded-lg' : ''
              }`}
            >
              {step.completed ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              ) : progress.currentStep === step.key ? (
                <div className="w-4 h-4 rounded-full border-2 border-blue-500 flex items-center justify-center flex-shrink-0">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                </div>
              ) : (
                <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
              )}
              <span
                className={`text-sm ${
                  step.completed
                    ? 'text-green-700 font-medium'
                    : progress.currentStep === step.key
                      ? 'text-blue-700 font-semibold'
                      : 'text-gray-400'
                }`}
              >
                {step.label}
                {progress.currentStep === step.key && (
                  <span className="ml-2 text-[10px] uppercase font-bold text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded-full">
                    Current
                  </span>
                )}
              </span>
            </div>
          ))}

          {/* Contact operator section */}
          {operatorName && (operatorPhone || operatorEmail) && (
            <div className="pt-2 mt-2 border-t border-gray-200">
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">
                Contact {operatorName}
              </p>
              <div className="flex gap-2">
                {operatorPhone && (
                  <>
                    <a
                      href={`tel:${operatorPhone}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-xs font-bold transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Call
                    </a>
                    <a
                      href={`sms:${operatorPhone}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-xs font-bold transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Text
                    </a>
                  </>
                )}
                {operatorEmail && (
                  <a
                    href={`mailto:${operatorEmail}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-xs font-bold transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Email
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
