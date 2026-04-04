'use client';

import { useState } from 'react';
import { X, AlertCircle, MapPin, Send, CheckSquare } from 'lucide-react';
import type { PendingJob } from './PendingQueueSidebar';

interface MissingInfoModalProps {
  job: PendingJob;
  onConfirm: (missingItems: string[], customNote: string) => void;
  onClose: () => void;
}

const MISSING_ITEMS = [
  { id: 'po', label: 'PO Number', desc: 'Purchase order is required' },
  { id: 'scope', label: 'Scope Details', desc: 'Need more details on the work' },
  { id: 'access', label: 'Site Access Info', desc: 'How to access the job site' },
  { id: 'contact', label: 'Site Contact', desc: 'On-site contact person & phone' },
  { id: 'equipment', label: 'Equipment Details', desc: 'Clarify equipment requirements' },
  { id: 'date', label: 'Date Clarification', desc: 'Need to confirm or change dates' },
  { id: 'drawings', label: 'Drawings / Plans', desc: 'Upload cut plans or blueprints' },
  { id: 'safety', label: 'Safety Requirements', desc: 'Special safety protocols needed' },
];

export default function MissingInfoModal({ job, onConfirm, onClose }: MissingInfoModalProps) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [customNote, setCustomNote] = useState('');

  const toggleItem = (id: string) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectedLabels = selectedItems.map(id => MISSING_ITEMS.find(i => i.id === id)?.label || id);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-red-500 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Missing Information
                </h2>
                <p className="text-orange-100 text-sm">Notify salesman to update & resubmit</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Job summary */}
            <div className="bg-orange-50 rounded-xl p-3 border border-orange-200">
              <h3 className="font-bold text-gray-900 text-sm">{job.customer_name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">{job.job_type}</span>
                <span className="text-gray-300">•</span>
                <span className="text-xs text-gray-500">by {job.submitted_by}</span>
              </div>
              {job.location && (
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3" /> {job.location}
                </p>
              )}
            </div>

            {/* What's missing checklist */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                What information is missing?
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {MISSING_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`text-left px-3 py-2 rounded-xl border-2 transition-all text-xs ${
                      selectedItems.includes(item.id)
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <CheckSquare className={`w-3.5 h-3.5 flex-shrink-0 ${
                        selectedItems.includes(item.id) ? 'text-orange-600' : 'text-gray-300'
                      }`} />
                      <span className="font-bold text-gray-900">{item.label}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 ml-5">{item.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Additional note */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Additional Note to Salesman <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="Any specific instructions for the salesman..."
                rows={2}
                className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:ring-2 focus:ring-orange-200 text-sm text-gray-900 bg-white placeholder:text-gray-400 transition-all resize-none"
              />
            </div>

            {/* Preview of notification */}
            {selectedItems.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Salesman will be notified to provide:</p>
                <ul className="space-y-0.5">
                  {selectedLabels.map(label => (
                    <li key={label} className="text-xs text-gray-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => selectedItems.length > 0 && onConfirm(selectedLabels, customNote)}
                disabled={selectedItems.length === 0}
                className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                Notify Salesman
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
