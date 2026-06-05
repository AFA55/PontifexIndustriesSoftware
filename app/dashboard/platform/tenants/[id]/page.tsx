'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Building2, ToggleRight, Users as UsersIcon, CreditCard, LayoutGrid,
  RefreshCw, Pencil, Power, PlayCircle, ShieldCheck, ExternalLink, Lock, X,
} from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import {
  type Tenant, getHeaders, getJsonHeaders, statusColors, planIcons,
  moduleSummary, isProtectedTenant, ConfirmModal,
} from '@/components/platform/shared';
import ModuleSwitchboard from '@/components/platform/ModuleSwitchboard';
import TenantUsersTab from '@/components/platform/TenantUsersTab';

type Tab = 'overview' | 'users' | 'modules' | 'billing';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'users', label: 'Users', icon: UsersIcon },
  { key: 'modules', label: 'Modules', icon: ToggleRight },
  { key: 'billing', label: 'Billing', icon: CreditCard },
];

export default function TenantDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { success, error: showError } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  const fetchTenant = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/admin/tenants/${id}`, { headers });
      const json = await res.json();
      if (json.success) setTenant(json.data);
      else showError('Failed to load tenant', json.error);
    } catch (err: any) {
      showError('Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [id, showError]);

  useEffect(() => { fetchTenant(); }, [fetchTenant]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-12 text-center">
        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="font-bold text-gray-900 dark:text-white mb-2">Tenant not found</h3>
        <Link href="/dashboard/platform/tenants" className="text-violet-600 text-sm font-medium">Back to tenants</Link>
      </div>
    );
  }

  const protectedTenant = isProtectedTenant(tenant);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${tenant.primary_color || '#7c3aed'}, #6d28d9)` }}
          >
            {tenant.name[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate flex items-center gap-2">
              {tenant.name}
              {protectedTenant && <ShieldCheck className="w-4 h-4 text-amber-500 flex-shrink-0" />}
            </h1>
            <p className="text-xs text-gray-400 font-mono">{tenant.company_code || tenant.slug}</p>
          </div>
        </div>
        <span className={`px-3 py-1.5 text-xs font-bold rounded-full border self-start ${statusColors[tenant.status] || 'bg-gray-100 text-gray-500'}`}>
          {tenant.status.toUpperCase()}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-gray-200 dark:border-slate-800 -mx-1 px-1">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 min-h-[44px] text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active
                  ? 'border-violet-600 text-violet-700 dark:text-violet-400'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <OverviewTab tenant={tenant} protectedTenant={protectedTenant} onUpdated={fetchTenant} success={success} showError={showError} />
      )}
      {tab === 'users' && <TenantUsersTab tenantId={tenant.id} />}
      {tab === 'modules' && (
        <ModuleSwitchboard tenant={tenant} onSaved={(features) => setTenant(t => t ? { ...t, features } : t)} />
      )}
      {tab === 'billing' && <BillingTab tenant={tenant} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ tenant, protectedTenant, onUpdated, success, showError }: {
  tenant: Tenant;
  protectedTenant: boolean;
  onUpdated: () => void;
  success: (t: string, m?: string) => void;
  showError: (t: string, m?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<null | 'suspended' | 'active'>(null);
  const [busy, setBusy] = useState(false);
  const mods = moduleSummary(tenant.features);

  const updateStatus = async (status: 'suspended' | 'active') => {
    setBusy(true);
    try {
      const headers = await getJsonHeaders();
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        success('Tenant updated', `Status changed to ${status}`);
        onUpdated();
      } else {
        showError('Update failed', json.error);
      }
    } catch (err: any) {
      showError('Error', err.message);
    } finally {
      setBusy(false);
      setConfirmStatus(null);
    }
  };

  const Field = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
    <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{label}</p>
      <p className={`text-sm font-semibold text-gray-900 dark:text-white ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setEditing(true)}
          className="px-4 py-2.5 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors"
        >
          <Pencil className="w-4 h-4" /> Edit
        </button>
        {tenant.status === 'active' ? (
          <button
            onClick={() => !protectedTenant && setConfirmStatus('suspended')}
            disabled={protectedTenant}
            title={protectedTenant ? 'This tenant is protected and cannot be suspended' : 'Suspend tenant'}
            className="px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-200 dark:border-red-900 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            {protectedTenant ? <Lock className="w-4 h-4" /> : <Power className="w-4 h-4" />}
            Suspend
          </button>
        ) : tenant.status === 'suspended' ? (
          <button
            onClick={() => setConfirmStatus('active')}
            className="px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 border border-green-200 dark:border-green-900"
          >
            <PlayCircle className="w-4 h-4" /> Reactivate
          </button>
        ) : null}
        {protectedTenant && (
          <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Protected tenant — suspend disabled
          </span>
        )}
      </div>

      {/* Branding */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Branding</h3>
        <div className="flex items-center gap-4">
          {tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo_url} alt="logo" className="w-14 h-14 rounded-xl object-contain bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-300">
              <Building2 className="w-6 h-6" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg border border-gray-200 dark:border-slate-700" style={{ background: tenant.primary_color || '#7c3aed' }} />
            <span className="text-sm font-mono text-gray-600 dark:text-slate-300">{tenant.primary_color || '#7c3aed'}</span>
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Configuration</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Plan" value={<span className="capitalize inline-flex items-center gap-1">{planIcons[tenant.plan]}{tenant.plan}</span>} />
          <Field label="Status" value={<span className="capitalize">{tenant.status}</span>} />
          <Field label="Modules On" value={`${mods.on}/${mods.total}`} />
          <Field label="Max Users" value={tenant.max_users} />
          <Field label="Jobs / Month" value={tenant.max_jobs_per_month} />
          <Field label="Timezone" value={tenant.timezone} />
          <Field label="Company Code" value={<span className="inline-flex items-center gap-1"><Lock className="w-3 h-3 text-gray-400" />{tenant.company_code || '—'}</span>} mono />
          <Field label="Slug" value={<span className="inline-flex items-center gap-1"><Lock className="w-3 h-3 text-gray-400" />{tenant.slug}</span>} mono />
          <Field label="Domain" value={tenant.domain} mono />
        </div>
        <p className="text-[11px] text-gray-400 mt-3">Company code and slug are permanent login keys — read-only.</p>
      </div>

      {editing && (
        <EditTenantModal tenant={tenant} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onUpdated(); }} success={success} showError={showError} />
      )}

      {confirmStatus && (
        <ConfirmModal
          title={confirmStatus === 'suspended' ? 'Suspend this tenant?' : 'Reactivate this tenant?'}
          message={
            confirmStatus === 'suspended'
              ? <>Suspending <strong>{tenant.name}</strong> will block all of its users from signing in. This is reversible.</>
              : <>This will restore access for all users in <strong>{tenant.name}</strong>.</>
          }
          confirmLabel={confirmStatus === 'suspended' ? 'Suspend Tenant' : 'Reactivate'}
          destructive={confirmStatus === 'suspended'}
          busy={busy}
          onConfirm={() => updateStatus(confirmStatus)}
          onCancel={() => setConfirmStatus(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit modal — branding / plan / limits / domain (NOT company_code/slug)
// ---------------------------------------------------------------------------

function EditTenantModal({ tenant, onClose, onSaved, success, showError }: {
  tenant: Tenant;
  onClose: () => void;
  onSaved: () => void;
  success: (t: string, m?: string) => void;
  showError: (t: string, m?: string) => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [domain, setDomain] = useState(tenant.domain || '');
  const [logoUrl, setLogoUrl] = useState(tenant.logo_url || '');
  const [primaryColor, setPrimaryColor] = useState(tenant.primary_color || '#7c3aed');
  const [plan, setPlan] = useState(tenant.plan);
  const [maxUsers, setMaxUsers] = useState(String(tenant.max_users));
  const [maxJobs, setMaxJobs] = useState(String(tenant.max_jobs_per_month));
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const headers = await getJsonHeaders();
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          name,
          domain: domain || null,
          logo_url: logoUrl || null,
          primary_color: primaryColor,
          plan,
          max_users: parseInt(maxUsers) || tenant.max_users,
          max_jobs_per_month: parseInt(maxJobs) || tenant.max_jobs_per_month,
        }),
      });
      const json = await res.json();
      if (json.success) { success('Tenant updated', tenant.name); onSaved(); }
      else showError('Update failed', json.error);
    } catch (err: any) {
      showError('Error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'w-full px-3 py-2.5 min-h-[44px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Edit Tenant</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={save} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Company Name *</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Logo URL</label>
            <input type="text" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Primary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-11 h-11 rounded-lg border border-gray-200 dark:border-slate-700 bg-transparent" />
                <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className={`${inputCls} font-mono`} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Plan</label>
              <select value={plan} onChange={e => setPlan(e.target.value)} className={inputCls}>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Max Users</label>
              <input type="number" value={maxUsers} onChange={e => setMaxUsers(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Jobs / Month</label>
              <input type="number" value={maxJobs} onChange={e => setMaxJobs(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Custom Domain</label>
            <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="app.company.com" className={inputCls} />
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3 text-xs text-gray-500 dark:text-slate-400 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" /> Company code <span className="font-mono">{tenant.company_code || '—'}</span> and slug <span className="font-mono">{tenant.slug}</span> are permanent and cannot be changed.
          </div>
          <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 min-h-[44px] bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-xl text-sm font-semibold">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 px-4 py-2.5 min-h-[44px] bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{busy ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing tab — v1: deep-link to the subscription surface
// ---------------------------------------------------------------------------

function BillingTab({ tenant }: { tenant: Tenant }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-8 text-center">
      <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center mx-auto mb-4">
        <CreditCard className="w-6 h-6 text-violet-600" />
      </div>
      <h3 className="font-bold text-gray-900 dark:text-white mb-1">Subscription &amp; Billing</h3>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-5 max-w-sm mx-auto">
        Manage this tenant&rsquo;s plan, payment method, and invoices on the subscription surface.
      </p>
      <Link
        href={`/dashboard/admin/subscription?tenantId=${tenant.id}`}
        className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors"
      >
        Open Billing <ExternalLink className="w-4 h-4" />
      </Link>
    </div>
  );
}
