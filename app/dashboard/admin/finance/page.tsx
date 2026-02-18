'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import {
  DollarSign,
  TrendingUp,
  Clock,
  FileText,
  CreditCard,
  ArrowLeft,
  AlertTriangle,
  Users,
  Plus,
  Settings,
  RefreshCw,
  Calendar,
  ChevronRight,
  Receipt,
  BadgeDollarSign,
  BarChart3,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FinanceMetrics {
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
  [key: string]: number;
}

interface ArAging {
  current: number;
  '1_30_days': number;
  '31_60_days': number;
  '61_90_days': number;
  over_90_days: number;
  total: number;
}

interface PayPeriod {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  operator_count?: number;
  gross_pay_total?: number;
  [key: string]: unknown;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';
  invoice_date: string;
}

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  invoice_number?: string;
}

interface DashboardData {
  metrics: FinanceMetrics;
  arAging: ArAging;
  currentPayPeriod: PayPeriod | null;
  recentInvoices: Invoice[];
  recentPayments: Payment[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string; strikethrough?: boolean }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Draft' },
  sent: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Sent' },
  partial: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Partial' },
  paid: { bg: 'bg-green-100', text: 'text-green-700', label: 'Paid' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', label: 'Overdue' },
  void: { bg: 'bg-gray-100', text: 'text-gray-400', label: 'Void', strikethrough: true },
};

const PAY_PERIOD_STATUS: Record<string, { bg: string; text: string; dot: string }> = {
  open: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  processing: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  closed: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  draft: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FinanceDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Auth & data fetch ──────────────────────────────────────────────────

  const fetchDashboard = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const res = await fetch('/api/admin/finance/dashboard', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }

      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to load financial data');
      }

