'use client';

import { useState, useEffect } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  Briefcase,
  Calendar,
  ArrowRight,
  AlertCircle,
  ChevronRight,
  MapPin,
  User,
  RefreshCw,
} from 'lucide-react';

interface ActiveJob {
  id: string;
  job_number: string;
  title: string;
  status: string;
  scheduled_date: string;
  scheduled_end_date?: string;
  job_type: string;
  customer_name?: string;
  address?: string;
  assigned_operator_name?: string;
  created_by_name?: string;
  pending_change_requests?: number;
  pending_completion_approval?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
  assigned: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  in_route: 'bg-amber-100 text-amber-700 border-amber-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  pending_approval: 'bg-purple-100 text-purple-700 border-purple-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};

export default function ActiveJobsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'today' | 'coming_up' | 'attention'>('all');
  const [viewAll, setViewAll] = useState(true);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    const adminRoles = ['super_admin', 'operations_manager', 'admin', 'salesman', 'shop_manager'];
    if (!adminRoles.includes(currentUser.role)) {
      router.push('/dashboard');
      return;
    }
    setUser(currentUser);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, viewAll]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({ active: 'true' });
      if (!viewAll) params.set('mine', 'true');

      const res = await fetch(`/api/admin/active-jobs?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.success) setJobs(json.data || []);
    } catch (err) {
      console.error('Error fetching active jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = jobs.filter(j => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    if (filter === 'today') return j.scheduled_date === today;
    if (filter === 'coming_up') return j.scheduled_date === tomorrow;
    if (filter === 'attention') return (j.pending_change_requests ?? 0) > 0 || j.pending_completion_approval;
    return true;
  });

  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const stats = {
    total: jobs.length,
    today: jobs.filter(j => j.scheduled_date === new Date().toISOString().split('T')[0]).length,
    comingUp: jobs.filter(j => j.scheduled_date === tomorrow).length,
    needsAttention: jobs.filter(
      j => (j.pending_change_requests ?? 0) > 0 || j.pending_completion_approval
    ).length,
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Active Jobs</h1>
            <p className="text-gray-600 mt-1">
              {viewAll ? 'All company jobs' : 'My assigned jobs'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewAll(!viewAll)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border
                ${viewAll
                  ? 'bg-purple-50 border-purple-200 text-purple-700'
                  : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {viewAll ? 'Showing All' : 'My Jobs Only'}
            </button>
            <button
              onClick={fetchJobs}
              disabled={loading}
              className="p-2 bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Active', value: stats.total, icon: Briefcase, color: 'text-blue-600', tab: 'all' as const },
            { label: 'Today', value: stats.today, icon: Calendar, color: 'text-green-600', tab: 'today' as const },
            { label: 'Coming Up', value: stats.comingUp, icon: ArrowRight, color: 'text-indigo-600', tab: 'coming_up' as const },
            { label: 'Needs Attention', value: stats.needsAttention, icon: AlertCircle, color: 'text-red-600', tab: 'attention' as const },
          ].map(stat => (
            <button
              key={stat.tab}
              onClick={() => setFilter(stat.tab)}
              className={`bg-white border rounded-xl p-4 text-left transition-all shadow-sm ${
                filter === stat.tab ? 'border-purple-500' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-500 text-sm">{stat.label}</span>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            </button>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {([
            ['all', 'All'],
            ['today', 'Today'],
            ['coming_up', 'Coming Up'],
            ['attention', 'Needs Attention'],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative
                ${filter === val ? 'bg-purple-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
            >
              {label}
              {val === 'attention' && stats.needsAttention > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {stats.needsAttention}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Job list */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
            <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No jobs match this filter</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(job => (
              <Link
                key={job.id}
                href={`/dashboard/admin/jobs/${job.id}`}
                className="block w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-all shadow-sm hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="text-xs font-mono text-gray-500">{job.job_number}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                          STATUS_COLORS[job.status] ?? STATUS_COLORS.scheduled
                        }`}
                      >
                        {job.status?.replace(/_/g, ' ')}
                      </span>
                      {(job.pending_change_requests ?? 0) > 0 && (
                        <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                          {job.pending_change_requests} change request{job.pending_change_requests !== 1 ? 's' : ''}
                        </span>
                      )}
                      {job.pending_completion_approval && (
                        <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                          Awaiting approval
                        </span>
                      )}
                    </div>
                    <h3 className="text-gray-900 font-semibold truncate">
                      {job.title || job.customer_name}
                    </h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 flex-wrap">
                      {job.customer_name && job.title && (
                        <span className="text-gray-500 text-xs">{job.customer_name}</span>
                      )}
                      {job.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {job.address}
                        </span>
                      )}
                      {job.assigned_operator_name && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {job.assigned_operator_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {job.scheduled_date}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
