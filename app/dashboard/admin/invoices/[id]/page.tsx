'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import {
  ArrowLeft,
  FileText,
  DollarSign,
  CreditCard,
  Calendar,
  Plus,
  Printer,
  Send,
  X,
  AlertCircle,
  CheckCircle,
  Clock,
  Hash,
  Mail,
  MapPin,
  Receipt,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_id: string | null;
  customer_email: string | null;
  billing_address: string | null;
  invoice_date: string;
  due_date: string;
  payment_terms: number;
  po_number: string | null;
  contract_number: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  discount_description: string | null;
  total_amount: number;
  amount_paid: number;
  status: string;
  notes: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface LineItem {
  id: string;
  invoice_id: string;
  line_number: number;
  description: string;
  billing_type: string;
  quantity: number;
  unit: string;
  unit_rate: number;
  amount: number;
  job_order_id: string | null;
  operator_id: string | null;
  taxable: boolean;
}

interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  sent: 'bg-blue-100 text-blue-700 border-blue-300',
  partial: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  paid: 'bg-green-100 text-green-700 border-green-300',
  overdue: 'bg-red-100 text-red-700 border-red-300',
  void: 'bg-gray-200 text-gray-500 border-gray-400',
};

const PAYMENT_METHOD_ICONS: Record<string, string> = {
  check: '\u{1F4DD}',
  ach: '\u{1F3E6}',
  wire: '\u{1F4B8}',
  credit_card: '\u{1F4B3}',
  cash: '\u{1F4B5}',
  other: '\u{1F4B0}',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  check: 'Check',
  ach: 'ACH',
  wire: 'Wire Transfer',
  credit_card: 'Credit Card',
  cash: 'Cash',
  other: 'Other',
};

