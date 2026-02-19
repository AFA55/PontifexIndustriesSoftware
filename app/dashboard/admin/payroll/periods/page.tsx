'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Hash,
  Plus,
  X,
  Clock,
  CheckCircle,
  AlertCircle,
  Lock,
  CreditCard,
  XCircle,
  ChevronRight,
} from 'lucide-react';

interface PayPeriod {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string | null;
  status: string;
  operator_count: number;
  total_gross_pay: number;
  total_net_pay: number;
  created_at: string;
}

type StatusFilter = 'all' | 'open' | 'locked' | 'processing' | 'approved' | 'paid';

export default function PayPeriodsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    period_start: '',
    period_end: '',
    pay_date: '',
  });
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    setUser(currentUser);
    fetchPeriods();
  }, [router]);

  const fetchPeriods = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/admin/payroll/periods?limit=50', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setPeriods(result.data.periods);
        }
      }
    } catch (error) {
      console.error('Error fetching pay periods:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePeriod = async () => {
    if (!createForm.period_start || !createForm.period_end) {
      setCreateError('Period start and end dates are required');
      return;
    }

    if (new Date(createForm.period_start) >= new Date(createForm.period_end)) {
      setCreateError('Start date must be before end date');
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const body: Record<string, string> = {
        period_start: createForm.period_start,
        period_end: createForm.period_end,
      };

      if (createForm.pay_date) {
        body.pay_date = createForm.pay_date;
      }

      const response = await fetch('/api/admin/payroll/periods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setShowCreateModal(false);
        setCreateForm({ period_start: '', period_end: '', pay_date: '' });
        fetchPeriods();
      } else {
        setCreateError(result.error || 'Failed to create pay period');
      }
    } catch (error) {
      console.error('Error creating pay period:', error);
      setCreateError('An unexpected error occurred');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatMoney = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; icon: React.ReactNode }> = {
      open: {
        bg: 'bg-blue-100 text-blue-800',
        icon: <Clock size={12} />,
      },
      locked: {
        bg: 'bg-yellow-100 text-yellow-800',
        icon: <Lock size={12} />,
      },
      processing: {
        bg: 'bg-purple-100 text-purple-800',
        icon: <CreditCard size={12} />,
      },
      approved: {
        bg: 'bg-green-100 text-green-800',
        icon: <CheckCircle size={12} />,
      },
      paid: {
        bg: 'bg-emerald-100 text-emerald-800',
        icon: <CheckCircle size={12} />,
      },
      void: {
        bg: 'bg-gray-100 text-gray-800',
        icon: <XCircle size={12} />,
      },
    };

    const style = styles[status] || styles.void;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${style.bg}`}>
        {style.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  // Filter periods by status
  const filteredPeriods = statusFilter === 'all'
    ? periods
    : periods.filter((p) => p.status === statusFilter);

  // Summary calculations
  const openCount = periods.filter((p) => p.status === 'open').length;
  const totalGross = periods.reduce((sum, p) => sum + (p.total_gross_pay || 0), 0);

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'locked', label: 'Locked' },
    { key: 'processing', label: 'Processing' },
    { key: 'approved', label: 'Approved' },
    { key: 'paid', label: 'Paid' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading pay periods...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-white border-b-2 border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin/payroll"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md font-medium"
              >
                <ArrowLeft size={20} />
                <span>Back to Payroll</span>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Pay Periods</h1>
                <p className="text-sm text-gray-500">Manage payroll periods and track payments</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setCreateError(null);
                  setShowCreateModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors shadow-md font-medium"
              >
                <Plus size={18} />
                <span>Create Period</span>
              </button>
              <div className="bg-gray-100 px-4 py-2 rounded-xl">
                <p className="text-sm font-bold text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-700 capitalize font-medium">Admin</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-2">
              <Hash className="text-blue-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{periods.length}</p>
            <p className="text-sm text-gray-500">Total Periods</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center mb-2">
              <Clock className="text-yellow-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{openCount}</p>
            <p className="text-sm text-gray-500">Open Periods</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-2">
              <DollarSign className="text-green-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{formatMoney(totalGross)}</p>
            <p className="text-sm text-gray-500">Total Gross Pay</p>
          </div>
        </div>

        {/* Status Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {statusFilters.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                statusFilter === filter.key
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {filter.label}
              {filter.key !== 'all' && (
                <span className="ml-1.5 text-xs opacity-80">
                  ({periods.filter((p) => p.status === filter.key).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Periods Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Pay Periods</h2>
            <p className="text-sm text-gray-500 mt-1">
              {filteredPeriods.length} period{filteredPeriods.length !== 1 ? 's' : ''} found
            </p>
          </div>

          {filteredPeriods.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="w-20 h-20 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg font-medium">No pay periods found</p>
              <p className="text-gray-400 text-sm mt-1">
                {statusFilter !== 'all'
                  ? `No periods with status "${statusFilter}"`
                  : 'Create your first pay period to get started'}
              </p>
              {statusFilter === 'all' && (
                <button
                  onClick={() => {
                    setCreateError(null);
                    setShowCreateModal(true);
                  }}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-medium"
                >
                  <Plus size={18} />
                  Create Period
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">
                      Period Start
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">
                      Period End
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">
                      Operators
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">
                      Gross Pay
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">
                      Net Pay
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredPeriods.map((period) => (
                    <tr
                      key={period.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/dashboard/admin/payroll/periods/${period.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-gray-400" />
                          <span className="text-sm font-medium text-gray-800">
                            {formatDate(period.period_start)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">
                          {formatDate(period.period_end)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(period.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-800">
                          {period.operator_count || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-semibold text-gray-800">
                          {formatMoney(period.total_gross_pay || 0)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">
                          {formatMoney(period.total_net_pay || 0)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/admin/payroll/periods/${period.id}`);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          View
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Period Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Create Pay Period</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Define the start and end dates for the new pay period
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={24} className="text-gray-600" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {createError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                  <AlertCircle className="text-red-600 flex-shrink-0" size={16} />
                  <p className="text-red-800 text-sm font-medium">{createError}</p>
                </div>
              )}

              {/* Period Start */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Period Start <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={createForm.period_start}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, period_start: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              {/* Period End */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Period End <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={createForm.period_end}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, period_end: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              {/* Pay Date (optional) */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Pay Date <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  value={createForm.pay_date}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, pay_date: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePeriod}
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Create Period
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
