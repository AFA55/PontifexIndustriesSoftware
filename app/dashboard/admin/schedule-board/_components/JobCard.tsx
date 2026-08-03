'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Wrench, Clock, MessageSquare, Phone, AlertTriangle, ChevronRight, ChevronDown, Edit3, FileText, Users, CheckCircle2, Trash2, Navigation, MapPinned, Hammer, UserPlus } from 'lucide-react';
import { getDisplayName } from '@/lib/equipment-map';

/** An extra crew member on a job, beyond the lead + the helper seat. */
export interface JobCrewMember {
  user_id: string;
  name: string;
  /** 'operator' = full work-performed input · 'helper' = light work-log form */
  role: string;
}

export interface JobCardData {
  id: string;
  job_number: string;
  customer_name: string;
  job_type: string;
  location: string;
  address: string;
  equipment_needed: string[];
  description: string | null;
  scheduled_date: string;
  end_date: string | null;
  arrival_time: string | null;
  is_will_call: boolean;
  difficulty_rating: number | null;
  notes_count: number;
  change_requests_count: number;
  helper_names: string[];
  po_number: string | null;
  /** Lead + helper names as the board resolved them (view + per-day overlay). */
  operator_name?: string | null;
  helper_name?: string | null;
  /** Extra crew (job_crew) beyond the lead + helper seat — already de-duped
   *  against those two by the board GET. Empty for jobs with no extra crew. */
  crew?: JobCrewMember[];
  day_label?: string; // e.g. "Day 2 of 5"
  // Same-day sequencing (Aug 2026): this job's position within its operator's
  // day + how many jobs that operator holds this day. Badge shows when > 1.
  day_sequence?: number | null;
  operator_day_job_count?: number | null;
  // Current lead (job_orders.assigned_to, after the board's per-day overlay).
  // Used to derive "keep this operator" on helper-only edits — NEVER derive
  // that from board-row state (guardian B3).
  assigned_to?: string | null;
  status?: string;
  loading_started_at?: string | null;
  route_started_at?: string | null;
  done_for_day_at?: string | null;
  overall_pct?: number | null; // scope progress 0-100
  // Live operator-progress timestamps (from job_orders) — drive the live-status pill
  in_route_at?: string | null;
  arrived_at_jobsite_at?: string | null;
  work_started_at?: string | null;
  work_completed_at?: string | null;
}

// ─── Live operator status pill ───────────────────────────────────────────
// Derives the operator's current step purely from the job's timestamps/status.
// No API call — fields come from the board's existing job fetch.
import type { LucideIcon } from 'lucide-react';

export function jobLiveStatus(
  job: Pick<JobCardData, 'status' | 'in_route_at' | 'arrived_at_jobsite_at' | 'work_started_at' | 'work_completed_at'>
): { label: string; classes: string; Icon: LucideIcon } | null {
  // Done — work completed or job marked completed
  if (job.work_completed_at || job.status === 'completed') {
    return {
      label: 'Done',
      classes: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/40',
      Icon: CheckCircle2,
    };
  }
  // Working — work has started but not completed
  if (job.work_started_at) {
    return {
      label: 'Working',
      classes: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-500/40',
      Icon: Hammer,
    };
  }
  // On site — arrived but not started work
  if (job.arrived_at_jobsite_at) {
    return {
      label: 'On site',
      classes: 'bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-400 border border-teal-300 dark:border-teal-500/40',
      Icon: MapPinned,
    };
  }
  // En route — left but not arrived
  if (job.in_route_at) {
    return {
      label: 'En route',
      classes: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/40',
      Icon: Navigation,
    };
  }
  // Dispatched / assigned — no field activity yet
  if (job.status === 'dispatched' || job.status === 'assigned' || job.status === 'in_route' || job.status === 'in_progress') {
    return {
      label: 'Dispatched',
      classes: 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 border border-slate-200 dark:border-white/15',
      Icon: Clock,
    };
  }
  // Scheduled (not yet dispatched) — no badge
  return null;
}

