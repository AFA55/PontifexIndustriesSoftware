'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  Calendar,
  MapPin,
  FileText,
  Clock,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Truck,
  Flag,
  Wrench,
  User,
  Download,
} from 'lucide-react';
import { parseYMDLocal, formatTime } from '@/lib/dates';
import CommentThread from '@/components/portal/CommentThread';
import LiveRouteTracker from '@/components/portal/LiveRouteTracker';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkItem {
  work_type: string | null;
  quantity: number | null;
  notes: string | null;
  core_quantity: number | null;
  core_size: string | null;
  linear_feet_cut: number | null;
  created_at: string | null;
}

interface JobDetail {
  id: string;
  job_number: string;
  project_name: string | null;
  customer_name: string | null;
  job_type: string | null;
  address: string | null;
  location: string | null;
  description: string | null;
  scope_of_work: string | null;
  scheduled_date: string | null;
  status: string;
  total_cost: number | null;
  customer_signature: boolean | null;
  completed_at: string | null;
  work_completed_at: string | null;
  completion_pdf_url: string | null;
  in_route_at: string | null;
  arrived_at_jobsite_at: string | null;
  work_started_at: string | null;
  total_hours_worked: number | null;
  total_days_worked: number | null;
  operator_name: string | null;
}

interface JobResponse {
  job: JobDetail;
  work_items: WorkItem[];
  daily_logs: unknown[];
  change_orders: unknown[];
  tenant: {
    name: string;
    logo_url: string | null;
    primary_color: string | null;
  };
}

