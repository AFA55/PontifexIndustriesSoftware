'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Clock, Calendar, ArrowLeft, Users } from 'lucide-react';
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
  clock_in_time: string;
  clock_out_time: string | null;
  total_hours: number | null;
  notes: string | null;
  created_at: string;
}

export default function OperatorTimecardPage() {
  const params = useParams();
  const operatorId = params.id as string;
  const router = useRouter();

  const [operator, setOperator] = useState<Operator | null>(null);
  const [timecards, setTimecards] = useState<Timecard[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOperator();
    fetchTimecards();
  }, [weekOffset, operatorId]);

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

  const { monday, sunday } = getWeekBounds(weekOffset);

  const fetchOperator = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const response = await fetch(`/api/admin/users?role=operator`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const foundOperator = result.data.find((op: Operator) => op.id === operatorId);
          setOperator(foundOperator || null);
        }
      }
    } catch (error) {
      console.error('Error fetching operator:', error);
    }
  };

  const fetchTimecards = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const startDate = monday.toISOString().split('T')[0];
      const endDate = sunday.toISOString().split('T')[0];

      const response = await fetch(
        `/api/admin/timecards?startDate=${startDate}&endDate=${endDate}&limit=1000`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Filter timecards for this specific operator
          const operatorTimecards = result.data.timecards.filter(
            (tc: Timecard) => tc.user_id === operatorId
          );
          setTimecards(operatorTimecards);
        }
      }
    } catch (error) {
      console.error('Error fetching timecards:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Calculate stats
  const totalHours = timecards.reduce((sum, tc) => sum + (tc.total_hours || 0), 0);
  const regularHours = Math.min(totalHours, 40);
  const overtimeHours = Math.max(0, totalHours - 40);
  const daysWorked = timecards.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading timecard...</p>
        </div>
      </div>
    );
  }

  if (!operator) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-lg">Operator not found</p>
          <Link
            href="/dashboard/admin/team-management"
            className="mt-4 inline-block text-blue-600 hover:underline"
          >
            Back to Team Management
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard/admin/team-management"
              className="p-3 bg-white rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
            >
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
                <span className="text-5xl">⏰</span>
                {operator.full_name}'s Timecard
              </h1>
              <p className="text-gray-600 font-medium mt-1">{operator.email}</p>
            </div>
          </div>
          <Link
            href="/dashboard/admin/timecards"
            className="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-medium shadow-lg"
          >
            <Users size={18} />
            View All Team Timecards
          </Link>
        </div>

        {/* Week Navigation */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setWeekOffset(weekOffset - 1)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
            >
              ← Previous Week
            </button>
            <div className="text-center">
              <p className="text-sm text-gray-500 font-medium">Week Of</p>
              <p className="text-xl font-bold text-gray-800">
                {formatDate(monday)} - {formatDate(sunday)}
              </p>
              {weekOffset === 0 && (
                <p className="text-sm text-blue-600 font-medium mt-1">Current Week</p>
              )}
            </div>
            <button
              onClick={() => setWeekOffset(weekOffset + 1)}
              disabled={weekOffset >= 0}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next Week →
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Total Hours</span>
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Clock className="text-blue-600" size={20} />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800">{totalHours.toFixed(1)}</div>
            <div className="text-sm text-gray-500 mt-1">This week</div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Regular Hours</span>
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Clock className="text-green-600" size={20} />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800">{regularHours.toFixed(1)}</div>
            <div className="text-sm text-gray-500 mt-1">Up to 40 hrs</div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Overtime Hours</span>
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <Clock className="text-orange-600" size={20} />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800">{overtimeHours.toFixed(1)}</div>
            <div className="text-sm text-gray-500 mt-1">Over 40 hrs</div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Days Worked</span>
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Calendar className="text-purple-600" size={20} />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800">{daysWorked}</div>
            <div className="text-sm text-gray-500 mt-1">This week</div>
          </div>
        </div>

        {/* Timecards Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Time Entries</h2>
            <p className="text-sm text-gray-500 mt-1">
              {timecards.length} {timecards.length === 1 ? 'entry' : 'entries'} for this week
            </p>
          </div>

          {timecards.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="w-20 h-20 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg font-medium">No time entries for this week</p>
              <p className="text-gray-500 text-sm mt-2">
                Time entries will appear here once {operator.full_name} clocks in
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
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {timecards.map((timecard) => {
                    const clockInDate = new Date(timecard.clock_in_time);
                    const dayOfWeek = clockInDate.toLocaleDateString('en-US', { weekday: 'short' });
                    const dateStr = clockInDate.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    });

                    return (
                      <tr key={timecard.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-bold text-gray-800">{dayOfWeek}</p>
                            <p className="text-xs text-gray-500">{dateStr}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-gray-700">
                            {formatTime(timecard.clock_in_time)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {timecard.clock_out_time ? (
                            <span className="text-sm font-medium text-gray-700">
                              {formatTime(timecard.clock_out_time)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-gray-800">
                            {timecard.total_hours ? `${timecard.total_hours.toFixed(2)} hrs` : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">
                            {timecard.notes || '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
