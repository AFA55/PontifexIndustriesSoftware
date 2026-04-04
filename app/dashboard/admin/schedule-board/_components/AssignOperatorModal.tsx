'use client';

import { useState, useEffect } from 'react';
import { X, Users, MapPin, UserCheck, AlertTriangle } from 'lucide-react';
import type { JobCardData } from './JobCard';

interface AssignOperatorModalProps {
  job: JobCardData;
  allOperators: string[];
  allHelpers: string[];
  busyOperators: Record<string, string>; // name → current job customer_name
  busyHelpers: Record<string, string>;
  onConfirm: (operatorName: string, helperName: string | null) => void;
  onClose: () => void;
}

export default function AssignOperatorModal({
  job, allOperators, allHelpers, busyOperators, busyHelpers, onConfirm, onClose,
}: AssignOperatorModalProps) {
  const [selectedOperator, setSelectedOperator] = useState<string>('');
  const [selectedHelper, setSelectedHelper] = useState<string>('');
  const [skillMatchData, setSkillMatchData] = useState<{
    qualified_count: number;
    total_operators: number;
    job_types: string[];
    job_difficulty: number;
  } | null>(null);

  const operatorBusy = selectedOperator ? busyOperators[selectedOperator] : null;
  const helperBusy = selectedHelper ? busyHelpers[selectedHelper] : null;

  // Fetch skill match data on mount
  useEffect(() => {
    async function fetchSkillMatch() {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token || '';
        const res = await fetch(`/api/admin/schedule-board/skill-match?jobId=${job.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setSkillMatchData({
              qualified_count: json.data.qualified_count,
              total_operators: json.data.total_operators,
              job_types: json.data.job_types || [],
              job_difficulty: json.data.job_difficulty,
            });
          }
        }
      } catch { /* ignore */ }
    }
    fetchSkillMatch();
  }, [job.id]);

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

            {/* Skill match warning */}
            {skillMatchData && skillMatchData.qualified_count < Math.ceil(skillMatchData.total_operators * 0.5) && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 rounded-xl border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-800 font-semibold">
                    Only {skillMatchData.qualified_count} of {skillMatchData.total_operators} operators qualified
                    {skillMatchData.job_types.length > 0 && (
                      <> for {skillMatchData.job_types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')}</>
                    )}
                    {skillMatchData.job_difficulty > 0 && (
                      <> at difficulty {skillMatchData.job_difficulty}</>
                    )}
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">Consider scheduling carefully</p>
                </div>
              </div>
            )}

            {/* Operator dropdown */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                <Users className="w-4 h-4 inline mr-1.5" />
                Operator
              </label>
              <select
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm font-medium bg-white text-gray-900 transition-all"
              >
                <option value="">Select Operator...</option>
                {allOperators.map(name => (
                  <option key={name} value={name}>
                    {name}{busyOperators[name] ? ` — On: ${busyOperators[name]}` : ''}
                  </option>
                ))}
              </select>
              {operatorBusy && (
                <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1.5 bg-amber-50 rounded-lg border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-700">
                    Already assigned to <span className="font-bold">{operatorBusy}</span> today
                  </p>
                </div>
              )}
            </div>

            {/* Helper dropdown */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                <Users className="w-4 h-4 inline mr-1.5" />
                Helper <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <select
                value={selectedHelper}
                onChange={(e) => setSelectedHelper(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm font-medium bg-white text-gray-900 transition-all"
              >
                <option value="">No Helper</option>
                {allHelpers.map(name => (
                  <option key={name} value={name}>
                    {name}{busyHelpers[name] ? ` — On: ${busyHelpers[name]}` : ''}
                  </option>
                ))}
              </select>
              {helperBusy && (
                <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1.5 bg-amber-50 rounded-lg border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-700">
                    Already assigned to <span className="font-bold">{helperBusy}</span> today
                  </p>
                </div>
              )}
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
                onClick={() => selectedOperator && onConfirm(selectedOperator, selectedHelper || null)}
                disabled={!selectedOperator}
                className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✓ Assign
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
