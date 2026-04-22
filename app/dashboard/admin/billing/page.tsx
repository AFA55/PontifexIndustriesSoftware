'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import CreateInvoiceForm from './_components/CreateInvoiceForm';
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  DollarSign,
  FileText,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
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
}

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

  useEffect(() => {
    const guard = async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) { router.push('/login'); return; }
      const allowedRoles = ['admin', 'super_admin', 'operations_manager'];
      const bypassRoles = ['super_admin', 'operations_manager'];
      if (!allowedRoles.includes(currentUser.role)) {
        // Fall back to feature flag: allow if can_view_invoicing is true.
        // Wait for a real session token before giving up — right after login the
        // session may not yet be cached client-side, producing a false 401.
        const getToken = async (): Promise<string | null> => {
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
          const token = await getToken();
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
  }, []);

  // Auto-clear success message
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
      if (invoiceRes.ok) {
        const invoiceData = await invoiceRes.json();
        setInvoices(invoiceData.data || []);
        setStats(invoiceData.stats || {});
      } else {
        setError('Failed to load invoices.');
      }

      const { data: completed } = await supabase
        .from('job_orders')
        .select('id, job_number, title, customer_name, estimated_cost, work_completed_at, status, billing_type')
        .eq('status', 'completed')
        .is('deleted_at', null)
        .order('work_completed_at', { ascending: false })
        .limit(50);

      if (completed) {
        const { data: existingLineItems } = await supabase
          .from('invoice_line_items')
          .select('job_order_id')
          .in('job_order_id', completed.map(j => j.id));

        const invoicedJobIds = new Set((existingLineItems || []).map(li => li.job_order_id));

        setCompletedJobs(completed.map(j => ({
          ...j,
          has_invoice: invoicedJobIds.has(j.id),
        })));
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

  const billingTypeBadge = (type: string | null) => {
    const cfgs: Record<string, { bg: string; text: string; label: string }> = {
      fixed: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Fixed' },
      cycle: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Cycle' },
      time_material: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'T&M' },
      tm: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'T&M' },
    };
    const key = (type || 'fixed').toLowerCase();
    const c = cfgs[key] || { bg: 'bg-gray-100', text: 'text-gray-600', label: type || 'Fixed' };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
        {c.label}
      </span>
    );
  };

  const statusBadge = (status: string) => {
    const configs: Record<string, { color: string; bg: string; icon: any }> = {
      draft: { color: 'text-gray-700', bg: 'bg-gray-100', icon: FileText },
      sent: { color: 'text-blue-700', bg: 'bg-blue-100', icon: Send },
      paid: { color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle2 },
      overdue: { color: 'text-red-700', bg: 'bg-red-100', icon: AlertCircle },
      void: { color: 'text-gray-400 line-through', bg: 'bg-gray-100', icon: Ban },
    };
    const cfg = configs[status] || configs.draft;
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.color}`}>
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/admin"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Receipt size={18} className="text-emerald-600" />
                  Billing & Invoicing
                </h1>
                <p className="text-sm text-gray-500">Create and manage job invoices</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-sm font-semibold transition-all shadow-sm whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Create Invoice</span>
                <span className="sm:hidden">New</span>
              </button>
              <button
                onClick={fetchData}
                disabled={loading}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Notifications */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            <p className="text-sm text-green-700 flex-1">{successMsg}</p>
            <button onClick={() => setSuccessMsg(null)} className="text-green-400 hover:text-green-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <FileText className="w-4 h-4 text-gray-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.draft || 0}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Drafts</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Send className="w-4 h-4 text-blue-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.sent || 0}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sent</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.paid || 0}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Paid</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-amber-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">${(stats.totalOutstanding || 0).toLocaleString()}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Outstanding</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === 'invoices'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            All Invoices ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('ready_to_bill')}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              activeTab === 'ready_to_bill'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Ready to Bill
            {uninvoicedJobs.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                {uninvoicedJobs.length}
              </span>
            )}
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
            <p className="text-gray-500 text-sm">Loading billing data...</p>
          </div>
        ) : activeTab === 'invoices' ? (
          <>
            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search invoices..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 bg-white transition-all"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 bg-white cursor-pointer"
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
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No invoices found</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {statusFilter !== 'all' ? 'No invoices match the selected filter.' : 'Create invoices from completed jobs or start a new one.'}
                </p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-sm font-semibold transition-all shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Create Invoice
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                {/* Table Header */}
                <div className="hidden md:grid md:grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="col-span-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice #</span>
                  </div>
                  <div className="col-span-3">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</span>
                  </div>
                  <div className="col-span-1 text-center">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</span>
                  </div>
                </div>

                {/* Table Rows */}
                {filteredInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors items-center cursor-pointer"
                    onClick={() => viewInvoice(inv.id)}
                  >
                    {/* Invoice # */}
                    <div className="md:col-span-2">
                      <span className="text-sm font-semibold text-gray-900">{inv.invoice_number}</span>
                      {inv.po_number && (
                        <span className="block text-xs text-gray-400">PO: {inv.po_number}</span>
                      )}
                    </div>
                    {/* Customer */}
                    <div className="md:col-span-3">
                      <span className="text-sm text-gray-700 truncate block">{inv.customer_name}</span>
                    </div>
                    {/* Amount */}
                    <div className="md:col-span-2 text-right">
                      <span className="text-sm font-semibold text-gray-900">
                        ${Number(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      {inv.balance_due > 0 && inv.status !== 'draft' && inv.status !== 'paid' && (
                        <span className="block text-xs text-amber-600 font-medium">
                          Due: ${Number(inv.balance_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    {/* Status */}
                    <div className="md:col-span-1 text-center">
                      {statusBadge(inv.status)}
                    </div>
                    {/* Date */}
                    <div className="md:col-span-2">
                      <span className="text-sm text-gray-500">{formatDate(inv.invoice_date)}</span>
                      {inv.due_date && (
                        <span className="block text-xs text-gray-400">Due: {formatDate(inv.due_date)}</span>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="md:col-span-2 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => viewInvoice(inv.id)}
                        className="p-2 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => downloadPdf(inv.id, inv.invoice_number)}
                        disabled={downloadingPdf === inv.id}
                        className="p-2 hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors"
                        title="Download PDF"
                      >
                        {downloadingPdf === inv.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => viewInvoice(inv.id)}
                        className="p-2 hover:bg-gray-100 text-gray-300 hover:text-gray-500 rounded-lg transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Ready to Bill Tab */
          <div className="space-y-3">
            {/* Billing type filter */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 font-medium">Filter by type:</span>
              {(['all', 'fixed', 'cycle', 'tm'] as const).map(t => {
                const labels: Record<string, string> = { all: 'All', fixed: 'Fixed', cycle: 'Cycle', tm: 'T&M' };
                return (
                  <button
                    key={t}
                    onClick={() => setBillingTypeFilter(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      billingTypeFilter === t
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white border border-gray-300 text-gray-600 hover:border-emerald-400 hover:text-emerald-600'
                    }`}
                  >
                    {labels[t]}
                  </button>
                );
              })}
            </div>

            {uninvoicedJobs.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {billingTypeFilter === 'all' ? 'All Caught Up' : 'No Jobs Found'}
                </h3>
                <p className="text-sm text-gray-500">
                  {billingTypeFilter === 'all'
                    ? 'All completed jobs have been invoiced.'
                    : `No uninvoiced ${billingTypeFilter.toUpperCase()} billing jobs found.`}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                {/* Table Header */}
                <div className="hidden md:grid md:grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="col-span-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Job #</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</span>
                  </div>
                  <div className="col-span-1 text-center">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Billing</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Estimated</span>
                  </div>
                  <div className="col-span-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Completed</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</span>
                  </div>
                </div>
                {uninvoicedJobs.map(job => (
                  <div
                    key={job.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors items-center"
                  >
                    <div className="md:col-span-2">
                      <Link
                        href={`/dashboard/admin/completed-job-tickets/${job.id}`}
                        className="text-sm font-semibold text-blue-600 hover:underline"
                      >
                        {job.job_number}
                      </Link>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-sm text-gray-700">{job.customer_name}</span>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-sm text-gray-500 truncate block">{job.title}</span>
                    </div>
                    <div className="md:col-span-1 text-center">
                      {billingTypeBadge(job.billing_type)}
                    </div>
                    <div className="md:col-span-2 text-right">
                      {job.estimated_cost ? (
                        <span className="text-sm font-semibold text-emerald-600">
                          ${Number(job.estimated_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">--</span>
                      )}
                    </div>
                    <div className="md:col-span-1">
                      <span className="text-xs text-gray-500">
                        {job.work_completed_at ? new Date(job.work_completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--'}
                      </span>
                    </div>
                    <div className="md:col-span-2 text-right">
                      <button
                        onClick={() => createInvoice(job.id)}
                        disabled={creating === job.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {creating === job.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        Create Invoice
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Invoice Detail Modal */}
        {selectedInvoice && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-8">
            <div className="bg-white border border-gray-200 rounded-lg w-full max-w-2xl mx-2 sm:mx-4 shadow-xl">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedInvoice.invoice_number}</h2>
                  <p className="text-sm text-gray-500">{selectedInvoice.customer_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadPdf(selectedInvoice.id, selectedInvoice.invoice_number)}
                    disabled={downloadingPdf === selectedInvoice.id}
                    className="p-2 hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 rounded-lg transition-colors border border-gray-200"
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
                      token.then(t => {
                        window.open(`/api/admin/invoices/${selectedInvoice.id}/pdf`, '_blank');
                      });
                    }}
                    className="p-2 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-lg transition-colors border border-gray-200"
                    title="Print Invoice"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-500" />
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
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-blue-700 text-xs font-semibold transition-all flex items-center gap-1"
                    >
                      {updatingStatus === selectedInvoice.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Mark as Sent
                    </button>
                  )}
                  {['sent', 'overdue'].includes(selectedInvoice.status) && (
                    <button
                      onClick={() => updateInvoiceStatus(selectedInvoice.id, 'paid')}
                      disabled={updatingStatus === selectedInvoice.id}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                    >
                      {updatingStatus === selectedInvoice.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Mark as Paid
                    </button>
                  )}
                  {selectedInvoice.status === 'sent' && (
                    <button
                      onClick={() => updateInvoiceStatus(selectedInvoice.id, 'overdue')}
                      disabled={updatingStatus === selectedInvoice.id}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-red-700 text-xs font-semibold transition-all flex items-center gap-1"
                    >
                      <AlertCircle className="w-3 h-3" /> Mark Overdue
                    </button>
                  )}
                  {selectedInvoice.status !== 'void' && selectedInvoice.status !== 'paid' && (
                    <>
                      {confirmVoid === selectedInvoice.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-600 font-medium">Void this invoice?</span>
                          <button
                            onClick={() => updateInvoiceStatus(selectedInvoice.id, 'void')}
                            className="px-2 py-1 bg-red-600 text-white rounded text-xs font-semibold"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmVoid(null)}
                            className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-semibold"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmVoid(selectedInvoice.id)}
                          className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-gray-500 text-xs font-semibold transition-all flex items-center gap-1"
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
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Invoice Date</p>
                    <p className="text-gray-900 font-medium">{formatDate(selectedInvoice.invoice_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Due Date</p>
                    <p className="text-gray-900 font-medium">{formatDate(selectedInvoice.due_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Terms</p>
                    <p className="text-gray-900 font-medium">Net {selectedInvoice.payment_terms || 30}</p>
                  </div>
                  {selectedInvoice.po_number && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">PO Number</p>
                      <p className="text-gray-900 font-medium">{selectedInvoice.po_number}</p>
                    </div>
                  )}
                  {selectedInvoice.customer_email && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</p>
                      <p className="text-gray-900 font-medium text-sm truncate">{selectedInvoice.customer_email}</p>
                    </div>
                  )}
                  {selectedInvoice.billing_address && (
                    <div className="col-span-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Address</p>
                      <p className="text-gray-900 font-medium text-sm">{selectedInvoice.billing_address}</p>
                    </div>
                  )}
                </div>

                {/* Line Items Table */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Line Items</p>
                  <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Rate</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedInvoice.line_items || []).map((item: any, i: number) => (
                          <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                            <td className="px-4 py-2.5 text-gray-900">{item.description}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600">
                              {item.quantity} {item.unit && item.unit !== 'each' ? item.unit : ''}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-600">
                              ${Number(item.unit_rate).toFixed(2)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-900 font-medium">
                              ${Number(item.amount).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {(selectedInvoice.line_items || []).length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">
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
                  <div className="w-72 bg-gray-50 rounded-lg p-4 space-y-2 border border-gray-200">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="text-gray-900 font-medium">${Number(selectedInvoice.subtotal).toFixed(2)}</span>
                    </div>
                    {Number(selectedInvoice.tax_amount) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Tax ({selectedInvoice.tax_rate || 0}%)</span>
                        <span className="text-gray-900 font-medium">${Number(selectedInvoice.tax_amount).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(selectedInvoice.discount_amount) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Discount</span>
                        <span className="text-emerald-600 font-medium">-${Number(selectedInvoice.discount_amount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
                      <span className="text-gray-900">Total</span>
                      <span className="text-gray-900">${Number(selectedInvoice.total_amount).toFixed(2)}</span>
                    </div>
                    {selectedInvoice.status !== 'paid' && Number(selectedInvoice.balance_due) > 0 && (
                      <div className="flex justify-between text-sm pt-1">
                        <span className="text-amber-600 font-semibold">Balance Due</span>
                        <span className="text-amber-600 font-bold">${Number(selectedInvoice.balance_due).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payments */}
                {(selectedInvoice.payments || []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Payments</p>
                    <div className="space-y-2">
                      {selectedInvoice.payments.map((payment: any, i: number) => (
                        <div key={i} className="flex items-center justify-between bg-green-50 rounded-lg border border-green-200 px-4 py-2 text-sm">
                          <div>
                            <span className="font-medium text-green-800">{payment.payment_method || 'Payment'}</span>
                            <span className="text-green-600 ml-2">{formatDate(payment.payment_date)}</span>
                          </div>
                          <span className="font-semibold text-green-800">${Number(payment.amount).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedInvoice.notes && (
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{selectedInvoice.notes}</p>
                  </div>
                )}
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
