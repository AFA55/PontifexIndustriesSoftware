'use client';

import { useState, useEffect } from 'react';
import { X, Users, MapPin, UserCheck, AlertTriangle, UserMinus } from 'lucide-react';
import type { JobCardData } from './JobCard';
import { OFF_PLATFORM_LEAD_MAX_LENGTH, normalizeOffPlatformLeadName } from '@/lib/off-platform-lead';

/**
 * The operator `<select>` value that means "there is no Pontifex operator on this
 * crew" — as opposed to `''`, which means "I have not chosen yet". Those are two
 * different answers and the Assign button treats them differently, so they cannot
 * share the empty string.
 */
const NO_OPERATOR = '__off_platform_lead__';

interface AssignOperatorModalProps {
  job: JobCardData;
  allOperators: string[];
  /** Operator-slot name → their day job ("helper", "supervisor", "ops manager")
   *  for anyone who isn't day-to-day an operator. Assignable as lead either way —
   *  they get the full operator workflow, since the ticket branches on slot not
   *  role — but the office should see who is stepping into the seat. */
  operatorSlotNotes?: Record<string, string>;
  allHelpers: string[];
  busyOperators: Record<string, string>; // name → current job customer_name
  busyHelpers: Record<string, string>;
  /**
   * `operatorName` is now NULLABLE — a crew can be a helper under a lead who is
   * not on Pontifex (founder, Aug 20). When it is null a helper is guaranteed
   * present (the button will not enable otherwise), and `offPlatformLeadName`
   * carries whoever the office says is running the crew, or null if they did not
   * say.
   */
  onConfirm: (
    operatorName: string | null,
    helperName: string | null,
    offPlatformLeadName?: string | null
  ) => void;
  onClose: () => void;
}