type PageState = 'loading' | 'ready' | 'expired' | 'not_found' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  // Bare 'YYYY-MM-DD' from a Postgres date column → parse local to avoid the
  // off-by-one timezone bug. Timestamps (with a 'T') parse fine via new Date.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? parseYMDLocal(dateStr) : new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatCost(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function statusConfig(status: string): { label: string; classes: string } {
  switch (status) {
    case 'completed':
      return { label: 'Completed', classes: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' };
    case 'in_progress':
      return { label: 'In Progress', classes: 'bg-sky-500/20 text-sky-300 border border-sky-500/30' };
    case 'in_route':
      return { label: 'On the Way', classes: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' };
    case 'arrived':
      return { label: 'On Site', classes: 'bg-sky-500/20 text-sky-300 border border-sky-500/30' };
    case 'pending':
    case 'scheduled':
      return { label: 'Scheduled', classes: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' };
    default:
      return { label: status.replace(/_/g, ' '), classes: 'bg-slate-500/20 text-slate-300 border border-slate-500/30' };
  }
}

// A timeline of the job's lifecycle. A step is "done" once its timestamp exists.
function buildTimeline(job: JobDetail) {
  return [
    {
      key: 'scheduled',
      label: 'Scheduled',
      icon: Calendar,
      at: job.scheduled_date,
      isDate: true,
      done: !!job.scheduled_date,
    },
    {
      key: 'in_route',
      label: 'On the Way',
      icon: Truck,
      at: job.in_route_at,
      isDate: false,
      done: !!job.in_route_at,
    },
    {
      key: 'arrived',
      label: 'Arrived On Site',
      icon: Flag,
      at: job.arrived_at_jobsite_at,
      isDate: false,
      done: !!job.arrived_at_jobsite_at,
    },
    {
      key: 'work_started',
      label: 'Work Started',
      icon: Wrench,
      at: job.work_started_at,
      isDate: false,
      done: !!job.work_started_at,
    },
    {
      key: 'completed',
      label: 'Completed',
      icon: CheckCircle2,
      at: job.work_completed_at || job.completed_at,
      isDate: false,
      done: !!(job.work_completed_at || job.completed_at),
    },
  ];
}

function describeWorkItem(item: WorkItem): string {
  const parts: string[] = [];
  if (item.work_type) parts.push(item.work_type.replace(/_/g, ' '));
  if (item.linear_feet_cut != null) parts.push(`${item.linear_feet_cut} ln ft`);
  if (item.core_quantity != null) {
    parts.push(`${item.core_quantity} core${item.core_quantity !== 1 ? 's' : ''}${item.core_size ? ` (${item.core_size})` : ''}`);
  }
  if (item.quantity != null && item.core_quantity == null && item.linear_feet_cut == null) {
    parts.push(`qty ${item.quantity}`);
  }
  return parts.join(' · ') || 'Work item';
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PortalJobDetailPage() {
  const params = useParams();
  const token = params.token as string;
  const jobId = params.jobId as string;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [data, setData] = useState<JobResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/portal/${token}/job/${jobId}`);

      if (res.status === 404) {
        setPageState('not_found');
        return;
      }
      if (res.status === 410) {
        setPageState('expired');
        return;
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.error === 'expired') {
          setPageState('expired');
          return;
        }
        setErrorMessage(errData.error || 'Something went wrong. Please try again.');
        setPageState('error');
        return;
      }

      const json = await res.json();
      setData(json.data);
      setPageState('ready');
    } catch {
      setErrorMessage('Unable to load. Please check your connection and try again.');
      setPageState('error');
    }
  }, [token, jobId]);

  useEffect(() => {
    if (!token || !jobId) return;
    fetchJob();
  }, [token, jobId, fetchJob]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white">
        <div className="container mx-auto px-4 py-6 max-w-lg space-y-4">
          <div className="h-4 bg-white/10 rounded w-24 animate-pulse" />
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse space-y-3">
            <div className="h-5 bg-white/10 rounded w-48" />
            <div className="h-3 bg-white/10 rounded w-32" />
            <div className="h-3 bg-white/10 rounded w-40" />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse space-y-3">
            <div className="h-4 bg-white/10 rounded w-28" />
            <div className="h-3 bg-white/10 rounded w-full" />
            <div className="h-3 bg-white/10 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  // ── Expired ──────────────────────────────────────────────────────────────
  if (pageState === 'expired') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-amber-500/10 border border-amber-500/30 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Link Expired</h1>
          <p className="text-sm text-amber-200/80">
            This portal link has expired. Please contact your service provider for a new link.
          </p>
        </div>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (pageState === 'not_found') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-rose-500/10 border border-rose-500/30 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-rose-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Job Not Found</h1>
          <p className="text-sm text-rose-200/80">
            This job is unavailable or the link is invalid. Please contact your service provider.
          </p>
          <Link
            href={`/portal/${token}`}
            className="inline-flex items-center gap-2 mt-5 text-sm text-rose-200 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to your portal
          </Link>
        </div>
      </div>
    );
  }

  // ── Generic error ─────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-rose-500/10 border border-rose-500/30 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-rose-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Something Went Wrong</h1>
          <p className="text-sm text-rose-200/80">{errorMessage}</p>
        </div>
      </div>
    );
  }

  // ── Ready ─────────────────────────────────────────────────────────────────
  const { job, work_items, tenant } = data!;
  const { label, classes } = statusConfig(job.status);
  const timeline = buildTimeline(job);
  const displayName = job.project_name || job.customer_name || job.job_number;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-900/60 to-slate-900 border-b border-white/10">
        <div className="container mx-auto px-4 py-6 max-w-lg">
          {/* Company branding */}
          <div className="flex items-center gap-3 mb-4">
            {tenant.logo_url ? (
              <img
                src={tenant.logo_url}
                alt={tenant.name}
                className="w-12 h-12 rounded-xl object-contain bg-white/10 p-1"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-xl bg-brand flex items-center justify-center shadow-lg flex-shrink-0"
                style={tenant.primary_color ? { backgroundColor: tenant.primary_color } : undefined}
              >
                <Shield className="w-7 h-7 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-tight">
                {tenant.name}
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Shield className="w-3 h-3 text-emerald-400" />
                <span className="text-xs text-slate-400">Secure Customer Portal</span>
              </div>
            </div>
          </div>

          {/* Back link */}
          <Link
            href={`/portal/${token}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors py-1 -ml-1 px-1 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to your jobs
          </Link>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="container mx-auto px-4 py-6 max-w-lg space-y-6 pb-12">

        {/* LiveRouteTracker mounts here (Feature B) — self-hides when active:false */}
        <LiveRouteTracker
          token={token}
          jobId={job.id}
          primaryColor={tenant.primary_color}
          destinationAddress={job.address || job.location}
        />


        {/* ── Job summary card ──────────────────────────────────────────────── */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-white leading-tight break-words">{displayName}</h2>
              <p className="text-xs font-mono text-slate-500 mt-1">{job.job_number}</p>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize flex-shrink-0 ${classes}`}>
              {label}
            </span>
          </div>

          <div className="space-y-2 mt-4">
            {job.job_type && (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Wrench className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="capitalize">{job.job_type.replace(/_/g, ' ')}</span>
              </div>
            )}
            {(job.address || job.location) && (
              <div className="flex items-start gap-2 text-sm text-slate-300">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <span>{job.address || job.location}</span>
              </div>
            )}
            {job.scheduled_date && (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>{formatDate(job.scheduled_date)}</span>
              </div>
            )}
            {job.operator_name && (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>Technician: {job.operator_name}</span>
              </div>
            )}
          </div>

          {(job.scope_of_work || job.description) && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                Scope of Work
              </p>
              <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                {job.scope_of_work || job.description}
              </p>
            </div>
          )}

          {job.total_cost != null && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
              <span className="text-sm text-slate-400">Total</span>
              <span className="text-lg font-bold text-white">{formatCost(job.total_cost)}</span>
            </div>
          )}
        </div>

        {/* ── Timeline card ─────────────────────────────────────────────────── */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-200">Job Timeline</h2>
          </div>

          <ol className="space-y-0">
            {timeline.map((step, i) => {
              const Icon = step.icon;
              const isLast = i === timeline.length - 1;
              return (
                <li key={step.key} className="flex gap-3">
                  {/* Rail */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        step.done
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-white/5 text-slate-500 border border-white/10'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    {!isLast && (
                      <div className={`w-px flex-1 my-1 ${step.done ? 'bg-emerald-500/40' : 'bg-white/10'}`} />
                    )}
                  </div>
                  {/* Label */}
                  <div className={`pb-5 ${isLast ? 'pb-0' : ''}`}>
                    <p className={`text-sm font-medium ${step.done ? 'text-white' : 'text-slate-500'}`}>
                      {step.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {step.done && step.at
                        ? step.isDate
                          ? formatDate(step.at)
                          : formatTime(step.at)
                        : 'Pending'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* ── Work performed card ───────────────────────────────────────────── */}
        {work_items.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wrench className="w-4 h-4 text-slate-400" />
              <h2 className="text-base font-semibold text-slate-200">Work Performed</h2>
              <span className="text-xs bg-white/10 text-slate-400 px-2 py-0.5 rounded-full">
                {work_items.length}
              </span>
            </div>
            <ul className="space-y-3">
              {work_items.map((item, idx) => (
                <li key={idx} className="bg-black/20 rounded-xl p-3">
                  <p className="text-sm font-medium text-white capitalize">{describeWorkItem(item)}</p>
                  {item.notes && (
                    <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap break-words">{item.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Completion document ───────────────────────────────────────────── */}
        {job.completion_pdf_url && (
          <a
            href={job.completion_pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-brand hover:opacity-90 text-white font-semibold text-sm py-4 rounded-xl shadow-lg transition-all active:scale-[0.98] min-h-[44px]"
            style={tenant.primary_color ? { backgroundColor: tenant.primary_color } : undefined}
          >
            <Download className="w-4 h-4" />
            View Completion Report (PDF)
          </a>
        )}

        {/* ── Comment thread ────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-200">Messages</h2>
          </div>
          <CommentThread token={token} jobId={job.id} primaryColor={tenant.primary_color} />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 pt-2">
          Powered by {tenant.name}
        </p>
      </div>
    </div>
  );
}
