'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  User,
  Phone,
  FileText,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Edit3,
  X,
  Loader2,
  ChevronRight,
  Wrench,
  ClipboardList,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  ShieldAlert,
  HardHat,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import JobScopePanel, { type ScopeItem } from '@/components/JobScopePanel';
import JobProgressChart from '@/components/JobProgressChart';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobSummary {
  id: string;
  job_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  contact_name: string | null;
  job_type: string;
  location: string | null;
  address: string | null;
  description: string | null;
  scope_of_work: string | null;
  status: string;
  scheduled_date: string | null;
  end_date: string | null;
  arrival_time: string | null;
  is_will_call: boolean;
  po_number: string | null;
  permit_number: string | null;
  permit_required: boolean;
  notes: string | null;
  internal_notes: string | null;
  operator_name: string | null;
  helper_name: string | null;
  assigned_to: string | null;
  completion_requested_at: string | null;
  completion_request_notes: string | null;
  completion_approved_at: string | null;
  completion_rejected_at: string | null;
  completion_rejection_notes: string | null;
}

interface ActivityEntry {
  id: string;
  date: string | null;
  timestamp: string | null;
  operator_name: string;
  work_type: string;
  quantity: number;
  linear_feet: number;
  cores: number;
  notes: string | null;
  day_number: number | null;
  is_scope_entry?: boolean;
}

interface ChangeRequest {
  id: string;
  request_type: string;
  description: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  requester: { full_name: string } | null;
  reviewer: { full_name: string } | null;
}

interface CompletionRequest {
  id: string;
  status: string;
  operator_notes: string | null;
  submitted_at: string;
  review_notes: string | null;
  submitted_by: string;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTime(time: string | null) {
  if (!time) return null;
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string; accent: string }> = {
  scheduled: {
    label: 'Scheduled',
    bg: 'bg-sky-100 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:ring-sky-400/30',
    text: 'text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
    accent: 'from-sky-400 to-blue-500',
  },
  assigned: {
    label: 'Assigned',
    bg: 'bg-sky-100 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:ring-sky-400/30',
    text: 'text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
    accent: 'from-sky-400 to-indigo-500',
  },
  in_route: {
    label: 'In Route',
    bg: 'bg-amber-100 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:ring-amber-400/30',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    accent: 'from-amber-400 to-orange-500',
  },
  in_progress: {
    label: 'In Progress',
    bg: 'bg-violet-100 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:ring-violet-400/30',
    text: 'text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-500',
    accent: 'from-violet-500 to-fuchsia-500',
  },
  pending_completion: {
    label: 'Pending Review',
    bg: 'bg-orange-100 ring-1 ring-orange-200 dark:bg-orange-500/15 dark:ring-orange-400/30',
    text: 'text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500',
    accent: 'from-orange-400 to-rose-500',
  },
  completed: {
    label: 'Completed',
    bg: 'bg-emerald-100 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:ring-emerald-400/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    accent: 'from-emerald-400 to-teal-500',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'bg-slate-100 ring-1 ring-slate-200 dark:bg-white/10 dark:ring-white/10',
    text: 'text-slate-600 dark:text-white/70',
    dot: 'bg-slate-400',
    accent: 'from-slate-300 to-slate-400',
  },
};

const WORK_TYPE_LABELS: Record<string, string> = {
  wall_sawing: 'Wall Sawing',
  core_drilling: 'Core Drilling',
  wire_sawing: 'Wire Sawing',
  flat_sawing: 'Flat Sawing',
  cleanup: 'Cleanup',
  mobilization: 'Mobilization',
  other: 'Other',
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-64 rounded bg-slate-200 dark:bg-white/10" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-64 rounded-2xl bg-slate-100 dark:bg-white/5" />
          <div className="h-48 rounded-2xl bg-slate-100 dark:bg-white/5" />
        </div>
        <div className="h-80 rounded-2xl bg-slate-100 dark:bg-white/5" />
      </div>
    </div>
  );
}

// ─── Edit Schedule Modal ───────────────────────────────────────────────────────

interface EditScheduleModalProps {
  job: JobSummary;
  onClose: () => void;
  onSaved: () => void;
}

