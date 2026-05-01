'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import CreateInvoiceForm from './_components/CreateInvoiceForm';
import BillingSkeleton from './_skeleton';
import { RevealSection } from '@/components/ui/Skeleton';
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  DollarSign,
  FileText,
  Send,
  CheckCircle2,
  AlertCircle,
  Plus,
  ChevronRight,
  Search,
  Download,
  Eye,
  Receipt,
  X,
  Printer,
  Ban,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string | null;
  billing_address: string | null;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  balance_due: number;
  status: string;
  po_number: string | null;
  payment_terms: number | null;
  notes: string | null;
  internal_notes: string | null;
  sent_at: string | null;
  paid_date: string | null;
  created_at: string;
  created_by: string | null;
}

interface InvoiceDetail extends Invoice {
  line_items: any[];
  payments: any[];
}

interface CompletedJob {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  estimated_cost: number | null;
  work_completed_at: string;
  status: string;
  billing_type: string | null;
  has_invoice: boolean;
  created_by: string | null;
}

interface PreviewLineItem {
  line_number: number;
  description: string;
  billing_type?: string;
  quantity: number;
  unit: string;
  unit_rate: number;
  taxable?: boolean;
}

interface PreviewData {
  job: {
    id: string;
    job_number: string;
    customer_name: string;
    address: string | null;
    location: string | null;
    billing_type: string | null;
    scope_of_work: string | null;
    description: string | null;
    title: string | null;
    job_type: string | null;
    po_number: string | null;
    estimated_cost: number | null;
  };
  operator_name: string;
  work_performed_summary: string;
  line_items: PreviewLineItem[];
  subtotal: number;
  default_due_date: string;
  default_po_number: string | null;
  default_notes: string;
}

// Status pill hues. Light: `bg-{hue}-100 text-{hue}-700 ring-{hue}-200`.
// Dark: translucent versions on the dark purple backdrop.
const STATUS_COLORS: Record<string, string> = {
  draft:
    'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white/80 dark:ring-white/10',
  sent:
    'bg-blue-100 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30',
  paid:
    'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30',
  overdue:
    'bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30',
  void:
    'bg-zinc-100 text-zinc-500 line-through ring-1 ring-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-400 dark:ring-zinc-400/30',
};

// Top-accent bar hue per status.
const STATUS_ACCENT: Record<string, string> = {
  draft: 'from-slate-300 to-slate-400',
  sent: 'from-sky-400 to-blue-500',
  paid: 'from-emerald-400 to-teal-500',
  overdue: 'from-rose-400 to-red-500',
  void: 'from-zinc-300 to-zinc-400',
};

const STATUS_ICONS: Record<string, any> = {
  draft: FileText,
  sent: Send,
  paid: CheckCircle2,
  overdue: AlertCircle,
  void: Ban,
};

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
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
}

