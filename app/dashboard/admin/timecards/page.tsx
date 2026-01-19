'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin, type User } from '@/lib/auth';
import { ArrowLeft, Clock, MapPin, CheckCircle, XCircle, Calendar, User as UserIcon, ExternalLink, Edit } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getGoogleMapsLink } from '@/lib/geolocation';

interface TimecardWithUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  total_hours: number | null;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
  is_approved: boolean;
  notes: string | null;
}

export default function AdminTimecardsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [timecards, setTimecards] = useState<TimecardWithUser[]>([]);
  const [selectedTimecard, setSelectedTimecard] = useState<TimecardWithUser | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    clock_in_time: '',
    clock_out_time: '',
    notes: ''
  });
  const [filterPeriod, setFilterPeriod] = useState<'week' | 'month' | 'all'>('week');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved'>('all');
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || !isAdmin()) {
      router.push('/dashboard');
      return;
    }

    setUser(currentUser);
    fetchTimecards();
  }, [router, filterPeriod, filterStatus]);

  const fetchTimecards = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Calculate date range
      const now = new Date();
      let startDate = '';

      if (filterPeriod === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString().split('T')[0];
      } else if (filterPeriod === 'month') {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = monthAgo.toISOString().split('T')[0];
      }

      let url = '/api/admin/timecards?limit=200';
      if (startDate) url += `&startDate=${startDate}`;
      if (filterStatus === 'pending') url += '&pending=true';

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const result = await response.json();

      if (result.success) {
        let cards = result.data.timecards;

        // Filter by approval status
        if (filterStatus === 'approved') {
          cards = cards.filter((tc: TimecardWithUser) => tc.is_approved);
        } else if (filterStatus === 'pending') {
          cards = cards.filter((tc: TimecardWithUser) => !tc.is_approved);
        }

        setTimecards(cards);
      }
    } catch (error) {
      console.error('Error fetching timecards:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (timecardId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/admin/timecards/${timecardId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        fetchTimecards(); // Refresh
        alert('Timecard approved successfully!');
      }
    } catch (error) {
      console.error('Error approving timecard:', error);
    }
  };

  const openEditModal = (timecard: TimecardWithUser) => {
    setSelectedTimecard(timecard);
    setEditFormData({
      clock_in_time: timecard.clock_in_time,
      clock_out_time: timecard.clock_out_time || '',
      notes: timecard.notes || ''
    });
    setShowEditModal(true);
  };

  const handleUpdateTimecard = async () => {
    if (!selectedTimecard) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/admin/timecards/${selectedTimecard.id}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(editFormData)
      });

      if (response.ok) {
        setShowEditModal(false);
        fetchTimecards(); // Refresh
        alert('Timecard updated successfully!');
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error updating timecard:', error);
      alert('Failed to update timecard');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOvertime = (hours: number | null) => hours !== null && hours > 8;

  const totalHours = timecards.reduce((sum, tc) => sum + (tc.total_hours || 0), 0);
  const pendingCount = timecards.filter(tc => !tc.is_approved).length;
  const overtimeCount = timecards.filter(tc => isOvertime(tc.total_hours)).length;

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
      <div className="bg-white border-b-2 border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md font-medium"
              >
                <ArrowLeft size={20} />
                <span>Back to Admin</span>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Timecard Management</h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-gray-100 px-4 py-2 rounded-xl">
                <p className="text-sm font-bold text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-700 capitalize font-medium">Admin</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-2">
              <Clock className="text-blue-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{totalHours.toFixed(1)}</p>
            <p className="text-sm text-gray-500">Total Hours</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center mb-2">
              <Clock className="text-yellow-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{pendingCount}</p>
            <p className="text-sm text-gray-500">Pending Approval</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-2">
              <Clock className="text-orange-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{overtimeCount}</p>
            <p className="text-sm text-gray-500">Overtime Shifts</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-2">
              <UserIcon className="text-green-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{timecards.length}</p>
            <p className="text-sm text-gray-500">Total Entries</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilterPeriod('week')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                filterPeriod === 'week' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setFilterPeriod('month')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                filterPeriod === 'month' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Last 30 Days
            </button>
            <button
              onClick={() => setFilterPeriod('all')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                filterPeriod === 'all' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              All Time
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                filterStatus === 'all' ? 'bg-purple-600 text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              All Status
            </button>
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                filterStatus === 'pending' ? 'bg-purple-600 text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Pending Only
            </button>
            <button
              onClick={() => setFilterStatus('approved')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                filterStatus === 'approved' ? 'bg-purple-600 text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Approved Only
            </button>
          </div>
        </div>

        {/* Timecards Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">All Employee Timecards</h2>
            <p className="text-sm text-gray-500 mt-1">{timecards.length} entries found</p>
          </div>

          {timecards.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="w-20 h-20 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg font-medium">No timecards found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Employee</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Clock In</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Clock Out</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Total Hours</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Location</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {timecards.map((entry) => (
                    <tr key={entry.id} className={`hover:bg-gray-50 transition-colors ${isOvertime(entry.total_hours) ? 'bg-orange-50' : ''}`}>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-bold text-gray-800">{entry.full_name}</p>
                          <p className="text-xs text-gray-500">{entry.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-gray-400" />
                          <span className="text-sm text-gray-600">{formatDate(entry.date)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatTime(entry.clock_in_time)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {entry.clock_out_time ? (
                          <span className="text-sm text-gray-600">{formatTime(entry.clock_out_time)}</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {entry.total_hours !== null ? (
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold ${isOvertime(entry.total_hours) ? 'text-orange-600' : 'text-gray-800'}`}>
                              {entry.total_hours.toFixed(2)} hrs
                            </span>
                            {isOvertime(entry.total_hours) && (
                              <span className="px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800">OT</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {entry.clock_in_latitude && entry.clock_in_longitude ? (
                          <button
                            onClick={() => {
                              setSelectedTimecard(entry);
                              setShowMapModal(true);
                            }}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors text-sm font-medium"
                          >
                            <MapPin size={14} />
                            View Map
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">No location</span>
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
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(entry)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                          >
                            <Edit size={14} />
                            Edit
                          </button>
                          {!entry.is_approved && (
                            <button
                              onClick={() => handleApprove(entry.id)}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedTimecard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Edit Timecard</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedTimecard.full_name} - {formatDate(selectedTimecard.date)}
                </p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <XCircle size={24} className="text-gray-600" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Clock In Time */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Clock In Time
                </label>
                <input
                  type="datetime-local"
                  value={editFormData.clock_in_time ? new Date(editFormData.clock_in_time).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    clock_in_time: e.target.value ? new Date(e.target.value).toISOString() : ''
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Clock Out Time */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Clock Out Time
                </label>
                <input
                  type="datetime-local"
                  value={editFormData.clock_out_time ? new Date(editFormData.clock_out_time).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    clock_out_time: e.target.value ? new Date(e.target.value).toISOString() : ''
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    notes: e.target.value
                  })}
                  rows={3}
                  placeholder="Add any notes about this timecard..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateTimecard}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map Modal */}
      {showMapModal && selectedTimecard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Clock In/Out Locations</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedTimecard.full_name} - {formatDate(selectedTimecard.date)}
                </p>
              </div>
              <button
                onClick={() => setShowMapModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <XCircle size={24} className="text-gray-600" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Clock In Location */}
              {selectedTimecard.clock_in_latitude && selectedTimecard.clock_in_longitude && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <MapPin size={16} className="text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">Clock In Location</p>
                      <p className="text-sm text-gray-600">{formatTime(selectedTimecard.clock_in_time)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">
                    📍 {selectedTimecard.clock_in_latitude.toFixed(6)}, {selectedTimecard.clock_in_longitude.toFixed(6)}
                  </p>

                  {/* Google Maps removed - will add back later */}

                  <a
                    href={getGoogleMapsLink(selectedTimecard.clock_in_latitude, selectedTimecard.clock_in_longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    <ExternalLink size={16} />
                    Open in Google Maps
                  </a>
                </div>
              )}

              {/* Clock Out Location */}
              {selectedTimecard.clock_out_latitude && selectedTimecard.clock_out_longitude && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                      <MapPin size={16} className="text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">Clock Out Location</p>
                      <p className="text-sm text-gray-600">
                        {selectedTimecard.clock_out_time ? formatTime(selectedTimecard.clock_out_time) : 'Still active'}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">
                    📍 {selectedTimecard.clock_out_latitude.toFixed(6)}, {selectedTimecard.clock_out_longitude.toFixed(6)}
                  </p>

                  {/* Google Maps removed - will add back later */}

                  <a
                    href={getGoogleMapsLink(selectedTimecard.clock_out_latitude, selectedTimecard.clock_out_longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    <ExternalLink size={16} />
                    Open in Google Maps
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
