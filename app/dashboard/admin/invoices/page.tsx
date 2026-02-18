'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import {
  ArrowLeft,
  Plus,
  FileText,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Search,
} from 'lucide-react';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';
}

interface InvoiceSummary {
  totalCount: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  statusCounts: Record<string, number>;
}

const STATUS_FILTERS = ['all', 'draft', 'sent', 'partial', 'paid', 'overdue', 'void'] as const;

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-800' },
  sent: { bg: 'bg-blue-100', text: 'text-blue-800' },
  partial: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  paid: { bg: 'bg-green-100', text: 'text-green-800' },
  overdue: { bg: 'bg-red-100', text: 'text-red-800' },
  void: { bg: 'bg-gray-200', text: 'text-gray-500' },
};

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export default function InvoicesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary>({
    totalCount: 0,
    totalAmount: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    statusCounts: {},
  });
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    setCurrentUser(user);
    loadInvoices();
  }, []);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
    };
  };

  const loadInvoices = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/invoices', { headers });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load invoices');
      }

      setInvoices(result.data?.invoices || []);
      if (result.data?.summary) {
        setSummary(result.data.summary);
      }
    } catch (error: any) {
      if (error?.message) {
        console.error('Failed to load invoices:', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesFilter = activeFilter === 'all' || inv.status === activeFilter;
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      inv.invoice_number?.toLowerCase().includes(query) ||
      inv.customer_name?.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin/payroll"
                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Invoices</h1>
                <p className="text-sm text-gray-600">Manage customer invoices</p>
              </div>
            </div>
            <Link
              href="/dashboard/admin/invoices/new"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Invoice
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <FileText className="w-8 h-8 text-blue-600" />
              <span className="text-3xl font-bold text-gray-900">{summary.totalCount}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Total Invoices</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-8 h-8 text-indigo-600" />
              <span className="text-2xl font-bold text-gray-900">{formatMoney(summary.totalAmount)}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Total Amount</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <span className="text-2xl font-bold text-gray-900">{formatMoney(summary.totalPaid)}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Total Paid</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <AlertCircle className="w-8 h-8 text-orange-600" />
              <span className="text-2xl font-bold text-gray-900">{formatMoney(summary.totalOutstanding)}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Outstanding</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by invoice number or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors capitalize ${
                activeFilter === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {filter}
              {filter !== 'all' && summary.statusCounts[filter]
                ? ` (${summary.statusCounts[filter]})`
                : filter === 'all'
                ? ` (${summary.totalCount})`
                : ''}
            </button>
          ))}
        </div>

        {/* Invoice Table */}
        {filteredInvoices.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {searchQuery || activeFilter !== 'all' ? 'No invoices found' : 'No Invoices Yet'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchQuery || activeFilter !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Create your first invoice to get started'}
            </p>
            {!searchQuery && activeFilter === 'all' && (
              <Link
                href="/dashboard/admin/invoices/new"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Invoice
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Paid
                    </th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Balance
                    </th>
                    <th className="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredInvoices.map((invoice) => {
                    const style = STATUS_STYLES[invoice.status] || STATUS_STYLES.draft;
                    return (
                      <tr
                        key={invoice.id}
                        onClick={() => router.push(`/dashboard/admin/invoices/${invoice.id}`)}
                        className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 text-sm font-semibold text-blue-600">
                          {invoice.invoice_number}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                          {invoice.customer_name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(invoice.invoice_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-semibold text-right">
                          {formatMoney(invoice.total_amount)}
                        </td>
                        <td className="px-6 py-4 text-sm text-green-700 text-right">
                          {formatMoney(invoice.amount_paid)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-semibold text-right">
                          {formatMoney(invoice.balance_due)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold capitalize ${style.bg} ${style.text}`}
                          >
                            {invoice.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredInvoices.map((invoice) => {
                const style = STATUS_STYLES[invoice.status] || STATUS_STYLES.draft;
                return (
                  <div
                    key={invoice.id}
                    onClick={() => router.push(`/dashboard/admin/invoices/${invoice.id}`)}
                    className="p-4 hover:bg-blue-50/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-blue-600">
                        {invoice.invoice_number}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${style.bg} ${style.text}`}
                      >
                        {invoice.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-1">{invoice.customer_name}</p>
                    <p className="text-xs text-gray-500 mb-3">
                      {new Date(invoice.invoice_date).toLocaleDateString()}
                    </p>
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-gray-500">Total: </span>
                        <span className="font-semibold text-gray-900">
                          {formatMoney(invoice.total_amount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Balance: </span>
                        <span className="font-semibold text-gray-900">
                          {formatMoney(invoice.balance_due)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
