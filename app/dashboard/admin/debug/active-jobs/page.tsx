'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, RefreshCw, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

interface JobDebugInfo {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  status: string;
  scheduled_date: string;
  created_at: string;
  arrival_time: string;
  completion_signed_at: string | null;
}

export default function ActiveJobsDebugPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobDebugInfo[]>([]);
  const [todayStr, setTodayStr] = useState('');
  const [fixing, setFixing] = useState(false);

  useEffect(() => {
    checkAuth();
    loadJobs();
  }, []);

  const checkAuth = async () => {
    const userStr = localStorage.getItem('pontifex-user');
    if (!userStr) {
      router.push('/login');
      return;
    }
    const user = JSON.parse(userStr);
    if (user.role !== 'admin') {
      router.push('/dashboard');
    }
  };

  const loadJobs = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      setTodayStr(today);

      // Get all jobs scheduled for today that aren't completed or cancelled
      const { data: jobsData, error } = await supabase
        .from('job_orders')
        .select('id, job_number, title, customer_name, status, scheduled_date, created_at, arrival_time, completion_signed_at')
        .eq('scheduled_date', today)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(jobsData || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
      alert('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleFixJob = async (jobId: string, action: 'complete' | 'delete') => {
    if (!confirm(`Are you sure you want to ${action} this job?`)) return;

    setFixing(true);
    try {
      if (action === 'complete') {
        const { error } = await supabase
          .from('job_orders')
          .update({ status: 'completed' })
          .eq('id', jobId);

        if (error) throw error;
        alert('✅ Job marked as completed');
      } else {
        const { error } = await supabase
          .from('job_orders')
          .delete()
          .eq('id', jobId);

        if (error) throw error;
        alert('✅ Job deleted');
      }

      await loadJobs();
    } catch (error) {
      console.error(`Error ${action}ing job:`, error);
      alert(`Failed to ${action} job`);
    } finally {
      setFixing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-700';
      case 'in-route': return 'bg-purple-100 text-purple-700';
      case 'in-progress': return 'bg-yellow-100 text-yellow-700';
      case 'completed': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading debug data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/admin"
              className="p-2 hover:bg-white rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Active Jobs Debug</h1>
              <p className="text-sm text-gray-600">Investigate and fix phantom active jobs</p>
            </div>
          </div>
          <button
            onClick={loadJobs}
            disabled={fixing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${fixing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Today's Date</p>
                <p className="text-2xl font-bold text-blue-600">{todayStr}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Active Jobs Count</p>
                <p className="text-2xl font-bold text-orange-600">{jobs.length}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-600" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Expected Count</p>
                <p className="text-2xl font-bold text-green-600">1</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>
        </div>

        {/* Query Info */}
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 mb-6">
          <h3 className="font-bold text-yellow-900 mb-2">Query Details:</h3>
          <code className="text-sm text-yellow-800 block">
            SELECT * FROM job_orders<br />
            WHERE scheduled_date = '{todayStr}'<br />
            AND status != 'completed'<br />
            AND status != 'cancelled'
          </code>
        </div>
      </div>

      {/* Jobs List */}
      <div className="max-w-7xl mx-auto">
        {jobs.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No Phantom Jobs Found!</h2>
            <p className="text-gray-600">The active job count should now be accurate.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-500 to-red-600">
              <h2 className="text-xl font-bold text-white">
                Found {jobs.length} Job{jobs.length !== 1 ? 's' : ''} Scheduled for Today
              </h2>
              <p className="text-orange-100 text-sm">Review and fix any phantom jobs below</p>
            </div>

            <div className="divide-y divide-gray-200">
              {jobs.map((job) => (
                <div key={job.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {job.job_number}
                        </span>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${getStatusColor(job.status)}`}>
                          {job.status}
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-gray-900 mb-1">{job.title}</h3>
                      <p className="text-sm text-gray-600 mb-3">{job.customer_name}</p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Scheduled Date</p>
                          <p className="font-semibold text-gray-900">{new Date(job.scheduled_date).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Created</p>
                          <p className="font-semibold text-gray-900">{new Date(job.created_at).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Arrival Time</p>
                          <p className="font-semibold text-gray-900">{job.arrival_time || 'Not set'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Completed At</p>
                          <p className="font-semibold text-gray-900">{job.completion_signed_at ? new Date(job.completion_signed_at).toLocaleString() : 'Not completed'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleFixJob(job.id, 'complete')}
                        disabled={fixing}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Mark Complete
                      </button>
                      <button
                        onClick={() => handleFixJob(job.id, 'delete')}
                        disabled={fixing}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
