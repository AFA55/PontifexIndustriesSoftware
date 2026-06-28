'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useNotifications } from '@/contexts/NotificationContext';
import {
  Building2, Plus, Search, Globe, ChevronRight, Users as UsersIcon,
  ToggleRight, RefreshCw, ShieldCheck,
} from 'lucide-react';
import {
  type Tenant, getHeaders, statusColors, planIcons,
  moduleSummary, userCount, isProtectedTenant,
} from '@/components/platform/shared';

export default function PlatformTenantsPage() {
  const { error: showError } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');

  const fetchTenants = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/tenants', { headers });
      const json = await res.json();
      if (json.success) setTenants(json.data || []);
      else showError('Failed to load tenants', json.error);
    } catch (err: any) {
      showError('Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase()) ||
    (t.company_code || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Title row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Client Tenants</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">{tenants.length} companies on the platform</p>
        </div>
        <Link
          href="/dashboard/platform/tenants/new"
          className="px-4 py-2.5 min-h-[44px] bg-brand hover:bg-brand-dark text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Tenant
        </Link>
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, slug, or company code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand/50"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-bold text-gray-900 dark:text-white mb-2">No tenants found</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
            Create your first tenant to start the multi-tenant platform.
          </p>
          <Link
            href="/dashboard/platform/tenants/new"
            className="inline-block px-4 py-2 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-dark"
          >
            Create First Tenant
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(tenant => {
            const mods = moduleSummary(tenant.features);
            const uc = userCount(tenant);
            const protectedTenant = isProtectedTenant(tenant);
            return (
              <Link
                key={tenant.id}
                href={`/dashboard/platform/tenants/${tenant.id}`}
                className="group bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 hover:shadow-md hover:border-brand/40 dark:hover:border-brand/40 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-gradient-to-br from-brand to-brand-accent rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {tenant.name[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 dark:text-white truncate flex items-center gap-1.5">
                        {tenant.name}
                        {protectedTenant && (
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        )}
                      </h3>
                      <p className="text-xs text-gray-400 font-mono truncate">
                        {tenant.company_code || tenant.slug}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-full border flex-shrink-0 ${statusColors[tenant.status] || 'bg-gray-100 text-gray-500'}`}>
                    {tenant.status.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 bg-gray-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-[10px] text-gray-400">Plan</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      {planIcons[tenant.plan]}
                      <span className="text-xs font-bold text-gray-900 dark:text-white capitalize truncate">{tenant.plan}</span>
                    </div>
                  </div>
                  <div className="text-center p-2 bg-gray-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><UsersIcon className="w-3 h-3" />Users</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">
                      {uc != null ? uc : '—'}<span className="text-[10px] text-gray-400 font-normal">/{tenant.max_users}</span>
                    </p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><ToggleRight className="w-3 h-3" />Modules</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{mods.on}<span className="text-[10px] text-gray-400 font-normal">/{mods.total}</span></p>
                  </div>
                </div>

                {tenant.domain && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400 mb-3">
                    <Globe className="w-3.5 h-3.5" />
                    {tenant.domain}
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-slate-800">
                  <span className="text-[10px] text-gray-400">
                    Created {new Date(tenant.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-brand dark:text-brand font-medium flex items-center gap-0.5 group-hover:gap-1.5 transition-all">
                    Manage <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
