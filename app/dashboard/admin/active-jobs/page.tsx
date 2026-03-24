'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  MapPin,
  Clock,
  User,
  Calendar,
  ChevronDown,
  ChevronUp,
  Truck,
  Hammer,
  AlertCircle,
  CheckCircle2,
  Wrench,
  CalendarDays,
  Activity,
} from 'lucide-react';

interface ActiveJob {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  location: string;
  address: string;
  status: string;
  priority: string;
  scheduled_date: string;
  end_date: string | null;
  estimated_hours: number | null;
  assigned_to: string | null;
  helper_assigned_to: string | null;
  is_multi_day: boolean;
  total_days_worked: number;
  route_started_at: string | null;
  work_started_at: string | null;
  job_type: string | null;
  estimated_cost: number | null;
  equipment_needed: string[] | null;
  operator_name?: string;
  helper_name?: string;
  work_items_count?: number;
  daily_logs_count?: number;
}

const AUTO_REFRESH_INTERVAL = 30_000; // 30 seconds

export default function ActiveJobsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [dailyLogs, setDailyLogs] = useState<Record<string, any[]>>({});
  const [workItems, setWorkItems] = useState<Record<string, any[]>>({});
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'in_route' | 'assigned' | 'multi_day'>('all');
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    if (!['admin', 'super_admin', 'salesman', 'operations_manager'].includes(currentUser.role)) {
      router.push('/dashboard'); return;
    }
    fetchActiveJobs();
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchActiveJobs(true);
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const fetchActiveJobs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('job_orders')
        .select(`
          id, job_number, title, customer_name, location, address,
          status, priority, scheduled_date, end_date, estimated_hours,
          assigned_to, helper_assigned_to, is_multi_day, total_days_worked,
          route_started_at, work_started_at, job_type, estimated_cost,
          equipment_needed
        `)
        .in('status', ['scheduled', 'assigned', 'in_route', 'in_progress'])
        .is('deleted_at', null)
        .order('priority', { ascending: false })
        .order('scheduled_date', { ascending: true });

      if (error) throw error;

      const operatorIds = [...new Set((data || []).map(j => j.assigned_to).filter(Boolean))];
      const helperIds = [...new Set((data || []).map(j => j.helper_assigned_to).filter(Boolean))];
      const allIds = [...new Set([...operatorIds, ...helperIds])];

      let nameMap: Record<string, string> = {};
      if (allIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', allIds);
        if (profiles) {
          profiles.forEach(p => { nameMap[p.id] = p.full_name; });
        }
      }

      const jobIds = (data || []).map(j => j.id);
      let workItemCounts: Record<string, number> = {};
      if (jobIds.length > 0) {
        const { data: workData } = await supabase
          .from('work_items')
          .select('job_order_id')
          .in('job_order_id', jobIds);
        if (workData) {
          workData.forEach(w => {
            workItemCounts[w.job_order_id] = (workItemCounts[w.job_order_id] || 0) + 1;
          });
        }
      }

      let dailyLogCounts: Record<string, number> = {};
      if (jobIds.length > 0) {
        const { data: logData } = await supabase
          .from('daily_job_logs')
          .select('job_order_id')
          .in('job_order_id', jobIds);
        if (logData) {
          logData.forEach(l => {
            dailyLogCounts[l.job_order_id] = (dailyLogCounts[l.job_order_id] || 0) + 1;
          });
        }
      }

      const enrichedJobs = (data || []).map(job => ({
        ...job,
        operator_name: job.assigned_to ? nameMap[job.assigned_to] : undefined,
        helper_name: job.helper_assigned_to ? nameMap[job.helper_assigned_to] : undefined,
        work_items_count: workItemCounts[job.id] || 0,
        daily_logs_count: dailyLogCounts[job.id] || 0,
      }));

      setJobs(enrichedJobs);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error fetching active jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobDetails = async (jobId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: items } = await supabase
        .from('work_items')
        .select('*')
        .eq('job_order_id', jobId)
        .order('day_number', { ascending: true });

      if (items) setWorkItems(prev => ({ ...prev, [jobId]: items }));

      const { data: logs } = await supabase
        .from('daily_job_logs')
        .select('*')
        .eq('job_order_id', jobId)
        .order('log_date', { ascending: true });

      if (logs) setDailyLogs(prev => ({ ...prev, [jobId]: logs }));
    } catch (err) {
      console.error('Error fetching job details:', err);
    }
  };

  const toggleExpand = (jobId: string) => {
    if (expandedJob === jobId) {
      setExpandedJob(null);
    } else {
      setExpandedJob(jobId);
      if (!workItems[jobId]) {
        fetchJobDetails(jobId);
      }
    }
  };

  const filteredJobs = jobs.filter(job => {
    if (filter === 'all') return true;
    if (filter === 'multi_day') return job.is_multi_day;
    return job.status === filter;
  });

  const statusConfig: Record<string, { color: string; bg: string; border: string; icon: any; label: string }> = {
    scheduled: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Calendar, label: 'Scheduled' },
    assigned: { color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', icon: User, label: 'Assigned' },
    in_route: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Truck, label: 'In Route' },
    in_progress: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: Hammer, label: 'In Progress' },
  };

  const stats = {
    total: jobs.length,
    inProgress: jobs.filter(j => j.status === 'in_progress').length,
    inRoute: jobs.filter(j => j.status === 'in_route').length,
    multiDay: jobs.filter(j => j.is_multi_day).length,
  };

  const filterConfig: Record<string, { active: string }> = {
    all: { active: 'bg-slate-800 text-white shadow-sm' },
    in_progress: { active: 'bg-emerald-600 text-white shadow-sm' },
    in_route: { active: 'bg-amber-500 text-white shadow-sm' },
    assigned: { active: 'bg-purple-600 text-white shadow-sm' },
    multi_day: { active: 'bg-blue-600 text-white shadow-sm' },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4 max-w-4xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/admin"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-6 h-6 text-gray-800" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-sm">
                    <Activity size={16} className="text-white" />
                  </div>
                  Active Jobs
                </h1>
                <p className="text-sm text-gray-500">{stats.total} jobs in progress</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoRefresh(a => !a)}
                title={autoRefresh ? 'Auto-refresh ON (30s) — click to pause' : 'Auto-refresh paused — click to resume'}
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  autoRefresh
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-gray-100 text-gray-400 border border-gray-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                {autoRefresh ? 'Live' : 'Paused'}
              </button>
              <span className="hidden sm:block text-[10px] text-gray-400">
                {lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <button
                onClick={() => fetchActiveJobs()}
                disabled={loading}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <Activity className="w-5 h-5 text-blue-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Active</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <Hammer className="w-5 h-5 text-emerald-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900">{stats.inProgress}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">In Progress</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <Truck className="w-5 h-5 text-amber-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900">{stats.inRoute}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">In Route</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <CalendarDays className="w-5 h-5 text-purple-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900">{stats.multiDay}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Multi-Day</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
          {[
            { key: 'all', label: 'All' },
            { key: 'in_progress', label: 'In Progress' },
            { key: 'in_route', label: 'In Route' },
            { key: 'assigned', label: 'Assigned' },
            { key: 'multi_day', label: 'Multi-Day' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as any)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                filter === f.key
                  ? filterConfig[f.key]?.active || 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Job List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-14 h-14 mx-auto mb-4 relative">
              <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin" />
            </div>
            <p className="text-gray-600 font-medium">Loading active jobs...</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-12 text-center">
            <CheckCircle2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Active Jobs</h3>
            <p className="text-gray-600">No jobs matching this filter</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map(job => {
              const status = statusConfig[job.status] || statusConfig.scheduled;
              const StatusIcon = status.icon;
              const isExpanded = expandedJob === job.id;

              return (
                <div key={job.id} className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow">
                  {/* Job Header */}
                  <button
                    onClick={() => toggleExpand(job.id)}
                    className="w-full p-5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${status.bg} ${status.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {status.label}
                          </span>
                          {job.is_multi_day && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                              <CalendarDays className="w-3 h-3" />
                              Day {job.total_days_worked || 1}
                            </span>
                          )}
                          {job.priority === 'urgent' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                              <AlertCircle className="w-3 h-3" />
                              Urgent
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-gray-900 truncate">{job.job_number} — {job.title}</p>
                        <p className="text-xs text-gray-500 truncate">{job.customer_name}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                          {job.operator_name && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" /> {job.operator_name}
                            </span>
                          )}
                          {job.location && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3" /> {job.location}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-2 flex-shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
                      {/* Job Info Grid */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs font-semibold mb-0.5">Scheduled</p>
                          <p className="text-gray-900 font-medium">{job.scheduled_date}</p>
                        </div>
                        {job.end_date && (
                          <div>
                            <p className="text-gray-500 text-xs font-semibold mb-0.5">End Date</p>
                            <p className="text-gray-900 font-medium">{job.end_date}</p>
                          </div>
                        )}
                        {job.estimated_cost && (
                          <div>
                            <p className="text-gray-500 text-xs font-semibold mb-0.5">Estimated Cost</p>
                            <p className="text-emerald-600 font-bold">${Number(job.estimated_cost).toLocaleString()}</p>
                          </div>
                        )}
                        {job.estimated_hours && (
                          <div>
                            <p className="text-gray-500 text-xs font-semibold mb-0.5">Est. Hours</p>
                            <p className="text-gray-900 font-medium">{job.estimated_hours}h</p>
                          </div>
                        )}
                        {job.helper_name && (
                          <div>
                            <p className="text-gray-500 text-xs font-semibold mb-0.5">Helper</p>
                            <p className="text-gray-900 font-medium">{job.helper_name}</p>
                          </div>
                        )}
                        {job.job_type && (
                          <div>
                            <p className="text-gray-500 text-xs font-semibold mb-0.5">Job Type</p>
                            <p className="text-gray-900 font-medium">{job.job_type}</p>
                          </div>
                        )}
                      </div>

                      {/* Work Items */}
                      {workItems[job.id] && workItems[job.id].length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 font-semibold mb-2 flex items-center gap-1 uppercase tracking-wider">
                            <Wrench className="w-3 h-3" /> Work Items ({workItems[job.id].length})
                          </p>
                          <div className="space-y-1">
                            {workItems[job.id].map((item, i) => (
                              <div key={i} className="flex items-center justify-between bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg px-3 py-2">
                                <span className="text-sm text-gray-800 font-medium">{item.work_type}</span>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  {item.core_quantity && <span>{item.core_quantity} cores</span>}
                                  {item.linear_feet_cut && <span>{item.linear_feet_cut} LF</span>}
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">Day {item.day_number}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Daily Logs */}
                      {dailyLogs[job.id] && dailyLogs[job.id].length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 font-semibold mb-2 flex items-center gap-1 uppercase tracking-wider">
                            <CalendarDays className="w-3 h-3" /> Daily Progress ({dailyLogs[job.id].length} days)
                          </p>
                          <div className="space-y-1">
                            {dailyLogs[job.id].map((log: any, i: number) => (
                              <div key={i} className="flex items-center justify-between bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg px-3 py-2">
                                <span className="text-sm text-gray-800 font-medium">Day {log.day_number} — {log.log_date}</span>
                                <span className="text-xs text-gray-500 font-medium">{log.hours_worked}h worked</span>
                              </div>
                            ))}
                          </div>
                          {/* Cumulative totals */}
                          <div className="mt-2 flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                            <span className="text-sm text-indigo-800 font-bold">Total Hours</span>
                            <span className="text-sm text-indigo-700 font-bold">
                              {dailyLogs[job.id].reduce((sum: number, log: any) => sum + Number(log.hours_worked || 0), 0).toFixed(1)}h across {dailyLogs[job.id].length} days
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Equipment */}
                      {job.equipment_needed && job.equipment_needed.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 font-semibold mb-1.5 uppercase tracking-wider">Equipment</p>
                          <div className="flex flex-wrap gap-1.5">
                            {job.equipment_needed.map((eq, i) => (
                              <span key={i} className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-full text-xs text-indigo-700 font-medium">
                                {eq}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
