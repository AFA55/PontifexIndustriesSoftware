'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Link2, ExternalLink, Plus, ChevronDown, ChevronUp,
  Calendar, DollarSign, Loader2, AlertCircle, CheckCircle2, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface RelatedJob {
  id: string;
  job_number: string;
  status: string;
  scheduled_date: string | null;
  estimated_cost: number | null;
  project_name?: string | null;
  customer_name?: string | null;
}

interface RelatedJobsData {
  parent: RelatedJob | null;
  continuations: RelatedJob[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function apiFetch(url: string, opts?: RequestInit) {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...opts?.headers,
    },
  });
}

function formatCurrency(n: number | null) {
  if (n == null) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_BADGE: Record<string, string> = {
  scheduled:          'bg-blue-100 text-blue-700 border-blue-200',
  assigned:           'bg-indigo-100 text-indigo-700 border-indigo-200',
  in_route:           'bg-cyan-100 text-cyan-700 border-cyan-200',
  in_progress:        'bg-orange-100 text-orange-700 border-orange-200',
  pending_completion: 'bg-amber-100 text-amber-700 border-amber-200',
  completed:          'bg-green-100 text-green-700 border-green-200',
  cancelled:          'bg-gray-100 text-gray-600 border-gray-200',
};

function StatusBadge({ status }: { status: string }) {
  const classes = STATUS_BADGE[status] || 'bg-gray-100 text-gray-600 border-gray-200';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${classes}`}>
      {label}
    </span>
  );
}

// ─── Job Card ────────────────────────────────────────────────────────────────────

function RelatedJobCard({ job, label }: { job: RelatedJob; label?: string }) {
  return (
    <Link
      href={`/dashboard/admin/jobs/${job.id}`}
      className="block bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 p-4 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {label && (
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">{label}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white">{job.job_number}</span>
            <StatusBadge status={job.status} />
          </div>
          {job.project_name && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{job.project_name}</p>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {job.scheduled_date && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Calendar className="w-3 h-3" />
                {formatDate(job.scheduled_date)}
              </span>
            )}
            {job.estimated_cost != null && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <DollarSign className="w-3 h-3" />
                {formatCurrency(job.estimated_cost)}
              </span>
            )}
          </div>
        </div>
        <ExternalLink className="w-4 h-4 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
      </div>
    </Link>
  );
}

// ─── New Scope Modal ─────────────────────────────────────────────────────────────

function NewScopeModal({
  jobId,
  jobNumber,
  onClose,
  onSuccess,
}: {
  jobId: string;
  jobNumber: string;
  onClose: () => void;
  onSuccess: (newJobId: string, newJobNumber: string) => void;
}) {
  const [scheduledDate, setScheduledDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scopeDescription, setScopeDescription] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledDate) { setError('Scheduled date is required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/new-scope`, {
        method: 'POST',
        body: JSON.stringify({
          scheduled_date: scheduledDate,
          end_date: endDate || undefined,
          scope_description: scopeDescription.trim() || undefined,
          estimated_cost: estimatedCost ? parseFloat(estimatedCost) : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to create continuation job');
      }
      const json = await res.json();
      onSuccess(json.data.id, json.data.job_number);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Link2 className="w-4 h-4 text-indigo-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Create Continuation Job</h2>
              <p className="text-xs text-gray-500">Based on {jobNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100">
          <p className="text-xs text-indigo-700">
            Creates a new job ticket with the same customer and site details as {jobNumber}.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Scheduled Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                End Date (optional)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              What work needs to be done?
            </label>
            <textarea
              value={scopeDescription}
              onChange={e => setScopeDescription(e.target.value)}
              rows={3}
              placeholder="Describe the scope of work for this continuation..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Estimated Cost ($)
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                value={estimatedCost}
                onChange={e => setEstimatedCost(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional notes..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create New Scope Job
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Success Banner ──────────────────────────────────────────────────────────────

function NewJobSuccessBanner({ jobId, jobNumber, onDismiss }: { jobId: string; jobNumber: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
        <span className="text-sm text-green-300">
          Created <span className="font-bold">{jobNumber}</span>
        </span>
        <Link
          href={`/dashboard/admin/jobs/${jobId}`}
          target="_blank"
          className="flex items-center gap-1 text-xs font-bold text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
        >
          View New Job <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <button onClick={onDismiss} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
        <X className="w-3.5 h-3.5 text-gray-400" />
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────────

export default function RelatedJobsSection({
  jobId,
  jobNumber,
  isAdmin,
}: {
  jobId: string;
  jobNumber: string;
  isAdmin: boolean;
}) {
  const [data, setData] = useState<RelatedJobsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newJob, setNewJob] = useState<{ id: string; job_number: string } | null>(null);

  const fetchRelatedJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/related-jobs`);
      if (!res.ok) throw new Error('Failed to load related jobs');
      const json = await res.json();
      setData(json.data || { parent: null, continuations: [] });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading related jobs');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchRelatedJobs();
  }, [fetchRelatedJobs]);

  const totalRelated = (data?.parent ? 1 : 0) + (data?.continuations?.length || 0);

  return (
    <>
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        {/* Section Header */}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">
              <Link2 className="w-4 h-4 text-indigo-400" />
            </div>
            <h3 className="text-sm font-bold text-white">Related Jobs</h3>
            {totalRelated > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {totalRelated}
              </span>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {open && (
          <div className="px-6 pb-6 space-y-4">
            {/* Success banner after creating a new job */}
            {newJob && (
              <NewJobSuccessBanner
                jobId={newJob.id}
                jobNumber={newJob.job_number}
                onDismiss={() => setNewJob(null)}
              />
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Parent job */}
            {!loading && data?.parent && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Parent Job</p>
                <RelatedJobCard job={data.parent} label="Parent" />
              </div>
            )}

            {/* Continuation jobs */}
            {!loading && data && data.continuations.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Continuation Jobs ({data.continuations.length})
                </p>
                <div className="space-y-2">
                  {data.continuations.map(job => (
                    <RelatedJobCard key={job.id} job={job} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && totalRelated === 0 && !newJob && (
              <div className="text-center py-6 text-gray-500 text-sm">
                No related jobs yet.
              </div>
            )}

            {/* Add New Scope button */}
            {isAdmin && (
              <button
                onClick={() => setShowModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-indigo-500/40 rounded-xl text-sm font-semibold text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-500/60 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add New Scope / Continuation Job
              </button>
            )}
          </div>
        )}
      </div>

      {/* New Scope Modal */}
      {showModal && (
        <NewScopeModal
          jobId={jobId}
          jobNumber={jobNumber}
          onClose={() => setShowModal(false)}
          onSuccess={(newId, newJobNum) => {
            setShowModal(false);
            setNewJob({ id: newId, job_number: newJobNum });
            fetchRelatedJobs();
          }}
        />
      )}
    </>
  );
}
