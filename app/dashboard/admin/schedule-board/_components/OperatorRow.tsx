'use client';

import { useState, useRef, useEffect } from 'react';
import { Users, Plus, Briefcase, ChevronDown, ChevronUp, Check, CalendarX, XCircle } from 'lucide-react';
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
  onRemoveJob?: (job: JobCardData) => void;
  onPreviewJob?: (job: JobCardData) => void;
  onAssignJob?: () => void;
  onChangeOperator?: (name: string | null) => void;
  onChangeHelper?: (name: string | null) => void;
  onDropJob?: (jobData: string, targetRowIndex: number) => void;
  operatorId?: string | null;
  timeOff?: { id: string; type: string; notes: string | null } | null;
  rowNote?: string;
  onAddTimeOff?: (type: string, notes: string) => void;
  onRemoveTimeOff?: () => void;
  onSaveRowNote?: (note: string) => void;
}

const TIME_OFF_LABELS: Record<string, string> = {
  pto: 'PTO',
  unpaid: 'Unpaid',
  worked_last_night: 'Worked Last Night',
  sick: 'Sick',
  other: 'Other',
};

const TIME_OFF_OPTIONS = [
  { value: 'pto', label: 'PTO', color: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-500/30' },
  { value: 'unpaid', label: 'Unpaid', color: 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-200 dark:hover:bg-white/20' },
  { value: 'sick', label: 'Sick 🤒', color: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-500/30' },
  { value: 'worked_last_night', label: 'Worked Last Night 🌙', color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-500/30' },
  { value: 'other', label: 'Other', color: 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-200 dark:hover:bg-white/20' },
];

const TIME_OFF_BADGE_COLORS: Record<string, string> = {
  pto: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
  unpaid: 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white/70 border-gray-200 dark:border-white/20',
  sick: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30',
  worked_last_night: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30',
  other: 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white/70 border-gray-200 dark:border-white/20',
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
            : 'bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/15'
        }`}
      >
        {value || placeholder}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-60 bg-white dark:bg-[#1a0f35] rounded-xl shadow-xl border border-gray-200 dark:border-white/10 z-50 py-1 max-h-64 overflow-y-auto">
          {value && (
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 dark:text-white/40 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
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
                  isCurrent
                    ? 'bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300'
                    : 'hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-white/80'
                }`}
              >
                <div>
                  <span className="font-medium">{name}</span>
                  {busyJob && !isCurrent && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Assigned: {busyJob}</p>
                  )}
                </div>
                {isCurrent && <Check className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
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
  onRemoveJob,
  onPreviewJob,
  onAssignJob,
  onChangeOperator,
  onChangeHelper,
  onDropJob,
  operatorId,
  timeOff,
  rowNote,
  onAddTimeOff,
  onRemoveTimeOff,
  onSaveRowNote,
}: OperatorRowProps) {
  const hasJobs = jobs.length > 0;
  const [dragOver, setDragOver] = useState(false);

  // Time-off panel state
  const [showTimeOffPanel, setShowTimeOffPanel] = useState(false);
  const [selectedTimeOffType, setSelectedTimeOffType] = useState('pto');
  const [timeOffNotes, setTimeOffNotes] = useState('');
  const timeOffPanelRef = useRef<HTMLDivElement>(null);

  // Row notes state
  const [showNotes, setShowNotes] = useState(false);
  const [noteText, setNoteText] = useState(rowNote || '');

  // Sync noteText when rowNote prop changes
  useEffect(() => {
    setNoteText(rowNote || '');
  }, [rowNote]);

  // Close time-off panel on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (timeOffPanelRef.current && !timeOffPanelRef.current.contains(e.target as Node)) {
        setShowTimeOffPanel(false);
      }
    };
    if (showTimeOffPanel) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showTimeOffPanel]);

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

  const handleSaveTimeOff = () => {
    onAddTimeOff?.(selectedTimeOffType, timeOffNotes);
    setShowTimeOffPanel(false);
    setTimeOffNotes('');
    setSelectedTimeOffType('pto');
  };

  return (
    <div
      className={`border-l-4 ${colorScheme.border} bg-white dark:bg-white/[0.05] rounded-xl shadow-sm dark:shadow-none dark:ring-1 dark:ring-white/10 hover:shadow-md dark:hover:ring-white/20 transition-all ${
        dragOver
          ? 'ring-2 ring-purple-400 ring-offset-2 shadow-lg scale-[1.01] bg-purple-50/30 dark:bg-purple-500/10 dark:ring-purple-400/60'
          : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="p-4">
        {/* Row header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorScheme.bg} dark:opacity-80`}>
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
                  <span className="text-gray-300 dark:text-white/20 hidden sm:inline">+</span>
                  <PersonDropdown
                    value={helperName}
                    options={allHelpers}
                    busyMap={busyHelpers}
                    placeholder="Select Helper"
                    onSelect={(name) => onChangeHelper?.(name)}
                    colorScheme={{ bg: 'bg-gray-100 dark:bg-white/10', text: 'text-gray-600 dark:text-white/70' }}
                  />
                </>
              ) : (
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">
                    {operatorName || 'Available'}
                  </h3>
                  {helperName && (
                    <p className="text-xs text-gray-500 dark:text-white/50">+ {helperName}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Time-off badge when active */}
            {timeOff && operatorName && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${TIME_OFF_BADGE_COLORS[timeOff.type] || TIME_OFF_BADGE_COLORS.other}`}>
                <span>{TIME_OFF_LABELS[timeOff.type] || timeOff.type} — {operatorName} is out</span>
                {canEdit && (
                  <button
                    onClick={onRemoveTimeOff}
                    className="ml-0.5 hover:opacity-70 transition-opacity"
                    title="Remove time off"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${colorScheme.bg} ${colorScheme.text}`}>
              {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
            </span>

            {canEdit && isAvailable && !timeOff && (
              <button
                onClick={onAssignJob}
                className="p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-500/15 text-green-600 dark:text-green-400 transition-colors"
                title="Assign job to this operator"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}

            {/* Time-off add button */}
            {canEdit && operatorName && !timeOff && (
              <div ref={timeOffPanelRef} className="relative">
                <button
                  onClick={() => setShowTimeOffPanel(!showTimeOffPanel)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/15 transition-colors"
                  title="Mark time off"
                >
                  <CalendarX className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Time Off</span>
                </button>

                {/* Time-off panel */}
                {showTimeOffPanel && (
                  <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-[#1a0f35] rounded-xl shadow-xl border border-gray-200 dark:border-white/10 z-50 p-4">
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-3">Mark Time Off</h4>

                    {/* Type selector */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {TIME_OFF_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setSelectedTimeOffType(opt.value)}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border-2 ${
                            selectedTimeOffType === opt.value
                              ? `${opt.color} border-current`
                              : `${opt.color} border-transparent`
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* Notes textarea */}
                    <textarea
                      value={timeOffNotes}
                      onChange={(e) => setTimeOffNotes(e.target.value)}
                      placeholder="Add a note (optional)..."
                      rows={2}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 mb-3"
                    />

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowTimeOffPanel(false); setTimeOffNotes(''); setSelectedTimeOffType('pto'); }}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/15 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveTimeOff}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                      >
                        Save Time Off
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Time-off overlay (body) */}
        {timeOff && (
          <div className="flex items-center gap-3 py-3 px-4 mb-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70">
            <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
              <span className="text-sm">&#128564;</span>
            </div>
            <div>
              <span className="text-sm font-bold">{TIME_OFF_LABELS[timeOff.type] || timeOff.type}</span>
              {timeOff.notes && <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">{timeOff.notes}</p>}
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
                  onRemove={onRemoveJob}
                />
              </div>
            ))}
          </div>
        )}
        {!timeOff && jobs.length === 0 && (
          <div className={`flex items-center justify-center py-3 rounded-lg border-2 border-dashed transition-all ${
            dragOver
              ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-400 dark:border-purple-400/60'
              : 'bg-green-50/50 dark:bg-green-500/5 border-green-200 dark:border-green-500/30'
          }`}>
            <p className={`text-sm font-medium flex items-center gap-2 ${dragOver ? 'text-purple-600 dark:text-purple-300' : 'text-green-500 dark:text-green-400'}`}>
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
                      className="ml-1 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 font-semibold hover:underline"
                    >
                      + Assign
                    </button>
                  )}
                </>
              )}
            </p>
          </div>
        )}

        {/* Row Notes section (canEdit only) */}
        {canEdit && (
          <div className="mt-3">
            <div className="border-t border-gray-100 dark:border-white/10 pt-2">
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60 transition-colors font-medium"
              >
                {showNotes ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Row Notes
                {noteText && !showNotes && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[10px] font-semibold">
                    {noteText.slice(0, 30)}{noteText.length > 30 ? '…' : ''}
                  </span>
                )}
              </button>
              {showNotes && (
                <div className="mt-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onBlur={() => onSaveRowNote?.(noteText)}
                    placeholder="Add shift notes (e.g. 'Alex leaving at 2pm')..."
                    rows={2}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 transition-colors"
                  />
                  <p className="text-[10px] text-gray-400 dark:text-white/30 mt-1">Auto-saves on blur</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
