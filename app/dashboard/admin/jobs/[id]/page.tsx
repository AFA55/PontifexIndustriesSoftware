'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, MapPin, User, Phone, FileText, AlertCircle,
  CheckCircle2, XCircle, Clock, Edit3, X, Loader2, Wrench,
  MessageSquare, ThumbsUp, ThumbsDown, Send, ChevronDown, ChevronUp,
  DollarSign, Shield, AlertTriangle, Hash, Building2, Mail,
  HardHat, ClipboardCheck, BarChart3, Package, StickyNote,
  Navigation, Layers, Activity, Plus,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import ChangeOrdersSection from '@/components/jobs/ChangeOrdersSection';
import RelatedJobsSection from '@/components/jobs/RelatedJobsSection';
import JobDetailSkeleton from './_skeleton';
import { RevealSection } from '@/components/ui/Skeleton';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FullJob {
  id: string;
  job_number: string;
  status: string;
  job_type: string | null;
  project_name: string | null;
  customer_name: string;
  customer_contact: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  contact_name: string | null;
  foreman_name: string | null;
  site_contact_phone: string | null;
  foreman_phone: string | null;
  address: string | null;
  location: string | null;
  directions: string | null;
  scheduled_date: string | null;
  end_date: string | null;
  arrival_time: string | null;
  is_will_call: boolean;
  estimated_cost: number | null;
  po_number: string | null;
  permit_number: string | null;
  permit_required: boolean;
  description: string | null;
  additional_info: string | null;
  scope_of_work: string | null;
  scope_details: Record<string, unknown> | null;
  equipment_needed: string[] | null;
  equipment_rentals: string[] | null;
  jobsite_conditions: Record<string, unknown> | null;
  site_compliance: Record<string, unknown> | null;
  salesman_name: string | null;
  operator_name: string | null;
  helper_name: string | null;
  assigned_to: string | null;
  completion_submitted_at: string | null;
  completion_approved_at: string | null;
  completion_rejected_at: string | null;
  completion_rejection_notes: string | null;
  created_at: string;
}

interface ScopeProgress {
  scope_item_id: string;
  description: string;
  work_type: string;
  unit: string;
  target_quantity: number;
  completed_quantity: number;
  pct_complete: number;
}

interface ProgressEntry {
  id: string;
  scope_item_description: string | null;
  work_type: string | null;
  unit: string | null;
  quantity_completed: number;
  operator_name: string;
  notes: string | null;
}

interface ProgressByDate {
  date: string;
  entries: ProgressEntry[];
}

interface WorkItem {
  id: string;
  work_type: string;
  quantity: number | null;
  notes: string | null;
  day_number: number | null;
  core_size: string | null;
  core_depth_inches: number | null;
  core_quantity: number | null;
  linear_feet_cut: number | null;
  cut_depth_inches: number | null;
  details_json: Record<string, unknown> | null;
  created_at: string;
}

interface JobNote {
  id: string;
  author_name: string;
  content: string;
  note_type: string;
  created_at: string;
}

