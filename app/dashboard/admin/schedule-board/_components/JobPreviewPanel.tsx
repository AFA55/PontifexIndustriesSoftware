'use client';

import { X, MapPin, Wrench, FileText, Clock, User, Phone, ExternalLink } from 'lucide-react';
import type { JobCardData } from './JobCard';

interface JobPreviewPanelProps {
  job: JobCardData;
  operatorName?: string | null;
  helperName?: string | null;
  onClose: () => void;
}

function formatTime(time: string | null) {
  if (!time) return null;
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

export default function JobPreviewPanel({ job, operatorName, helperName, onClose }: JobPreviewPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-md bg-white/95 backdrop-blur-xl shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-5 sticky top-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-lg">#{job.job_number}</span>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <h2 className="text-xl font-bold">{job.customer_name}</h2>
          <div className="flex items-center gap-2 mt-1 text-blue-100 text-sm">
            <Wrench className="w-4 h-4" />
            <span>{job.job_type}</span>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Location */}
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Location</h3>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-gray-900">{job.location}</p>
                <p className="text-sm text-gray-600">{job.address}</p>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-1 font-semibold"
                >
                  <ExternalLink className="w-3 h-3" /> View on Map
                </a>
              </div>
            </div>
          </div>

          {/* Timing */}
          {(job.arrival_time || job.is_will_call) && (
            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Timing</h3>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-500" />
                {job.arrival_time ? (
                  <span className="font-semibold text-gray-900">Arrival: {formatTime(job.arrival_time)}</span>
                ) : (
                  <span className="font-semibold text-amber-700">Will Call</span>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {job.description && (
            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Work Description</h3>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{job.description}</p>
              </div>
            </div>
          )}

          {/* Crew */}
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Crew</h3>
            <div className="space-y-2">
              {operatorName ? (
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold text-gray-900">{operatorName}</span>
                  <span className="text-xs text-gray-500">Operator</span>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No operator assigned</p>
              )}
              {helperName && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-indigo-500" />
                  <span className="font-semibold text-gray-900">{helperName}</span>
                  <span className="text-xs text-gray-500">Helper</span>
                </div>
              )}
            </div>
          </div>

          {/* Equipment */}
          {job.equipment_needed && job.equipment_needed.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Equipment</h3>
              <div className="flex flex-wrap gap-1.5">
                {job.equipment_needed.map((item, i) => (
                  <span key={i} className="px-2 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* PO Number */}
          {job.po_number && (
            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">PO Number</h3>
              <p className="text-sm font-semibold text-gray-900">{job.po_number}</p>
            </div>
          )}

          {/* Multi-day info */}
          {job.day_label && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
              <p className="text-sm font-bold text-purple-700">{job.day_label}</p>
              {job.end_date && (
                <p className="text-xs text-purple-600">
                  Ends: {new Date(job.end_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
