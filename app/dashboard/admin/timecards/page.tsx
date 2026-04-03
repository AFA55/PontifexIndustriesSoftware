'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin, type User } from '@/lib/auth';
import { useFeatureFlags } from '@/lib/feature-flags';
import {
  ArrowLeft, Clock, CheckCircle, Calendar,
  User as UserIcon, FileText, Download,
  ChevronLeft, ChevronRight, AlertTriangle,
  Search, TrendingUp, Users, Loader2, Shield, Zap,
  Bell, DollarSign, Coffee, Eye, ChevronDown
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────
interface DayInfo {
  hours: number;
  status: 'approved' | 'pending' | 'active' | 'mixed' | 'none';
  entryCount: number;
}

interface TeamMember {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  dailyHours: Record<string, DayInfo>;
  weeklyTotal: number;
  regularHours: number;
  overtimeHours: number;
  breakMinutesTotal: number;
  pendingCount: number;
  approvedCount: number;
  totalEntries: number;
  isClockedIn: boolean;
  hasNoEntries: boolean;
  status: 'all_approved' | 'has_pending' | 'clocked_in' | 'no_entries';
}

interface TeamTotals {
  totalPayrollHours: number;
  totalRegularHours: number;
  totalOvertimeHours: number;
  totalBreakMinutes: number;
  pendingApprovals: number;
  activeClockins: number;
}

// ── Week helpers ──────────────────────────────────────────────
function getWeekBounds(offset: number) {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function formatWeekRange(monday: Date, sunday: Date) {
  const s = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${s} – ${e}`;
}

function formatDateForDay(monday: Date, dayIndex: number) {
  const d = new Date(monday);
  d.setDate(d.getDate() + dayIndex);
  return d.getDate().toString();
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// ── Role display ─────────────────────────────────────────────
function getRoleBadge(role: string) {
  const map: Record<string, { label: string; color: string }> = {
    operator: { label: 'OPR', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    apprentice: { label: 'APR', color: 'bg-teal-100 text-teal-700 border-teal-200' },
    admin: { label: 'ADM', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    shop_manager: { label: 'SHOP', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    operations_manager: { label: 'OPS', color: 'bg-rose-100 text-rose-700 border-rose-200' },
    super_admin: { label: 'SA', color: 'bg-red-100 text-red-700 border-red-200' },
  };
  return map[role] || { label: role.slice(0, 3).toUpperCase(), color: 'bg-slate-100 text-slate-600 border-slate-300' };
}

// ── Day cell color ───────────────────────────────────────────
function getDayCellClasses(info: DayInfo): string {
  if (info.status === 'none') return 'text-gray-400';
  if (info.status === 'active') return 'bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-300';
  if (info.status === 'approved') return 'bg-emerald-50 text-emerald-700';
  if (info.status === 'pending') return 'bg-amber-50 text-amber-700';
  if (info.status === 'mixed') return 'bg-amber-50 text-amber-600';
  return 'text-gray-400';
}

// ══════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════

export default function AdminTimecardsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [totals, setTotals] = useState<TeamTotals>({
    totalPayrollHours: 0, totalRegularHours: 0, totalOvertimeHours: 0,
    totalBreakMinutes: 0, pendingApprovals: 0, activeClockins: 0
  });
  const [weekOffset, setWeekOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkApproving, setBulkApproving] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'no_entries'>('all');
  const router = useRouter();
  const isRedirecting = useRef(false);

  // Feature flags
  const _currentUserForFlags = getCurrentUser();
  const { flags: pageFlags, loading: pageFlagsLoading } = useFeatureFlags(
    _currentUserForFlags?.id ?? null,
    _currentUserForFlags?.role ?? null
  );

  const redirectToLogin = useCallback(() => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    window.location.href = '/login';
  }, []);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || !isAdmin()) { router.push('/dashboard'); return; }
    setUser(currentUser);
  }, [router]);

  // Feature flag guard
  useEffect(() => {
    if (pageFlagsLoading) return;
    const role = _currentUserForFlags?.role ?? '';
    const isBypass = role === 'super_admin' || role === 'operations_manager';
    if (!isBypass && !pageFlags.can_view_timecards) {
      router.push('/dashboard/admin');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageFlagsLoading, pageFlags.can_view_timecards]);

  const { monday, sunday } = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);
  const mondayStr = useMemo(() => monday.toISOString().split('T')[0], [monday]);

  // ── Fetch team summary ─────────────────────────────────────
  const fetchTeamSummary = useCallback(async () => {
    if (isRedirecting.current) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) { redirectToLogin(); return; }

      const response = await fetch(`/api/admin/timecards/team-summary?weekStart=${mondayStr}`, {
        headers: { 'Authorization': `Bearer ${data.session.access_token}` }
      });

      if (response.status === 401) { redirectToLogin(); return; }
      const result = await response.json();

      if (result.success) {
        setTeamMembers(result.data.teamMembers);
        setTotals(result.data.totals);
      }
    } catch (error) {
      console.error('Error fetching team summary:', error);
    } finally {
      setLoading(false);
    }
  }, [mondayStr, redirectToLogin]);

  useEffect(() => {
    if (user) fetchTeamSummary();
  }, [user, fetchTeamSummary]);

  // ── Session token helper ───────────────────────────────────
  const getSessionToken = async (): Promise<string | null> => {
    if (isRedirecting.current) return null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) { redirectToLogin(); return null; }
      return data.session.access_token;
    } catch { redirectToLogin(); return null; }
  };

  // ── Bulk approve all pending ───────────────────────────────
  const handleBulkApproveAll = async () => {
    setBulkApproving(true);
    try {
      const token = await getSessionToken();
      if (!token) return;

      // Fetch all pending timecards for this week
      const startDate = mondayStr;
      const endDate = sunday.toISOString().split('T')[0];
      const res = await fetch(`/api/admin/timecards?limit=500&startDate=${startDate}&endDate=${endDate}&pending=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const result = await res.json();
      if (!result.success) return;

      const pendingCards = result.data.timecards;
      for (const tc of pendingCards) {
        await fetch(`/api/admin/timecards/${tc.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
      }
      fetchTeamSummary();
    } catch (error) {
      console.error('Error bulk approving:', error);
    } finally {
      setBulkApproving(false);
    }
  };

  // ── Bulk approve for single user ───────────────────────────
  const handleApproveUser = async (userId: string) => {
    try {
      const token = await getSessionToken();
      if (!token) return;

      const startDate = mondayStr;
      const endDate = sunday.toISOString().split('T')[0];
      const res = await fetch(`/api/admin/timecards?limit=500&startDate=${startDate}&endDate=${endDate}&pending=true&userId=${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const result = await res.json();
      if (!result.success) return;

      for (const tc of result.data.timecards) {
        await fetch(`/api/admin/timecards/${tc.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
      }
      fetchTeamSummary();
    } catch (error) {
      console.error('Error approving user timecards:', error);
    }
  };

  // ── Export handlers ────────────────────────────────────────
  const handleExportPDF = async () => {
    setExportingPDF(true);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetch(`/api/admin/timecards/export?weekStart=${mondayStr}&format=pdf`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) { console.error('PDF export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timecards_${mondayStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setExportingPDF(false);
    }
  };

  const handleExportCSV = async () => {
    setExportingCSV(true);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetch(`/api/admin/timecards/export?weekStart=${mondayStr}&format=csv`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) { console.error('CSV export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timecards_${mondayStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting CSV:', error);
    } finally {
      setExportingCSV(false);
    }
  };

  // ── Navigate to operator detail ────────────────────────────
  const navigateToOperator = (userId: string) => {
    router.push(`/dashboard/admin/timecards/operator/${userId}?weekStart=${mondayStr}`);
  };

  // ── Filtering ──────────────────────────────────────────────
  const filteredMembers = useMemo(() => {
    let members = teamMembers;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      members = members.filter(m =>
        m.fullName.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
      );
    }

    if (filterStatus === 'pending') {
      members = members.filter(m => m.status === 'has_pending');
    } else if (filterStatus === 'approved') {
      members = members.filter(m => m.status === 'all_approved');
    } else if (filterStatus === 'no_entries') {
      members = members.filter(m => m.status === 'no_entries');
    }

    return members;
  }, [teamMembers, searchQuery, filterStatus]);

  // ── Status counts for filter badges ────────────────────────
  const statusCounts = useMemo(() => {
    let pending = 0, approved = 0, noEntries = 0;
    teamMembers.forEach(m => {
      if (m.status === 'has_pending') pending++;
      else if (m.status === 'all_approved') approved++;
      if (m.hasNoEntries) noEntries++;
    });
    return { pending, approved, noEntries };
  }, [teamMembers]);

  // ── Loading state ──────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-gray-500 text-sm font-medium">Loading payroll overview...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/admin"
              className="flex items-center gap-2 px-3 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Admin</span>
            </Link>
            <div className="h-6 w-px bg-gray-200" />
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center shadow-sm">
                <DollarSign size={16} className="text-white" />
              </div>
              <span className="hidden sm:inline">Team Payroll</span>
              <span className="sm:hidden">Payroll</span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={exportingCSV || teamMembers.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText size={14} />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exportingPDF || teamMembers.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {exportingPDF ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              <span className="hidden sm:inline">PDF</span>
            </button>

            <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-gray-200">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm">
                {user?.name?.charAt(0) || 'A'}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5">
        {/* ── Week Navigation ───────────────────────────── */}
        <div className="mb-5 flex items-center justify-between">
          <button
            onClick={() => setWeekOffset(weekOffset - 1)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg transition-all text-sm font-medium border border-gray-200 shadow-sm"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Prev Week</span>
          </button>

          <div className="text-center">
            <p className="text-base font-bold text-gray-900">{formatWeekRange(monday, sunday)}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {weekOffset === 0 ? 'Current Week' : `${Math.abs(weekOffset)} ${Math.abs(weekOffset) === 1 ? 'week' : 'weeks'} ${weekOffset < 0 ? 'ago' : 'ahead'}`}
            </p>
          </div>

          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            disabled={weekOffset >= 0}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all text-sm font-medium border shadow-sm ${
              weekOffset >= 0
                ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
            }`}
          >
            <span className="hidden sm:inline">Next Week</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* ── Summary Cards ──────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          {/* Total Payroll Hours */}
          <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl p-4 relative overflow-hidden shadow-lg">
            <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-4 translate-x-4" />
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp size={13} className="text-purple-200" />
              <span className="text-[10px] font-bold text-purple-200 uppercase tracking-wider">Total Hours</span>
            </div>
            <p className="text-2xl font-bold text-white tabular-nums">{totals.totalPayrollHours.toFixed(1)}</p>
          </div>

          {/* Regular Hours */}
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle size={13} className="text-emerald-600" />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Regular</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600 tabular-nums">{totals.totalRegularHours.toFixed(1)}</p>
          </div>

          {/* Overtime Hours */}
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle size={13} className="text-orange-600" />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Overtime</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${totals.totalOvertimeHours > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
              {totals.totalOvertimeHours.toFixed(1)}
            </p>
          </div>

          {/* Break Deducted */}
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Coffee size={13} className="text-sky-600" />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Breaks</span>
            </div>
            <p className="text-2xl font-bold text-sky-600 tabular-nums">
              {totals.totalBreakMinutes > 0 ? `${(totals.totalBreakMinutes / 60).toFixed(1)}` : '0.0'}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{totals.totalBreakMinutes} min deducted</p>
          </div>

          {/* Pending Approvals */}
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Clock size={13} className={totals.pendingApprovals > 0 ? 'text-amber-600' : 'text-emerald-600'} />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Pending</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${totals.pendingApprovals > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {totals.pendingApprovals}
            </p>
          </div>

          {/* Active Clock-ins */}
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Zap size={13} className={totals.activeClockins > 0 ? 'text-emerald-600' : 'text-gray-300'} />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Active</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${totals.activeClockins > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
              {totals.activeClockins}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">clocked in now</p>
          </div>
        </div>

        {/* ── Batch Actions Bar ───────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {totals.pendingApprovals > 0 && (
            <button
              onClick={handleBulkApproveAll}
              disabled={bulkApproving}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 shadow-lg shadow-emerald-600/20"
            >
              {bulkApproving ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              Approve All Pending ({totals.pendingApprovals})
            </button>
          )}

          <button
            onClick={handleExportPDF}
            disabled={teamMembers.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 transition-all disabled:opacity-40"
          >
            <Download size={14} />
            Export Week PDF
          </button>

          <button
            onClick={handleExportCSV}
            disabled={teamMembers.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 transition-all disabled:opacity-40"
          >
            <FileText size={14} />
            Export Week CSV
          </button>

          {statusCounts.noEntries > 0 && (
            <button
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-sm font-semibold border border-amber-200 transition-all ml-auto"
              title="Feature placeholder - SMS integration needed"
              onClick={() => alert(`${statusCounts.noEntries} team member(s) have no entries this week. SMS reminders require SMS integration.`)}
            >
              <Bell size={14} />
              Send Reminders ({statusCounts.noEntries})
            </button>
          )}
        </div>

        {/* ── Filters ────────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
            {([
              { key: 'all' as const, label: `All (${teamMembers.length})` },
              { key: 'pending' as const, label: `Pending (${statusCounts.pending})` },
              { key: 'approved' as const, label: `Approved (${statusCounts.approved})` },
              { key: 'no_entries' as const, label: `Missing (${statusCounts.noEntries})` },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  filterStatus === key
                    ? key === 'pending'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : key === 'approved'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : key === 'no_entries'
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'bg-purple-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all shadow-sm"
            />
          </div>

          <div className="hidden lg:flex items-center gap-1 text-[10px] text-gray-500 ml-auto">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300" /> Approved</span>
            <span className="flex items-center gap-1 ml-2"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300" /> Pending</span>
            <span className="flex items-center gap-1 ml-2"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 ring-1 ring-emerald-400" /> Active</span>
            <span className="flex items-center gap-1 ml-2"><span className="w-2.5 h-2.5 rounded-sm bg-gray-100 border border-gray-300" /> No Entry</span>
          </div>
        </div>

        {/* ── Team Table ──────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <div className="w-10 h-10 mx-auto mb-3 relative">
                <div className="absolute inset-0 rounded-full border-[3px] border-gray-200"></div>
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-blue-600 animate-spin"></div>
              </div>
              <p className="text-gray-500 text-sm">Loading team data...</p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="text-gray-300" size={28} />
              </div>
              <p className="text-gray-600 font-semibold">No team members found</p>
              <p className="text-gray-400 text-sm mt-1">
                {searchQuery ? 'Try a different search' : 'No timecards for this period'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[220px]">
                      Team Member
                    </th>
                    {DAY_NAMES.map((day, idx) => (
                      <th key={day} className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[72px]">
                        <div>{day}</div>
                        <div className="text-gray-400 font-normal mt-0.5">{formatDateForDay(monday, idx)}</div>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[80px]">
                      Total
                    </th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[60px]">
                      OT
                    </th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[90px]">
                      Status
                    </th>
                    <th className="px-3 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[140px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMembers.map((member) => {
                    const roleBadge = getRoleBadge(member.role);
                    return (
                      <tr
                        key={member.userId}
                        onClick={() => navigateToOperator(member.userId)}
                        className="group cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        {/* Name + Avatar */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm ${
                              member.isClockedIn
                                ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 ring-2 ring-emerald-500/30'
                                : 'bg-gradient-to-br from-purple-500 to-indigo-600'
                            }`}>
                              {member.fullName?.charAt(0) || '?'}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-semibold text-gray-900 truncate">{member.fullName}</p>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${roleBadge.color}`}>
                                  {roleBadge.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400 truncate">{member.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Day columns */}
                        {DAY_NAMES.map((day) => {
                          const info = member.dailyHours[day];
                          return (
                            <td key={day} className="px-2 py-3 text-center">
                              <div className={`inline-flex items-center justify-center w-12 h-8 rounded-md text-xs font-bold tabular-nums ${getDayCellClasses(info)}`}>
                                {info.hours > 0 ? info.hours.toFixed(1) : info.status === 'active' ? (
                                  <span className="flex items-center gap-0.5">
                                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                  </span>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        {/* Weekly Total */}
                        <td className="px-3 py-3 text-center">
                          <span className={`text-sm font-bold tabular-nums ${
                            member.weeklyTotal > 0 ? 'text-gray-900' : 'text-gray-300'
                          }`}>
                            {member.weeklyTotal > 0 ? member.weeklyTotal.toFixed(1) : '-'}
                          </span>
                        </td>

                        {/* OT */}
                        <td className="px-3 py-3 text-center">
                          {member.overtimeHours > 0 ? (
                            <span className="text-sm font-bold text-orange-600 tabular-nums">
                              {member.overtimeHours.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-300">-</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3 text-center">
                          {member.status === 'clocked_in' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                              Active
                            </span>
                          )}
                          {member.status === 'has_pending' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                              <Clock size={10} />
                              {member.pendingCount}P
                            </span>
                          )}
                          {member.status === 'all_approved' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle size={10} />
                              OK
                            </span>
                          )}
                          {member.status === 'no_entries' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                              <AlertTriangle size={10} />
                              None
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); navigateToOperator(member.userId); }}
                              className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 rounded-md text-[11px] font-semibold border border-gray-200 transition-all"
                            >
                              <Eye size={11} />
                              Detail
                            </button>
                            {member.pendingCount > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleApproveUser(member.userId); }}
                                className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md text-[11px] font-semibold border border-emerald-200 transition-all"
                              >
                                <Shield size={11} />
                                Approve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Footer totals row */}
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50/80">
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold text-gray-500 uppercase">
                        Totals ({filteredMembers.length} members)
                      </span>
                    </td>
                    {DAY_NAMES.map((day) => {
                      const dayTotal = filteredMembers.reduce((sum, m) => sum + (m.dailyHours[day]?.hours || 0), 0);
                      return (
                        <td key={day} className="px-2 py-3 text-center">
                          <span className={`text-xs font-bold tabular-nums ${dayTotal > 0 ? 'text-purple-600' : 'text-gray-300'}`}>
                            {dayTotal > 0 ? dayTotal.toFixed(1) : '-'}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm font-bold text-purple-600 tabular-nums">
                        {filteredMembers.reduce((s, m) => s + m.weeklyTotal, 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm font-bold text-orange-600 tabular-nums">
                        {filteredMembers.reduce((s, m) => s + m.overtimeHours, 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Legend ──────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-2 py-3 text-[11px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
            <span>Approved</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
            <span>Pending Review</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-200 ring-1 ring-emerald-400" />
            <span>Currently Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-100 border border-red-200" />
            <span>No Entries</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300" />
            <span>Has Overtime</span>
          </div>
          <div className="ml-auto text-gray-400">
            Click any row to view detailed breakdown
          </div>
        </div>
      </div>
    </div>
  );
}
