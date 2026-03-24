'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, logout, type User } from '@/lib/auth';
import {
  ArrowLeft, Clock, Calendar, CheckCircle, AlertTriangle,
  ChevronLeft, ChevronRight, Moon, Factory, Briefcase, TrendingUp
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface TimecardEntry {
  id: string;
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

interface WeekData {
  weekStart: Date;
  weekEnd: Date;
  entries: TimecardEntry[];
  totalHours: number;
  regularHours: number;
  weeklyOvertimeHours: number;
  nightShiftHours: number;
  mandatoryOvertimeHours: number;
  shopHours: number;
  daysWorked: number;
}

function getWeekBounds(offset: number) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...6=Sat
  // On Sunday (day 0), go back 6 days to get Monday; otherwise go back (day-1) days
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

export default function TimecardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [timecards, setTimecards] = useState<TimecardEntry[]>([]);
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const router = useRouter();
  const isRedirecting = useRef(false);

  const redirectToLogin = useCallback(() => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    console.warn('Session expired, redirecting to login...');
    localStorage.removeItem('supabase-user');
    localStorage.removeItem('pontifex-user');
    window.location.href = '/login';
  }, []);

  const { monday, sunday } = useMemo(() => getWeekBounds(currentWeekOffset), [currentWeekOffset]);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    setUser(currentUser);
  }, [router]);

  const fetchTimecards = useCallback(async () => {
    if (isRedirecting.current) return;
    try {
      setLoading(true);

      let session;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          redirectToLogin();
          return;
        }
        session = data.session;
      } catch (err) {
        console.error('Failed to get session:', err);
        redirectToLogin();
        return;
      }

      const url = `/api/timecard/history?startDate=${monday.toISOString().split('T')[0]}&endDate=${sunday.toISOString().split('T')[0]}&limit=100`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const result = await response.json();

      if (result.success) {
        const entries: TimecardEntry[] = result.data.timecards;
        setTimecards(entries);

        const totalHours = entries.reduce((sum, entry) => sum + (entry.total_hours || 0), 0);

        // Mandatory OT = Sat/Sun hours — always overtime, separate from weekly calc
        const mandatoryOvertimeHours = entries
          .filter(e => e.hour_type === 'mandatory_overtime')
          .reduce((sum, e) => sum + (e.total_hours || 0), 0);

        // Mon–Fri hours only (exclude mandatory OT / weekend entries)
        const weekdayHours = entries
          .filter(e => e.hour_type !== 'mandatory_overtime')
          .reduce((sum, e) => sum + (e.total_hours || 0), 0);

        // Weekly OT = Mon–Fri hours beyond 40 (weekends don't count toward this)
        const weeklyOvertimeHours = Math.max(0, weekdayHours - 40);

        // Regular = Mon–Fri hours capped at 40
        const regularHours = Math.min(weekdayHours, 40);

        // Night shift = Mon–Fri job work clocked in at/after 3 PM (not shop)
        const nightShiftHours = entries
          .filter(e => e.is_night_shift)
          .reduce((sum, e) => sum + (e.total_hours || 0), 0);

        const shopHours = entries
          .filter(e => e.is_shop_hours)
          .reduce((sum, e) => sum + (e.total_hours || 0), 0);

        const uniqueDays = new Set(entries.map(e => e.date));

        setWeekData({
          weekStart: monday,
          weekEnd: sunday,
          entries,
          totalHours,
          regularHours,
          weeklyOvertimeHours,
          nightShiftHours,
          mandatoryOvertimeHours,
          shopHours,
          daysWorked: uniqueDays.size,
        });
      }
    } catch (error) {
      console.error('Error fetching timecards:', error);
    } finally {
      setLoading(false);
    }
  }, [monday, sunday, redirectToLogin]);

  useEffect(() => {
    if (user) fetchTimecards();
  }, [user, fetchTimecards]);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const formatTime = (dateString: string) =>
    new Date(dateString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const formatWeekRange = () => {
    const start = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${start} – ${end}`;
  };

  const isCurrentWeek = () => currentWeekOffset === 0;

  const getEntryBadges = (entry: TimecardEntry) => {
    const badges: { label: string; color: string; icon: React.ReactNode }[] = [];
    if (entry.is_shop_hours) badges.push({ label: 'Shop', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Factory size={10} /> });
    if (entry.is_night_shift) badges.push({ label: 'Night', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: <Moon size={10} /> });
    if (entry.hour_type === 'mandatory_overtime') badges.push({ label: 'Weekend OT', color: 'bg-red-50 text-red-700 border-red-200', icon: <AlertTriangle size={10} /> });
    return badges;
  };

  // ── Loading state ────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-slate-500 text-sm font-medium">Loading timecards...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-[1024px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <div className="h-6 w-px bg-slate-200" />
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm">
                <Clock size={16} className="text-white" />
              </div>
              My Timecard
            </h1>
          </div>

          <div className="hidden sm:flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-red-500 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-800 leading-tight">{user?.name}</p>
              <p className="text-[11px] text-slate-400 font-medium capitalize">{user?.role}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1024px] mx-auto px-4 sm:px-6 py-6 pb-28 sm:pb-6">
        {/* ── Week Navigation ───────────────────────────── */}
        <div className="mb-5 flex items-center justify-between gap-2">
          <button
            onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}
            className="flex items-center gap-1.5 px-4 py-3 sm:px-3.5 sm:py-2 bg-white hover:bg-slate-50 text-slate-600 rounded-lg transition-all text-sm font-medium border border-slate-200 shadow-sm hover:shadow min-h-[44px]"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Prev</span>
          </button>

          <div className="text-center flex-1">
            <p className="text-sm sm:text-base font-bold text-slate-900">{formatWeekRange()}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {isCurrentWeek() ? 'Current Week' : `${Math.abs(currentWeekOffset)} ${Math.abs(currentWeekOffset) === 1 ? 'week' : 'weeks'} ago`}
            </p>
          </div>

          <button
            onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
            disabled={isCurrentWeek()}
            className={`flex items-center gap-1.5 px-4 py-3 sm:px-3.5 sm:py-2 rounded-lg transition-all text-sm font-medium border shadow-sm min-h-[44px] ${
              isCurrentWeek()
                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200 hover:shadow'
            }`}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* ── Stats Row ─────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          {/* Total Hours - hero card */}
          <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-xl p-5 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-6 translate-x-6" />
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={15} className="text-blue-200" />
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Total Hours</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{weekData?.totalHours.toFixed(1) || '0.0'}</p>
            <div className="mt-3 h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  (weekData?.weeklyOvertimeHours || 0) > 0 ? 'bg-gradient-to-r from-green-300 via-yellow-300 to-red-400' : 'bg-blue-300'
                }`}
                style={{ width: `${Math.min(((weekData?.totalHours || 0) / 60) * 100, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-blue-300 mt-1">
              {(weekData?.weeklyOvertimeHours || 0) > 0
                ? `${weekData?.weeklyOvertimeHours.toFixed(1)} hrs weekly OT (Mon–Fri)`
                : `${(40 - ((weekData?.totalHours || 0) - (weekData?.mandatoryOvertimeHours || 0))).toFixed(1)} Mon–Fri hrs to OT`}
            </p>
          </div>

          {/* Days Worked */}
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Days</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Calendar size={15} className="text-emerald-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{weekData?.daysWorked || 0}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{weekData?.entries.length || 0} entries</p>
          </div>

          {/* Approval Status */}
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Approved</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <CheckCircle size={15} className="text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {weekData?.entries.filter(e => e.is_approved).length || 0}
              <span className="text-sm font-normal text-slate-400 ml-1">/ {weekData?.entries.length || 0}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {(weekData?.entries.filter(e => !e.is_approved).length || 0) > 0
                ? `${weekData?.entries.filter(e => !e.is_approved).length} pending`
                : 'All approved'}
            </p>
          </div>
        </div>

        {/* ── Category Breakdown ─────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-5">
          {[
            { label: 'Regular', value: (weekData?.regularHours || 0).toFixed(1), icon: <CheckCircle size={14} />, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
            { label: 'Weekly OT', value: (weekData?.weeklyOvertimeHours || 0).toFixed(1), icon: <TrendingUp size={14} />, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
            { label: 'Mandatory OT', value: (weekData?.mandatoryOvertimeHours || 0).toFixed(1), icon: <Briefcase size={14} />, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
            { label: 'Night Shift', value: (weekData?.nightShiftHours || 0).toFixed(1), icon: <Moon size={14} />, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
            { label: 'Shop Hours', value: (weekData?.shopHours || 0).toFixed(1), icon: <Factory size={14} />, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
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
        {weekData && weekData.weeklyOvertimeHours > 0 && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertTriangle size={16} className="text-orange-600 flex-shrink-0" />
            <p className="text-sm text-orange-700">
              <strong>{weekData.weeklyOvertimeHours.toFixed(1)} weekly overtime hours</strong> — Mon–Fri hours exceeded 40.
            </p>
          </div>
        )}

        {weekData && weekData.mandatoryOvertimeHours > 0 && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <Briefcase size={16} className="text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">
              <strong>{weekData.mandatoryOvertimeHours.toFixed(1)} hours</strong> of weekend/mandatory overtime recorded.
            </p>
          </div>
        )}

        {/* ── Daily Entries Table ─────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Daily Entries</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {weekData?.entries.length || 0} {(weekData?.entries.length || 0) === 1 ? 'entry' : 'entries'} this week
            </p>
          </div>

          {loading ? (
            <div className="p-16 text-center">
              <div className="w-10 h-10 mx-auto mb-3 relative">
                <div className="absolute inset-0 rounded-full border-[3px] border-slate-100"></div>
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-blue-600 animate-spin"></div>
              </div>
              <p className="text-slate-400 text-sm">Loading entries...</p>
            </div>
          ) : !weekData || weekData.entries.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="text-slate-300" size={28} />
              </div>
              <p className="text-slate-600 font-semibold">No entries this week</p>
              <p className="text-slate-400 text-sm mt-1">Clock in from the dashboard to start tracking</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-3 sm:px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">In</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Out</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hrs</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Category</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {weekData.entries.map((entry) => {
                    const badges = getEntryBadges(entry);
                    const isMandatoryOT = entry.hour_type === 'mandatory_overtime';
                    return (
                      <tr
                        key={entry.id}
                        className={`group transition-colors hover:bg-blue-50/40 ${
                          isMandatoryOT ? 'border-l-[3px] border-l-red-400' : 'border-l-[3px] border-l-transparent'
                        }`}
                      >
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                          <span className="text-xs sm:text-sm font-medium text-slate-700">{formatDate(entry.date)}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                          <span className="text-xs sm:text-sm font-medium text-slate-700 tabular-nums">{formatTime(entry.clock_in_time)}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                          {entry.clock_out_time ? (
                            <span className="text-xs sm:text-sm font-medium text-slate-700 tabular-nums">{formatTime(entry.clock_out_time)}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                          {entry.total_hours !== null ? (
                            <span className="text-xs sm:text-sm font-bold tabular-nums text-slate-800">
                              {entry.total_hours.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-300">&mdash;</span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
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
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                          {entry.is_approved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                              <CheckCircle size={10} />
                              <span className="hidden sm:inline">Approved</span>
                              <span className="sm:hidden">✓</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                              <Clock size={10} />
                              <span className="hidden sm:inline">Pending</span>
                              <span className="sm:hidden">…</span>
                            </span>
                          )}
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
            { color: 'bg-emerald-500', label: 'Regular (Mon–Fri, up to 40 hrs)' },
            { color: 'bg-orange-500', label: 'Weekly OT (Mon–Fri over 40 hrs)' },
            { color: 'bg-red-500', label: 'Mandatory OT (Sat/Sun — always OT)' },
            { color: 'bg-indigo-500', label: 'Night Shift (job, clock-in ≥ 3 PM)' },
            { color: 'bg-amber-500', label: 'Shop Hours (in-shop work)' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${color} rounded-full`} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