      setData(result.data);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Finance dashboard error:', message);
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    fetchDashboard();
  }, [fetchDashboard, router]);

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading financial data...</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to Load Dashboard</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => { setLoading(true); setError(null); fetchDashboard(); }}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────

  const metrics = data?.metrics ?? { total_invoiced: 0, total_collected: 0, total_outstanding: 0 };
  const aging = data?.arAging ?? { current: 0, '1_30_days': 0, '31_60_days': 0, '61_90_days': 0, over_90_days: 0, total: 0 };
  const payPeriod = data?.currentPayPeriod ?? null;
  const invoices = data?.recentInvoices ?? [];
  const payments = data?.recentPayments ?? [];

  const agingTotal = aging.total || 1; // avoid division by zero
  const agingBuckets = [
    { label: 'Current', amount: aging.current, color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50' },
    { label: '1-30 Days', amount: aging['1_30_days'], color: 'bg-yellow-400', textColor: 'text-yellow-700', bgLight: 'bg-yellow-50' },
    { label: '31-60 Days', amount: aging['31_60_days'], color: 'bg-orange-400', textColor: 'text-orange-700', bgLight: 'bg-orange-50' },
    { label: '61-90 Days', amount: aging['61_90_days'], color: 'bg-orange-600', textColor: 'text-orange-800', bgLight: 'bg-orange-50' },
    { label: '90+ Days', amount: aging.over_90_days, color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50' },
  ];

  const ppStatus = payPeriod ? (PAY_PERIOD_STATUS[payPeriod.status] ?? PAY_PERIOD_STATUS.draft) : null;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b-2 border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Financial Dashboard</h1>
                <p className="text-sm text-gray-500">Revenue, invoicing &amp; payroll overview</p>
              </div>
            </div>

            <button
              onClick={() => fetchDashboard(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* ── Error banner (non-blocking) ──────────────────────────────── */}
        {error && data && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* ── KPI Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Invoiced */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-gray-900 truncate">{formatMoney(metrics.total_invoiced)}</p>
                <p className="text-sm text-gray-500 font-medium">Total Invoiced</p>
              </div>
            </div>
          </div>

          {/* Total Collected */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-gray-900 truncate">{formatMoney(metrics.total_collected)}</p>
                <p className="text-sm text-gray-500 font-medium">Total Collected</p>
              </div>
            </div>
          </div>

          {/* Outstanding */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-gray-900 truncate">{formatMoney(metrics.total_outstanding)}</p>
                <p className="text-sm text-gray-500 font-medium">Outstanding</p>
              </div>
            </div>
          </div>

          {/* Current Pay Period */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <div className="min-w-0">
                {payPeriod ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${ppStatus?.bg} ${ppStatus?.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${ppStatus?.dot}`} />
                        {payPeriod.status.charAt(0).toUpperCase() + payPeriod.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 font-medium mt-1">
                      {formatDateShort(payPeriod.period_start)} &ndash; {formatDateShort(payPeriod.period_end)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-gray-400">No Active Period</p>
                    <p className="text-sm text-gray-400 font-medium">Pay period not set</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── AR Aging ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Accounts Receivable Aging</h2>
                <p className="text-sm text-gray-500">Outstanding balance breakdown</p>
              </div>
            </div>
            <p className="text-lg font-bold text-gray-900">{formatMoney(aging.total)}</p>
          </div>

          {/* Bar */}
          <div className="h-6 rounded-full overflow-hidden flex bg-gray-100 mb-4">
            {agingBuckets.map((bucket) => {
              const pct = aging.total > 0 ? (bucket.amount / agingTotal) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={bucket.label}
                  className={`${bucket.color} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                  title={`${bucket.label}: ${formatMoney(bucket.amount)} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {agingBuckets.map((bucket) => (
              <div key={bucket.label} className={`${bucket.bgLight} rounded-xl p-3 text-center`}>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className={`w-3 h-3 rounded-full ${bucket.color}`} />
                  <span className={`text-xs font-semibold ${bucket.textColor}`}>{bucket.label}</span>
                </div>
                <p className="text-sm font-bold text-gray-900">{formatMoney(bucket.amount)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Quick Actions ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            href="/dashboard/admin/invoices/new"
            className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-md border border-gray-100 hover:border-blue-300 hover:shadow-lg transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              <Plus className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">Create Invoice</p>
              <p className="text-xs text-gray-400">New billing</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-blue-500 transition-colors" />
          </Link>

          <Link
            href="/dashboard/admin/payroll"
            className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-md border border-gray-100 hover:border-green-300 hover:shadow-lg transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
              <BadgeDollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 group-hover:text-green-700 transition-colors">Run Payroll</p>
              <p className="text-xs text-gray-400">Process pay</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-green-500 transition-colors" />
          </Link>

          <Link
            href="/dashboard/admin/customers"
            className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-md border border-gray-100 hover:border-purple-300 hover:shadow-lg transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 group-hover:text-purple-700 transition-colors">Customers</p>
              <p className="text-xs text-gray-400">View all</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-purple-500 transition-colors" />
          </Link>

          <Link
            href="/dashboard/admin/payroll/settings"
            className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-md border border-gray-100 hover:border-orange-300 hover:shadow-lg transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
              <Settings className="w-5 h-5 text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 group-hover:text-orange-700 transition-colors">Payroll Settings</p>
              <p className="text-xs text-gray-400">Configure</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-orange-500 transition-colors" />
          </Link>
        </div>

        {/* ── Two-column: Invoices & Payments ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Invoices */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">Recent Invoices</h2>
              </div>
              <Link
                href="/dashboard/admin/invoices"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View All <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {invoices.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No invoices yet</p>
                <p className="text-sm text-gray-400">Create your first invoice to get started</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {invoices.map((inv) => {
                  const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.draft;
                  return (
                    <div
                      key={inv.id}
                      className="px-6 py-4 hover:bg-gray-50 transition-colors flex items-center gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`text-sm font-semibold text-gray-900 ${badge.strikethrough ? 'line-through' : ''}`}>
                            {inv.invoice_number}
                          </p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 truncate">{inv.customer_name}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-bold text-gray-900 ${badge.strikethrough ? 'line-through text-gray-400' : ''}`}>
                          {formatMoney(inv.total_amount)}
                        </p>
                        <p className="text-xs text-gray-400">{formatDate(inv.invoice_date)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Payments */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-green-600" />
                <h2 className="text-lg font-bold text-gray-900">Recent Payments</h2>
              </div>
              <Link
                href="/dashboard/admin/payments"
                className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
              >
                View All <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {payments.length === 0 ? (
              <div className="p-8 text-center">
                <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No payments recorded</p>
                <p className="text-sm text-gray-400">Payments will appear here once received</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {payments.map((pmt) => (
                  <div
                    key={pmt.id}
                    className="px-6 py-4 hover:bg-gray-50 transition-colors flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <DollarSign className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{formatMoney(pmt.amount)}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {pmt.payment_method}
                        {pmt.invoice_number ? ` \u00B7 ${pmt.invoice_number}` : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-400">{formatDate(pmt.payment_date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Current Pay Period ───────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Receipt className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-bold text-gray-900">Current Pay Period</h2>
            </div>
            <Link
              href="/dashboard/admin/payroll"
              className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
            >
              Payroll <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {!payPeriod ? (
            <div className="p-8 text-center">
              <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No active pay period</p>
              <p className="text-sm text-gray-400 mb-4">Start a new pay period to begin tracking payroll</p>
              <Link
                href="/dashboard/admin/payroll"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors shadow-md font-medium text-sm"
              >
                <Plus className="w-4 h-4" />
                Open Payroll
              </Link>
            </div>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Period Dates */}
                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-1">Period</p>
                  <p className="text-sm font-bold text-gray-900">
                    {formatDate(payPeriod.period_start)} &ndash; {formatDate(payPeriod.period_end)}
                  </p>
                </div>

                {/* Status */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Status</p>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${ppStatus?.bg} ${ppStatus?.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${ppStatus?.dot}`} />
                    {payPeriod.status.charAt(0).toUpperCase() + payPeriod.status.slice(1)}
                  </span>
                </div>

                {/* Operator Count */}
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Operators</p>
                  <p className="text-sm font-bold text-gray-900">
                    {payPeriod.operator_count != null ? payPeriod.operator_count : '\u2014'}
                  </p>
                </div>

                {/* Gross Pay */}
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-1">Gross Pay</p>
                  <p className="text-sm font-bold text-gray-900">
                    {payPeriod.gross_pay_total != null ? formatMoney(payPeriod.gross_pay_total) : '\u2014'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
