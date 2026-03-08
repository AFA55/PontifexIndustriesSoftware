'use client';

import { useState, useRef, useEffect } from 'react';
import { Users, Plus, Briefcase, ChevronDown, Check } from 'lucide-react';
import JobCard from './JobCard';
import type { JobCardData } from './JobCard';

interface OperatorRowProps {
  rowIndex: number;
  operatorName: string | null;
  helperName: string | null;
  jobs: JobCardData[];
  colorScheme: {
    border: string;
    bg: string;
    text: string;
    badge: string;
    icon: string;
  };
  canEdit: boolean;
  isAvailable?: boolean;
  allOperators: string[];
  allHelpers: string[];
  busyOperators: Record<string, string>; // name → current job customer_name
  busyHelpers: Record<string, string>;
  onEditJob?: (job: JobCardData) => void;
  onRequestChange?: (job: JobCardData) => void;
  onViewNotes?: (job: JobCardData) => void;
  onAssignJob?: () => void;
  onChangeOperator?: (name: string | null) => void;
  onChangeHelper?: (name: string | null) => void;
}

// ── Inline dropdown for picking operator or helper ──────────────────────
function PersonDropdown({
  value,
  options,
  busyMap,
  placeholder,
  onSelect,
  colorScheme,
}: {
  value: string | null;
  options: string[];
  busyMap: Record<string, string>;
  placeholder: string;
  onSelect: (name: string | null) => void;
  colorScheme: { bg: string; text: string };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold transition-all ${
          value
            ? `${colorScheme.bg} ${colorScheme.text} hover:opacity-80`
            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
        }`}
      >
        {value || placeholder}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-60 bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-1 max-h-64 overflow-y-auto">
          {value && (
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 transition-colors"
            >
              Clear selection
            </button>
          )}
          {options.map(name => {
            const isCurrent = name === value;
            const busyJob = busyMap[name];
            return (
              <button
                key={name}
                onClick={() => { onSelect(name); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                  isCurrent ? 'bg-purple-50 text-purple-700' : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div>
                  <span className="font-medium">{name}</span>
                  {busyJob && !isCurrent && (
                    <p className="text-[10px] text-amber-600 font-medium">Assigned: {busyJob}</p>
                  )}
                </div>
                {isCurrent && <Check className="w-4 h-4 text-purple-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────
export default function OperatorRow({
  rowIndex,
  operatorName,
  helperName,
  jobs,
  colorScheme,
  canEdit,
  isAvailable = false,
  allOperators,
  allHelpers,
  busyOperators,
  busyHelpers,
  onEditJob,
  onRequestChange,
  onViewNotes,
  onAssignJob,
  onChangeOperator,
  onChangeHelper,
}: OperatorRowProps) {
  const hasJobs = jobs.length > 0;

  return (
    <div className={`border-l-4 ${colorScheme.border} bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow`}>
      <div className="p-4">
        {/* Row header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorScheme.bg}`}>
              {hasJobs
                ? <Briefcase className={`w-5 h-5 ${colorScheme.icon}`} />
                : <Users className={`w-5 h-5 ${colorScheme.icon}`} />
              }
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              {canEdit ? (
                <>
                  <PersonDropdown
                    value={operatorName}
                    options={allOperators}
                    busyMap={busyOperators}
                    placeholder="Select Operator"
                    onSelect={(name) => onChangeOperator?.(name)}
                    colorScheme={colorScheme}
                  />
                  <span className="text-gray-300 hidden sm:inline">+</span>
                  <PersonDropdown
                    value={helperName}
                    options={allHelpers}
                    busyMap={busyHelpers}
                    placeholder="Select Helper"
                    onSelect={(name) => onChangeHelper?.(name)}
                    colorScheme={{ bg: 'bg-gray-100', text: 'text-gray-600' }}
                  />
                </>
              ) : (
                <div>
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                    {operatorName || 'Unassigned Crew'}
                  </h3>
                  {helperName && (
                    <p className="text-xs text-gray-500">+ {helperName}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${colorScheme.bg} ${colorScheme.text}`}>
              {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
            </span>
            {canEdit && isAvailable && (
              <button
                onClick={onAssignJob}
                className="p-1.5 rounded-lg hover:bg-green-100 text-green-600 transition-colors"
                title="Assign job to this operator"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Jobs grid */}
        {jobs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                colorScheme={colorScheme}
                canEdit={canEdit}
                assignedOperator={operatorName}
                assignedHelper={helperName}
                onEdit={onEditJob}
                onRequestChange={onRequestChange}
                onViewNotes={onViewNotes}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <p className="text-sm text-gray-400">
              No jobs assigned
              {canEdit && (
                <button
                  onClick={onAssignJob}
                  className="ml-2 text-purple-600 hover:text-purple-800 font-semibold hover:underline"
                >
                  + Assign Job
                </button>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