interface CompletionRequest {
  id: string;
  status: string;
  submitted_by_name: string | null;
  submitted_at: string;
  operator_notes: string | null;
  review_notes: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateTime(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function formatCurrency(n: number | null) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const STATUS_CONFIG: Record<string, { label: string; color: string; ring: string; step: number }> = {
  scheduled:          { label: 'Scheduled',     color: 'bg-blue-500',   ring: 'ring-blue-200',   step: 0 },
  assigned:           { label: 'Assigned',      color: 'bg-indigo-500', ring: 'ring-indigo-200', step: 1 },
  in_route:           { label: 'In Route',      color: 'bg-cyan-500',   ring: 'ring-cyan-200',   step: 2 },
  in_progress:        { label: 'In Progress',   color: 'bg-orange-500', ring: 'ring-orange-200', step: 3 },
  pending_completion: { label: 'Pending Review',color: 'bg-amber-500',  ring: 'ring-amber-200',  step: 4 },
  completed:          { label: 'Completed',     color: 'bg-green-500',  ring: 'ring-green-200',  step: 5 },
  cancelled:          { label: 'Cancelled',     color: 'bg-gray-400',   ring: 'ring-gray-200',   step: -1 },
};

const STATUS_STEPS = [
  { key: 'scheduled',          label: 'Scheduled' },
  { key: 'assigned',           label: 'Assigned' },
  { key: 'in_route',           label: 'In Route' },
  { key: 'in_progress',        label: 'In Progress' },
  { key: 'pending_completion', label: 'Pending Review' },
  { key: 'completed',          label: 'Completed' },
];

const WORK_TYPE_LABELS: Record<string, string> = {
  core_drilling: 'Core Drilling',
  wall_sawing: 'Wall Sawing',
  flat_sawing: 'Flat Sawing',
  wire_sawing: 'Wire Sawing',
  hand_sawing: 'Hand Sawing',
  gpr_scan: 'GPR Scan',
  demo: 'Demo',
  removal: 'Removal',
  cleanup: 'Cleanup',
  mobilization: 'Mobilization',
  other: 'Other',
};

const NOTE_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  admin_note:     { label: 'Admin → Operator', bg: 'bg-blue-50',   text: 'text-blue-700' },
  manual:         { label: 'Note',             bg: 'bg-gray-100',  text: 'text-gray-600' },
  system:         { label: 'System',           bg: 'bg-purple-50', text: 'text-purple-700' },
  operator_note:  { label: 'Operator',         bg: 'bg-green-50',  text: 'text-green-700' },
  completion:     { label: 'Completion',       bg: 'bg-amber-50',  text: 'text-amber-700' },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title, icon: Icon, children, defaultOpen = true, accent = 'blue',
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const accentMap: Record<string, string> = {
    blue: 'text-blue-600', amber: 'text-amber-600', green: 'text-green-600',
    indigo: 'text-indigo-600', orange: 'text-orange-600', purple: 'text-purple-600',
    gray: 'text-gray-500', red: 'text-red-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className={`w-5 h-5 ${accentMap[accent] || 'text-blue-600'}`} />
          <span className="text-sm font-semibold text-gray-800">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function InfoGrid({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.filter(i => i.value && i.value !== '—').map(({ label, value }) => (
        <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-0.5">{label}</p>
          <p className="text-sm font-semibold text-gray-900">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Edit Schedule Modal ───────────────────────────────────────────────────────

function EditScheduleModal({ job, onClose, onSaved }: { job: FullJob; onClose: () => void; onSaved: () => void }) {
  const [startDate, setStartDate] = useState(job.scheduled_date || '');
  const [endDate, setEndDate] = useState(job.end_date || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const res = await apiFetch(`/api/admin/jobs/${job.id}/schedule`, {
        method: 'PUT',
        body: JSON.stringify({ scheduled_date: startDate, end_date: endDate || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      onSaved(); onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">Edit Schedule</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date <span className="text-gray-400">(optional)</span></label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={save} disabled={saving || !startDate}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Data
  const [job, setJob] = useState<FullJob | null>(null);
  const [scopeProgress, setScopeProgress] = useState<ScopeProgress[]>([]);
  const [overallPct, setOverallPct] = useState(0);
  const [progressByDate, setProgressByDate] = useState<ProgressByDate[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [completionReq, setCompletionReq] = useState<CompletionRequest | null>(null);

  // UI state
  const [showEditSchedule, setShowEditSchedule] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [sendingNote, setSendingNote] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Billing settings
  const [billingType, setBillingType] = useState<string>('fixed');
  const [billingMilestones, setBillingMilestones] = useState<Array<{ label: string; percent: number }>>([]);
  const [newMsLabel, setNewMsLabel] = useState('');
  const [newMsPct, setNewMsPct] = useState('');
  const [savingBilling, setSavingBilling] = useState(false);
  const [billingMsg, setBillingMsg] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.push('/login'); return; }
    if (!['admin', 'super_admin', 'operations_manager', 'salesman'].includes(user.role || '')) {
      router.push('/dashboard');
    }
  }, [router]);

  const fetchAll = useCallback(async () => {
    setPageError(null);
    try {
      const [summaryRes, fullJobRes, notesRes, workItemsRes] = await Promise.all([
        apiFetch(`/api/admin/jobs/${jobId}/summary`),
        apiFetch(`/api/job-orders/${jobId}`),
        apiFetch(`/api/job-orders/${jobId}/notes`),
        apiFetch(`/api/job-orders/${jobId}/work-items`),
      ]);

      // Parse all responses in parallel
      const [summaryJson, fullJobJson, notesJson, workItemsJson] = await Promise.all([
        summaryRes.ok ? summaryRes.json() : null,
        fullJobRes.ok ? fullJobRes.json() : null,
        notesRes.ok ? notesRes.json() : null,
        workItemsRes.ok ? workItemsRes.json() : null,
      ]);

      // Summary — scope + progress + completion (best-effort)
      if (summaryJson) {
        setScopeProgress(summaryJson.data?.scope?.items || []);
        setOverallPct(summaryJson.data?.scope?.overall_pct || 0);
        setProgressByDate(summaryJson.data?.progress?.by_date || []);
        setCompletionReq(summaryJson.data?.completion_request || null);
      }

      // Full job — authoritative source for all job fields
      if (fullJobJson) {
        const d = fullJobJson.data;
        const summaryOperatorName = summaryJson?.data?.job?.operator_name || null;
        setJob({
          id: d.id,
          job_number: d.job_number,
          status: d.status,
          job_type: d.job_type,
          project_name: d.project_name,
          customer_name: d.customer_name,
          customer_contact: d.customer_contact,
          customer_phone: d.customer_phone,
          customer_email: d.customer_email,
          contact_name: d.contact_name,
          foreman_name: d.foreman_name,
          site_contact_phone: d.site_contact_phone,
          foreman_phone: d.foreman_phone,
          address: d.address,
          location: d.location,
          directions: d.directions,
          scheduled_date: d.scheduled_date,
          end_date: d.end_date,
          arrival_time: d.arrival_time,
          is_will_call: d.is_will_call,
          estimated_cost: d.estimated_cost,
          po_number: d.po_number,
          permit_number: d.permit_number,
          permit_required: d.permit_required,
          description: d.description,
          additional_info: d.additional_info,
          scope_of_work: d.scope_of_work,
          scope_details: d.scope_details,
          equipment_needed: d.equipment_needed,
          equipment_rentals: d.equipment_rentals,
          jobsite_conditions: d.jobsite_conditions,
          site_compliance: d.site_compliance,
          salesman_name: d.salesman_name,
          operator_name: d.profiles?.full_name || summaryOperatorName || null,
          helper_name: null,
          assigned_to: d.assigned_to,
          completion_submitted_at: d.completion_submitted_at,
          completion_approved_at: d.completion_approved_at,
          completion_rejected_at: d.completion_rejected_at,
          completion_rejection_notes: d.completion_rejection_notes,
          created_at: d.created_at,
        });
        // Seed billing type from DB
        setBillingType(d.billing_type || 'fixed');
      } else {
        // Full job fetch failed — truly not found or no access
        setPageError('Job not found or you do not have access.');
      }

      // Notes
      if (notesJson) setNotes(notesJson.data || []);

      // Work items
      if (workItemsJson) setWorkItems(workItemsJson.data || []);
    } catch {
      setPageError('Network error loading job.');
    }
  }, [jobId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    };
    load();
  }, [fetchAll]);

  const handleSendNote = async () => {
    if (!newNote.trim()) return;
    setSendingNote(true);
    try {
      const res = await apiFetch(`/api/job-orders/${jobId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: newNote.trim(), noteType: 'admin_note' }),
      });
      if (res.ok) {
        setNewNote('');
        const n = await apiFetch(`/api/job-orders/${jobId}/notes`);
        if (n.ok) setNotes((await n.json()).data || []);
      }
    } finally { setSendingNote(false); }
  };

  const handleApprove = async () => {
    if (!job) return;
    setApproving(true); setFeedback(null);
    try {
      const res = await apiFetch(`/api/admin/jobs/${job.id}/completion-request`, {
        method: 'PUT',
        body: JSON.stringify({ action: 'approve', review_notes: reviewNotes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Approval failed');
      setFeedback({ type: 'success', msg: 'Job approved successfully.' });
      setReviewNotes('');
      await fetchAll();
    } catch (e: unknown) {
      setFeedback({ type: 'error', msg: e instanceof Error ? e.message : 'Action failed' });
    } finally { setApproving(false); }
  };

  const handleReject = async () => {
    if (!job) return;
    setRejecting(true); setFeedback(null);
    try {
      const res = await apiFetch(`/api/admin/jobs/${job.id}/completion-request`, {
        method: 'PUT',
        body: JSON.stringify({ action: 'reject', review_notes: reviewNotes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Rejection failed');
      setFeedback({ type: 'success', msg: 'Completion request rejected.' });
      setReviewNotes('');
      await fetchAll();
    } catch (e: unknown) {
      setFeedback({ type: 'error', msg: e instanceof Error ? e.message : 'Action failed' });
    } finally { setRejecting(false); }
  };

  const handleSaveBillingSettings = async () => {
    setSavingBilling(true);
    setBillingMsg(null);
    try {
      const payload: Record<string, unknown> = { billing_type: billingType };
      if (billingType === 'cycle' && billingMilestones.length > 0) {
        payload.expected_scope = billingMilestones.reduce((acc, m) => ({ ...acc, [m.label]: m.percent }), {});
      }
      const res = await apiFetch(`/api/admin/jobs/${jobId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setBillingMsg('Billing settings saved.');
      } else {
        // Fallback: direct Supabase update
        const { error } = await supabase.from('job_orders').update(payload).eq('id', jobId);
        if (!error) setBillingMsg('Billing settings saved.');
        else setBillingMsg('Failed to save billing settings.');
      }
    } catch {
      setBillingMsg('Failed to save billing settings.');
    } finally { setSavingBilling(false); }
  };

  const addMilestone = () => {
    if (!newMsLabel.trim() || !newMsPct) return;
    setBillingMilestones(prev => [...prev, { label: newMsLabel.trim(), percent: Number(newMsPct) }].sort((a, b) => a.percent - b.percent));
    setNewMsLabel('');
    setNewMsPct('');
  };

  const removeMilestone = (idx: number) => {
    setBillingMilestones(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <JobDetailSkeleton />;
  }

  if (pageError || !job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">{pageError || 'Job not found.'}</p>
          <Link href="/dashboard/admin/active-jobs" className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to Active Jobs
          </Link>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[job.status] || STATUS_CONFIG['scheduled'];
  const currentStep = statusCfg.step;
  const isPendingCompletion = job.status === 'pending_completion';

  // Group work items by day
  const workByDay: Record<number, WorkItem[]> = {};
  for (const wi of workItems) {
    const d = wi.day_number ?? 1;
    if (!workByDay[d]) workByDay[d] = [];
    workByDay[d].push(wi);
  }
  const workDays = Object.keys(workByDay).map(Number).sort((a, b) => a - b);

  // Conditions
  const conditions = job.jobsite_conditions as Record<string, unknown> | null;
  const filledConditions = conditions
    ? Object.entries(conditions).filter(([, v]) => v && v !== false && v !== '' && v !== 0)
    : [];

  const compliance = job.site_compliance as Record<string, unknown> | null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Back link */}
        <Link href="/dashboard/admin/active-jobs"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Active Jobs
        </Link>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <RevealSection index={0}>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                <span className="text-lg font-black text-gray-900 font-mono tracking-tight">{job.job_number}</span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${statusCfg.color} text-white`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                  {statusCfg.label}
                </span>
                {job.permit_required && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                    <Shield className="w-3 h-3" /> Permit Required
                  </span>
                )}
                {isPendingCompletion && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full animate-pulse">
                    <AlertCircle className="w-3 h-3" /> Awaiting Review
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-gray-900">
                {job.project_name || job.customer_name}
                {job.job_type && <span className="font-normal text-gray-500"> — {job.job_type}</span>}
              </h1>
              {job.project_name && (
                <p className="text-sm text-gray-500 mt-0.5">{job.customer_name}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-sm text-gray-500">
                {job.scheduled_date && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {formatDate(job.scheduled_date)}{job.end_date && ` – ${formatDate(job.end_date)}`}
                  </span>
                )}
                {job.operator_name && (
                  <span className="flex items-center gap-1.5">
                    <HardHat className="w-4 h-4" /> {job.operator_name}
                    {job.helper_name && <span className="text-gray-400">+ {job.helper_name}</span>}
                  </span>
                )}
                {job.address && (
                  <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {job.address}</span>
                )}
                {job.arrival_time && (
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {formatTime(job.arrival_time)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <button onClick={() => setShowEditSchedule(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
                <Edit3 className="w-4 h-4" /> Edit Schedule
              </button>
            </div>
          </div>
        </div>
        </RevealSection>

        {/* ── Feedback Banner ────────────────────────────────────────────────── */}
        {feedback && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${feedback.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {feedback.msg}
            <button onClick={() => setFeedback(null)} className="ml-auto p-1 hover:bg-black/10 rounded"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* ── Main Grid ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ──── LEFT COLUMN (2/3) ─────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Project Details */}
            <RevealSection index={1}>
            <Section title="Project Details" icon={Building2} accent="blue">
              <InfoGrid items={[
                { label: 'Customer', value: job.customer_name },
                { label: 'Project', value: job.project_name },
                { label: 'Job Type', value: job.job_type },
                { label: 'Salesman', value: job.salesman_name },
                { label: 'PO Number', value: job.po_number },
                { label: 'Permit #', value: job.permit_number },
                { label: 'Estimated Cost', value: formatCurrency(job.estimated_cost) },
                { label: 'Arrival Time', value: formatTime(job.arrival_time) },
                { label: 'Will Call', value: job.is_will_call ? 'Yes' : null },
                { label: 'Created', value: formatDateTime(job.created_at) },
              ]} />

              {/* Contact info */}
              {(job.customer_contact || job.foreman_name || job.customer_phone || job.site_contact_phone || job.foreman_phone || job.customer_email) && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Contact Information</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: 'Contact', value: job.customer_contact || job.foreman_name, icon: User },
                      { label: 'Phone', value: job.customer_phone || job.site_contact_phone || job.foreman_phone, icon: Phone, href: `tel:${job.customer_phone || job.site_contact_phone || job.foreman_phone}` },
                      { label: 'Email', value: job.customer_email, icon: Mail, href: `mailto:${job.customer_email}` },
                    ].filter(c => c.value).map(({ label, value, icon: Icon2, href }) => (
                      <div key={label} className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
                        <Icon2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">{label}</p>
                          {href
                            ? <a href={href} className="text-sm font-semibold text-green-700 hover:underline truncate">{value}</a>
                            : <p className="text-sm font-semibold text-gray-900 truncate">{value}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Address + location */}
              {(job.address || job.location) && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Location</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {job.address && (
                      <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <MapPin className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Address</p>
                          <a href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`} target="_blank" rel="noopener noreferrer"
                            className="text-sm font-semibold text-blue-700 hover:underline">{job.address}</a>
                        </div>
                      </div>
                    )}
                    {job.location && (
                      <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <Navigation className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Job Location</p>
                          <p className="text-sm font-semibold text-gray-900">{job.location}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {job.directions && (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm text-gray-700">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Directions</span>
                      {job.directions}
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              {job.description && (
                <div className="mt-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Description</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 border border-gray-100 whitespace-pre-wrap">{job.description}</p>
                </div>
              )}
              {job.additional_info && (
                <div className="mt-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Additional Notes</p>
                  <p className="text-sm text-gray-700 bg-purple-50 rounded-xl p-3 border border-purple-100 whitespace-pre-wrap">{job.additional_info}</p>
                </div>
              )}
            </Section>
            </RevealSection>

            {/* Equipment */}
            {((job.equipment_needed && job.equipment_needed.length > 0) || (job.equipment_rentals && job.equipment_rentals.length > 0)) && (
              <Section title="Equipment" icon={Package} accent="orange">
                {job.equipment_needed && job.equipment_needed.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Company Equipment</p>
                    <div className="flex flex-wrap gap-2">
                      {job.equipment_needed.map((eq, i) => (
                        <span key={i} className="px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-sm font-medium text-orange-800">{eq}</span>
                      ))}
                    </div>
                  </div>
                )}
                {job.equipment_rentals && job.equipment_rentals.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Rentals</p>
                    <div className="flex flex-wrap gap-2">
                      {job.equipment_rentals.map((eq, i) => (
                        <span key={i} className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-blue-800">{eq}</span>
                      ))}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* Scope Progress */}
            {scopeProgress.length > 0 && (
              <RevealSection index={2}>
              <Section title="Scope Progress" icon={BarChart3} accent="indigo">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-gray-700">Overall Progress</span>
                    <span className="text-sm font-bold text-indigo-600">{overallPct}%</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: `${overallPct}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  {scopeProgress.map(item => (
                    <div key={item.scope_item_id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <span className="text-sm font-semibold text-gray-800">{item.description || WORK_TYPE_LABELS[item.work_type] || item.work_type}</span>
                          <span className="text-xs text-gray-500 ml-2">{item.completed_quantity} / {item.target_quantity} {item.unit}</span>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.pct_complete >= 100 ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}`}>
                          {item.pct_complete}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${item.pct_complete >= 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                          style={{ width: `${Math.min(100, item.pct_complete)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
              </RevealSection>
            )}

            {/* Work Performed — Progress entries from operators */}
            {(progressByDate.length > 0 || workDays.length > 0) && (
              <RevealSection index={3}>
              <Section title="Work Performed" icon={Activity} accent="green">
                <div className="space-y-4">
                  {progressByDate.map(({ date, entries }) => (
                    <div key={date}>
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-bold text-gray-700">{formatDate(date)}</span>
                      </div>
                      <div className="space-y-2 pl-6">
                        {entries.map(entry => (
                          <div key={entry.id} className="bg-green-50 rounded-xl p-3 border border-green-100">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-gray-800">
                                {entry.scope_item_description || WORK_TYPE_LABELS[entry.work_type || ''] || entry.work_type}
                              </span>
                              <span className="text-sm font-bold text-green-700">
                                {entry.quantity_completed} {entry.unit}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <User className="w-3 h-3" /> {entry.operator_name}
                              </span>
                            </div>
                            {entry.notes && (
                              <p className="text-xs text-gray-600 mt-1.5 italic">&ldquo;{entry.notes}&rdquo;</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {/* Work items logged by operators (detailed) */}
                  {workDays.map(day => (
                    <div key={`wi-day-${day}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Layers className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-bold text-gray-700">Day {day} — Operator Log</span>
                      </div>
                      <div className="space-y-2 pl-6">
                        {workByDay[day].map(wi => (
                          <div key={wi.id} className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-gray-800">{WORK_TYPE_LABELS[wi.work_type] || wi.work_type}</span>
                              <span className="text-xs text-blue-600 font-semibold">{formatDateTime(wi.created_at)}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
                              {wi.core_quantity && <span>Cores: <strong>{wi.core_quantity}</strong></span>}
                              {wi.core_size && <span>Size: <strong>{wi.core_size}</strong></span>}
                              {wi.core_depth_inches && <span>Depth: <strong>{wi.core_depth_inches}&quot;</strong></span>}
                              {wi.linear_feet_cut && <span>Linear Ft: <strong>{wi.linear_feet_cut}</strong></span>}
                              {wi.cut_depth_inches && <span>Cut Depth: <strong>{wi.cut_depth_inches}&quot;</strong></span>}
                              {wi.quantity && <span>Qty: <strong>{wi.quantity}</strong></span>}
                            </div>
                            {wi.notes && <p className="text-xs text-gray-600 mt-1.5 italic">&ldquo;{wi.notes}&rdquo;</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
              </RevealSection>
            )}

            {/* Jobsite Conditions */}
            {filledConditions.length > 0 && (
              <Section title="Jobsite Conditions" icon={AlertTriangle} accent="amber" defaultOpen={false}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {filledConditions.map(([key, val]) => {
                    const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    const isWarning = ['cord_480', 'high_work', 'confined_space'].includes(key);
                    return (
                      <div key={key} className={`p-2.5 rounded-lg border text-xs ${isWarning ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                        <span className="font-semibold block">{label}</span>
                        {typeof val === 'string' && val !== 'true' && <span className="text-gray-600">{val}</span>}
                        {typeof val === 'number' && <span className="font-bold">{val}</span>}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Site Compliance */}
            {compliance && Object.keys(compliance).length > 0 && (() => {
              const c = compliance as Record<string, unknown>;
              return (
                <Section title="Site Compliance" icon={ClipboardCheck} accent="indigo" defaultOpen={false}>
                  <div className="space-y-2">
                    {!!c.orientation_required && (
                      <div className="flex items-start gap-2 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                        <Shield className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-indigo-800">Orientation Required</p>
                          {!!c.orientation_datetime && (
                            <p className="text-xs text-indigo-700 mt-0.5">{String(c.orientation_datetime)}</p>
                          )}
                        </div>
                      </div>
                    )}
                    {!!c.badging_required && (
                      <div className="flex items-start gap-2 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                        <Hash className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-indigo-800">Badging Required</p>
                          {!!c.badging_type && (
                            <p className="text-xs text-indigo-700 mt-0.5">{String(c.badging_type)}</p>
                          )}
                        </div>
                      </div>
                    )}
                    {!!c.special_instructions && (
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-600 mb-1">Special Instructions</p>
                        <p className="text-sm text-gray-700">{String(c.special_instructions)}</p>
                      </div>
                    )}
                    {!c.orientation_required && !c.badging_required && !c.special_instructions && (
                      <p className="text-sm text-gray-500">No compliance requirements specified.</p>
                    )}
                  </div>
                </Section>
              );
            })()}

            {/* Change Orders */}
            <ChangeOrdersSection
              jobId={job.id}
              jobStatus={job.status}
              isAdmin={true}
            />

            {/* Related Jobs */}
            <RelatedJobsSection
              jobId={job.id}
              jobNumber={job.job_number}
              isAdmin={true}
            />
          </div>

          {/* ──── RIGHT COLUMN (1/3) ────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Status Tracker */}
            <RevealSection index={1}>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-800">Job Status</h3>
              </div>
              <div className="space-y-0">
                {STATUS_STEPS.map((step, idx) => {
                  const isActive = step.key === job.status;
                  const isDone = currentStep > idx;
                  return (
                    <div key={step.key} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                          isActive ? `${statusCfg.color} border-transparent` :
                          isDone ? 'bg-green-500 border-transparent' :
                          'bg-white border-gray-200'
                        }`}>
                          {isDone ? <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            : isActive ? <span className="w-2 h-2 rounded-full bg-white" />
                            : <span className="w-2 h-2 rounded-full bg-gray-300" />}
                        </div>
                        {idx < STATUS_STEPS.length - 1 && (
                          <div className={`w-0.5 h-5 ${isDone ? 'bg-green-400' : 'bg-gray-200'}`} />
                        )}
                      </div>
                      <div className="pb-2">
                        <span className={`text-sm font-semibold ${isActive ? 'text-gray-900' : isDone ? 'text-green-700' : 'text-gray-400'}`}>
                          {step.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </RevealSection>

            {/* Crew */}
            {job.operator_name && (
              <RevealSection index={2}>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <HardHat className="w-5 h-5 text-blue-600" />
                  <h3 className="text-sm font-bold text-gray-800">Crew</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {job.operator_name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Operator</p>
                      <p className="text-sm font-bold text-gray-900">{job.operator_name}</p>
                    </div>
                  </div>
                  {job.helper_name && (
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {job.helper_name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider">Team Member</p>
                        <p className="text-sm font-bold text-gray-900">{job.helper_name}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              </RevealSection>
            )}

            {/* Billing Settings */}
            <RevealSection index={3}>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-gray-800">Billing Settings</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Billing Type</label>
                  <select
                    value={billingType}
                    onChange={e => setBillingType(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="fixed">Fixed Price</option>
                    <option value="cycle">Cycle Billing</option>
                    <option value="tm">Time &amp; Material</option>
                  </select>
                </div>

                {/* Cycle milestones */}
                {billingType === 'cycle' && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Milestones</label>
                    {billingMilestones.map((m, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 bg-purple-50 rounded-lg border border-purple-100 mb-1.5 text-sm">
                        <span className="font-medium text-gray-800">{m.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-purple-700 font-bold">{m.percent}%</span>
                          <button onClick={() => removeMilestone(i)} className="text-gray-400 hover:text-red-500 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={newMsLabel}
                        onChange={e => setNewMsLabel(e.target.value)}
                        placeholder="Label"
                        className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                      <input
                        type="number"
                        value={newMsPct}
                        onChange={e => setNewMsPct(e.target.value)}
                        placeholder="%"
                        min={1} max={100}
                        className="w-14 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                      <button
                        onClick={addMilestone}
                        disabled={!newMsLabel.trim() || !newMsPct}
                        className="px-2 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* T&M rates display */}
                {billingType === 'tm' && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs space-y-1">
                    <p className="font-semibold text-amber-800">Standard Rates</p>
                    <p className="text-amber-700">Regular: $125/hr</p>
                    <p className="text-amber-700">OT: $187.50/hr</p>
                    <p className="text-amber-700">Night Shift: $150/hr</p>
                  </div>
                )}

                {billingMsg && (
                  <p className={`text-xs ${billingMsg.includes('Failed') ? 'text-red-600' : 'text-emerald-600'} font-semibold`}>
                    {billingMsg}
                  </p>
                )}

                <button
                  onClick={handleSaveBillingSettings}
                  disabled={savingBilling}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {savingBilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                  Save Billing Settings
                </button>

                {job.status === 'completed' && (
                  <Link
                    href={`/dashboard/admin/completed-job-tickets/${job.id}`}
                    className="block w-full text-center py-2 border border-gray-200 text-gray-600 text-xs font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    View Completion Summary
                  </Link>
                )}
              </div>
            </div>
            </RevealSection>

            {/* Note for Operator */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <Send className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-800">Note for Operator</h3>
              </div>
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Type a message for the operator — they'll see this on their job page..."
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
              />
              <button
                onClick={handleSendNote}
                disabled={sendingNote || !newNote.trim()}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {sendingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Note
              </button>
            </div>

            {/* Completion Review */}
            {isPendingCompletion && completionReq && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <h3 className="text-sm font-bold text-amber-800">Completion Review</h3>
                </div>
                <div className="bg-white/70 rounded-xl p-3 border border-amber-200 mb-4">
                  <p className="text-xs text-amber-700 font-semibold uppercase tracking-wider mb-1">
                    Submitted by {completionReq.submitted_by_name || 'Operator'} — {formatDateTime(completionReq.submitted_at)}
                  </p>
                  {completionReq.operator_notes && (
                    <p className="text-sm text-gray-700 italic">&ldquo;{completionReq.operator_notes}&rdquo;</p>
                  )}
                </div>
                <textarea
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="Review notes (optional)..."
                  rows={2}
                  className="w-full rounded-xl border border-amber-200 bg-white/70 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-amber-400 mb-3"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleApprove} disabled={approving}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors">
                    {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                    Approve
                  </button>
                  <button onClick={handleReject} disabled={rejecting}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors">
                    {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                    Reject
                  </button>
                </div>
              </div>
            )}

            {/* Notes Feed */}
            <RevealSection index={4}>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <StickyNote className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-bold text-gray-800">Notes & Activity</h3>
                {notes.length > 0 && (
                  <span className="ml-auto text-xs text-gray-500 font-semibold">{notes.length} notes</span>
                )}
              </div>
              {notes.length === 0 ? (
                <div className="text-center py-6">
                  <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No notes yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {notes.map(note => {
                    const cfg = NOTE_TYPE_CONFIG[note.note_type] || NOTE_TYPE_CONFIG['manual'];
                    return (
                      <div key={note.id} className="border border-gray-100 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-gray-600">{note.author_name?.[0]?.toUpperCase() || '?'}</span>
                          </div>
                          <span className="text-xs font-bold text-gray-800">{note.author_name}</span>
                          <span className={`ml-auto text-xs font-semibold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{note.content}</p>
                        <p className="text-xs text-gray-400 mt-1.5">{formatDateTime(note.created_at)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </RevealSection>
          </div>
        </div>
      </div>

      {showEditSchedule && job && (
        <EditScheduleModal job={job} onClose={() => setShowEditSchedule(false)} onSaved={fetchAll} />
      )}
    </div>
  );
}
