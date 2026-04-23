'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, use, useMemo } from 'react';
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
  Gauge,
  Hammer,
  Ruler,
  Target,
  Timer,
  Users as UsersIcon,
  Sparkles,
  Flame,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import JobScopePanel, { type ScopeItem } from '@/components/JobScopePanel';
import JobProgressChart from '@/components/JobProgressChart';
import RevealSection from '@/components/RevealSection';
import JobDetailSkeleton from './_skeleton';

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
  scheduled_end_date?: string | null;
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

interface SummaryScope {
  items: Array<{
    id: string;
    work_type: string;
    description: string | null;
    unit: string;
    target_quantity: number;
    completed_quantity: number;
    pct_complete: number;
    sort_order: number;
  }>;
  overall_pct: number;
  total_target: number;
  total_completed: number;
}

interface ByDateEntry {
  id: string;
  scope_item_id: string | null;
  scope_item_description: string | null;
  work_type: string | null;
  unit: string | null;
  quantity_completed: number;
  operator_name: string;
  notes: string | null;
}

interface ProgressByDate {
  date: string;
  // TODO(api): expose per-day in_route_at / earliest timecard start to show crew arrival time
  in_route_at?: string | null;
  entries: ByDateEntry[];
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

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map(s => s.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const STATUS_PILL: Record<string, { label: string; cls: string; dot: string; glow: string }> = {
  scheduled:          { label: 'Scheduled',      cls: 'bg-blue-500/15 text-blue-200 ring-1 ring-blue-400/30',           dot: 'bg-blue-400',      glow: 'shadow-[0_0_20px_-5px_rgba(59,130,246,0.5)]' },
  assigned:           { label: 'Assigned',       cls: 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/30',              dot: 'bg-sky-400',       glow: 'shadow-[0_0_20px_-5px_rgba(14,165,233,0.5)]' },
  in_route:           { label: 'In Route',       cls: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30',        dot: 'bg-amber-400',     glow: 'shadow-[0_0_20px_-5px_rgba(245,158,11,0.5)]' },
  on_site:            { label: 'On Site',        cls: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30',  dot: 'bg-emerald-400',   glow: 'shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)]' },
  in_progress:        { label: 'In Progress',    cls: 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/30',     dot: 'bg-violet-400',    glow: 'shadow-[0_0_20px_-5px_rgba(139,92,246,0.5)]' },
  pending_completion: { label: 'Pending Review', cls: 'bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/30',     dot: 'bg-orange-400',    glow: 'shadow-[0_0_20px_-5px_rgba(249,115,22,0.5)]' },
  pending_approval:   { label: 'Pending Review', cls: 'bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/30',     dot: 'bg-orange-400',    glow: 'shadow-[0_0_20px_-5px_rgba(249,115,22,0.5)]' },
  completed:          { label: 'Completed',      cls: 'bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/30',        dot: 'bg-slate-400',     glow: '' },
  cancelled:          { label: 'Cancelled',      cls: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30',           dot: 'bg-rose-400',      glow: '' },
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

function unitLabel(unit?: string | null) {
  if (!unit) return '';
  const u = unit.toLowerCase();
  if (u === 'lf' || u === 'linear_feet') return 'LF';
  if (u === 'sf' || u === 'square_feet') return 'SF';
  if (u === 'cores') return 'cores';
  return unit;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-[#1a0f2e] to-[#0f0820] border border-purple-400/30 rounded-2xl shadow-[0_20px_60px_-15px_rgba(168,85,247,0.4)] w-full max-w-sm p-6 text-white">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold">Edit Schedule</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4 text-purple-200/70" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-purple-200/70 mb-1">Start Date</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-purple-200/70 mb-1">End Date (optional)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={scheduledDate}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 [color-scheme:dark]"
            />
          </div>
        </div>

        {error && <p className="text-sm text-rose-300 mt-3">{error}</p>}

        <div className="flex items-center gap-2 mt-6">
          <button
            onClick={handleSave}
            disabled={saving || !scheduledDate}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-sm font-medium rounded-lg hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-purple-200/70 hover:bg-white/10 rounded-lg">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabKey = 'progress' | 'changes' | 'activity';

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
  const [summaryScope, setSummaryScope] = useState<SummaryScope | null>(null);
  const [progressByDate, setProgressByDate] = useState<ProgressByDate[]>([]);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('progress');

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

  // Auth guard
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.push('/login'); return; }
    if (!['admin', 'super_admin', 'operations_manager', 'salesman', 'supervisor'].includes(user.role)) {
      router.push('/dashboard');
    }
    setUserRole(user.role || 'admin');
  }, [router]);

  const fetchSummary = useCallback(async () => {
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
      setSummaryScope(json.data.scope || null);
      setProgressByDate(json.data.progress?.by_date || []);
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
      await Promise.all([fetchSummary(), fetchScope(), fetchChangeRequests()]);
      setLoading(false);
    };
    load();
  }, [fetchSummary, fetchScope, fetchChangeRequests]);

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
      setActionFeedback({ type: 'success', msg: json.message || 'Job approved.' });
      setReviewNotes('');
      await fetchSummary();
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
      setActionFeedback({ type: 'success', msg: json.message || 'Completion request rejected.' });
      setReviewNotes('');
      await fetchSummary();
    } catch (e: unknown) {
      setActionFeedback({ type: 'error', msg: e instanceof Error ? e.message : 'Action failed' });
    } finally {
      setRejecting(false);
    }
  };

  const pill = job ? (STATUS_PILL[job.status] || STATUS_PILL.scheduled) : null;
  const overallPct = summaryScope?.overall_pct ?? 0;
  const totalTarget = summaryScope?.total_target ?? 0;
  const totalCompleted = summaryScope?.total_completed ?? 0;

  // Aggregate unique operators and day count
  const { uniqueOperators, dayCount, pendingCrCount } = useMemo(() => {
    const ops = new Set<string>();
    progressByDate.forEach(d => d.entries.forEach(e => e.operator_name && ops.add(e.operator_name)));
    return {
      uniqueOperators: ops.size,
      dayCount: progressByDate.length,
      pendingCrCount: changeRequests.filter(cr => cr.status === 'pending').length,
    };
  }, [progressByDate, changeRequests]);

  if (loading) {
    return <JobDetailSkeleton />;
  }

  if (pageError || !job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0b0714] via-[#110a24] to-[#0b0714] flex items-center justify-center text-white">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-purple-300/40 mx-auto mb-3" />
          <p className="text-purple-100/70">{pageError || 'Job not found.'}</p>
          <Link
            href="/dashboard/admin/schedule-board"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-purple-300 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Schedule Board
          </Link>
        </div>
      </div>
    );
  }

