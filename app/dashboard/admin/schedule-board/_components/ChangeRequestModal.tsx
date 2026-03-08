'use client';

import { useState } from 'react';
import { X, FileText, MapPin, Send } from 'lucide-react';
import type { JobCardData } from './JobCard';

interface ChangeRequestModalProps {
  job: JobCardData;
  onSubmit: (data: { type: string; description: string }) => void;
  onClose: () => void;
}

const REQUEST_TYPES = [
  { value: 'reschedule', label: '📅 Reschedule', desc: 'Change the date or time' },
  { value: 'modify', label: '✏️ Modify Scope', desc: 'Update description or equipment' },
  { value: 'cancel', label: '🚫 Cancel Job', desc: 'Request to remove this job' },
  { value: 'other', label: '💬 Other', desc: 'General request or question' },
];

export default function ChangeRequestModal({ job, onSubmit, onClose }: ChangeRequestModalProps) {
  const [requestType, setRequestType] = useState('');
  const [description, setDescription] = useState('');

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Request Change
                </h2>
                <p className="text-blue-200 text-sm">Submit to Operations Manager for review</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Job summary */}
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <h3 className="font-bold text-gray-900 text-sm">{job.customer_name}</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 mt-1">
                {job.job_type?.split(',')[0]?.trim()}
              </span>
              {job.location && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3" /> {job.location}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">{job.job_number}</p>
            </div>

            {/* Request type */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">What type of change?</label>
              <div className="grid grid-cols-2 gap-2">
                {REQUEST_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setRequestType(t.value)}
                    className={`text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                      requestType === t.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-sm font-bold text-gray-900">{t.label}</span>
                    <p className="text-[11px] text-gray-500 mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Describe the change you need
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell the Operations Manager what you need changed..."
                rows={4}
                className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-sm transition-all resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => requestType && description.trim() && onSubmit({ type: requestType, description })}
                disabled={!requestType || !description.trim()}
                className="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                Submit Request
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
