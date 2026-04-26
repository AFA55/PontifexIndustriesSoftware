'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { CompletedJobTicketSkeleton } from './_skeleton';
import { RevealSection } from '@/components/ui/Skeleton';
import {
  ArrowLeft, FileText, Star, Clock, DollarSign, User, MapPin,
  CheckCircle, Calendar, AlertCircle, Download, Eye, X, Plus,
  Loader2, Bell, Receipt, TrendingUp, BarChart3, Target,
  Image as ImageIcon, Milestone, ChevronRight, Send, PenTool, RefreshCw,
} from 'lucide-react';

interface CompletionSummary {
  id: string; job_number: string; title: string | null; project_name: string | null;
  customer_name: string; customer_contact: string | null; customer_email: string | null;
  address: string | null; location: string | null; job_location: string | null;
  scheduled_date: string | null; completion_signed_at: string | null; work_completed_at: string | null;
  billing_type: string | null; estimated_cost: number | null; actual_cost: number | null;
  expected_scope: Record<string, number> | null; scope_details: Record<string, unknown> | null;
  liability_release_pdf_url: string | null; liability_release_signed_by: string | null;
  liability_release_signed_at: string | null; work_order_pdf_url: string | null;
  silica_plan_pdf_url: string | null; completion_signer_name: string | null;
  completion_pdf_url: string | null; completion_signature_url: string | null;
  contact_not_on_site: boolean; customer_overall_rating: number | null;
  customer_cleanliness_rating: number | null; customer_communication_rating: number | null;
  customer_feedback_comments: string | null; feedback_submitted_at: string | null;
  assigned_to: string | null; salesman_name: string | null; salesman_id: string | null;
  po_number: string | null; foreman_name: string | null; foreman_phone: string | null;
  description: string | null; scope_of_work: string | null;
}
interface LaborRow { operator_name: string; date: string; regular_hrs: number; ot_hrs: number; ns_hrs: number; total: number; }
interface BillingMilestone { id: string; label: string; milestone_percent: number; triggered_at: string | null; }
interface ScopeMetric { label: string; actual: number; expected: number; pct: number; }
interface Photo { id: string; url: string; caption: string | null; uploaded_at: string; }
interface SigRequest { id: string; token: string; contact_name: string | null; contact_email: string | null; status: string; sent_at: string | null; signed_at: string | null; expires_at: string; signing_url: string; is_expired: boolean; }

