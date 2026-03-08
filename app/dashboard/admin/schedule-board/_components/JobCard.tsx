'use client';

import { MapPin, Wrench, Clock, MessageSquare, Phone, AlertTriangle, ChevronRight, Edit3, FileText, Users } from 'lucide-react';

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
}

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
  const formatTime = (time: string | null) => {
    if (!time) return null;
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div
      className={`relative group rounded-xl border-2 transition-all duration-200 hover:shadow-lg hover:scale-[1.01] cursor-pointer ${
        job.is_will_call
          ? 'border-amber-400 bg-amber-50/50'
          : `${colorScheme.border} bg-white`
      }`}
      onClick={() => canEdit ? onEdit?.(job) : onRequestChange?.(job)}
    >
      {/* Will Call indicator stripe */}
      {job.is_will_call && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-yellow-500 rounded-t-xl" />
      )}

      <div className="p-3 sm:p-4">
        {/* Top row: Customer + badges */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-gray-900 text-sm sm:text-base truncate">
              {job.customer_name}
            </h4>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colorScheme.bg} ${colorScheme.text}`}>
                {job.job_type?.split(',')[0]?.trim()}
              </span>
              {job.is_will_call && (
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

          {/* Action icons */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
          </div>
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
              {job.equipment_needed.slice(0, 2).join(', ')}
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
      </div>
    </div>
  );
}
