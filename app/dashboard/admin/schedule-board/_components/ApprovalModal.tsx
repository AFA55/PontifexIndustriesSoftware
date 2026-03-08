'use client';

import { useState } from 'react';
import { X, Calendar, MapPin, Wrench, CheckCircle } from 'lucide-react';
import type { PendingJob } from './PendingQueueSidebar';

interface ApprovalModalProps {
  job: PendingJob;
  onConfirm: (data: { scheduledDate: string }) => void;
  onClose: () => void;
}

export default function ApprovalModal({ job, onConfirm, onClose }: ApprovalModalProps) {
  const [scheduledDate, setScheduledDate] = useState(job.scheduled_date || '');

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Approve Job
                </h2>
                <p className="text-green-100 text-sm">Place this job on the schedule</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Job summary */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <h3 className="font-bold text-gray-900">{job.customer_name}</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 mt-1">
                {job.job_type?.split(',')[0]?.trim()}
              </span>
              {job.location && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-2">
                  <MapPin className="w-3.5 h-3.5" /> {job.location}
                </p>
              )}
              {job.equipment_needed.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {job.equipment_needed.map(eq => (
                    <span key={eq} className="px-2 py-0.5 bg-indigo-50 rounded text-xs text-indigo-600 font-medium">
                      <Wrench className="w-3 h-3 inline mr-0.5" />{eq}
                    </span>
                  ))}
                </div>
              )}
              {job.description && (
                <p className="text-xs text-gray-500 mt-2 italic">&ldquo;{job.description}&rdquo;</p>
              )}
            </div>

            {/* Info note */}
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
              <p className="text-xs text-blue-700">
                <strong>Note:</strong> Operators will be assigned 2-3 days before the start date.
                {job.is_will_call && (
                  <span className="block mt-1 text-amber-700 font-semibold">
                    📞 Salesman marked this as Will Call — it will go to the Will Call folder.
                  </span>
                )}
              </p>
            </div>

            {/* Schedule Date */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                <Calendar className="w-4 h-4 inline mr-1.5" />
                {job.is_will_call ? 'Tentative Start Date' : 'Start Date'}
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 text-sm text-gray-900 bg-white transition-all"
              />
              {!job.is_will_call && (
                <p className="text-xs text-gray-400 mt-1">Job will appear on the schedule for this date</p>
              )}
              {job.is_will_call && (
                <p className="text-xs text-amber-600 mt-1">Job will be stored in Will Call until a slot opens</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm({ scheduledDate })}
                disabled={!scheduledDate}
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✓ {job.is_will_call ? 'Approve → Will Call' : 'Approve & Schedule'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
