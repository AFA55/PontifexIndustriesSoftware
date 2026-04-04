'use client';

import { useState } from 'react';
import { X, Send, Loader2, Calendar, Clock, Users, Ban, HelpCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { JobCardData } from './JobCard';

interface ChangeRequestModalProps {
  job: JobCardData;
  onClose: () => void;
  onSuccess: () => void;
}

const REQUEST_TYPES = [
  { key: 'date_extension', label: 'Date Extension', icon: Calendar, desc: 'Job needs more time — extend the end date' },
  { key: 'date_change', label: 'Reschedule', icon: Clock, desc: 'Job needs to move to a different date' },
  { key: 'reassign', label: 'Reassign Operator', icon: Users, desc: 'Request a different operator for this job' },
  { key: 'cancel', label: 'Cancel Job', icon: Ban, desc: 'Request this job be cancelled' },
  { key: 'other', label: 'Other', icon: HelpCircle, desc: 'Something else needs to change' },
];

export default function ChangeRequestModal({ job, onClose, onSuccess }: ChangeRequestModalProps) {
  const [requestType, setRequestType] = useState('');
  const [requestedValue, setRequestedValue] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!requestType) { setError('Please select the type of change needed'); return; }
    if (!reason.trim()) { setError('Please explain why this change is needed'); return; }
    if (['date_extension', 'date_change'].includes(requestType) && !requestedValue) {
      setError('Please select the requested date'); return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch('/api/admin/change-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          jobOrderId: job.id,
          requestType,
          description: reason,
          requestedValue: requestedValue || undefined,
          currentValue: requestType === 'date_extension' ? (job.end_date ?? undefined) : (job.scheduled_date ?? undefined),
        }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to submit request');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Request Schedule Change</h2>
            <p className="text-gray-500 text-sm mt-0.5">{job.job_number} — {job.customer_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Type selector */}
          <div>
            <label className="text-sm text-gray-700 mb-2 block">What needs to change?</label>
            <div className="space-y-2">
              {REQUEST_TYPES.map(type => (
                <button
                  key={type.key}
                  onClick={() => setRequestType(type.key)}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    requestType === type.key
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <type.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${requestType === type.key ? 'text-purple-500' : 'text-gray-400'}`} />
                  <div>
                    <div className={`text-sm font-medium ${requestType === type.key ? 'text-gray-900' : 'text-gray-700'}`}>{type.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{type.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Date picker for date-related requests */}
          {['date_extension', 'date_change'].includes(requestType) && (
            <div>
              <label className="text-sm text-gray-700 mb-1 block">
                {requestType === 'date_extension' ? 'New End Date' : 'Requested New Date'}
              </label>
              <input
                type="date"
                value={requestedValue}
                onChange={e => setRequestedValue(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:border-purple-500 focus:ring-purple-500"
              />
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="text-sm text-gray-700 mb-1 block">Reason / Notes *</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder={
                requestType === 'date_extension'
                  ? 'e.g. Customer requested additional days, concrete not cured yet...'
                  : requestType === 'cancel'
                  ? 'e.g. Customer cancelled due to...'
                  : 'Explain why this change is needed...'
              }
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-purple-500 resize-none"
            />
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <p className="text-amber-300 text-sm">
              Your request will be sent to your supervisor for review. You'll receive a notification once it's approved or rejected.
            </p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="flex gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-3 font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl py-3 font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
            ) : (
              <><Send className="w-4 h-4" /> Submit Request</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
