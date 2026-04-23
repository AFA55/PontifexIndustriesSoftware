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
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    fixed: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Fixed Price' },
    cycle: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Cycle Billing' },
    time_material: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'T&M' },
    time_and_material: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'T&M' },
    tm: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'T&M' },
  };
  const c = cfg[type.toLowerCase()] || { bg: 'bg-gray-100', text: 'text-gray-700', label: type };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>{c.label}</span>;
}
function StarDisplay({ rating, max = 5 }: { rating: number | null; max?: number }) {
  if (rating === null || rating === undefined) return <span className="text-gray-400 text-sm">No rating</span>;
  const normalized = max === 10 ? rating / 2 : rating;
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3, 4].map(i => <Star key={i} className={`w-4 h-4 ${i < Math.floor(normalized) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />)}
      <span className="ml-1 text-sm font-medium text-gray-600">{rating}/{max}</span>
    </div>
  );
}
function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-500';
  return <div className="h-2 rounded-full bg-gray-200 overflow-hidden"><div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>;
}
function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="space-y-3"><div className="h-4 bg-gray-100 rounded" /><div className="h-4 bg-gray-100 rounded w-3/4" /><div className="h-4 bg-gray-100 rounded w-1/2" /></div>
    </div>
  );
}

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Job Not Found</h2>
          <Link href="/dashboard/admin/completed-job-tickets" className="text-blue-600 hover:underline text-sm">Back to Completed Jobs</Link>
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard/admin/completed-job-tickets" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{summary.job_number}</span>
                <ChevronRight className="w-3 h-3 text-gray-300" />
                <h1 className="text-lg font-bold text-gray-900 truncate">{jobName}</h1>
              </div>
              <p className="text-sm text-gray-500">{customerName}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                <CheckCircle className="w-4 h-4" />Completed
              </span>
              <button onClick={handleNotifySalesperson} disabled={notifying} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {notifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}Notify Salesperson
              </button>
              <button onClick={() => openSigModal()} className="inline-flex items-center gap-1.5 px-3 py-2 border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium transition-colors">
                <Send className="w-4 h-4" />Send for Signature
              </button>
              <Link href={`/dashboard/admin/billing/create?job=${jobId}`} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors">
                <Receipt className="w-4 h-4" />Create Invoice
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Action messages */}
      {actionMsg && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
          <div className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${actionMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {actionMsg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            <span className="flex-1">{actionMsg.text}</span>
            <button onClick={() => setActionMsg(null)}><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Job Overview */}
        <RevealSection index={0}>
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600" />Job Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Customer</p>
              <p className="text-gray-900 font-medium">{customerName}</p>
              {summary.customer_contact && <p className="text-sm text-gray-500">{summary.customer_contact}</p>}
              {summary.customer_email && <p className="text-sm text-gray-400">{summary.customer_email}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Location</p>
              <p className="text-gray-900 font-medium flex items-start gap-1"><MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />{location}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Dates</p>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">{scheduledDate}</span><span className="text-gray-400">→</span><span className="text-gray-900 font-medium">{completedDate}</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Billing Type</p>
              <div>{billingTypeBadge(summary.billing_type) ?? <span className="text-gray-400 text-sm">Not set</span>}</div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Estimated Cost</p>
              <p className="text-gray-900 font-medium">{summary.estimated_cost ? `$${Number(summary.estimated_cost).toLocaleString()}` : '--'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Actual Cost</p>
              <p className={`font-semibold ${summary.actual_cost && summary.estimated_cost && summary.actual_cost > summary.estimated_cost ? 'text-red-600' : 'text-emerald-600'}`}>
                {summary.actual_cost ? `$${Number(summary.actual_cost).toLocaleString()}` : laborCost > 0 ? `$${laborCost.toFixed(0)} (labor est.)` : '--'}
              </p>
            </div>
            {summary.po_number && <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">PO Number</p><p className="text-gray-900 font-medium">{summary.po_number}</p></div>}
            {summary.salesman_name && <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Salesperson</p><p className="text-gray-900 font-medium flex items-center gap-1"><User className="w-4 h-4 text-gray-400" />{summary.salesman_name}</p></div>}
            {(summary.foreman_name || summary.foreman_phone) && <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Site Contact</p><p className="text-gray-900 font-medium">{summary.foreman_name}</p>{summary.foreman_phone && <p className="text-sm text-gray-500">{summary.foreman_phone}</p>}</div>}
          </div>
        </div>
        </RevealSection>

        {/* Scope Completed */}
        {scopeMetrics.length > 0 && (
          <RevealSection index={1}>
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-emerald-600" />Scope Completed</h2>
            <div className={`grid grid-cols-1 gap-4 ${scopeMetrics.length === 1 ? 'sm:grid-cols-1' : scopeMetrics.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
              {scopeMetrics.map((m) => (
                <div key={m.label} className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{m.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mb-1">{m.actual.toLocaleString()}</p>
                  {m.expected > 0 && (<><p className="text-xs text-gray-400 mb-3">of {m.expected.toLocaleString()} expected</p><ProgressBar pct={m.pct} /><p className={`text-xs font-semibold mt-1 ${m.pct >= 100 ? 'text-green-600' : m.pct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{m.pct.toFixed(0)}% complete</p></>)}
                </div>
              ))}
            </div>
          </div>
          </RevealSection>
        )}

        {/* Labor Hours */}
        <RevealSection index={2}>
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Clock className="w-5 h-5 text-blue-600" />Labor Hours</h2>
          {laborRows.length === 0 ? (
            <div className="text-center py-8 text-gray-400"><Clock className="w-10 h-10 mx-auto mb-2 text-gray-200" /><p className="text-sm">No timecard records found for this job.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Operator', 'Date', 'Regular Hrs', 'OT Hrs', 'NS Premium Hrs', 'Total'].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {laborRows.map((row, i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="px-4 py-2.5 text-gray-900 font-medium">{row.operator_name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{row.date}</td>
                      <td className="px-4 py-2.5 text-gray-700">{row.regular_hrs.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-amber-700">{row.ot_hrs > 0 ? row.ot_hrs.toFixed(1) : '--'}</td>
                      <td className="px-4 py-2.5 text-purple-700">{row.ns_hrs > 0 ? row.ns_hrs.toFixed(1) : '--'}</td>
                      <td className="px-4 py-2.5 text-gray-900 font-semibold">{row.total.toFixed(1)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 border-t-2 border-gray-200 font-semibold">
                    <td className="px-4 py-2.5 text-gray-900" colSpan={2}>Totals</td>
                    <td className="px-4 py-2.5 text-gray-900">{totalRegular.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-amber-700">{totalOT > 0 ? totalOT.toFixed(1) : '--'}</td>
                    <td className="px-4 py-2.5 text-purple-700">{totalNS > 0 ? totalNS.toFixed(1) : '--'}</td>
                    <td className="px-4 py-2.5 text-gray-900">{totalHrs.toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {laborCost > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap gap-4">
              <div className="bg-blue-50 rounded-lg px-4 py-2 text-sm"><span className="text-gray-600">Regular: </span><span className="font-semibold text-blue-700">${(totalRegular * RATE_REGULAR).toFixed(0)}</span><span className="text-gray-400 ml-1">@ ${RATE_REGULAR}/hr</span></div>
              {totalOT > 0 && <div className="bg-amber-50 rounded-lg px-4 py-2 text-sm"><span className="text-gray-600">OT: </span><span className="font-semibold text-amber-700">${(totalOT * RATE_OT).toFixed(0)}</span><span className="text-gray-400 ml-1">@ ${RATE_OT}/hr</span></div>}
              {totalNS > 0 && <div className="bg-purple-50 rounded-lg px-4 py-2 text-sm"><span className="text-gray-600">Night Shift: </span><span className="font-semibold text-purple-700">${(totalNS * RATE_NS).toFixed(0)}</span><span className="text-gray-400 ml-1">@ ${RATE_NS}/hr</span></div>}
              <div className="bg-emerald-50 rounded-lg px-4 py-2 text-sm font-bold"><span className="text-gray-600">Total Labor Cost: </span><span className="text-emerald-700">${laborCost.toFixed(0)}</span></div>
            </div>
          )}
        </div>
        </RevealSection>

        {/* Cycle Billing */}
        <RevealSection index={3}>
        {!isCycleBilling && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
            <strong>Cycle billing not enabled.</strong> To use milestone-based billing for this job,{' '}
            go to the <a href={`/dashboard/admin/jobs/${summary.id}`} className="underline">Job Detail page</a> and set Billing Type to &ldquo;Cycle Billing&rdquo;.
          </div>
        )}
        {isCycleBilling && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Target className="w-5 h-5 text-purple-600" />Cycle Billing Milestones</h2>
              <button onClick={() => setShowMilestoneForm(prev => !prev)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"><Plus className="w-4 h-4" />Add Milestone</button>
            </div>
            {showMilestoneForm && (
              <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-40"><label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Label</label><input type="text" value={milestoneLabel} onChange={e => setMilestoneLabel(e.target.value)} placeholder="e.g. Foundation Complete" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-200 bg-white" /></div>
                <div className="w-32"><label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">% Target</label><input type="number" value={milestonePercent} onChange={e => setMilestonePercent(e.target.value)} placeholder="25" min={1} max={100} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-200 bg-white" /></div>
                <div className="flex gap-2">
                  <button onClick={handleAddMilestone} disabled={savingMilestone || !milestoneLabel.trim() || !milestonePercent} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5">{savingMilestone ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Save</button>
                  <button onClick={() => setShowMilestoneForm(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
                </div>
              </div>
            )}
            {milestones.length === 0 ? (
              <div className="text-center py-8 text-gray-400"><Target className="w-10 h-10 mx-auto mb-2 text-gray-200" /><p className="text-sm">No milestones set.</p></div>
            ) : (
              <div className="space-y-3">
                {milestones.map((ms) => {
                  const isTriggered = !!ms.triggered_at;
                  return (
                    <div key={ms.id} className={`flex items-center justify-between p-4 rounded-lg border ${isTriggered ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isTriggered ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>{ms.milestone_percent}%</div>
                        <div><p className="font-medium text-gray-900">{ms.label}</p>{ms.triggered_at && <p className="text-xs text-gray-500">Triggered: {new Date(ms.triggered_at).toLocaleDateString()}</p>}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isTriggered ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><CheckCircle className="w-3 h-3" />Triggered</span>
                        ) : (
                          <button onClick={() => handleTriggerMilestone(ms.id)} disabled={triggeringId === ms.id} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1">{triggeringId === ms.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}Trigger Now</button>
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
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />Customer Feedback</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {summary.customer_overall_rating != null && <div className="bg-gray-50 rounded-lg p-4 text-center"><p className="text-xs font-semibold text-gray-500 uppercase mb-2">Overall</p><p className="text-3xl font-bold text-gray-900 mb-2">{summary.customer_overall_rating}/10</p><StarDisplay rating={summary.customer_overall_rating} max={10} /></div>}
              {summary.customer_cleanliness_rating != null && <div className="bg-gray-50 rounded-lg p-4 text-center"><p className="text-xs font-semibold text-gray-500 uppercase mb-2">Cleanliness</p><p className="text-3xl font-bold text-gray-900 mb-2">{summary.customer_cleanliness_rating}/10</p><StarDisplay rating={summary.customer_cleanliness_rating} max={10} /></div>}
              {summary.customer_communication_rating != null && <div className="bg-gray-50 rounded-lg p-4 text-center"><p className="text-xs font-semibold text-gray-500 uppercase mb-2">Communication</p><p className="text-3xl font-bold text-gray-900 mb-2">{summary.customer_communication_rating}/10</p><StarDisplay rating={summary.customer_communication_rating} max={10} /></div>}
            </div>
            {summary.customer_feedback_comments && <div className="bg-gray-50 rounded-lg p-4 border border-gray-200"><p className="text-xs font-semibold text-gray-500 uppercase mb-1">Customer Comments</p><p className="text-sm text-gray-700">{summary.customer_feedback_comments}</p></div>}
            <div className="mt-3 text-xs text-gray-500 flex items-center gap-1">
              {signatureCaptured ? (<><CheckCircle className="w-3.5 h-3.5 text-green-500" />Signed by: {summary.completion_signer_name}</>) : (<><AlertCircle className="w-3.5 h-3.5 text-amber-500" />Contact not on site &mdash; no signature captured</>)}
            </div>
          </div>
          </RevealSection>
        )}

        {/* Documents & Photos */}
        <RevealSection index={5}>
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600" />Documents &amp; Photos</h2>

          {/* Signature status */}
          <div className="mb-4">
            {signatureCaptured ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                <CheckCircle className="w-3.5 h-3.5" />Signed on-site by {summary.completion_signer_name}
                {summary.completion_signed_at && <span className="ml-1 opacity-70">&mdash; {new Date(summary.completion_signed_at).toLocaleDateString()}</span>}
              </div>
            ) : remoteSignedReq ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                <CheckCircle className="w-3.5 h-3.5" />Signed remotely by {remoteSignedReq.contact_name || 'customer'}
                {remoteSignedReq.signed_at && <span className="ml-1 opacity-70">&mdash; {new Date(remoteSignedReq.signed_at).toLocaleDateString()}</span>}
              </div>
            ) : pendingReq ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                  <AlertCircle className="w-3.5 h-3.5" />Signature requested &mdash; awaiting {pendingReq.contact_email}
                  {pendingReq.sent_at && <span className="ml-1 opacity-70">(sent {new Date(pendingReq.sent_at).toLocaleDateString()})</span>}
                </div>
                <button onClick={() => openSigModal(pendingReq.contact_email || '', pendingReq.contact_name || '')} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors">
                  <RefreshCw className="w-3 h-3" />Resend
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                  <AlertCircle className="w-3.5 h-3.5" />Customer Signature: Not Yet Signed
                </div>
                <button onClick={() => openSigModal()} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors">
                  <Send className="w-3 h-3" />Send for Signature
                </button>
              </div>
            )}
          </div>

          {/* Core documents */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {summary.liability_release_pdf_url && <DocCard title="Liability Release" subtitle={summary.liability_release_signed_by ? `Signed by: ${summary.liability_release_signed_by}` : undefined} date={summary.liability_release_signed_at} color="red" onView={() => openPdfViewer(summary.liability_release_pdf_url!, 'Liability Release')} downloadUrl={summary.liability_release_pdf_url} />}
            {summary.work_order_pdf_url && <DocCard title="Work Order Agreement" subtitle={summary.completion_signer_name ? `Signed by: ${summary.completion_signer_name}` : undefined} date={summary.completion_signed_at} color="green" onView={() => openPdfViewer(summary.work_order_pdf_url!, 'Work Order Agreement')} downloadUrl={summary.work_order_pdf_url} />}
            {summary.silica_plan_pdf_url && <DocCard title="Silica Exposure Plan" subtitle="OSHA compliance document" color="blue" onView={() => openPdfViewer(summary.silica_plan_pdf_url!, 'Silica Exposure Control Plan')} downloadUrl={summary.silica_plan_pdf_url} />}
            {documents.map((doc) => <DocCard key={doc.id} title={doc.document_name || 'Document'} date={doc.generated_at} color="purple" onView={() => openPdfViewer(doc.file_url, doc.document_name)} downloadUrl={doc.file_url} />)}
          </div>

          {/* Photos */}
          {photos.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><ImageIcon className="w-4 h-4" />Job Photos ({photos.length})</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map((ph) => (
                  <a key={ph.id} href={ph.url} target="_blank" rel="noopener noreferrer" className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100 hover:border-blue-400 transition-colors">
                    <img src={ph.url} alt={ph.caption || 'Job photo'} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
                    {ph.caption && <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs p-1 truncate">{ph.caption}</div>}
                  </a>
                ))}
              </div>
            </div>
          )}

          {!summary.liability_release_pdf_url && !summary.work_order_pdf_url && !summary.silica_plan_pdf_url && documents.length === 0 && photos.length === 0 && (
            <div className="text-center py-8 text-gray-400"><FileText className="w-10 h-10 mx-auto mb-2 text-gray-200" /><p className="text-sm">No documents or photos available for this job.</p></div>
          )}
        </div>
        </RevealSection>
      </div>

      {/* PDF Viewer Modal */}
      {pdfViewerOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{currentPdfTitle}</h3>
              <div className="flex items-center gap-2">
                <a href={currentPdfUrl} download className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"><Download className="w-4 h-4" />Download</a>
                <button onClick={() => setPdfViewerOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden"><iframe src={currentPdfUrl} className="w-full h-full" title={currentPdfTitle} /></div>
          </div>
        </div>
      )}

      {/* Send for Signature Modal */}
      {showSigModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2"><PenTool className="w-5 h-5 text-indigo-600" /><h3 className="text-lg font-bold text-gray-900">Send Signature Request</h3></div>
              <button onClick={() => setShowSigModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">The customer receives an email with a secure link to sign from any phone or device. Link expires in 7 days.</p>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Customer Email <span className="text-red-500">*</span></label>
                <input type="email" value={sigEmail} onChange={e => setSigEmail(e.target.value)} placeholder="customer@example.com" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Customer Name</label>
                <input type="text" value={sigName} onChange={e => setSigName(e.target.value)} placeholder={summary?.customer_name || 'Customer name'} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone (optional)</label>
                <input type="tel" value={sigPhone} onChange={e => setSigPhone(e.target.value)} placeholder="(555) 000-0000" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSendSignatureRequest} disabled={!sigEmail.trim() || sendingSig} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {sendingSig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sendingSig ? 'Sending...' : 'Send Signature Request'}
                </button>
                <button onClick={() => setShowSigModal(false)} disabled={sendingSig} className="px-4 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocCard({ title, subtitle, date, color, onView, downloadUrl }: { title: string; subtitle?: string; date?: string | null; color: 'red' | 'green' | 'blue' | 'purple' | 'indigo'; onView: () => void; downloadUrl: string; }) {
  const colorMap = {
    red: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600', title: 'text-red-900', meta: 'text-red-700', btn: 'bg-red-600 hover:bg-red-700', outline: 'text-red-600 border-red-600' },
    green: { bg: 'bg-green-50', border: 'border-green-200', icon: 'text-green-600', title: 'text-green-900', meta: 'text-green-700', btn: 'bg-green-600 hover:bg-green-700', outline: 'text-green-600 border-green-600' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', title: 'text-blue-900', meta: 'text-blue-700', btn: 'bg-blue-600 hover:bg-blue-700', outline: 'text-blue-600 border-blue-600' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-600', title: 'text-purple-900', meta: 'text-purple-700', btn: 'bg-purple-600 hover:bg-purple-700', outline: 'text-purple-600 border-purple-600' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', icon: 'text-indigo-600', title: 'text-indigo-900', meta: 'text-indigo-700', btn: 'bg-indigo-600 hover:bg-indigo-700', outline: 'text-indigo-600 border-indigo-600' },
  };
  const c = colorMap[color];
  return (
    <div className={`${c.bg} rounded-lg p-4 border ${c.border}`}>
      <div className="flex items-center gap-2 mb-2"><FileText className={`w-4 h-4 ${c.icon}`} /><h3 className={`font-semibold text-sm ${c.title}`}>{title}</h3></div>
      {subtitle && <p className={`text-xs ${c.meta} mb-1`}>{subtitle}</p>}
      {date && <p className={`text-xs ${c.meta} mb-3`}>{new Date(date).toLocaleDateString()}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={onView} className={`flex-1 px-2 py-1.5 ${c.btn} text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors`}><Eye className="w-3.5 h-3.5" />View</button>
        <a href={downloadUrl} download className={`px-2 py-1.5 bg-white hover:bg-gray-50 ${c.outline} border rounded-lg text-xs font-semibold transition-colors flex items-center justify-center`}><Download className="w-3.5 h-3.5" /></a>
      </div>
    </div>
  );
}
