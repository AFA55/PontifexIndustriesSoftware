'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { ArrowLeft, History, Package, UserPlus, UserMinus, TrendingUp, TrendingDown, AlertTriangle, XCircle, Filter, Loader2 } from 'lucide-react';

interface InventoryTransaction {
  id: string;
  transaction_type: string;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  serial_number: string | null;
  notes: string | null;
  transaction_date: string;
  inventory: {
    id: string;
    name: string;
    category: string;
    manufacturer: string;
    model_number: string;
    size: string | null;
  } | null;
  operator: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  performed_by_user: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  equipment: {
    id: string;
    serial_number: string;
    status: string;
  } | null;
}

const TRANSACTION_TYPES = [
  { value: 'all', label: 'All Transactions', icon: History },
  { value: 'add_stock', label: 'Stock Added', icon: TrendingUp },
  { value: 'assign_to_operator', label: 'Assigned to Operator', icon: UserPlus },
  { value: 'return_from_operator', label: 'Returned from Operator', icon: UserMinus },
  { value: 'adjustment', label: 'Adjustment', icon: Package },
  { value: 'damage', label: 'Damage', icon: AlertTriangle },
  { value: 'loss', label: 'Loss', icon: XCircle },
];

export default function InventoryHistoryPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    const currentUser = getCurrentUser();

    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'inventory_manager')) {
      router.push('/dashboard');
      return;
    }

    fetchHistory();
  }, [filterType, router]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const url = filterType === 'all'
        ? '/api/inventory/history'
        : `/api/inventory/history?type=${filterType}`;

      const response = await fetch(url);
      const result = await response.json();

      if (result.success) {
        setTransactions(result.data);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTransactionConfig = (type: string) => {
    switch (type) {
      case 'add_stock':
        return {
          icon: TrendingUp,
          color: 'from-green-500 to-emerald-600',
          bgColor: 'bg-green-50',
          textColor: 'text-green-700',
          borderColor: 'border-green-200',
          label: 'Stock Added'
        };
      case 'assign_to_operator':
        return {
          icon: UserPlus,
          color: 'from-blue-500 to-indigo-600',
          bgColor: 'bg-blue-50',
          textColor: 'text-blue-700',
          borderColor: 'border-blue-200',
          label: 'Assigned'
        };
      case 'return_from_operator':
        return {
          icon: UserMinus,
          color: 'from-purple-500 to-pink-600',
          bgColor: 'bg-purple-50',
          textColor: 'text-purple-700',
          borderColor: 'border-purple-200',
          label: 'Returned'
        };
      case 'adjustment':
        return {
          icon: Package,
          color: 'from-gray-500 to-slate-600',
          bgColor: 'bg-gray-50',
          textColor: 'text-gray-700',
          borderColor: 'border-gray-200',
          label: 'Adjustment'
        };
      case 'damage':
        return {
          icon: AlertTriangle,
          color: 'from-orange-500 to-red-600',
          bgColor: 'bg-orange-50',
          textColor: 'text-orange-700',
          borderColor: 'border-orange-200',
          label: 'Damage'
        };
      case 'loss':
        return {
          icon: XCircle,
          color: 'from-red-500 to-rose-600',
          bgColor: 'bg-red-50',
          textColor: 'text-red-700',
          borderColor: 'border-red-200',
          label: 'Loss'
        };
      default:
        return {
          icon: History,
          color: 'from-gray-500 to-slate-600',
          bgColor: 'bg-gray-50',
          textColor: 'text-gray-700',
          borderColor: 'border-gray-200',
          label: type
        };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 border-b border-blue-800 sticky top-0 z-50 shadow-2xl">
        <div className="container mx-auto px-4 py-6">
          <Link
            href="/dashboard/inventory"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft size={20} />
            <span className="font-medium">Back to Inventory</span>
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/10 backdrop-blur-lg rounded-2xl flex items-center justify-center border border-white/20">
                <History className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">Inventory History</h1>
                <p className="text-white/80">Track all blade/bit additions, assignments, and retirements</p>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-lg px-6 py-4 rounded-xl border border-white/20">
              <p className="text-white/70 text-sm mb-1">Total Transactions</p>
              <p className="text-4xl font-bold text-white">{transactions.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Filter Buttons */}
        <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-2xl p-6 mb-8 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-bold text-gray-800">Filter by Type</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {TRANSACTION_TYPES.map((type) => {
              const Icon = type.icon;
              const isActive = filterType === type.value;

              return (
                <button
                  key={type.value}
                  onClick={() => setFilterType(type.value)}
                  className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center gap-2 ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-105'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {type.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Transaction Timeline */}
        {transactions.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-12 text-center">
            <History size={64} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">No Transactions Found</h3>
            <p className="text-gray-600">No inventory transactions match your filter.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.map((transaction, index) => {
              const config = getTransactionConfig(transaction.transaction_type);
              const Icon = config.icon;

              return (
                <div
                  key={transaction.id}
                  className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="flex">
                    {/* Left Icon Strip */}
                    <div className={`w-2 bg-gradient-to-b ${config.color}`}></div>

                    {/* Content */}
                    <div className="flex-1 p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4 flex-1">
                          {/* Icon */}
                          <div className={`w-12 h-12 bg-gradient-to-br ${config.color} rounded-xl flex items-center justify-center shadow-lg`}>
                            <Icon className="w-6 h-6 text-white" />
                          </div>

                          {/* Details */}
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`px-3 py-1 ${config.bgColor} ${config.textColor} rounded-lg text-sm font-bold border ${config.borderColor}`}>
                                {config.label}
                              </span>
                              <span className="text-sm text-gray-500">
                                {new Date(transaction.transaction_date).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                })}
                              </span>
                            </div>

                            <h3 className="text-lg font-bold text-gray-800 mb-2">
                              {transaction.inventory?.name || 'Unknown Item'}
                            </h3>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-gray-500 font-medium">Manufacturer</p>
                                <p className="text-gray-800 font-semibold">
                                  {transaction.inventory?.manufacturer || 'N/A'}
                                </p>
                              </div>

                              <div>
                                <p className="text-gray-500 font-medium">Model</p>
                                <p className="text-gray-800 font-semibold">
                                  {transaction.inventory?.model_number || 'N/A'}
                                </p>
                              </div>

                              {transaction.inventory?.size && (
                                <div>
                                  <p className="text-gray-500 font-medium">Size</p>
                                  <p className="text-gray-800 font-semibold">
                                    {transaction.inventory.size}"
                                  </p>
                                </div>
                              )}

                              {transaction.serial_number && (
                                <div>
                                  <p className="text-gray-500 font-medium">Serial #</p>
                                  <p className="text-gray-800 font-semibold">
                                    {transaction.serial_number}
                                  </p>
                                </div>
                              )}
                            </div>

                            {transaction.operator && (
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                <p className="text-sm text-gray-500 font-medium">Operator</p>
                                <p className="text-sm text-gray-800 font-semibold">
                                  {transaction.operator.full_name} ({transaction.operator.email})
                                </p>
                              </div>
                            )}

                            {transaction.performed_by_user && (
                              <div className="mt-2">
                                <p className="text-sm text-gray-500 font-medium">Performed By</p>
                                <p className="text-sm text-gray-800 font-semibold">
                                  {transaction.performed_by_user.full_name}
                                </p>
                              </div>
                            )}

                            {transaction.notes && (
                              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <p className="text-sm text-gray-600 italic">{transaction.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Quantity Change */}
                        <div className="text-right">
                          <p className="text-sm text-gray-500 font-medium mb-1">Quantity Change</p>
                          <p className={`text-2xl font-bold ${transaction.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {transaction.quantity_change > 0 ? '+' : ''}{transaction.quantity_change}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {transaction.quantity_before} → {transaction.quantity_after}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
