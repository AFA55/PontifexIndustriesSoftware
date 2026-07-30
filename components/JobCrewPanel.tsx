'use client';

/**
 * JobCrewPanel — management adds additional OPERATORS to a job beyond the lead.
 * The lead (job_orders.assigned_to) does the full completion ticket; crew members
 * get the light helper ticket (clock-in + short description). One full data-entry
 * per job + a note from each crew member.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Plus, X, Loader2, Crown } from 'lucide-react';

interface CrewMember { user_id: string; role: string; full_name: string | null }
interface OperatorOpt { id: string; name: string }

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

export default function JobCrewPanel({
  jobId,
  leadId,
  leadName,
}: {
  jobId: string;
  leadId: string | null;
  leadName: string | null;
}) {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [operators, setOperators] = useState<OperatorOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const t = await token();
      const res = await fetch(`/api/admin/jobs/${jobId}/crew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ user_id: userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || 'Could not add operator.'); return; }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    setBusy(true);
    setError(null);
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

  const crewIds = new Set(crew.map((c) => c.user_id));
  const available = operators.filter((o) => o.id !== leadId && !crewIds.has(o.id));

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        <h4 className="text-sm font-bold text-slate-800 dark:text-white">Crew</h4>
        <span className="text-[11px] text-slate-400">lead does the full ticket · crew log a short description</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {/* Lead */}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-400/30">
          <Crown className="w-3 h-3" /> {leadName || 'Unassigned'} · Lead
        </span>
        {/* Crew helpers */}
        {crew.map((c) => (
          <span
            key={c.user_id}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-200 dark:border-indigo-400/30"
          >
            {c.full_name || 'Operator'}
            <button
              type="button"
              onClick={() => removeMember(c.user_id)}
              disabled={busy}
              className="text-indigo-400 hover:text-rose-500 disabled:opacity-40"
              aria-label={`Remove ${c.full_name || 'operator'}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      {available.length > 0 ? (
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-slate-400" />
          <select
            defaultValue=""
            disabled={busy}
            onChange={(e) => { addMember(e.target.value); e.target.value = ''; }}
            className="flex-1 px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none disabled:opacity-50"
          >
            <option value="" disabled>Add another operator…</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          {busy && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">No other operators to add.</p>
      )}

      {error && <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
