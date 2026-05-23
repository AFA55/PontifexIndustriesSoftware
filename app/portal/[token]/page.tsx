'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  CheckCircle2,
  Calendar,
  MapPin,
  FileText,
  Clock,
  AlertTriangle,
  ExternalLink,
  PenTool,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingJob {
  job_number: string;
  project_name: string | null;
  address: string | null;
  scheduled_date: string | null;
}

interface JobHistoryItem {
  id: string;
  job_number: string;
  project_name: string | null;
  scheduled_date: string | null;
  status: string;
  address: string | null;
  customer_signature: boolean;
  total_cost: number | null;
  completed_at: string | null;
}

interface PortalData {
  customer_name: string;
  tenant_name: string;
  tenant_logo_url: string | null;
  tenant_primary_color: string | null;
  pending_job: PendingJob | null;
  pending_signature_token: string | null;
  job_history: JobHistoryItem[];
  expires_at: string;
}

type PageState = 'loading' | 'ready' | 'expired' | 'not_found' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
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
    case 'pending':
    case 'scheduled':
      return { label: 'Scheduled', classes: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' };
    default:
      return { label: status.replace(/_/g, ' '), classes: 'bg-slate-500/20 text-slate-300 border border-slate-500/30' };
  }
}

// ─── Skeleton loading card ────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-4 bg-white/10 rounded w-24" />
        <div className="h-5 bg-white/10 rounded-full w-20" />
      </div>
      <div className="h-3 bg-white/10 rounded w-40" />
      <div className="h-3 bg-white/10 rounded w-32" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CustomerPortalPage() {
  const params = useParams();
  const token = params.token as string;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [data, setData] = useState<PortalData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    fetchPortal();
  }, [token]);

  const fetchPortal = async () => {
    try {
      const res = await fetch(`/api/public/portal/${token}`);

      if (res.status === 404) {
        setPageState('not_found');
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
      setData(json);
      setPageState('ready');
    } catch {
      setErrorMessage('Unable to load. Please check your connection and try again.');
      setPageState('error');
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white">
        {/* Skeleton header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-900/60 to-slate-900 border-b border-white/10">
          <div className="container mx-auto px-4 py-6 max-w-lg">
            <div className="flex items-center gap-3 mb-5 animate-pulse">
              <div className="w-12 h-12 rounded-xl bg-white/10" />
              <div className="space-y-2">
                <div className="h-4 bg-white/10 rounded w-36" />
                <div className="h-3 bg-white/10 rounded w-24" />
              </div>
            </div>
            <div className="h-6 bg-white/10 rounded w-64 animate-pulse" />
          </div>
        </div>

        {/* Skeleton body */}
        <div className="container mx-auto px-4 py-6 max-w-lg space-y-4">
          {/* Pending card skeleton */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 animate-pulse space-y-3">
            <div className="h-5 bg-amber-400/20 rounded w-48" />
            <div className="h-3 bg-amber-400/10 rounded w-32" />
            <div className="h-12 bg-amber-400/20 rounded-xl" />
          </div>

          {/* History skeletons */}
          <div className="h-5 bg-white/10 rounded w-32 animate-pulse" />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
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
          <h1 className="text-xl font-bold text-white mb-2">Invalid Link</h1>
          <p className="text-sm text-rose-200/80">
            This link is invalid or no longer active. Please check your link or contact your service provider.
          </p>
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
  const { pending_job, pending_signature_token, job_history, expires_at } = data!;
  const expiresInDays = daysUntil(expires_at);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-900/60 to-slate-900 border-b border-white/10">
        <div className="container mx-auto px-4 py-6 max-w-lg">

          {/* Company branding */}
          <div className="flex items-center gap-3 mb-5">
            {data!.tenant_logo_url ? (
              <img
                src={data!.tenant_logo_url}
                alt={data!.tenant_name}
                className="w-12 h-12 rounded-xl object-contain bg-white/10 p-1"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-indigo-600/70 flex items-center justify-center shadow-lg flex-shrink-0">
                <Shield className="w-7 h-7 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-tight">
                {data!.tenant_name}
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Shield className="w-3 h-3 text-emerald-400" />
                <span className="text-xs text-slate-400">Secure Customer Portal</span>
              </div>
            </div>
          </div>

          {/* Greeting */}
          <p className="text-slate-300 text-sm leading-relaxed">
            <span className="text-white font-semibold">Hi {data!.customer_name},</span> here&apos;s your
            job history with {data!.tenant_name}.
          </p>

          {/* Portal subtitle */}
          <p className="text-xs text-slate-500 mt-2">
            This link expires in {expiresInDays} day{expiresInDays !== 1 ? 's' : ''}.
          </p>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="container mx-auto px-4 py-6 max-w-lg space-y-6 pb-12">

        {/* ── Pending Signature Card ────────────────────────────────────────── */}
        {pending_job && pending_signature_token && (
          <div className="bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-400/40 rounded-2xl p-5 shadow-lg shadow-amber-900/20">
            {/* Badge */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1.5 bg-amber-500/20 text-amber-300 text-xs font-semibold px-3 py-1 rounded-full border border-amber-400/30">
                <PenTool className="w-3 h-3" />
                Action Required
              </div>
            </div>

            <h2 className="text-base font-bold text-white mb-1">
              Please sign your completion form
            </h2>
            <p className="text-sm text-amber-200/70 mb-4">
              Your signature is needed to finalize this job.
            </p>

            {/* Job detail row */}
            <div className="bg-black/20 rounded-xl p-4 space-y-2 mb-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-slate-400">{pending_job.job_number}</span>
                {pending_job.project_name && (
                  <span className="text-xs text-white font-medium truncate max-w-[180px] text-right">
                    {pending_job.project_name}
                  </span>
                )}
              </div>

              {pending_job.address && (
                <div className="flex items-start gap-2 text-xs text-slate-300">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                  <span>{pending_job.address}</span>
                </div>
              )}

              {pending_job.scheduled_date && (
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span>{formatDate(pending_job.scheduled_date)}</span>
                </div>
              )}
            </div>

            {/* CTA */}
            <Link
              href={`/sign/${pending_signature_token}`}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold text-sm py-4 rounded-xl shadow-lg shadow-amber-900/30 transition-all active:scale-[0.98]"
            >
              <PenTool className="w-4 h-4" />
              Sign Now
              <ExternalLink className="w-3.5 h-3.5 ml-0.5 opacity-80" />
            </Link>
          </div>
        )}

        {/* ── Job History Section ───────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-200">Your Job History</h2>
            {job_history.length > 0 && (
              <span className="text-xs bg-white/10 text-slate-400 px-2 py-0.5 rounded-full">
                {job_history.length}
              </span>
            )}
          </div>

          {job_history.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
              <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No previous jobs found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {job_history.map((job) => {
                const { label, classes } = statusConfig(job.status);
                const displayName = job.project_name || data!.customer_name;
                const dateToShow = job.completed_at || job.scheduled_date;

                return (
                  <div
                    key={job.id}
                    className="bg-white/5 hover:bg-white/8 border border-white/10 rounded-2xl p-4 transition-colors"
                  >
                    {/* Top row: name + status */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate leading-tight">
                          {displayName}
                        </p>
                        <p className="text-xs font-mono text-slate-500 mt-0.5">{job.job_number}</p>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${classes}`}>
                          {label}
                        </span>
                        {job.customer_signature && (
                          <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            Signed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Meta row: date + address */}
                    <div className="space-y-1.5">
                      {dateToShow && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{formatDate(dateToShow)}</span>
                        </div>
                      )}

                      {job.address && (
                        <div className="flex items-start gap-2 text-xs text-slate-400">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{job.address}</span>
                        </div>
                      )}

                      {job.total_cost != null && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
                          <span className="text-xs text-slate-500">Total</span>
                          <span className="text-sm font-semibold text-white">
                            {formatCost(job.total_cost)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 pt-2">
          Powered by {data!.tenant_name}
        </p>
      </div>
    </div>
  );
}
