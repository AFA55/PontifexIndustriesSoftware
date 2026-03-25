'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
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
  Filter,
  Download,
  Eye,
  Receipt,
  X,
  Printer,
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
  payment_method?: string | null;
  payment_date?: string | null;
  reference_number?: string | null;
  last_reminder_sent_at?: string | null;
}

interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  recorded_by: string | null;
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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_method: 'check' as 'check' | 'cash' | 'card' | 'ach' | 'wire' | 'other',
    payment_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    notes: '',
  });
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [sendingBulkReminder, setSendingBulkReminder] = useState(false);
  const [bulkReminderResult, setBulkReminderResult] = useState<string | null>(null);

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

      const invoiceRes = await fetch('/api/admin/invoices', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (invoiceRes.ok) {
        const invoiceData = await invoiceRes.json();
        setInvoices(invoiceData.data || []);
        setStats(invoiceData.stats || {});
      }

      const { data: completed } = await supabase
        .from('job_orders')
        .select('id, job_number, title, customer_name, estimated_cost, work_completed_at, status')
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

  const downloadPdf = async (invoiceId: string, invoiceNumber: string) => {
    setDownloadingPdf(invoiceId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/invoices/${invoiceId}/pdf`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
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
        alert('Failed to generate PDF');
      }
    } catch (err) {
      console.error('Error downloading PDF:', err);
    } finally {
      setDownloadingPdf(null);
    }
  };

  const printPdf = async (invoiceId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/invoices/${invoiceId}/pdf`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          printWindow.addEventListener('load', () => {
            printWindow.print();
          });
        }
      }
    } catch (err) {
      console.error('Error printing PDF:', err);
    }
  };

  const sendReminder = async () => {
    if (!selectedInvoice) return;
    setSendingReminder(true);
    setSendResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/invoices/${selectedInvoice.id}/remind`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      setSendResult({
        success: res.ok,
        message: res.ok ? (data.message || 'Reminder sent') : (data.error || 'Failed to send reminder'),
      });
    } catch {
      setSendResult({ success: false, message: 'Failed to send reminder. Please try again.' });
    } finally {
      setSendingReminder(false);
    }
  };

  const sendBulkReminders = async () => {
    setSendingBulkReminder(true);
    setBulkReminderResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const overdueWithEmail = invoices.filter(
        inv => ['sent', 'overdue'].includes(inv.status) && inv.customer_email && Number(inv.balance_due) > 0
      );
      if (overdueWithEmail.length === 0) {
        setBulkReminderResult('No outstanding invoices with email addresses found.');
        return;
      }
      let sent = 0;
      let failed = 0;
      for (const inv of overdueWithEmail) {
        try {
          const res = await fetch(`/api/admin/invoices/${inv.id}/remind`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          });
          if (res.ok) sent++; else failed++;
        } catch { failed++; }
      }
      setBulkReminderResult(`Sent ${sent} reminder${sent !== 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}.`);
      fetchData();
    } catch {
      setBulkReminderResult('Failed to send bulk reminders.');
    } finally {
      setSendingBulkReminder(false);
    }
  };

  const sendInvoice = async () => {
    if (!selectedInvoice) return;
    setSendingInvoice(true);
    setSendResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/invoices/${selectedInvoice.id}/send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });

      const data = await res.json();

      if (res.ok) {
        setSendResult({ success: true, message: data.message || 'Invoice sent successfully' });
        // Refresh invoice to update status to 'sent'
        await viewInvoice(selectedInvoice.id);
        fetchData();
      } else {
        setSendResult({ success: false, message: data.error || 'Failed to send invoice' });
      }
    } catch (err) {
      console.error('Error sending invoice:', err);
      setSendResult({ success: false, message: 'Failed to send invoice. Please try again.' });
    } finally {
      setSendingInvoice(false);
    }
  };

  const openPaymentModal = () => {
    if (!selectedInvoice) return;
    setPaymentForm({
      amount: Number(selectedInvoice.balance_due).toFixed(2),
      payment_method: 'check',
      payment_date: new Date().toISOString().split('T')[0],
      reference_number: '',
      notes: '',
    });
    setPaymentSuccess(null);
    setShowPaymentModal(true);
  };

  const submitPayment = async () => {
    if (!selectedInvoice) return;
    setSubmittingPayment(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/invoices/${selectedInvoice.id}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: Number(paymentForm.amount),
          payment_method: paymentForm.payment_method,
          payment_date: paymentForm.payment_date,
          reference_number: paymentForm.reference_number || undefined,
          notes: paymentForm.notes || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPaymentSuccess(`Payment of $${Number(paymentForm.amount).toFixed(2)} recorded successfully.`);
        // Refresh the invoice detail
        await viewInvoice(selectedInvoice.id);
        // Refresh the invoice list
        fetchData();
        setTimeout(() => {
          setShowPaymentModal(false);
          setPaymentSuccess(null);
        }, 2000);
      } else {
        alert(data.error || 'Failed to record payment');
      }
    } catch (err) {
      console.error('Error recording payment:', err);
      alert('Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const exportToCSV = () => {
    const rows = [
      ['Invoice Number', 'Customer', 'Invoice Date', 'Due Date', 'PO Number', 'Subtotal', 'Tax', 'Total', 'Balance Due', 'Status', 'Payment Method', 'Payment Date'],
      ...filteredInvoices.map(inv => [
        inv.invoice_number,
        inv.customer_name,
        inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('en-US') : '',
        inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-US') : '',
        inv.po_number || '',
        inv.subtotal.toFixed(2),
        inv.tax_amount.toFixed(2),
        inv.total_amount.toFixed(2),
        inv.balance_due.toFixed(2),
        inv.status.charAt(0).toUpperCase() + inv.status.slice(1),
        inv.payment_method || '',
        inv.payment_date ? new Date(inv.payment_date).toLocaleDateString('en-US') : '',
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  const statusBadgeConfig: Record<string, { color: string; bg: string; icon: any }> = {
    draft: { color: 'text-slate-700', bg: 'bg-slate-100', icon: FileText },
    sent: { color: 'text-blue-700', bg: 'bg-blue-100', icon: Send },
    paid: { color: 'text-emerald-700', bg: 'bg-emerald-100', icon: CheckCircle2 },
    overdue: { color: 'text-red-700', bg: 'bg-red-100', icon: AlertCircle },
    void: { color: 'text-gray-400', bg: 'bg-gray-100', icon: FileText },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4 max-w-5xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/admin"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-6 h-6 text-gray-800" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-green-700 flex items-center justify-center shadow-sm">
                    <Receipt size={16} className="text-white" />
                  </div>
                  Billing & Invoicing
                </h1>
                <p className="text-sm text-gray-500">Create and manage job invoices</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportToCSV}
                disabled={filteredInvoices.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-all shadow-sm disabled:opacity-40"
                title="Export to QuickBooks-compatible CSV"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-purple-500/25"
              >
                <Plus className="w-4 h-4" />
                Create Invoice
              </button>
              <button
                onClick={fetchData}
                disabled={loading}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <DollarSign className="w-5 h-5 text-emerald-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900">${(stats.totalPaid || 0).toLocaleString()}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Paid</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <Clock className="w-5 h-5 text-amber-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900">${(stats.totalOutstanding || 0).toLocaleString()}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Outstanding</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <FileText className="w-5 h-5 text-blue-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900">{stats.total || 0}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Invoices</p>
          </div>
          <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 rounded-xl p-4 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -mr-4 -mt-4" />
            <Plus className="w-5 h-5 text-white/80 mb-2" />
            <p className="text-2xl font-bold">{uninvoicedJobs.length}</p>
            <p className="text-xs font-semibold text-white/80 uppercase tracking-wider">Ready to Bill</p>
          </div>
        </div>

        {/* AR Aging — only show when there's outstanding AR */}
        {stats.totalOutstanding > 0 && (
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">AR Aging Report</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">Total: <span className="font-bold text-slate-700">${(stats.totalOutstanding || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                {(stats.overdue || 0) > 0 && (
                  <button
                    onClick={sendBulkReminders}
                    disabled={sendingBulkReminder}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                    title="Send reminder emails to all customers with outstanding invoices"
                  >
                    {sendingBulkReminder ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                    ) : (
                      <><Send className="w-3.5 h-3.5" /> Send Reminders ({stats.overdue})</>
                    )}
                  </button>
                )}
              </div>
            </div>
            {bulkReminderResult && (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs font-medium text-amber-800 flex items-center justify-between">
                <span>{bulkReminderResult}</span>
                <button onClick={() => setBulkReminderResult(null)} className="ml-2 hover:opacity-60"><X className="w-3 h-3" /></button>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Current', value: stats.aging?.current || 0, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                { label: '1–30 Days', value: stats.aging?.days1_30 || 0, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
                { label: '31–60 Days', value: stats.aging?.days31_60 || 0, color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
                { label: '61–90 Days', value: stats.aging?.days61_90 || 0, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
                { label: '90+ Days', value: stats.aging?.days90plus || 0, color: 'text-red-800', bg: 'bg-red-100', border: 'border-red-300' },
              ].map(bucket => (
                <div key={bucket.label} className={`rounded-lg border ${bucket.border} ${bucket.bg} p-3`}>
                  <p className={`text-lg font-bold ${bucket.value > 0 ? bucket.color : 'text-slate-300'}`}>
                    ${bucket.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{bucket.label}</p>
                </div>
              ))}
            </div>
            {(stats.aging?.days90plus || 0) > 0 && (
              <p className="mt-3 text-xs text-red-600 font-medium">
                ⚠️ ${(stats.aging.days90plus).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is 90+ days past due — consider escalating collection.
              </p>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'invoices'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            Invoices ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('ready_to_bill')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'ready_to_bill'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            Ready to Bill
            {uninvoicedJobs.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'ready_to_bill' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {uninvoicedJobs.length}
              </span>
            )}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={() => { setError(null); fetchData(); }} className="text-sm font-semibold text-red-600 hover:text-red-800 transition-colors">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-14 h-14 mx-auto mb-4 relative">
              <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin" />
            </div>
            <p className="text-gray-600 font-medium">Loading billing data...</p>
          </div>
        ) : activeTab === 'invoices' ? (
          <>
            {/* Search + Filter */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search invoices..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 shadow-sm transition-all"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-800 shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 cursor-pointer"
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
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-12 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="text-slate-300" size={28} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No invoices yet</h3>
                <p className="text-gray-600 mb-4">Create invoices from completed jobs or start a new one</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-purple-500/25"
                >
                  <Plus className="w-4 h-4" />
                  Create Invoice
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                {filteredInvoices.map((inv, idx) => {
                  const cfg = statusBadgeConfig[inv.status] || statusBadgeConfig.draft;
                  const StatusIcon = cfg.icon;

                  return (
                    <div
                      key={inv.id}
                      className={`p-4 hover:bg-slate-50 transition-colors flex items-center justify-between ${
                        idx < filteredInvoices.length - 1 ? 'border-b border-slate-100' : ''
                      }`}
                    >
                      <button
                        onClick={() => viewInvoice(inv.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-gray-900">{inv.invoice_number}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 truncate">{inv.customer_name}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-400">
                            {inv.invoice_date} {inv.po_number ? `| PO: ${inv.po_number}` : ''}
                          </p>
                          {inv.status === 'overdue' && inv.due_date && (() => {
                            const days = Math.floor((Date.now() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24));
                            return days > 0 ? (
                              <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                                {days}d overdue
                              </span>
                            ) : null;
                          })()}
                          {inv.last_reminder_sent_at && (
                            <span className="text-[10px] text-amber-600 font-medium">
                              Reminded {Math.floor((Date.now() - new Date(inv.last_reminder_sent_at).getTime()) / (1000 * 60 * 60 * 24))}d ago
                            </span>
                          )}
                        </div>
                      </button>
                      <div className="flex items-center gap-3 ml-4">
                        <div className="text-right">
                          <p className="text-lg font-bold text-gray-900">
                            ${Number(inv.total_amount).toLocaleString()}
                          </p>
                          {inv.balance_due > 0 && inv.status !== 'draft' && (
                            <p className="text-xs text-amber-600 font-semibold">
                              Due: ${Number(inv.balance_due).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadPdf(inv.id, inv.invoice_number);
                            }}
                            disabled={downloadingPdf === inv.id}
                            className="p-2.5 hover:bg-purple-50 text-gray-400 hover:text-purple-600 rounded-lg transition-colors"
                            title="Download PDF"
                          >
                            {downloadingPdf === inv.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              printPdf(inv.id);
                            }}
                            className="p-2.5 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-lg transition-colors"
                            title="Print Invoice"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => viewInvoice(inv.id)}
                            className="p-2.5 hover:bg-slate-100 text-gray-300 rounded-lg transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
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
            {uninvoicedJobs.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-12 text-center">
                <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">All Caught Up</h3>
                <p className="text-gray-600">All completed jobs have been invoiced</p>
              </div>
            ) : (
              uninvoicedJobs.map(job => (
                <div
                  key={job.id}
                  className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 hover:border-emerald-400 p-5 transition-all hover:shadow-xl group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{job.job_number}</p>
                      <p className="text-sm text-gray-600 truncate">{job.title}</p>
                      <p className="text-xs text-gray-400">{job.customer_name}</p>
                      {job.work_completed_at && (
                        <p className="text-xs text-gray-400 mt-1">
                          Completed: {new Date(job.work_completed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex items-center gap-4">
                      {job.estimated_cost && (
                        <div>
                          <p className="text-lg font-bold text-emerald-600">
                            ${Number(job.estimated_cost).toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-400">Estimated</p>
                        </div>
                      )}
                      <button
                        onClick={() => createInvoice(job.id)}
                        disabled={creating === job.id}
                        className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm hover:shadow-md"
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
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-gray-200 rounded-2xl max-w-full sm:max-w-2xl mx-4 sm:mx-0 w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selectedInvoice.invoice_number}</h2>
                    <p className="text-sm text-gray-500">{selectedInvoice.customer_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadPdf(selectedInvoice.id, selectedInvoice.invoice_number)}
                      disabled={downloadingPdf === selectedInvoice.id}
                      className="p-2 hover:bg-purple-50 text-gray-500 hover:text-purple-600 rounded-xl transition-colors border border-gray-200"
                      title="Download PDF"
                    >
                      {downloadingPdf === selectedInvoice.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => printPdf(selectedInvoice.id)}
                      className="p-2 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-xl transition-colors border border-gray-200"
                      title="Print Invoice"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setSelectedInvoice(null); setSendResult(null); }}
                      className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                </div>

                {/* Status + Actions */}
                <div className="flex gap-2 mb-6">
                  {(() => {
                    const cfg = statusBadgeConfig[selectedInvoice.status] || statusBadgeConfig.draft;
                    const StatusIcon = cfg.icon;
                    return (
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {selectedInvoice.status.charAt(0).toUpperCase() + selectedInvoice.status.slice(1)}
                      </span>
                    );
                  })()}
                  {selectedInvoice.status === 'draft' && (
                    <button
                      onClick={sendInvoice}
                      disabled={sendingInvoice}
                      className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      {sendingInvoice ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                      ) : (
                        <><Send className="w-3.5 h-3.5" /> Send Invoice</>
                      )}
                    </button>
                  )}
                  {['sent', 'overdue'].includes(selectedInvoice.status) && (
                    <>
                      <button
                        onClick={sendReminder}
                        disabled={sendingReminder}
                        className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                        title="Send payment reminder email"
                      >
                        {sendingReminder ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                        ) : (
                          <><AlertCircle className="w-3.5 h-3.5" /> Send Reminder</>
                        )}
                      </button>
                      <button
                        onClick={() => updateInvoiceStatus(selectedInvoice.id, 'paid')}
                        className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Mark as Paid
                      </button>
                    </>
                  )}
                  {selectedInvoice.status !== 'paid' && Number(selectedInvoice.balance_due) > 0 && (
                    <button
                      onClick={openPaymentModal}
                      className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                    >
                      <DollarSign className="w-3.5 h-3.5" /> Record Payment
                    </button>
                  )}
                </div>

                {/* Send Result Feedback */}
                {sendResult && (
                  <div className={`mb-4 p-3 rounded-xl flex items-start gap-2.5 text-sm font-medium ${
                    sendResult.success
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    {sendResult.success ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    )}
                    <span className="flex-1">{sendResult.message}</span>
                    <button onClick={() => setSendResult(null)} className="ml-1 hover:opacity-70 flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Invoice Details */}
                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs font-semibold mb-0.5">Invoice Date</p>
                    <p className="text-gray-900 font-medium">{selectedInvoice.invoice_date}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs font-semibold mb-0.5">Due Date</p>
                    <p className="text-gray-900 font-medium">{selectedInvoice.due_date || 'N/A'}</p>
                  </div>
                  {selectedInvoice.po_number && (
                    <div>
                      <p className="text-gray-500 text-xs font-semibold mb-0.5">PO Number</p>
                      <p className="text-gray-900 font-medium">{selectedInvoice.po_number}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-500 text-xs font-semibold mb-0.5">Terms</p>
                    <p className="text-gray-900 font-medium">Net {selectedInvoice.payment_terms || 30}</p>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="mb-6">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Line Items</p>
                  <div className="bg-white rounded-xl border border-slate-200/60 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-100">
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description</th>
                          <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Qty</th>
                          <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rate</th>
                          <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedInvoice.line_items || []).map((item: any, i: number) => (
                          <tr key={i} className="border-b border-slate-50">
                            <td className="px-4 py-3 text-gray-900 font-medium">{item.description}</td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              ${Number(item.unit_rate).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-900 font-semibold">
                              ${Number(item.amount).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {(selectedInvoice.line_items || []).length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                              No line items
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 font-medium">Subtotal</span>
                    <span className="text-gray-900 font-medium">${Number(selectedInvoice.subtotal).toFixed(2)}</span>
                  </div>
                  {Number(selectedInvoice.tax_amount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Tax</span>
                      <span className="text-gray-900 font-medium">${Number(selectedInvoice.tax_amount).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(selectedInvoice.discount_amount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Discount</span>
                      <span className="text-emerald-600 font-medium">-${Number(selectedInvoice.discount_amount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold pt-3 border-t border-gray-200">
                    <span className="text-gray-900">Total</span>
                    <span className="text-gray-900">${Number(selectedInvoice.total_amount).toFixed(2)}</span>
                  </div>
                  {Number(selectedInvoice.balance_due) > 0 && selectedInvoice.status !== 'paid' && (
                    <div className="flex justify-between text-sm pt-1">
                      <span className="text-amber-600 font-semibold">Balance Due</span>
                      <span className="text-amber-600 font-bold">${Number(selectedInvoice.balance_due).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {selectedInvoice.notes && (
                  <div className="mt-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
                    <p className="text-xs text-gray-500 font-semibold mb-1 uppercase tracking-wider">Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{selectedInvoice.notes}</p>
                  </div>
                )}

                {/* Payment History */}
                {(selectedInvoice.payments || []).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Payment History</p>
                    <div className="bg-white rounded-xl border border-slate-200/60 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-100">
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Method</th>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ref #</th>
                            <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedInvoice.payments as Payment[]).map((pmt) => (
                            <tr key={pmt.id} className="border-b border-slate-50 last:border-0">
                              <td className="px-4 py-3 text-gray-700">{pmt.payment_date}</td>
                              <td className="px-4 py-3 text-gray-700 capitalize">{pmt.payment_method}</td>
                              <td className="px-4 py-3 text-gray-500">{pmt.reference_number || '—'}</td>
                              <td className="px-4 py-3 text-right text-emerald-700 font-semibold">
                                ${Number(pmt.amount).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Record Payment Modal */}
        {showPaymentModal && selectedInvoice && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl">
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Record Payment</h3>
                    <p className="text-sm text-gray-500">{selectedInvoice.invoice_number} — Balance: ${Number(selectedInvoice.balance_due).toFixed(2)}</p>
                  </div>
                  <button
                    onClick={() => { setShowPaymentModal(false); setPaymentSuccess(null); }}
                    className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>

                {paymentSuccess ? (
                  <div className="flex flex-col items-center py-6 gap-3">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                    <p className="text-gray-900 font-semibold text-center">{paymentSuccess}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Amount <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={Number(selectedInvoice.balance_due)}
                        value={paymentForm.amount}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                        className="w-full text-gray-900 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Payment Method <span className="text-red-500">*</span></label>
                      <select
                        value={paymentForm.payment_method}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_method: e.target.value as 'check' | 'cash' | 'card' | 'ach' | 'wire' | 'other' }))}
                        className="w-full text-gray-900 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all cursor-pointer"
                      >
                        <option value="cash">Cash</option>
                        <option value="check">Check</option>
                        <option value="card">Card</option>
                        <option value="ach">ACH</option>
                        <option value="wire">Wire</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Payment Date <span className="text-red-500">*</span></label>
                      <input
                        type="date"
                        value={paymentForm.payment_date}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                        className="w-full text-gray-900 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Reference # <span className="text-gray-400 font-normal">(optional)</span></label>
                      <input
                        type="text"
                        value={paymentForm.reference_number}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, reference_number: e.target.value }))}
                        className="w-full text-gray-900 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
                        placeholder="Check #, transaction ID, etc."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                      <textarea
                        value={paymentForm.notes}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                        rows={2}
                        className="w-full text-gray-900 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all resize-none"
                        placeholder="Optional notes..."
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => { setShowPaymentModal(false); setPaymentSuccess(null); }}
                        className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={submitPayment}
                        disabled={submittingPayment || !paymentForm.amount || Number(paymentForm.amount) <= 0}
                        className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                      >
                        {submittingPayment ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <DollarSign className="w-4 h-4" />
                        )}
                        Record Payment
                      </button>
                    </div>
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
              fetchData();
            }}
          />
        )}
      </div>
    </div>
  );
}
