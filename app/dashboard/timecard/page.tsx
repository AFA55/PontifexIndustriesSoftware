'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, logout, type User } from '@/lib/auth';
import { ArrowLeft, Clock, Calendar, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight, Moon, Factory, Briefcase } from 'lucide-react';
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
  hour_type: string; // 'regular' | 'night_shift' | 'mandatory_overtime'
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

export default function TimecardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [timecards, setTimecards] = useState<TimecardEntry[]>([]);
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }

    setUser(currentUser);
    fetchTimecards();
  }, [router, currentWeekOffset]);

  const getWeekBounds = (offset: number) => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(monday.getDate() - monday.getDay() + 1 + (offset * 7));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { monday, sunday };
  };

  const fetchTimecards = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.warn('No active session found. Redirecting to login...');
        localStorage.removeItem('supabase-user');
        localStorage.removeItem('pontifex-user');
        window.location.href = '/login';
        return;
      }

      const { monday, sunday } = getWeekBounds(currentWeekOffset);

      const url = `/api/timecard/history?startDate=${monday.toISOString().split('T')[0]}&endDate=${sunday.toISOString().split('T')[0]}&limit=100`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const result = await response.json();

      if (result.success) {
        const entries: TimecardEntry[] = result.data.timecards;
        setTimecards(entries);

        // Calculate categorized hours
        const totalHours = entries.reduce((sum, entry) => sum + (entry.total_hours || 0), 0);

        // Night shift hours: entries where is_night_shift = true
        const nightShiftHours = entries
          .filter(e => e.is_night_shift)
          .reduce((sum, e) => sum + (e.total_hours || 0), 0);

        // Mandatory overtime hours: entries where hour_type = 'mandatory_overtime' (weekends)
        const mandatoryOvertimeHours = entries
          .filter(e => e.hour_type === 'mandatory_overtime')
          .reduce((sum, e) => sum + (e.total_hours || 0), 0);

        // Shop hours: entries where is_shop_hours = true
        const shopHours = entries
          .filter(e => e.is_shop_hours)
          .reduce((sum, e) => sum + (e.total_hours || 0), 0);

        // Weekly overtime: hours beyond 40 for the week
        const weeklyOvertimeHours = Math.max(0, totalHours - 40);

        // Regular hours: total minus overtime (capped at 40)
        const regularHours = Math.min(totalHours, 40);

        // Unique days worked
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
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatWeekRange = () => {
    if (!weekData) return '';
    const start = weekData.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = weekData.weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${start} - ${end}`;
  };

  const isCurrentWeek = () => currentWeekOffset === 0;

  // Get category badges for an entry
  const getEntryBadges = (entry: TimecardEntry) => {
    const badges: { label: string; color: string; icon: string }[] = [];
    if (entry.is_shop_hours) {
      badges.push({ label: 'Shop', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: '🏭' });
    }
    if (entry.is_night_shift) {
      badges.push({ label: 'Night', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: '🌙' });
    }
    if (entry.hour_type === 'mandatory_overtime') {
      badges.push({ label: 'Weekend OT', color: 'bg-red-100 text-red-800 border-red-200', icon: '⚠️' });
    }
    return badges;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading timecards...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-md">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md font-medium"
              >
                <ArrowLeft size={20} />
                <span>Back</span>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">My Timecard</h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-gray-100 px-4 py-2 rounded-xl">
                <p className="text-sm font-bold text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-600 capitalize font-medium">{user?.role}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Week Navigation */}
        <div className="mb-6 flex items-center justify-between bg-white rounded-2xl p-4 shadow-lg border border-gray-100">
          <button
            onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors font-medium"
          >
            <ChevronLeft size={20} />
            <span className="hidden sm:inline">Previous Week</span>
          </button>

          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{formatWeekRange()}</p>
            <p className="text-sm text-gray-500">
              {isCurrentWeek() ? 'Current Week' : `${Math.abs(currentWeekOffset)} ${Math.abs(currentWeekOffset) === 1 ? 'week' : 'weeks'} ago`}
            </p>
          </div>

          <button
            onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
            disabled={isCurrentWeek()}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors font-medium ${
              isCurrentWeek()
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <span className="hidden sm:inline">Next Week</span>
            <ChevronRight size={20} />
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════
            TOTAL HOURS HERO CARD
            ═══════════════════════════════════════════════════════ */}
        <div className="mb-6 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 rounded-2xl p-6 shadow-xl text-white">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-blue-200 text-sm font-semibold uppercase tracking-wider mb-1">Total Hours This Week</p>
              <p className="text-5xl font-bold">
                {weekData?.totalHours.toFixed(1) || '0.0'}
                <span className="text-2xl text-blue-300 ml-2">hrs</span>
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold">{weekData?.daysWorked || 0}</p>
                <p className="text-xs text-blue-300 font-medium">Days Worked</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold">{weekData?.entries.length || 0}</p>
                <p className="text-xs text-blue-300 font-medium">Entries</p>
              </div>
            </div>
          </div>

          {/* Progress bar: 40 hour target */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-blue-300 mb-1">
              <span>0 hrs</span>
              <span className="font-bold text-white">40 hrs (Regular)</span>
              <span>60 hrs</span>
            </div>
            <div className="h-3 bg-blue-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (weekData?.totalHours || 0) > 40
                    ? 'bg-gradient-to-r from-green-400 via-yellow-400 to-red-500'
                    : 'bg-gradient-to-r from-green-400 to-emerald-500'
                }`}
                style={{ width: `${Math.min(((weekData?.totalHours || 0) / 60) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            CATEGORIZED HOURS BREAKDOWN
            ═══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          {/* Regular Hours */}
          <div className="bg-white rounded-2xl p-5 shadow-lg border-2 border-green-100">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mb-3">
              <CheckCircle className="text-green-600" size={22} />
            </div>
            <p className="text-2xl font-bold text-gray-800">
              {weekData?.regularHours.toFixed(1) || '0.0'}
            </p>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mt-1">Regular</p>
          </div>

          {/* Weekly Overtime (>40 hrs) */}
          <div className={`bg-white rounded-2xl p-5 shadow-lg border-2 ${
            (weekData?.weeklyOvertimeHours || 0) > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-100'
          }`}>
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center mb-3">
              <AlertTriangle className="text-orange-600" size={22} />
            </div>
            <p className="text-2xl font-bold text-gray-800">
              {weekData?.weeklyOvertimeHours.toFixed(1) || '0.0'}
            </p>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mt-1">Weekly OT</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Over 40 hrs</p>
          </div>

          {/* Mandatory Overtime (Weekends) */}
          <div className={`bg-white rounded-2xl p-5 shadow-lg border-2 ${
            (weekData?.mandatoryOvertimeHours || 0) > 0 ? 'border-red-200 bg-red-50' : 'border-gray-100'
          }`}>
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center mb-3">
              <Briefcase className="text-red-600" size={22} />
            </div>
            <p className="text-2xl font-bold text-gray-800">
              {weekData?.mandatoryOvertimeHours.toFixed(1) || '0.0'}
            </p>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mt-1">Mandatory OT</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Sat / Sun</p>
          </div>

          {/* Night Shift Hours */}
          <div className={`bg-white rounded-2xl p-5 shadow-lg border-2 ${
            (weekData?.nightShiftHours || 0) > 0 ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100'
          }`}>
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center mb-3">
              <Moon className="text-indigo-600" size={22} />
            </div>
            <p className="text-2xl font-bold text-gray-800">
              {weekData?.nightShiftHours.toFixed(1) || '0.0'}
            </p>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mt-1">Night Shift</p>
            <p className="text-[10px] text-gray-400 mt-0.5">After 3 PM</p>
          </div>

          {/* Shop Hours */}
          <div className={`bg-white rounded-2xl p-5 shadow-lg border-2 ${
            (weekData?.shopHours || 0) > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-100'
          }`}>
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mb-3">
              <Factory className="text-amber-600" size={22} />
            </div>
            <p className="text-2xl font-bold text-gray-800">
              {weekData?.shopHours.toFixed(1) || '0.0'}
            </p>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mt-1">Shop Hours</p>
            <p className="text-[10px] text-gray-400 mt-0.5">In-shop work</p>
          </div>
        </div>

        {/* Overtime Alert */}
        {weekData && weekData.weeklyOvertimeHours > 0 && (
          <div className="mb-6 bg-orange-50 border-2 border-orange-200 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-orange-200 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <AlertTriangle className="text-orange-700" size={20} />
              </div>
              <div>
                <p className="text-orange-800 font-bold text-lg mb-2">Weekly Overtime Detected</p>
                <p className="text-orange-700 font-medium">
                  You have worked <strong>{weekData.weeklyOvertimeHours.toFixed(1)} overtime hours</strong> this week
                  (beyond 40 regular hours). These hours may be paid at overtime rate per company policy.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mandatory OT Alert */}
        {weekData && weekData.mandatoryOvertimeHours > 0 && (
          <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-200 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <Briefcase className="text-red-700" size={20} />
              </div>
              <div>
                <p className="text-red-800 font-bold text-lg mb-2">Weekend / Mandatory Overtime</p>
                <p className="text-red-700 font-medium">
                  You worked <strong>{weekData.mandatoryOvertimeHours.toFixed(1)} hours</strong> on
                  Saturday or Sunday. These hours are automatically classified as mandatory overtime.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            DAILY ENTRIES TABLE
            ═══════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Daily Entries</h2>
            <p className="text-sm text-gray-500 mt-1">
              {weekData?.entries.length || 0} {(weekData?.entries.length || 0) === 1 ? 'entry' : 'entries'} this week
            </p>
          </div>

          {!weekData || weekData.entries.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="text-gray-400" size={40} />
              </div>
              <p className="text-gray-600 text-lg font-medium">No entries this week</p>
              <p className="text-gray-500 text-sm mt-2">
                Clock in from the dashboard to start tracking your hours
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Clock In
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Clock Out
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Hours
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {weekData.entries.map((entry) => {
                    const badges = getEntryBadges(entry);
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-800">
                              {formatDate(entry.date)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-600">
                            {formatTime(entry.clock_in_time)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {entry.clock_out_time ? (
                            <span className="text-sm text-gray-600">
                              {formatTime(entry.clock_out_time)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {entry.total_hours !== null ? (
                            <span className="text-sm font-semibold text-gray-800">
                              {entry.total_hours.toFixed(2)} hrs
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {badges.length > 0 ? (
                              badges.map((badge, idx) => (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badge.color}`}
                                >
                                  <span className="mr-1">{badge.icon}</span>
                                  {badge.label}
                                </span>
                              ))
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-gray-50 text-gray-600 border-gray-200">
                                Regular
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {entry.is_approved ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle size={12} className="mr-1" />
                              Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <Clock size={12} className="mr-1" />
                              Pending
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

        {/* Legend */}
        <div className="mt-6 bg-white rounded-2xl p-5 shadow-lg border border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Hour Categories</p>
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="text-gray-600 font-medium">Regular (up to 40 hrs/wk)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
              <span className="text-gray-600 font-medium">Weekly OT (over 40 hrs)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-red-500 rounded-full"></span>
              <span className="text-gray-600 font-medium">Mandatory OT (Sat/Sun)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-indigo-500 rounded-full"></span>
              <span className="text-gray-600 font-medium">Night Shift (after 3 PM)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
              <span className="text-gray-600 font-medium">Shop Hours (in-shop work)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
