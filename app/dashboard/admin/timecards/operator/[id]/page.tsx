'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Clock, Calendar, ArrowLeft, Users, FileText, CheckCircle,
  ChevronLeft, ChevronRight, Edit, XCircle, Moon, Factory,
  Briefcase, AlertTriangle, TrendingUp, Loader2
} from 'lucide-react';
import { getCurrentUser, isAdmin, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

interface Operator {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface Timecard {
  id: string;
  user_id: string;
  date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  total_hours: number | null;
  is_approved: boolean;
  is_shop_hours: boolean;
  is_night_shift: boolean;
  hour_type: string;
  notes: string | null;
}

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

export default function OperatorTimecardPage() {
  const params = useParams();
  const operatorId = params.id as string;
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [timecards, setTimecards] = useState<Timecard[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTimecard, setSelectedTimecard] = useState<Timecard | null>(null);
  const [editFormData, setEditFormData] = useState({ clock_in_time: '', clock_out_time: '', notes: '' });
  const isRedirecting = useRef(false);

  const { monday, sunday } = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);

  // Auth guard: only admin+ can access
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || !isAdmin()) {
      router.push('/dashboard');
      return;
    }
    setUser(currentUser);
  }, [router]);

  const redirectToLogin = useCallback(() => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    window.location.href = '/login';
  }, []);

  const getSessionToken = useCallback(async (): Promise<string | null> => {
    if (isRedirecting.current) return null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) { redirectToLogin(); return null; }
      return data.session.access_token;
    } catch { redirectToLogin(); return null; }
  }, [redirectToLogin]);

  // Fetch operator profile directly
  const fetchOperator = useCallback(async () => {
    try {
      const token = await getSessionToken();
      if (!token) return;

      // Use admin timecards API to get user info from the timecards_with_users view
      const response = await fetch(`/api/admin/timecards?userId=${operatorId}&limit=1`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.userSummary.length > 0) {
          const summary = result.data.userSummary[0];
          setOperator({
            id: summary.userId,
            full_name: summary.fullName,
            email: summary.email,
            role: summary.role,
          });
        } else {
          // Try the users API as fallback
          const usersRes = await fetch(`/api/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (usersRes.ok) {
            const usersResult = await usersRes.json();
            if (usersResult.success) {
              const found = usersResult.data.find((u: Operator) => u.id === operatorId);
              setOperator(found || null);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching operator:', error);
    }
  }, [operatorId, getSessionToken]);

  const fetchTimecards = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getSessionToken();
      if (!token) return;

      const startDate = monday.toISOString().split('T')[0];
      const endDate = sunday.toISOString().split('T')[0];

      const response = await fetch(
        `/api/admin/timecards?userId=${operatorId}&startDate=${startDate}&endDate=${endDate}&limit=200`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.status === 401) { redirectToLogin(); return; }

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setTimecards(result.data.timecards);
        }
      }
    } catch (error) {
      console.error('Error fetching timecards:', error);
    } finally {
      setLoading(false);
    }
  }, [operatorId, monday, sunday, getSessionToken, redirectToLogin]);

  useEffect(() => {
    if (user) {
      fetchOperator();
      fetchTimecards();
    }
  }, [user, fetchOperator, fetchTimecards]);

  // ── Actions ──────────────────────────────────────────
  const handleApprove = async (timecardId: string) => {
    try {
      const token = await getSessionToken();
      if (!token) return;
      const response = await fetch(`/api/admin/timecards/${timecardId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) { redirectToLogin(); return; }
      if (response.ok) {
        fetchTimecards();
      }
    } catch (error) {
      console.error('Error approving timecard:', error);
    }
  };

  const openEditModal = (tc: Timecard) => {
    setSelectedTimecard(tc);
    setEditFormData({
      clock_in_time: tc.clock_in_time,
      clock_out_time: tc.clock_out_time || '',
      notes: tc.notes || ''
    });
    setShowEditModal(true);
  };

  const handleUpdateTimecard = async () => {
    if (!selectedTimecard) return;
    try {
      const token = await getSessionToken();
      if (!token) return;
      const response = await fetch(`/api/admin/timecards/${selectedTimecard.id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(editFormData)
      });
      if (response.status === 401) { redirectToLogin(); return; }
      if (response.ok) {
        setShowEditModal(false);
        fetchTimecards();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error updating timecard:', error);
      alert('Failed to update timecard');
    }
  };

  // ── Calculate stats (correct per-employee OT) ───────
  const mandatoryOTHours = timecards
    .filter(e => e.hour_type === 'mandatory_overtime')
    .reduce((sum, e) => sum + (e.total_hours || 0), 0);

  const weekdayHours = timecards
    .filter(e => e.hour_type !== 'mandatory_overtime')
    .reduce((sum, e) => sum + (e.total_hours || 0), 0);

  const weeklyOTHours = Math.max(0, weekdayHours - 40);
  const regularHours = Math.min(weekdayHours, 40);
  const totalHours = timecards.reduce((sum, tc) => sum + (tc.total_hours || 0), 0);
  const nightShiftHours = timecards.filter(e => e.is_night_shift).reduce((sum, e) => sum + (e.total_hours || 0), 0);
  const shopHours = timecards.filter(e => e.is_shop_hours).reduce((sum, e) => sum + (e.total_hours || 0), 0);
  const uniqueDays = new Set(timecards.map(e => e.date)).size;
  const approvedCount = timecards.filter(e => e.is_approved).length;
  const pendingCount = timecards.filter(e => !e.is_approved).length;

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const formatTime = (dateString: string) =>
    new Date(dateString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const formatFullDate = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const getEntryBadges = (entry: Timecard) => {
    const badges: { label: string; color: string; icon: React.ReactNode }[] = [];
    if (entry.is_shop_hours) badges.push({ label: 'Shop', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Factory size={10} /> });
    if (entry.is_night_shift) badges.push({ label: 'Night', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: <Moon size={10} /> });
    if (entry.hour_type === 'mandatory_overtime') badges.push({ label: 'Weekend OT', color: 'bg-red-50 text-red-700 border-red-200', icon: <AlertTriangle size={10} /> });
    return badges;
  };

  // ── Loading / not found ─────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-slate-500 text-sm font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/admin/timecards"
              className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">All Timecards</span>
            </Link>
            <div className="h-6 w-px bg-slate-200" />
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm">
                <Clock size={16} className="text-white" />
              </div>
              {operator?.full_name || 'Loading...'}
            </h1>
            {operator && (
              <span className="text-xs text-slate-400 font-medium capitalize hidden sm:inline">
                {operator.role.replace(/_/g, ' ')} &middot; {operator.email}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const mondayStr = monday.toISOString().split('T')[0];
                window.open(`/api/admin/timecards/export?weekStart=${mondayStr}&userId=${operatorId}&format=pdf`, '_blank');
              }}
              className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-blue-700 rounded-lg transition-all text-sm font-medium border border-blue-200 shadow-sm hover:shadow"
            >
              <FileText size={15} />
              <span className="hidden sm:inline">Download PDF</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1280px] mx-auto px-6 py-6">
        {/* ── Week Navigation ───────────────────────────── */}
        <div className="mb-5 flex items-center justify-between">
          <button
            onClick={() => setWeekOffset(weekOffset - 1)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-600 rounded-lg transition-all text-sm font-medium border border-slate-200 shadow-sm hover:shadow"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Prev</span>
          </button>

          <div className="text-center">
            <p className="text-base font-bold text-slate-900">
              {formatFullDate(monday)} &ndash; {formatFullDate(sunday)}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {weekOffset === 0 ? 'Current Week' : `${Math.abs(weekOffset)} ${Math.abs(weekOffset) === 1 ? 'week' : 'weeks'} ago`}
            </p>
          </div>

          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            disabled={weekOffset >= 0}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all text-sm font-medium border shadow-sm ${
              weekOffset >= 0
                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200 hover:shadow'
            }`}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* ── Stats Row ─────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-xl p-5 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-6 translate-x-6" />
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={15} className="text-blue-200" />
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Total Hours</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{totalHours.toFixed(1)}</p>
            <p className="text-[10px] text-blue-300 mt-1">
              {weeklyOTHours > 0
                ? `${weeklyOTHours.toFixed(1)} hrs Mon-Fri OT`
                : `${Math.max(0, 40 - weekdayHours).toFixed(1)} hrs to OT`}
            </p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Regular</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CheckCircle size={15} className="text-emerald-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{regularHours.toFixed(1)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Mon-Fri, up to 40 hrs</p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Days</span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                <Calendar size={15} className="text-purple-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{uniqueDays}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{timecards.length} entries</p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Approved</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${pendingCount > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                <Clock size={15} className={pendingCount > 0 ? 'text-amber-600' : 'text-emerald-600'} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {approvedCount}<span className="text-sm font-normal text-slate-400 ml-1">/ {timecards.length}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {pendingCount > 0 ? `${pendingCount} pending` : 'All approved'}
            </p>
          </div>
        </div>

        {/* ── Category Breakdown ─────────────────────────── */}
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          {[
            { label: 'Regular', value: regularHours.toFixed(1), icon: <CheckCircle size={14} />, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
            { label: 'Weekly OT', value: weeklyOTHours.toFixed(1), icon: <TrendingUp size={14} />, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
            { label: 'Mandatory OT', value: mandatoryOTHours.toFixed(1), icon: <Briefcase size={14} />, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
            { label: 'Night Shift', value: nightShiftHours.toFixed(1), icon: <Moon size={14} />, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
            { label: 'Shop Hours', value: shopHours.toFixed(1), icon: <Factory size={14} />, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
          ].map(({ label, value, icon, color, bg, border }) => (
            <div key={label} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border ${border} ${bg}`}>
              <div className={color}>{icon}</div>
              <div>
                <p className={`text-sm font-bold ${color}`}>{value}<span className="text-[10px] font-normal ml-0.5">hrs</span></p>
                <p className="text-[10px] text-slate-500 font-medium">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── OT Alerts ──────────────────────────────────── */}
        {weeklyOTHours > 0 && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertTriangle size={16} className="text-orange-600 flex-shrink-0" />
            <p className="text-sm text-orange-700">
              <strong>{weeklyOTHours.toFixed(1)} weekly overtime hours</strong> &mdash; Mon-Fri hours exceeded 40.
            </p>
          </div>
        )}

        {mandatoryOTHours > 0 && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <Briefcase size={16} className="text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">
              <strong>{mandatoryOTHours.toFixed(1)} hours</strong> of weekend/mandatory overtime recorded.
            </p>
          </div>
        )}

        {/* ── Timecards Table ────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Time Entries</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {timecards.length} {timecards.length === 1 ? 'entry' : 'entries'} this week
              </p>
            </div>
            {pendingCount > 0 && (
              <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[11px] font-semibold">
                {pendingCount} pending approval
              </span>
            )}
          </div>

          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Loading entries...</p>
            </div>
          ) : timecards.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="text-slate-300" size={28} />
              </div>
              <p className="text-slate-600 font-semibold">No entries this week</p>
              <p className="text-slate-400 text-sm mt-1">
                Time entries will appear here once {operator?.full_name || 'the operator'} clocks in
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Clock In</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Clock Out</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hours</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {timecards.map((entry) => {
                    const badges = getEntryBadges(entry);
                    const isMandatoryOT = entry.hour_type === 'mandatory_overtime';
                    return (
                      <tr
                        key={entry.id}
                        className={`group transition-colors hover:bg-blue-50/40 ${
                          isMandatoryOT ? 'border-l-[3px] border-l-red-400' : 'border-l-[3px] border-l-transparent'
                        }`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm font-medium text-slate-700">{formatDate(entry.date)}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm font-medium text-slate-700 tabular-nums">{formatTime(entry.clock_in_time)}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {entry.clock_out_time ? (
                            <span className="text-sm font-medium text-slate-700 tabular-nums">{formatTime(entry.clock_out_time)}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {entry.total_hours !== null ? (
                            <span className="text-sm font-bold tabular-nums text-slate-800">{entry.total_hours.toFixed(2)}</span>
                          ) : (
                            <span className="text-sm text-slate-300">&mdash;</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {badges.length > 0 ? badges.map((badge, bidx) => (
                              <span key={bidx} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badge.color}`}>
                                {badge.icon}{badge.label}
                              </span>
                            )) : (
                              <span className="text-[10px] text-slate-400 font-medium">Regular</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {entry.is_approved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                              <CheckCircle size={10} />
                              Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                              <Clock size={10} />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditModal(entry)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1"
                            >
                              <Edit size={11} />
                              Edit
                            </button>
                            {!entry.is_approved && (
                              <button
                                onClick={() => handleApprove(entry.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-semibold transition-colors"
                              >
                                Approve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Legend ──────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-2 py-3 text-[11px] text-slate-500">
          {[
            { color: 'bg-emerald-500', label: 'Regular (Mon-Fri, up to 40 hrs)' },
            { color: 'bg-orange-500', label: 'Weekly OT (Mon-Fri over 40 hrs)' },
            { color: 'bg-red-500', label: 'Mandatory OT (Sat/Sun)' },
            { color: 'bg-indigo-500', label: 'Night Shift (clock-in after 3 PM)' },
            { color: 'bg-amber-500', label: 'Shop Hours (in-shop work)' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${color} rounded-full`} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Edit Modal ──────────────────────────────────── */}
      {showEditModal && selectedTimecard && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Edit size={14} className="text-blue-600" />
                  </div>
                  Edit Timecard
                </h3>
                <p className="text-xs text-slate-400 mt-1 ml-9">
                  {operator?.full_name} &middot; {formatDate(selectedTimecard.date)}
                </p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <XCircle size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Clock In Time</label>
                <input
                  type="datetime-local"
                  value={editFormData.clock_in_time ? new Date(editFormData.clock_in_time).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setEditFormData({ ...editFormData, clock_in_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm text-slate-800 bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Clock Out Time</label>
                <input
                  type="datetime-local"
                  value={editFormData.clock_out_time ? new Date(editFormData.clock_out_time).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setEditFormData({ ...editFormData, clock_out_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm text-slate-800 bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
                <textarea
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  rows={3}
                  placeholder="Add any notes..."
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm text-slate-800 bg-white resize-none placeholder-slate-400 transition-all"
                />
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateTimecard}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-semibold text-sm transition-all shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
