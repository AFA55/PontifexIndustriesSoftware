'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
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
  Filter,
  Download,
  Eye,
  Receipt,
} from 'lucide-react';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string | null;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  balance_due: number;
  status: string;
  po_number: string | null;
  notes: string | null;
  created_at: string;
}

interface CompletedJob {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  estimated_cost: number | null;
  work_completed_at: string;
  status: string;
  has_invoice: boolean;
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
  const [creating, setCreating] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    if (!['admin', 'super_admin', 'operations_manager'].includes(currentUser.role)) {
      router.push('/dashboard'); return;
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch invoices
      const invoiceRes = await fetch('/api/admin/invoices', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (invoiceRes.ok) {
        const invoiceData = await invoiceRes.json();
        setInvoices(invoiceData.data || []);
        setStats(invoiceData.stats || {});
      }

      // Fetch completed jobs that don't have invoices yet
      const { data: completed } = await supabase
        .from('job_orders')
        .select('id, job_number, title, customer_name, estimated_cost, work_completed_at, status')
        .eq('status', 'completed')
        .is('deleted_at', null)
        .order('work_completed_at', { ascending: false })
        .limit(50);

      if (completed) {
        // Check which ones already have invoices
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
    } finally {
      setLoading(false);
    }
  };

  const createInvoice = async (jobOrderId: string) => {
    setCreating(jobOrderId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ jobOrderId })
      });

      const data = await res.json();

      if (res.ok) {
        // Refresh data
        fetchData();
        setActiveTab('invoices');
      } else {
        alert(data.error || 'Failed to create invoice');
      }
    } catch (err) {
      console.error('Error creating invoice:', err);
    } finally {
      setCreating(null);
    }
  };

  const viewInvoice = async (invoiceId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setSelectedInvoice(data.data);
      }
    } catch (err) {
      console.error('Error fetching invoice:', err);
    }
  };

  const updateInvoiceStatus = async (invoiceId: string, newStatus: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (res.ok) {
        fetchData();
        if (selectedInvoice?.id === invoiceId) {
          viewInvoice(invoiceId);
        }
      }
    } catch (err) {
      console.error('Error updating invoice:', err);
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

  const uninvoicedJobs = completedJobs.filter(j => !j.has_invoice);

  const statusConfig: Record<string, { color: string; bg: string; icon: any }> = {
    draft: { color: 'text-slate-600', bg: 'bg-slate-100', icon: FileText },
    sent: { color: 'text-blue-600', bg: 'bg-blue-100', icon: Send },
    paid: { color: 'text-emerald-600', bg: 'bg-emerald-100', icon: CheckCircle2 },
    overdue: { color: 'text-red-600', bg: 'bg-red-100', icon: AlertCircle },
    void: { color: 'text-gray-400', bg: 'bg-gray-100', icon: FileText },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/admin"
                className="p-2 bg-white/10 rounded-xl border border-white/20 hover:bg-white/20 transition-all"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5" />
                  Billing & Invoicing
                </h1>
                <p className="text-xs text-white/60">Create and manage job invoices</p>
              </div>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 bg-white/10 rounded-xl border border-white/20 hover:bg-white/20 transition-all"
            >
              <RefreshCw className={`w-5 h-5 text-white ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-4">
            <DollarSign className="w-5 h-5 text-emerald-400 mb-1" />
            <p className="text-xl font-bold text-white">${(stats.totalPaid || 0).toLocaleString()}</p>
            <p className="text-xs text-white/50">Total Paid</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-4">
            <Clock className="w-5 h-5 text-amber-400 mb-1" />
            <p className="text-xl font-bold text-white">${(stats.totalOutstanding || 0).toLocaleString()}</p>
            <p className="text-xs text-white/50">Outstanding</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-4">
            <FileText className="w-5 h-5 text-blue-400 mb-1" />
            <p className="text-xl font-bold text-white">{stats.total || 0}</p>
            <p className="text-xs text-white/50">Total Invoices</p>
          </div>
          <div className="bg-emerald-500/20 backdrop-blur-sm rounded-xl border border-emerald-400/20 p-4">
            <Plus className="w-5 h-5 text-emerald-400 mb-1" />
            <p className="text-xl font-bold text-emerald-300">{uninvoicedJobs.length}</p>
            <p className="text-xs text-emerald-200/60">Ready to Bill</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'invoices'
                ? 'bg-white text-slate-900'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Invoices ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('ready_to_bill')}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'ready_to_bill'
                ? 'bg-white text-slate-900'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Ready to Bill
            {uninvoicedJobs.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500 text-white">
                {uninvoicedJobs.length}
              </span>
            )}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-white/50" />
          </div>
        ) : activeTab === 'invoices' ? (
          <>
            {/* Search + Filter */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search invoices..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 bg-white/10 border border-white/10 rounded-xl text-white appearance-none cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>

            {/* Invoice List */}
            {filteredInvoices.length === 0 ? (
              <div className="bg-white/5 rounded-2xl border border-white/10 p-12 text-center">
                <FileText className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/50">No invoices yet</p>
                <p className="text-white/30 text-sm mt-1">Create invoices from completed jobs</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredInvoices.map(inv => {
                  const cfg = statusConfig[inv.status] || statusConfig.draft;
                  const StatusIcon = cfg.icon;

                  return (
                    <button
                      key={inv.id}
                      onClick={() => viewInvoice(inv.id)}
                      className="w-full bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-4 hover:bg-white/15 transition-all text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-white">{inv.invoice_number}</span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                              <StatusIcon className="w-3 h-3" />
                              {inv.status}
                            </span>
                          </div>
                          <p className="text-sm text-white/70 truncate">{inv.customer_name}</p>
                          <p className="text-xs text-white/40">
                            {inv.invoice_date} {inv.po_number ? `| PO: ${inv.po_number}` : ''}
                          </p>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-lg font-bold text-white">
                            ${Number(inv.total_amount).toLocaleString()}
                          </p>
                          {inv.balance_due > 0 && inv.status !== 'draft' && (
                            <p className="text-xs text-amber-400">
                              Due: ${Number(inv.balance_due).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-white/30 ml-2" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Ready to Bill Tab */
          <div className="space-y-2">
            {uninvoicedJobs.length === 0 ? (
              <div className="bg-white/5 rounded-2xl border border-white/10 p-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <p className="text-white/70">All completed jobs have been invoiced</p>
              </div>
            ) : (
              uninvoicedJobs.map(job => (
                <div
                  key={job.id}
                  className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{job.job_number}</p>
                      <p className="text-sm text-white/70 truncate">{job.title}</p>
                      <p className="text-xs text-white/40">{job.customer_name}</p>
                      {job.work_completed_at && (
                        <p className="text-xs text-white/30">
                          Completed: {new Date(job.work_completed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex items-center gap-3">
                      {job.estimated_cost && (
                        <div>
                          <p className="text-lg font-bold text-emerald-400">
                            ${Number(job.estimated_cost).toLocaleString()}
                          </p>
                          <p className="text-xs text-white/40">Estimated</p>
                        </div>
                      )}
                      <button
                        onClick={() => createInvoice(job.id)}
                        disabled={creating === job.id}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-1"
                      >
                        {creating === job.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        Create Invoice
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Invoice Detail Modal */}
        {selectedInvoice && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedInvoice.invoice_number}</h2>
                    <p className="text-sm text-white/50">{selectedInvoice.customer_name}</p>
                  </div>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white"
                  >
                    &times;
                  </button>
                </div>

                {/* Status + Actions */}
                <div className="flex gap-2 mb-6">
                  {selectedInvoice.status === 'draft' && (
                    <button
                      onClick={() => updateInvoiceStatus(selectedInvoice.id, 'sent')}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium flex items-center gap-1"
                    >
                      <Send className="w-4 h-4" /> Mark as Sent
                    </button>
                  )}
                  {['sent', 'overdue'].includes(selectedInvoice.status) && (
                    <button
                      onClick={() => updateInvoiceStatus(selectedInvoice.id, 'paid')}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Mark as Paid
                    </button>
                  )}
                </div>

                {/* Invoice Details */}
                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                  <div>
                    <p className="text-white/40">Invoice Date</p>
                    <p className="text-white">{selectedInvoice.invoice_date}</p>
                  </div>
                  <div>
                    <p className="text-white/40">Due Date</p>
                    <p className="text-white">{selectedInvoice.due_date || 'N/A'}</p>
                  </div>
                  {selectedInvoice.po_number && (
                    <div>
                      <p className="text-white/40">PO Number</p>
                      <p className="text-white">{selectedInvoice.po_number}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-white/40">Terms</p>
                    <p className="text-white">Net {selectedInvoice.payment_terms || 30}</p>
                  </div>
                </div>

                {/* Line Items */}
                <div className="mb-6">
                  <p className="text-sm font-semibold text-white mb-3">Line Items</p>
                  <div className="bg-white/5 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="px-4 py-2 text-left text-white/50 font-medium">Description</th>
                          <th className="px-4 py-2 text-right text-white/50 font-medium">Qty</th>
                          <th className="px-4 py-2 text-right text-white/50 font-medium">Rate</th>
                          <th className="px-4 py-2 text-right text-white/50 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedInvoice.line_items || []).map((item: any, i: number) => (
                          <tr key={i} className="border-b border-white/5">
                            <td className="px-4 py-2 text-white">{item.description}</td>
                            <td className="px-4 py-2 text-right text-white/70">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="px-4 py-2 text-right text-white/70">
                              ${Number(item.unit_rate).toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-right text-white font-medium">
                              ${Number(item.amount).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="border-t border-white/10 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Subtotal</span>
                    <span className="text-white">${Number(selectedInvoice.subtotal).toFixed(2)}</span>
                  </div>
                  {Number(selectedInvoice.tax_amount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/50">Tax</span>
                      <span className="text-white">${Number(selectedInvoice.tax_amount).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(selectedInvoice.discount_amount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/50">Discount</span>
                      <span className="text-emerald-400">-${Number(selectedInvoice.discount_amount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-white/10">
                    <span className="text-white">Total</span>
                    <span className="text-white">${Number(selectedInvoice.total_amount).toFixed(2)}</span>
                  </div>
                  {Number(selectedInvoice.balance_due) > 0 && selectedInvoice.status !== 'paid' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-400">Balance Due</span>
                      <span className="text-amber-400 font-bold">${Number(selectedInvoice.balance_due).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {selectedInvoice.notes && (
                  <div className="mt-4 p-3 bg-white/5 rounded-xl">
                    <p className="text-xs text-white/40 mb-1">Notes</p>
                    <p className="text-sm text-white/70 whitespace-pre-line">{selectedInvoice.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
