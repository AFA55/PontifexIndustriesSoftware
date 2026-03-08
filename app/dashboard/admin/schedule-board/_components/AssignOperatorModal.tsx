'use client';

import { useState } from 'react';
import { X, Users, MapPin, UserCheck } from 'lucide-react';
import type { JobCardData } from './JobCard';

interface AssignOperatorModalProps {
  job: JobCardData;
  operators: { name: string; helper: string; jobCount: number }[];
  onConfirm: (operatorIndex: number) => void;
  onClose: () => void;
}

export default function AssignOperatorModal({ job, operators, onConfirm, onClose }: AssignOperatorModalProps) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-pink-500 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <UserCheck className="w-5 h-5" />
                  Assign Operator
                </h2>
                <p className="text-purple-200 text-sm">Select who handles this job</p>
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
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 mt-1">
                {job.job_type?.split(',')[0]?.trim()}
              </span>
              {job.location && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3" /> {job.location}
                </p>
              )}
            </div>

            {/* Operator list */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                <Users className="w-4 h-4 inline mr-1.5" />
                Available Operators
              </label>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {operators.map((op, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelected(idx)}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all ${
                      selected === idx
                        ? 'border-purple-500 bg-purple-50 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-gray-900">{op.name}</span>
                        <p className="text-xs text-gray-400 mt-0.5">+ {op.helper} (Helper)</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          op.jobCount === 0
                            ? 'bg-green-100 text-green-700'
                            : op.jobCount >= 2
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}>
                          {op.jobCount} {op.jobCount === 1 ? 'job' : 'jobs'}
                        </span>
                        {op.jobCount === 0 && (
                          <p className="text-[10px] text-green-600 font-semibold mt-0.5">Available</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
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
                onClick={() => selected !== null && onConfirm(selected)}
                disabled={selected === null}
                className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✓ Assign Operator
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
