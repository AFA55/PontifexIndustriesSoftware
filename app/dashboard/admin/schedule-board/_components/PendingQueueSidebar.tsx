'use client';

import { X, Clock, MapPin, Wrench, CheckCircle, Phone, AlertCircle, User, DollarSign, CalendarDays } from 'lucide-react';
import { getDisplayName } from '@/lib/equipment-map';

export interface JobsiteConditions {
  water_available?: boolean;
  water_available_ft?: number | null;
  water_control?: boolean;
  manpower_provided?: boolean;
  scaffolding_provided?: boolean;
  electricity_available?: boolean;
  electricity_available_ft?: number | null;
  inside_outside?: string | null;
  proper_ventilation?: boolean;
  overcutting_allowed?: boolean;
  cord_480?: boolean;
  cord_480_ft?: number | null;
  clean_up_required?: boolean;
  high_work?: boolean;
  high_work_ft?: number | null;
  high_work_access?: string | null;
  hyd_hose?: boolean;
  hyd_hose_ft?: number | null;
  plastic_needed?: boolean;
}

export interface SiteCompliance {
  orientation_required?: boolean;
  orientation_datetime?: string | null;
  badging_required?: boolean;
  badging_type?: string | null;
  special_instructions?: string | null;
}

export interface PendingJob {
  id: string;
  job_number: string;
  customer_name: string;
  job_type: string;
  location: string;
  equipment_needed: string[];
  description: string | null;
  submitted_by: string;
  submitted_at: string;
  difficulty_rating: number | null;
  is_will_call: boolean;
  scheduled_date: string | null;
  end_date: string | null;
  estimated_cost: number | null;
  address: string;
  jobsite_conditions: JobsiteConditions | null;
  site_compliance: SiteCompliance | null;
  equipment_selections: Record<string, Record<string, string>> | null;
  scope_details: Record<string, Record<string, string>> | null;
  additional_info: string | null;
  special_equipment: string[] | null;
}

interface PendingQueueSidebarProps {
  open: boolean;
  onClose: () => void;
  pendingJobs: PendingJob[];
  onApprove: (job: PendingJob) => void;
  onMissingInfo: (job: PendingJob) => void;
}

export default function PendingQueueSidebar({
  open,
  onClose,
  pendingJobs,
  onApprove,
  onMissingInfo,
}: PendingQueueSidebarProps) {
  if (!open) return null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Sidebar */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Pending Forms</h2>
              <p className="text-orange-100 text-sm">{pendingJobs.length} awaiting your review</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {pendingJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <CheckCircle className="w-12 h-12 mb-3 text-green-300" />
              <p className="font-semibold text-gray-500">All caught up!</p>
              <p className="text-sm">No pending forms to review</p>
            </div>
          ) : (
            pendingJobs.map((job) => (
              <div
                key={job.id}
                className="bg-white rounded-xl border-2 border-orange-200 hover:border-orange-300 shadow-sm hover:shadow-md transition-all"
              >
                <div className="p-4">
                  {/* Customer + Job type + Quoted */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-gray-900">{job.customer_name}</h3>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 mt-1">
                        {job.job_type?.split(',')[0]?.trim()}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {job.estimated_cost && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200 flex items-center gap-0.5">
                          <DollarSign className="w-3 h-3" />
                          {Number(job.estimated_cost).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                        </span>
                      )}
                      {job.is_will_call && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
                          <Phone className="w-3 h-3 inline mr-1" />
                          Will Call
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Date range */}
                  {(job.scheduled_date || job.end_date) && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                      <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                      <span>
                        {job.scheduled_date ? new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                        {job.end_date && job.end_date !== job.scheduled_date && (
                          <> &rarr; {new Date(job.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Location */}
                  {job.location && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      <span className="truncate">{job.location}</span>
                    </div>
                  )}

                  {/* Equipment chips */}
                  {job.equipment_needed && job.equipment_needed.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {job.equipment_needed.map((eq) => (
                        <span key={eq} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 rounded-md text-xs text-indigo-600">
                          <Wrench className="w-3 h-3" />
                          {getDisplayName(eq)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Description preview */}
                  {job.description && (
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2 italic">
                      &ldquo;{job.description}&rdquo;
                    </p>
                  )}

                  {/* Submitted by + time */}
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-3 pb-3 border-b border-gray-100">
                    <User className="w-3.5 h-3.5" />
                    <span>Submitted by <strong className="text-gray-600">{job.submitted_by}</strong></span>
                    <span className="text-gray-300">•</span>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDate(job.submitted_at)}</span>
                  </div>

                  {/* Requested date info */}
                  {job.scheduled_date && (
                    <div className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-400" />
                      Requested start: <strong>{new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong>
                    </div>
                  )}

                  {/* Action buttons — Approve or Missing Info */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onApprove(job)}
                      className="flex-1 px-3 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg text-xs font-bold transition-all hover:scale-[1.02] shadow-sm"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => onMissingInfo(job)}
                      className="flex-1 px-3 py-2.5 bg-gradient-to-r from-orange-400 to-red-400 hover:from-orange-500 hover:to-red-500 text-white rounded-lg text-xs font-bold transition-all hover:scale-[1.02] shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      Missing Info
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
