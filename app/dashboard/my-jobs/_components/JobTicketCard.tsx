'use client';

import Link from 'next/link';
import { Clock, MapPin, Wrench, ChevronRight, AlertTriangle } from 'lucide-react';

export interface JobTicketData {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  customer_contact: string | null;
  job_type: string;
  location: string;
  address: string;
  description: string;
  status: string;
  priority: string;
  scheduled_date: string;
  end_date: string | null;
  arrival_time: string | null;
  shop_arrival_time: string | null;
  estimated_hours: number | null;
  equipment_needed: string[];
  special_equipment: string | null;
  mandatory_equipment: string[];
  po_number: string | null;
  is_will_call: boolean;
  salesman_name: string | null;
  foreman_name: string | null;
  foreman_phone: string | null;
  dispatched_at: string | null;
  assigned_to: string | null;
  helper_assigned_to: string | null;
  helper_name: string | null;
  operator_name: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  route_started_at: string | null;
  work_started_at: string | null;
  work_completed_at: string | null;
  scheduling_flexibility: string | null;
  readable_status: string;
  // Per-operator equipment confirmation tracking
  equipment_confirmed_by: string[];
  // Schedule form structured data
  equipment_selections?: Record<string, Record<string, string>> | null;
  scope_details?: Record<string, Record<string, string>> | null;
  scope_photo_urls?: string[] | null;
  site_compliance?: Record<string, any> | null;
  special_equipment_notes?: string | null;
  site_contact_phone?: string | null;
  additional_info?: string | null;
  // On-hold fields
  pause_reason?: string | null;
  return_date?: string | null;
  paused_at?: string | null;
  // isHelper indicates the current user is the helper, not the operator
  isHelper?: boolean;
}

interface JobTicketCardProps {
  job: JobTicketData;
}

function formatTime(time: string | null) {
  if (!time) return null;
  // If time already contains AM/PM, return as-is (e.g. "08:00 AM")
  if (/[APap][Mm]/.test(time)) return time.trim();
  // Handle HH:MM:SS or HH:MM 24h format
  const parts = time.split(':');
  if (parts.length < 2) return time;
  const h = parseInt(parts[0]);
  const m = parts[1].padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m} ${ampm}`;
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'assigned': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'in_route': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'in_progress': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'completed': return 'bg-green-100 text-green-700 border-green-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

function getPriorityIndicator(priority: string) {
  switch (priority) {
    case 'urgent': return { color: 'bg-red-500', label: 'URGENT' };
    case 'high': return { color: 'bg-orange-500', label: 'HIGH' };
    default: return null;
  }
}

export default function JobTicketCard({ job }: JobTicketCardProps) {
  const arrivalDisplay = formatTime(job.arrival_time);
  const shopArrival = formatTime(job.shop_arrival_time);
  const priorityInfo = getPriorityIndicator(job.priority);
  const isMultiDay = job.end_date && job.end_date !== job.scheduled_date;
  const isCompleted = job.status === 'completed';

  return (
    <Link
      href={`/dashboard/my-jobs/${job.id}`}
      className={`block w-full text-left bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border-2 transition-all duration-200 hover:shadow-2xl hover:scale-[1.01] border-gray-200/50 hover:border-blue-300 ${isCompleted ? 'opacity-70' : ''}`}
    >
      {/* Special Arrival Time Banner */}
      {(arrivalDisplay || shopArrival) && !isCompleted && (
        <div className="bg-gradient-to-r from-red-500 via-red-500 to-orange-500 text-white px-4 py-2.5 rounded-t-2xl flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-bold">
            {shopArrival ? `Shop: ${shopArrival}` : ''}
            {shopArrival && arrivalDisplay ? ' \u2022 ' : ''}
            {arrivalDisplay ? `Arrive: ${arrivalDisplay}` : ''}
          </span>
          {priorityInfo && (
            <span className={`ml-auto text-xs px-2.5 py-0.5 ${priorityInfo.color} text-white rounded-full font-bold shadow-sm`}>
              {priorityInfo.label}
            </span>
          )}
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Job Number + Status */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xs font-bold text-gray-400">#{job.job_number}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${getStatusStyle(job.status)}`}>
                {job.readable_status}
              </span>
              {isMultiDay && (
                <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-semibold border border-purple-200">
                  Multi-Day
                </span>
              )}
              {job.isHelper && (
                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-semibold border border-emerald-200">
                  Team Member
                </span>
              )}
            </div>

            {/* Customer Name */}
            <h3 className="text-base font-bold text-gray-900 truncate">{job.customer_name}</h3>

            {/* Location + Type */}
            <div className="flex items-center gap-3 mt-1.5">
              <div className="flex items-center gap-1 text-sm text-gray-600 truncate">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
                <span className="truncate">{job.location || job.address}</span>
              </div>
              <div className="flex items-center gap-1 text-sm text-purple-600 flex-shrink-0">
                <Wrench className="w-3.5 h-3.5" />
                <span className="font-semibold">{job.job_type}</span>
              </div>
            </div>

            {/* Estimated Hours */}
            {job.estimated_hours && (
              <div className="text-xs text-gray-500 mt-1 font-medium">
                Est. {job.estimated_hours} hrs
              </div>
            )}
          </div>

          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
        </div>
      </div>
    </Link>
  );
}
