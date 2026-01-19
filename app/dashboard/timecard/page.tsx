'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, logout, type User } from '@/lib/auth';
import { ArrowLeft, Clock, Calendar, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface TimecardEntry {
  id: string;
  date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  total_hours: number | null;
  is_approved: boolean;
}

interface WeekData {
  weekStart: Date;
  weekEnd: Date;
  entries: TimecardEntry[];
  totalHours: number;
  overtimeHours: number;
}

export default function TimecardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [timecards, setTimecards] = useState<TimecardEntry[]>([]);
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0); // 0 = current week, -1 = last week, etc.
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
    // Get the Monday of the current week
    const monday = new Date(now);
    monday.setDate(monday.getDate() - monday.getDay() + 1 + (offset * 7));
    monday.setHours(0, 0, 0, 0);

    // Get the Sunday of the current week
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
        console.warn('⚠️ No active session found - session may have expired. Redirecting to login...');
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
        const entries = result.data.timecards;
        setTimecards(entries);

        // Calculate week totals
        const totalHours = entries.reduce((sum: number, entry: TimecardEntry) => {
          return sum + (entry.total_hours || 0);
        }, 0);

        const overtimeHours = Math.max(0, totalHours - 40);

        setWeekData({
          weekStart: monday,
          weekEnd: sunday,
          entries,
          totalHours,
          overtimeHours,
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
      year: 'numeric',
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
            Previous Week
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
            Next Week
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Weekly Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {/* Total Hours This Week */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Clock className="text-blue-600" size={24} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-800">
              {weekData?.totalHours.toFixed(1) || '0.0'}
            </p>
            <p className="text-sm text-gray-500">Total Hours This Week</p>
          </div>

          {/* Regular Hours */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="text-green-600" size={24} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-800">
              {Math.min(weekData?.totalHours || 0, 40).toFixed(1)}
            </p>
            <p className="text-sm text-gray-500">Regular Hours</p>
          </div>

          {/* Overtime Hours */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="text-orange-600" size={24} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-800">
              {weekData?.overtimeHours.toFixed(1) || '0.0'}
            </p>
            <p className="text-sm text-gray-500">Overtime Hours</p>
          </div>

          {/* Days Worked */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <Calendar className="text-purple-600" size={24} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-800">
              {weekData?.entries.length || 0}
            </p>
            <p className="text-sm text-gray-500">Days Worked</p>
          </div>
        </div>

        {/* Overtime Alert */}
        {weekData && weekData.overtimeHours > 0 && (
          <div className="mb-6 bg-orange-50 border-2 border-orange-200 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-orange-200 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <AlertTriangle className="text-orange-700" size={20} />
              </div>
              <div>
                <p className="text-orange-800 font-bold text-lg mb-2">Overtime Detected</p>
                <p className="text-orange-700 font-medium">
                  You have worked <strong>{weekData.overtimeHours.toFixed(1)} overtime hours</strong> this week.
                  Hours over 40 per week are considered overtime and may be paid at a different rate according to company policy.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Timecard Entries Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Daily Entries</h2>
            <p className="text-sm text-gray-500 mt-1">
              {weekData?.entries.length || 0} {weekData?.entries.length === 1 ? 'entry' : 'entries'} this week
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
                      Total Hours
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {weekData.entries.map((entry) => (
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
