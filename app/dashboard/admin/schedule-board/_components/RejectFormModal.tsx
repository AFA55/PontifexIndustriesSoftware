'use client';

import { useState } from 'react';
import { X, AlertTriangle, FileText, User, MapPin, Wrench } from 'lucide-react';
import type { PendingJob } from './PendingQueueSidebar';

const REJECTION_REASONS = [
  { value: 'missing_info', label: 'Missing Information', description: 'Form is incomplete or missing required details' },
  { value: 'incorrect_scope', label: 'Incorrect Scope', description: 'Scope of work is inaccurate or needs revision' },
  { value: 'budget_issue', label: 'Budget Issue', description: 'Estimated cost or budget concerns' },
  { value: 'scheduling_conflict', label: 'Scheduling Conflict', description: 'Date conflicts with existing schedule' },
  { value: 'compliance_issue', label: 'Compliance Issue', description: 'Site compliance or safety requirements not met' },
  { value: 'other', label: 'Other', description: 'Other reason (specify in notes)' },
];

interface RejectFormModalProps {
  job: PendingJob;
  onConfirm: (data: { rejection_reason: string; rejection_notes: string }) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function RejectFormModal({ job, onConfirm, onClose, loading }: RejectFormModalProps) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const canSubmit = reason && notes.trim().length >= 10 && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-[#1a0f35] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-rose-600 p-5 rounded-t-2xl text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Reject Schedule Form</h2>
                <p className="text-red-100 text-sm">This will notify the submitter</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form preview */}
        <div className="p-5 border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03]">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-3">Form Being Rejected</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-400 dark:text-white/30" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{job.job_number}</span>
              <span className="text-gray-300 dark:text-white/20">|</span>
              <span className="text-sm text-gray-600 dark:text-white/60">{job.customer_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-gray-400 dark:text-white/30" />
              <span className="text-sm text-gray-600 dark:text-white/60">{job.job_type?.split(',')[0]?.trim()}</span>
            </div>
            {job.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400 dark:text-white/30" />
                <span className="text-sm text-gray-600 dark:text-white/60 truncate">{job.location}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400 dark:text-white/30" />
              <span className="text-sm text-gray-600 dark:text-white/60">Submitted by <strong className="dark:text-white">{job.submitted_by}</strong></span>
            </div>
          </div>
        </div>

        {/* Rejection reason */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-white/70 mb-2">Rejection Reason *</label>
            <div className="grid grid-cols-1 gap-2">
              {REJECTION_REASONS.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    reason === r.value
                      ? 'border-red-500 bg-red-50 dark:bg-red-500/10'
                      : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 bg-white dark:bg-white/[0.03] dark:hover:bg-white/[0.08]'
                  }`}
                >
                  <div className="font-semibold text-sm text-gray-900 dark:text-white">{r.label}</div>
                  <div className="text-xs text-gray-500 dark:text-white/50 mt-0.5">{r.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-white/70 mb-2">
              Rejection Notes * <span className="text-gray-400 dark:text-white/30 font-normal">(min 10 characters)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Explain why this form is being rejected and what the submitter needs to fix..."
              rows={4}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-white/10 rounded-xl text-sm text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder-white/30 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none transition-all"
            />
            <div className="text-xs text-gray-400 dark:text-white/30 mt-1 text-right">
              {notes.trim().length}/10 min characters
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 border-t border-gray-100 dark:border-white/10 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-700 dark:text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => canSubmit && onConfirm({ rejection_reason: reason, rejection_notes: notes.trim() })}
            disabled={!canSubmit}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
              canSubmit
                ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-lg hover:shadow-xl'
                : 'bg-gray-200 dark:bg-white/10 text-gray-400 dark:text-white/30 cursor-not-allowed'
            }`}
          >
            {loading ? 'Rejecting...' : 'Confirm Rejection'}
          </button>
        </div>
      </div>
    </div>
  );
}
