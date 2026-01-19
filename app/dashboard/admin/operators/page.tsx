'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { MapPin, Clock, User as UserIcon, Activity, Navigation, CheckCircle } from 'lucide-react';

interface OperatorStatus {
  id: string;
  user_id: string;
  timecard_id: string;
  status: 'clocked_in' | 'en_route' | 'in_progress' | 'job_completed' | 'clocked_out';
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  operator_name: string;
  operator_email: string;
  operator_role: string;
  clock_in_time: string;
  shift_date: string;
  hours_worked: number;
  statusHistory: Array<{
    status: string;
    timestamp: string;
    latitude: number | null;
    longitude: number | null;
  }>;
}

interface Summary {
  totalActive: number;
  byStatus: {
    clocked_in: number;
    en_route: number;
    in_progress: number;
    job_completed: number;
  };
  totalHoursWorked: number;
}

export default function OperatorsMonitoringPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [operators, setOperators] = useState<OperatorStatus[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<OperatorStatus | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }

    if (currentUser.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    setUser(currentUser);
    fetchActiveOperators();
  }, [router]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchActiveOperators();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const fetchActiveOperators = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.warn('⚠️ No active session found - session may have expired. Redirecting to login...');
        localStorage.removeItem('supabase-user');
        localStorage.removeItem('pontifex-user');
        window.location.href = '/login';
        return;
      }

      const response = await fetch('/api/admin/operators/active', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const result = await response.json();

      if (result.success) {
        setOperators(result.data.operators);
        setSummary(result.data.summary);
      }
    } catch (error) {
      console.error('Error fetching active operators:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGoogleMapsLink = (lat: number | null, lng: number | null) => {
    if (!lat || !lng) return '#';
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'clocked_in': return 'bg-green-500';
      case 'en_route': return 'bg-blue-500';
      case 'in_progress': return 'bg-orange-500';
      case 'job_completed': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'clocked_in': return '🏢 At Shop';
      case 'en_route': return '🚗 In Route';
      case 'in_progress': return '⚙️ Working';
      case 'job_completed': return '✅ Complete';
      default: return '⏸️ Unknown';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading operators...</p>
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
                href="/dashboard/admin"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Back</span>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Live Operator Monitoring</h1>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
                  autoRefresh
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Activity size={16} className={autoRefresh ? 'animate-pulse' : ''} />
                <span>{autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}</span>
              </button>
              <button
                onClick={fetchActiveOperators}
                className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-xl font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          {/* Total Active */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <UserIcon className="text-blue-600" size={24} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-800">
              {summary?.totalActive || 0}
            </p>
            <p className="text-sm text-gray-500">Active Operators</p>
          </div>

          {/* At Shop */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <div className="text-2xl">🏢</div>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-800">
              {summary?.byStatus.clocked_in || 0}
            </p>
            <p className="text-sm text-gray-500">At Shop</p>
          </div>

          {/* In Route */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Navigation className="text-blue-600" size={24} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-800">
              {summary?.byStatus.en_route || 0}
            </p>
            <p className="text-sm text-gray-500">In Route</p>
          </div>

          {/* Working */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                <Activity className="text-orange-600" size={24} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-800">
              {summary?.byStatus.in_progress || 0}
            </p>
            <p className="text-sm text-gray-500">Working</p>
          </div>

          {/* Completed */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="text-purple-600" size={24} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-800">
              {summary?.byStatus.job_completed || 0}
            </p>
            <p className="text-sm text-gray-500">Completed</p>
          </div>
        </div>

        {/* Operator Cards Grid */}
        {operators.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-lg">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserIcon className="text-gray-400" size={40} />
            </div>
            <p className="text-gray-600 text-lg font-medium">No active operators</p>
            <p className="text-gray-500 text-sm mt-2">
              Operators will appear here when they clock in
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {operators.map((operator) => (
              <div
                key={operator.id}
                className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-shadow cursor-pointer"
                onClick={() => {
                  setSelectedOperator(operator);
                  setShowMapModal(true);
                }}
              >
                {/* Status Bar */}
                <div className={`h-2 ${getStatusColor(operator.status)}`}></div>

                <div className="p-6">
                  {/* Operator Info */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                        {operator.operator_name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">
                          {operator.operator_name}
                        </h3>
                        <p className="text-sm text-gray-500 capitalize">
                          {operator.operator_role}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Current Status */}
                  <div className="mb-4">
                    <div className={`inline-flex items-center px-4 py-2 rounded-xl font-bold text-white ${getStatusColor(operator.status)}`}>
                      {getStatusText(operator.status)}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="space-y-3">
                    {/* Hours Worked */}
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Clock size={16} />
                        <span className="text-sm font-medium">Hours Today</span>
                      </div>
                      <span className="text-sm font-bold text-gray-800">
                        {operator.hours_worked.toFixed(1)} hrs
                      </span>
                    </div>

                    {/* Clock In Time */}
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <div className="flex items-center gap-2 text-gray-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-medium">Clocked In</span>
                      </div>
                      <span className="text-sm font-bold text-gray-800">
                        {formatTime(operator.clock_in_time)}
                      </span>
                    </div>

                    {/* Last Update */}
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Activity size={16} />
                        <span className="text-sm font-medium">Last Update</span>
                      </div>
                      <span className="text-sm font-bold text-gray-800">
                        {formatTime(operator.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* View Location Button */}
                  {operator.latitude && operator.longitude && (
                    <button className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl font-semibold transition-colors">
                      <MapPin size={18} />
                      <span>View Location on Map</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Map Modal */}
      {showMapModal && selectedOperator && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">
                  {selectedOperator.operator_name}
                </h2>
                <p className="text-sm text-gray-600">
                  {getStatusText(selectedOperator.status)}
                </p>
              </div>
              <button
                onClick={() => setShowMapModal(false)}
                className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {/* Current Location */}
              {selectedOperator.latitude && selectedOperator.longitude && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Current Location</h3>
                  <div className="relative rounded-xl overflow-hidden shadow-lg">
                    <img
                      src={`https://maps.googleapis.com/maps/api/staticmap?center=${selectedOperator.latitude},${selectedOperator.longitude}&zoom=15&size=600x400&markers=color:blue%7C${selectedOperator.latitude},${selectedOperator.longitude}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
                      alt="Current location map"
                      className="w-full"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                      <p className="text-white font-medium text-sm">
                        📍 {selectedOperator.latitude.toFixed(6)}, {selectedOperator.longitude.toFixed(6)}
                      </p>
                      {selectedOperator.accuracy && (
                        <p className="text-white/80 text-xs mt-1">
                          Accuracy: ±{selectedOperator.accuracy.toFixed(0)}m
                        </p>
                      )}
                    </div>
                  </div>
                  <a
                    href={getGoogleMapsLink(selectedOperator.latitude, selectedOperator.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full mt-3 text-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
                  >
                    Open in Google Maps
                  </a>
                </div>
              )}

              {/* Status History */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-3">Status History (Last 5)</h3>
                <div className="space-y-3">
                  {selectedOperator.statusHistory.map((history, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(history.status)}`}></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {getStatusText(history.status)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatTime(history.timestamp)} - {formatDate(history.timestamp)}
                          </p>
                        </div>
                      </div>
                      {history.latitude && history.longitude && (
                        <a
                          href={getGoogleMapsLink(history.latitude, history.longitude)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          <MapPin size={16} className="inline" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
