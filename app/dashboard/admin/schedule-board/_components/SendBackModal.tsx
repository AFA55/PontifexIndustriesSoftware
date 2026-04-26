'use client';

import { useState } from 'react';
import { X, ArrowLeft, MapPin, AlertTriangle } from 'lucide-react';
import type { PendingJob } from './PendingQueueSidebar';

interface SendBackModalProps {
  job: PendingJob;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

const QUICK_REASONS = [
  'Missing PO number',
  'Need more details on scope',
  'Date conflict — pick another date',
  'Equipment not available',
  'Need site access information',
  'Incomplete form — please re-submit',
];

export default function SendBackModal({ job, onConfirm, onClose }: SendBackModalProps) {
  const [reason, setReason] = useState('');

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white dark:bg-[#1a0f35] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-gray-600 to-gray-700 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <ArrowLeft className="w-5 h-5" />
                  Send Back Form
                </h2>
                <p className="text-gray-300 text-sm">Return to salesman for revision</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Job summary */}
            <div className="bg-orange-50 dark:bg-white/[0.05] rounded-xl p-3 border border-orange-200 dark:border-white/10">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">{job.customer_name}</h3>
              <span className="text-xs text-gray-500 dark:text-white/50">{job.job_type} • Submitted by {job.submitted_by}</span>
            </div>

            {/* Quick reasons */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-2">Quick Select Reason</label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      reason === r
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 dark:bg-white/[0.05] text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/[0.08]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom reason */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-1.5">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Reason for Sending Back
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tell the salesman what needs to be fixed..."
                rows={3}
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-gray-500 focus:ring-2 focus:ring-gray-200 text-sm text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder-white/30 transition-all resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-700 dark:text-white rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => reason.trim() && onConfirm(reason)}
                disabled={!reason.trim()}
                className="flex-1 py-2.5 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Send Back
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
