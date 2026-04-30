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
  RefreshCw,
  StickyNote,
  Trash2,
  X,
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
  helper_assigned_name?: string | null;
  created_by_name?: string;
  pending_change_requests?: number;
  pending_completion_approval?: boolean;
  operator_notes_count?: number;
}

// Status pill hues. Light: `bg-{hue}-100 text-{hue}-700 ring-{hue}-200`.
// Dark: translucent versions on the dark purple backdrop.
const STATUS_COLORS: Record<string, string> = {
  scheduled:
    'bg-sky-100 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/30',
  assigned:
    'bg-sky-100 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/30',
  in_route:
    'bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30',
  on_site:
    'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30',
  in_progress:
    'bg-violet-100 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30',
  pending_approval:
    'bg-orange-100 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/30',
  pending_completion:
    'bg-orange-100 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/30',
  completed:
    'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white/80 dark:ring-white/10',
  cancelled:
    'bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30',
};

// Top-accent bar hue per status — colorful stripe on the top edge of each card.
const STATUS_ACCENT: Record<string, string> = {
  scheduled: 'from-sky-400 to-blue-500',
  assigned: 'from-sky-400 to-indigo-500',
  in_route: 'from-amber-400 to-orange-500',
  on_site: 'from-emerald-400 to-teal-500',
  in_progress: 'from-violet-500 to-fuchsia-500',
  pending_approval: 'from-orange-400 to-rose-500',
  pending_completion: 'from-orange-400 to-rose-500',
  completed: 'from-slate-300 to-slate-400',
  cancelled: 'from-rose-400 to-red-500',
};

