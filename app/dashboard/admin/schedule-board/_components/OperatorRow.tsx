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
  onPreviewJob?: (job: JobCardData) => void;
  onAssignJob?: () => void;
  onChangeOperator?: (name: string | null) => void;
  onChangeHelper?: (name: string | null) => void;
  onDropJob?: (jobData: string, targetRowIndex: number) => void;
  timeOff?: { type: string; notes: string | null };
}

const TIME_OFF_LABELS: Record<string, string> = {
  pto: 'PTO',
  unpaid: 'Unpaid',
  worked_last_night: 'Worked Last Night',
  sick: 'Sick',
  other: 'Other',
};

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
  onPreviewJob,
  onAssignJob,
  onChangeOperator,
  onChangeHelper,
  onDropJob,
  timeOff,
}: OperatorRowProps) {
  const hasJobs = jobs.length > 0;
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!canEdit) return;
    const jobData = e.dataTransfer.getData('application/job-card');
    if (jobData && onDropJob) {
      onDropJob(jobData, rowIndex);
    }
  };

  return (
    <div
      className={`border-l-4 ${colorScheme.border} bg-white rounded-xl shadow-sm hover:shadow-md transition-all ${
        dragOver ? 'ring-2 ring-purple-400 ring-offset-2 shadow-lg scale-[1.01] bg-purple-50/30' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
                    {operatorName || 'Available'}
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

        {/* Time-off overlay */}
        {timeOff && (
          <div className="flex items-center gap-3 py-3 px-4 mb-3 rounded-lg bg-gray-100 border border-gray-200 text-gray-700">
            <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
              <span className="text-sm">&#128564;</span>
            </div>
            <div>
              <span className="text-sm font-bold">{TIME_OFF_LABELS[timeOff.type] || timeOff.type}</span>
              {timeOff.notes && <p className="text-xs text-gray-500 mt-0.5">{timeOff.notes}</p>}
            </div>
          </div>
        )}

        {/* Jobs grid */}
        {!timeOff && jobs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                draggable={canEdit}
                onDragStart={(e) => {
                  if (!canEdit) return;
                  e.dataTransfer.setData('application/job-card', JSON.stringify({ jobId: job.id, sourceRowIndex: rowIndex }));
                  e.dataTransfer.effectAllowed = 'move';
                  (e.currentTarget as HTMLElement).style.opacity = '0.5';
                }}
                onDragEnd={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = '1';
                }}
                onClick={() => onPreviewJob?.(job)}
                className={`${onPreviewJob ? 'cursor-pointer' : ''} ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                <JobCard
                  job={job}
                  colorScheme={colorScheme}
                  canEdit={canEdit}
                  assignedOperator={operatorName}
                  assignedHelper={helperName}
                  onEdit={onEditJob}
                  onRequestChange={onRequestChange}
                  onViewNotes={onViewNotes}
                />
              </div>
            ))}
          </div>
        )}
        {!timeOff && jobs.length === 0 && (
          <div className={`flex items-center justify-center py-3 rounded-lg border-2 border-dashed transition-all ${
            dragOver ? 'bg-purple-50 border-purple-400' : 'bg-green-50/50 border-green-200'
          }`}>
            <p className={`text-sm font-medium flex items-center gap-2 ${dragOver ? 'text-purple-600' : 'text-green-500'}`}>
              {dragOver ? (
                <>
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                  Drop here to assign
                </>
              ) : (
                <>
                  <span className="w-2 h-2 bg-green-400 rounded-full" />
                  Available
                  {canEdit && (
                    <button
                      onClick={onAssignJob}
                      className="ml-1 text-purple-600 hover:text-purple-800 font-semibold hover:underline"
                    >
                      + Assign
                    </button>
                  )}
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
