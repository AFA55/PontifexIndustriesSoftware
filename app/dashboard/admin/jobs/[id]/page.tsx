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

interface ChangeOrder {
  id: string;
  co_number: string | null;
  description: string;
  work_type: string | null;
  unit: string | null;
  target_quantity: number | null;
  cost_amount: number | null;
  price_amount: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  creator?: { full_name: string } | null;
  approver?: { full_name: string } | null;
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

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  scheduled: { label: 'Scheduled', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  assigned: { label: 'Assigned', bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  in_route: { label: 'In Route', bg: 'bg-cyan-100', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  in_progress: { label: 'In Progress', bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  pending_completion: { label: 'Pending Review', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  completed: { label: 'Completed', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  cancelled: { label: 'Cancelled', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
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
      <div className="h-8 bg-gray-200 rounded w-64" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-64 bg-gray-100 rounded-xl" />
          <div className="h-48 bg-gray-100 rounded-xl" />
        </div>
        <div className="h-80 bg-gray-100 rounded-xl" />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">Edit Schedule</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date (optional)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={scheduledDate}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex items-center gap-2 mt-6">
          <button
            onClick={handleSave}
            disabled={saving || !scheduledDate}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
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

  // Change orders (extra work)
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [coLoading, setCoLoading] = useState(false);
  const [coError, setCoError] = useState<string | null>(null);
  const [showAddCo, setShowAddCo] = useState(false);
  const [coForm, setCoForm] = useState({
    description: '',
    work_type: '',
    unit: '',
    target_quantity: '',
    cost_amount: '',
    price_amount: '',
    notes: '',
  });
  const [coSaving, setCoSaving] = useState(false);
  const [coActing, setCoActing] = useState<string | null>(null);

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
        const list = Array.isArray(json.data)
          ? json.data
          : (json.data?.scope_items ?? json.meta?.scope_items ?? []);
        setScopeItems(list);
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

  const fetchChangeOrders = useCallback(async () => {
    setCoLoading(true);
    setCoError(null);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/change-orders`);
      if (!res.ok) {
        setCoError('Failed to load change orders');
        return;
      }
      const json = await res.json();
      setChangeOrders(json.data?.change_orders || []);
    } catch {
      setCoError('Failed to load change orders');
    } finally {
      setCoLoading(false);
    }
  }, [jobId]);

  const handleAddChangeOrder = async () => {
    if (!coForm.description.trim()) return;
    setCoSaving(true);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/change-orders`, {
        method: 'POST',
        body: JSON.stringify({
          description: coForm.description.trim(),
          work_type: coForm.work_type || null,
          unit: coForm.unit || null,
          target_quantity: coForm.target_quantity ? Number(coForm.target_quantity) : null,
          cost_amount: coForm.cost_amount ? Number(coForm.cost_amount) : 0,
          price_amount: coForm.price_amount ? Number(coForm.price_amount) : 0,
          notes: coForm.notes || null,
        }),
      });
      if (res.ok) {
        setShowAddCo(false);
        setCoForm({
          description: '', work_type: '', unit: '', target_quantity: '',
          cost_amount: '', price_amount: '', notes: '',
        });
        await fetchChangeOrders();
      }
    } finally {
      setCoSaving(false);
    }
  };

  const handleReviewChangeOrder = async (coId: string, action: 'approve' | 'reject') => {
    setCoActing(coId);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/change-orders/${coId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchChangeOrders();
      }
    } finally {
      setCoActing(null);
    }
  };

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
      await Promise.all([fetchJob(), fetchScope(), fetchActivity(), fetchChangeRequests(), fetchChangeOrders()]);
      setLoading(false);
    };
    load();
  }, [fetchJob, fetchScope, fetchActivity, fetchChangeRequests, fetchChangeOrders]);

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
      await fetchJob();
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
      await fetchJob();
    } catch (e: unknown) {
      setActionFeedback({ type: 'error', msg: e instanceof Error ? e.message : 'Action failed' });
    } finally {
      setRejecting(false);
    }
  };

