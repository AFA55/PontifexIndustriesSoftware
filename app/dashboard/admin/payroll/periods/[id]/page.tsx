'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Users,
  CheckCircle,
  Lock,
  Play,
  CreditCard,
  AlertTriangle,
  AlertCircle,
  Calendar,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PayPeriod {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string | null;
  status: string;
  operator_count: number | null;
  total_regular_hours: number | null;
  total_overtime_hours: number | null;
  total_double_time_hours: number | null;
  total_gross_pay: number | null;
  total_adjustments: number | null;
  total_deductions: number | null;
  total_net_pay: number | null;
  locked_at: string | null;
  locked_by: string | null;
  processed_at: string | null;
  processed_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface OperatorProfile {
  id: string;
  full_name: string;
  email: string;
}

interface PayPeriodEntry {
  id: string;
  pay_period_id: string;
  operator_id: string;
  regular_hours: number;
  overtime_hours: number;
  double_time_hours: number;
  regular_rate: number;
  overtime_rate: number;
  double_time_rate: number;
  regular_pay: number;
  overtime_pay: number;
  gross_pay: number;
  total_additions: number;
  total_deductions: number;
  net_pay: number;
  jobs_worked: number;
  status: string;
  created_at: string;
  updated_at: string;
  profiles: OperatorProfile | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(amount: number | null | undefined): string {
  if (amount == null) return '$0.00';
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatHours(hours: number | null | undefined): string {
  if (hours == null) return '0.00';
  return Number(hours).toFixed(2);
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'open':
      return 'bg-blue-100 text-blue-700';
    case 'locked':
      return 'bg-yellow-100 text-yellow-700';
    case 'processing':
      return 'bg-purple-100 text-purple-700';
    case 'approved':
      return 'bg-green-100 text-green-700';
    case 'paid':
      return 'bg-emerald-100 text-emerald-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function getEntryStatusColor(status: string): string {
  switch (status) {
    case 'draft':
      return 'bg-gray-100 text-gray-700';
    case 'reviewed':
      return 'bg-blue-100 text-blue-700';
    case 'approved':
      return 'bg-green-100 text-green-700';
    case 'paid':
      return 'bg-emerald-100 text-emerald-700';
    case 'void':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PayPeriodDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PayPeriod | null>(null);
  const [entries, setEntries] = useState<PayPeriodEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal states
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [processingPayroll, setProcessingPayroll] = useState(false);

  // ---------- Auth + Data ----------

  const checkAuth = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return false;
      }

      const userStr = localStorage.getItem('supabase-user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.role !== 'admin') {
          router.push('/dashboard');
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('Auth check failed:', err);
      router.push('/login');
      return false;
    }
  }, [router]);

  const loadPeriodData = useCallback(async () => {
    try {
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/payroll/periods/${id}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load pay period (${res.status})`);
      }

      const json = await res.json();
      setPeriod(json.data.period);
      setEntries(json.data.entries || []);
    } catch (err: any) {
      console.error('Error loading pay period:', err);
      setError(err.message || 'Failed to load pay period');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const init = async () => {
      const authorized = await checkAuth();
      if (authorized) {
        await loadPeriodData();
      }
    };
    init();
  }, [checkAuth, loadPeriodData]);

  // ---------- Actions ----------

  const handleStatusTransition = async (newStatus: string) => {
    setPendingStatus(newStatus);
    setShowStatusModal(true);
  };

  const confirmStatusTransition = async () => {
    if (!pendingStatus) return;

    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    setShowStatusModal(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/payroll/periods/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status: pendingStatus }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to update status (${res.status})`);
      }

      setActionSuccess(`Period status updated to "${pendingStatus}" successfully.`);
      await loadPeriodData();
    } catch (err: any) {
      console.error('Status transition error:', err);
      setActionError(err.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
      setPendingStatus(null);
    }
  };

  const handleProcessPayroll = () => {
    setShowProcessModal(true);
  };

  const confirmProcessPayroll = async () => {
    setProcessingPayroll(true);
    setActionError(null);
    setActionSuccess(null);
    setShowProcessModal(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/payroll/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ pay_period_id: id }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to process payroll (${res.status})`);
      }

      const json = await res.json();
      const operatorCount = json.data?.operator_count || 0;
      setActionSuccess(
        `Payroll processed successfully for ${operatorCount} operator${operatorCount !== 1 ? 's' : ''}.`
      );
      await loadPeriodData();
    } catch (err: any) {
      console.error('Process payroll error:', err);
      setActionError(err.message || 'Failed to process payroll');
    } finally {
      setProcessingPayroll(false);
    }
  };

  // ---------- Status transition labels ----------

  const getStatusTransitionInfo = (status: string): {
    label: string;
    description: string;
  } | null => {
    switch (status) {
      case 'locked':
        return {
          label: 'Lock Period',
          description:
            'Locking this period will prevent any new timecard entries from being added. Existing entries can still be reviewed. This is typically done before processing payroll.',
        };
      case 'processing':
        return {
          label: 'Begin Processing',
          description:
            'This marks the pay period as currently being processed. Review all entries before moving to this stage.',
        };
      case 'approved':
        return {
          label: 'Approve Payroll',
          description:
            'Approving payroll will mark all operator entries as approved. This confirms that all hours, rates, and deductions have been reviewed and are correct.',
        };
      case 'paid':
        return {
          label: 'Mark as Paid',
          description:
            'This marks the entire pay period and all entries as paid. Only do this after payments have been issued to all operators.',
        };
      default:
        return null;
    }
  };

  // ---------- Render ----------

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading pay period...</p>
        </div>
      </div>
    );
  }

  if (error || !period) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {error || 'Pay Period Not Found'}
          </h2>
          <Link
            href="/dashboard/admin/payroll/periods"
            className="text-blue-600 hover:underline font-medium"
          >
            Back to Pay Periods
          </Link>
        </div>
      </div>
    );
  }

  const periodLabel = `${formatDate(period.period_start)} - ${formatDate(period.period_end)}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* ---- Sticky Header ---- */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin/payroll/periods"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Pay Period Detail</h1>
                <p className="text-sm text-gray-600">{periodLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`px-4 py-2 rounded-lg text-sm font-bold capitalize ${getStatusColor(period.status)}`}
              >
                {period.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* ---- Feedback Banners ---- */}
        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-red-700 font-medium">{actionError}</p>
            <button
              onClick={() => setActionError(null)}
              className="ml-auto text-red-400 hover:text-red-600 text-lg font-bold"
            >
              x
            </button>
          </div>
        )}

        {actionSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-green-700 font-medium">{actionSuccess}</p>
            <button
              onClick={() => setActionSuccess(null)}
              className="ml-auto text-green-400 hover:text-green-600 text-lg font-bold"
            >
              x
            </button>
          </div>
        )}

        {/* ---- Period Info Header ---- */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Period Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 font-medium">Start Date</span>
                  <p className="text-gray-900 font-semibold">{formatDate(period.period_start)}</p>
                </div>
                <div>
                  <span className="text-gray-500 font-medium">End Date</span>
                  <p className="text-gray-900 font-semibold">{formatDate(period.period_end)}</p>
                </div>
                <div>
                  <span className="text-gray-500 font-medium">Pay Date</span>
                  <p className="text-gray-900 font-semibold">
                    {period.pay_date ? formatDate(period.pay_date) : 'Not set'}
                  </p>
                </div>
              </div>
              {period.notes && (
                <div className="mt-2">
                  <span className="text-gray-500 font-medium text-sm">Notes</span>
                  <p className="text-gray-700 text-sm">{period.notes}</p>
                </div>
              )}
            </div>
            <div className="text-right space-y-1 text-xs text-gray-500">
              {period.locked_at && (
                <p>Locked: {new Date(period.locked_at).toLocaleString()}</p>
              )}
              {period.processed_at && (
                <p>Processed: {new Date(period.processed_at).toLocaleString()}</p>
              )}
              {period.approved_at && (
                <p>Approved: {new Date(period.approved_at).toLocaleString()}</p>
              )}
              {period.paid_at && (
                <p>Paid: {new Date(period.paid_at).toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>

        {/* ---- Summary Cards ---- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-6 h-6 text-blue-600" />
              <span className="text-sm font-semibold text-gray-600">Total Regular Hours</span>
            </div>
            <p className="text-3xl font-bold text-blue-600">
              {formatHours(period.total_regular_hours)}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-6 h-6 text-orange-600" />
              <span className="text-sm font-semibold text-gray-600">Total OT Hours</span>
            </div>
            <p className="text-3xl font-bold text-orange-600">
              {formatHours(period.total_overtime_hours)}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-6 h-6 text-green-600" />
              <span className="text-sm font-semibold text-gray-600">Total Gross Pay</span>
            </div>
            <p className="text-3xl font-bold text-green-600">
              {formatMoney(period.total_gross_pay)}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-6 h-6 text-emerald-600" />
              <span className="text-sm font-semibold text-gray-600">Total Net Pay</span>
            </div>
            <p className="text-3xl font-bold text-emerald-600">
              {formatMoney(period.total_net_pay)}
            </p>
          </div>
        </div>

        {/* ---- Action Buttons ---- */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-purple-600" />
            Actions
          </h2>

          {period.status === 'paid' ? (
            <div className="flex items-center gap-3 py-3 px-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
              <span className="text-emerald-700 font-bold text-lg">Payroll Complete</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {/* Process Payroll: available when open */}
              {period.status === 'open' && (
                <>
                  <button
                    onClick={handleProcessPayroll}
                    disabled={actionLoading || processingPayroll}
                    className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors shadow-md font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingPayroll ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-5 h-5" />
                        Process Payroll
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleStatusTransition('locked')}
                    disabled={actionLoading || processingPayroll}
                    className="flex items-center gap-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl transition-colors shadow-md font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Lock className="w-5 h-5" />
                    Lock Period
                  </button>
                </>
              )}

              {/* Begin Processing: available when locked */}
              {period.status === 'locked' && (
                <button
                  onClick={() => handleStatusTransition('processing')}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors shadow-md font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Begin Processing
                    </>
                  )}
                </button>
              )}

              {/* Approve Payroll: available when processing */}
              {period.status === 'processing' && (
                <button
                  onClick={() => handleStatusTransition('approved')}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors shadow-md font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Approve Payroll
                    </>
                  )}
                </button>
              )}

              {/* Mark as Paid: available when approved */}
              {period.status === 'approved' && (
                <button
                  onClick={() => handleStatusTransition('paid')}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors shadow-md font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Mark as Paid
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ---- Operator Entries Table ---- */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Operator Entries
              {entries.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({entries.length} operator{entries.length !== 1 ? 's' : ''})
                </span>
              )}
            </h2>
          </div>

          {entries.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-700 mb-2">No Entries Yet</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                {period.status === 'open'
                  ? 'Click "Process Payroll" to calculate hours and pay for all operators with timecards in this period.'
                  : 'No operator entries found for this pay period.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Operator
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Reg Hrs
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      OT Hrs
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Reg Rate
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      OT Rate
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Gross Pay
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Deductions
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Net Pay
                    </th>
                    <th className="text-center px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((entry) => {
                    const operatorName =
                      entry.profiles?.full_name || 'Unknown Operator';
                    const operatorEmail = entry.profiles?.email || '-';
                    const deductions = entry.total_deductions ?? 0;

                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-semibold text-gray-900">
                            {operatorName}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {operatorEmail}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          {formatHours(entry.regular_hours)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          {formatHours(entry.overtime_hours)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-700">
                          {formatMoney(entry.regular_rate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-700">
                          {formatMoney(entry.overtime_rate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-green-700">
                          {formatMoney(entry.gross_pay)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-red-600">
                          {deductions > 0 ? `-${formatMoney(deductions)}` : formatMoney(0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-emerald-700">
                          {formatMoney(entry.net_pay)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-bold capitalize ${getEntryStatusColor(entry.status)}`}
                          >
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Table footer with totals */}
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td className="px-6 py-4 font-bold text-gray-900" colSpan={2}>
                      Totals ({entries.length} operator{entries.length !== 1 ? 's' : ''})
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                      {formatHours(
                        entries.reduce((sum, e) => sum + (e.regular_hours || 0), 0)
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                      {formatHours(
                        entries.reduce((sum, e) => sum + (e.overtime_hours || 0), 0)
                      )}
                    </td>
                    <td className="px-6 py-4" colSpan={2} />
                    <td className="px-6 py-4 text-right font-bold text-green-700">
                      {formatMoney(
                        entries.reduce((sum, e) => sum + (e.gross_pay || 0), 0)
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-red-600">
                      {(() => {
                        const totalDeductions = entries.reduce((sum, e) => sum + (e.total_deductions ?? 0), 0);
                        return totalDeductions > 0
                          ? `-${formatMoney(totalDeductions)}`
                          : formatMoney(0);
                      })()}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-700">
                      {formatMoney(
                        entries.reduce((sum, e) => sum + (e.net_pay || 0), 0)
                      )}
                    </td>
                    <td className="px-6 py-4" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ---- Process Payroll Confirmation Modal ---- */}
      {showProcessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Process Payroll</h3>
            </div>

            <div className="space-y-3 mb-6">
              <p className="text-gray-600">
                This will calculate payroll for the period{' '}
                <strong>{periodLabel}</strong>. The following will happen:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-2">
                <li>All active operators with timecards in this period will be included</li>
                <li>Regular and overtime hours will be calculated based on timecard data</li>
                <li>Pay rates will be applied from each operator&apos;s current rate configuration</li>
                <li>Existing entries for this period will be recalculated and updated</li>
                <li>The period status will change to &quot;processing&quot;</li>
              </ul>
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200">
                <strong>Note:</strong> This operation may take a moment depending on the number of operators and timecards.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowProcessModal(false)}
                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmProcessPayroll}
                className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Process Payroll
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Status Transition Confirmation Modal ---- */}
      {showStatusModal && pendingStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">
                {getStatusTransitionInfo(pendingStatus)?.label || 'Confirm Status Change'}
              </h3>
            </div>

            <p className="text-gray-600 mb-6">
              {getStatusTransitionInfo(pendingStatus)?.description ||
                `Are you sure you want to change the period status to "${pendingStatus}"?`}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowStatusModal(false);
                  setPendingStatus(null);
                }}
                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmStatusTransition}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Full-screen processing overlay ---- */}
      {processingPayroll && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-sm w-full mx-4">
            <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Processing Payroll</h3>
            <p className="text-gray-600 text-sm">
              Calculating hours and pay for all operators. This may take a moment...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