// ─── Crew role presentation ──────────────────────────────────────────────
// The founder has to tell an operator from a helper AT A GLANCE, so every
// extra crew member carries both a colour and a word — colour alone is not
// enough (and would fail for colour-blind users).
export const CREW_ROLE_LABEL: Record<string, string> = { operator: 'op', helper: 'helper' };

export function crewRoleLabel(role: string): string {
  return CREW_ROLE_LABEL[role] || role;
}

/** "Aiden (op), Luis (helper)" — the compact one-line summary. */
export function crewSummary(crew: { name: string; role: string }[]): string {
  return crew.map((m) => `${m.name} (${crewRoleLabel(m.role)})`).join(', ');
}

/** "1st" / "2nd" / "3rd" / "4th" … for the same-day sequence badge. */
export function ordinalLabel(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function getStatusColor(job: JobCardData): { border: string; dot: string; bg: string } {
  if (job.status === 'completed') {
    return { border: 'border-emerald-600', dot: 'bg-emerald-500', bg: 'bg-emerald-50/40' };
  }
  if (job.done_for_day_at) {
    const doneDate = new Date(job.done_for_day_at).toDateString();
    const today = new Date().toDateString();
    if (doneDate === today) {
      return { border: 'border-emerald-400', dot: 'bg-emerald-400', bg: '' };
    }
  }
  if (job.status === 'in_progress') {
    return { border: 'border-orange-500', dot: 'bg-orange-500', bg: '' };
  }
  if (job.status === 'in_route') {
    return { border: 'border-blue-500', dot: 'bg-blue-500', bg: '' };
  }
  if (job.loading_started_at && !job.route_started_at) {
    return { border: 'border-amber-400', dot: 'bg-amber-400', bg: '' };
  }
  // scheduled or assigned with no activity
  return { border: '', dot: 'bg-gray-300 dark:bg-white/30', bg: '' };
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  assigned: 'Assigned',
  in_route: 'In Route',
  in_progress: 'Working',
  completed: 'Completed',
};

interface JobCardProps {
  job: JobCardData;
  colorScheme: {
    border: string;
    bg: string;
    text: string;
    badge: string;
  };
  canEdit: boolean;
  assignedOperator?: string | null;
  assignedHelper?: string | null;
  onEdit?: (job: JobCardData) => void;
  onRequestChange?: (job: JobCardData) => void;
  onViewNotes?: (job: JobCardData) => void;
  onRemove?: (job: JobCardData) => void;
  /** "+" affordance: add crew (2nd operator / helper) to this job — opens the
   *  detail panel focused on the Crew section. */
  onAddCrew?: (job: JobCardData) => void;
}

export default function JobCard({ job, colorScheme, canEdit, assignedOperator, assignedHelper, onEdit, onRequestChange, onViewNotes, onRemove, onAddCrew }: JobCardProps) {
  const router = useRouter();
  const [crewExpanded, setCrewExpanded] = useState(false);
  const isCompleted = job.status === 'completed';
  const statusColor = getStatusColor(job);
  const statusLabel = STATUS_LABELS[job.status || ''] || '';
  // Live operator-progress pill. Suppressed when the COMPLETED badge already covers it.
  const liveStatus = isCompleted ? null : jobLiveStatus(job);
  // Extra crew beyond the lead + helper seat (already de-duped server-side).
  const crew = job.crew ?? [];
  const crewCount = crew.length;
  const crewNames = crewSummary(crew);

  const formatTime = (time: string | null) => {
    if (!time) return null;
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const handleClick = () => {
    if (isCompleted) {
      // Completed jobs → read-only detail view
      router.push(`/dashboard/admin/completed-job-tickets/${job.id}`);
    } else {
      canEdit ? onEdit?.(job) : onRequestChange?.(job);
    }
  };

  return (
    <div
      className={`relative group rounded-xl border-2 transition-all duration-200 hover:shadow-lg hover:scale-[1.01] cursor-pointer ${
        isCompleted
          ? `${statusColor.border} ${statusColor.bg || 'bg-green-50/70'} dark:bg-green-500/10`
          : job.is_will_call
            ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-500/10'
            : statusColor.border
              ? `${statusColor.border} ${statusColor.bg || 'bg-white dark:bg-white/5'}`
              : `${colorScheme.border} bg-white dark:bg-white/5`
      }`}
      onClick={handleClick}
    >
      {/* Completed indicator stripe */}
      {isCompleted && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 to-emerald-500 rounded-t-xl" />
      )}

      {/* Will Call indicator stripe */}
      {!isCompleted && job.is_will_call && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-yellow-500 rounded-t-xl" />
      )}

      <div className="p-3 sm:p-4">
        {/* Top row: Customer + badges */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base truncate flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor.dot}`} title={statusLabel} />
              {job.customer_name}
            </h4>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colorScheme.bg} ${colorScheme.text}`}>
                {job.job_type?.split(',')[0]?.trim()}
              </span>
              {isCompleted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/40">
                  <CheckCircle2 className="w-3 h-3" />
                  COMPLETED
                </span>
              )}
              {job.is_will_call && !isCompleted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/40">
                  <Phone className="w-3 h-3" />
                  WILL CALL
                </span>
              )}
              {liveStatus && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${liveStatus.classes}`}
                  title={`Operator status: ${liveStatus.label}`}
                >
                  <liveStatus.Icon className="w-3 h-3" />
                  {liveStatus.label}
                </span>
              )}
              {job.day_label && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
                  {job.day_label}
                </span>
              )}
              {/* Sequence badge — operator has 2+ jobs this day (Aug 2026) */}
              {(job.operator_day_job_count ?? 1) > 1 && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-500/40"
                  title={`This operator's job #${job.day_sequence ?? 1} of ${job.operator_day_job_count} this day — later jobs start after earlier ones are completed`}
                >
                  {ordinalLabel(job.day_sequence ?? 1)} job
                </span>
              )}
            </div>
          </div>

          {/* Action icons — hidden for completed jobs. The "+" (add crew) stays
              visible on touch devices (no hover) and appears on hover elsewhere;
              44px tap target for gloved hands. */}
          {!isCompleted && <div className="flex items-center gap-1">
            {canEdit && onAddCrew && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddCrew(job); }}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] -my-2 rounded-lg hover:bg-indigo-100 dark:hover:bg-white/10 text-indigo-600 dark:text-indigo-400 transition-all opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                title="Add crew — 2nd operator or helper on this job"
                aria-label="Add crew member to this job"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit ? (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit?.(job); }}
                className="p-1.5 rounded-lg hover:bg-brand/10 dark:hover:bg-white/10 text-brand dark:text-brand transition-colors"
                title="Edit Job"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onRequestChange?.(job); }}
                className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-white/10 text-blue-600 dark:text-blue-400 transition-colors"
                title="Request Change"
              >
                <FileText className="w-4 h-4" />
              </button>
            )}
            {canEdit && onRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(job); }}
                className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-white/10 text-red-500 dark:text-red-400 transition-colors"
                title="Remove from Schedule"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            </div>
          </div>}
        </div>

        {/* Location row */}
        {job.location && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/60 mb-2">
            <MapPin className="w-3.5 h-3.5 text-gray-400 dark:text-white/40 flex-shrink-0" />
            <span className="truncate">{job.location}</span>
          </div>
        )}

        {/* ── Who is on this job ────────────────────────────────────────────
            Lead + helper seat as before, PLUS every extra job_crew member
            (Aug 2026 — a 3rd/4th person used to be invisible here). Names are
            always visible; the "+N" chip swaps the truncated one-liner for a
            stacked list so long names survive a 256px card. */}
        {(assignedOperator || crewCount > 0) && (
          <div className="mb-2 bg-gray-50 dark:bg-white/5 rounded-lg px-2 py-1.5 border border-gray-100 dark:border-white/10">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/60 min-w-0">
              <Users className="w-3.5 h-3.5 text-gray-400 dark:text-white/40 flex-shrink-0" />
              <span className="font-medium text-gray-700 dark:text-white/80 truncate">
                {assignedOperator || 'Unassigned'}
              </span>
              {assignedHelper && (
                <>
                  <span className="text-gray-300 dark:text-white/20 flex-shrink-0">+</span>
                  <span className="text-gray-500 dark:text-white/60 truncate">{assignedHelper}</span>
                </>
              )}
              {crewCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCrewExpanded(v => !v); }}
                  aria-expanded={crewExpanded}
                  aria-label={`${crewCount} more crew: ${crewNames}`}
                  title={`Also on this job: ${crewNames}`}
                  className="ml-auto flex items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] -my-1.5 flex-shrink-0 rounded-lg text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-white/10 transition-colors font-bold"
                >
                  +{crewCount}
                  {crewExpanded
                    ? <ChevronDown className="w-3 h-3" />
                    : <ChevronRight className="w-3 h-3" />}
                </button>
              )}
            </div>

            {crewCount > 0 && !crewExpanded && (
              <p
                className="mt-1 text-[11px] text-gray-500 dark:text-white/60 truncate"
                title={crewNames}
              >
                {crew.map((m, i) => (
                  <span key={m.user_id}>
                    {i > 0 && <span className="text-gray-300 dark:text-white/20">, </span>}
                    <span className={m.role === 'operator' ? 'text-indigo-600 dark:text-indigo-300 font-medium' : ''}>
                      {m.name}
                    </span>
                    <span className="text-gray-400 dark:text-white/40"> ({crewRoleLabel(m.role)})</span>
                  </span>
                ))}
              </p>
            )}

            {crewCount > 0 && crewExpanded && (
              <ul className="mt-1 space-y-0.5">
                {crew.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-1.5 text-[11px] min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        m.role === 'operator' ? 'bg-indigo-500' : 'bg-slate-400'
                      }`}
                    />
                    <span className="text-gray-700 dark:text-white/80 truncate">{m.name}</span>
                    <span
                      className={`ml-auto flex-shrink-0 px-1.5 py-0.5 rounded-full font-semibold ${
                        m.role === 'operator'
                          ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                          : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/60'
                      }`}
                    >
                      {crewRoleLabel(m.role)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Info chips row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Arrival time */}
          {job.arrival_time && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-white/10 rounded-md text-xs text-gray-600 dark:text-white/70">
              <Clock className="w-3 h-3" />
              {formatTime(job.arrival_time)}
            </span>
          )}

          {/* PO Number */}
          {job.po_number && (
            <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 dark:bg-white/10 rounded-md text-xs text-gray-600 dark:text-white/70">
              PO: {job.po_number}
            </span>
          )}

          {/* Equipment */}
          {job.equipment_needed && job.equipment_needed.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/15 rounded-md text-xs text-indigo-600 dark:text-indigo-400">
              <Wrench className="w-3 h-3" />
              {job.equipment_needed.slice(0, 2).map(getDisplayName).join(', ')}
              {job.equipment_needed.length > 2 && ` +${job.equipment_needed.length - 2}`}
            </span>
          )}

          {/* Difficulty */}
          {job.difficulty_rating && job.difficulty_rating >= 7 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 dark:bg-red-500/15 rounded-md text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="w-3 h-3" />
              {job.difficulty_rating}/10
            </span>
          )}

          {/* Notes badge */}
          {job.notes_count > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewNotes?.(job); }}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-500/15 hover:bg-green-100 dark:hover:bg-green-500/25 rounded-md text-xs text-green-600 dark:text-green-400 transition-colors"
            >
              <MessageSquare className="w-3 h-3" />
              {job.notes_count}
            </button>
          )}

          {/* Change request badge */}
          {job.change_requests_count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 dark:bg-orange-500/20 rounded-md text-xs text-orange-700 dark:text-orange-400 font-semibold animate-pulse">
              {job.change_requests_count} change req
            </span>
          )}
        </div>

        {/* Scope progress bar — only shown when overall_pct is set */}
        {job.overall_pct != null && (
          <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-white/10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 dark:text-white/40">Scope progress</span>
              <span className={`text-xs font-semibold tabular-nums ${
                job.overall_pct >= 75 ? 'text-green-600' :
                job.overall_pct >= 25 ? 'text-amber-600' : 'text-red-500'
              }`}>
                {job.overall_pct}%
              </span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-white/10 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  job.overall_pct >= 75 ? 'bg-green-500' :
                  job.overall_pct >= 25 ? 'bg-amber-400' : 'bg-red-400'
                }`}
                style={{ width: `${job.overall_pct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
