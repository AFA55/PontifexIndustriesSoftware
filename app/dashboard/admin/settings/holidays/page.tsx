'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, CalendarDays, Loader2, Plus, Trash2,
  CheckCircle, AlertTriangle, ToggleLeft, ToggleRight,
  Send, Pencil, X,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatDayLong, toLocalYMD } from '@/lib/dates';

interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  pay_hours: number;
  applies_to: 'all' | 'field' | 'shop';
  is_active: boolean;
}

const APPLIES_TO_LABEL: Record<string, string> = {
  all: 'All hourly staff',
  field: 'Field crew',
  shop: 'Shop staff',
};

function NumberInput({ label, value, onChange, unit, min, max, step }: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      {label && <label className="block text-sm font-semibold text-slate-800 mb-1">{label}</label>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step || 1}
          className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all tabular-nums"
        />
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export default function HolidaysSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [error, setError] = useState('');

  // Add form
  const [newDate, setNewDate] = useState(() => toLocalYMD());
  const [newName, setNewName] = useState('');
  const [newHours, setNewHours] = useState(8);
  const [newAppliesTo, setNewAppliesTo] = useState<'all' | 'field' | 'shop'>('all');
  const [adding, setAdding] = useState(false);

  // Per-row UI state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editHours, setEditHours] = useState(8);
  const [editAppliesTo, setEditAppliesTo] = useState<'all' | 'field' | 'shop'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<Record<string, string>>({});

  const loadHolidays = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/company-holidays', { headers: await authHeaders() });
      const json = await res.json();
      if (res.ok && json.success) {
        setHolidays(json.data ?? []);
      } else {
        setError(json.error || 'Failed to load holidays');
      }
    } catch {
      setError('Network error loading holidays');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.push('/login'); return; }
    if (!['super_admin', 'operations_manager', 'admin'].includes(user.role || '')) {
      router.push('/dashboard');
      return;
    }
    loadHolidays();
  }, [router, loadHolidays]);

  const handleAdd = async () => {
    if (!newName.trim() || !newDate) { setError('Date and name are required'); return; }
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/admin/company-holidays', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          holiday_date: newDate,
          name: newName.trim(),
          pay_hours: newHours,
          applies_to: newAppliesTo,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.error || 'Failed to add holiday'); return; }
      setNewName('');
      setNewHours(8);
      setNewAppliesTo('all');
      await loadHolidays();
    } catch {
      setError('Network error adding holiday');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (h: Holiday) => {
    setEditingId(h.id);
    setEditName(h.name);
    setEditHours(Number(h.pay_hours));
    setEditAppliesTo(h.applies_to);
  };

  const saveEdit = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/admin/company-holidays/${id}`, {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ name: editName.trim(), pay_hours: editHours, applies_to: editAppliesTo }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.error || 'Failed to save'); return; }
      setEditingId(null);
      await loadHolidays();
    } catch {
      setError('Network error saving holiday');
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (h: Holiday) => {
    setBusyId(h.id);
    try {
      await fetch(`/api/admin/company-holidays/${h.id}`, {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ is_active: !h.is_active }),
      });
      await loadHolidays();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this holiday? Already-applied timecard entries are not removed.')) return;
    setBusyId(id);
    try {
      await fetch(`/api/admin/company-holidays/${id}`, { method: 'DELETE', headers: await authHeaders() });
      await loadHolidays();
    } finally {
      setBusyId(null);
    }
  };

  const handleApply = async (id: string) => {
    setBusyId(id);
    setApplyResult((p) => ({ ...p, [id]: '' }));
    try {
      const res = await fetch(`/api/admin/company-holidays/${id}/apply`, {
        method: 'POST',
        headers: await authHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setApplyResult((p) => ({ ...p, [id]: json.error || 'Apply failed' }));
        return;
      }
      setApplyResult((p) => ({ ...p, [id]: `Applied ${json.applied} · skipped ${json.skipped}` }));
    } catch {
      setApplyResult((p) => ({ ...p, [id]: 'Network error' }));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/admin/settings"
              className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-sm font-medium"
            >
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">Settings</span>
            </Link>
            <div className="h-6 w-px bg-slate-200" />
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-brand-accent flex items-center justify-center shadow-sm">
                <CalendarDays size={16} className="text-white" />
              </div>
              Company Holidays
            </h1>
          </div>
        </div>
      </header>

      <div className="max-w-[900px] mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* ── Add holiday ───────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
              <Plus size={16} className="text-brand" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Add a holiday</h2>
              <p className="text-xs text-slate-400">Mark a date as a paid company holiday</p>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Independence Day"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                />
              </div>
              <NumberInput label="Pay hours" value={newHours} onChange={setNewHours} unit="hrs" min={0} max={24} step={0.5} />
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">Applies to</label>
                <select
                  value={newAppliesTo}
                  onChange={(e) => setNewAppliesTo(e.target.value as 'all' | 'field' | 'shop')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                >
                  <option value="all">All hourly staff</option>
                  <option value="field">Field crew</option>
                  <option value="shop">Shop staff</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleAdd}
                disabled={adding}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white transition-all shadow-md disabled:opacity-50"
              >
                {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Add Holiday
              </button>
            </div>
          </div>
        </div>

        {/* ── Holiday list ──────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <CalendarDays size={16} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Holidays</h2>
              <p className="text-xs text-slate-400">Apply pushes holiday pay onto eligible timecards (idempotent — safe to re-run)</p>
            </div>
          </div>

          {holidays.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No holidays yet. Add one above.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {holidays.map((h) => (
                <div key={h.id} className="p-5">
                  {editingId === h.id ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                        <div>
                          <label className="block text-sm font-semibold text-slate-800 mb-1">Name</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                          />
                        </div>
                        <NumberInput label="Pay hours" value={editHours} onChange={setEditHours} unit="hrs" min={0} max={24} step={0.5} />
                        <div>
                          <label className="block text-sm font-semibold text-slate-800 mb-1">Applies to</label>
                          <select
                            value={editAppliesTo}
                            onChange={(e) => setEditAppliesTo(e.target.value as 'all' | 'field' | 'shop')}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                          >
                            <option value="all">All hourly staff</option>
                            <option value="field">Field crew</option>
                            <option value="shop">Shop staff</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveEdit(h.id)}
                          disabled={busyId === h.id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all disabled:opacity-50"
                        >
                          {busyId === h.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
                        >
                          <X size={14} /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-bold ${h.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                            {h.name}
                          </p>
                          <span className="text-xs font-semibold text-brand bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-full">
                            {Number(h.pay_hours)} hrs
                          </span>
                          <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            {APPLIES_TO_LABEL[h.applies_to] ?? h.applies_to}
                          </span>
                          {!h.is_active && (
                            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Inactive</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{formatDayLong(h.holiday_date)}</p>
                        {applyResult[h.id] && (
                          <p className="text-xs font-semibold text-emerald-600 mt-1">{applyResult[h.id]}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleApply(h.id)}
                          disabled={busyId === h.id || !h.is_active}
                          title={h.is_active ? 'Apply holiday pay to eligible timecards' : 'Activate to apply'}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white transition-all shadow-sm disabled:opacity-40"
                        >
                          {busyId === h.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                          Apply
                        </button>
                        <button
                          onClick={() => toggleActive(h)}
                          disabled={busyId === h.id}
                          title={h.is_active ? 'Deactivate' : 'Activate'}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-all disabled:opacity-40"
                        >
                          {h.is_active ? <ToggleRight size={20} className="text-emerald-600" /> : <ToggleLeft size={20} />}
                        </button>
                        <button
                          onClick={() => startEdit(h)}
                          title="Edit"
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-all"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(h.id)}
                          disabled={busyId === h.id}
                          title="Delete"
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-all disabled:opacity-40"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-blue-900 mb-1">How holiday pay works</h3>
              <p className="text-xs text-blue-700">
                Pressing <strong>Apply</strong> creates a holiday-pay timecard entry for each eligible hourly
                employee (field and/or shop, per the scope). Holiday hours are paid but <strong>overtime-exempt</strong> —
                they never push someone past the 40-hour weekly OT threshold. Apply is idempotent: re-running
                skips anyone who already has an entry, so no one is double-paid.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
