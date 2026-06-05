'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import { getJsonHeaders } from '@/components/platform/shared';
import { TOGGLEABLE_MODULES } from '@/lib/features';

const COMPANY_CODE_RE = /^[A-Z0-9_]{3,20}$/;

export default function NewTenantPage() {
  const router = useRouter();
  const { success, error: showError } = useNotifications();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [domain, setDomain] = useState('');
  const [plan, setPlan] = useState('professional');
  const [maxUsers, setMaxUsers] = useState('50');
  const [maxJobs, setMaxJobs] = useState('500');
  const [primaryColor, setPrimaryColor] = useState('#7c3aed');

  // optional module selection — default all toggleable ON
  const [modules, setModules] = useState<Record<string, boolean>>(
    () => Object.fromEntries(TOGGLEABLE_MODULES.map(m => [m.key, true]))
  );

  // optional first admin
  const [createAdmin, setCreateAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminRole, setAdminRole] = useState('admin');

  const [busy, setBusy] = useState(false);

  // auto slug + company code from name (until user edits them)
  const [slugTouched, setSlugTouched] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);
  useEffect(() => {
    if (!slugTouched) setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    if (!codeTouched) setCompanyCode(name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/(^_|_$)/g, '').slice(0, 20));
  }, [name, slugTouched, codeTouched]);

  const codeValid = COMPANY_CODE_RE.test(companyCode);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeValid) {
      showError('Invalid company code', 'Use 3–20 uppercase letters, digits, or underscores.');
      return;
    }
    setBusy(true);
    try {
      // build features map from toggleable selection (core never included)
      const features: Record<string, boolean> = {};
      for (const m of TOGGLEABLE_MODULES) features[m.key] = !!modules[m.key];

      const body: Record<string, unknown> = {
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        company_code: companyCode,
        domain: domain || undefined,
        plan,
        max_users: parseInt(maxUsers) || 50,
        max_jobs_per_month: parseInt(maxJobs) || 500,
        primary_color: primaryColor,
        features,
      };
      if (createAdmin && adminEmail) {
        body.admin_email = adminEmail;
        body.admin_name = adminName || undefined;
        body.role = adminRole;
      }

      const headers = await getJsonHeaders();
      const res = await fetch('/api/admin/tenants', { method: 'POST', headers, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) {
        success('Tenant created', `${name} is now on the platform`);
        const newId = json.data?.id;
        router.push(newId ? `/dashboard/platform/tenants/${newId}` : '/dashboard/platform/tenants');
      } else {
        showError('Failed to create tenant', json.error);
      }
    } catch (err: any) {
      showError('Error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'w-full px-3 py-2.5 min-h-[44px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300';

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/dashboard/platform/tenants" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to tenants
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 bg-violet-100 dark:bg-violet-950/40 rounded-xl flex items-center justify-center">
          <Building2 className="w-5 h-5 text-violet-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Create New Tenant</h1>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {/* Identity */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Identity</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Company Name *</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Apex Concrete" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">URL Slug *</label>
              <input
                type="text" required value={slug}
                onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }}
                placeholder="apex-concrete" className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Company Code *</label>
              <input
                type="text" required value={companyCode}
                onChange={e => { setCodeTouched(true); setCompanyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20)); }}
                placeholder="APEX" className={`${inputCls} font-mono ${companyCode && !codeValid ? 'border-red-300 focus:ring-red-500/20' : ''}`}
              />
              <p className={`text-[11px] mt-1 flex items-center gap-1 ${companyCode && !codeValid ? 'text-red-500' : 'text-gray-400'}`}>
                {companyCode ? (codeValid ? <><Check className="w-3 h-3 text-green-500" />Valid</> : <><AlertCircle className="w-3 h-3" />3–20 chars: A–Z, 0–9, _</>) : 'Login key — 3–20 chars: A–Z, 0–9, _ (permanent)'}
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Custom Domain</label>
            <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="app.apexconcrete.com" className={inputCls} />
          </div>
        </section>

        {/* Plan & limits */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Plan &amp; Limits</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Plan</label>
              <select value={plan} onChange={e => setPlan(e.target.value)} className={inputCls}>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Primary Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-11 h-11 rounded-lg border border-gray-200 dark:border-slate-700 bg-transparent" />
              <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className={`${inputCls} font-mono max-w-[140px]`} />
            </div>
          </div>
        </section>

        {/* Modules */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Modules</h2>
            <div className="flex gap-3 text-xs">
              <button type="button" onClick={() => setModules(Object.fromEntries(TOGGLEABLE_MODULES.map(m => [m.key, true])))} className="text-violet-600 font-medium">All on</button>
              <button type="button" onClick={() => setModules(Object.fromEntries(TOGGLEABLE_MODULES.map(m => [m.key, false])))} className="text-gray-400 font-medium">All off</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TOGGLEABLE_MODULES.map(m => {
              const on = !!modules[m.key];
              return (
                <button
                  key={m.key} type="button"
                  onClick={() => setModules(s => ({ ...s, [m.key]: !s[m.key] }))}
                  className={`flex items-center gap-2 p-2.5 min-h-[44px] rounded-xl border text-left transition-colors ${
                    on ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'
                  }`}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${on ? 'bg-violet-600' : 'bg-gray-300 dark:bg-slate-600'}`}>
                    {on && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <span className="text-xs font-medium text-gray-700 dark:text-slate-200 truncate">{m.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">Recorded as configuration; gating activates in a later phase. Core modules are always on.</p>
        </section>

        {/* First admin */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
          <label className="flex items-center gap-2.5 text-sm font-bold text-gray-900 dark:text-white cursor-pointer">
            <input type="checkbox" checked={createAdmin} onChange={e => setCreateAdmin(e.target.checked)} className="w-4 h-4 accent-violet-600" />
            Create &amp; invite a first admin
          </label>
          {createAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Admin Email *</label>
                <input type="email" required={createAdmin} value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="owner@apex.com" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Admin Name *</label>
                <input type="text" required={createAdmin} value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Jane Doe" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Role</label>
                <select value={adminRole} onChange={e => setAdminRole(e.target.value)} className={inputCls}>
                  <option value="admin">Admin</option>
                  <option value="operations_manager">Operations Manager</option>
                </select>
              </div>
            </div>
          )}
        </section>

        <div className="flex gap-3">
          <Link href="/dashboard/platform/tenants" className="flex-1 px-4 py-2.5 min-h-[44px] flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition-colors">Cancel</Link>
          <button type="submit" disabled={busy || !codeValid} className="flex-1 px-4 py-2.5 min-h-[44px] bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors">{busy ? 'Creating…' : 'Create Tenant'}</button>
        </div>
      </form>
    </div>
  );
}
