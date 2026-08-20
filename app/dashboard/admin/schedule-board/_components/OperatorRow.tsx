'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Users, Plus, Briefcase, ChevronDown, ChevronUp, Check,
  CalendarX, XCircle, UserX, UserMinus,
} from 'lucide-react';
import JobCard from './JobCard';
import RowDuplicateButton from './RowDuplicateButton';
import { describeOffPlatformLead } from '@/lib/off-platform-lead';
import type { JobCardData } from './JobCard';

interface OperatorRowProps {
  rowIndex: number;
  operatorName: string | null;
  helperName: string | null;
  /**
   * Set only when this crew has NO Pontifex operator because their lead is not on
   * the platform (founder, Aug 20). Display only — never resolved to a user id,
   * never sent as crew state. May be null even on such a row: the office is not
   * required to know who the sub is.
   */
  offPlatformLeadName?: string | null;
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
  /** See PersonDropdown.noteMap — labels the non-operators in the operator list. */
  operatorSlotNotes?: Record<string, string>;
  allHelpers: string[];
  busyOperators: Record<string, string>; // name → current job customer_name
  busyHelpers: Record<string, string>;
  onEditJob?: (job: JobCardData) => void;
  onRequestChange?: (job: JobCardData) => void;
  onViewNotes?: (job: JobCardData) => void;
  onRemoveJob?: (job: JobCardData) => void;
  onPreviewJob?: (job: JobCardData) => void;
  /** "+" on the card — open the detail panel focused on the Crew section. */
  onAddCrewJob?: (job: JobCardData) => void;
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
  onMarkUnavailable?: () => void;
  /** Duplicate a job on this row — a SECOND ticket so a second crew can be
   *  dispatched to the same job (the copy lands unassigned). */
  onDuplicateJob?: (job: JobCardData) => Promise<void> | void;
}

const TIME_OFF_LABELS: Record<string, string> = {
  pto: 'PTO',
  unpaid: 'Unpaid',
  worked_last_night: 'Worked Last Night',
  sick: 'Sick',
  other: 'Other',
  unavailable: 'Unavailable',
  personal_day: 'Personal Day',
  no_show: 'No-Show',
  vacation: 'Vacation',
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
  unavailable: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-500/40',
  personal_day: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30',
  no_show: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/40',
  vacation: 'bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30',
};

// Types that fully block the operator slot (red bg, "UNAVAILABLE" label, no-assign)
const BLOCKED_TYPES = new Set(['unavailable', 'sick', 'no_show', 'personal_day', 'vacation']);