  const isPendingCompletion = job.status === 'pending_completion' || job.status === 'pending_approval';

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#0b0714] via-[#110a24] to-[#0b0714] text-white">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-60">
        <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute top-40 right-0 h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Back link */}
        <RevealSection delay={0}>
          <Link
            href="/dashboard/admin/schedule-board"
            className="inline-flex items-center gap-1.5 text-sm text-purple-300/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Schedule Board
          </Link>
        </RevealSection>

        {/* Hero */}
        <RevealSection delay={40}>
          <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-[#1a0f2e]/80 via-[#14092a]/80 to-[#0e0720]/80 backdrop-blur-sm p-[1px]">
            <div className="relative rounded-2xl bg-transparent p-6">
              {/* top accent */}
              {pill && <div className={`absolute inset-x-0 top-0 h-[2px] ${pill.dot}`} />}

              <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-purple-300/80">
                    <Sparkles className="w-3.5 h-3.5" />
                    Job Detail
                  </div>
                  <div className="flex items-center gap-3 flex-wrap mt-1">
                    <h1 className="text-3xl font-bold font-mono bg-gradient-to-r from-white via-purple-100 to-purple-300 bg-clip-text text-transparent">
                      {job.job_number}
                    </h1>
                    {pill && (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${pill.cls} ${pill.glow}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pill.dot} animate-pulse`} />
                        {pill.label}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-lg font-semibold text-white truncate">
                    {job.customer_name}
                    {job.job_type && (
                      <span className="font-normal text-purple-200/60"> · {job.job_type.replace(/_/g, ' ')}</span>
                    )}
                  </p>

                  {/* Hero meta */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm text-purple-100/70">
                    {(job.scheduled_date || job.end_date) && (
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-purple-300/70" />
                        {formatDate(job.scheduled_date)}
                        {job.end_date && ` – ${formatDate(job.end_date)}`}
                      </span>
                    )}
                    {job.operator_name && (
                      <span className="inline-flex items-center gap-1.5">
                        <User className="w-4 h-4 text-purple-300/70" />
                        {job.operator_name}
                        {job.helper_name && ` + ${job.helper_name}`}
                      </span>
                    )}
                    {job.address && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-purple-300/70" />
                        {job.address}
                      </span>
                    )}
                    {job.arrival_time && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-purple-300/70" />
                        {formatTime(job.arrival_time)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Overall progress ring/bar */}
                <div className="flex items-center gap-4 w-full lg:w-auto">
                  <div className="flex-1 lg:w-64">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="uppercase tracking-wider text-purple-200/60 font-semibold">Overall Progress</span>
                      <span className="font-bold text-white">{overallPct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, overallPct))}%` }}
                      />
                    </div>
                    <div className="mt-1.5 text-[11px] text-purple-200/60">
                      {totalCompleted.toLocaleString()} / {totalTarget.toLocaleString()} total
                    </div>
                  </div>
                  <button
                    onClick={() => setShowEditSchedule(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-purple-100 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
              </div>
            </div>
          </div>
        </RevealSection>

        {/* Metric tiles */}
        <RevealSection delay={80}>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: '% Complete',    value: `${overallPct}%`,             icon: Gauge,    grad: 'from-purple-500/30 to-fuchsia-500/10',  iconCls: 'text-purple-300' },
              { label: 'Total Target',  value: totalTarget.toLocaleString(), icon: Target,   grad: 'from-fuchsia-500/30 to-pink-500/10',    iconCls: 'text-fuchsia-300' },
              { label: 'Completed',     value: totalCompleted.toLocaleString(), icon: Ruler, grad: 'from-emerald-500/30 to-teal-500/10',    iconCls: 'text-emerald-300' },
              { label: 'Crew Days',     value: dayCount,                     icon: Timer,    grad: 'from-amber-500/30 to-orange-500/10',    iconCls: 'text-amber-300' },
              { label: 'Operators',     value: uniqueOperators,              icon: UsersIcon,grad: 'from-sky-500/30 to-blue-500/10',        iconCls: 'text-sky-300' },
            ].map((m, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur"
              >
                <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${m.grad}`} />
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-purple-100/60">{m.label}</span>
                  <span className={`w-7 h-7 rounded-lg bg-white/5 ring-1 ring-white/10 flex items-center justify-center ${m.iconCls}`}>
                    <m.icon className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="text-2xl font-bold tracking-tight text-white">{m.value}</div>
              </div>
            ))}
          </div>
        </RevealSection>

        {/* Feedback banner */}
        {actionFeedback && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 border backdrop-blur ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-200 border-emerald-400/30'
                : 'bg-rose-500/10 text-rose-200 border-rose-400/30'
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
              className="ml-auto p-1 hover:bg-white/10 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Completion Request Panel */}
            {isPendingCompletion && (
              <RevealSection delay={120}>
                <div className="rounded-2xl border border-orange-400/30 bg-gradient-to-br from-orange-500/10 to-amber-500/5 p-5 backdrop-blur">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 ring-1 ring-orange-400/40 flex items-center justify-center flex-shrink-0">
                      <Flame className="w-5 h-5 text-orange-300" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-orange-100">Completion Review Required</h3>
                      <p className="text-sm text-orange-200/70 mt-1">
                        {job.operator_name || 'Operator'} submitted on{' '}
                        {formatDateTime(job.completion_requested_at)}
                      </p>
                      {job.completion_request_notes && (
                        <p className="text-sm text-orange-50 mt-2 bg-white/5 border border-orange-400/20 rounded-lg p-3 italic">
                          &ldquo;{job.completion_request_notes}&rdquo;
                        </p>
                      )}
                      <textarea
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Review notes (optional)..."
                        rows={3}
                        className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-purple-200/40 focus:outline-none focus:ring-2 focus:ring-orange-400/60 resize-none"
                      />
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <button
                          onClick={handleApprove}
                          disabled={approving || rejecting}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold rounded-lg hover:brightness-110 disabled:opacity-50 transition-all shadow-[0_6px_20px_-6px_rgba(16,185,129,0.5)]"
                        >
                          {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Approve &amp; Complete Job
                        </button>
                        <button
                          onClick={handleReject}
                          disabled={approving || rejecting}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/40 text-sm font-medium rounded-lg hover:bg-rose-500/30 disabled:opacity-50 transition-colors"
                        >
                          {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                          Send Back
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </RevealSection>
            )}

            {/* Tabbed section */}
            <RevealSection delay={160}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur overflow-hidden">
                <div className="flex items-center gap-1 p-2 border-b border-white/10 bg-white/[0.02]">
                  {[
                    { key: 'progress' as TabKey, label: 'Scope & Progress', icon: Gauge },
                    { key: 'changes' as TabKey,  label: 'Change Orders',    icon: MessageSquare, badge: pendingCrCount },
                    { key: 'activity' as TabKey, label: 'Daily Activity',   icon: ClipboardList },
                  ].map(tab => {
                    const active = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`relative inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                          ${active
                            ? 'bg-gradient-to-r from-purple-600/40 to-fuchsia-600/30 text-white ring-1 ring-purple-400/40'
                            : 'text-purple-100/70 hover:text-white hover:bg-white/5'}`}
                      >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                        {tab.badge ? (
                          <span className="ml-1 bg-orange-400 text-orange-950 text-[10px] rounded-full px-1.5 py-0.5 font-bold">
                            {tab.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="p-5">
                  {/* Progress tab */}
                  {activeTab === 'progress' && (
                    <div className="space-y-6">
                      {/* Per-scope-item bars */}
                      {summaryScope && summaryScope.items.length > 0 ? (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                            <Target className="w-4 h-4 text-purple-300" />
                            Scope Items
                          </h3>
                          {summaryScope.items.map(item => {
                            const p = Math.max(0, Math.min(100, item.pct_complete));
                            return (
                              <div
                                key={item.id}
                                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 bg-purple-500/15 text-purple-200 ring-1 ring-purple-400/30 font-semibold">
                                        {WORK_TYPE_LABELS[item.work_type] || item.work_type.replace(/_/g, ' ')}
                                      </span>
                                      {item.description && (
                                        <span className="text-sm text-white truncate">{item.description}</span>
                                      )}
                                    </div>
                                    <div className="mt-1 text-[11px] text-purple-200/70">
                                      {item.completed_quantity.toLocaleString()} / {item.target_quantity.toLocaleString()} {unitLabel(item.unit)}
                                    </div>
                                  </div>
                                  <span className="text-sm font-bold text-white whitespace-nowrap">{p}%</span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-white/10">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 transition-all"
                                    style={{ width: `${p}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {/* Existing scope editor */}
                      <div>
                        <JobScopePanel
                          jobId={jobId}
                          jobNumber={job.job_number}
                          readOnly={false}
                          onScopeChange={() => { fetchScope(); fetchSummary(); }}
                        />
                      </div>

                      {/* Chart */}
                      <JobProgressChart jobId={jobId} scopeItems={scopeItems} />
                    </div>
                  )}

                  {/* Changes tab */}
                  {activeTab === 'changes' && (
                    <div>
                      {crLoading ? (
                        <div className="flex items-center justify-center py-10">
                          <Loader2 className="w-5 h-5 animate-spin text-purple-300" />
                        </div>
                      ) : changeRequests.length === 0 ? (
                        <div className="text-center py-10">
                          <MessageSquare className="w-10 h-10 text-purple-300/40 mx-auto mb-2" />
                          <p className="text-sm text-purple-200/60">No change requests for this job.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {changeRequests.map(cr => {
                            const tone = cr.status === 'pending'
                              ? 'border-amber-400/30 bg-amber-500/5'
                              : cr.status === 'approved'
                              ? 'border-emerald-400/30 bg-emerald-500/5'
                              : 'border-white/10 bg-white/[0.03]';
                            const statusCls = cr.status === 'pending'
                              ? 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/40'
                              : cr.status === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40'
                              : 'bg-white/10 text-purple-100/70 ring-1 ring-white/10';
                            return (
                              <div key={cr.id} className={`rounded-xl border p-3 text-sm ${tone}`}>
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <span className="font-semibold text-white capitalize">
                                    {cr.request_type.replace(/_/g, ' ')}
                                  </span>
                                  <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide whitespace-nowrap ${statusCls}`}>
                                    {cr.status}
                                  </span>
                                </div>
                                <p className="text-purple-100/80 text-xs leading-relaxed mb-1">{cr.description}</p>
                                <p className="text-purple-200/50 text-[11px]">
                                  By {cr.requester?.full_name || 'Unknown'} &middot;{' '}
                                  {new Date(cr.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </p>
                                {cr.status === 'pending' && (userRole === 'super_admin' || userRole === 'operations_manager') && (
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={() => handleReviewChangeRequest(cr.id, 'approved')}
                                      disabled={crReviewing === cr.id}
                                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium rounded-lg hover:brightness-110 disabled:opacity-50 transition-all"
                                    >
                                      {crReviewing === cr.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleReviewChangeRequest(cr.id, 'rejected')}
                                      disabled={crReviewing === cr.id}
                                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/30 text-xs font-medium rounded-lg hover:bg-rose-500/30 disabled:opacity-50 transition-colors"
                                    >
                                      {crReviewing === cr.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
                                      Reject
                                    </button>
                                  </div>
                                )}
                                {cr.status !== 'pending' && cr.reviewer && (
                                  <p className="text-[11px] text-purple-200/50 mt-1 italic">
                                    {cr.status === 'approved' ? 'Approved' : 'Rejected'} by {cr.reviewer.full_name}
                                    {cr.review_notes && ` — "${cr.review_notes}"`}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Activity tab — grouped by day */}
                  {activeTab === 'activity' && (
                    <div>
                      {progressByDate.length === 0 ? (
                        <div className="text-center py-10">
                          <ClipboardList className="w-10 h-10 text-purple-300/40 mx-auto mb-2" />
                          <p className="text-sm text-purple-200/60">No work logged yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {progressByDate.map((day, idx) => {
                            const dayTotal = day.entries.reduce((sum, e) => sum + (e.quantity_completed || 0), 0);
                            const pctOfOverall = totalTarget > 0
                              ? Math.round((dayTotal / totalTarget) * 1000) / 10
                              : 0;
                            const operators = Array.from(new Set(day.entries.map(e => e.operator_name).filter(Boolean)));
                            return (
                              <div
                                key={day.date || idx}
                                className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden"
                              >
                                {/* Day header */}
                                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-purple-600/15 to-transparent border-b border-white/10">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center text-xs font-bold text-white ring-1 ring-purple-400/40">
                                      D{idx + 1}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-white">
                                        {formatDateShort(day.date)}
                                      </div>
                                      <div className="flex items-center gap-2 text-[11px] text-purple-200/60 flex-wrap">
                                        {day.in_route_at && (
                                          <span className="inline-flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            In-route {formatDateTime(day.in_route_at)}
                                          </span>
                                        )}
                                        {operators.length > 0 && (
                                          <span className="inline-flex items-center gap-1">
                                            <User className="w-3 h-3" />
                                            {operators.slice(0, 2).join(', ')}
                                            {operators.length > 2 && ` +${operators.length - 2}`}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <div className="text-xs text-purple-200/60 uppercase tracking-wider font-semibold">of target</div>
                                    <div className="text-sm font-bold text-white">{pctOfOverall}%</div>
                                  </div>
                                </div>

                                {/* Entries */}
                                <div className="divide-y divide-white/5">
                                  {day.entries.map(e => (
                                    <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                                      <div className="w-7 h-7 rounded-full bg-white/5 ring-1 ring-white/10 flex items-center justify-center text-[10px] font-bold text-purple-200 flex-shrink-0">
                                        {getInitials(e.operator_name)}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-sm font-medium text-white">{e.operator_name}</span>
                                          {e.work_type && (
                                            <span className="text-[10.5px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-200 ring-1 ring-purple-400/20">
                                              {WORK_TYPE_LABELS[e.work_type] || e.work_type.replace(/_/g, ' ')}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[12px] text-purple-100/70 mt-0.5">
                                          Logged <span className="font-semibold text-white">{e.quantity_completed.toLocaleString()} {unitLabel(e.unit)}</span>
                                          {e.scope_item_description && (
                                            <span className="text-purple-200/60"> · {e.scope_item_description}</span>
                                          )}
                                        </div>
                                        {e.notes && (
                                          <p className="text-[11px] text-purple-200/50 italic mt-0.5 truncate">{e.notes}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </RevealSection>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Info cards stack */}
            <RevealSection delay={200}>
              <InfoCard
                title="Customer & Site"
                icon={MapPin}
                iconCls="text-fuchsia-300"
                accent="from-fuchsia-500/30 to-pink-500/10"
              >
                <Row label="Customer" value={job.customer_name} />
                {job.contact_name && <Row label="Contact" value={job.contact_name} />}
                {job.customer_phone && (
                  <Row label="Phone" value={<span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-purple-300/70" />{job.customer_phone}</span>} />
                )}
                {job.address && (
                  <Row label="Address" value={<span className="inline-flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 text-purple-300/70 mt-0.5" /><span>{job.address}</span></span>} />
                )}
              </InfoCard>
            </RevealSection>

            <RevealSection delay={240}>
              <InfoCard
                title="Schedule"
                icon={Calendar}
                iconCls="text-emerald-300"
                accent="from-emerald-500/30 to-teal-500/10"
              >
                <Row label="Scheduled" value={<span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-purple-300/70" />{formatDate(job.scheduled_date)}{job.end_date && ` – ${formatDate(job.end_date)}`}</span>} />
                {job.arrival_time && <Row label="Arrival Time" value={formatTime(job.arrival_time) || '—'} />}
                {job.is_will_call && <Row label="Will Call" value={<span className="text-amber-200">Yes</span>} />}
              </InfoCard>
            </RevealSection>

            <RevealSection delay={280}>
              <InfoCard
                title="Team"
                icon={UsersIcon}
                iconCls="text-sky-300"
                accent="from-sky-500/30 to-blue-500/10"
              >
                {job.operator_name ? (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center text-[11px] font-bold text-white ring-2 ring-purple-400/30">
                      {getInitials(job.operator_name)}
                    </div>
                    <div>
                      <div className="text-sm text-white font-medium">{job.operator_name}</div>
                      <div className="text-[11px] text-purple-200/60">Lead operator</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-purple-200/60">Unassigned</p>
                )}
                {job.helper_name && (
                  <div className="flex items-center gap-2 mt-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 ring-1 ring-white/10 flex items-center justify-center text-[11px] font-bold text-purple-200">
                      {getInitials(job.helper_name)}
                    </div>
                    <div>
                      <div className="text-sm text-white font-medium">{job.helper_name}</div>
                      <div className="text-[11px] text-purple-200/60">Helper</div>
                    </div>
                  </div>
                )}
              </InfoCard>
            </RevealSection>

            <RevealSection delay={320}>
              <InfoCard
                title="Billing & Compliance"
                icon={FileText}
                iconCls="text-amber-300"
                accent="from-amber-500/30 to-orange-500/10"
              >
                {job.po_number && <Row label="PO Number" value={<span className="font-mono">{job.po_number}</span>} />}
                {(job.permit_required || job.permit_number) && (
                  <Row
                    label="Permit"
                    value={<span className="inline-flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5 text-purple-300/70" />{job.permit_number || 'Required'}</span>}
                  />
                )}
                {job.description && (
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wider font-semibold text-purple-200/60 mb-1">Description</div>
                    <p className="text-xs leading-relaxed text-purple-100/80">{job.description}</p>
                  </div>
                )}
                {job.notes && (
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wider font-semibold text-purple-200/60 mb-1">Notes</div>
                    <p className="text-xs leading-relaxed text-purple-100/80 bg-white/5 rounded-lg p-2.5 border border-white/10">{job.notes}</p>
                  </div>
                )}
                {job.internal_notes && (
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wider font-semibold text-amber-300 mb-1">Internal Notes</div>
                    <p className="text-xs leading-relaxed text-amber-100/90 bg-amber-500/10 rounded-lg p-2.5 border border-amber-400/20">{job.internal_notes}</p>
                  </div>
                )}
              </InfoCard>
            </RevealSection>

            {/* Quick links */}
            <RevealSection delay={360}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur p-4">
                <h3 className="text-xs font-semibold text-purple-200/70 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <ChevronRight className="w-3 h-3" />
                  Quick Links
                </h3>
                <div className="space-y-1">
                  <QuickLink href={`/dashboard/admin/completed-job-tickets/${jobId}`} icon={FileText} label="View Dispatch Ticket" />
                  <QuickLink href="/dashboard/admin/billing" icon={FileText} label="Billing" />
                  <QuickLink href={`/dashboard/admin/job-pnl?jobId=${jobId}`} icon={Gauge} label="Job P&L" />
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </div>

      {/* Edit Schedule Modal */}
      {showEditSchedule && (
        <EditScheduleModal
          job={job}
          onClose={() => setShowEditSchedule(false)}
          onSaved={fetchSummary}
        />
      )}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function InfoCard({
  title,
  icon: Icon,
  iconCls,
  accent,
  children,
}: {
  title: string;
  icon: typeof FileText;
  iconCls: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur p-5 overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${accent}`} />
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-7 h-7 rounded-lg bg-white/5 ring-1 ring-white/10 flex items-center justify-center ${iconCls}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="space-y-3 text-sm">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold text-purple-200/60 uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 text-sm text-purple-50">{value}</div>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof FileText; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/5 text-sm text-purple-100/90 transition-colors group border border-transparent hover:border-white/10"
    >
      <span className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-purple-300/70" />
        {label}
      </span>
      <ChevronRight className="w-4 h-4 text-purple-300/40 group-hover:text-purple-200 group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}