function EditScheduleModal({ job, onClose, onSaved }: EditScheduleModalProps) {
  const [scheduledDate, setScheduledDate] = useState(job.scheduled_date || '');
  const [endDate, setEndDate] = useState(job.end_date || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!scheduledDate) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/jobs/${job.id}/schedule`, {
        method: 'PUT',
        body: JSON.stringify({ scheduled_date: scheduledDate, end_date: endDate || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60">
      <div className="
        w-full max-w-sm p-6 rounded-2xl shadow-2xl
        bg-white
        dark:bg-gradient-to-br dark:from-[#180c2c] dark:to-[#0e0720] dark:border dark:border-white/10
      ">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Edit Schedule</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4 text-slate-500 dark:text-white/60" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-white/80 mb-1">Start Date</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="
                w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500
                bg-white border border-slate-300 text-slate-900
                dark:bg-white/5 dark:border-white/10 dark:text-white dark:[color-scheme:dark]
              "
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-white/80 mb-1">End Date (optional)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={scheduledDate}
              className="
                w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500
                bg-white border border-slate-300 text-slate-900
                dark:bg-white/5 dark:border-white/10 dark:text-white dark:[color-scheme:dark]
              "
            />
          </div>
        </div>

        {error && <p className="text-sm text-rose-600 dark:text-rose-400 mt-3">{error}</p>}

        <div className="flex items-center gap-2 mt-6">
          <button
            onClick={handleSave}
            disabled={saving || !scheduledDate}
            className="
              flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
              text-white bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500
              hover:from-violet-700 hover:via-fuchsia-600 hover:to-pink-600
              disabled:opacity-50 transition-all shadow-sm shadow-violet-500/20
            "
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </button>
          <button
            onClick={onClose}
            className="
              px-4 py-2 text-sm rounded-lg
              text-slate-600 hover:bg-slate-100
              dark:text-white/70 dark:hover:bg-white/10
            "
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const jobId = resolvedParams.id;

  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  const [showEditSchedule, setShowEditSchedule] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Change requests
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [crLoading, setCrLoading] = useState(false);
  const [crReviewing, setCrReviewing] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('admin');

  // Completion request detail
  const [completionRequest, setCompletionRequest] = useState<CompletionRequest | null>(null);

  // Auth guard
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.push('/login'); return; }
    if (!['admin', 'super_admin', 'operations_manager', 'salesman', 'supervisor'].includes(user.role)) {
      router.push('/dashboard');
    }
    setUserRole(user.role || 'admin');
  }, [router]);

  const fetchJob = useCallback(async () => {
    try {
      setPageError(null);
      const res = await apiFetch(`/api/admin/jobs/${jobId}/summary`);
      if (!res.ok) {
        if (res.status === 404) setPageError('Job not found.');
        else setPageError('Failed to load job details.');
        return;
      }
      const json = await res.json();
      setJob(json.data.job);
    } catch {
      setPageError('Network error loading job.');
    }
  }, [jobId]);

  const fetchScope = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/scope`);
      if (res.ok) {
        const json = await res.json();
        setScopeItems(json.data?.scope_items || []);
      }
    } catch { /* ignore */ }
  }, [jobId]);

  const fetchActivity = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';
      const res = await fetch(`/api/jobs/${jobId}/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setActivityLog(json.data?.entries || []);
      }
    } catch { /* ignore */ }
  }, [jobId]);

  const fetchChangeRequests = useCallback(async () => {
    setCrLoading(true);
    try {
      const res = await apiFetch(`/api/admin/change-requests?jobId=${jobId}`);
      if (res.ok) {
        const json = await res.json();
        setChangeRequests(json.data || []);
      }
    } catch { /* ignore */ } finally {
      setCrLoading(false);
    }
  }, [jobId]);

  const fetchCompletionRequest = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/completion-request`);
      if (res.ok) {
        const json = await res.json();
        setCompletionRequest(json.data ?? null);
      }
    } catch { /* ignore */ }
  }, [jobId]);

  const handleReviewChangeRequest = async (crId: string, status: 'approved' | 'rejected') => {
    setCrReviewing(crId);
    try {
      const res = await apiFetch(`/api/admin/change-requests/${crId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await fetchChangeRequests();
      }
    } catch { /* ignore */ } finally {
      setCrReviewing(null);
    }
  };

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchJob(), fetchScope(), fetchActivity(), fetchChangeRequests(), fetchCompletionRequest()]);
      setLoading(false);
    };
    load();
  }, [fetchJob, fetchScope, fetchActivity, fetchChangeRequests, fetchCompletionRequest]);

  const handleApprove = async () => {
    if (!job) return;
    setApproving(true);
    setActionFeedback(null);
    try {
      const res = await apiFetch(`/api/admin/jobs/${job.id}/completion-request`, {
        method: 'PUT',
        body: JSON.stringify({ action: 'approve', review_notes: reviewNotes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Approval failed');
      setActionFeedback({ type: 'success', msg: json.message || 'Job approved and marked complete.' });
      setReviewNotes('');
      await Promise.all([fetchJob(), fetchCompletionRequest()]);
    } catch (e: unknown) {
      setActionFeedback({ type: 'error', msg: e instanceof Error ? e.message : 'Action failed' });
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!job) return;
    setRejecting(true);
    setActionFeedback(null);
    try {
      const res = await apiFetch(`/api/admin/jobs/${job.id}/completion-request`, {
        method: 'PUT',
        body: JSON.stringify({ action: 'reject', review_notes: reviewNotes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Rejection failed');
      setActionFeedback({ type: 'success', msg: json.message || 'Completion request sent back to operator.' });
      setReviewNotes('');
      await Promise.all([fetchJob(), fetchCompletionRequest()]);
    } catch (e: unknown) {
      setActionFeedback({ type: 'error', msg: e instanceof Error ? e.message : 'Action failed' });
    } finally {
      setRejecting(false);
    }
  };

  const statusConfig = job ? (STATUS_CONFIG[job.status] || STATUS_CONFIG['scheduled']) : null;

  if (loading) {
    return (
      <div className="min-h-screen p-6 bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
        <PageSkeleton />
      </div>
    );
  }

  if (pageError || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 dark:text-white/20 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-white/70">{pageError || 'Job not found.'}</p>
          <Link
            href="/dashboard/admin/schedule-board"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-violet-600 hover:underline dark:text-violet-300"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Schedule Board
          </Link>
        </div>
      </div>
    );
  }

  const isPendingCompletion = job.status === 'pending_completion';
  const heroAccent = statusConfig?.accent ?? 'from-violet-500 to-fuchsia-500';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Back link */}
        <Link
          href="/dashboard/admin/schedule-board"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors dark:text-white/60 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Schedule Board
        </Link>

        {/* Hero card */}
        <div className="
          relative overflow-hidden rounded-2xl p-5 shadow-sm
          bg-white border border-slate-200
          dark:bg-gradient-to-br dark:from-[#180c2c]/80 dark:to-[#0e0720]/80
          dark:border-white/10 dark:backdrop-blur
        ">
          {/* Top accent stripe — color keyed to status, purple-pink for in_progress */}
          <span
            className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${heroAccent}`}
            aria-hidden
          />
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="
                  text-2xl font-extrabold font-mono tracking-tight
                  bg-clip-text text-transparent
                  bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500
                  dark:from-violet-300 dark:via-fuchsia-300 dark:to-pink-300
                ">
                  {job.job_number}
                </h1>
                {statusConfig && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.text}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                    {statusConfig.label}
                  </span>
                )}
              </div>
              <p className="text-base font-semibold text-slate-700 dark:text-white/85">
                {job.customer_name}
                {job.job_type && (
                  <span className="font-normal text-slate-500 dark:text-white/55"> — {job.job_type}</span>
                )}
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-sm text-slate-500 dark:text-white/60">
                {(job.scheduled_date || job.end_date) && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formatDate(job.scheduled_date)}
                    {job.end_date && ` – ${formatDate(job.end_date)}`}
                  </span>
                )}
                {job.operator_name && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white bg-gradient-to-br from-violet-500 to-fuchsia-500"
                      aria-hidden
                    >
                      {job.operator_name.trim().charAt(0).toUpperCase()}
                    </span>
                    {job.operator_name}
                    {job.helper_name && ` + ${job.helper_name}`}
                  </span>
                )}
                {job.address && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {job.address}
                  </span>
                )}
                {job.arrival_time && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {formatTime(job.arrival_time)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <button
                onClick={() => setShowEditSchedule(true)}
                className="
                  inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
                  text-slate-700 bg-white border border-slate-200 hover:bg-slate-50
                  dark:text-white/80 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10
                "
              >
                <Edit3 className="w-4 h-4" />
                Edit Schedule
              </button>
            </div>
          </div>
        </div>

        {/* Action feedback banner */}
        {actionFeedback && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-400/30'
                : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:border-rose-400/30'
            }`}
          >
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {actionFeedback.msg}
            <button
              onClick={() => setActionFeedback(null)}
              className="ml-auto p-1 hover:bg-black/10 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left column: Scope + Chart */}
          <div className="lg:col-span-2 space-y-6">
            <JobScopePanel
              jobId={jobId}
              jobNumber={job.job_number}
              readOnly={false}
              onScopeChange={fetchScope}
            />

            <JobProgressChart jobId={jobId} scopeItems={scopeItems} />

            {/* Completion request submitted — work log context (left column) */}
            {isPendingCompletion && activityLog.length > 0 && (
              <div className="
                rounded-2xl p-4
                bg-amber-50 border border-amber-200
                dark:bg-amber-500/8 dark:border-amber-400/25
              ">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <HardHat className="w-3.5 h-3.5" />
                  Work Performed (submitted with completion request)
                </p>
                <div className="space-y-2">
                  {activityLog.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2 text-sm">
                      <span className="w-1.5 h-1.5 mt-2 rounded-full bg-amber-400 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-slate-800 dark:text-white/85">{entry.operator_name}</span>
                        {' — '}
                        <span className="text-slate-600 dark:text-white/65">
                          {entry.linear_feet
                            ? `${entry.linear_feet} linear ft`
                            : entry.cores
                            ? `${entry.cores} cores`
                            : `${entry.quantity} units`}{' '}
                          {WORK_TYPE_LABELS[entry.work_type] || entry.work_type}
                        </span>
                        {entry.notes && (
                          <p className="text-xs text-slate-400 dark:text-white/40 italic mt-0.5">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {activityLog.length > 5 && (
                    <p className="text-xs text-slate-400 dark:text-white/40 pl-3.5">
                      + {activityLog.length - 5} more entries in the activity log below
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Activity / Progress Log */}
            <div className="
              rounded-2xl p-6 shadow-sm
              bg-white border border-slate-200
              dark:bg-gradient-to-br dark:from-[#180c2c]/80 dark:to-[#0e0720]/80
              dark:border-white/10 dark:backdrop-blur
            ">
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                  <ClipboardList className="w-4 h-4" />
                </span>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Activity &amp; Progress Log</h2>
              </div>

              {activityLog.length === 0 ? (
                <div className="text-center py-8">
                  <ClipboardList className="w-10 h-10 text-slate-200 dark:text-white/15 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 dark:text-white/50">No activity logged yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {job.completion_requested_at && (
                    <div className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                      <div>
                        <span className="text-slate-400 dark:text-white/40 text-xs">
                          {formatDateTime(job.completion_requested_at)}
                        </span>
                        <p className="text-slate-700 dark:text-white/80">
                          <span className="font-medium">{job.operator_name || 'Operator'}</span>{' '}
                          submitted completion request
                        </p>
                      </div>
                    </div>
                  )}

                  {job.completion_approved_at && (
                    <div className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      <div>
                        <span className="text-slate-400 dark:text-white/40 text-xs">
                          {formatDateTime(job.completion_approved_at)}
                        </span>
                        <p className="text-slate-700 dark:text-white/80">Admin approved job completion</p>
                      </div>
                    </div>
                  )}

                  {job.completion_rejected_at && !job.completion_requested_at && (
                    <div className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                      <div>
                        <span className="text-slate-400 dark:text-white/40 text-xs">
                          {formatDateTime(job.completion_rejected_at)}
                        </span>
                        <p className="text-slate-700 dark:text-white/80">
                          Completion request rejected
                          {job.completion_rejection_notes && (
                            <span className="text-slate-500 dark:text-white/50 italic"> — &ldquo;{job.completion_rejection_notes}&rdquo;</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {activityLog.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-slate-400 dark:text-white/40 text-xs">
                          {formatDateTime(entry.timestamp)}
                          {entry.day_number && (
                            <span className="ml-1 text-violet-500 dark:text-violet-300">Day {entry.day_number}</span>
                          )}
                        </span>
                        <p className="text-slate-700 dark:text-white/80">
                          <span className="font-medium">{entry.operator_name}</span> logged{' '}
                          {entry.linear_feet
                            ? `${entry.linear_feet} linear ft`
                            : entry.cores
                            ? `${entry.cores} cores`
                            : `${entry.quantity} units`}{' '}
                          <span className="text-slate-500 dark:text-white/55">
                            {WORK_TYPE_LABELS[entry.work_type] || entry.work_type}
                          </span>
                        </p>
                        {entry.notes && (
                          <p className="text-xs text-slate-400 dark:text-white/40 italic mt-0.5 truncate">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Job Details */}
          <div className="space-y-6">

            {/* ── Pending Completion Approval ── */}
            {isPendingCompletion && (
              <div className="
                relative overflow-hidden rounded-2xl shadow-md
                border-2 border-amber-400
                bg-gradient-to-br from-amber-50 to-orange-50
                dark:from-amber-500/12 dark:to-orange-500/10
                dark:border-amber-400/50
              ">
                {/* Accent stripe */}
                <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400" aria-hidden />

                <div className="p-5 pt-6">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-400/20 flex-shrink-0 mt-0.5">
                      <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-300" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-amber-900 dark:text-amber-200 text-base leading-tight">
                        Pending Completion Approval
                      </h3>
                      <p className="text-sm text-amber-700 dark:text-amber-300/80 mt-0.5">
                        Action required — operator submitted this job for review
                      </p>
                    </div>
                  </div>

                  {/* Operator + submitted time */}
                  <div className="rounded-xl p-3 mb-3
                    bg-white/70 border border-amber-200
                    dark:bg-white/5 dark:border-amber-400/20
                  ">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 dark:text-white">
                        {completionRequest?.submitted_by_name || job.operator_name || 'Operator'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-white/55 mt-1">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      Submitted {formatDateTime(completionRequest?.submitted_at || job.completion_requested_at)}
                    </div>
                    {(completionRequest?.operator_notes || job.completion_request_notes) && (
                      <p className="mt-2 text-sm italic text-slate-600 dark:text-white/70 border-t border-amber-200 dark:border-amber-400/20 pt-2">
                        &ldquo;{completionRequest?.operator_notes || job.completion_request_notes}&rdquo;
                      </p>
                    )}
                  </div>

                  {/* Review notes input */}
                  <textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Optional notes for operator (reason for rejection, etc.)..."
                    rows={3}
                    className="
                      w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none mb-3
                      bg-white border border-amber-200 text-slate-900 placeholder-slate-400
                      dark:bg-white/5 dark:border-amber-400/20 dark:text-white dark:placeholder-white/35
                    "
                  />

                  {/* Approve / Reject buttons */}
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleApprove}
                      disabled={approving || rejecting}
                      className="
                        w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors
                        bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20
                        dark:bg-emerald-500 dark:hover:bg-emerald-400
                        disabled:opacity-50
                      "
                    >
                      {approving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Approve &amp; Complete Job
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={approving || rejecting}
                      className="
                        w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors
                        bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200
                        dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25 dark:border-rose-400/30
                        disabled:opacity-50
                      "
                    >
                      {rejecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      Send Back to Operator
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="
              rounded-2xl p-6 shadow-sm
              bg-white border border-slate-200
              dark:bg-gradient-to-br dark:from-[#180c2c]/80 dark:to-[#0e0720]/80
              dark:border-white/10 dark:backdrop-blur
            ">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                  <FileText className="w-4 h-4" />
                </span>
                Job Details
              </h2>

              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-slate-400 dark:text-white/45 uppercase tracking-wide">Customer</dt>
                  <dd className="mt-0.5 text-slate-800 dark:text-white font-medium">{job.customer_name}</dd>
                </div>

                {job.contact_name && (
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-white/45 uppercase tracking-wide">Contact</dt>
                    <dd className="mt-0.5 text-slate-700 dark:text-white/80">{job.contact_name}</dd>
                  </div>
                )}

                {job.customer_phone && (
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-white/45 uppercase tracking-wide">Phone</dt>
                    <dd className="mt-0.5 text-slate-700 dark:text-white/80 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-white/40" />
                      {job.customer_phone}
                    </dd>
                  </div>
                )}

                {job.operator_name && (
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-white/45 uppercase tracking-wide">Operator</dt>
                    <dd className="mt-0.5 text-slate-700 dark:text-white/80 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400 dark:text-white/40" />
                      {job.operator_name}
                      {job.helper_name && (
                        <span className="text-slate-400 dark:text-white/45"> + {job.helper_name}</span>
                      )}
                    </dd>
                  </div>
                )}

                <div>
                  <dt className="text-xs font-medium text-slate-400 dark:text-white/45 uppercase tracking-wide">Scheduled</dt>
                  <dd className="mt-0.5 text-slate-700 dark:text-white/80 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-white/40" />
                    {formatDate(job.scheduled_date)}
                    {job.end_date && ` – ${formatDate(job.end_date)}`}
                  </dd>
                </div>

                {job.arrival_time && (
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-white/45 uppercase tracking-wide">Arrival Time</dt>
                    <dd className="mt-0.5 text-slate-700 dark:text-white/80">{formatTime(job.arrival_time)}</dd>
                  </div>
                )}

                {job.address && (
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-white/45 uppercase tracking-wide">Address</dt>
                    <dd className="mt-0.5 text-slate-700 dark:text-white/80 flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-white/40 mt-0.5 flex-shrink-0" />
                      <span>{job.address}</span>
                    </dd>
                  </div>
                )}

                {job.po_number && (
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-white/45 uppercase tracking-wide">PO Number</dt>
                    <dd className="mt-0.5 text-slate-700 dark:text-white/80 font-mono">{job.po_number}</dd>
                  </div>
                )}

                {(job.permit_required || job.permit_number) && (
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-white/45 uppercase tracking-wide">Permit</dt>
                    <dd className="mt-0.5 text-slate-700 dark:text-white/80 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-slate-400 dark:text-white/40" />
                      {job.permit_number || 'Required'}
                    </dd>
                  </div>
                )}

                {job.description && (
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-white/45 uppercase tracking-wide">Description</dt>
                    <dd className="mt-0.5 text-slate-600 dark:text-white/70 text-xs leading-relaxed">{job.description}</dd>
                  </div>
                )}

                {job.notes && (
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-white/45 uppercase tracking-wide">Notes</dt>
                    <dd className="
                      mt-0.5 text-xs leading-relaxed rounded-lg p-2.5
                      text-slate-600 bg-slate-50 border border-slate-100
                      dark:text-white/70 dark:bg-white/5 dark:border-white/10
                    ">
                      {job.notes}
                    </dd>
                  </div>
                )}

                {job.internal_notes && (
                  <div>
                    <dt className="text-xs font-medium text-amber-500 dark:text-amber-300 uppercase tracking-wide">Internal Notes</dt>
                    <dd className="
                      mt-0.5 text-xs leading-relaxed rounded-lg p-2.5
                      text-slate-600 bg-amber-50 border border-amber-100
                      dark:text-white/80 dark:bg-amber-500/10 dark:border-amber-400/20
                    ">
                      {job.internal_notes}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Change Requests */}
            <div className="
              rounded-2xl p-5 shadow-sm
              bg-white border border-slate-200
              dark:bg-gradient-to-br dark:from-[#180c2c]/80 dark:to-[#0e0720]/80
              dark:border-white/10 dark:backdrop-blur
            ">
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">
                  <MessageSquare className="w-4 h-4" />
                </span>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Change Requests</h2>
                {changeRequests.filter(cr => cr.status === 'pending').length > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                    {changeRequests.filter(cr => cr.status === 'pending').length} pending
                  </span>
                )}
              </div>

              {crLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-300 dark:text-white/30" />
                </div>
              ) : changeRequests.length === 0 ? (
                <div className="text-center py-6">
                  <MessageSquare className="w-8 h-8 text-slate-200 dark:text-white/15 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 dark:text-white/45">No change requests for this job.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {changeRequests.map((cr) => (
                    <div
                      key={cr.id}
                      className={`rounded-xl border p-3 text-sm ${
                        cr.status === 'pending'
                          ? 'border-orange-200 bg-orange-50 dark:border-orange-400/30 dark:bg-orange-500/10'
                          : cr.status === 'approved'
                          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-500/10'
                          : 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-semibold text-slate-800 dark:text-white capitalize">
                          {cr.request_type.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${
                            cr.status === 'pending'
                              ? 'bg-orange-200 text-orange-800 dark:bg-orange-500/25 dark:text-orange-200'
                              : cr.status === 'approved'
                              ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-200'
                              : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-white/70'
                          }`}
                        >
                          {cr.status}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-white/70 text-xs leading-relaxed mb-1">{cr.description}</p>
                      <p className="text-slate-400 dark:text-white/45 text-xs">
                        By {cr.requester?.full_name || 'Unknown'} &middot; {new Date(cr.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                      {cr.status === 'pending' && (userRole === 'super_admin' || userRole === 'operations_manager') && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleReviewChangeRequest(cr.id, 'approved')}
                            disabled={crReviewing === cr.id}
                            className="
                              flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                              bg-emerald-600 text-white hover:bg-emerald-700
                              dark:bg-emerald-500 dark:hover:bg-emerald-400
                              disabled:opacity-50
                            "
                          >
                            {crReviewing === cr.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                            Approve
                          </button>
                          <button
                            onClick={() => handleReviewChangeRequest(cr.id, 'rejected')}
                            disabled={crReviewing === cr.id}
                            className="
                              flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                              bg-rose-100 text-rose-700 hover:bg-rose-200
                              dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25
                              disabled:opacity-50
                            "
                          >
                            {crReviewing === cr.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
                            Reject
                          </button>
                        </div>
                      )}
                      {cr.status !== 'pending' && cr.reviewer && (
                        <p className="text-xs text-slate-400 dark:text-white/45 mt-1 italic">
                          {cr.status === 'approved' ? 'Approved' : 'Rejected'} by {cr.reviewer.full_name}
                          {cr.review_notes && ` — "${cr.review_notes}"`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick links */}
            <div className="
              rounded-2xl p-4 shadow-sm
              bg-white border border-slate-200
              dark:bg-gradient-to-br dark:from-[#180c2c]/80 dark:to-[#0e0720]/80
              dark:border-white/10 dark:backdrop-blur
            ">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-white/55 uppercase tracking-wide mb-3">Quick Links</h3>
              <div className="space-y-1">
                <Link
                  href={`/dashboard/admin/completed-job-tickets/${jobId}`}
                  className="
                    flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors group
                    text-slate-700 hover:bg-slate-50
                    dark:text-white/80 dark:hover:bg-white/5
                  "
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400 dark:text-white/45" />
                    View Dispatch Ticket
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-white/30 group-hover:text-slate-500 dark:group-hover:text-white/60" />
                </Link>
                <Link
                  href="/dashboard/admin/billing"
                  className="
                    flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors group
                    text-slate-700 hover:bg-slate-50
                    dark:text-white/80 dark:hover:bg-white/5
                  "
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400 dark:text-white/45" />
                    Billing
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-white/30 group-hover:text-slate-500 dark:group-hover:text-white/60" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Schedule Modal */}
      {showEditSchedule && (
        <EditScheduleModal
          job={job}
          onClose={() => setShowEditSchedule(false)}
          onSaved={fetchJob}
        />
      )}
    </div>
  );
}
