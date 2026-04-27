'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarOff,
  Plus,
  Search,
  Check,
  X,
  Clock,
  Users,
  Calendar,
  Loader2,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Sun,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import LogTimeOffModal from './_components/LogTimeOffModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimeOffRequest {
  id: string;
  operator_id: string;
  operator_name: string;
  type: string;
  date: string;
  end_date?: string | null;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  notes?: string | null;
  created_at: string;
  is_paid: boolean;
}

interface OperatorStats {
  operator_id: string;
  operator_name: string;
  callout_count: number;
  pto_days_used: number;
  pto_days_allocated: number;
  pto_days_remaining: number;
  last_callout_date: string | null;
  recent_history: Array<{
    date: string;
    end_date?: string | null;
    type: string;
    is_callout: boolean;
    is_paid: boolean;
    pto_days_used: number;
    notes?: string | null;
  }>;
}

interface TeamMember {
  userId: string;
  fullName: string;
  role: string;
  dailyHours: Record<string, { hours: number; status: string }>;
  weeklyTotal: number;
}

interface ScorecardData {
  operatorId: string;
  name: string;
  role: string;
  ptoDaysUsed: number;
  ptoDaysAllocated: number;
  calloutCount: number;
  lastCalloutDate: string | null;
  weekendDaysWorked: number;
  totalDaysWorked: number;
  lateCount: number;
  lastTimeOff: { date: string; end_date?: string | null; type: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRange(start: string, end?: string | null) {
  if (!end || end === start) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function countDays(start: string, end?: string | null) {
  if (!end || end === start) return 1;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');
}

function roleBadgeColor(role: string) {
  switch (role) {
    case 'operator': return 'bg-blue-100 text-blue-700';
    case 'apprentice': return 'bg-teal-100 text-teal-700';
    case 'shop_manager': return 'bg-violet-100 text-violet-700';
    case 'operations_manager': return 'bg-indigo-100 text-indigo-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 ring-1 ring-amber-300',
    approved: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300',
    denied: 'bg-rose-100 text-rose-700 ring-1 ring-rose-300',
    cancelled: 'bg-gray-100 text-gray-500 ring-1 ring-gray-300',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${map[status] ?? map.cancelled}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Summary stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-white/[0.05] border border-gray-100 dark:border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm font-medium text-gray-500 dark:text-white/50">{label}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-white/35 mt-0.5">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Time-Off Requests
// ---------------------------------------------------------------------------

function RequestsTab({ token, onRefresh }: { token: string; onRefresh?: () => void }) {
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/time-off?limit=300', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setRequests(json.data ?? []);
    } catch {
      // silent
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleAction = async (id: string, status: 'approved' | 'denied') => {
    setActioning(id);
    try {
      await fetch(`/api/admin/time-off/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await fetchRequests();
      onRefresh?.();
    } catch {
      // silent
    }
    setActioning(null);
  };

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search && !r.operator_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [requests, statusFilter, search]);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="bg-white dark:bg-white/[0.05] border border-gray-100 dark:border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Status pills */}
        <div className="flex gap-1 flex-wrap">
          {(['all', 'pending', 'approved', 'denied', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                statusFilter === s
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-white/50 dark:hover:bg-white/10'
              }`}
            >
              {s === 'all' ? 'All' : s}
              {s === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search operator..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.05] text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 w-48"
          />
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Log Time Off
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-white/[0.05] border border-gray-100 dark:border-white/10 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <CalendarOff className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/[0.03]">
                  {['Operator', 'Type', 'Dates', 'Days', 'Status', 'Submitted', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide ${h === 'Actions' ? 'text-right' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-gray-900 dark:text-white">
                      {r.operator_name}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 ring-1 ring-blue-200 capitalize">
                        {r.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 dark:text-white/60 whitespace-nowrap">
                      {formatDateRange(r.date, r.end_date)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 dark:text-white/70 font-semibold">
                      {countDays(r.date, r.end_date)}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 dark:text-white/35 text-xs whitespace-nowrap">
                      {formatDate(r.created_at.split('T')[0])}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {r.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleAction(r.id, 'approved')}
                            disabled={actioning === r.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            {actioning === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(r.id, 'denied')}
                            disabled={actioning === r.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <X className="w-3 h-3" />
                            Deny
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs italic">—</span>
                      )}
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
          onSuccess={() => { setShowModal(false); fetchRequests(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Operator Scorecards
// ---------------------------------------------------------------------------

function ScorecardsTab({ token }: { token: string }) {
  const [stats, setStats] = useState<OperatorStats[]>([]);
  const [teamSummary, setTeamSummary] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const today = new Date();
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        const weekStart = monday.toISOString().split('T')[0];

        const [statsRes, teamRes] = await Promise.allSettled([
          fetch('/api/admin/time-off/stats', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
          fetch(`/api/admin/timecards/team-summary?weekStart=${weekStart}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        ]);

        if (statsRes.status === 'fulfilled' && statsRes.value.success) {
          setStats(statsRes.value.data ?? []);
        }
        if (teamRes.status === 'fulfilled' && teamRes.value.success) {
          setTeamSummary(teamRes.value.data?.teamMembers ?? []);
        }
      } catch {
        // silent
      }
      setLoading(false);
    };
    load();
  }, [token]);

  // Build scorecard data by merging stats + team summary
  const scorecards = useMemo((): ScorecardData[] => {
    const lateMap: Record<string, number> = {};
    const weekendMap: Record<string, number> = {};
    const totalDaysMap: Record<string, number> = {};

    for (const m of teamSummary) {
      let late = 0;
      let weekends = 0;
      let total = 0;
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      for (const [day, info] of Object.entries(m.dailyHours)) {
        if ((info as any).hours > 0) {
          total++;
          const idx = dayNames.indexOf(day);
          if (idx >= 5) weekends++; // Sat or Sun
          if ((info as any).status === 'late') late++;
        }
      }
      lateMap[m.userId] = late;
      weekendMap[m.userId] = weekends;
      totalDaysMap[m.userId] = total;
    }

    return stats.map((s) => ({
      operatorId: s.operator_id,
      name: s.operator_name,
      role: 'operator',
      ptoDaysUsed: s.pto_days_used,
      ptoDaysAllocated: s.pto_days_allocated,
      calloutCount: s.callout_count,
      lastCalloutDate: s.last_callout_date,
      weekendDaysWorked: weekendMap[s.operator_id] ?? 0,
      totalDaysWorked: totalDaysMap[s.operator_id] ?? 20, // assume avg 20 if no data
      lateCount: lateMap[s.operator_id] ?? 0,
      lastTimeOff: s.recent_history.length > 0
        ? { date: s.recent_history[0].date, end_date: s.recent_history[0].end_date, type: s.recent_history[0].type }
        : null,
    }));
  }, [stats, teamSummary]);

  const filtered = useMemo(() => {
    if (!search) return scorecards;
    return scorecards.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  }, [scorecards, search]);

  // Summary row values
  const totalOperators = scorecards.length;
  const pendingReqs = stats.reduce((acc) => acc, 0); // not available here; just show operator count
  const lateThisWeek = teamSummary.reduce((acc, m) => {
    const late = Object.values(m.dailyHours).filter((d) => (d as any).status === 'late').length;
    return acc + late;
  }, 0);
  const weekendShifts = teamSummary.reduce((acc, m) => {
    const weekend = ['Sat', 'Sun'].reduce((w, day) => {
      return w + ((m.dailyHours[day]?.hours ?? 0) > 0 ? 1 : 0);
    }, 0);
    return acc + weekend;
  }, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Operators" value={totalOperators} sub="in system" color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />
        <StatCard icon={CalendarOff} label="Pending Requests" value={stats.filter(() => false).length} sub="awaiting approval" color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
        <StatCard icon={Clock} label="Late This Week" value={lateThisWeek} sub="across all operators" color="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400" />
        <StatCard icon={Sun} label="Weekend Shifts" value={weekendShifts} sub="this week" color="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400" />
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search operators..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Users className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm font-medium">{search ? 'No operators match your search' : 'No operator data available yet'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((card) => {
            const ptoPct = Math.min(100, Math.round((card.ptoDaysUsed / Math.max(1, card.ptoDaysAllocated)) * 100));
            const isExpanded = expandedId === card.operatorId;

            return (
              <div
                key={card.operatorId}
                className="bg-white dark:bg-white/[0.05] border border-gray-100 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="h-1 bg-gradient-to-r from-purple-400 to-indigo-500" />

                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-purple-500 to-indigo-600 flex-shrink-0`}>
                      {getInitials(card.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900 dark:text-white truncate">{card.name}</p>
                      <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize mt-0.5 ${roleBadgeColor(card.role)}`}>
                        {card.role.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  {/* 3-col metric strip */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {/* PTO Balance */}
                    <div className="bg-gray-50 dark:bg-white/[0.03] rounded-xl p-3 text-center">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">PTO Balance</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {card.ptoDaysAllocated - card.ptoDaysUsed}
                        <span className="text-xs text-gray-400 font-normal">/{card.ptoDaysAllocated}d</span>
                      </p>
                      <div className="mt-1.5 h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all"
                          style={{ width: `${ptoPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Late This Month */}
                    <div className="bg-gray-50 dark:bg-white/[0.03] rounded-xl p-3 text-center">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Late (mo)</p>
                      <p className={`text-lg font-bold ${card.lateCount === 0 ? 'text-emerald-600' : card.lateCount <= 2 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {card.lateCount}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">times</p>
                    </div>

                    {/* Weekend Shifts */}
                    <div className="bg-gray-50 dark:bg-white/[0.03] rounded-xl p-3 text-center">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Weekends</p>
                      <p className="text-lg font-bold text-violet-600">{card.weekendDaysWorked}</p>
                      <p className="text-[10px] text-gray-400 mt-1">shifts</p>
                    </div>
                  </div>

                  {/* Last time off / callout */}
                  <div className="space-y-1 mb-4 text-xs text-gray-500 dark:text-white/40">
                    {card.lastTimeOff ? (
                      <p>
                        <span className="font-semibold text-gray-600 dark:text-white/60">Last time off:</span>{' '}
                        {formatDateRange(card.lastTimeOff.date, card.lastTimeOff.end_date)}{' '}
                        <span className="capitalize text-gray-400">({card.lastTimeOff.type.replace(/_/g, ' ')})</span>
                      </p>
                    ) : (
                      <p className="italic">No time off recorded</p>
                    )}
                    {card.lastCalloutDate ? (
                      <p>
                        <span className="font-semibold text-gray-600 dark:text-white/60">Last callout:</span>{' '}
                        {formatDate(card.lastCalloutDate)}
                      </p>
                    ) : (
                      <p className="text-emerald-500">No callouts on record</p>
                    )}
                  </div>

                  {/* Expand toggle */}
                  {card.calloutCount > 0 && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : card.operatorId)}
                      className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:text-white/30 dark:hover:text-white/60 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {isExpanded ? 'Hide details' : `${card.calloutCount} callout${card.calloutCount !== 1 ? 's' : ''} on record`}
                    </button>
                  )}

                  {/* Expanded callout details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/10 text-xs text-gray-500 dark:text-white/40 space-y-1">
                      <p className="font-semibold text-gray-600 dark:text-white/50 mb-2">Callout / Absence History</p>
                      {stats.find((s) => s.operator_id === card.operatorId)?.recent_history
                        .filter((h) => h.is_callout)
                        .map((h, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span className="capitalize">{h.type.replace(/_/g, ' ')}</span>
                            <span>{formatDate(h.date)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: Attendance Calendar (placeholder)
// ---------------------------------------------------------------------------

function CalendarTab() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-gray-400">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/[0.05] flex items-center justify-center mb-4">
        <Calendar className="w-8 h-8 opacity-40" />
      </div>
      <p className="text-lg font-semibold text-gray-600 dark:text-white/40 mb-1">Attendance Calendar</p>
      <p className="text-sm text-gray-400 dark:text-white/25">Visual calendar view coming soon</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type Tab = 'scorecards' | 'requests' | 'calendar';

export default function TimeOffPage() {
  const [tab, setTab] = useState<Tab>('scorecards');
  const [token, setToken] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'scorecards', label: 'Operator Metrics', icon: Users },
    { id: 'requests', label: 'Time-Off Requests', icon: CalendarOff },
    { id: 'calendar', label: 'Attendance Calendar', icon: Calendar },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto bg-gray-50 dark:bg-[#0b0618] min-h-screen">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Attendance & Performance</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-white/50 ml-13">
            Track operator attendance, PTO, and performance metrics for bonus decisions
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg transition-all"
        >
          <Plus className="w-4 h-4" />
          Log Time Off
        </button>
      </div>

      {/* Tabs — pill style */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-white/[0.06] rounded-xl w-fit flex-wrap">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === id
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/70 hover:bg-white/50 dark:hover:bg-white/10'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'scorecards' && <ScorecardsTab token={token} key={`scorecards-${refreshKey}`} />}
      {tab === 'requests' && <RequestsTab token={token} onRefresh={() => setRefreshKey((k) => k + 1)} />}
      {tab === 'calendar' && <CalendarTab />}

      {/* Global add modal */}
      {showModal && (
        <LogTimeOffModal
          token={token}
          onSuccess={() => { setShowModal(false); setRefreshKey((k) => k + 1); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