export default function ActiveJobsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'today' | 'coming_up' | 'attention'>('all');
  const [viewAll, setViewAll] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ActiveJob | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/jobs/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setJobs(prev => prev.filter(j => j.id !== deleteTarget.id));
        setDeleteTarget(null);
      }
    } catch (err) {
      console.error('Error deleting job:', err);
    } finally {
      setDeleting(false);
    }
  };

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

  const statTiles = [
    {
      label: 'Total Active',
      value: stats.total,
      icon: Briefcase,
      tab: 'all' as const,
      iconTile:
        'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    },
    {
      label: 'Today',
      value: stats.today,
      icon: Calendar,
      tab: 'today' as const,
      iconTile:
        'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    },
    {
      label: 'Coming Up',
      value: stats.comingUp,
      icon: ArrowRight,
      tab: 'coming_up' as const,
      iconTile:
        'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    },
    {
      label: 'Needs Attention',
      value: stats.needsAttention,
      icon: AlertCircle,
      tab: 'attention' as const,
      iconTile:
        'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
    },
  ];

  return (
    <div
      className="
        min-h-screen p-6
        bg-gradient-to-b from-slate-50 to-white
        dark:from-[#0b0618] dark:to-[#0e0720]
      "
    >
      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-[#1a0d2e] border border-slate-200 dark:border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Delete Job?</h3>
                <p className="text-sm text-slate-500 dark:text-white/60">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 dark:text-white/80 mb-5">
              Permanently remove <span className="font-semibold">{deleteTarget.job_number}</span>
              {deleteTarget.title ? ` — ${deleteTarget.title}` : ''}?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white/80 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Active Jobs
            </h1>
            <p className="text-slate-600 dark:text-white/60 mt-1">
              {viewAll ? 'All company jobs' : 'My assigned jobs'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewAll(!viewAll)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border
                ${viewAll
                  ? 'bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-500/15 dark:border-violet-400/30 dark:text-violet-200'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-white/5 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10'
                }
              `}
            >
              {viewAll ? 'Showing All' : 'My Jobs Only'}
            </button>
            <button
              onClick={fetchJobs}
              disabled={loading}
              className="
                p-2 rounded-lg transition-colors disabled:opacity-50
                bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50
                dark:bg-white/5 dark:border-white/10 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10
              "
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stats / quick filters */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statTiles.map(stat => {
            const active = filter === stat.tab;
            return (
              <button
                key={stat.tab}
                onClick={() => setFilter(stat.tab)}
                className={`
                  group relative overflow-hidden rounded-2xl p-4 text-left transition-all
                  bg-white border shadow-sm hover:shadow-md
                  dark:bg-gradient-to-br dark:from-[#180c2c]/80 dark:to-[#0e0720]/80 dark:backdrop-blur
                  ${active
                    ? 'border-violet-400 ring-2 ring-violet-200 dark:border-violet-400/60 dark:ring-violet-500/30'
                    : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20'
                  }
                `}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-slate-500 dark:text-white/60 text-sm font-medium">
                    {stat.label}
                  </span>
                  <span
                    className={`
                      inline-flex items-center justify-center w-9 h-9 rounded-xl
                      ${stat.iconTile}
                    `}
                  >
                    <stat.icon className="w-4 h-4" />
                  </span>
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {stat.value}
                </div>
              </button>
            );
          })}
        </div>

        {/* Filter tabs — pill style, active uses purple gradient */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {([
            ['all', 'All'],
            ['today', 'Today'],
            ['coming_up', 'Coming Up'],
            ['attention', 'Needs Attention'],
          ] as const).map(([val, label]) => {
            const active = filter === val;
            return (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`
                  px-4 py-2 rounded-full text-sm font-medium transition-all relative
                  ${active
                    ? 'bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white shadow-md shadow-violet-500/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10'
                  }
                `}
              >
                {label}
                {val === 'attention' && stats.needsAttention > 0 && (
                  <span className={`
                    ml-2 text-xs rounded-full px-1.5 py-0.5 font-semibold
                    ${active
                      ? 'bg-white/25 text-white'
                      : 'bg-rose-500 text-white'
                    }
                  `}>
                    {stats.needsAttention}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Job list */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="
            rounded-2xl p-12 text-center shadow-sm
            bg-white border border-slate-200
            dark:bg-white/5 dark:border-white/10 dark:backdrop-blur
          ">
            <Briefcase className="w-12 h-12 text-slate-300 dark:text-white/20 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-white/60">No jobs match this filter</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(job => {
              const accent = STATUS_ACCENT[job.status] ?? STATUS_ACCENT.scheduled;
              return (
                <Link
                  key={job.id}
                  href={`/dashboard/admin/jobs/${job.id}`}
                  className="
                    group relative block w-full overflow-hidden rounded-2xl p-4 pt-5 text-left transition-all
                    bg-white border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md
                    dark:bg-gradient-to-br dark:from-[#180c2c]/80 dark:to-[#0e0720]/80
                    dark:border-white/10 dark:hover:border-white/20 dark:backdrop-blur
                  "
                >
                  {/* Top accent bar */}
                  <span
                    className={`
                      absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${accent}
                    `}
                    aria-hidden
                  />

                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="text-xs font-mono text-slate-500 dark:text-white/50">
                          {job.job_number}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            STATUS_COLORS[job.status] ?? STATUS_COLORS.scheduled
                          }`}
                        >
                          {job.status?.replace(/_/g, ' ')}
                        </span>
                        {(job.pending_change_requests ?? 0) > 0 && (
                          <span className="
                            text-xs px-2 py-0.5 rounded-full font-medium
                            bg-amber-100 text-amber-700 ring-1 ring-amber-200
                            dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30
                          ">
                            {job.pending_change_requests} change request{job.pending_change_requests !== 1 ? 's' : ''}
                          </span>
                        )}
                        {job.pending_completion_approval && (
                          <span className="
                            text-xs px-2 py-0.5 rounded-full font-medium
                            bg-violet-100 text-violet-700 ring-1 ring-violet-200
                            dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30
                          ">
                            Awaiting approval
                          </span>
                        )}
                        {(job.operator_notes_count ?? 0) > 0 && (
                          <span className="
                            inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium
                            bg-sky-100 text-sky-700 ring-1 ring-sky-200
                            dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/30
                          ">
                            <StickyNote className="w-3 h-3" />
                            {job.operator_notes_count} note{job.operator_notes_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <h3 className="text-slate-900 dark:text-white font-semibold truncate">
                        {job.title || job.customer_name}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-slate-600 dark:text-white/60 flex-wrap">
                        {job.customer_name && job.title && (
                          <span className="text-slate-500 dark:text-white/50 text-xs">
                            {job.customer_name}
                          </span>
                        )}
                        {job.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {job.address}
                          </span>
                        )}
                        {job.assigned_operator_name && (
                          <span className="flex items-center gap-1">
                            {/* Operator initial bubble in purple gradient */}
                            <span
                              className="
                                inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white
                                bg-gradient-to-br from-violet-500 to-fuchsia-500
                              "
                              aria-hidden
                            >
                              {job.assigned_operator_name.trim().charAt(0).toUpperCase()}
                            </span>
                            {job.assigned_operator_name}
                            {job.helper_assigned_name && (
                              <span className="text-xs text-slate-500 dark:text-white/50 ml-1">
                                + {job.helper_assigned_name}
                              </span>
                            )}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {job.scheduled_date}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(job); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete job"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ChevronRight className="w-5 h-5 text-slate-400 dark:text-white/40 mt-1 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
