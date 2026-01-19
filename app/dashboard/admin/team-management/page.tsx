'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clock, Users, Calendar, Eye, User, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Operator {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
}

interface TimecardStats {
  totalHours: number;
  currentWeekHours: number;
  overtimeHours: number;
}

export default function TeamManagementPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [timecardStats, setTimecardStats] = useState<TimecardStats>({
    totalHours: 0,
    currentWeekHours: 0,
    overtimeHours: 0
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchOperators();
    fetchTimecardStats();
  }, []);

  const fetchOperators = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/admin/users?role=operator', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setOperators(result.data);
        }
      }
    } catch (error) {
      console.error('Error fetching operators:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimecardStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get current week bounds
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(monday.getDate() - monday.getDay() + 1);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const response = await fetch(
        `/api/admin/timecards?startDate=${monday.toISOString().split('T')[0]}&endDate=${sunday.toISOString().split('T')[0]}&limit=1000`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const timecards = result.data.timecards;
          const currentWeekHours = timecards.reduce((sum: number, tc: any) => sum + (tc.total_hours || 0), 0);
          const overtimeHours = Math.max(0, currentWeekHours - (40 * operators.length));

          setTimecardStats({
            totalHours: currentWeekHours,
            currentWeekHours,
            overtimeHours
          });
        }
      }
    } catch (error) {
      console.error('Error fetching timecard stats:', error);
    }
  };

  const handleRemoveOperator = async (operator: Operator) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove ${operator.full_name} from the team? This will deactivate their account.`
    );

    if (!confirmed) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/admin/users/${operator.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ active: false })
      });

      if (response.ok) {
        alert(`${operator.full_name} has been removed from the team.`);
        fetchOperators();
      } else {
        const result = await response.json();
        alert(`Failed to remove operator: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error removing operator:', error);
      alert('Failed to remove operator. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading team data...</p>
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
              href="/dashboard/admin"
              className="p-3 bg-white rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
                <span className="text-5xl">👥</span>
                Team Management
              </h1>
              <p className="text-gray-600 font-medium mt-1">Manage team members and view timecards</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Total Operators</span>
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Users className="text-blue-600" size={20} />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800">{operators.length}</div>
            <div className="text-sm text-gray-500 mt-1">Active team members</div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Current Week Hours</span>
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Clock className="text-green-600" size={20} />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800">{timecardStats.currentWeekHours.toFixed(1)}</div>
            <div className="text-sm text-gray-500 mt-1">Total team hours</div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Overtime Hours</span>
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <Calendar className="text-orange-600" size={20} />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800">{timecardStats.overtimeHours.toFixed(1)}</div>
            <div className="text-sm text-gray-500 mt-1">Over 40hrs/week</div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Active Users</span>
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Users className="text-purple-600" size={20} />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800">
              {operators.filter(op => op.active).length}
            </div>
            <div className="text-sm text-gray-500 mt-1">Currently active</div>
          </div>
        </div>

        {/* Operators Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Operators</h2>
            <p className="text-sm text-gray-500 mt-1">{operators.length} team members</p>
          </div>

          {operators.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-20 h-20 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg font-medium">No operators found</p>
              <p className="text-gray-500 text-sm mt-2">
                Approved operators will appear here
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {operators.map((operator) => (
                    <tr key={operator.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-lg font-bold text-blue-600">
                              {operator.full_name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-800">{operator.full_name}</p>
                            <p className="text-xs text-gray-500 capitalize">{operator.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">{operator.email}</span>
                      </td>
                      <td className="px-6 py-4">
                        {operator.active ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/admin/timecards/operator/${operator.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            <Eye size={14} />
                            View Timecard
                          </Link>
                          <Link
                            href="/dashboard/admin/operator-profiles"
                            className="inline-flex items-center gap-1 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            <User size={14} />
                            View Profile
                          </Link>
                          <button
                            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                          >
                            Edit Permissions
                          </button>
                          <button
                            onClick={() => handleRemoveOperator(operator)}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            <Trash2 size={14} />
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Access Link */}
        <div className="mt-6 bg-blue-50 border-2 border-blue-200 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0">
              <Calendar className="text-blue-700" size={20} />
            </div>
            <div className="flex-1">
              <p className="text-blue-800 font-bold text-lg mb-2">View All Team Timecards</p>
              <p className="text-blue-700 font-medium mb-4">
                See all operators' timecards, approve hours, and manage time entries
              </p>
              <Link
                href="/dashboard/admin/timecards"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Calendar size={16} />
                Go to Timecard Management
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
