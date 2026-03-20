'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Building2, Plus, Search, Loader2, AlertCircle
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import CustomerCard from './_components/CustomerCard';
import CustomerForm from './_components/CustomerForm';

interface Customer {
  id: string;
  name: string;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  customer_type: string | null;
  job_count: number;
  total_revenue: number;
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function apiFetch(url: string, opts?: RequestInit) {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    if (!['admin', 'super_admin', 'operations_manager', 'salesman'].includes(currentUser.role || '')) {
      router.push('/dashboard');
    }
  }, [router]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '100');
      const res = await apiFetch(`/api/admin/customers?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setCustomers(json.data || []);
        setTotalCount(json.pagination?.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err);
      setError('Failed to load customers. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(), 300);
    return () => clearTimeout(timer);
  }, [fetchCustomers]);

  const handleCreate = async (data: Record<string, any>) => {
    const res = await apiFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || 'Failed to create customer');
    }
    setShowAddModal(false);
    fetchCustomers();
  };

  const totalRevenue = customers.reduce((sum, c) => sum + c.total_revenue, 0);
  const totalJobs = customers.reduce((sum, c) => sum + c.job_count, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="container mx-auto px-4 md:px-6 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Building2 className="w-6 h-6 text-purple-400" />
                Customer Profiles
              </h1>
              <p className="text-sm text-gray-400">Manage customers, contacts, and job history</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-2xl font-bold text-white">{totalCount}</p>
            <p className="text-xs text-gray-400">Customers</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-2xl font-bold text-purple-400">{totalJobs}</p>
            <p className="text-xs text-gray-400">Total Jobs</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-2xl font-bold text-emerald-400">${totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-gray-400">Total Revenue</p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
            />
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300 flex-1">{error}</p>
            <button onClick={() => { setError(null); fetchCustomers(); }} className="text-sm font-semibold text-red-400 hover:text-red-300 transition-colors">
              Retry
            </button>
          </div>
        )}

        {/* Customer Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p className="font-semibold text-gray-300">No customers found</p>
            <p className="text-sm">{search ? 'Try a different search' : 'Add your first customer to get started'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {customers.map((customer) => (
              <CustomerCard
                key={customer.id}
                customer={customer}
                onClick={() => router.push(`/dashboard/admin/customers/${customer.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <CustomerForm onSubmit={handleCreate} onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}
