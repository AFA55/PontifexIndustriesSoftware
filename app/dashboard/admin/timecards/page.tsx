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
  Bell, DollarSign, Coffee, Eye, ChevronDown, Moon, Settings, Save, X,
  Edit2, AlertCircle, Timer, Plus, ClipboardEdit, CheckSquare, XSquare, RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────
interface DayInfo {
  hours: number;
  status: 'approved' | 'pending' | 'active' | 'mixed' | 'none';
  entryCount: number;
  isLate?: boolean;
  lateMinutes?: number;
  firstTimecardId?: string | null;
  firstClockIn?: string | null;
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
  lateArrivalsThisWeek: number;
}

interface CorrectionRequest {
  id: string;
  timecard_id: string;
  requested_by: string;
  worker_name: string;
  worker_role: string;
  timecard_date: string | null;
  current_clock_in: string | null;
  current_clock_out: string | null;
  current_total_hours: number | null;
  requested_clock_in: string | null;
  requested_clock_out: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
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
    supervisor: { label: 'SUP', color: 'bg-violet-100 text-violet-700 border-violet-200' },
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
  const [loadError, setLoadError] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [totals, setTotals] = useState<TeamTotals>({
    totalPayrollHours: 0, totalRegularHours: 0, totalOvertimeHours: 0,
    totalBreakMinutes: 0, pendingApprovals: 0, activeClockins: 0, lateArrivalsThisWeek: 0
  });
  const [weekOffset, setWeekOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkApproving, setBulkApproving] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [showAddTimeModal, setShowAddTimeModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'no_entries'>('all');
  const [showNightShiftSettings, setShowNightShiftSettings] = useState(false);
  const [nightShiftMultiplier, setNightShiftMultiplier] = useState(1.25);
  const [savingNightShiftSettings, setSavingNightShiftSettings] = useState(false);

  // Corrections panel state
  const [showCorrections, setShowCorrections] = useState(false);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [pendingCorrectionCount, setPendingCorrectionCount] = useState(0);
  const [reviewingCorrection, setReviewingCorrection] = useState<string | null>(null);
  const [correctionReviewerNotes, setCorrectionReviewerNotes] = useState('');

  // Edit clock-in modal state
  const [editClockInTarget, setEditClockInTarget] = useState<{ timecardId: string; currentClockIn: string; memberName: string } | null>(null);
  const [editClockInTime, setEditClockInTime] = useState('');
  const [editClockInNotes, setEditClockInNotes] = useState('');
  const [savingClockIn, setSavingClockIn] = useState(false);

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
    if (!currentUser) { router.push('/login'); return; }
    if (!isAdmin()) { router.push('/dashboard'); return; }
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
      setLoadError(false);
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) { redirectToLogin(); return; }

      const response = await fetch(`/api/admin/timecards/team-summary?weekStart=${mondayStr}`, {
        headers: { 'Authorization': `Bearer ${data.session.access_token}` }
      });

      if (response.status === 401) { redirectToLogin(); return; }
      if (!response.ok) { setLoadError(true); return; }
      const result = await response.json();

