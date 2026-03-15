'use client';

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

export default function ActiveJobsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [dailyLogs, setDailyLogs] = useState<Record<string, any[]>>({});
  const [workItems, setWorkItems] = useState<Record<string, any[]>>({});
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'in_route' | 'assigned' | 'multi_day'>('all');

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    if (!['admin', 'super_admin', 'salesman', 'operations_manager'].includes(currentUser.role)) {
      router.push('/dashboard'); return;
    }
    fetchActiveJobs();
  }, []);

  const fetchActiveJobs = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch active jobs (not completed, not cancelled, not pending)
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

      // Fetch operator names
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

      // Fetch work item counts per job
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

      // Fetch daily log counts
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

      // Fetch work items
      const { data: items } = await supabase
        .from('work_items')
        .select('*')
        .eq('job_order_id', jobId)
        .order('day_number', { ascending: true });

      if (items) setWorkItems(prev => ({ ...prev, [jobId]: items }));

      // Fetch daily logs
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

  const statusConfig: Record<string, { color: string; bg: string; icon: any; label: string }> = {
    scheduled: { color: 'text-blue-700', bg: 'bg-blue-100', icon: Calendar, label: 'Scheduled' },
    assigned: { color: 'text-purple-700', bg: 'bg-purple-100', icon: User, label: 'Assigned' },
    in_route: { color: 'text-amber-700', bg: 'bg-amber-100', icon: Truck, label: 'In Route' },
    in_progress: { color: 'text-emerald-700', bg: 'bg-emerald-100', icon: Hammer, label: 'In Progress' },
  };

  const stats = {
    total: jobs.length,
    inProgress: jobs.filter(j => j.status === 'in_progress').length,
    inRoute: jobs.filter(j => j.status === 'in_route').length,
    multiDay: jobs.filter(j => j.is_multi_day).length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/admin"
                className="p-2 bg-white/10 rounded-xl border border-white/20 hover:bg-white/20 transition-all"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white">Active Jobs</h1>
                <p className="text-xs text-white/60">{stats.total} jobs in progress</p>
              </div>
            </div>
            <button
              onClick={fetchActiveJobs}
              disabled={loading}
              className="p-2 bg-white/10 rounded-xl border border-white/20 hover:bg-white/20 transition-all"
            >
              <RefreshCw className={`w-5 h-5 text-white ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.total}</p>
            <p className="text-xs text-white/60">Total Active</p>
          </div>
          <div className="bg-emerald-500/20 backdrop-blur-sm rounded-xl border border-emerald-400/20 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-300">{stats.inProgress}</p>
            <p className="text-xs text-emerald-200/60">In Progress</p>
          </div>
          <div className="bg-amber-500/20 backdrop-blur-sm rounded-xl border border-amber-400/20 p-3 text-center">
            <p className="text-2xl font-bold text-amber-300">{stats.inRoute}</p>
            <p className="text-xs text-amber-200/60">In Route</p>
          </div>
          <div className="bg-purple-500/20 backdrop-blur-sm rounded-xl border border-purple-400/20 p-3 text-center">
            <p className="text-2xl font-bold text-purple-300">{stats.multiDay}</p>
            <p className="text-xs text-purple-200/60">Multi-Day</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
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
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                filter === f.key
                  ? 'bg-white text-slate-900'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Job List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-white/50" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="bg-white/5 rounded-2xl border border-white/10 p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-white/70">No active jobs matching this filter</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map(job => {
              const status = statusConfig[job.status] || statusConfig.scheduled;
              const StatusIcon = status.icon;
              const isExpanded = expandedJob === job.id;

              return (
                <div key={job.id} className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
                  {/* Job Header */}
                  <button
                    onClick={() => toggleExpand(job.id)}
                    className="w-full p-4 text-left hover:bg-white/5 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {status.label}
                          </span>
                          {job.is_multi_day && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                              <CalendarDays className="w-3 h-3" />
                              Day {job.total_days_worked || 1}
                            </span>
                          )}
                          {job.priority === 'urgent' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              <AlertCircle className="w-3 h-3" />
                              Urgent
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-white truncate">{job.job_number} — {job.title}</p>
                        <p className="text-xs text-white/50 truncate">{job.customer_name}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
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
                          <ChevronUp className="w-5 h-5 text-white/40" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-white/40" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-white/10 pt-4 space-y-4">
                      {/* Job Info */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-white/40 text-xs">Scheduled</p>
                          <p className="text-white">{job.scheduled_date}</p>
                        </div>
                        {job.end_date && (
                          <div>
                            <p className="text-white/40 text-xs">End Date</p>
                            <p className="text-white">{job.end_date}</p>
                          </div>
                        )}
                        {job.estimated_cost && (
                          <div>
                            <p className="text-white/40 text-xs">Estimated Cost</p>
                            <p className="text-emerald-400 font-semibold">${Number(job.estimated_cost).toLocaleString()}</p>
                          </div>
                        )}
                        {job.estimated_hours && (
                          <div>
                            <p className="text-white/40 text-xs">Est. Hours</p>
                            <p className="text-white">{job.estimated_hours}h</p>
                          </div>
                        )}
                        {job.helper_name && (
                          <div>
                            <p className="text-white/40 text-xs">Helper</p>
                            <p className="text-white">{job.helper_name}</p>
                          </div>
                        )}
                        {job.job_type && (
                          <div>
                            <p className="text-white/40 text-xs">Job Type</p>
                            <p className="text-white">{job.job_type}</p>
                          </div>
                        )}
                      </div>

                      {/* Work Items */}
                      {workItems[job.id] && workItems[job.id].length > 0 && (
                        <div>
                          <p className="text-xs text-white/40 font-medium mb-2 flex items-center gap-1">
                            <Wrench className="w-3 h-3" /> Work Items ({workItems[job.id].length})
                          </p>
                          <div className="space-y-1">
                            {workItems[job.id].map((item, i) => (
                              <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                                <span className="text-sm text-white">{item.work_type}</span>
                                <div className="flex items-center gap-2 text-xs text-white/50">
                                  {item.core_quantity && <span>{item.core_quantity} cores</span>}
                                  {item.linear_feet_cut && <span>{item.linear_feet_cut} LF</span>}
                                  <span>Day {item.day_number}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Daily Logs */}
                      {dailyLogs[job.id] && dailyLogs[job.id].length > 0 && (
                        <div>
                          <p className="text-xs text-white/40 font-medium mb-2 flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" /> Daily Progress ({dailyLogs[job.id].length} days)
                          </p>
                          <div className="space-y-1">
                            {dailyLogs[job.id].map((log, i) => (
                              <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                                <span className="text-sm text-white">Day {log.day_number} — {log.log_date}</span>
                                <span className="text-xs text-white/50">{log.hours_worked}h worked</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Equipment */}
                      {job.equipment_needed && job.equipment_needed.length > 0 && (
                        <div>
                          <p className="text-xs text-white/40 font-medium mb-1">Equipment</p>
                          <div className="flex flex-wrap gap-1">
                            {job.equipment_needed.map((eq, i) => (
                              <span key={i} className="px-2 py-1 bg-white/5 rounded text-xs text-white/70">
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
