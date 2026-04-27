'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarOff,
  Plus,
  Search,
  Filter,
  Trash2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  Calendar,
  Loader2,
  X,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import LogTimeOffModal from './_components/LogTimeOffModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimeOffEntry {
  id: string;
  operator_id: string;
  operator_name: string;
  date: string;
  end_date?: string | null;
  type: string;
  is_paid: boolean;
  notes?: string | null;
  created_at: string;
}

interface AttendanceMetric {
  operator_id: string;
  operator_name: string;
  role: string;
  pto_used: number;
  pto_allocated: number;
  callouts_year: number;
  callouts_month: number;
  last_callout: string | null;
  late_clocks: number;
  punctuality_pct: number;
  entries: TimeOffEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_META: Record<string, { label: string; color: string; dark: string }> = {
  pto:             { label: 'PTO',           color: 'bg-blue-100 text-blue-700 ring-blue-300',      dark: 'dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700' },
  vacation:        { label: 'Vacation',      color: 'bg-cyan-100 text-cyan-700 ring-cyan-300',      dark: 'dark:bg-cyan-900/40 dark:text-cyan-300 dark:ring-cyan-700' },
  unpaid:          { label: 'Unpaid',        color: 'bg-gray-100 text-gray-600 ring-gray-300',      dark: 'dark:bg-gray-700/50 dark:text-gray-300 dark:ring-gray-600' },
  sick:            { label: 'Sick',          color: 'bg-amber-100 text-amber-700 ring-amber-300',   dark: 'dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-700' },
  callout:         { label: 'Callout',       color: 'bg-red-100 text-red-700 ring-red-300',         dark: 'dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700' },
  no_show:         { label: 'No Show',       color: 'bg-red-200 text-red-800 ring-red-400',         dark: 'dark:bg-red-900/60 dark:text-red-200 dark:ring-red-600' },
  bereavement:     { label: 'Bereavement',   color: 'bg-violet-100 text-violet-700 ring-violet-300', dark: 'dark:bg-violet-900/40 dark:text-violet-300 dark:ring-violet-700' },
  personal:        { label: 'Personal',      color: 'bg-indigo-100 text-indigo-700 ring-indigo-300', dark: 'dark:bg-indigo-900/40 dark:text-indigo-300 dark:ring-indigo-700' },
  personal_day:    { label: 'Personal Day',  color: 'bg-indigo-100 text-indigo-700 ring-indigo-300', dark: 'dark:bg-indigo-900/40 dark:text-indigo-300 dark:ring-indigo-700' },
  worked_last_night:{ label: 'Worked Last Night', color: 'bg-purple-100 text-purple-700 ring-purple-300', dark: 'dark:bg-purple-900/40 dark:text-purple-300 dark:ring-purple-700' },
  unavailable:     { label: 'Unavailable',   color: 'bg-slate-100 text-slate-600 ring-slate-300',   dark: 'dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-600' },
  other:           { label: 'Other',         color: 'bg-gray-100 text-gray-600 ring-gray-300',      dark: 'dark:bg-gray-700/50 dark:text-gray-300 dark:ring-gray-600' },
};

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] ?? { label: type, color: 'bg-gray-100 text-gray-600 ring-gray-300', dark: '' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${meta.color} ${meta.dark}`}>
      {meta.label}
    </span>
  );
}

function PaidBadge({ paid }: { paid: boolean }) {
  return paid ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700">
      Paid
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 ring-1 ring-gray-300 dark:bg-gray-700/50 dark:text-gray-400 dark:ring-gray-600">
      Unpaid
    </span>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function calloutColor(count: number): string {
  if (count === 0) return 'text-emerald-600 dark:text-emerald-400';
  if (count <= 1) return 'text-emerald-500 dark:text-emerald-400';
  if (count <= 3) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function calloutBadgeBg(count: number): string {
  if (count <= 1) return 'bg-emerald-100 text-emerald-700 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700';
  if (count <= 3) return 'bg-amber-100 text-amber-700 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-700';
  return 'bg-red-100 text-red-700 ring-red-300 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm font-medium text-gray-500 dark:text-white/50">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-white/35 mt-0.5">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requests Tab
// ---------------------------------------------------------------------------

function RequestsTab({ token }: { token: string }) {
  const [entries, setEntries] = useState<TimeOffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Filters
  const [searchOp, setSearchOp] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (filterStart) params.set('startDate', filterStart);
      if (filterEnd) params.set('endDate', filterEnd);
      if (filterType) params.set('type', filterType);

      const res = await fetch(`/api/admin/time-off?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setEntries(json.data ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }, [token, filterStart, filterEnd, filterType]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this time-off entry?')) return;
    setDeleting(id);
    await fetch(`/api/admin/time-off?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setDeleting(null);
    fetchEntries();
  };

  const filtered = entries.filter((e) =>
    !searchOp || e.operator_name.toLowerCase().includes(searchOp.toLowerCase())
  );

  // Summary stats
  const totalPTO = entries.filter(e => e.type === 'pto').length;
  const totalCallouts = entries.filter(e => ['callout', 'sick', 'no_show'].includes(e.type)).length;
  const totalVacation = entries.filter(e => e.type === 'vacation').length;
  const totalUnpaid = entries.filter(e => !e.is_paid).length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Calendar} label="PTO Taken" value={totalPTO} sub="this year" color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <StatCard icon={AlertTriangle} label="Callouts" value={totalCallouts} sub="this year" color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" />
        <StatCard icon={CheckCircle2} label="Vacation Days" value={totalVacation} sub="this year" color="bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400" />
        <StatCard icon={Clock} label="Unpaid Days" value={totalUnpaid} sub="this year" color="bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400" />
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 rounded-2xl p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/35" />
            <input
              type="text"
              placeholder="Search operator..."
              value={searchOp}
              onChange={e => setSearchOp(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.05] text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            />
          </div>

          {/* Type filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/35 pointer-events-none" />
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.05] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 appearance-none"
            >
              <option value="">All Types</option>
              {Object.entries(TYPE_META).map(([val, meta]) => (
                <option key={val} value={val}>{meta.label}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <input
            type="date"
            value={filterStart}
            onChange={e => setFilterStart(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.05] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          />
          <span className="text-gray-400 dark:text-white/35 text-sm hidden sm:block">–</span>
          <input
            type="date"
            value={filterEnd}
            onChange={e => setFilterEnd(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.05] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          />

          {/* Clear filters */}
          {(filterType || filterStart || filterEnd || searchOp) && (
            <button
              onClick={() => { setFilterType(''); setFilterStart(''); setFilterEnd(''); setSearchOp(''); }}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              title="Clear filters"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-white/70">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </h3>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Log Time Off / Callout
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-white/30">
            <CalendarOff className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No time-off entries found</p>
            <p className="text-xs mt-1">Adjust filters or add a new entry</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/[0.03]">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide">Operator</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide">Date(s)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide">Paid</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide">Notes</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                {filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-gray-900 dark:text-white">{entry.operator_name}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <TypeBadge type={entry.type} />
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 dark:text-white/60 whitespace-nowrap">
                      {formatDate(entry.date)}
                      {entry.end_date && entry.end_date !== entry.date && (
                        <span className="text-gray-400 dark:text-white/35"> – {formatDate(entry.end_date)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <PaidBadge paid={entry.is_paid} />
                    </td>
                    <td className="px-4 py-3.5 text-gray-500 dark:text-white/40 max-w-[200px] truncate">
                      {entry.notes || <span className="italic text-gray-300 dark:text-white/20">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deleting === entry.id}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                        title="Delete entry"
                      >
                        {deleting === entry.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <LogTimeOffModal
          token={token}
          onSuccess={() => { setShowModal(false); fetchEntries(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attendance Metrics Tab
// ---------------------------------------------------------------------------

function AttendanceTab({ token }: { token: string }) {
  const [metrics, setMetrics] = useState<AttendanceMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/admin/time-off/attendance', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => { if (json.success) setMetrics(json.data ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = metrics.filter(m =>
    !search || m.operator_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-white/40">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500" /> 0–1 callouts (Good)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500" /> 2–3 callouts (Watch)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500" /> 4+ callouts (Action needed)
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/35" />
        <input
          type="text"
          placeholder="Filter by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
        />
      </div>

      <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-white/30">
            <Users className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No operators found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/[0.03]">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide">Operator</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide">PTO Used / Alloc</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide">Callouts YTD</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide">Callouts (Month)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide">Last Callout</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide">Punctuality</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                {filtered.map((m) => (
                  <>
                    <tr
                      key={m.operator_id}
                      className="hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
                      onClick={() => setExpanded(expanded === m.operator_id ? null : m.operator_id)}
                    >
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">{m.operator_name}</p>
                          <p className="text-xs text-gray-400 dark:text-white/35 capitalize">{m.role}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-100 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${Math.min(100, (m.pto_used / Math.max(m.pto_allocated, 1)) * 100)}%` }}
                            />
                          </div>
                          <span className="text-gray-700 dark:text-white/70 text-xs font-medium">
                            {m.pto_used}/{m.pto_allocated}d
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ring-1 ${calloutBadgeBg(m.callouts_year)}`}>
                          {m.callouts_year}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`font-semibold ${calloutColor(m.callouts_month)}`}>
                          {m.callouts_month}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-gray-500 dark:text-white/50 text-xs">
                        {m.last_callout ? formatDate(m.last_callout) : <span className="text-gray-300 dark:text-white/20">None</span>}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          {m.punctuality_pct >= 95 ? (
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                          ) : m.punctuality_pct >= 80 ? (
                            <Minus className="w-3.5 h-3.5 text-amber-500" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                          )}
                          <span className={`text-sm font-semibold ${
                            m.punctuality_pct >= 95 ? 'text-emerald-600 dark:text-emerald-400'
                            : m.punctuality_pct >= 80 ? 'text-amber-600 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400'
                          }`}>
                            {m.punctuality_pct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        {expanded === m.operator_id
                          ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-white/30 ml-auto" />
                          : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-white/30 ml-auto" />}
                      </td>
                    </tr>

                    {/* Expanded history */}
                    {expanded === m.operator_id && (
                      <tr key={`${m.operator_id}-expanded`} className="bg-gray-50/50 dark:bg-white/[0.02]">
                        <td colSpan={7} className="px-5 py-4">
                          <p className="text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide mb-3">
                            Full History — {m.entries.length} {m.entries.length === 1 ? 'entry' : 'entries'}
                          </p>
                          {m.entries.length === 0 ? (
                            <p className="text-xs text-gray-400 dark:text-white/30 italic">No time-off records this year</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {[...m.entries]
                                .sort((a, b) => b.date.localeCompare(a.date))
                                .map((e) => (
                                  <div
                                    key={e.id}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/10 text-xs"
                                  >
                                    <TypeBadge type={e.type} />
                                    <span className="text-gray-600 dark:text-white/60">{formatDate(e.date)}</span>
                                    <PaidBadge paid={e.is_paid} />
                                    {e.notes && <span className="text-gray-400 dark:text-white/30 truncate max-w-[120px]">{e.notes}</span>}
                                  </div>
                                ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TimeOffPage() {
  const [tab, setTab] = useState<'requests' | 'attendance'>('requests');
  const [token, setToken] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    const allowed = ['super_admin', 'operations_manager', 'admin', 'shop_manager'];
    if (!user || !allowed.includes(user.role)) {
      window.location.href = '/dashboard/admin';
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? '');
      setAuthReady(true);
    });
  }, []);

  if (!authReady) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <CalendarOff className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Time Off & Attendance</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-white/50 ml-13">
            Manage PTO, callouts, and per-operator attendance metrics
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg transition-all"
        >
          <Plus className="w-4 h-4" />
          Log Time Off / Callout
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-white/[0.06] rounded-xl w-fit">
        {(['requests', 'attendance'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t
                ? 'bg-white dark:bg-white/10 text-purple-700 dark:text-purple-300 shadow-sm'
                : 'text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/70'
            }`}
          >
            {t === 'requests' ? 'Requests' : 'Attendance Metrics'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'requests' ? (
        <RequestsTab token={token} />
      ) : (
        <AttendanceTab token={token} />
      )}

      {/* Global add modal */}
      {showModal && (
        <LogTimeOffModal
          token={token}
          onSuccess={() => setShowModal(false)}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