      if (result.success) {
        setTeamMembers(result.data.teamMembers);
        setTotals(result.data.totals);
      } else {
        setLoadError(true);
      }
    } catch (error) {
      console.error('Error fetching team summary:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [mondayStr, redirectToLogin]);

  useEffect(() => {
    if (user) fetchTeamSummary();
  }, [user, fetchTeamSummary]);

  // ── Load night shift settings ──────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('timecard_settings_v2')
        .select('night_shift_multiplier')
        .limit(1)
        .single();
      if (data?.night_shift_multiplier) {
        setNightShiftMultiplier(Number(data.night_shift_multiplier));
      }
    };
    load().catch(() => {});
  }, []);

  const handleSaveNightShiftSettings = async () => {
    setSavingNightShiftSettings(true);
    try {
      const { data: existing } = await supabase
        .from('timecard_settings_v2')
        .select('id')
        .limit(1)
        .single();

      if (existing?.id) {
        await supabase
          .from('timecard_settings_v2')
          .update({ night_shift_multiplier: nightShiftMultiplier })
          .eq('id', existing.id);
      }
    } catch (err) {
      console.error('Error saving night shift settings:', err);
    } finally {
      setSavingNightShiftSettings(false);
      setShowNightShiftSettings(false);
    }
  };

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

  // ── Edit clock-in time ─────────────────────────────────────
  const handleSaveClockIn = async () => {
    if (!editClockInTarget) return;
    setSavingClockIn(true);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetch(`/api/admin/timecards/${editClockInTarget.timecardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ clock_in_time: editClockInTime, admin_notes: editClockInNotes || undefined }),
      });
      if (res.ok) {
        setEditClockInTarget(null);
        setEditClockInNotes('');
        fetchTeamSummary();
      }
    } catch (error) {
      console.error('Error saving clock-in time:', error);
    } finally {
      setSavingClockIn(false);
    }
  };

  // ── Corrections ────────────────────────────────────────────
  const fetchCorrections = useCallback(async (status = 'pending') => {
    setCorrectionsLoading(true);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetch(`/api/admin/timecards/correction-requests?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const result = await res.json();
      if (result.success) setCorrections(result.data.requests);
    } catch (err) {
      console.error('Error fetching corrections:', err);
    } finally {
      setCorrectionsLoading(false);
    }
  }, []);

  const fetchPendingCorrectionCount = useCallback(async () => {
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetch('/api/admin/timecards/correction-requests?status=pending', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const result = await res.json();
      if (result.success) setPendingCorrectionCount(result.data.requests.length);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    if (user) fetchPendingCorrectionCount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (showCorrections) fetchCorrections('pending');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCorrections]);

  const handleReviewCorrection = async (id: string, action: 'approve' | 'reject') => {
    setReviewingCorrection(id);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetch(`/api/admin/timecards/correction-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, reviewer_notes: correctionReviewerNotes || undefined }),
      });
      if (res.ok) {
        setCorrectionReviewerNotes('');
        fetchCorrections('pending');
        fetchPendingCorrectionCount();
        fetchTeamSummary();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to process correction');
      }
    } catch (err) {
      console.error('Error reviewing correction:', err);
    } finally {
      setReviewingCorrection(null);
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
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
        {/* Skeleton header */}
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0b0618]/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 shadow-sm">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              <div className="h-5 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              <div className="h-9 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </div>
          </div>
        </header>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-5">
          {/* Week nav */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-9 w-9 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </div>
            <div className="h-9 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          </div>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4 shadow-sm">
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
                <div className="h-7 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
          {/* Team table skeleton */}
          <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10 px-4 py-3 grid grid-cols-9 gap-3">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
            {/* Rows */}
            {[...Array(6)].map((_, i) => (
              <div key={i} className="px-4 py-3 border-b border-gray-100 dark:border-white/5 grid grid-cols-9 gap-3 items-center">
                <div className="flex items-center gap-2 col-span-2">
                  <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse flex-shrink-0" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                </div>
                {[...Array(7)].map((_, j) => (
                  <div key={j} className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0b0618]/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/admin"
              className="flex items-center gap-2 px-3 py-1.5 text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-all text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Admin</span>
            </Link>
            <div className="h-6 w-px bg-gray-200 dark:bg-white/10" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center shadow-sm">
                <DollarSign size={16} className="text-white" />
              </div>
              <span className="hidden sm:inline">Team Payroll</span>
              <span className="sm:hidden">Payroll</span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Add Time — admin manual entry (PTO, sick, holiday, manual hours) */}
            <button
              onClick={() => setShowAddTimeModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md shadow-emerald-500/30"
              title="Add manual time entry (PTO, sick, holiday)"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Add Time</span>
            </button>
            <button
              onClick={handleExportCSV}
              disabled={exportingCSV || teamMembers.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-white/80 border border-gray-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText size={14} />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exportingPDF || teamMembers.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-white/80 border border-gray-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {exportingPDF ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              <span className="hidden sm:inline">PDF</span>
            </button>

            <button
              onClick={() => setShowCorrections(true)}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all border ${
                pendingCorrectionCount > 0
                  ? 'bg-violet-600 hover:bg-violet-700 text-white border-violet-600 shadow-md shadow-violet-500/30'
                  : 'bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-white/80 border-gray-200 dark:border-white/10'
              }`}
              title="Time Correction Requests"
            >
              <ClipboardEdit size={14} />
              <span className="hidden sm:inline">Corrections</span>
              {pendingCorrectionCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                  {pendingCorrectionCount > 9 ? '9+' : pendingCorrectionCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowNightShiftSettings(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-white/80 border border-gray-200 dark:border-white/10"
              title="Night Shift Settings"
            >
              <Moon size={14} className="text-purple-500 dark:text-violet-400" />
              <span className="hidden sm:inline">Night Shift</span>
            </button>

            <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-gray-200 dark:border-white/10">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm">
                {user?.name?.charAt(0) || 'A'}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Night Shift Settings Modal ───────────────────────── */}
      {showNightShiftSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a0f35] rounded-2xl shadow-2xl max-w-sm w-full border border-gray-200 dark:border-white/10">
            <div className="p-5 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 dark:bg-violet-500/20 flex items-center justify-center">
                  <Moon size={16} className="text-purple-500 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Night Shift Settings</h3>
                  <p className="text-[10px] text-gray-500 dark:text-white/40">Configure premium pay multiplier</p>
                </div>
              </div>
              <button onClick={() => setShowNightShiftSettings(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors">
                <X size={16} className="text-gray-400 dark:text-white/40" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1.5">
                  Night Shift Multiplier
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1.0"
                    max="3.0"
                    step="0.05"
                    value={nightShiftMultiplier}
                    onChange={(e) => setNightShiftMultiplier(parseFloat(e.target.value) || 1.25)}
                    className="flex-1 px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-violet-500/20 focus:border-purple-400 dark:focus:border-violet-400 text-sm text-gray-900 dark:text-white transition-all"
                  />
                  <span className="text-sm font-bold text-gray-500 dark:text-white/40">×</span>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-white/30 mt-1">
                  Default 1.25 = 25% premium. Range: 1.0 – 3.0. Applied to night shift hours until the 40hr weekly threshold.
                </p>
              </div>

              <div className="px-3 py-2.5 bg-purple-50 dark:bg-violet-500/10 rounded-lg border border-purple-100 dark:border-violet-400/20">
                <p className="text-[10px] text-purple-700 dark:text-violet-300">
                  <strong>40hr Rule:</strong> Once an operator hits 40 total hours for the week, night shift premium stops and standard overtime (1.5×) applies instead.
                </p>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => setShowNightShiftSettings(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-white/80 rounded-lg font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNightShiftSettings}
                  disabled={savingNightShiftSettings}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
                >
                  {savingNightShiftSettings ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5">
        {/* ── Week Navigation ───────────────────────────── */}
        <div className="mb-5 flex items-center justify-between">
          <button
            onClick={() => setWeekOffset(weekOffset - 1)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-white/80 rounded-lg transition-all text-sm font-medium border border-gray-200 dark:border-white/10 shadow-sm"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Prev Week</span>
          </button>

          <div className="text-center">
            <p className="text-base font-bold text-gray-900 dark:text-white">{formatWeekRange(monday, sunday)}</p>
            <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
              {weekOffset === 0 ? 'Current Week' : `${Math.abs(weekOffset)} ${Math.abs(weekOffset) === 1 ? 'week' : 'weeks'} ${weekOffset < 0 ? 'ago' : 'ahead'}`}
            </p>
          </div>

          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            disabled={weekOffset >= 0}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all text-sm font-medium border shadow-sm ${
              weekOffset >= 0
                ? 'bg-gray-50 dark:bg-white/3 text-gray-300 dark:text-white/20 border-gray-100 dark:border-white/5 cursor-not-allowed'
                : 'bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-white/80 border-gray-200 dark:border-white/10'
            }`}
          >
            <span className="hidden sm:inline">Next Week</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* ── Summary Cards ──────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-5">
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
          <div className="bg-white dark:bg-white/5 rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle size={13} className="text-emerald-600 dark:text-emerald-400" />
              <span className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider">Regular</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{totals.totalRegularHours.toFixed(1)}</p>
          </div>

          {/* Overtime Hours */}
          <div className="bg-white dark:bg-white/5 rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle size={13} className="text-orange-600 dark:text-orange-400" />
              <span className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider">Overtime</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${totals.totalOvertimeHours > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-300 dark:text-white/20'}`}>
              {totals.totalOvertimeHours.toFixed(1)}
            </p>
          </div>

          {/* Break Deducted */}
          <div className="bg-white dark:bg-white/5 rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Coffee size={13} className="text-sky-600 dark:text-sky-400" />
              <span className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider">Breaks</span>
            </div>
            <p className="text-2xl font-bold text-sky-600 dark:text-sky-400 tabular-nums">
              {totals.totalBreakMinutes > 0 ? `${(totals.totalBreakMinutes / 60).toFixed(1)}` : '0.0'}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5">{totals.totalBreakMinutes} min deducted</p>
          </div>

          {/* Pending Approvals */}
          <div className="bg-white dark:bg-white/5 rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Clock size={13} className={totals.pendingApprovals > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'} />
              <span className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider">Pending</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${totals.pendingApprovals > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {totals.pendingApprovals}
            </p>
          </div>

          {/* Active Clock-ins */}
          <div className="bg-white dark:bg-white/5 rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Zap size={13} className={totals.activeClockins > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-300 dark:text-white/20'} />
              <span className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider">Active</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${totals.activeClockins > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-300 dark:text-white/20'}`}>
              {totals.activeClockins}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5">clocked in now</p>
          </div>

          {/* Late Arrivals This Week */}
          <div className={`bg-white dark:bg-white/5 rounded-xl p-4 border shadow-sm ${
            (totals.lateArrivalsThisWeek ?? 0) > 2
              ? 'border-red-200 dark:border-red-500/30'
              : 'border-gray-100 dark:border-white/10'
          }`}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Timer size={13} className={
                (totals.lateArrivalsThisWeek ?? 0) === 0
                  ? 'text-gray-300 dark:text-white/20'
                  : (totals.lateArrivalsThisWeek ?? 0) <= 2
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
              } />
              <span className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider">Late</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${
              (totals.lateArrivalsThisWeek ?? 0) === 0
                ? 'text-gray-300 dark:text-white/20'
                : (totals.lateArrivalsThisWeek ?? 0) <= 2
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400'
            }`}>
              {totals.lateArrivalsThisWeek ?? 0}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5">late this week</p>
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
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-white/80 rounded-lg text-sm font-semibold border border-gray-200 dark:border-white/10 transition-all disabled:opacity-40"
          >
            <Download size={14} />
            Export Week PDF
          </button>

          <button
            onClick={handleExportCSV}
            disabled={teamMembers.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-white/80 rounded-lg text-sm font-semibold border border-gray-200 dark:border-white/10 transition-all disabled:opacity-40"
          >
            <FileText size={14} />
            Export Week CSV
          </button>

          {statusCounts.noEntries > 0 && (
            <button
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-semibold border border-amber-200 dark:border-amber-400/30 transition-all ml-auto"
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
          <div className="flex gap-1 bg-white dark:bg-white/5 rounded-lg p-1 border border-gray-200 dark:border-white/10 shadow-sm">
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
                    : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70 hover:bg-gray-50 dark:hover:bg-white/8'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30" />
            <input
              type="text"
              placeholder="Search team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-500/20 focus:border-blue-400 dark:focus:border-violet-400 transition-all shadow-sm"
            />
          </div>

          <div className="hidden lg:flex items-center gap-1 text-[10px] text-gray-500 dark:text-white/40 ml-auto">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-400/30" /> Approved</span>
            <span className="flex items-center gap-1 ml-2"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-400/30" /> Pending</span>
            <span className="flex items-center gap-1 ml-2"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-500/30 ring-1 ring-emerald-400 dark:ring-emerald-400/50" /> Active</span>
            <span className="flex items-center gap-1 ml-2"><span className="w-2.5 h-2.5 rounded-sm bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10" /> No Entry</span>
          </div>
        </div>

        {/* ── Team Table ──────────────────────────────────── */}
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden">
          {loading ? (
            <div className="divide-y divide-gray-100 dark:divide-white/5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                  {[...Array(7)].map((_, j) => (
                    <div key={j} className="h-8 w-14 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse flex-shrink-0" />
                  ))}
                  <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : loadError && teamMembers.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="text-red-500 dark:text-red-400" size={28} />
              </div>
              <p className="text-gray-700 dark:text-red-300 font-semibold mb-1">Couldn&apos;t load team payroll</p>
              <p className="text-gray-400 dark:text-white/40 text-sm mb-5">Check your connection and try again.</p>
              <button
                onClick={fetchTeamSummary}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Try again
              </button>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-gray-50 dark:bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="text-gray-300 dark:text-white/20" size={28} />
              </div>
              <p className="text-gray-600 dark:text-white/60 font-semibold">No team members found</p>
              <p className="text-gray-400 dark:text-white/30 text-sm mt-1">
                {searchQuery ? 'Try a different search' : 'No timecards for this period'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-white/3">
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider w-[220px]">
                      Team Member
                    </th>
                    {DAY_NAMES.map((day, idx) => (
                      <th key={day} className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider w-[72px]">
                        <div>{day}</div>
                        <div className="text-gray-400 dark:text-white/30 font-normal mt-0.5">{formatDateForDay(monday, idx)}</div>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider w-[80px]">
                      Total
                    </th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider w-[60px]">
                      OT
                    </th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider w-[70px]">
                      Late
                    </th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider w-[90px]">
                      Status
                    </th>
                    <th className="px-3 py-3 text-right text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider w-[140px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {filteredMembers.map((member) => {
                    const roleBadge = getRoleBadge(member.role);
                    return (
                      <tr
                        key={member.userId}
                        onClick={() => navigateToOperator(member.userId)}
                        className="group cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
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
                                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{member.fullName}</p>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${roleBadge.color} dark:bg-white/10 dark:border-white/10 dark:text-white/70`}>
                                  {roleBadge.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400 dark:text-white/30 truncate">{member.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Day columns */}
                        {DAY_NAMES.map((day) => {
                          const info = member.dailyHours[day];
                          return (
                            <td key={day} className="px-2 py-3 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <div className={`inline-flex items-center justify-center w-12 h-8 rounded-md text-xs font-bold tabular-nums ${getDayCellClasses(info)}`}>
                                  {info.hours > 0 ? info.hours.toFixed(1) : info.status === 'active' ? (
                                    <span className="flex items-center gap-0.5">
                                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </div>
                                {info.isLate && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 rounded text-[9px] font-bold border border-red-200 dark:border-red-500/30">
                                    ⏰ {info.lateMinutes}m late
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        {/* Weekly Total */}
                        <td className="px-3 py-3 text-center">
                          <span className={`text-sm font-bold tabular-nums ${
                            member.weeklyTotal > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-white/20'
                          }`}>
                            {member.weeklyTotal > 0 ? member.weeklyTotal.toFixed(1) : '-'}
                          </span>
                        </td>

                        {/* OT */}
                        <td className="px-3 py-3 text-center">
                          {member.overtimeHours > 0 ? (
                            <span className="text-sm font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                              {member.overtimeHours.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-300 dark:text-white/20">-</span>
                          )}
                        </td>

                        {/* Punctuality — late days this week */}
                        <td className="px-3 py-3 text-center">
                          {(() => {
                            const lateDays = DAY_NAMES.filter(d => member.dailyHours[d]?.isLate).length;
                            if (lateDays === 0) return <span className="text-sm text-gray-300 dark:text-white/20">-</span>;
                            return (
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                lateDays >= 3
                                  ? 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30'
                                  : 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                              }`}>
                                <Timer size={9} />
                                {lateDays}d
                              </span>
                            );
                          })()}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3 text-center">
                          {member.status === 'clocked_in' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-400/30">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                              Active
                            </span>
                          )}
                          {member.status === 'has_pending' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-400/30">
                              <Clock size={10} />
                              {member.pendingCount}P
                            </span>
                          )}
                          {member.status === 'all_approved' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-400/20">
                              <CheckCircle size={10} />
                              OK
                            </span>
                          )}
                          {member.status === 'no_entries' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-400/30">
                              <AlertTriangle size={10} />
                              None
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            {/* Detail button removed — entire row is already clickable (see row's onClick).
                                Click-anywhere-on-row navigates to operator detail. The legacy quick-Edit
                                button is also removed; admins now edit from inside the detail page where
                                the day-cell edit affordance is bigger and clearer. */}
                            <button
                              onClick={(e) => { e.stopPropagation(); navigateToOperator(member.userId); }}
                              className="flex items-center gap-1 px-2 py-1 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white rounded-md text-[11px] font-semibold border border-gray-200 dark:border-white/10 transition-all"
                              aria-label="Open detail"
                            >
                              <Eye size={11} />
                              View
                            </button>
                            {member.pendingCount > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleApproveUser(member.userId); }}
                                className="flex items-center gap-1 px-2 py-1 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-md text-[11px] font-semibold border border-emerald-200 dark:border-emerald-400/30 transition-all"
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
                  <tr className="border-t border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-white/3">
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase">
                        Totals ({filteredMembers.length} members)
                      </span>
                    </td>
                    {DAY_NAMES.map((day) => {
                      const dayTotal = filteredMembers.reduce((sum, m) => sum + (m.dailyHours[day]?.hours || 0), 0);
                      return (
                        <td key={day} className="px-2 py-3 text-center">
                          <span className={`text-xs font-bold tabular-nums ${dayTotal > 0 ? 'text-purple-600 dark:text-violet-400' : 'text-gray-300 dark:text-white/20'}`}>
                            {dayTotal > 0 ? dayTotal.toFixed(1) : '-'}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm font-bold text-purple-600 dark:text-violet-400 tabular-nums">
                        {filteredMembers.reduce((s, m) => s + m.weeklyTotal, 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                        {filteredMembers.reduce((s, m) => s + m.overtimeHours, 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {(() => {
                        const totalLate = filteredMembers.reduce((s, m) => s + DAY_NAMES.filter(d => m.dailyHours[d]?.isLate).length, 0);
                        return totalLate > 0 ? (
                          <span className="text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">{totalLate}d</span>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-white/20">-</span>
                        );
                      })()}
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
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-2 py-3 text-[11px] text-gray-500 dark:text-white/40">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-400/30" />
            <span>Approved</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-400/30" />
            <span>Pending Review</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-200 dark:bg-emerald-500/30 ring-1 ring-emerald-400 dark:ring-emerald-400/50" />
            <span>Currently Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-100 dark:bg-red-500/15 border border-red-200 dark:border-red-400/30" />
            <span>No Entries</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-orange-100 dark:bg-orange-500/15 border border-orange-300 dark:border-orange-400/30" />
            <span>Has Overtime</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Timer size={11} className="text-red-500" />
            <span>Late column = days clocked in late this week</span>
          </div>
          <div className="ml-auto text-gray-400 dark:text-white/30">
            Click any row to view detailed breakdown
          </div>
        </div>
      </div>

      {/* ── Corrections Panel ───────────────────────────── */}
      {showCorrections && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-end" onClick={() => setShowCorrections(false)}>
          <div
            className="bg-white dark:bg-[#130b2a] h-full w-full max-w-lg shadow-2xl border-l border-gray-200 dark:border-white/10 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel Header */}
            <div className="px-5 py-4 border-b border-gray-200 dark:border-white/10 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center">
                  <ClipboardEdit size={15} className="text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Time Correction Requests</h2>
                  <p className="text-[10px] text-gray-500 dark:text-white/40">
                    {corrections.length} pending
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCorrections(false)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={16} className="text-gray-400 dark:text-white/40" />
              </button>
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {correctionsLoading ? (
                <div className="py-16 text-center">
                  <Loader2 className="w-8 h-8 mx-auto animate-spin text-violet-600 mb-3" />
                  <p className="text-sm text-gray-500 dark:text-white/40">Loading requests...</p>
                </div>
              ) : corrections.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 bg-gray-50 dark:bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <CheckCircle size={24} className="text-emerald-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-white/70">All caught up!</p>
                  <p className="text-xs text-gray-400 dark:text-white/30 mt-1">No pending correction requests.</p>
                </div>
              ) : (
                corrections.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-3 shadow-sm"
                  >
                    {/* Worker + Date */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{req.worker_name}</p>
                        <p className="text-[11px] text-gray-400 dark:text-white/40 capitalize">{req.worker_role}</p>
                      </div>
                      <span className="text-[10px] font-semibold text-gray-500 dark:text-white/50 bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {req.timecard_date
                          ? new Date(req.timecard_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                          : 'Unknown date'}
                      </span>
                    </div>

                    {/* Time comparison grid */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-2.5 border border-gray-100 dark:border-white/10">
                        <p className="text-gray-400 dark:text-white/40 font-semibold uppercase tracking-wider mb-1">Current</p>
                        <p className="text-gray-700 dark:text-white/80">
                          In: <span className="font-mono font-semibold">
                            {req.current_clock_in
                              ? new Date(req.current_clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </span>
                        </p>
                        <p className="text-gray-700 dark:text-white/80 mt-0.5">
                          Out: <span className="font-mono font-semibold">
                            {req.current_clock_out
                              ? new Date(req.current_clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </span>
                        </p>
                      </div>
                      <div className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-2.5 border border-violet-100 dark:border-violet-700/30">
                        <p className="text-violet-600 dark:text-violet-400 font-semibold uppercase tracking-wider mb-1">Requested</p>
                        <p className="text-violet-700 dark:text-violet-300">
                          In: <span className="font-mono font-semibold">
                            {req.requested_clock_in
                              ? new Date(req.requested_clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                              : <span className="text-gray-400 dark:text-white/30">no change</span>}
                          </span>
                        </p>
                        <p className="text-violet-700 dark:text-violet-300 mt-0.5">
                          Out: <span className="font-mono font-semibold">
                            {req.requested_clock_out
                              ? new Date(req.requested_clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                              : <span className="text-gray-400 dark:text-white/30">no change</span>}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/15 rounded-lg border border-amber-100 dark:border-amber-700/30">
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider mb-0.5">Reason</p>
                      <p className="text-xs text-amber-800 dark:text-amber-200">{req.reason}</p>
                    </div>

                    {/* Reviewer notes input */}
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wider mb-1">
                        Notes to worker (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Approved — matched supervisor report"
                        className="w-full px-3 py-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
                        onFocus={() => setCorrectionReviewerNotes('')}
                        onChange={(e) => setCorrectionReviewerNotes(e.target.value)}
                      />
                    </div>

                    {/* Approve / Reject buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReviewCorrection(req.id, 'approve')}
                        disabled={reviewingCorrection === req.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 shadow-sm shadow-emerald-500/20"
                      >
                        {reviewingCorrection === req.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckSquare size={12} />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() => handleReviewCorrection(req.id, 'reject')}
                        disabled={reviewingCorrection === req.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-xs font-bold border border-red-200 dark:border-red-700/40 transition-all disabled:opacity-50"
                      >
                        {reviewingCorrection === req.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <XSquare size={12} />
                        )}
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Clock-In Modal ──────────────────────────── */}
      {editClockInTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditClockInTarget(null)}>
          <div className="bg-white dark:bg-[#1a0f35] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                  <Edit2 size={16} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">Correct Clock-In Time</h3>
                  <p className="text-[11px] text-gray-500 dark:text-white/40">{editClockInTarget.memberName}</p>
                </div>
              </div>
              <button onClick={() => setEditClockInTarget(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors">
                <X size={16} className="text-gray-400 dark:text-white/40" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1.5">
                  Clock-In Time
                </label>
                <input
                  type="datetime-local"
                  value={editClockInTime}
                  onChange={(e) => setEditClockInTime(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 dark:focus:border-blue-400 text-sm text-gray-900 dark:text-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1.5">
                  Admin Notes <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={editClockInNotes}
                  onChange={(e) => setEditClockInNotes(e.target.value)}
                  placeholder="Reason for correction..."
                  rows={2}
                  className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 dark:focus:border-blue-400 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 resize-none transition-all"
                />
              </div>

              <div className="flex items-center gap-2 pt-1 px-3 py-2.5 bg-amber-50 dark:bg-amber-500/10 rounded-lg border border-amber-100 dark:border-amber-400/20">
                <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-[10px] text-amber-700 dark:text-amber-300">This change will be logged. The operator will see the corrected time.</p>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setEditClockInTarget(null)}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-white/80 rounded-lg font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveClockIn}
                  disabled={savingClockIn || !editClockInTime}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
                >
                  {savingClockIn ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddTimeModal && (
        <AddTimeModal
          teamMembers={teamMembers}
          onClose={() => setShowAddTimeModal(false)}
          onSuccess={() => {
            setShowAddTimeModal(false);
            void fetchTeamSummary();
          }}
        />
      )}
    </div>
  );
}

// ─── Add Time modal ─────────────────────────────────────────────────────────
function AddTimeModal({
  teamMembers, onClose, onSuccess,
}: {
  teamMembers: TeamMember[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState<'pto' | 'sick' | 'holiday' | 'manual' | 'admin_adjustment'>('pto');
  const [hours, setHours] = useState('8');
  const [startTime, setStartTime] = useState('08:00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!userId) { setError('Pick an employee.'); return; }
    const hoursNum = parseFloat(hours);
    if (!Number.isFinite(hoursNum) || hoursNum < 0.25 || hoursNum > 16) {
      setError('Hours must be between 0.25 and 16.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired.'); return; }
      const res = await fetch('/api/admin/timecards/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          user_id: userId,
          date,
          entry_type: entryType,
          hours: hoursNum,
          start_time: startTime,
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || j.details || 'Failed to add entry.');
        return;
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to add entry.');
    } finally {
      setSubmitting(false);
    }
  }

  const ENTRY_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    pto:               { label: 'Paid Time Off (PTO)', color: 'from-emerald-500 to-teal-600' },
    sick:              { label: 'Sick Day',            color: 'from-rose-500 to-pink-600' },
    holiday:           { label: 'Paid Holiday',        color: 'from-amber-500 to-orange-600' },
    manual:            { label: 'Worked (manual)',     color: 'from-blue-500 to-indigo-600' },
    admin_adjustment:  { label: 'Adjustment',          color: 'from-violet-500 to-purple-600' },
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-800 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className={`px-5 py-4 bg-gradient-to-br ${ENTRY_TYPE_LABELS[entryType].color} text-white sticky top-0 flex items-center justify-between`}>
          <div>
            <h3 className="text-lg font-bold">Add Time</h3>
            <p className="text-xs text-white/80 mt-0.5">For PTO, sick, holiday, or manual hours</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Employee</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Select employee…</option>
              {teamMembers.map((m) => (
                <option key={m.userId} value={m.userId}>{m.fullName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(ENTRY_TYPE_LABELS) as Array<keyof typeof ENTRY_TYPE_LABELS>).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEntryType(t as any)}
                  className={`text-left px-3 py-2 rounded-lg border-2 text-xs font-semibold transition ${
                    entryType === t
                      ? `border-transparent text-white bg-gradient-to-br ${ENTRY_TYPE_LABELS[t].color}`
                      : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:border-emerald-300'
                  }`}
                >
                  {ENTRY_TYPE_LABELS[t].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Hours</label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="16"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:ring-2 focus:ring-emerald-500 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Start time (optional)</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[10px] text-gray-500 mt-1">Defaults to 08:00. Sets clock-in time on the entry.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Reason / context"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {entryType === 'pto' && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 p-3 text-xs text-emerald-700 dark:text-emerald-300">
              💡 PTO entries also bump <code className="font-mono">operator_pto_balance.pto_days_used</code> by {(parseFloat(hours) / 8).toFixed(2)} day(s).
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{error}</div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-end gap-2 sticky bottom-0 bg-white dark:bg-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !userId}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 shadow-md shadow-emerald-500/30"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Plus className="w-4 h-4" /> Add Entry</>}
          </button>
        </div>
      </div>
    </div>
  );
}
