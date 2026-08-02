'use client';

/**
 * JobCrewPanel — one ticket, whole crew.
 * Management adds crew to a job beyond the lead:
 *   · role 'operator' — full work-performed input (the lead still completes
 *     the day / runs status), or
 *   · role 'helper'   — the light helper-work-log form.
 * Members are listed Lead → Operators → Helpers with role badges, and any
 * crew member can be promoted with "Make lead": the promotion goes through
 * /api/admin/schedule-board/assign (the ONLY lead-change write path — per-day
 * ledger, sequencing + notifications all apply), then the OLD lead is kept on
 * the job as a crew operator and the promoted member's crew row is removed.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Plus, X, Loader2, Crown, Wrench, HardHat, ArrowUp } from 'lucide-react';

interface CrewMember { user_id: string; role: string; full_name: string | null }
interface OperatorOpt { id: string; name: string }
type CrewRole = 'operator' | 'helper';

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

export default function JobCrewPanel({
  jobId,
  leadId,
  leadName,
  helperId,
  scheduledDate,
  endDate,
  boardDate,
  canPromote,
  autoOpenAdd,
  onLeadChanged,
}: {
  jobId: string;
  leadId: string | null;
  leadName: string | null;
  /** Current helper slot (job_orders.helper_assigned_to) — preserved on promote. */
  helperId?: string | null;
  scheduledDate?: string | null;
  endDate?: string | null;
  /** The board's viewed date — anchors the promote write when inside the span. */
  boardDate?: string | null;
  /** Whether the viewer may change the lead (board canEdit). */
  canPromote?: boolean;
  /** Opened via the card's "+" — pre-focus the add row. */
  autoOpenAdd?: boolean;
  onLeadChanged?: (newLeadId: string, newLeadName: string | null) => void;
}) {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [operators, setOperators] = useState<OperatorOpt[]>([]);
  const [helpers, setHelpers] = useState<OperatorOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [addRole, setAddRole] = useState<CrewRole>('operator');
  // Two-step "Make lead" confirm: user_id pending confirmation (or null).
  const [promoteTarget, setPromoteTarget] = useState<CrewMember | null>(null);
  const [promoting, setPromoting] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await token();
      const [crewRes, opsRes] = await Promise.all([
        fetch(`/api/admin/jobs/${jobId}/crew`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`/api/admin/schedule-board/operators`, { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      if (crewRes.ok) {
        const j = await crewRes.json();
        setCrew(Array.isArray(j.data) ? j.data : []);
      }
      if (opsRes.ok) {
        const j = await opsRes.json();
        setOperators(Array.isArray(j.data?.operators) ? j.data.operators : []);
        setHelpers(Array.isArray(j.data?.helpers) ? j.data.helpers : []);
      }
    } catch {
      /* silent */
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const addMember = async (userId: string) => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const t = await token();
      const res = await fetch(`/api/admin/jobs/${jobId}/crew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ user_id: userId, role: addRole }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || 'Could not add crew member.'); return; }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const t = await token();
      const res = await fetch(`/api/admin/jobs/${jobId}/crew?userId=${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Could not remove.'); return; }
      await load();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Promote a crew member to lead. Sequenced:
   *  1. /assign (scope 'remaining', anchored on the board's date) → new lead
   *  2. crew POST old lead as role 'operator' (they keep working the job)
   *  3. crew DELETE the promoted member's crew row (they now hold the lead slot)
   * Step 1 failing aborts; steps 2/3 failing surface a warning but the lead
   * change already landed.
   */
  const promoteToLead = async (member: CrewMember) => {
    setPromoting(true);
    setError(null);
    setWarning(null);
    try {
      const t = await token();
      const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };

      // Anchor on the board's viewed date when the job spans it; else the start.
      const sched = scheduledDate || '';
      const end = endDate || null;
      const anchor =
        boardDate && sched && boardDate >= sched && boardDate <= (end || sched) ? boardDate : sched;

      const assignRes = await fetch('/api/admin/schedule-board/assign', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          jobOrderId: jobId,
          operatorId: member.user_id,
          helperId: helperId ?? null, // keep the current helper slot
          assignment_date: anchor || undefined,
          scope: 'remaining',
          position: 'last',
        }),
      });
      const assignJson = await assignRes.json().catch(() => null);
      if (!assignRes.ok) {
        setError(assignJson?.details || assignJson?.error || 'Could not make them the lead.');
        return;
      }

      const oldLeadId = leadId;
      const warnings: string[] = [];

      // 2. Keep the OLD lead working the job as a crew operator.
      if (oldLeadId && oldLeadId !== member.user_id) {
        try {
          const keepRes = await fetch(`/api/admin/jobs/${jobId}/crew`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ user_id: oldLeadId, role: 'operator' }),
          });
          if (!keepRes.ok) {
            warnings.push(`Lead changed, but ${leadName || 'the previous lead'} could not be kept on the crew — add them back manually if they're still working this job.`);
          }
        } catch {
          warnings.push(`Lead changed, but ${leadName || 'the previous lead'} could not be kept on the crew — add them back manually if they're still working this job.`);
        }
      }

      // 3. The promoted member now holds the lead slot — drop their crew row.
      try {
        const delRes = await fetch(`/api/admin/jobs/${jobId}/crew?userId=${member.user_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!delRes.ok) warnings.push('Their old crew entry could not be removed — remove it manually.');
      } catch {
        warnings.push('Their old crew entry could not be removed — remove it manually.');
      }

      setWarning(warnings.length ? warnings.join(' ') : null);
      setPromoteTarget(null);
      onLeadChanged?.(member.user_id, member.full_name);
      await load();
    } catch {
      setError('Could not make them the lead.');
    } finally {
      setPromoting(false);
    }
  };

  const crewIds = new Set(crew.map((c) => c.user_id));
  // Operator adds pick from operators; helper adds also include apprentices.
  const candidatePool =
    addRole === 'operator'
      ? operators
      : [...operators, ...helpers.filter((h) => !operators.some((o) => o.id === h.id))];
  const available = candidatePool.filter((o) => o.id !== leadId && !crewIds.has(o.id));
  const crewOperators = crew.filter((c) => c.role === 'operator');
  const crewHelpers = crew.filter((c) => c.role !== 'operator');

  const memberChip = (c: CrewMember, isOperator: boolean) => (
    <span
      key={c.user_id}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
        isOperator
          ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-200 dark:border-indigo-400/30'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-400/30'
      }`}
    >
      {isOperator ? <Wrench className="w-3 h-3" /> : <HardHat className="w-3 h-3" />}
      {c.full_name || (isOperator ? 'Operator' : 'Helper')}
      <span className={`text-[10px] font-bold uppercase ${isOperator ? 'text-indigo-400' : 'text-emerald-400'}`}>
        · {isOperator ? 'Operator' : 'Helper'}
      </span>
      {canPromote && (
        <button
          type="button"
          onClick={() => { setPromoteTarget(c); setError(null); setWarning(null); }}
          disabled={busy || promoting}
          className="ml-0.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-500/30 text-[10px] font-bold disabled:opacity-40 transition-colors"
          title={`Make ${c.full_name || 'this member'} the lead on this job`}
        >
          <Crown className="w-3 h-3" /> Make lead
        </button>
      )}
      <button
        type="button"
        onClick={() => removeMember(c.user_id)}
        disabled={busy || promoting}
        className={`${isOperator ? 'text-indigo-400' : 'text-emerald-400'} hover:text-rose-500 disabled:opacity-40`}
        aria-label={`Remove ${c.full_name || 'crew member'}`}
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        <h4 className="text-sm font-bold text-slate-800 dark:text-white">Crew</h4>
        <span className="text-[11px] text-slate-400">
          lead completes the ticket · operators log their full work · helpers log a short description
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {/* Lead */}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-400/30">
          <Crown className="w-3 h-3" /> {leadName || 'Unassigned'} · Lead
        </span>
        {/* Operators, then helpers */}
        {crewOperators.map((c) => memberChip(c, true))}
        {crewHelpers.map((c) => memberChip(c, false))}
      </div>

      {/* Make-lead confirm */}
      {promoteTarget && (
        <div className="mb-3 p-3 rounded-xl border-2 border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 space-y-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Make <strong>{promoteTarget.full_name || 'this member'}</strong> the lead on this job
            (this and remaining days)?{' '}
            {leadName ? `${leadName} stays on the crew as an operator.` : ''}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => promoteToLead(promoteTarget)}
              disabled={promoting}
              className="flex-1 min-h-[44px] px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {promoting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}
              Yes, make lead
            </button>
            <button
              type="button"
              onClick={() => setPromoteTarget(null)}
              disabled={promoting}
              className="min-h-[44px] px-3 rounded-lg bg-white dark:bg-white/10 border border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-200 text-xs font-bold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {available.length > 0 ? (
        <div className="space-y-2">
          {/* Role choice for the next add */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Add as</span>
            <div className="inline-flex rounded-lg border border-slate-300 dark:border-white/20 overflow-hidden">
              {(['operator', 'helper'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAddRole(r)}
                  className={`min-h-[44px] px-3 text-xs font-bold transition-colors ${
                    addRole === r
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10'
                  }`}
                >
                  {r === 'operator' ? 'Operator (full input)' : 'Helper (short log)'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-slate-400" />
            <select
              defaultValue=""
              disabled={busy || promoting}
              autoFocus={autoOpenAdd}
              onChange={(e) => { addMember(e.target.value); e.target.value = ''; }}
              className="flex-1 min-h-[44px] px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none disabled:opacity-50"
            >
              <option value="" disabled>
                {addRole === 'operator' ? 'Add another operator…' : 'Add a helper…'}
              </option>
              {available.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            {busy && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">No other team members to add.</p>
      )}

      {error && <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
      {warning && <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">{warning}</p>}
    </div>
  );
}
