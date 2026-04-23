'use client';

import { useState, useEffect, useMemo } from 'react';
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
  Hammer,
  Gauge,
  Sparkles,
} from 'lucide-react';
import RevealSection from '@/components/RevealSection';
import ActiveJobsSkeleton from './_skeleton';

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
  // TODO(api): expose overall_pct from /api/admin/active-jobs so list shows progress without an N+1
  overall_pct?: number;
  // TODO(api): expose scope.total_target / total_completed so list can show "X / Y LF"
}

// Color-coded status pills — dark/glass treatments tuned for the purple theme.
const STATUS_PILL: Record<string, { label: string; cls: string; dot: string }> = {
  scheduled:          { label: 'Scheduled',     cls: 'bg-blue-500/15 text-blue-200 ring-1 ring-blue-400/30',           dot: 'bg-blue-400' },
  assigned:           { label: 'Assigned',      cls: 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/30',              dot: 'bg-sky-400' },
  in_route:           { label: 'In Route',      cls: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30',        dot: 'bg-amber-400' },
  on_site:            { label: 'On Site',       cls: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30',  dot: 'bg-emerald-400' },
  in_progress:        { label: 'In Progress',   cls: 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/30',     dot: 'bg-violet-400' },
  pending_approval:   { label: 'Pending Review',cls: 'bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/30',     dot: 'bg-orange-400' },
  pending_completion: { label: 'Pending Review',cls: 'bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/30',     dot: 'bg-orange-400' },
  completed:          { label: 'Completed',     cls: 'bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/30',        dot: 'bg-slate-400' },
  cancelled:          { label: 'Cancelled',     cls: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30',           dot: 'bg-rose-400' },
};

function getStatusPill(status: string) {
  return STATUS_PILL[status] || STATUS_PILL.scheduled;
}

function getInitials(name?: string | null) {
  if (!name) return '—';
  return name
    .split(/\s+/)
    .map(s => s.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function skillChipColor(type?: string) {
  const t = (type || '').toLowerCase();
  if (t.includes('wall')) return 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/30';
  if (t.includes('core')) return 'bg-cyan-500/15 text-cyan-200 ring-cyan-400/30';
  if (t.includes('wire')) return 'bg-pink-500/15 text-pink-200 ring-pink-400/30';
  if (t.includes('flat') || t.includes('slab')) return 'bg-indigo-500/15 text-indigo-200 ring-indigo-400/30';
  if (t.includes('efs') || t.includes('early')) return 'bg-teal-500/15 text-teal-200 ring-teal-400/30';
  return 'bg-purple-500/15 text-purple-200 ring-purple-400/30';
}

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

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrow = useMemo(
    () => new Date(Date.now() + 86400000).toISOString().split('T')[0],
    []
  );

  const filtered = jobs.filter(j => {
    if (filter === 'today') return j.scheduled_date === today;
    if (filter === 'coming_up') return j.scheduled_date === tomorrow;
    if (filter === 'attention') return (j.pending_change_requests ?? 0) > 0 || j.pending_completion_approval;
    return true;
  });

  const stats = {
    total: jobs.length,
    today: jobs.filter(j => j.scheduled_date === today).length,
    comingUp: jobs.filter(j => j.scheduled_date === tomorrow).length,
    needsAttention: jobs.filter(
      j => (j.pending_change_requests ?? 0) > 0 || j.pending_completion_approval
    ).length,
  };

  if (loading && jobs.length === 0) {
    return <ActiveJobsSkeleton />;
  }

  const tabs: Array<{
    key: typeof filter;
    label: string;
    value: number;
    icon: typeof Briefcase;
    grad: string;
    iconCls: string;
  }> = [
    { key: 'all',        label: 'Total Active',    value: stats.total,          icon: Briefcase,    grad: 'from-purple-500/30 to-fuchsia-500/10',  iconCls: 'text-purple-300' },
    { key: 'today',      label: 'Today',           value: stats.today,          icon: Calendar,     grad: 'from-emerald-500/30 to-teal-500/10',    iconCls: 'text-emerald-300' },
    { key: 'coming_up',  label: 'Coming Up',       value: stats.comingUp,       icon: ArrowRight,   grad: 'from-sky-500/30 to-blue-500/10',        iconCls: 'text-sky-300' },
    { key: 'attention',  label: 'Needs Attention', value: stats.needsAttention, icon: AlertCircle,  grad: 'from-orange-500/30 to-rose-500/10',     iconCls: 'text-orange-300' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b0714] via-[#110a24] to-[#0b0714] text-white">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-60">
        <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute top-40 right-0 h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto p-6">
        {/* Header */}
        <RevealSection delay={0}>
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-purple-300/80">
                <Sparkles className="w-3.5 h-3.5" />
                Operations
              </div>
              <h1 className="mt-1 text-3xl font-bold bg-gradient-to-r from-white via-purple-100 to-purple-300 bg-clip-text text-transparent">
                Active Jobs
              </h1>
              <p className="text-sm text-purple-200/60 mt-1">
                {viewAll ? 'All company jobs in motion' : 'Jobs assigned to you'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewAll(!viewAll)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border backdrop-blur
                  ${viewAll
                    ? 'bg-purple-500/20 border-purple-400/40 text-purple-100 shadow-[0_0_20px_-8px_rgba(168,85,247,0.6)]'
                    : 'bg-white/5 border-white/10 text-purple-100/80 hover:bg-white/10'
                  }`}
              >
                {viewAll ? 'Showing All' : 'My Jobs Only'}
              </button>
              <button
                onClick={fetchJobs}
                disabled={loading}
                className="p-2 bg-white/5 border border-white/10 rounded-lg text-purple-100/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                aria-label="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </RevealSection>

        {/* Stats */}
        <RevealSection delay={60}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {tabs.map(stat => {
              const active = filter === stat.key;
              return (
                <button
                  key={stat.key}
                  onClick={() => setFilter(stat.key)}
                  className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all
                    ${active
                      ? 'border-purple-400/60 bg-gradient-to-br ' + stat.grad + ' shadow-[0_0_30px_-10px_rgba(168,85,247,0.6)]'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20'
                    }`}
                >
                  {/* top accent bar */}
                  <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${stat.grad}`} />
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-purple-100/60">
                      {stat.label}
                    </span>
                    <span className={`w-8 h-8 rounded-lg bg-white/5 ring-1 ring-white/10 flex items-center justify-center ${stat.iconCls}`}>
                      <stat.icon className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="text-3xl font-bold tracking-tight text-white">
                    {stat.value}
                  </div>
                </button>
              );
            })}
          </div>
        </RevealSection>

        {/* Filter chips */}
        <RevealSection delay={120}>
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
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border
                  ${filter === val
                    ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 border-transparent text-white shadow-[0_4px_20px_-6px_rgba(168,85,247,0.7)]'
                    : 'bg-white/5 border-white/10 text-purple-100/70 hover:text-white hover:bg-white/10'}`}
              >
                {label}
                {val === 'attention' && stats.needsAttention > 0 && (
                  <span className="ml-2 bg-orange-400 text-orange-950 text-xs rounded-full px-1.5 py-0.5 font-bold">
                    {stats.needsAttention}
                  </span>
                )}
              </button>
            ))}
          </div>
        </RevealSection>

        {/* Cards */}
        <RevealSection delay={180}>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center backdrop-blur">
              <Briefcase className="w-12 h-12 text-purple-300/40 mx-auto mb-3" />
              <p className="text-purple-100/60">No jobs match this filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(job => {
                const pill = getStatusPill(job.status);
                const pct = Math.max(0, Math.min(100, Number(job.overall_pct ?? 0)));
                const hasProgress = typeof job.overall_pct === 'number';
                return (
                  <Link
                    key={job.id}
                    href={`/dashboard/admin/jobs/${job.id}`}
                    className="group relative block text-left rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-[1px] hover:border-purple-400/40 transition-all"
                  >
                    {/* Inner card */}
                    <div className="relative rounded-2xl bg-gradient-to-br from-[#180c2c]/80 to-[#0e0720]/80 backdrop-blur-sm p-4 h-full">
                      {/* Top accent */}
                      <div className={`absolute inset-x-0 top-0 h-[2px] ${pill.dot} opacity-80`} />

                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-mono text-purple-300/70 bg-white/5 ring-1 ring-white/10 rounded px-1.5 py-0.5">
                            {job.job_number}
                          </span>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${pill.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`} />
                            {pill.label}
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-purple-300/40 group-hover:text-purple-200 group-hover:translate-x-0.5 transition-all" />
                      </div>

                      {/* Title */}
                      <h3 className="text-white font-semibold truncate leading-snug">
                        {job.customer_name || job.title || 'Untitled'}
                      </h3>
                      {job.title && job.customer_name && (
                        <p className="text-xs text-purple-200/60 mt-0.5 truncate">
                          {job.title}
                        </p>
                      )}

                      {/* Chips row */}
                      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                        {job.job_type && (
                          <span className={`inline-flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wider rounded-full px-2 py-0.5 ring-1 ${skillChipColor(job.job_type)}`}>
                            <Hammer className="w-3 h-3" />
                            {job.job_type.replace(/_/g, ' ')}
                          </span>
                        )}
                        {(job.pending_change_requests ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-medium rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30">
                            {job.pending_change_requests} change{job.pending_change_requests !== 1 ? 's' : ''}
                          </span>
                        )}
                        {job.pending_completion_approval && (
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-medium rounded-full px-2 py-0.5 bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/30">
                            Awaiting approval
                          </span>
                        )}
                      </div>

                      {/* Meta grid */}
                      <div className="grid grid-cols-2 gap-2 mt-4 text-[12px] text-purple-100/70">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Calendar className="w-3.5 h-3.5 text-purple-300/60 flex-shrink-0" />
                          <span className="truncate">{formatDate(job.scheduled_date)}</span>
                        </div>
                        {job.address && (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <MapPin className="w-3.5 h-3.5 text-purple-300/60 flex-shrink-0" />
                            <span className="truncate">{job.address}</span>
                          </div>
                        )}
                      </div>

                      {/* Operator row */}
                      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {job.assigned_operator_name ? (
                            <>
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center text-[11px] font-bold text-white ring-2 ring-purple-400/30 flex-shrink-0">
                                {getInitials(job.assigned_operator_name)}
                              </div>
                              <span className="text-xs text-purple-100/80 truncate">
                                {job.assigned_operator_name}
                              </span>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-purple-300/50">
                              <User className="w-3.5 h-3.5" />
                              Unassigned
                            </span>
                          )}
                        </div>

                        {hasProgress && (
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-100/80">
                            <Gauge className="w-3 h-3 text-purple-300/70" />
                            {pct}%
                          </div>
                        )}
                      </div>

                      {/* Progress bar */}
                      {hasProgress && (
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </RevealSection>
      </div>
    </div>
  );
}
