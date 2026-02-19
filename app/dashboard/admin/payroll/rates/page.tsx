'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, DollarSign, Plus, Users, Clock, ChevronDown, ChevronUp, X, TrendingUp } from 'lucide-react';

interface OperatorRate {
  operator_id: string;
  full_name: string;
  email: string;
  rate_type: 'hourly' | 'salary' | 'day_rate';
  regular_rate: number;
  overtime_rate: number;
  double_time_rate: number;
  effective_date: string;
}

interface RateHistoryEntry {
  id: string;
  operator_id: string;
  rate_type: string;
  regular_rate: number;
  overtime_rate: number;
  double_time_rate: number;
  effective_date: string;
  end_date: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
  approved_by: string | null;
  profiles?: { id: string; full_name: string; email: string } | null;
}

export default function OperatorPayRatesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<OperatorRate[]>([]);
  const [expandedOperator, setExpandedOperator] = useState<string | null>(null);
  const [rateHistory, setRateHistory] = useState<RateHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showNewRateModal, setShowNewRateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [newRate, setNewRate] = useState({
    operator_id: '',
    regular_rate: '',
    rate_type: 'hourly' as 'hourly' | 'salary' | 'day_rate',
    effective_date: new Date().toISOString().split('T')[0],
    reason: '',
    notes: '',
  });
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    setUser(currentUser);
    fetchRates();
  }, [router]);

  // Auto-dismiss success message
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Auto-dismiss error message
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const fetchRates = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/admin/payroll/rates', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const result = await response.json();

      if (result.success) {
        setRates(result.data || []);
      } else {
        setError(result.error || 'Failed to load rates');
      }
    } catch (err) {
      console.error('Error fetching rates:', err);
      setError('Failed to load operator rates');
    } finally {
      setLoading(false);
    }
  };

  const fetchRateHistory = async (operatorId: string) => {
    setHistoryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `/api/admin/payroll/rates?operator_id=${operatorId}&active_only=false`,
        { headers: { 'Authorization': `Bearer ${session.access_token}` } }
      );
      const result = await response.json();

      if (result.success) {
        setRateHistory(result.data || []);
      }
    } catch (err) {
      console.error('Error fetching rate history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleToggleExpand = (operatorId: string) => {
    if (expandedOperator === operatorId) {
      setExpandedOperator(null);
      setRateHistory([]);
    } else {
      setExpandedOperator(operatorId);
      fetchRateHistory(operatorId);
    }
  };

  const handleSubmitNewRate = async () => {
    if (!newRate.operator_id || !newRate.regular_rate || !newRate.reason) {
      setError('Operator, regular rate, and reason are required');
      return;
    }

    const parsedRate = parseFloat(newRate.regular_rate);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      setError('Please enter a valid rate amount');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/admin/payroll/rates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          operator_id: newRate.operator_id,
          regular_rate: parsedRate,
          rate_type: newRate.rate_type,
          effective_date: newRate.effective_date,
          reason: newRate.reason,
          notes: newRate.notes || null,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setShowNewRateModal(false);
        setNewRate({
          operator_id: '',
          regular_rate: '',
          rate_type: 'hourly',
          effective_date: new Date().toISOString().split('T')[0],
          reason: '',
          notes: '',
        });
        setSuccessMsg('New rate set successfully');
        fetchRates();
        // Refresh history if the operator is expanded
        if (expandedOperator === newRate.operator_id) {
          fetchRateHistory(newRate.operator_id);
        }
      } else {
        setError(result.error || 'Failed to set new rate');
      }
    } catch (err) {
      console.error('Error setting new rate:', err);
      setError('Failed to set new rate');
    } finally {
      setSubmitting(false);
    }
  };

  const formatMoney = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatRateType = (type: string) => {
    switch (type) {
      case 'hourly': return 'Hourly';
      case 'salary': return 'Salary';
      case 'day_rate': return 'Day Rate';
      default: return type;
    }
  };

  // Summary calculations
  const totalOperators = rates.length;
  const avgRate = totalOperators > 0
    ? rates.reduce((sum, r) => sum + r.regular_rate, 0) / totalOperators
    : 0;
  const highestRate = totalOperators > 0
    ? Math.max(...rates.map(r => r.regular_rate))
    : 0;

  // Get unique operators for dropdown
  const uniqueOperators = rates.reduce<{ id: string; name: string; email: string }[]>((acc, r) => {
    if (!acc.find(o => o.id === r.operator_id)) {
      acc.push({ id: r.operator_id, name: r.full_name || 'Unknown', email: r.email || '' });
    }
    return acc;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading pay rates...</p>
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
              <h1 className="text-2xl font-bold text-gray-900">Operator Pay Rates</h1>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowNewRateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors shadow-md font-semibold"
              >
                <Plus size={18} />
                <span>Set New Rate</span>
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
        {/* Toast Messages */}
        {successMsg && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-6 py-4 rounded-2xl flex items-center justify-between shadow-md">
            <span className="font-medium">{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="text-green-600 hover:text-green-800">
              <X size={18} />
            </button>
          </div>
        )}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-2xl flex items-center justify-between shadow-md">
            <span className="font-medium">{error}</span>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
              <X size={18} />
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-2">
              <Users className="text-blue-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{totalOperators}</p>
            <p className="text-sm text-gray-500">Operators with Rates</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-2">
              <DollarSign className="text-green-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{formatMoney(avgRate)}</p>
            <p className="text-sm text-gray-500">Average Rate</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-2">
              <TrendingUp className="text-purple-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{formatMoney(highestRate)}</p>
            <p className="text-sm text-gray-500">Highest Rate</p>
          </div>
        </div>

        {/* Current Rates Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Current Rates</h2>
              <p className="text-sm text-gray-500 mt-1">{totalOperators} operator{totalOperators !== 1 ? 's' : ''} configured</p>
            </div>
          </div>

          {rates.length === 0 ? (
            <div className="p-12 text-center">
              <DollarSign className="w-20 h-20 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg font-medium">No pay rates configured</p>
              <p className="text-gray-400 text-sm mt-2">Click &quot;Set New Rate&quot; to add operator pay rates</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Operator</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Rate Type</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Regular Rate</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">OT Rate (1.5x)</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">DT Rate (2x)</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Effective Date</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rates.map((rate) => (
                    <tr key={rate.operator_id}>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleExpand(rate.operator_id)}
                          className="flex items-center gap-3 text-left hover:bg-gray-50 -mx-2 px-2 py-1 rounded-lg transition-colors w-full"
                        >
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0">
                            {rate.full_name?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-800 truncate">{rate.full_name}</p>
                            <p className="text-xs text-gray-500 truncate">{rate.email}</p>
                          </div>
                          {expandedOperator === rate.operator_id ? (
                            <ChevronUp size={16} className="text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          rate.rate_type === 'hourly' ? 'bg-blue-100 text-blue-800' :
                          rate.rate_type === 'salary' ? 'bg-green-100 text-green-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>
                          {formatRateType(rate.rate_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-semibold text-gray-800">{formatMoney(rate.regular_rate)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">{formatMoney(rate.overtime_rate)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">{formatMoney(rate.double_time_rate)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-gray-400" />
                          <span className="text-sm text-gray-600">{formatDate(rate.effective_date)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setNewRate({
                              operator_id: rate.operator_id,
                              regular_rate: '',
                              rate_type: rate.rate_type,
                              effective_date: new Date().toISOString().split('T')[0],
                              reason: '',
                              notes: '',
                            });
                            setShowNewRateModal(true);
                          }}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                        >
                          <DollarSign size={14} />
                          Update Rate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rate History Panel (expanded) */}
        {expandedOperator && (
          <div className="mt-4 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">
                Rate History — {rates.find(r => r.operator_id === expandedOperator)?.full_name || 'Operator'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">All rate changes for this operator</p>
            </div>

            {historyLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3"></div>
                <p className="text-gray-500 text-sm">Loading history...</p>
              </div>
            ) : rateHistory.length === 0 ? (
              <div className="p-8 text-center">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No rate history found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Rate Type</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Regular</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">OT (1.5x)</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">DT (2x)</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Effective</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">End Date</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rateHistory.map((entry) => (
                      <tr key={entry.id} className={!entry.end_date ? 'bg-green-50' : ''}>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700">
                          {formatRateType(entry.rate_type)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-semibold text-gray-800">
                          {formatMoney(entry.regular_rate)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                          {formatMoney(entry.overtime_rate)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                          {formatMoney(entry.double_time_rate)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                          {formatDate(entry.effective_date)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                          {entry.end_date ? formatDate(entry.end_date) : '--'}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          {!entry.end_date ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              Expired
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-600 max-w-[200px] truncate" title={entry.reason || ''}>
                          {entry.reason || '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Set New Rate Modal */}
      {showNewRateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Set New Rate</h3>
                <p className="text-sm text-gray-500 mt-1">Configure a new pay rate for an operator</p>
              </div>
              <button
                onClick={() => setShowNewRateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={24} className="text-gray-600" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Operator Selection */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Operator
                </label>
                {uniqueOperators.length > 0 ? (
                  <select
                    value={newRate.operator_id}
                    onChange={(e) => setNewRate({ ...newRate, operator_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  >
                    <option value="">Select an operator...</option>
                    {uniqueOperators.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.name} ({op.email})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newRate.operator_id}
                    onChange={(e) => setNewRate({ ...newRate, operator_id: e.target.value })}
                    placeholder="Enter operator ID (UUID)"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  />
                )}
              </div>

              {/* Regular Rate */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Regular Rate ($)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newRate.regular_rate}
                    onChange={(e) => setNewRate({ ...newRate, regular_rate: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  />
                </div>
                {newRate.regular_rate && parseFloat(newRate.regular_rate) > 0 && (
                  <div className="mt-2 text-xs text-gray-500 space-y-1">
                    <p>OT (1.5x): {formatMoney(parseFloat(newRate.regular_rate) * 1.5)}</p>
                    <p>DT (2.0x): {formatMoney(parseFloat(newRate.regular_rate) * 2.0)}</p>
                  </div>
                )}
              </div>

              {/* Rate Type */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Rate Type
                </label>
                <select
                  value={newRate.rate_type}
                  onChange={(e) => setNewRate({ ...newRate, rate_type: e.target.value as 'hourly' | 'salary' | 'day_rate' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                >
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                  <option value="day_rate">Day Rate</option>
                </select>
              </div>

              {/* Effective Date */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Effective Date
                </label>
                <input
                  type="date"
                  value={newRate.effective_date}
                  onChange={(e) => setNewRate({ ...newRate, effective_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Reason
                </label>
                <input
                  type="text"
                  value={newRate.reason}
                  onChange={(e) => setNewRate({ ...newRate, reason: e.target.value })}
                  placeholder="e.g. Annual raise, promotion, new hire rate"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={newRate.notes}
                  onChange={(e) => setNewRate({ ...newRate, notes: e.target.value })}
                  rows={3}
                  placeholder="Any additional notes about this rate change..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowNewRateModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitNewRate}
                  disabled={submitting}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <DollarSign size={18} />
                      Set Rate
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