export default function BillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([]);
  const [stats, setStats] = useState<any>({});
  const [activeTab, setActiveTab] = useState<'invoices' | 'ready_to_bill'>('invoices');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [billingTypeFilter, setBillingTypeFilter] = useState<string>('all');
  const [creating, setCreating] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState<string | null>(null);

  // Cache: created_by uuid -> full_name (for "Submitted by" chips)
  const [profilesById, setProfilesById] = useState<Record<string, string>>({});

  // Review & Confirm modal state
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<PreviewData | null>(null);
  const [editLineItems, setEditLineItems] = useState<PreviewLineItem[]>([]);
  const [editingDescIdx, setEditingDescIdx] = useState<Set<number>>(new Set());
  const [submittingReview, setSubmittingReview] = useState(false);

  // Mark Paid modal state
  const [markPaidInvoice, setMarkPaidInvoice] = useState<Invoice | null>(null);
  const [markPaidAmount, setMarkPaidAmount] = useState<string>('');
  const [markPaidDate, setMarkPaidDate] = useState<string>('');
  const [markPaidSaving, setMarkPaidSaving] = useState(false);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);

  const openMarkPaidModal = (inv: Invoice) => {
    setMarkPaidInvoice(inv);
    setMarkPaidAmount(Number(inv.total_amount || 0).toFixed(2));
    setMarkPaidDate(new Date().toISOString().split('T')[0]);
    setMarkPaidError(null);
  };

  const closeMarkPaidModal = () => {
    setMarkPaidInvoice(null);
    setMarkPaidAmount('');
    setMarkPaidDate('');
    setMarkPaidError(null);
    setMarkPaidSaving(false);
  };

  const submitMarkPaid = async () => {
    if (!markPaidInvoice) return;
    const amt = parseFloat(markPaidAmount);
    if (isNaN(amt) || amt <= 0) {
      setMarkPaidError('Enter a valid amount.');
      return;
    }
    if (!markPaidDate) {
      setMarkPaidError('Select a payment date.');
      return;
    }
    setMarkPaidSaving(true);
    setMarkPaidError(null);
    try {
      const res = await apiFetch(`/api/admin/invoices/${markPaidInvoice.id}/mark-paid`, {
        method: 'PATCH',
        body: JSON.stringify({ paid_amount: amt, paid_at: markPaidDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMarkPaidError(data.error || 'Failed to mark invoice as paid.');
        return;
      }
      setSuccessMsg(`Invoice ${markPaidInvoice.invoice_number} marked as paid.`);
      closeMarkPaidModal();
      fetchData();
    } catch (err) {
      console.error('Error marking invoice paid:', err);
      setMarkPaidError('Failed to mark invoice as paid.');
    } finally {
      setMarkPaidSaving(false);
    }
  };

  useEffect(() => {
    const guard = async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) { router.push('/login'); return; }
      const allowedRoles = ['admin', 'super_admin', 'operations_manager', 'salesman'];
      const bypassRoles = ['super_admin', 'operations_manager'];
      if (!allowedRoles.includes(currentUser.role)) {
        const getTokenLocal = async (): Promise<string | null> => {
          const { supabase } = await import('@/lib/supabase');
          for (let i = 0; i < 10; i++) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) return session.access_token;
            await new Promise((r) => setTimeout(r, 150));
          }
          return null;
        };
        let canView = false;
        try {
          const token = await getTokenLocal();
          if (token) {
            const resp = await fetch(`/api/admin/user-flags/${currentUser.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (resp.ok) {
              const json = await resp.json();
              canView = Boolean(json?.data?.can_view_invoicing);
            }
          }
        } catch {
          canView = false;
        }
        if (!bypassRoles.includes(currentUser.role) && !canView) {
          router.push('/dashboard');
          return;
        }
      }
      fetchData();
    };
    guard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const invoiceRes = await apiFetch('/api/admin/invoices');
      let invoicesArr: Invoice[] = [];
      if (invoiceRes.ok) {
        const invoiceData = await invoiceRes.json();
        invoicesArr = invoiceData.data || [];
        setInvoices(invoicesArr);
        setStats(invoiceData.stats || {});
      } else {
        setError('Failed to load invoices.');
      }

      let completedQuery = supabase
        .from('job_orders')
        .select('id, job_number, title, customer_name, estimated_cost, work_completed_at, status, billing_type, created_by')
        .eq('status', 'completed')
        .is('deleted_at', null)
        .order('work_completed_at', { ascending: false })
        .limit(50);

      // RBAC: salesman only sees their own ready-to-bill jobs.
      const cu = getCurrentUser();
      if (cu?.role === 'salesman' && cu.id) {
        completedQuery = completedQuery.eq('created_by', cu.id);
      }

      const { data: completed } = await completedQuery;

      let completedArr: CompletedJob[] = [];
      if (completed) {
        const { data: existingLineItems } = await supabase
          .from('invoice_line_items')
          .select('job_order_id')
          .in('job_order_id', completed.map(j => j.id));

        const invoicedJobIds = new Set((existingLineItems || []).map(li => li.job_order_id));

        completedArr = completed.map(j => ({
          ...j,
          has_invoice: invoicedJobIds.has(j.id),
        })) as CompletedJob[];
        setCompletedJobs(completedArr);
      }

      // Bulk-resolve "Submitted by" full names for the chips.
      const ids = new Set<string>();
      for (const inv of invoicesArr) if (inv.created_by) ids.add(inv.created_by);
      for (const j of completedArr) if (j.created_by) ids.add(j.created_by);
      const missing = Array.from(ids).filter(id => !(id in profilesById));
      if (missing.length > 0) {
        try {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', missing);
          if (profs && profs.length > 0) {
            setProfilesById(prev => {
              const next = { ...prev };
              for (const p of profs as any[]) {
                if (p?.id) next[p.id] = p.full_name || '';
              }
              return next;
            });
          }
        } catch {
          // best-effort; chips will simply not render for unresolved ids
        }
      }
    } catch (err) {
      console.error('Error fetching billing data:', err);
      setError('Failed to load billing data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const createInvoice = async (jobOrderId: string) => {
    setCreating(jobOrderId);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/invoices', {
        method: 'POST',
        body: JSON.stringify({ jobOrderId }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessMsg(`Invoice ${data.data?.invoice_number || ''} created successfully.`);
        fetchData();
        setActiveTab('invoices');
      } else if (res.status === 409) {
        setError('An invoice already exists for this job.');
      } else {
        setError(data.error || 'Failed to create invoice.');
      }
    } catch (err) {
      console.error('Error creating invoice:', err);
      setError('Failed to create invoice. Please try again.');
    } finally {
      setCreating(null);
    }
  };

  const openReviewInvoice = async (jobOrderId: string) => {
    setReviewJobId(jobOrderId);
    setReviewLoading(true);
    setReviewError(null);
    setReviewData(null);
    setEditLineItems([]);
    setEditingDescIdx(new Set());
    try {
      const res = await apiFetch('/api/admin/invoices/preview', {
        method: 'POST',
        body: JSON.stringify({ jobOrderId }),
      });
      const data = await res.json();
      if (res.ok) {
        const pd = data.data as PreviewData;
        setReviewData(pd);
        setEditLineItems(pd.line_items.map(li => ({ ...li })));
      } else if (res.status === 409) {
        setReviewError('An invoice already exists for this job.');
      } else {
        setReviewError(data.error || 'Failed to load invoice preview.');
      }
    } catch (err) {
      console.error('Error loading invoice preview:', err);
      setReviewError('Failed to load invoice preview.');
    } finally {
      setReviewLoading(false);
    }
  };

  const closeReviewModal = () => {
    if (submittingReview) return;
    setReviewJobId(null);
    setReviewData(null);
    setReviewError(null);
    setEditLineItems([]);
    setEditingDescIdx(new Set());
  };

  const updateEditLineItem = (idx: number, patch: Partial<PreviewLineItem>) => {
    setEditLineItems(prev => prev.map((li, i) => (i === idx ? { ...li, ...patch } : li)));
  };

  const toggleEditDesc = (idx: number) => {
    setEditingDescIdx(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const useOperatorDescription = () => {
    if (!reviewData) return;
    if (editLineItems.length === 0) return;
    const summary = reviewData.work_performed_summary || '';
    if (!summary.trim()) return;
    setEditLineItems(prev => prev.map((li, i) => (i === 0 ? { ...li, description: summary } : li)));
    setEditingDescIdx(prev => {
      const next = new Set(prev);
      next.add(0);
      return next;
    });
  };

  const submitReviewedInvoice = async () => {
    if (!reviewJobId || !reviewData) return;
    setSubmittingReview(true);
    setReviewError(null);
    try {
      const payload = {
        jobOrderId: reviewJobId,
        line_items_override: editLineItems.map((li, i) => ({
          line_number: i + 1,
          description: li.description,
          quantity: Number(li.quantity),
          unit: li.unit,
          unit_rate: Number(li.unit_rate),
          billing_type: li.billing_type || 'flat_rate',
          taxable: li.taxable !== false,
        })),
      };
      const res = await apiFetch('/api/admin/invoices', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Invoice ${data.data?.invoice_number || ''} created successfully.`);
        setReviewJobId(null);
        setReviewData(null);
        setEditLineItems([]);
        setEditingDescIdx(new Set());
        setActiveTab('invoices');
        fetchData();
      } else if (res.status === 409) {
        setReviewError('An invoice already exists for this job.');
      } else {
        setReviewError(data.error || 'Failed to create invoice.');
      }
    } catch (err) {
      console.error('Error submitting reviewed invoice:', err);
      setReviewError('Failed to create invoice. Please try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Live subtotal for the editable line items (auto-recomputes on edit)
  const editSubtotal = editLineItems.reduce((sum, li) => {
    const q = Number(li.quantity);
    const r = Number(li.unit_rate);
    if (Number.isFinite(q) && Number.isFinite(r)) return sum + q * r;
    return sum;
  }, 0);

  const viewInvoice = async (invoiceId: string) => {
    try {
      const res = await apiFetch(`/api/admin/invoices/${invoiceId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedInvoice(data.data);
      } else {
        setError('Failed to load invoice details.');
      }
    } catch (err) {
      console.error('Error fetching invoice:', err);
      setError('Failed to load invoice details.');
    }
  };

  const updateInvoiceStatus = async (invoiceId: string, newStatus: string) => {
    setUpdatingStatus(invoiceId);
    setError(null);
    try {
      const payload: any = { status: newStatus };
      if (newStatus === 'paid') {
        payload.paid_date = new Date().toISOString().split('T')[0];
        payload.balance_due = 0;
      }

      const res = await apiFetch(`/api/admin/invoices/${invoiceId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const statusLabel = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
        setSuccessMsg(`Invoice marked as ${statusLabel}.`);
        fetchData();
        if (selectedInvoice?.id === invoiceId) {
          viewInvoice(invoiceId);
        }
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update invoice status.');
      }
    } catch (err) {
      console.error('Error updating invoice:', err);
      setError('Failed to update invoice status.');
    } finally {
      setUpdatingStatus(null);
      setConfirmVoid(null);
    }
  };

  const downloadPdf = async (invoiceId: string, invoiceNumber: string) => {
    setDownloadingPdf(invoiceId);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/invoices/${invoiceId}/pdf`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoiceNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setError('Failed to generate PDF. Please try again.');
      }
    } catch (err) {
      console.error('Error downloading PDF:', err);
      setError('Failed to generate PDF.');
    } finally {
      setDownloadingPdf(null);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return inv.invoice_number.toLowerCase().includes(q) ||
             inv.customer_name.toLowerCase().includes(q) ||
             (inv.po_number || '').toLowerCase().includes(q);
    }
    return true;
  });

  const uninvoicedJobs = completedJobs.filter(j => {
    if (j.has_invoice) return false;
    if (billingTypeFilter !== 'all') {
      const jt = (j.billing_type || 'fixed').toLowerCase().replace('time_and_material', 'tm').replace('time_material', 'tm');
      const ft = billingTypeFilter.toLowerCase();
      if (jt !== ft) return false;
    }
    return true;
  });

  // Paid-this-month total
  const paidThisMonth = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return invoices
      .filter(inv => inv.status === 'paid' && inv.paid_date)
      .filter(inv => {
        const d = new Date(inv.paid_date + 'T00:00');
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
  })();

  const billingTypeBadge = (type: string | null) => {
    const cfgs: Record<string, string> = {
      fixed: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30',
      cycle: 'bg-violet-100 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30',
      time_material: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30',
      tm: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30',
    };
    const labels: Record<string, string> = { fixed: 'Fixed', cycle: 'Cycle', time_material: 'T&M', tm: 'T&M' };
    const key = (type || 'fixed').toLowerCase();
    const cls = cfgs[key] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white/70 dark:ring-white/10';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
        {labels[key] || type || 'Fixed'}
      </span>
    );
  };

  const statusBadge = (status: string) => {
    const cls = STATUS_COLORS[status] || STATUS_COLORS.draft;
    const Icon = STATUS_ICONS[status] || FileText;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
        <Icon className="w-3 h-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatDate = (d: string | null) => {
    if (!d) return '--';
    try {
      return new Date(d + 'T00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    } catch { return d; }
  };

  if (loading && invoices.length === 0 && completedJobs.length === 0) {
    return <BillingSkeleton />;
  }

  const statTiles = [
    {
      label: 'Drafts',
      value: stats.draft || 0,
      icon: FileText,
      iconTile: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70',
    },
    {
      label: 'Sent',
      value: stats.sent || 0,
      icon: Send,
      iconTile: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
    },
    {
      label: 'Paid',
      value: stats.paid || 0,
      icon: CheckCircle2,
      iconTile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    },
    {
      label: 'Overdue',
      value: stats.overdue || 0,
      icon: AlertCircle,
      iconTile: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    },
  ];

  return (
    <div
      className="
        min-h-screen
        bg-gradient-to-b from-slate-50 to-white
        dark:from-[#0b0618] dark:to-[#0e0720]
      "
    >
      {/* Header */}
      <div
        className="
          sticky top-0 z-40 border-b shadow-sm backdrop-blur
          bg-white/90 border-slate-200
          dark:bg-[#0b0618]/80 dark:border-white/10
        "
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/admin"
                className="
                  p-2 rounded-lg transition-colors
                  hover:bg-slate-100 text-slate-600
                  dark:hover:bg-white/10 dark:text-white/70
                "
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Receipt size={18} className="text-emerald-600 dark:text-emerald-400" />
                  Billing & Invoicing
                </h1>
                <p className="text-sm text-slate-500 dark:text-white/60">Create and manage job invoices</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateForm(true)}
                className="
                  flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap
                  bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white
                  shadow-md shadow-violet-500/20 hover:shadow-lg hover:shadow-violet-500/30
                "
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Create Invoice</span>
                <span className="sm:hidden">New</span>
              </button>
              <button
                onClick={fetchData}
                disabled={loading}
                className="
                  p-2 rounded-lg transition-colors disabled:opacity-50
                  bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50
                  dark:bg-white/5 dark:border-white/10 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10
                "
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Notifications */}
        {error && (
          <div className="
            mb-4 p-3 rounded-xl flex items-center gap-3
            bg-rose-50 ring-1 ring-rose-200
            dark:bg-rose-500/10 dark:ring-rose-400/30
          ">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-300 flex-shrink-0" />
            <p className="text-sm text-rose-700 dark:text-rose-200 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="
            mb-4 p-3 rounded-xl flex items-center gap-3
            bg-emerald-50 ring-1 ring-emerald-200
            dark:bg-emerald-500/10 dark:ring-emerald-400/30
          ">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-300 flex-shrink-0" />
            <p className="text-sm text-emerald-700 dark:text-emerald-200 flex-1">{successMsg}</p>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Hero totals */}
        <RevealSection index={0}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="
            relative overflow-hidden rounded-2xl p-6 ring-1 shadow-sm
            bg-white/90 ring-slate-200
            dark:bg-white/[0.04] dark:ring-white/10
          ">
            <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" aria-hidden />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider">Outstanding</span>
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                <DollarSign className="w-4 h-4" />
              </span>
            </div>
            <div className="text-4xl font-bold tabular-nums bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-transparent">
              ${(stats.totalOutstanding || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-slate-500 dark:text-white/50 mt-2">Balance due across all open invoices</p>
          </div>
          <div className="
            relative overflow-hidden rounded-2xl p-6 ring-1 shadow-sm
            bg-white/90 ring-slate-200
            dark:bg-white/[0.04] dark:ring-white/10
          ">
            <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" aria-hidden />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider">Paid This Month</span>
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                <TrendingUp className="w-4 h-4" />
              </span>
            </div>
            <div className="text-4xl font-bold tabular-nums bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
              ${paidThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-slate-500 dark:text-white/50 mt-2">Revenue collected this calendar month</p>
          </div>
        </div>
        </RevealSection>

        {/* Stats Cards */}
        <RevealSection index={1}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {statTiles.map(tile => (
            <div
              key={tile.label}
              className="
                rounded-2xl p-4 ring-1 shadow-sm transition-all hover:shadow-md
                bg-white/90 ring-slate-200
                dark:bg-white/[0.04] dark:ring-white/10
              "
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider">
                  {tile.label}
                </span>
                <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${tile.iconTile}`}>
                  <tile.icon className="w-4 h-4" />
                </span>
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                {tile.value}
              </div>
            </div>
          ))}
        </div>
        </RevealSection>

        {/* Tabs */}
        <RevealSection index={2}>
        <div className="flex gap-1 mb-5 border-b border-slate-200 dark:border-white/10">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === 'invoices'
                ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-white/60 dark:hover:text-white dark:hover:border-white/20'
            }`}
          >
            All Invoices ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('ready_to_bill')}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              activeTab === 'ready_to_bill'
                ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-white/60 dark:hover:text-white dark:hover:border-white/20'
            }`}
          >
            Ready to Bill
            {uninvoicedJobs.length > 0 && (
              <span className="
                px-1.5 py-0.5 rounded-full text-[10px] font-bold
                bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200
                dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30
              ">
                {uninvoicedJobs.length}
              </span>
            )}
          </button>
        </div>
        </RevealSection>

        <RevealSection index={3}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin mb-3" />
            <p className="text-slate-500 dark:text-white/60 text-sm">Loading billing data...</p>
          </div>
        ) : activeTab === 'invoices' ? (
          <>
            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-400 dark:text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search invoices..."
                  className="
                    w-full pl-9 pr-4 py-2 rounded-lg text-sm transition-all
                    bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400
                    focus:border-violet-500 focus:ring-1 focus:ring-violet-200
                    dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/40
                    dark:focus:border-violet-400 dark:focus:ring-violet-500/30
                  "
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="
                  px-3 py-2 rounded-lg text-sm cursor-pointer transition-all
                  bg-white border border-slate-200 text-slate-900
                  focus:border-violet-500 focus:ring-1 focus:ring-violet-200
                  dark:bg-white/5 dark:border-white/10 dark:text-white
                  dark:focus:border-violet-400 dark:focus:ring-violet-500/30
                "
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="void">Void</option>
              </select>
            </div>

            {/* Invoice List */}
            {filteredInvoices.length === 0 ? (
              <div className="
                rounded-2xl p-12 text-center ring-1 shadow-sm
                bg-white/90 ring-slate-200
                dark:bg-white/[0.04] dark:ring-white/10
              ">
                <FileText className="w-12 h-12 text-slate-300 dark:text-white/20 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No invoices found</h3>
                <p className="text-sm text-slate-500 dark:text-white/60 mb-4">
                  {statusFilter !== 'all' ? 'No invoices match the selected filter.' : 'Create invoices from completed jobs or start a new one.'}
                </p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="
                    inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all
                    bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white
                    shadow-md shadow-violet-500/20 hover:shadow-lg hover:shadow-violet-500/30
                  "
                >
                  <Plus className="w-4 h-4" />
                  Create Invoice
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInvoices.map((inv) => {
                  const accent = STATUS_ACCENT[inv.status] ?? STATUS_ACCENT.draft;
                  return (
                    <div
                      key={inv.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => viewInvoice(inv.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          viewInvoice(inv.id);
                        }
                      }}
                      className="
                        group relative block w-full overflow-hidden rounded-2xl p-4 pt-5 text-left transition-all cursor-pointer
                        bg-white/90 ring-1 ring-slate-200 hover:ring-slate-300 shadow-sm hover:shadow-md
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
                        dark:bg-white/[0.04] dark:ring-white/10 dark:hover:ring-white/20
                      "
                    >
                      {/* Top accent bar */}
                      <span
                        className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${accent}`}
                        aria-hidden
                      />

                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className="text-sm font-mono font-semibold text-slate-900 dark:text-white">
                              {inv.invoice_number}
                            </span>
                            {statusBadge(inv.status)}
                            {inv.po_number && (
                              <span className="text-xs text-slate-500 dark:text-white/50">
                                PO: {inv.po_number}
                              </span>
                            )}
                            {inv.created_by && profilesById[inv.created_by] && (
                              <span className="
                                inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium
                                bg-slate-100 text-slate-600 ring-1 ring-slate-200
                                dark:bg-white/5 dark:text-white/60 dark:ring-white/10
                              ">
                                Submitted by: {profilesById[inv.created_by]}
                              </span>
                            )}
                          </div>
                          <h3 className="text-slate-900 dark:text-white font-semibold truncate">
                            {inv.customer_name}
                          </h3>
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-white/50 flex-wrap">
                            <span>Invoiced: {formatDate(inv.invoice_date)}</span>
                            {inv.due_date && <span>Due: {formatDate(inv.due_date)}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <div className="text-right">
                            <div className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                              ${Number(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                            {inv.balance_due > 0 && inv.status !== 'draft' && inv.status !== 'paid' && (
                              <div className="text-xs text-amber-600 dark:text-amber-300 font-medium tabular-nums">
                                Due: ${Number(inv.balance_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {inv.status !== 'paid' && inv.status !== 'void' && (
                              <button
                                type="button"
                                onClick={() => openMarkPaidModal(inv)}
                                className="
                                  inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all
                                  bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100
                                  dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30 dark:hover:bg-emerald-500/25
                                "
                                title="Mark Paid"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Mark Paid</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => viewInvoice(inv.id)}
                              className="
                                p-1.5 rounded-lg transition-colors
                                text-slate-400 hover:text-violet-600 hover:bg-violet-50
                                dark:text-white/40 dark:hover:text-violet-300 dark:hover:bg-violet-500/15
                              "
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadPdf(inv.id, inv.invoice_number)}
                              disabled={downloadingPdf === inv.id}
                              className="
                                p-1.5 rounded-lg transition-colors
                                text-slate-400 hover:text-indigo-600 hover:bg-indigo-50
                                dark:text-white/40 dark:hover:text-indigo-300 dark:hover:bg-indigo-500/15
                              "
                              title="Download PDF"
                            >
                              {downloadingPdf === inv.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </button>
                            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-white/40 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Ready to Bill Tab */
          <div className="space-y-3">
            {/* Billing type filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-slate-500 dark:text-white/60 font-medium mr-1">Filter by type:</span>
              {(['all', 'fixed', 'cycle', 'tm'] as const).map(t => {
                const labels: Record<string, string> = { all: 'All', fixed: 'Fixed', cycle: 'Cycle', tm: 'T&M' };
                const active = billingTypeFilter === t;
                return (
                  <button
                    key={t}
                    onClick={() => setBillingTypeFilter(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      active
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/20'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10'
                    }`}
                  >
                    {labels[t]}
                  </button>
                );
              })}
            </div>

            {uninvoicedJobs.length === 0 ? (
              <div className="
                rounded-2xl p-12 text-center ring-1 shadow-sm
                bg-white/90 ring-slate-200
                dark:bg-white/[0.04] dark:ring-white/10
              ">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 dark:text-emerald-300 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                  {billingTypeFilter === 'all' ? 'All Caught Up' : 'No Jobs Found'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-white/60">
                  {billingTypeFilter === 'all'
                    ? 'All completed jobs have been invoiced.'
                    : `No uninvoiced ${billingTypeFilter.toUpperCase()} billing jobs found.`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {uninvoicedJobs.map(job => (
                  <div
                    key={job.id}
                    className="
                      group relative overflow-hidden rounded-2xl p-4 pt-5 transition-all
                      bg-white/90 ring-1 ring-slate-200 hover:ring-slate-300 shadow-sm hover:shadow-md
                      dark:bg-white/[0.04] dark:ring-white/10 dark:hover:ring-white/20
                    "
                  >
                    <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" aria-hidden />
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <Link
                            href={`/dashboard/admin/completed-job-tickets/${job.id}`}
                            className="text-sm font-mono font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300 dark:hover:text-violet-200 hover:underline"
                          >
                            {job.job_number}
                          </Link>
                          {billingTypeBadge(job.billing_type)}
                          {job.work_completed_at && (
                            <span className="text-xs text-slate-500 dark:text-white/50">
                              Completed {new Date(job.work_completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {job.created_by && profilesById[job.created_by] && (
                            <span className="
                              inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium
                              bg-slate-100 text-slate-600 ring-1 ring-slate-200
                              dark:bg-white/5 dark:text-white/60 dark:ring-white/10
                            ">
                              Submitted by: {profilesById[job.created_by]}
                            </span>
                          )}
                        </div>
                        <h3 className="text-slate-900 dark:text-white font-semibold truncate">
                          {job.customer_name}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-white/60 truncate mt-0.5">
                          {job.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-slate-500 dark:text-white/50 uppercase tracking-wider font-semibold">Estimated</div>
                          {job.estimated_cost ? (
                            <div className="text-base font-bold text-emerald-600 dark:text-emerald-300 tabular-nums">
                              ${Number(job.estimated_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-400 dark:text-white/40">--</div>
                          )}
                        </div>
                        <button
                          onClick={() => openReviewInvoice(job.id)}
                          disabled={creating === job.id || (reviewJobId === job.id && reviewLoading)}
                          className="
                            inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50
                            bg-gradient-to-r from-emerald-500 to-teal-500 text-white
                            shadow-sm shadow-emerald-500/20 hover:shadow-md hover:shadow-emerald-500/30
                          "
                        >
                          {(reviewJobId === job.id && reviewLoading) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          Create Invoice
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </RevealSection>

        {/* Invoice Detail Modal */}
        {selectedInvoice && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-8">
            <div className="
              w-full max-w-2xl mx-2 sm:mx-4 rounded-2xl shadow-2xl ring-1
              bg-white ring-slate-200
              dark:bg-[#120826] dark:ring-white/10
            ">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-white/10">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selectedInvoice.invoice_number}</h2>
                  <p className="text-sm text-slate-500 dark:text-white/60">{selectedInvoice.customer_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadPdf(selectedInvoice.id, selectedInvoice.invoice_number)}
                    disabled={downloadingPdf === selectedInvoice.id}
                    className="
                      p-2 rounded-lg transition-colors border
                      bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50
                      dark:bg-white/5 dark:border-white/10 dark:text-white/70 dark:hover:text-indigo-300 dark:hover:bg-indigo-500/15
                    "
                    title="Download PDF"
                  >
                    {downloadingPdf === selectedInvoice.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      const token = getToken();
                      token.then(() => {
                        window.open(`/api/admin/invoices/${selectedInvoice.id}/pdf`, '_blank');
                      });
                    }}
                    className="
                      p-2 rounded-lg transition-colors border
                      bg-white border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50
                      dark:bg-white/5 dark:border-white/10 dark:text-white/70 dark:hover:text-blue-300 dark:hover:bg-blue-500/15
                    "
                    title="Print Invoice"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="
                      p-2 rounded-lg transition-colors
                      hover:bg-slate-100 text-slate-500
                      dark:hover:bg-white/10 dark:text-white/70
                    "
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-6">
                {/* Status + Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge(selectedInvoice.status)}

                  {selectedInvoice.status === 'draft' && (
                    <button
                      onClick={() => updateInvoiceStatus(selectedInvoice.id, 'sent')}
                      disabled={updatingStatus === selectedInvoice.id}
                      className="
                        px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1
                        bg-blue-50 ring-1 ring-blue-200 text-blue-700 hover:bg-blue-100
                        dark:bg-blue-500/15 dark:ring-blue-400/30 dark:text-blue-200 dark:hover:bg-blue-500/25
                      "
                    >
                      {updatingStatus === selectedInvoice.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Mark as Sent
                    </button>
                  )}
                  {['sent', 'overdue'].includes(selectedInvoice.status) && (
                    <button
                      onClick={() => updateInvoiceStatus(selectedInvoice.id, 'paid')}
                      disabled={updatingStatus === selectedInvoice.id}
                      className="
                        px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1
                        bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/20 hover:shadow-md
                      "
                    >
                      {updatingStatus === selectedInvoice.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Mark as Paid
                    </button>
                  )}
                  {selectedInvoice.status === 'sent' && (
                    <button
                      onClick={() => updateInvoiceStatus(selectedInvoice.id, 'overdue')}
                      disabled={updatingStatus === selectedInvoice.id}
                      className="
                        px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1
                        bg-rose-50 ring-1 ring-rose-200 text-rose-700 hover:bg-rose-100
                        dark:bg-rose-500/15 dark:ring-rose-400/30 dark:text-rose-200 dark:hover:bg-rose-500/25
                      "
                    >
                      <AlertCircle className="w-3 h-3" /> Mark Overdue
                    </button>
                  )}
                  {selectedInvoice.status !== 'void' && selectedInvoice.status !== 'paid' && (
                    <>
                      {confirmVoid === selectedInvoice.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-rose-600 dark:text-rose-300 font-medium">Void this invoice?</span>
                          <button
                            onClick={() => updateInvoiceStatus(selectedInvoice.id, 'void')}
                            className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmVoid(null)}
                            className="
                              px-2 py-1 rounded text-xs font-semibold
                              bg-slate-100 text-slate-600 hover:bg-slate-200
                              dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15
                            "
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmVoid(selectedInvoice.id)}
                          className="
                            px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1
                            bg-slate-50 ring-1 ring-slate-200 text-slate-600 hover:bg-slate-100
                            dark:bg-white/5 dark:ring-white/10 dark:text-white/70 dark:hover:bg-white/10
                          "
                        >
                          <Ban className="w-3 h-3" /> Void
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Invoice Details Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Invoice Date</p>
                    <p className="text-slate-900 dark:text-white font-medium">{formatDate(selectedInvoice.invoice_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Due Date</p>
                    <p className="text-slate-900 dark:text-white font-medium">{formatDate(selectedInvoice.due_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Terms</p>
                    <p className="text-slate-900 dark:text-white font-medium">Net {selectedInvoice.payment_terms || 30}</p>
                  </div>
                  {selectedInvoice.po_number && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">PO Number</p>
                      <p className="text-slate-900 dark:text-white font-medium">{selectedInvoice.po_number}</p>
                    </div>
                  )}
                  {selectedInvoice.customer_email && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Email</p>
                      <p className="text-slate-900 dark:text-white font-medium text-sm truncate">{selectedInvoice.customer_email}</p>
                    </div>
                  )}
                  {selectedInvoice.billing_address && (
                    <div className="col-span-2">
                      <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Address</p>
                      <p className="text-slate-900 dark:text-white font-medium text-sm">{selectedInvoice.billing_address}</p>
                    </div>
                  )}
                </div>

                {/* Line Items Table */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-3">Line Items</p>
                  <div className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider">Description</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider">Qty</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider">Rate</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedInvoice.line_items || []).map((item: any, i: number) => (
                          <tr key={i} className={i % 2 === 1 ? 'bg-slate-50/50 dark:bg-white/[0.02]' : ''}>
                            <td className="px-4 py-2.5 text-slate-900 dark:text-white">{item.description}</td>
                            <td className="px-4 py-2.5 text-right text-slate-600 dark:text-white/70 tabular-nums">
                              {item.quantity} {item.unit && item.unit !== 'each' ? item.unit : ''}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-600 dark:text-white/70 tabular-nums">
                              ${Number(item.unit_rate).toFixed(2)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-900 dark:text-white font-medium tabular-nums">
                              ${Number(item.amount).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {(selectedInvoice.line_items || []).length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-slate-400 dark:text-white/40 text-sm">
                              No line items
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="flex justify-end">
                  <div className="
                    w-72 rounded-xl p-4 space-y-2 ring-1
                    bg-slate-50 ring-slate-200
                    dark:bg-white/[0.03] dark:ring-white/10
                  ">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-white/60">Subtotal</span>
                      <span className="text-slate-900 dark:text-white font-medium tabular-nums">${Number(selectedInvoice.subtotal).toFixed(2)}</span>
                    </div>
                    {Number(selectedInvoice.tax_amount) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-white/60">Tax ({selectedInvoice.tax_rate || 0}%)</span>
                        <span className="text-slate-900 dark:text-white font-medium tabular-nums">${Number(selectedInvoice.tax_amount).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(selectedInvoice.discount_amount) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-white/60">Discount</span>
                        <span className="text-emerald-600 dark:text-emerald-300 font-medium tabular-nums">-${Number(selectedInvoice.discount_amount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200 dark:border-white/10">
                      <span className="text-slate-900 dark:text-white">Total</span>
                      <span className="text-slate-900 dark:text-white tabular-nums">${Number(selectedInvoice.total_amount).toFixed(2)}</span>
                    </div>
                    {selectedInvoice.status !== 'paid' && Number(selectedInvoice.balance_due) > 0 && (
                      <div className="flex justify-between text-sm pt-1">
                        <span className="text-amber-600 dark:text-amber-300 font-semibold">Balance Due</span>
                        <span className="text-amber-600 dark:text-amber-300 font-bold tabular-nums">${Number(selectedInvoice.balance_due).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payments */}
                {(selectedInvoice.payments || []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-3">Payments</p>
                    <div className="space-y-2">
                      {selectedInvoice.payments.map((payment: any, i: number) => (
                        <div key={i} className="
                          flex items-center justify-between rounded-xl px-4 py-2 text-sm ring-1
                          bg-emerald-50 ring-emerald-200
                          dark:bg-emerald-500/10 dark:ring-emerald-400/30
                        ">
                          <div>
                            <span className="font-medium text-emerald-800 dark:text-emerald-200">{payment.payment_method || 'Payment'}</span>
                            <span className="text-emerald-600 dark:text-emerald-300 ml-2">{formatDate(payment.payment_date)}</span>
                          </div>
                          <span className="font-semibold text-emerald-800 dark:text-emerald-200 tabular-nums">${Number(payment.amount).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedInvoice.notes && (
                  <div className="
                    p-4 rounded-xl ring-1
                    bg-slate-50 ring-slate-200
                    dark:bg-white/[0.03] dark:ring-white/10
                  ">
                    <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Notes</p>
                    <p className="text-sm text-slate-700 dark:text-white/80 whitespace-pre-line">{selectedInvoice.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mark Paid Modal */}
        {markPaidInvoice && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center px-4">
            <div className="
              w-full max-w-md rounded-2xl shadow-2xl ring-1
              bg-white ring-slate-200
              dark:bg-[#120826] dark:ring-white/10
            ">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Mark as Paid</h3>
                    <p className="text-xs text-slate-500 dark:text-white/60">{markPaidInvoice.invoice_number} · {markPaidInvoice.customer_name}</p>
                  </div>
                </div>
                <button
                  onClick={closeMarkPaidModal}
                  className="
                    p-1.5 rounded-lg transition-colors
                    hover:bg-slate-100 text-slate-500
                    dark:hover:bg-white/10 dark:text-white/70
                  "
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {markPaidError && (
                  <div className="
                    p-3 rounded-lg flex items-center gap-2 text-sm
                    bg-rose-50 ring-1 ring-rose-200 text-rose-700
                    dark:bg-rose-500/10 dark:ring-rose-400/30 dark:text-rose-200
                  ">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{markPaidError}</span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider mb-1.5">
                    Amount paid
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-400 dark:text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={markPaidAmount}
                      onChange={(e) => setMarkPaidAmount(e.target.value)}
                      className="
                        w-full pl-9 pr-3 py-2 rounded-lg text-sm transition-all tabular-nums
                        bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400
                        focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200
                        dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/40
                        dark:focus:border-emerald-400 dark:focus:ring-emerald-500/30
                      "
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-white/50">
                    Invoice total: ${Number(markPaidInvoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider mb-1.5">
                    Date paid
                  </label>
                  <input
                    type="date"
                    value={markPaidDate}
                    onChange={(e) => setMarkPaidDate(e.target.value)}
                    className="
                      w-full px-3 py-2 rounded-lg text-sm transition-all
                      bg-white border border-slate-200 text-slate-900
                      focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200
                      dark:bg-white/5 dark:border-white/10 dark:text-white
                      dark:focus:border-emerald-400 dark:focus:ring-emerald-500/30
                    "
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-white/10">
                <button
                  onClick={closeMarkPaidModal}
                  disabled={markPaidSaving}
                  className="
                    px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50
                    bg-slate-100 text-slate-700 hover:bg-slate-200
                    dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10
                  "
                >
                  Cancel
                </button>
                <button
                  onClick={submitMarkPaid}
                  disabled={markPaidSaving}
                  className="
                    inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50
                    bg-gradient-to-r from-emerald-500 to-teal-500 text-white
                    shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30
                  "
                >
                  {markPaidSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Review & Confirm Invoice Modal */}
        {reviewJobId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-8">
            <div className="
              w-full max-w-2xl mx-2 sm:mx-4 rounded-2xl shadow-2xl ring-1
              bg-white ring-slate-200
              dark:bg-[#120826] dark:ring-white/10
            ">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-white/10">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    Review &amp; Confirm Invoice
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-white/60">
                    {reviewData
                      ? `${reviewData.job.job_number} — ${reviewData.job.customer_name}`
                      : 'Loading preview…'}
                  </p>
                </div>
                <button
                  onClick={closeReviewModal}
                  disabled={submittingReview}
                  className="
                    p-2 rounded-lg transition-colors disabled:opacity-50
                    hover:bg-slate-100 text-slate-500
                    dark:hover:bg-white/10 dark:text-white/70
                  "
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-5 max-h-[80vh] overflow-y-auto">
                {reviewLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                  </div>
                )}

                {reviewError && (
                  <div className="
                    p-3 rounded-xl flex items-center gap-3
                    bg-rose-50 ring-1 ring-rose-200
                    dark:bg-rose-500/10 dark:ring-rose-400/30
                  ">
                    <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-300 flex-shrink-0" />
                    <p className="text-sm text-rose-700 dark:text-rose-200 flex-1">{reviewError}</p>
                  </div>
                )}

                {!reviewLoading && reviewData && (
                  <>
                    {/* Job summary grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Customer</p>
                        <p className="text-slate-900 dark:text-white font-medium truncate">{reviewData.job.customer_name}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Job #</p>
                        <p className="text-slate-900 dark:text-white font-mono font-medium">{reviewData.job.job_number}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Billing</p>
                        <p className="text-slate-900 dark:text-white font-medium capitalize">
                          {(reviewData.job.billing_type || 'fixed').replace('_', ' ')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Default Due</p>
                        <p className="text-slate-900 dark:text-white font-medium">{formatDate(reviewData.default_due_date)}</p>
                      </div>
                      {(reviewData.job.location || reviewData.job.address) && (
                        <div className="col-span-2 sm:col-span-4">
                          <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-1">Location</p>
                          <p className="text-slate-900 dark:text-white font-medium text-sm truncate">
                            {reviewData.job.location || reviewData.job.address}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Work Performed by Operator panel */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">
                          Work Performed by Operator ({reviewData.operator_name})
                        </p>
                        <button
                          type="button"
                          onClick={useOperatorDescription}
                          disabled={!reviewData.work_performed_summary?.trim() || editLineItems.length === 0}
                          className="
                            inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                            bg-emerald-50 ring-1 ring-emerald-200 text-emerald-700 hover:bg-emerald-100
                            dark:bg-emerald-500/15 dark:ring-emerald-400/30 dark:text-emerald-200 dark:hover:bg-emerald-500/25
                          "
                          title="Copy this text into the first line item description"
                        >
                          Use Operator&apos;s Description
                        </button>
                      </div>
                      <div className="
                        rounded-xl p-3 ring-1 font-mono text-xs whitespace-pre-wrap
                        bg-slate-50 ring-slate-200 text-slate-700
                        dark:bg-white/[0.03] dark:ring-white/10 dark:text-white/80
                      ">
                        {reviewData.work_performed_summary?.trim()
                          ? reviewData.work_performed_summary
                          : 'No work performed details available.'}
                      </div>
                    </div>

                    {/* Editable line items */}
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider mb-2">Proposed Line Items</p>
                      <div className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10">
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider">Description</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider w-20">Qty</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider w-20">Unit</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider w-24">Rate</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider w-24">Amount</th>
                              <th className="px-3 py-2 w-20"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {editLineItems.map((li, i) => {
                              const editing = editingDescIdx.has(i);
                              const amount = (Number(li.quantity) || 0) * (Number(li.unit_rate) || 0);
                              return (
                                <tr key={i} className={i % 2 === 1 ? 'bg-slate-50/50 dark:bg-white/[0.02]' : ''}>
                                  <td className="px-3 py-2 align-top">
                                    {editing ? (
                                      <textarea
                                        value={li.description}
                                        onChange={(e) => updateEditLineItem(i, { description: e.target.value })}
                                        rows={Math.min(6, Math.max(2, li.description.split('\n').length))}
                                        className="
                                          w-full px-2 py-1.5 rounded-lg text-sm
                                          bg-white border border-slate-200 text-slate-900
                                          focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200
                                          dark:bg-white/5 dark:border-white/10 dark:text-white
                                          dark:focus:border-emerald-400 dark:focus:ring-emerald-500/30
                                        "
                                      />
                                    ) : (
                                      <div className="text-slate-900 dark:text-white whitespace-pre-wrap break-words">
                                        {li.description}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right align-top">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={li.quantity}
                                      onChange={(e) => updateEditLineItem(i, { quantity: Number(e.target.value) })}
                                      className="
                                        w-full px-2 py-1.5 rounded-lg text-sm text-right tabular-nums
                                        bg-white border border-slate-200 text-slate-900
                                        focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200
                                        dark:bg-white/5 dark:border-white/10 dark:text-white
                                        dark:focus:border-emerald-400 dark:focus:ring-emerald-500/30
                                      "
                                    />
                                  </td>
                                  <td className="px-3 py-2 align-top">
                                    <input
                                      type="text"
                                      value={li.unit}
                                      onChange={(e) => updateEditLineItem(i, { unit: e.target.value })}
                                      className="
                                        w-full px-2 py-1.5 rounded-lg text-sm
                                        bg-white border border-slate-200 text-slate-900
                                        focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200
                                        dark:bg-white/5 dark:border-white/10 dark:text-white
                                        dark:focus:border-emerald-400 dark:focus:ring-emerald-500/30
                                      "
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right align-top">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={li.unit_rate}
                                      onChange={(e) => updateEditLineItem(i, { unit_rate: Number(e.target.value) })}
                                      className="
                                        w-full px-2 py-1.5 rounded-lg text-sm text-right tabular-nums
                                        bg-white border border-slate-200 text-slate-900
                                        focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200
                                        dark:bg-white/5 dark:border-white/10 dark:text-white
                                        dark:focus:border-emerald-400 dark:focus:ring-emerald-500/30
                                      "
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right align-top text-slate-900 dark:text-white font-medium tabular-nums">
                                    ${amount.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2 align-top">
                                    <button
                                      type="button"
                                      onClick={() => toggleEditDesc(i)}
                                      className={`
                                        text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors
                                        ${editing
                                          ? 'bg-emerald-50 ring-1 ring-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:ring-emerald-400/30 dark:text-emerald-200'
                                          : 'bg-slate-100 ring-1 ring-slate-200 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:ring-white/10 dark:text-white/70 dark:hover:bg-white/15'
                                        }
                                      `}
                                    >
                                      {editing ? 'Use as-is' : 'Edit Description'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                            {editLineItems.length === 0 && (
                              <tr>
                                <td colSpan={6} className="px-4 py-6 text-center text-slate-400 dark:text-white/40 text-sm">
                                  No line items proposed.
                                </td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-slate-200 dark:border-white/10">
                              <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold text-slate-500 dark:text-white/60">Subtotal</td>
                              <td className="px-3 py-2 text-right text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                                ${editSubtotal.toFixed(2)}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeReviewModal}
                  disabled={submittingReview}
                  className="
                    px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50
                    bg-slate-100 text-slate-700 hover:bg-slate-200
                    dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/15
                  "
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitReviewedInvoice}
                  disabled={submittingReview || reviewLoading || !reviewData || editLineItems.length === 0}
                  className="
                    inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50
                    bg-gradient-to-r from-emerald-500 to-teal-500 text-white
                    shadow-sm shadow-emerald-500/20 hover:shadow-md hover:shadow-emerald-500/30
                  "
                >
                  {submittingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Submit Invoice
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Invoice Form Modal */}
        {showCreateForm && (
          <CreateInvoiceForm
            onClose={() => setShowCreateForm(false)}
            onCreated={() => {
              setShowCreateForm(false);
              setSuccessMsg('Invoice created successfully.');
              fetchData();
            }}
          />
        )}
      </div>
    </div>
  );
}