  const statusConfig = job ? (STATUS_CONFIG[job.status] || STATUS_CONFIG['scheduled']) : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <PageSkeleton />
      </div>
    );
  }

  if (pageError || !job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">{pageError || 'Job not found.'}</p>
          <Link
            href="/dashboard/admin/schedule-board"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Schedule Board
          </Link>
        </div>
      </div>
    );
  }

  const isPendingCompletion = job.status === 'pending_completion';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Back link */}
        <Link
          href="/dashboard/admin/schedule-board"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Schedule Board
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-xl font-bold text-gray-900 font-mono">{job.job_number}</h1>
                {statusConfig && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.text}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                    {statusConfig.label}
                  </span>
                )}
              </div>
              <p className="text-base font-semibold text-gray-700">
                {job.customer_name}
                {job.job_type && (
                  <span className="font-normal text-gray-500"> — {job.job_type}</span>
                )}
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-sm text-gray-500">
                {(job.scheduled_date || job.end_date) && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formatDate(job.scheduled_date)}
                    {job.end_date && ` – ${formatDate(job.end_date)}`}
                  </span>
                )}
                {job.operator_name && (
                  <span className="inline-flex items-center gap-1">
                    <User className="w-4 h-4" />
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
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
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
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

            {/* Change Orders (extra work) */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  <h2 className="text-base font-semibold text-gray-900">Change Orders</h2>
                  <span className="text-xs text-gray-400">Extra work outside original scope</span>
                </div>
                <button
                  onClick={() => setShowAddCo(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
                >
                  + Add Change Order
                </button>
              </div>

              {coLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                </div>
              ) : coError ? (
                <p className="text-sm text-red-600 text-center py-4">{coError}</p>
              ) : changeOrders.length === 0 ? (
                <div className="text-center py-6">
                  <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No change orders yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {changeOrders.map((co) => (
                    <div key={co.id} className={`rounded-lg border p-3 text-sm ${
                      co.status === 'pending' ? 'border-amber-200 bg-amber-50' :
                      co.status === 'approved' ? 'border-green-200 bg-green-50' :
                      co.status === 'rejected' ? 'border-red-200 bg-red-50' :
                      'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-600">{co.co_number || 'CO-?'}</span>
                          <span className="font-semibold text-gray-800">{co.description}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize whitespace-nowrap ${
                          co.status === 'pending' ? 'bg-amber-200 text-amber-800' :
                          co.status === 'approved' ? 'bg-green-200 text-green-800' :
                          co.status === 'rejected' ? 'bg-red-200 text-red-800' :
                          'bg-gray-200 text-gray-700'
                        }`}>
                          {co.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                        {co.work_type && <span>{co.work_type}</span>}
                        {co.target_quantity != null && co.unit && (
                          <span>{co.target_quantity} {co.unit}</span>
                        )}
                        {co.cost_amount != null && Number(co.cost_amount) > 0 && (
                          <span>Cost: ${Number(co.cost_amount).toFixed(2)}</span>
                        )}
                        {co.price_amount != null && Number(co.price_amount) > 0 && (
                          <span className="font-semibold">Price: ${Number(co.price_amount).toFixed(2)}</span>
                        )}
                      </div>
                      {co.notes && <p className="text-xs text-gray-500 italic mt-1">{co.notes}</p>}
                      {co.status === 'pending' && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleReviewChangeOrder(co.id, 'approve')}
                            disabled={coActing === co.id}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {coActing === co.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                            Approve
                          </button>
                          <button
                            onClick={() => handleReviewChangeOrder(co.id, 'reject')}
                            disabled={coActing === co.id}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-xs font-medium rounded hover:bg-red-200 disabled:opacity-50"
                          >
                            {coActing === co.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Change Order Modal */}
            {showAddCo && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-semibold text-gray-900">Add Change Order</h3>
                    <button
                      onClick={() => setShowAddCo(false)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                      <textarea
                        value={coForm.description}
                        onChange={(e) => setCoForm((f) => ({ ...f, description: e.target.value }))}
                        rows={2}
                        placeholder="e.g. Additional 50 LF of wall sawing on east wall"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
                        <input
                          type="text"
                          value={coForm.work_type}
                          onChange={(e) => setCoForm((f) => ({ ...f, work_type: e.target.value }))}
                          placeholder="wall_sawing"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                        <input
                          type="text"
                          value={coForm.unit}
                          onChange={(e) => setCoForm((f) => ({ ...f, unit: e.target.value }))}
                          placeholder="linear_ft"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Qty</label>
                        <input
                          type="number"
                          step="any"
                          value={coForm.target_quantity}
                          onChange={(e) => setCoForm((f) => ({ ...f, target_quantity: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cost $</label>
                        <input
                          type="number"
                          step="0.01"
                          value={coForm.cost_amount}
                          onChange={(e) => setCoForm((f) => ({ ...f, cost_amount: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Price $</label>
                        <input
                          type="number"
                          step="0.01"
                          value={coForm.price_amount}
                          onChange={(e) => setCoForm((f) => ({ ...f, price_amount: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                      <textarea
                        value={coForm.notes}
                        onChange={(e) => setCoForm((f) => ({ ...f, notes: e.target.value }))}
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-5">
                    <button
                      onClick={handleAddChangeOrder}
                      disabled={coSaving || !coForm.description.trim()}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {coSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Save Change Order
                    </button>
                    <button
                      onClick={() => setShowAddCo(false)}
                      className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Completion Request Panel */}
            {isPendingCompletion && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-amber-900">Completion Review Required</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      {job.operator_name || 'Operator'} submitted on{' '}
                      {formatDateTime(job.completion_requested_at)}
                    </p>
                    {job.completion_request_notes && (
                      <p className="text-sm text-gray-700 mt-2 bg-white border border-amber-200 rounded-lg p-3 italic">
                        &ldquo;{job.completion_request_notes}&rdquo;
                      </p>
                    )}
                    <textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Review notes (optional)..."
                      rows={3}
                      className="mt-3 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none bg-white"
                    />
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <button
                        onClick={handleApprove}
                        disabled={approving || rejecting}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
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
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-100 text-red-700 text-sm font-medium rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
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
              </div>
            )}

            {/* Activity / Progress Log */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-semibold text-gray-900">Activity &amp; Progress Log</h2>
              </div>

              {activityLog.length === 0 ? (
                <div className="text-center py-8">
                  <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No activity logged yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {job.completion_requested_at && (
                    <div className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      <div>
                        <span className="text-gray-400 text-xs">
                          {formatDateTime(job.completion_requested_at)}
                        </span>
                        <p className="text-gray-700">
                          <span className="font-medium">{job.operator_name || 'Operator'}</span>{' '}
                          submitted completion request
                        </p>
                      </div>
                    </div>
                  )}

                  {job.completion_approved_at && (
                    <div className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-green-500 flex-shrink-0" />
                      <div>
                        <span className="text-gray-400 text-xs">
                          {formatDateTime(job.completion_approved_at)}
                        </span>
                        <p className="text-gray-700">Admin approved job completion</p>
                      </div>
                    </div>
                  )}

                  {job.completion_rejected_at && !job.completion_requested_at && (
                    <div className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-red-400 flex-shrink-0" />
                      <div>
                        <span className="text-gray-400 text-xs">
                          {formatDateTime(job.completion_rejected_at)}
                        </span>
                        <p className="text-gray-700">
                          Completion request rejected
                          {job.completion_rejection_notes && (
                            <span className="text-gray-500 italic"> — &ldquo;{job.completion_rejection_notes}&rdquo;</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {activityLog.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-400 text-xs">
                          {formatDateTime(entry.timestamp)}
                          {entry.day_number && (
                            <span className="ml-1 text-blue-500">Day {entry.day_number}</span>
                          )}
                        </span>
                        <p className="text-gray-700">
                          <span className="font-medium">{entry.operator_name}</span> logged{' '}
                          {entry.linear_feet
                            ? `${entry.linear_feet} linear ft`
                            : entry.cores
                            ? `${entry.cores} cores`
                            : `${entry.quantity} units`}{' '}
                          <span className="text-gray-500">
                            {WORK_TYPE_LABELS[entry.work_type] || entry.work_type}
                          </span>
                        </p>
                        {entry.notes && (
                          <p className="text-xs text-gray-400 italic mt-0.5 truncate">{entry.notes}</p>
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
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Job Details
              </h2>

              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">Customer</dt>
                  <dd className="mt-0.5 text-gray-800 font-medium">{job.customer_name}</dd>
                </div>

                {job.contact_name && (
                  <div>
                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">Contact</dt>
                    <dd className="mt-0.5 text-gray-700">{job.contact_name}</dd>
                  </div>
                )}

                {job.customer_phone && (
                  <div>
                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">Phone</dt>
                    <dd className="mt-0.5 text-gray-700 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      {job.customer_phone}
                    </dd>
                  </div>
                )}

                {job.operator_name && (
                  <div>
                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">Operator</dt>
                    <dd className="mt-0.5 text-gray-700 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      {job.operator_name}
                      {job.helper_name && (
                        <span className="text-gray-400"> + {job.helper_name}</span>
                      )}
                    </dd>
                  </div>
                )}

                <div>
                  <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">Scheduled</dt>
                  <dd className="mt-0.5 text-gray-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    {formatDate(job.scheduled_date)}
                    {job.end_date && ` – ${formatDate(job.end_date)}`}
                  </dd>
                </div>

                {job.arrival_time && (
                  <div>
                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">Arrival Time</dt>
                    <dd className="mt-0.5 text-gray-700">{formatTime(job.arrival_time)}</dd>
                  </div>
                )}

                {job.address && (
                  <div>
                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">Address</dt>
                    <dd className="mt-0.5 text-gray-700 flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span>{job.address}</span>
                    </dd>
                  </div>
                )}

                {job.po_number && (
                  <div>
                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">PO Number</dt>
                    <dd className="mt-0.5 text-gray-700 font-mono">{job.po_number}</dd>
                  </div>
                )}

                {(job.permit_required || job.permit_number) && (
                  <div>
                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">Permit</dt>
                    <dd className="mt-0.5 text-gray-700 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-gray-400" />
                      {job.permit_number || 'Required'}
                    </dd>
                  </div>
                )}

                {job.description && (
                  <div>
                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">Description</dt>
                    <dd className="mt-0.5 text-gray-600 text-xs leading-relaxed">{job.description}</dd>
                  </div>
                )}

                {job.notes && (
                  <div>
                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">Notes</dt>
                    <dd className="mt-0.5 text-gray-600 text-xs leading-relaxed bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                      {job.notes}
                    </dd>
                  </div>
                )}

                {job.internal_notes && (
                  <div>
                    <dt className="text-xs font-medium text-amber-500 uppercase tracking-wide">Internal Notes</dt>
                    <dd className="mt-0.5 text-gray-600 text-xs leading-relaxed bg-amber-50 rounded-lg p-2.5 border border-amber-100">
                      {job.internal_notes}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Change Requests */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="w-4 h-4 text-purple-600" />
                <h2 className="text-base font-semibold text-gray-900">Change Requests</h2>
                {changeRequests.filter(cr => cr.status === 'pending').length > 0 && (
                  <span className="ml-auto px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                    {changeRequests.filter(cr => cr.status === 'pending').length} pending
                  </span>
                )}
              </div>

              {crLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                </div>
              ) : changeRequests.length === 0 ? (
                <div className="text-center py-6">
                  <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No change requests for this job.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {changeRequests.map((cr) => (
                    <div key={cr.id} className={`rounded-xl border p-3 text-sm ${
                      cr.status === 'pending' ? 'border-amber-200 bg-amber-50' :
                      cr.status === 'approved' ? 'border-green-200 bg-green-50' :
                      'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-semibold text-gray-800 capitalize">
                          {cr.request_type.replace(/_/g, ' ')}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${
                          cr.status === 'pending' ? 'bg-amber-200 text-amber-800' :
                          cr.status === 'approved' ? 'bg-green-200 text-green-800' :
                          'bg-gray-200 text-gray-700'
                        }`}>
                          {cr.status}
                        </span>
                      </div>
                      <p className="text-gray-600 text-xs leading-relaxed mb-1">{cr.description}</p>
                      <p className="text-gray-400 text-xs">
                        By {cr.requester?.full_name || 'Unknown'} &middot; {new Date(cr.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                      {cr.status === 'pending' && (userRole === 'super_admin' || userRole === 'operations_manager') && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleReviewChangeRequest(cr.id, 'approved')}
                            disabled={crReviewing === cr.id}
                            className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            {crReviewing === cr.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                            Approve
                          </button>
                          <button
                            onClick={() => handleReviewChangeRequest(cr.id, 'rejected')}
                            disabled={crReviewing === cr.id}
                            className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 text-xs font-medium rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
                          >
                            {crReviewing === cr.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
                            Reject
                          </button>
                        </div>
                      )}
                      {cr.status !== 'pending' && cr.reviewer && (
                        <p className="text-xs text-gray-400 mt-1 italic">
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
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Links</h3>
              <div className="space-y-1">
                <Link
                  href={`/dashboard/admin/completed-job-tickets/${jobId}`}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors group"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    View Dispatch Ticket
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
                </Link>
                <Link
                  href="/dashboard/admin/billing"
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors group"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    Billing
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
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