// ── Inline dropdown for picking operator or helper ──────────────────────
function PersonDropdown({
  value,
  options,
  busyMap,
  noteMap,
  placeholder,
  onSelect,
  colorScheme,
}: {
  value: string | null;
  options: string[];
  busyMap: Record<string, string>;
  /** name → their day job ("helper", "supervisor", "ops manager") for anyone in
   *  the operator list who isn't day-to-day an operator. */
  noteMap?: Record<string, string>;
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
                    ? 'bg-brand/5 dark:bg-brand/20 text-brand dark:text-brand'
                    : 'hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-white/80'
                }`}
              >
                <div>
                  <span className="font-medium">{name}</span>
                  {noteMap?.[name] && (
                    <span className="ml-1.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                      {noteMap[name]}
                    </span>
                  )}
                  {busyJob && !isCurrent && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Assigned: {busyJob}</p>
                  )}
                </div>
                {isCurrent && <Check className="w-4 h-4 text-brand dark:text-brand" />}
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
  offPlatformLeadName,
  jobs,
  colorScheme,
  canEdit,
  isAvailable = false,
  allOperators,
  operatorSlotNotes,
  allHelpers,
  busyOperators,
  busyHelpers,
  onEditJob,
  onAddCrewJob,
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
  onMarkUnavailable,
  onDuplicateJob,
}: OperatorRowProps) {
  const hasJobs = jobs.length > 0;
  /**
   * A CREW WITH NO PONTIFEX OPERATOR, as distinct from an empty row.
   *
   * The two look identical in `rowAssignments` — operator null either way — and
   * the difference is entirely whether anyone is actually going. Jobs on the row
   * plus a helper is the crew; jobs on the row and nobody is a row still being
   * filled in, and must keep reading as "Available".
   */
  const isOffPlatformCrew = !operatorName && hasJobs && !!helperName;
  const isBlocked = !!timeOff && BLOCKED_TYPES.has(timeOff.type);
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
      className={`border-l-4 rounded-xl shadow-sm dark:shadow-none dark:ring-1 hover:shadow-md transition-all ${
        isBlocked
          ? 'border-rose-400 dark:border-rose-500/60 bg-rose-50 dark:bg-rose-900/20 dark:ring-rose-500/20 dark:hover:ring-rose-500/30'
          : `${colorScheme.border} bg-white dark:bg-white/[0.05] dark:ring-white/10 dark:hover:ring-white/20`
      } ${
        dragOver
          ? 'ring-2 ring-brand ring-offset-2 shadow-lg scale-[1.01] bg-brand/5 dark:bg-brand/10 dark:ring-brand/60'
          : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="p-4">
        {/* Row header */}
        <div className="flex items-center justify-between mb-3">
          {/* `min-w-0` on BOTH flex levels: without it a flex item's default
              `min-width:auto` refuses to shrink below its content, so the lead
              chip below can push the row wider than the phone and nothing
              truncates. */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${isBlocked ? 'bg-rose-100 dark:bg-rose-500/20' : colorScheme.bg} dark:opacity-80`}>
              {isBlocked
                ? <UserX className="w-5 h-5 text-rose-600 dark:text-rose-300" />
                : hasJobs
                  ? <Briefcase className={`w-5 h-5 ${colorScheme.icon}`} />
                  : <Users className={`w-5 h-5 ${colorScheme.icon}`} />
              }
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                {canEdit ? (
                  <>
                    <PersonDropdown
                      value={operatorName}
                      options={allOperators}
                      busyMap={busyOperators}
                      noteMap={operatorSlotNotes}
                      // The empty operator seat says WHY it is empty. Left as
                      // "Select Operator" this row is indistinguishable from a
                      // half-finished assignment, which is the impression that
                      // stopped the office placing helpers at all. The dropdown
                      // stays live either way — putting a real operator on the
                      // crew later is one click, and doing so clears the lead.
                      placeholder={isOffPlatformCrew ? 'No Pontifex operator' : 'Select Operator'}
                      onSelect={(name) => onChangeOperator?.(name)}
                      colorScheme={isBlocked ? { bg: 'bg-rose-100 dark:bg-rose-500/20', text: 'text-rose-700 dark:text-rose-300' } : colorScheme}
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
                      {operatorName || (isOffPlatformCrew ? helperName : 'Available')}
                    </h3>
                    {isOffPlatformCrew ? (
                      <p className="text-xs text-gray-500 dark:text-white/50">
                        Helper — lead not on Pontifex
                      </p>
                    ) : helperName ? (
                      <p className="text-xs text-gray-500 dark:text-white/50">+ {helperName}</p>
                    ) : null}
                  </div>
                )}
              </div>
              {/* Who is actually running this crew. Conditionally RENDERED —
                  Tailwind 3.4 `hidden` loses to `flex` at equal specificity, so a
                  hidden chip would still be on screen. */}
              {isOffPlatformCrew && (
                <span
                  className="inline-flex items-center gap-1.5 self-start min-w-0 max-w-full px-2 py-1 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-500/30"
                  title={
                    offPlatformLeadName
                      ? `${offPlatformLeadName} is running this crew and is not a Pontifex user`
                      : 'This crew has no Pontifex operator — the office did not record who is leading it'
                  }
                >
                  <UserMinus className="w-3 h-3 flex-shrink-0" />
                  {/* The name is free text up to 80 characters and can arrive
                      with no spaces in it, so it truncates rather than pushing
                      the row past the width of a phone. `truncate` must sit on
                      the TEXT, not on this flex container — `text-overflow` does
                      nothing to a flex item. The full name stays in the title. */}
                  <span className="truncate">{describeOffPlatformLead(offPlatformLeadName)}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Time-off / unavailable badge when active */}
            {timeOff && operatorName && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${TIME_OFF_BADGE_COLORS[timeOff.type] || TIME_OFF_BADGE_COLORS.other}`}>
                {isBlocked && <UserX className="w-3 h-3 flex-shrink-0" />}
                <span>
                  {isBlocked ? 'OUT' : TIME_OFF_LABELS[timeOff.type] || timeOff.type}
                  {' — '}
                  {TIME_OFF_LABELS[timeOff.type] || timeOff.type}
                </span>
                {canEdit && (
                  <button
                    onClick={onRemoveTimeOff}
                    className="ml-0.5 hover:opacity-70 transition-opacity"
                    title="Remove / clear unavailability"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${colorScheme.bg} ${colorScheme.text}`}>
              {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
            </span>

            {/* +Assign: only show when available and NOT blocked */}
            {canEdit && isAvailable && !timeOff && (
              <button
                onClick={onAssignJob}
                className="p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-500/15 text-green-600 dark:text-green-400 transition-colors"
                title="Assign job to this operator"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}

            {/* +Assign greyed out when blocked */}
            {canEdit && isAvailable && isBlocked && (
              <div title="Operator unavailable — clear status first" className="p-1.5 rounded-lg text-gray-300 dark:text-white/20 cursor-not-allowed">
                <Plus className="w-4 h-4" />
              </div>
            )}

            {/* Duplicate — second ticket on this job for a SECOND CREW */}
            {/* Hidden while the row is on time off — its jobs aren't visible
                either, and you shouldn't duplicate a ticket you can't see. */}
            {canEdit && onDuplicateJob && !timeOff && (
              <RowDuplicateButton jobs={jobs} onDuplicate={onDuplicateJob} />
            )}

            {/* Mark Out button — quick unavailability marking */}
            {canEdit && operatorName && !timeOff && (
              <button
                onClick={onMarkUnavailable}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 transition-colors"
                title="Mark operator as unavailable today"
              >
                <UserX className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mark Out</span>
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
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-brand mb-3"
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
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-brand hover:bg-brand-dark text-white transition-colors"
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

        {/* Time-off / unavailable overlay (body) */}
        {timeOff && (
          <div className={`flex items-center gap-3 py-3 px-4 mb-3 rounded-lg border ${
            isBlocked
              ? 'bg-rose-100/70 dark:bg-rose-900/30 border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-200'
              : 'bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70'
          }`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isBlocked ? 'bg-rose-200 dark:bg-rose-500/30' : 'bg-gray-200 dark:bg-white/10'
            }`}>
              {isBlocked
                ? <UserX className="w-4 h-4 text-rose-600 dark:text-rose-300" />
                : <span className="text-sm">&#128564;</span>
              }
            </div>
            <div className="flex-1">
              <span className="text-sm font-bold">
                {isBlocked ? 'UNAVAILABLE' : TIME_OFF_LABELS[timeOff.type] || timeOff.type}
                {' — '}
                {TIME_OFF_LABELS[timeOff.type] || timeOff.type}
              </span>
              {timeOff.notes && <p className="text-xs mt-0.5 opacity-70">{timeOff.notes}</p>}
            </div>
            {isBlocked && (
              <span className="px-2 py-0.5 rounded-full bg-rose-200 dark:bg-rose-500/30 text-rose-700 dark:text-rose-300 text-[10px] font-bold uppercase tracking-wide">
                Blocked
              </span>
            )}
          </div>
        )}

        {/* Blocked slot message */}
        {timeOff && isBlocked && jobs.length === 0 && (
          <div className="flex items-center justify-center py-3 rounded-lg border-2 border-dashed border-rose-300 dark:border-rose-500/40 bg-rose-50/50 dark:bg-rose-900/10">
            <p className="text-sm font-medium text-rose-500 dark:text-rose-400 flex items-center gap-2">
              <UserX className="w-4 h-4" />
              Operator Unavailable — No assignments allowed
            </p>
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
                  onAddCrew={onAddCrewJob}
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
              ? 'bg-brand/5 dark:bg-brand/10 border-brand dark:border-brand/60'
              : 'bg-green-50/50 dark:bg-green-500/5 border-green-200 dark:border-green-500/30'
          }`}>
            <p className={`text-sm font-medium flex items-center gap-2 ${dragOver ? 'text-brand dark:text-brand' : 'text-green-500 dark:text-green-400'}`}>
              {dragOver ? (
                <>
                  <span className="w-2 h-2 bg-brand rounded-full animate-pulse" />
                  Drop here to assign
                </>
              ) : (
                <>
                  <span className="w-2 h-2 bg-green-400 rounded-full" />
                  Available
                  {canEdit && (
                    <button
                      onClick={onAssignJob}
                      className="ml-1 text-brand dark:text-brand hover:text-brand-dark dark:hover:text-brand font-semibold hover:underline"
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
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-brand transition-colors"
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