export default function AssignOperatorModal({
  job, allOperators, allHelpers, operatorSlotNotes, busyOperators, busyHelpers, onConfirm, onClose,
}: AssignOperatorModalProps) {
  const [selectedOperator, setSelectedOperator] = useState<string>('');
  const [selectedHelper, setSelectedHelper] = useState<string>('');
  const [offPlatformLead, setOffPlatformLead] = useState<string>('');
  const [skillMatchData, setSkillMatchData] = useState<{
    qualified_count: number;
    total_operators: number;
    job_types: string[];
    job_difficulty: number;
  } | null>(null);

  /** The crew has no Pontifex operator — deliberately, not because nothing is picked yet. */
  const noOperator = selectedOperator === NO_OPERATOR;
  const operatorBusy = selectedOperator && !noOperator ? busyOperators[selectedOperator] : null;
  const helperBusy = selectedHelper ? busyHelpers[selectedHelper] : null;

  /**
   * WHAT MAKES THIS ASSIGNABLE.
   *
   * It used to be `!!selectedOperator`, full stop — which is where the founder's
   * request died. Now: an operator, OR the explicit no-operator choice WITH a
   * helper. The helper is required in that branch because a crew with neither an
   * operator nor a helper is not a crew; it is the empty skeleton row that holds a
   * date open, and creating one from an Assign button would put a job on the board
   * that nobody is going to.
   */
  const canAssign = noOperator ? !!selectedHelper : !!selectedOperator;

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
        <div className="bg-white dark:bg-[#1a0f35] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand to-brand-accent p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <UserCheck className="w-5 h-5" />
                  {noOperator ? 'Assign Crew' : 'Assign Operator'}
                </h2>
                <p className="text-white/80 text-sm">Select who handles this job</p>
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
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-brand/10 text-brand mt-1">
                {job.job_type?.split(',')[0]?.trim()}
              </span>
              {job.location && (
                <p className="text-xs text-gray-500 dark:text-white/50 flex items-center gap-1 mt-1">
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
              <label className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-1.5">
                <Users className="w-4 h-4 inline mr-1.5" />
                Operator
              </label>
              <select
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-brand focus:ring-2 focus:ring-brand/30 text-sm font-medium bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white transition-all"
              >
                <option value="">Select Operator...</option>
                {allOperators.map(name => (
                  <option key={name} value={name}>
                    {name}{operatorSlotNotes?.[name] ? ` (${operatorSlotNotes[name]} — will run the operator ticket)` : ''}{busyOperators[name] ? ` — On: ${busyOperators[name]}` : ''}
                  </option>
                ))}
                {/* Last, and worded as a decision rather than an absence — the
                    office is stating something true about the crew, not skipping
                    a required field. */}
                <option value={NO_OPERATOR}>No operator — crew runs under someone not on Pontifex</option>
              </select>
              {/* The whole point of the founder's request, said out loud on the
                  row the office is about to create: this looks like a mistake
                  unless the board explains itself. */}
              {noOperator && (
                <div className="flex items-start gap-2 mt-2 px-3 py-2.5 bg-sky-50 dark:bg-sky-500/10 rounded-xl border border-sky-200 dark:border-sky-500/30">
                  <UserMinus className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-sky-800 dark:text-sky-200">
                    The helper gets the ticket and their day lands on this job — timecard, hours and
                    printed ticket. No operator ticket is expected for this crew.
                  </p>
                </div>
              )}
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
              <label className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-1.5">
                <Users className="w-4 h-4 inline mr-1.5" />
                Helper{' '}
                {noOperator ? (
                  <span className="font-normal text-sky-600 dark:text-sky-400">(required — they are the crew)</span>
                ) : (
                  <span className="font-normal text-gray-400 dark:text-white/30">(optional)</span>
                )}
              </label>
              <select
                value={selectedHelper}
                onChange={(e) => setSelectedHelper(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-brand focus:ring-2 focus:ring-brand/30 text-sm font-medium bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white transition-all"
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

            {/* Who is leading the crew — only asked when nobody on Pontifex is.
                Conditionally RENDERED, never `hidden={…}`: Tailwind 3.4's
                `hidden` loses to `block` at equal specificity, so a hidden field
                here would still be on screen. */}
            {noOperator && (
              <div>
                <label
                  htmlFor="off-platform-lead"
                  className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-1.5"
                >
                  <UserMinus className="w-4 h-4 inline mr-1.5" />
                  Who is leading this crew?{' '}
                  <span className="font-normal text-gray-400 dark:text-white/30">(optional)</span>
                </label>
                <input
                  id="off-platform-lead"
                  type="text"
                  value={offPlatformLead}
                  onChange={(e) => setOffPlatformLead(e.target.value)}
                  maxLength={OFF_PLATFORM_LEAD_MAX_LENGTH}
                  placeholder="Name of the sub or lead on site"
                  autoComplete="off"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-brand focus:ring-2 focus:ring-brand/30 text-base sm:text-sm font-medium bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white transition-all"
                />
                <p className="text-xs text-gray-500 dark:text-white/40 mt-1.5">
                  Recorded on this day&apos;s assignment so the board can say who was running the
                  crew. It does not create a user or send them anything.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-700 dark:text-white rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!canAssign) return;
                  if (noOperator) {
                    // Normalised HERE, not merely trimmed, so the toast the office
                    // reads back and the row the board draws say the same thing the
                    // ledger stores — the server normalises with this same function.
                    onConfirm(null, selectedHelper || null, normalizeOffPlatformLeadName(offPlatformLead));
                  } else {
                    onConfirm(selectedOperator, selectedHelper || null, null);
                  }
                }}
                disabled={!canAssign}
                className="flex-1 py-2.5 bg-gradient-to-r from-brand to-brand-accent hover:from-brand-dark hover:to-brand text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✓ {noOperator ? 'Assign Helper' : 'Assign'}
              </button>
            </div>
            {/* A disabled button with no reason is a wall. */}
            {noOperator && !selectedHelper && (
              <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                Pick the helper who is going — that is who this job is being assigned to.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