const RATE_REGULAR = 125;
const RATE_OT = 187.5;
const RATE_NS = 150;

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}
async function apiFetch(url: string, opts?: RequestInit) {
  const token = await getToken();
  return fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts?.headers } });
}
function billingTypeBadge(type: string | null) {
  if (!type) return null;
  const cfg: Record<string, { cls: string; label: string }> = {
    fixed: {
      cls: 'bg-sky-100 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/30',
      label: 'Fixed Price',
    },
    cycle: {
      cls: 'bg-violet-100 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30',
      label: 'Cycle Billing',
    },
    time_material: {
      cls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30',
      label: 'T&M',
    },
    time_and_material: {
      cls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30',
      label: 'T&M',
    },
    tm: {
      cls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30',
      label: 'T&M',
    },
  };
  const c = cfg[type.toLowerCase()] || {
    cls: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white/80 dark:ring-white/10',
    label: type,
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}
    >
      {c.label}
    </span>
  );
}
function StarDisplay({ rating, max = 5 }: { rating: number | null; max?: number }) {
  if (rating === null || rating === undefined)
    return <span className="text-slate-400 dark:text-white/40 text-sm">No rating</span>;
  const normalized = max === 10 ? rating / 2 : rating;
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${
            i < Math.floor(normalized)
              ? 'fill-amber-400 text-amber-400'
              : 'text-slate-300 dark:text-white/20'
          }`}
        />
      ))}
      <span className="ml-1 text-sm font-medium text-slate-600 dark:text-white/70">
        {rating}/{max}
      </span>
    </div>
  );
}
function ProgressBar({ pct }: { pct: number }) {
  const color =
    pct >= 100
      ? 'bg-emerald-500'
      : pct >= 50
      ? 'bg-amber-400'
      : 'bg-rose-500';
  return (
    <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
      <div
        className={`h-2 rounded-full ${color} transition-all`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}
const SECTION_CARD =
  'rounded-2xl p-6 bg-white/90 ring-1 ring-slate-200 shadow-sm dark:bg-white/[0.04] dark:ring-white/10';

export default function CompletedJobSummaryPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CompletionSummary | null>(null);
  const [laborRows, setLaborRows] = useState<LaborRow[]>([]);
  const [milestones, setMilestones] = useState<BillingMilestone[]>([]);
  const [scopeMetrics, setScopeMetrics] = useState<ScopeMetric[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [currentPdfUrl, setCurrentPdfUrl] = useState('');
  const [currentPdfTitle, setCurrentPdfTitle] = useState('');
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneLabel, setMilestoneLabel] = useState('');
  const [milestonePercent, setMilestonePercent] = useState('');
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSigModal, setShowSigModal] = useState(false);
  const [sigEmail, setSigEmail] = useState('');
  const [sigName, setSigName] = useState('');
  const [sigPhone, setSigPhone] = useState('');
  const [sendingSig, setSendingSig] = useState(false);
  const [sigRequests, setSigRequests] = useState<SigRequest[]>([]);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.push('/login'); return; }
    if (!['admin', 'super_admin', 'salesman', 'operations_manager'].includes(user.role)) { router.push('/dashboard'); return; }
    loadData();
    loadSigRequests();
  }, [jobId]);

  useEffect(() => {
    if (actionMsg) { const t = setTimeout(() => setActionMsg(null), 4000); return () => clearTimeout(t); }
  }, [actionMsg]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/completion-summary`);
      if (res.ok) { const data = await res.json(); hydrate(data.data); return; }
    } catch (_) {}
    await loadFromSupabase();
  };

  const hydrate = (data: any) => {
    setSummary(data.job || data);
    setLaborRows(data.labor_rows || []);
    setMilestones(data.billing_milestones || []);
    buildScopeMetrics(data.job || data, data.work_items || []);
    setPhotos(data.photos || []);
    setDocuments(data.documents || []);
    setLoading(false);
  };

  const loadFromSupabase = async () => {
    try {
      const { data: job } = await supabase.from('job_orders').select('*').eq('id', jobId).single();
      if (!job) { setLoading(false); return; }
      setSummary(job as CompletionSummary);
      const { data: workItems } = await supabase.from('work_items').select('*').eq('job_order_id', jobId).order('day_number', { ascending: true });
      buildScopeMetrics(job, workItems || []);
      const { data: timecards } = await supabase.from('timecards').select('*, profiles(full_name)').eq('job_order_id', jobId).order('clock_in', { ascending: true });
      if (timecards) {
        setLaborRows(timecards.map((tc: any) => {
          const reg = Number(tc.regular_hours || 0), ot = Number(tc.overtime_hours || 0), ns = Number(tc.night_shift_hours || 0);
          return { operator_name: tc.profiles?.full_name || 'Unknown', date: tc.clock_in ? new Date(tc.clock_in).toLocaleDateString() : '--', regular_hrs: reg, ot_hrs: ot, ns_hrs: ns, total: reg + ot + ns };
        }));
      }
      try { const { data: ms } = await supabase.from('billing_milestones').select('*').eq('job_order_id', jobId).order('milestone_percent', { ascending: true }); setMilestones((ms || []) as BillingMilestone[]); } catch (_) {}
      const { data: docs } = await supabase.from('pdf_documents').select('*').eq('job_id', jobId).eq('is_latest', true).order('generated_at', { ascending: false });
      setDocuments(docs || []);
      try { const { data: ph } = await supabase.from('job_photos').select('*').eq('job_order_id', jobId).order('uploaded_at', { ascending: false }); setPhotos((ph || []) as Photo[]); } catch (_) {}
    } catch (err) { console.error('Error loading job summary:', err); } finally { setLoading(false); }
  };

  const loadSigRequests = async () => {
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/send-signature-request`);
      if (res.ok) { const data = await res.json(); setSigRequests(data.data?.requests || []); }
    } catch (_) {}
  };

  const buildScopeMetrics = (job: any, workItems: any[]) => {
    const metrics: ScopeMetric[] = [];
    const expected = job.expected_scope || {};
    const coresActual = workItems.reduce((s: number, i: any) => s + Number(i.core_quantity || 0), 0);
    const lfActual = workItems.reduce((s: number, i: any) => s + Number(i.linear_feet_cut || 0), 0);
    if (coresActual > 0 || expected.cores) { const exp = Number(expected.cores || 0); metrics.push({ label: 'Cores Drilled', actual: coresActual, expected: exp, pct: exp > 0 ? (coresActual / exp) * 100 : 100 }); }
    if (lfActual > 0 || expected.linear_feet) { const exp = Number(expected.linear_feet || 0); metrics.push({ label: 'Linear Feet Cut', actual: lfActual, expected: exp, pct: exp > 0 ? (lfActual / exp) * 100 : 100 }); }
    setScopeMetrics(metrics);
  };

  const handleNotifySalesperson = async () => {
    setNotifying(true);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/notify-salesperson`, { method: 'POST' });
      setActionMsg(res.ok ? { type: 'success', text: 'Salesperson notified successfully.' } : { type: 'error', text: 'Failed to notify salesperson.' });
    } catch (_) { setActionMsg({ type: 'error', text: 'Failed to notify salesperson.' }); }
    finally { setNotifying(false); }
  };

  const openSigModal = (email?: string, name?: string) => {
    setSigEmail(email || summary?.customer_email || '');
    setSigName(name || summary?.customer_name || '');
    setSigPhone('');
    setShowSigModal(true);
  };

  const handleSendSignatureRequest = async () => {
    if (!sigEmail.trim()) return;
    setSendingSig(true);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/send-signature-request`, {
        method: 'POST',
        body: JSON.stringify({ customer_email: sigEmail.trim(), customer_name: sigName.trim() || summary?.customer_name, customer_phone: sigPhone.trim() || undefined }),
      });
      if (res.ok) {
        setActionMsg({ type: 'success', text: `Signature request sent to ${sigEmail.trim()}` });
        setShowSigModal(false); setSigEmail(''); setSigName(''); setSigPhone('');
        loadSigRequests();
      } else {
        const err = await res.json();
        setActionMsg({ type: 'error', text: err.error || 'Failed to send signature request.' });
      }
    } catch (_) { setActionMsg({ type: 'error', text: 'Network error. Please try again.' }); }
    finally { setSendingSig(false); }
  };

  const handleAddMilestone = async () => {
    if (!milestoneLabel.trim() || !milestonePercent) return;
    setSavingMilestone(true);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/billing-milestones`, { method: 'POST', body: JSON.stringify({ label: milestoneLabel.trim(), milestone_percent: Number(milestonePercent) }) });
      if (res.ok) {
        const data = await res.json();
        setMilestones(prev => [...prev, data.data.milestone].sort((a, b) => a.milestone_percent - b.milestone_percent));
        setMilestoneLabel(''); setMilestonePercent(''); setShowMilestoneForm(false);
        setActionMsg({ type: 'success', text: 'Milestone added.' });
      } else {
        const { data: ms } = await supabase.from('billing_milestones').insert({ job_order_id: jobId, label: milestoneLabel.trim(), milestone_percent: Number(milestonePercent) }).select().single();
        if (ms) { setMilestones(prev => [...prev, ms as BillingMilestone].sort((a, b) => a.milestone_percent - b.milestone_percent)); setMilestoneLabel(''); setMilestonePercent(''); setShowMilestoneForm(false); setActionMsg({ type: 'success', text: 'Milestone added.' }); }
      }
    } catch (_) { setActionMsg({ type: 'error', text: 'Failed to add milestone.' }); }
    finally { setSavingMilestone(false); }
  };

  const handleTriggerMilestone = async (msId: string) => {
    setTriggeringId(msId);
    try {
      const res = await apiFetch(`/api/admin/billing-milestones/${msId}/trigger`, { method: 'POST' });
      if (res.ok) { setMilestones(prev => prev.map(m => m.id === msId ? { ...m, triggered_at: new Date().toISOString() } : m)); setActionMsg({ type: 'success', text: 'Milestone triggered.' }); }
      else {
        await supabase.from('billing_milestones').update({ triggered_at: new Date().toISOString(), notification_sent: true, notified_at: new Date().toISOString() }).eq('id', msId);
        setMilestones(prev => prev.map(m => m.id === msId ? { ...m, triggered_at: new Date().toISOString() } : m));
        setActionMsg({ type: 'success', text: 'Milestone triggered.' });
      }
    } catch (_) { setActionMsg({ type: 'error', text: 'Failed to trigger milestone.' }); }
    finally { setTriggeringId(null); }
  };

  const openPdfViewer = (url: string, title: string) => { setCurrentPdfUrl(url); setCurrentPdfTitle(title); setPdfViewerOpen(true); };

  const totalRegular = laborRows.reduce((s, r) => s + r.regular_hrs, 0);
  const totalOT = laborRows.reduce((s, r) => s + r.ot_hrs, 0);
  const totalNS = laborRows.reduce((s, r) => s + r.ns_hrs, 0);
  const totalHrs = laborRows.reduce((s, r) => s + r.total, 0);
  const laborCost = totalRegular * RATE_REGULAR + totalOT * RATE_OT + totalNS * RATE_NS;
  const remoteSignedReq = sigRequests.find(r => r.status === 'signed');
  const pendingReq = sigRequests.find(r => (r.status === 'sent' || r.status === 'opened') && !r.is_expired);

  if (loading) {
    return <CompletedJobTicketSkeleton />;
  }

  if (!summary) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Job Not Found</h2>
          <Link
            href="/dashboard/admin/completed-job-tickets"
            className="text-violet-600 dark:text-violet-300 hover:underline text-sm"
          >
            Back to Completed Jobs
          </Link>
        </div>
      </div>
    );
  }

  const jobName = summary.project_name || summary.title || summary.job_number;
  const customerName = summary.customer_name;
  const location = summary.address || summary.location || summary.job_location || '--';
  const scheduledDate = summary.scheduled_date ? new Date(summary.scheduled_date).toLocaleDateString() : '--';
  const completedDate = (summary.completion_signed_at || summary.work_completed_at) ? new Date((summary.completion_signed_at || summary.work_completed_at)!).toLocaleDateString() : '--';
  const signatureCaptured = !summary.contact_not_on_site && !!summary.completion_signer_name;
  const isCycleBilling = (summary.billing_type || '').toLowerCase() === 'cycle';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
      {/* Header */}
      <div className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-slate-200 dark:bg-[#0b0618]/80 dark:border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/admin/completed-job-tickets"
              className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors dark:bg-white/5 dark:border-white/10 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">
                  {summary.job_number}
                </span>
                <ChevronRight className="w-3 h-3 text-slate-300 dark:text-white/30" />
                <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                  {jobName}
                </h1>
              </div>
              <p className="text-sm text-slate-500 dark:text-white/60">{customerName}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
                <CheckCircle className="w-4 h-4" />
                Completed
              </span>
              <button
                onClick={handleNotifySalesperson}
                disabled={notifying}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50
                  bg-white border border-slate-200 text-slate-700 hover:bg-slate-50
                  dark:bg-white/5 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10"
              >
                {notifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                Notify Salesperson
              </button>
              <button
                onClick={() => openSigModal()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100
                  dark:bg-violet-500/15 dark:border-violet-400/30 dark:text-violet-200 dark:hover:bg-violet-500/25"
              >
                <Send className="w-4 h-4" />
                Send for Signature
              </button>
              <Link
                href={`/dashboard/admin/billing/create?job=${jobId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all
                  bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white shadow-md shadow-violet-500/20 hover:shadow-lg"
              >
                <Receipt className="w-4 h-4" />
                Create Invoice
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Action messages */}
      {actionMsg && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
          <div
            className={`flex items-center gap-3 p-3 rounded-xl ring-1 text-sm ${
              actionMsg.type === 'success'
                ? 'bg-emerald-50 ring-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:ring-emerald-400/30 dark:text-emerald-300'
                : 'bg-rose-50 ring-rose-200 text-rose-700 dark:bg-rose-500/10 dark:ring-rose-400/30 dark:text-rose-300'
            }`}
          >
            {actionMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="flex-1">{actionMsg.text}</span>
            <button onClick={() => setActionMsg(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Job Overview */}
        <RevealSection index={0}>
        <div className={`relative overflow-hidden ${SECTION_CARD}`}>
          <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" aria-hidden />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-violet-600 dark:text-violet-300" />
            Job Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Customer</p>
              <p className="text-slate-900 dark:text-white font-medium">{customerName}</p>
              {summary.customer_contact && <p className="text-sm text-slate-500 dark:text-white/60">{summary.customer_contact}</p>}
              {summary.customer_email && <p className="text-sm text-slate-400 dark:text-white/40">{summary.customer_email}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Location</p>
              <p className="text-slate-900 dark:text-white font-medium flex items-start gap-1">
                <MapPin className="w-4 h-4 text-slate-400 dark:text-white/40 mt-0.5 flex-shrink-0" />
                {location}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Dates</p>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-slate-400 dark:text-white/40" />
                <span className="text-slate-600 dark:text-white/70">{scheduledDate}</span>
                <span className="text-slate-400 dark:text-white/40">→</span>
                <span className="text-slate-900 dark:text-white font-medium">{completedDate}</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Billing Type</p>
              <div>{billingTypeBadge(summary.billing_type) ?? <span className="text-slate-400 dark:text-white/40 text-sm">Not set</span>}</div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Estimated Cost</p>
              <p className="text-slate-900 dark:text-white font-medium">{summary.estimated_cost ? `$${Number(summary.estimated_cost).toLocaleString()}` : '--'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Actual Cost</p>
              <p
                className={`font-semibold ${
                  summary.actual_cost &&
                  summary.estimated_cost &&
                  summary.actual_cost > summary.estimated_cost
                    ? 'text-rose-600 dark:text-rose-300'
                    : 'text-emerald-600 dark:text-emerald-300'
                }`}
              >
                {summary.actual_cost
                  ? `$${Number(summary.actual_cost).toLocaleString()}`
                  : laborCost > 0
                  ? `$${laborCost.toFixed(0)} (labor est.)`
                  : '--'}
              </p>
            </div>
            {summary.po_number && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">PO Number</p>
                <p className="text-slate-900 dark:text-white font-medium">{summary.po_number}</p>
              </div>
            )}
            {summary.salesman_name && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Salesperson</p>
                <p className="text-slate-900 dark:text-white font-medium flex items-center gap-1">
                  <User className="w-4 h-4 text-slate-400 dark:text-white/40" />
                  {summary.salesman_name}
                </p>
              </div>
            )}
            {(summary.foreman_name || summary.foreman_phone) && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Site Contact</p>
                <p className="text-slate-900 dark:text-white font-medium">{summary.foreman_name}</p>
                {summary.foreman_phone && <p className="text-sm text-slate-500 dark:text-white/60">{summary.foreman_phone}</p>}
              </div>
            )}
          </div>
        </div>
        </RevealSection>

        {/* Scope Completed */}
        {scopeMetrics.length > 0 && (
          <RevealSection index={1}>
          <div className={SECTION_CARD}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-300" />
              Scope Completed
            </h2>
            <div className={`grid grid-cols-1 gap-4 ${scopeMetrics.length === 1 ? 'sm:grid-cols-1' : scopeMetrics.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
              {scopeMetrics.map((m) => (
                <div key={m.label} className="rounded-xl p-4 text-center bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
                  <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-2">{m.label}</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white mb-1 tabular-nums">{m.actual.toLocaleString()}</p>
                  {m.expected > 0 && (
                    <>
                      <p className="text-xs text-slate-400 dark:text-white/40 mb-3">of {m.expected.toLocaleString()} expected</p>
                      <ProgressBar pct={m.pct} />
                      <p className={`text-xs font-semibold mt-1 ${m.pct >= 100 ? 'text-emerald-600 dark:text-emerald-300' : m.pct >= 50 ? 'text-amber-600 dark:text-amber-300' : 'text-rose-600 dark:text-rose-300'}`}>
                        {m.pct.toFixed(0)}% complete
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          </RevealSection>
        )}

        {/* Labor Hours */}
        <RevealSection index={2}>
        <div className={SECTION_CARD}>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-sky-600 dark:text-sky-300" />
            Labor Hours
          </h2>
          {laborRows.length === 0 ? (
            <div className="text-center py-8 text-slate-400 dark:text-white/40">
              <Clock className="w-10 h-10 mx-auto mb-2 text-slate-200 dark:text-white/20" />
              <p className="text-sm">No timecard records found for this job.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10">
                    {['Operator', 'Date', 'Regular Hrs', 'OT Hrs', 'NS Premium Hrs', 'Total'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {laborRows.map((row, i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-slate-50/70 dark:bg-white/[0.02]' : ''}>
                      <td className="px-4 py-2.5 text-slate-900 dark:text-white font-medium">{row.operator_name}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-white/70">{row.date}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-white/80 tabular-nums">{row.regular_hrs.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-amber-700 dark:text-amber-300 tabular-nums">{row.ot_hrs > 0 ? row.ot_hrs.toFixed(1) : '--'}</td>
                      <td className="px-4 py-2.5 text-violet-700 dark:text-violet-300 tabular-nums">{row.ns_hrs > 0 ? row.ns_hrs.toFixed(1) : '--'}</td>
                      <td className="px-4 py-2.5 text-slate-900 dark:text-white font-semibold tabular-nums">{row.total.toFixed(1)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 dark:bg-white/[0.05] border-t-2 border-slate-200 dark:border-white/10 font-semibold">
                    <td className="px-4 py-2.5 text-slate-900 dark:text-white" colSpan={2}>Totals</td>
                    <td className="px-4 py-2.5 text-slate-900 dark:text-white tabular-nums">{totalRegular.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-amber-700 dark:text-amber-300 tabular-nums">{totalOT > 0 ? totalOT.toFixed(1) : '--'}</td>
                    <td className="px-4 py-2.5 text-violet-700 dark:text-violet-300 tabular-nums">{totalNS > 0 ? totalNS.toFixed(1) : '--'}</td>
                    <td className="px-4 py-2.5 text-slate-900 dark:text-white tabular-nums">{totalHrs.toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {laborCost > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10 flex flex-wrap gap-3">
              <div className="rounded-lg px-3 py-2 text-sm bg-sky-50 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-400/30">
                <span className="text-slate-600 dark:text-white/60">Regular: </span>
                <span className="font-semibold text-sky-700 dark:text-sky-300">${(totalRegular * RATE_REGULAR).toFixed(0)}</span>
                <span className="text-slate-400 dark:text-white/40 ml-1">@ ${RATE_REGULAR}/hr</span>
              </div>
              {totalOT > 0 && (
                <div className="rounded-lg px-3 py-2 text-sm bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-400/30">
                  <span className="text-slate-600 dark:text-white/60">OT: </span>
                  <span className="font-semibold text-amber-700 dark:text-amber-300">${(totalOT * RATE_OT).toFixed(0)}</span>
                  <span className="text-slate-400 dark:text-white/40 ml-1">@ ${RATE_OT}/hr</span>
                </div>
              )}
              {totalNS > 0 && (
                <div className="rounded-lg px-3 py-2 text-sm bg-violet-50 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/30">
                  <span className="text-slate-600 dark:text-white/60">Night Shift: </span>
                  <span className="font-semibold text-violet-700 dark:text-violet-300">${(totalNS * RATE_NS).toFixed(0)}</span>
                  <span className="text-slate-400 dark:text-white/40 ml-1">@ ${RATE_NS}/hr</span>
                </div>
              )}
              <div className="rounded-lg px-3 py-2 text-sm font-bold bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-400/30">
                <span className="text-slate-600 dark:text-white/60">Total Labor Cost: </span>
                <span className="text-emerald-700 dark:text-emerald-300">${laborCost.toFixed(0)}</span>
              </div>
            </div>
          )}
        </div>
        </RevealSection>

        {/* Cycle Billing */}
        <RevealSection index={3}>
        {!isCycleBilling && (
          <div className="rounded-xl p-4 text-sm bg-sky-50 ring-1 ring-sky-200 text-sky-700 dark:bg-sky-500/10 dark:ring-sky-400/30 dark:text-sky-300">
            <strong>Cycle billing not enabled.</strong> To use milestone-based billing for this job, go to the{' '}
            <a href={`/dashboard/admin/jobs/${summary.id}`} className="underline font-semibold">Job Detail page</a> and set Billing Type to &ldquo;Cycle Billing&rdquo;.
          </div>
        )}
        {isCycleBilling && (
          <div className={SECTION_CARD}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-violet-600 dark:text-violet-300" />
                Cycle Billing Milestones
              </h2>
              <button
                onClick={() => setShowMilestoneForm((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-all
                  bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 hover:shadow-md shadow-violet-500/20"
              >
                <Plus className="w-4 h-4" />
                Add Milestone
              </button>
            </div>
            {showMilestoneForm && (
              <div className="mb-4 p-4 rounded-xl bg-violet-50 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/30 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-40">
                  <label className="text-xs font-semibold text-slate-600 dark:text-white/70 uppercase mb-1 block">Label</label>
                  <input
                    type="text"
                    value={milestoneLabel}
                    onChange={(e) => setMilestoneLabel(e.target.value)}
                    placeholder="e.g. Foundation Complete"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-white border border-slate-300 text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                      dark:bg-white/5 dark:border-white/10 dark:text-white dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
                  />
                </div>
                <div className="w-32">
                  <label className="text-xs font-semibold text-slate-600 dark:text-white/70 uppercase mb-1 block">% Target</label>
                  <input
                    type="number"
                    value={milestonePercent}
                    onChange={(e) => setMilestonePercent(e.target.value)}
                    placeholder="25"
                    min={1}
                    max={100}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-white border border-slate-300 text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                      dark:bg-white/5 dark:border-white/10 dark:text-white dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddMilestone}
                    disabled={savingMilestone || !milestoneLabel.trim() || !milestonePercent}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 flex items-center gap-1.5
                      bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:shadow-md"
                  >
                    {savingMilestone ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Save
                  </button>
                  <button
                    onClick={() => setShowMilestoneForm(false)}
                    className="px-4 py-2 rounded-lg text-sm transition-colors bg-white border border-slate-300 text-slate-600 hover:bg-slate-50
                      dark:bg-white/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {milestones.length === 0 ? (
              <div className="text-center py-8 text-slate-400 dark:text-white/40">
                <Target className="w-10 h-10 mx-auto mb-2 text-slate-200 dark:text-white/20" />
                <p className="text-sm">No milestones set.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {milestones.map((ms) => {
                  const isTriggered = !!ms.triggered_at;
                  return (
                    <div
                      key={ms.id}
                      className={`flex items-center justify-between p-4 rounded-xl ring-1 ${
                        isTriggered
                          ? 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-400/30'
                          : 'bg-slate-50 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                            isTriggered
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-white/70'
                          }`}
                        >
                          {ms.milestone_percent}%
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{ms.label}</p>
                          {ms.triggered_at && (
                            <p className="text-xs text-slate-500 dark:text-white/50">
                              Triggered: {new Date(ms.triggered_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isTriggered ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
                            <CheckCircle className="w-3 h-3" />
                            Triggered
                          </span>
                        ) : (
                          <button
                            onClick={() => handleTriggerMilestone(ms.id)}
                            disabled={triggeringId === ms.id}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50 flex items-center gap-1
                              bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:shadow-md"
                          >
                            {triggeringId === ms.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            Trigger Now
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </RevealSection>

        {/* Customer Feedback */}
        {(summary.customer_overall_rating != null || summary.customer_cleanliness_rating != null || summary.customer_communication_rating != null || summary.customer_feedback_comments) && (
          <RevealSection index={4}>
          <div className={SECTION_CARD}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
              Customer Feedback
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {summary.customer_overall_rating != null && (
                <div className="rounded-xl p-4 text-center bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
                  <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase mb-2">Overall</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tabular-nums">{summary.customer_overall_rating}/10</p>
                  <StarDisplay rating={summary.customer_overall_rating} max={10} />
                </div>
              )}
              {summary.customer_cleanliness_rating != null && (
                <div className="rounded-xl p-4 text-center bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
                  <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase mb-2">Cleanliness</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tabular-nums">{summary.customer_cleanliness_rating}/10</p>
                  <StarDisplay rating={summary.customer_cleanliness_rating} max={10} />
                </div>
              )}
              {summary.customer_communication_rating != null && (
                <div className="rounded-xl p-4 text-center bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
                  <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase mb-2">Communication</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tabular-nums">{summary.customer_communication_rating}/10</p>
                  <StarDisplay rating={summary.customer_communication_rating} max={10} />
                </div>
              )}
            </div>
            {summary.customer_feedback_comments && (
              <div className="rounded-xl p-4 bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
                <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase mb-1">Customer Comments</p>
                <p className="text-sm text-slate-700 dark:text-white/80">{summary.customer_feedback_comments}</p>
              </div>
            )}
            <div className="mt-3 text-xs text-slate-500 dark:text-white/60 flex items-center gap-1">
              {signatureCaptured ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  Signed by: {summary.completion_signer_name}
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  Contact not on site &mdash; no signature captured
                </>
              )}
            </div>
          </div>
          </RevealSection>
        )}

        {/* Documents & Photos */}
        <RevealSection index={5}>
        <div className={SECTION_CARD}>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-violet-600 dark:text-violet-300" />
            Documents &amp; Photos
          </h2>

          {/* Signature status */}
          <div className="mb-4">
            {signatureCaptured ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
                <CheckCircle className="w-3.5 h-3.5" />
                Signed on-site by {summary.completion_signer_name}
                {summary.completion_signed_at && (
                  <span className="ml-1 opacity-70">
                    &mdash; {new Date(summary.completion_signed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            ) : remoteSignedReq ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
                <CheckCircle className="w-3.5 h-3.5" />
                Signed remotely by {remoteSignedReq.contact_name || 'customer'}
                {remoteSignedReq.signed_at && (
                  <span className="ml-1 opacity-70">
                    &mdash; {new Date(remoteSignedReq.signed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            ) : pendingReq ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Signature requested &mdash; awaiting {pendingReq.contact_email}
                  {pendingReq.sent_at && (
                    <span className="ml-1 opacity-70">
                      (sent {new Date(pendingReq.sent_at).toLocaleDateString()})
                    </span>
                  )}
                </div>
                <button
                  onClick={() => openSigModal(pendingReq.contact_email || '', pendingReq.contact_name || '')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                    bg-white border border-amber-300 text-amber-700 hover:bg-amber-50
                    dark:bg-white/5 dark:border-amber-400/30 dark:text-amber-300 dark:hover:bg-amber-500/15"
                >
                  <RefreshCw className="w-3 h-3" />
                  Resend
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white/70 dark:ring-white/10">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Customer Signature: Not Yet Signed
                </div>
                <button
                  onClick={() => openSigModal()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                    bg-white border border-violet-300 text-violet-700 hover:bg-violet-50
                    dark:bg-white/5 dark:border-violet-400/30 dark:text-violet-300 dark:hover:bg-violet-500/15"
                >
                  <Send className="w-3 h-3" />
                  Send for Signature
                </button>
              </div>
            )}
          </div>

          {/* Core documents */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {summary.completion_pdf_url && (
              <DocCard
                title="Completion Sign-Off PDF"
                subtitle={summary.completion_signer_name
                  ? `Signed by: ${summary.completion_signer_name}`
                  : 'Customer sign-off document'}
                date={summary.completion_signed_at}
                color="emerald"
                onView={() => openPdfViewer(summary.completion_pdf_url!, 'Job Completion Sign-Off')}
                downloadUrl={summary.completion_pdf_url}
              />
            )}
            {summary.liability_release_pdf_url && (
              <DocCard
                title="Liability Release"
                subtitle={summary.liability_release_signed_by ? `Signed by: ${summary.liability_release_signed_by}` : undefined}
                date={summary.liability_release_signed_at}
                color="rose"
                onView={() => openPdfViewer(summary.liability_release_pdf_url!, 'Liability Release')}
                downloadUrl={summary.liability_release_pdf_url}
              />
            )}
            {summary.work_order_pdf_url && (
              <DocCard
                title="Work Order Agreement"
                subtitle={summary.completion_signer_name ? `Signed by: ${summary.completion_signer_name}` : undefined}
                date={summary.completion_signed_at}
                color="sky"
                onView={() => openPdfViewer(summary.work_order_pdf_url!, 'Work Order Agreement')}
                downloadUrl={summary.work_order_pdf_url}
              />
            )}
            {summary.silica_plan_pdf_url && (
              <DocCard
                title="Silica Exposure Plan"
                subtitle="OSHA compliance document"
                color="violet"
                onView={() => openPdfViewer(summary.silica_plan_pdf_url!, 'Silica Exposure Control Plan')}
                downloadUrl={summary.silica_plan_pdf_url}
              />
            )}
            {documents.map((doc) => (
              <DocCard
                key={doc.id}
                title={doc.document_name || 'Document'}
                date={doc.generated_at}
                color="violet"
                onView={() => openPdfViewer(doc.file_url, doc.document_name)}
                downloadUrl={doc.file_url}
              />
            ))}
          </div>

          {/* Photos */}
          {photos.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-white/80 mb-3 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4" />
                Job Photos ({photos.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map((ph) => (
                  <a
                    key={ph.id}
                    href={ph.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square rounded-xl overflow-hidden ring-1 ring-slate-200 bg-slate-100 hover:ring-violet-400 transition-colors
                      dark:ring-white/10 dark:bg-white/5 dark:hover:ring-violet-400/60"
                  >
                    <img
                      src={ph.url}
                      alt={ph.caption || 'Job photo'}
                      className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                    />
                    {ph.caption && (
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs p-1 truncate">
                        {ph.caption}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {!summary.completion_pdf_url &&
            !summary.liability_release_pdf_url &&
            !summary.work_order_pdf_url &&
            !summary.silica_plan_pdf_url &&
            documents.length === 0 &&
            photos.length === 0 && (
              <div className="text-center py-8 text-slate-400 dark:text-white/40">
                <FileText className="w-10 h-10 mx-auto mb-2 text-slate-200 dark:text-white/20" />
                <p className="text-sm">No documents or photos available for this job.</p>
              </div>
            )}
        </div>
        </RevealSection>
      </div>

      {/* PDF Viewer Modal */}
      {pdfViewerOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#120a24] rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col ring-1 ring-slate-200 dark:ring-white/10">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10">
              <h3 className="font-semibold text-slate-900 dark:text-white">{currentPdfTitle}</h3>
              <div className="flex items-center gap-2">
                <a
                  href={currentPdfUrl}
                  download
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-all flex items-center gap-1.5
                    bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:shadow-md"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
                <button
                  onClick={() => setPdfViewerOpen(false)}
                  className="p-2 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <X className="w-5 h-5 text-slate-500 dark:text-white/60" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe src={currentPdfUrl} className="w-full h-full" title={currentPdfTitle} />
            </div>
          </div>
        </div>
      )}

      {/* Send for Signature Modal */}
      {showSigModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#120a24] rounded-2xl shadow-2xl w-full max-w-md ring-1 ring-slate-200 dark:ring-white/10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2">
                <PenTool className="w-5 h-5 text-violet-600 dark:text-violet-300" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Send Signature Request</h3>
              </div>
              <button
                onClick={() => setShowSigModal(false)}
                className="p-2 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5 text-slate-500 dark:text-white/60" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-500 dark:text-white/60">
                The customer receives an email with a secure link to sign from any phone or
                device. Link expires in 7 days.
              </p>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-white/80 mb-1">
                  Customer Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={sigEmail}
                  onChange={(e) => setSigEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full px-4 py-3 rounded-xl text-slate-900 transition-colors
                    bg-white border border-slate-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                    dark:bg-white/5 dark:border-white/10 dark:text-white dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-white/80 mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={sigName}
                  onChange={(e) => setSigName(e.target.value)}
                  placeholder={summary?.customer_name || 'Customer name'}
                  className="w-full px-4 py-3 rounded-xl text-slate-900 transition-colors
                    bg-white border border-slate-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                    dark:bg-white/5 dark:border-white/10 dark:text-white dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-white/80 mb-1">
                  Phone (optional)
                </label>
                <input
                  type="tel"
                  value={sigPhone}
                  onChange={(e) => setSigPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="w-full px-4 py-3 rounded-xl text-slate-900 transition-colors
                    bg-white border border-slate-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                    dark:bg-white/5 dark:border-white/10 dark:text-white dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSendSignatureRequest}
                  disabled={!sigEmail.trim() || sendingSig}
                  className="flex-1 rounded-xl py-3 font-semibold text-sm text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2
                    bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 hover:shadow-md shadow-violet-500/20"
                >
                  {sendingSig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sendingSig ? 'Sending...' : 'Send Signature Request'}
                </button>
                <button
                  onClick={() => setShowSigModal(false)}
                  disabled={sendingSig}
                  className="px-4 py-3 rounded-xl font-medium transition-colors disabled:opacity-50
                    bg-white border border-slate-300 text-slate-700 hover:bg-slate-50
                    dark:bg-white/5 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocCard({
  title,
  subtitle,
  date,
  color,
  onView,
  downloadUrl,
}: {
  title: string;
  subtitle?: string;
  date?: string | null;
  color: 'rose' | 'emerald' | 'sky' | 'violet';
  onView: () => void;
  downloadUrl: string;
}) {
  const colorMap = {
    rose: {
      card: 'bg-rose-50 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-400/30',
      icon: 'text-rose-600 dark:text-rose-300',
      title: 'text-rose-900 dark:text-rose-200',
      meta: 'text-rose-700 dark:text-rose-300/80',
      btn: 'bg-rose-600 hover:bg-rose-700',
      outline: 'text-rose-600 border-rose-300 dark:text-rose-300 dark:border-rose-400/30',
    },
    emerald: {
      card: 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-400/30',
      icon: 'text-emerald-600 dark:text-emerald-300',
      title: 'text-emerald-900 dark:text-emerald-200',
      meta: 'text-emerald-700 dark:text-emerald-300/80',
      btn: 'bg-emerald-600 hover:bg-emerald-700',
      outline: 'text-emerald-600 border-emerald-300 dark:text-emerald-300 dark:border-emerald-400/30',
    },
    sky: {
      card: 'bg-sky-50 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-400/30',
      icon: 'text-sky-600 dark:text-sky-300',
      title: 'text-sky-900 dark:text-sky-200',
      meta: 'text-sky-700 dark:text-sky-300/80',
      btn: 'bg-sky-600 hover:bg-sky-700',
      outline: 'text-sky-600 border-sky-300 dark:text-sky-300 dark:border-sky-400/30',
    },
    violet: {
      card: 'bg-violet-50 ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/30',
      icon: 'text-violet-600 dark:text-violet-300',
      title: 'text-violet-900 dark:text-violet-200',
      meta: 'text-violet-700 dark:text-violet-300/80',
      btn: 'bg-violet-600 hover:bg-violet-700',
      outline: 'text-violet-600 border-violet-300 dark:text-violet-300 dark:border-violet-400/30',
    },
  };
  const c = colorMap[color];
  return (
    <div className={`rounded-xl p-4 ring-1 ${c.card}`}>
      <div className="flex items-center gap-2 mb-2">
        <FileText className={`w-4 h-4 ${c.icon}`} />
        <h3 className={`font-semibold text-sm ${c.title}`}>{title}</h3>
      </div>
      {subtitle && <p className={`text-xs ${c.meta} mb-1`}>{subtitle}</p>}
      {date && <p className={`text-xs ${c.meta} mb-3`}>{new Date(date).toLocaleDateString()}</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={onView}
          className={`flex-1 px-2 py-1.5 ${c.btn} text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors`}
        >
          <Eye className="w-3.5 h-3.5" />
          View
        </button>
        <a
          href={downloadUrl}
          download
          className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center justify-center
            bg-white hover:bg-slate-50 dark:bg-white/5 dark:hover:bg-white/10 ${c.outline}`}
        >
          <Download className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
