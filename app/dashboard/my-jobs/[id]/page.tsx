'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Clock, Calendar, User, Navigation, Play, CheckCircle, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface JobOrder {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  customer_contact: string;
  job_type: string;
  location: string;
  address: string;
  description: string;
  status: string;
  priority: string;
  scheduled_date: string;
  arrival_time: string;
  estimated_hours: number;
  foreman_name: string;
  foreman_phone: string;
  salesman_name: string;
  route_started_at: string;
  work_started_at: string;
  work_completed_at: string;
  drive_hours: number;
  production_hours: number;
  total_hours: number;
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<JobOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showCompletionForm, setShowCompletionForm] = useState(false);

  const [completionData, setCompletionData] = useState({
    work_performed: '',
    materials_used: '',
    equipment_used: '',
    operator_notes: '',
    issues_encountered: '',
    customer_satisfied: true,
  });

  useEffect(() => {
    fetchJob();
  }, [jobId]);

  const fetchJob = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const response = await fetch(`/api/job-orders`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const foundJob = result.data.find((j: JobOrder) => j.id === jobId);
          if (foundJob) {
            setJob(foundJob);
          } else {
            router.push('/dashboard/my-jobs');
          }
        }
      }
    } catch (error) {
      console.error('Error fetching job:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLocation = (): Promise<{ latitude: number; longitude: number; accuracy: number }> => {
    return new Promise((resolve) => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            });
          },
          () => {
            resolve({ latitude: 0, longitude: 0, accuracy: 0 });
          }
        );
      } else {
        resolve({ latitude: 0, longitude: 0, accuracy: 0 });
      }
    });
  };

  const updateStatus = async (newStatus: 'in_route' | 'in_progress' | 'completed') => {
    if (newStatus === 'completed') {
      setShowCompletionForm(true);
      return;
    }

    setStatusLoading(true);
    setStatusMessage(null);

    try {
      const location = await getLocation();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setStatusMessage({
          type: 'error',
          text: 'Session expired. Please log in again.',
        });
        setStatusLoading(false);
        return;
      }

      const response = await fetch(`/api/job-orders/${jobId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          status: newStatus,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setStatusMessage({
          type: 'success',
          text: result.message,
        });
        // Refresh job data
        await fetchJob();
      } else {
        setStatusMessage({
          type: 'error',
          text: result.error || 'Failed to update status',
        });
      }

      setTimeout(() => setStatusMessage(null), 3000);
    } catch (error: any) {
      console.error('Error updating status:', error);
      setStatusMessage({
        type: 'error',
        text: error.message || 'An error occurred',
      });
    } finally {
      setStatusLoading(false);
    }
  };

  const submitCompletion = async () => {
    setStatusLoading(true);
    setStatusMessage(null);

    try {
      const location = await getLocation();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setStatusMessage({
          type: 'error',
          text: 'Session expired. Please log in again.',
        });
        setStatusLoading(false);
        return;
      }

      const response = await fetch(`/api/job-orders/${jobId}/submit`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          ...completionData,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setStatusMessage({
          type: 'success',
          text: 'Job completed successfully!',
        });
        setShowCompletionForm(false);
        // Refresh job data
        await fetchJob();
        // Redirect after a moment
        setTimeout(() => {
          router.push('/dashboard/my-jobs');
        }, 2000);
      } else {
        setStatusMessage({
          type: 'error',
          text: result.error || 'Failed to submit completion data',
        });
      }
    } catch (error: any) {
      console.error('Error submitting completion:', error);
      setStatusMessage({
        type: 'error',
        text: error.message || 'An error occurred',
      });
    } finally {
      setStatusLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
      case 'assigned':
        return 'bg-blue-500 border-blue-600';
      case 'in_route':
        return 'bg-yellow-500 border-yellow-600';
      case 'in_progress':
        return 'bg-orange-500 border-orange-600';
      case 'completed':
        return 'bg-green-500 border-green-600';
      default:
        return 'bg-gray-500 border-gray-600';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not scheduled';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-lg">Job not found</p>
          <Link href="/dashboard/my-jobs" className="mt-4 inline-block text-blue-600 hover:underline">
            Back to My Jobs
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
              href="/dashboard/my-jobs"
              className="p-3 bg-white rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
            >
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-4xl font-bold text-gray-800">
                Job #{job.job_number}
              </h1>
              <p className="text-gray-600 font-medium mt-1">{job.title}</p>
            </div>
          </div>
          <span className={`px-4 py-2 rounded-xl text-white font-bold ${getStatusColor(job.status)}`}>
            {job.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className={`${
            statusMessage.type === 'success'
              ? 'bg-green-50 border-green-300'
              : 'bg-red-50 border-red-300'
          } border-2 rounded-2xl p-6 shadow-lg mb-6`}>
            <div className="flex items-center space-x-3">
              <div className={`w-12 h-12 ${
                statusMessage.type === 'success' ? 'bg-green-200' : 'bg-red-200'
              } rounded-full flex items-center justify-center`}>
                {statusMessage.type === 'success' ? (
                  <CheckCircle className="w-6 h-6 text-green-700" />
                ) : (
                  <svg className="w-6 h-6 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <p className={`${
                statusMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
              } font-bold text-lg`}>
                {statusMessage.text}
              </p>
            </div>
          </div>
        )}

        {/* Status Actions */}
        {job.status !== 'completed' && (
          <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Update Job Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(job.status === 'scheduled' || job.status === 'assigned') && (
                <button
                  onClick={() => updateStatus('in_route')}
                  disabled={statusLoading}
                  className="flex items-center justify-center gap-3 px-6 py-4 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-bold transition-all shadow-lg disabled:opacity-50"
                >
                  <Navigation className="w-6 h-6" />
                  Start Driving (In Route)
                </button>
              )}

              {job.status === 'in_route' && (
                <button
                  onClick={() => updateStatus('in_progress')}
                  disabled={statusLoading}
                  className="flex items-center justify-center gap-3 px-6 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold transition-all shadow-lg disabled:opacity-50"
                >
                  <Play className="w-6 h-6" />
                  Start Work (In Progress)
                </button>
              )}

              {job.status === 'in_progress' && (
                <button
                  onClick={() => updateStatus('completed')}
                  disabled={statusLoading}
                  className="flex items-center justify-center gap-3 px-6 py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold transition-all shadow-lg disabled:opacity-50"
                >
                  <CheckCircle className="w-6 h-6" />
                  Complete Job
                </button>
              )}
            </div>
          </div>
        )}

        {/* Completion Form Modal */}
        {showCompletionForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Complete Job & Submit Data</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Work Performed *</label>
                  <textarea
                    required
                    value={completionData.work_performed}
                    onChange={(e) => setCompletionData({ ...completionData, work_performed: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                    placeholder="Describe the work completed..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Materials Used</label>
                  <textarea
                    value={completionData.materials_used}
                    onChange={(e) => setCompletionData({ ...completionData, materials_used: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                    placeholder="List materials used..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Equipment Used</label>
                  <textarea
                    value={completionData.equipment_used}
                    onChange={(e) => setCompletionData({ ...completionData, equipment_used: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                    placeholder="List equipment used..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                  <textarea
                    value={completionData.operator_notes}
                    onChange={(e) => setCompletionData({ ...completionData, operator_notes: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                    placeholder="Any additional notes..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Issues Encountered</label>
                  <textarea
                    value={completionData.issues_encountered}
                    onChange={(e) => setCompletionData({ ...completionData, issues_encountered: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                    placeholder="Any problems or issues..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Satisfaction</label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setCompletionData({ ...completionData, customer_satisfied: true })}
                      className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all ${
                        completionData.customer_satisfied
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      Satisfied
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompletionData({ ...completionData, customer_satisfied: false })}
                      className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all ${
                        !completionData.customer_satisfied
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      Not Satisfied
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setShowCompletionForm(false)}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitCompletion}
                  disabled={statusLoading || !completionData.work_performed}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold transition-colors shadow-lg disabled:opacity-50"
                >
                  {statusLoading ? 'Submitting...' : 'Submit & Complete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Job Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Basic Info */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Job Information</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Customer</p>
                <p className="font-bold text-gray-900">{job.customer_name}</p>
                {job.customer_contact && (
                  <p className="text-sm text-gray-600">{job.customer_contact}</p>
                )}
              </div>

              <div>
                <p className="text-sm text-gray-500">Job Type</p>
                <p className="font-bold text-gray-900">{job.job_type}</p>
              </div>

              <div className="flex items-start gap-2">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="font-bold text-gray-900">{job.location}</p>
                  <p className="text-sm text-gray-600">{job.address}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Scheduled</p>
                  <p className="font-bold text-gray-900">
                    {formatDate(job.scheduled_date)}
                    {job.arrival_time && <span className="text-gray-600"> at {job.arrival_time}</span>}
                  </p>
                </div>
              </div>

              {job.estimated_hours && (
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Estimated Duration</p>
                    <p className="font-bold text-gray-900">{job.estimated_hours} hours</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Contact Information</h2>
            <div className="space-y-4">
              {job.foreman_name && (
                <div>
                  <p className="text-sm text-gray-500">Foreman</p>
                  <p className="font-bold text-gray-900">{job.foreman_name}</p>
                  {job.foreman_phone && (
                    <a href={`tel:${job.foreman_phone}`} className="text-blue-600 hover:underline">
                      {job.foreman_phone}
                    </a>
                  )}
                </div>
              )}

              {job.salesman_name && (
                <div>
                  <p className="text-sm text-gray-500">Salesman</p>
                  <p className="font-bold text-gray-900">{job.salesman_name}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {job.description && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Job Description</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{job.description}</p>
          </div>
        )}

        {/* Time Tracking */}
        {(job.route_started_at || job.work_started_at || job.work_completed_at) && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Time Tracking</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {job.route_started_at && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Route Started</p>
                  <p className="font-bold text-gray-900">{formatDateTime(job.route_started_at)}</p>
                </div>
              )}

              {job.work_started_at && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Work Started</p>
                  <p className="font-bold text-gray-900">{formatDateTime(job.work_started_at)}</p>
                </div>
              )}

              {job.work_completed_at && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Work Completed</p>
                  <p className="font-bold text-gray-900">{formatDateTime(job.work_completed_at)}</p>
                </div>
              )}

              {job.drive_hours > 0 && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                  <p className="text-sm text-blue-600 font-semibold mb-1">Drive Time</p>
                  <p className="text-2xl font-bold text-blue-800">{job.drive_hours.toFixed(2)} hrs</p>
                </div>
              )}

              {job.production_hours > 0 && (
                <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                  <p className="text-sm text-green-600 font-semibold mb-1">Production Time</p>
                  <p className="text-2xl font-bold text-green-800">{job.production_hours.toFixed(2)} hrs</p>
                </div>
              )}

              {job.total_hours > 0 && (
                <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
                  <p className="text-sm text-purple-600 font-semibold mb-1">Total Time</p>
                  <p className="text-2xl font-bold text-purple-800">{job.total_hours.toFixed(2)} hrs</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
