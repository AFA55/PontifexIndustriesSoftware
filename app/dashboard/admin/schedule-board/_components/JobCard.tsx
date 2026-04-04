'use client';

import { useRouter } from 'next/navigation';
import { MapPin, Wrench, Clock, MessageSquare, Phone, AlertTriangle, ChevronRight, Edit3, FileText, Users, CheckCircle2 } from 'lucide-react';
import { getDisplayName } from '@/lib/equipment-map';

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
  day_label?: string; // e.g. "Day 2 of 5"
  status?: string;
  loading_started_at?: string | null;
  route_started_at?: string | null;
  done_for_day_at?: string | null;
  overall_pct?: number | null; // scope progress 0-100
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
  return { border: '', dot: 'bg-gray-300', bg: '' };
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
}

export default function JobCard({ job, colorScheme, canEdit, assignedOperator, assignedHelper, onEdit, onRequestChange, onViewNotes }: JobCardProps) {
  const router = useRouter();
  const isCompleted = job.status === 'completed';
  const statusColor = getStatusColor(job);
  const statusLabel = STATUS_LABELS[job.status || ''] || '';

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
          ? `${statusColor.border} ${statusColor.bg || 'bg-green-50/70'}`
          : job.is_will_call
            ? 'border-amber-400 bg-amber-50/50'
            : statusColor.border
              ? `${statusColor.border} ${statusColor.bg || 'bg-white'}`
              : `${colorScheme.border} bg-white`
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
            <h4 className="font-bold text-gray-900 text-sm sm:text-base truncate flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor.dot}`} title={statusLabel} />
              {job.customer_name}
            </h4>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colorScheme.bg} ${colorScheme.text}`}>
                {job.job_type?.split(',')[0]?.trim()}
              </span>
              {isCompleted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-300">
                  <CheckCircle2 className="w-3 h-3" />
                  COMPLETED
                </span>
              )}
              {job.is_will_call && !isCompleted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
                  <Phone className="w-3 h-3" />
                  WILL CALL
                </span>
              )}
              {job.day_label && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                  {job.day_label}
                </span>
              )}
            </div>
          </div>

          {/* Action icons — hidden for completed jobs */}
          {!isCompleted && <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit ? (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit?.(job); }}
                className="p-1.5 rounded-lg hover:bg-purple-100 text-purple-600 transition-colors"
                title="Edit Job"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onRequestChange?.(job); }}
                className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
                title="Request Change"
              >
                <FileText className="w-4 h-4" />
              </button>
            )}
          </div>}
        </div>

        {/* Location row */}
        {job.location && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
            <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="truncate">{job.location}</span>
          </div>
        )}

        {/* Operator/Helper info — shown inside the card */}
        {assignedOperator && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100">
            <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="font-medium text-gray-700">{assignedOperator}</span>
            {assignedHelper && (
              <>
                <span className="text-gray-300">+</span>
                <span className="text-gray-500">{assignedHelper}</span>
              </>
            )}
          </div>
        )}

        {/* Info chips row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Arrival time */}
          {job.arrival_time && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-md text-xs text-gray-600">
              <Clock className="w-3 h-3" />
              {formatTime(job.arrival_time)}
            </span>
          )}

          {/* PO Number */}
          {job.po_number && (
            <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 rounded-md text-xs text-gray-600">
              PO: {job.po_number}
            </span>
          )}

          {/* Equipment */}
          {job.equipment_needed && job.equipment_needed.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 rounded-md text-xs text-indigo-600">
              <Wrench className="w-3 h-3" />
              {job.equipment_needed.slice(0, 2).map(getDisplayName).join(', ')}
              {job.equipment_needed.length > 2 && ` +${job.equipment_needed.length - 2}`}
            </span>
          )}

          {/* Difficulty */}
          {job.difficulty_rating && job.difficulty_rating >= 7 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 rounded-md text-xs text-red-600">
              <AlertTriangle className="w-3 h-3" />
              {job.difficulty_rating}/10
            </span>
          )}

          {/* Notes badge */}
          {job.notes_count > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewNotes?.(job); }}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 hover:bg-green-100 rounded-md text-xs text-green-600 transition-colors"
            >
              <MessageSquare className="w-3 h-3" />
              {job.notes_count}
            </button>
          )}

          {/* Change request badge */}
          {job.change_requests_count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 rounded-md text-xs text-orange-700 font-semibold animate-pulse">
              {job.change_requests_count} change req
            </span>
          )}
        </div>

        {/* Scope progress bar — only shown when overall_pct is set */}
        {job.overall_pct != null && (
          <div className="mt-3 pt-2.5 border-t border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">Scope progress</span>
              <span className={`text-xs font-semibold tabular-nums ${
                job.overall_pct >= 75 ? 'text-green-600' :
                job.overall_pct >= 25 ? 'text-amber-600' : 'text-red-500'
              }`}>
                {job.overall_pct}%
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
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
