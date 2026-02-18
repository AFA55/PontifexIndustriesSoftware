'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import {
  ArrowLeft,
  Plus,
  Users,
  UserCheck,
  DollarSign,
  Search,
  X,
  ChevronDown,
} from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  display_name: string;
  primary_contact_name: string;
  primary_contact_email: string;
  primary_contact_phone: string;
  billing_contact_email: string;
  billing_address_line1: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  payment_terms: number;
  default_billing_type: string;
  tax_exempt: boolean;
  notes: string;
  active: boolean;
  outstanding_balance: number;
  created_at: string;
}

interface CustomerSummary {
  total: number;
  active: number;
  withBalance: number;
}

const BILLING_TYPES = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'flat_rate', label: 'Flat Rate' },
  { value: 'time_and_materials', label: 'Time & Materials' },
  { value: 'per_unit', label: 'Per Unit' },
  { value: 'contract', label: 'Contract' },
];

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

const EMPTY_FORM = {
  name: '',
  display_name: '',
  primary_contact_name: '',
  primary_contact_email: '',
  primary_contact_phone: '',
  billing_contact_email: '',
  billing_address_line1: '',
  billing_city: '',
  billing_state: '',
  billing_zip: '',
  payment_terms: 30,
  default_billing_type: 'hourly',
  tax_exempt: false,
  notes: '',
};

export default function CustomersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<CustomerSummary>({
    total: 0,
    active: 0,
    withBalance: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    setCurrentUser(user);
    loadCustomers();
  }, []);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
    };
  };

  const loadCustomers = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/customers', { headers });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load customers');
      }

      setCustomers(result.data?.customers || []);
      if (result.data?.summary) {
        setSummary(result.data.summary);
      }
    } catch (error: any) {
      if (error?.message) {
        console.error('Failed to load customers:', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      c.name?.toLowerCase().includes(query) ||
      c.display_name?.toLowerCase().includes(query) ||
      c.primary_contact_name?.toLowerCase().includes(query) ||
      c.primary_contact_email?.toLowerCase().includes(query);

    const matchesFilter =
      activeFilter === 'all' ||
      (activeFilter === 'active' && c.active !== false) ||
      (activeFilter === 'inactive' && c.active === false);

    return matchesSearch && matchesFilter;
  });

  const updateForm = (field: string, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) {
      setFormError('Customer name is required.');
      return;
    }

    setSubmitting(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/customers', {
        method: 'POST',
        headers,
        body: JSON.stringify(form),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create customer');
      }

      setShowModal(false);
      setForm(EMPTY_FORM);
      loadCustomers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading customers...</p>
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
                <h1 className="text-xl font-bold text-gray-800">Customers</h1>
                <p className="text-sm text-gray-600">Manage customer registry</p>
              </div>
            </div>
            <button
              onClick={() => {
                setForm(EMPTY_FORM);
                setFormError('');
                setShowModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Customer
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-8 h-8 text-blue-600" />
              <span className="text-3xl font-bold text-gray-900">{summary.total}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Total Customers</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <UserCheck className="w-8 h-8 text-green-600" />
              <span className="text-3xl font-bold text-gray-900">{summary.active}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Active</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-8 h-8 text-orange-600" />
              <span className="text-3xl font-bold text-gray-900">{summary.withBalance}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">With Outstanding Balance</p>
          </div>
        </div>

        {/* Search + Active Filter */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, contact, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              {(['active', 'inactive', 'all'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-2 rounded-xl font-medium transition-colors capitalize ${
                    activeFilter === filter
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Customer Table */}
        {filteredCustomers.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {searchQuery || activeFilter !== 'all' ? 'No customers found' : 'No Customers Yet'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchQuery || activeFilter !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Add your first customer to get started'}
            </p>
            {!searchQuery && activeFilter === 'all' && (
              <button
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setFormError('');
                  setShowModal(true);
                }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Customer
              </button>
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
                      Name
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Terms
                    </th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Outstanding
                    </th>
                    <th className="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="hover:bg-blue-50/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {customer.display_name || customer.name}
                          </p>
                          {customer.display_name && customer.display_name !== customer.name && (
                            <p className="text-xs text-gray-500">{customer.name}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {customer.primary_contact_name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {customer.primary_contact_email || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {customer.primary_contact_phone || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-center">
                        {customer.payment_terms ? `Net ${customer.payment_terms}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-right">
                        {customer.outstanding_balance > 0 ? (
                          <span className="text-orange-600">
                            {formatMoney(customer.outstanding_balance)}
                          </span>
                        ) : (
                          <span className="text-gray-400">$0.00</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                            customer.active !== false
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {customer.active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredCustomers.map((customer) => (
                <div key={customer.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {customer.display_name || customer.name}
                    </p>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        customer.active !== false
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {customer.active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {customer.primary_contact_name && (
                    <p className="text-xs text-gray-600 mb-1">{customer.primary_contact_name}</p>
                  )}
                  {customer.primary_contact_email && (
                    <p className="text-xs text-gray-500 mb-1">{customer.primary_contact_email}</p>
                  )}
                  {customer.primary_contact_phone && (
                    <p className="text-xs text-gray-500 mb-1">{customer.primary_contact_phone}</p>
                  )}
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-gray-500">
                      {customer.payment_terms ? `Net ${customer.payment_terms}` : '-'}
                    </span>
                    {customer.outstanding_balance > 0 ? (
                      <span className="font-semibold text-orange-600">
                        {formatMoney(customer.outstanding_balance)}
                      </span>
                    ) : (
                      <span className="text-gray-400">$0.00</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">Add Customer</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {formError}
                </div>
              )}

              {/* Name (required) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="e.g. Acme Construction LLC"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={(e) => updateForm('display_name', e.target.value)}
                  placeholder="Short name for invoices (optional)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={form.primary_contact_name}
                    onChange={(e) => updateForm('primary_contact_name', e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={form.primary_contact_phone}
                    onChange={(e) => updateForm('primary_contact_phone', e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={form.primary_contact_email}
                  onChange={(e) => updateForm('primary_contact_email', e.target.value)}
                  placeholder="contact@example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Billing Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Billing Address
                </label>
                <input
                  type="text"
                  value={form.billing_address_line1}
                  onChange={(e) => updateForm('billing_address_line1', e.target.value)}
                  placeholder="123 Main St"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={form.billing_city}
                    onChange={(e) => updateForm('billing_city', e.target.value)}
                    placeholder="Houston"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input
                    type="text"
                    value={form.billing_state}
                    onChange={(e) => updateForm('billing_state', e.target.value)}
                    placeholder="TX"
                    maxLength={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                  <input
                    type="text"
                    value={form.billing_zip}
                    onChange={(e) => updateForm('billing_zip', e.target.value)}
                    placeholder="77001"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Payment / Billing */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Terms (days)
                  </label>
                  <input
                    type="number"
                    value={form.payment_terms}
                    onChange={(e) => updateForm('payment_terms', parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Billing Type
                  </label>
                  <div className="relative">
                    <select
                      value={form.default_billing_type}
                      onChange={(e) => updateForm('default_billing_type', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
                    >
                      {BILLING_TYPES.map((bt) => (
                        <option key={bt.value} value={bt.value}>
                          {bt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Tax Exempt */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="tax_exempt"
                  checked={form.tax_exempt}
                  onChange={(e) => updateForm('tax_exempt', e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="tax_exempt" className="text-sm font-medium text-gray-700">
                  Tax Exempt
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateForm('notes', e.target.value)}
                  rows={3}
                  placeholder="Additional notes..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Add Customer
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