function formatMoney(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num == null || isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('check');
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // ── Auth check ────────────────────────────────────────────────────────────

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    setCurrentUser(user);
  }, [router]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadInvoice = useCallback(async () => {
    try {
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .single();

      if (invoiceError || !invoiceData) {
        setError('Invoice not found');
        setLoading(false);
        return;
      }

      setInvoice(invoiceData);

      const { data: lineItemsData } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', id)
        .order('line_number');

      setLineItems(lineItemsData || []);
    } catch (err) {
      console.error('Error loading invoice:', err);
      setError('Failed to load invoice');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadPayments = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/invoices/${id}/payments`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setPayments(json.data || []);
      }
    } catch (err) {
      console.error('Error loading payments:', err);
    }
  }, [id]);

  useEffect(() => {
    if (currentUser) {
      loadInvoice();
      loadPayments();
    }
  }, [currentUser, loadInvoice, loadPayments]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleRecordPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) return;

    setSubmittingPayment(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/invoices/${id}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: parseFloat(paymentAmount),
          payment_method: paymentMethod,
          payment_date: paymentDate,
          reference_number: paymentReference || undefined,
          notes: paymentNotes || undefined,
        }),
      });

      if (res.ok) {
        // Refresh data
        await Promise.all([loadInvoice(), loadPayments()]);
        // Reset form
        setShowPaymentModal(false);
        setPaymentAmount('');
        setPaymentMethod('check');
        setPaymentDate(new Date().toISOString().split('T')[0]);
        setPaymentReference('');
        setPaymentNotes('');
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to record payment');
      }
    } catch (err) {
      console.error('Error recording payment:', err);
      alert('Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleMarkAsSent = async () => {
    if (!invoice || invoice.status !== 'draft') return;

    setMarkingSent(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_by: session?.user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) {
        alert('Failed to update invoice status');
      } else {
        await loadInvoice();
      }
    } catch (err) {
      console.error('Error marking invoice as sent:', err);
      alert('Failed to update invoice status');
    } finally {
      setMarkingSent(false);
    }
  };

  // ── Computed values ───────────────────────────────────────────────────────

  const balanceDue = invoice
    ? parseFloat(String(invoice.total_amount)) -
      parseFloat(String(invoice.amount_paid))
    : 0;

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading invoice...</p>
        </div>
      </div>
    );
  }

  // ── Error / Not found ─────────────────────────────────────────────────────

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {error || 'Invoice Not Found'}
          </h2>
          <Link
            href="/dashboard/admin/invoices"
            className="text-blue-600 hover:underline"
          >
            Back to Invoices
          </Link>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* ── Sticky Header ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin/invoices"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-6 h-6 text-gray-700" />
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {invoice.invoice_number}
                  </h1>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${
                      STATUS_STYLES[invoice.status] || STATUS_STYLES.draft
                    }`}
                  >
                    {invoice.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">
                  {invoice.customer_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {invoice.status === 'draft' && (
                <button
                  onClick={handleMarkAsSent}
                  disabled={markingSent}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {markingSent ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Mark as Sent
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold flex items-center gap-2 hover:bg-gray-50 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print / PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* ── Invoice Info Grid ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Invoice Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                Invoice Date
              </label>
              <p className="text-gray-900 font-semibold flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                {formatDate(invoice.invoice_date)}
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                Due Date
              </label>
              <p className="text-gray-900 font-semibold flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-gray-400" />
                {formatDate(invoice.due_date)}
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                Payment Terms
              </label>
              <p className="text-gray-900 font-semibold">
                Net {invoice.payment_terms} days
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                Customer
              </label>
              <p className="text-gray-900 font-semibold">
                {invoice.customer_name}
              </p>
            </div>

            {invoice.customer_email && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  Customer Email
                </label>
                <p className="text-gray-900 font-semibold flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-gray-400" />
                  {invoice.customer_email}
                </p>
              </div>
            )}
            {invoice.billing_address && (
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  Billing Address
                </label>
                <p className="text-gray-900 font-semibold flex items-start gap-1.5">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  {invoice.billing_address}
                </p>
              </div>
            )}
            {invoice.po_number && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  PO Number
                </label>
                <p className="text-gray-900 font-semibold flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-gray-400" />
                  {invoice.po_number}
                </p>
              </div>
            )}
            {invoice.contract_number && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  Contract Number
                </label>
                <p className="text-gray-900 font-semibold flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-gray-400" />
                  {invoice.contract_number}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Line Items Table ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-600" />
              Line Items
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Billing Type
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                    Qty
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Unit
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                    Unit Rate
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lineItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      No line items found
                    </td>
                  </tr>
                ) : (
                  lineItems.map((item) => {
                    const computedAmount =
                      item.amount ??
                      parseFloat(String(item.quantity)) *
                        parseFloat(String(item.unit_rate));
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {item.line_number}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                          {item.description}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                          {item.billing_type?.replace(/_/g, ' ')}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 text-right">
                          {parseFloat(String(item.quantity)).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {item.unit}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 text-right">
                          {formatMoney(item.unit_rate)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-semibold text-right">
                          {formatMoney(computedAmount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Totals footer */}
          <div className="border-t-2 border-gray-200 bg-gray-50/50 px-6 py-4">
            <div className="flex flex-col items-end space-y-2">
              <div className="flex items-center justify-between w-64">
                <span className="text-sm text-gray-600">Subtotal</span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatMoney(invoice.subtotal)}
                </span>
              </div>
              {parseFloat(String(invoice.tax_amount)) > 0 && (
                <div className="flex items-center justify-between w-64">
                  <span className="text-sm text-gray-600">
                    Tax ({((parseFloat(String(invoice.tax_rate)) || 0) * 100).toFixed(1)}%)
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatMoney(invoice.tax_amount)}
                  </span>
                </div>
              )}
              {parseFloat(String(invoice.discount_amount)) > 0 && (
                <div className="flex items-center justify-between w-64">
                  <span className="text-sm text-gray-600">
                    Discount
                    {invoice.discount_description
                      ? ` (${invoice.discount_description})`
                      : ''}
                  </span>
                  <span className="text-sm font-semibold text-red-600">
                    -{formatMoney(invoice.discount_amount)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between w-64 pt-2 border-t border-gray-300">
                <span className="text-base font-bold text-gray-900">Total</span>
                <span className="text-base font-bold text-gray-900">
                  {formatMoney(invoice.total_amount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Payments Section ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-green-600" />
              Payments
            </h2>
            {invoice.status !== 'void' && invoice.status !== 'paid' && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Record Payment
              </button>
            )}
          </div>

          {/* Payment summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <p className="text-xs font-bold text-blue-600 uppercase mb-1">
                Total Amount
              </p>
              <p className="text-2xl font-bold text-blue-700">
                {formatMoney(invoice.total_amount)}
              </p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 border border-green-200">
              <p className="text-xs font-bold text-green-600 uppercase mb-1">
                Amount Paid
              </p>
              <p className="text-2xl font-bold text-green-700">
                {formatMoney(invoice.amount_paid)}
              </p>
            </div>
            <div
              className={`rounded-xl p-4 border ${
                balanceDue > 0
                  ? 'bg-red-50 border-red-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <p
                className={`text-xs font-bold uppercase mb-1 ${
                  balanceDue > 0 ? 'text-red-600' : 'text-gray-600'
                }`}
              >
                Balance Due
              </p>
              <p
                className={`text-2xl font-bold ${
                  balanceDue > 0 ? 'text-red-700' : 'text-gray-700'
                }`}
              >
                {formatMoney(balanceDue)}
              </p>
            </div>
          </div>

          {/* Payment history table */}
          {payments.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Method
                    </th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {formatDate(payment.payment_date)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-semibold text-right">
                        {formatMoney(payment.amount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <span className="inline-flex items-center gap-1.5">
                          <span>
                            {PAYMENT_METHOD_ICONS[payment.payment_method] ||
                              PAYMENT_METHOD_ICONS.other}
                          </span>
                          {PAYMENT_METHOD_LABELS[payment.payment_method] ||
                            payment.payment_method}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {payment.reference_number || '--'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase border ${
                            payment.status === 'completed' || !payment.status
                              ? 'bg-green-100 text-green-700 border-green-300'
                              : payment.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                              : payment.status === 'failed'
                              ? 'bg-red-100 text-red-700 border-red-300'
                              : 'bg-gray-100 text-gray-700 border-gray-300'
                          }`}
                        >
                          {payment.status || 'completed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <DollarSign className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="font-medium">No payments recorded yet</p>
            </div>
          )}
        </div>

        {/* ── Notes ─────────────────────────────────────────────────────────── */}
        {(invoice.notes || invoice.internal_notes) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {invoice.notes && (
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Invoice Notes
                </h2>
                <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
                  {invoice.notes}
                </p>
              </div>
            )}
            {invoice.internal_notes && (
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-yellow-200 bg-yellow-50/30">
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  Internal Notes
                </h2>
                <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
                  {invoice.internal_notes}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Record Payment Modal ─────────────────────────────────────────────── */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                Record Payment
              </h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Amount */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Amount ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={formatMoney(balanceDue)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-0 outline-none text-lg font-semibold text-gray-900"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Balance due: {formatMoney(balanceDue)}
                </p>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-0 outline-none bg-white"
                >
                  <option value="check">Check</option>
                  <option value="ach">ACH</option>
                  <option value="wire">Wire Transfer</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Payment Date *
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-0 outline-none text-gray-900"
                />
              </div>

              {/* Reference Number */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Check #, Confirmation #, etc."
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-0 outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional payment notes..."
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-0 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowPaymentModal(false)}
                disabled={submittingPayment}
                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={
                  submittingPayment ||
                  !paymentAmount ||
                  parseFloat(paymentAmount) <= 0
                }
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingPayment ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Recording...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Record Payment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
