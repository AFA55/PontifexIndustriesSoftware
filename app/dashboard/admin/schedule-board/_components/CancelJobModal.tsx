'use client';

import { useState } from 'react';
import { X, CalendarDays, Trash2, AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import type { JobCardData } from './JobCard';

interface CancelJobModalProps {
  job: JobCardData;
  onClose: () => void;
  onReschedule: (jobId: string, newDate: string, reason?: string) => Promise<void>;
  onDelete: (jobId: string) => Promise<void>;
}

type Step = 'choose' | 'reschedule' | 'delete-confirm';

export default function CancelJobModal({ job, onClose, onReschedule, onDelete }: CancelJobModalProps) {
  const [step, setStep] = useState<Step>('choose');
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReschedule = async () => {
    if (!newDate) { setError('Please select a new date.'); return; }
    setLoading(true);
    setError(null);
    try {
      await onReschedule(job.id, newDate, reason || undefined);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to reschedule job. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await onDelete(job.id);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete job. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Minimum date = tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-[#1a0f35] rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/10">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Remove from Schedule</h2>
            <p className="text-sm text-gray-500 dark:text-white/50 mt-0.5 truncate max-w-xs">
              {job.customer_name} — {job.job_number}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/30 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── STEP 1: CHOOSE ───────────────────────────────────── */}
        {step === 'choose' && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              Before removing this job, let us know what happened — was it postponed or fully cancelled?
            </p>

            {/* Option A: Reschedule */}
            <button
              onClick={() => setStep('reschedule')}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-all text-left group"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <CalendarDays className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-blue-900">Move to a Different Date</p>
                <p className="text-sm text-blue-600 mt-0.5">Job was postponed — keep it on the schedule for a new date</p>
              </div>
              <ChevronRight className="w-5 h-5 text-blue-400 group-hover:text-blue-600" />
            </button>

            {/* Option B: Delete */}
            <button
              onClick={() => setStep('delete-confirm')}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-400 transition-all text-left group"
            >
              <div className="w-11 h-11 rounded-xl bg-red-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <Trash2 className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-red-900">Delete Job Permanently</p>
                <p className="text-sm text-red-600 mt-0.5">Job was fully cancelled — remove it from the system</p>
              </div>
              <ChevronRight className="w-5 h-5 text-red-400 group-hover:text-red-600" />
            </button>
          </div>
        )}

        {/* ── STEP 2A: RESCHEDULE ──────────────────────────────── */}
        {step === 'reschedule' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setStep('choose')} className="text-sm text-gray-500 hover:text-gray-700 underline">← Back</button>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-white/70 mb-1.5">
                New Scheduled Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={newDate}
                min={minDate}
                onChange={(e) => { setNewDate(e.target.value); setError(null); }}
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-white/70 mb-1.5">
                Reason for Postponement <span className="text-gray-400 dark:text-white/30 font-normal">(optional)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Customer requested delay, weather, permit not ready..."
                rows={3}
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] text-sm resize-none placeholder:text-gray-400 dark:placeholder-white/30"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/60 font-semibold hover:bg-gray-50 dark:hover:bg-white/[0.08] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReschedule}
                disabled={loading || !newDate}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Rescheduling...</> : <><CalendarDays className="w-4 h-4" /> Reschedule Job</>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2B: DELETE CONFIRM ──────────────────────────── */}
        {step === 'delete-confirm' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setStep('choose')} className="text-sm text-gray-500 hover:text-gray-700 underline">← Back</button>
            </div>

            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="font-bold text-red-900">This cannot be undone</p>
              </div>
              <p className="text-sm text-red-700">
                You are about to permanently delete <strong>{job.customer_name}</strong> ({job.job_number}).
                All job data, notes, and attachments will be removed.
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-white/[0.05] rounded-xl p-4 space-y-1 text-sm text-gray-600 dark:text-white/60">
              <p><span className="font-medium text-gray-700 dark:text-white/70">Customer:</span> {job.customer_name}</p>
              <p><span className="font-medium text-gray-700 dark:text-white/70">Job #:</span> {job.job_number}</p>
              <p><span className="font-medium text-gray-700 dark:text-white/70">Type:</span> {job.job_type}</p>
              <p><span className="font-medium text-gray-700 dark:text-white/70">Scheduled:</span> {job.scheduled_date}</p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/60 font-semibold hover:bg-gray-50 dark:hover:bg-white/[0.08] transition-colors"
              >
                Keep Job
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4" /> Delete Permanently</>}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
