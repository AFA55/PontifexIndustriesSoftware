'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Building2, ArrowLeft, ArrowRight, Check, AlertCircle, Palette, Blocks,
  UserPlus, Rocket, Copy, CheckCircle2, ExternalLink,
} from 'lucide-react';
import { getHeaders, getJsonHeaders } from '@/components/platform/shared';
import { TOGGLEABLE_MODULES } from '@/lib/features';

const COMPANY_CODE_RE = /^[A-Z0-9_]{3,20}$/;

const STEPS = [
  { num: 1, title: 'Company', icon: Building2 },
  { num: 2, title: 'Branding', icon: Palette },
  { num: 3, title: 'Modules', icon: Blocks },
  { num: 4, title: 'First Admin', icon: UserPlus },
  { num: 5, title: 'Review & Launch', icon: Rocket },
] as const;

const PRESETS: Record<string, { label: string; description: string; keys: string[] }> = {
  starter: {
    label: 'Starter',
    description: 'The minimal office + field loop.',
    keys: ['scheduling', 'timecards', 'billing', 'customer_crm', 'completed_jobs', 'analytics'],
  },
  field_ops: {
    label: 'Field Ops',
    description: 'Starter plus shop, equipment, and compliance.',
    keys: [
      'scheduling', 'timecards', 'billing', 'customer_crm', 'completed_jobs', 'analytics',
      'nfc', 'equipment_fleet', 'inventory_control', 'maintenance', 'shop_tasks',
      'facilities_badging', 'silica_jha',
    ],
  },
  full: {
    label: 'Full',
    description: 'Everything on — matches Patriot today.',
    keys: TOGGLEABLE_MODULES.map((m) => m.key),
  },
};

interface DemoLead {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
}

interface ExistingTenant {
  slug: string;
  company_code: string | null;
}

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function codify(v: string) {
  return v.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/(^_|_$)/g, '').slice(0, 20);
}

function NewTenantWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromLead = searchParams.get('fromLead');

  const [step, setStep] = useState(1);
  const [existing, setExisting] = useState<ExistingTenant[]>([]);
  const [lead, setLead] = useState<DemoLead | null>(null);

  // Step 1 — Company
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [domain, setDomain] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);

  // Step 2 — Branding
  const [primaryColor, setPrimaryColor] = useState('#7c3aed');

  // Step 3 — Modules
  const [preset, setPreset] = useState<keyof typeof PRESETS>('full');
  const [modules, setModules] = useState<Record<string, boolean>>(
    () => Object.fromEntries(PRESETS.full.keys.map((k) => [k, true]))
  );

  // Step 4 — First admin
  const [createAdmin, setCreateAdmin] = useState(true);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminRole, setAdminRole] = useState('admin');

  // Plan/limits — sane platform defaults, not user-facing in the wizard.
  const plan = 'professional';
  const maxUsers = 50;
  const maxJobs = 500;

  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; slug: string; companyCode: string; id: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Auto-derive slug/code from name until the user edits them directly.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
    if (!codeTouched) setCompanyCode(codify(name));
  }, [name, slugTouched, codeTouched]);

  // Load existing tenants once (for live uniqueness feedback) + the lead if converting one.
  useEffect(() => {
    (async () => {
      try {
        const headers = await getHeaders();
        const res = await fetch('/api/admin/tenants', { headers });
        const json = await res.json();
        if (json?.success && Array.isArray(json.data)) {
          setExisting(json.data.map((t: any) => ({ slug: t.slug, company_code: t.company_code })));
        }
      } catch {
        // fail-soft: uniqueness just won't be pre-flagged client-side; the API still enforces it
      }
    })();
  }, []);

  useEffect(() => {
    if (!fromLead) return;
    (async () => {
      try {
        const res = await fetch('/api/demo-requests', { headers: await getHeaders() });
        const json = await res.json();
        const rows: DemoLead[] = json?.data ?? json ?? [];
        const match = Array.isArray(rows) ? rows.find((r) => r.id === fromLead) : null;
        if (match) {
          setLead(match);
          setName(match.company || match.name || '');
          if (match.email) setAdminEmail(match.email);
          if (match.name) setAdminName(match.name);
        }
      } catch {
        // fail-soft: wizard still works without the prefill
      }
    })();
  }, [fromLead]);

  const codeValid = COMPANY_CODE_RE.test(companyCode);
  const codeTaken = existing.some((t) => t.company_code?.toUpperCase() === companyCode.toUpperCase());
  const slugTaken = existing.some((t) => t.slug === slug);

  const step1Valid = !!name.trim() && !!slug.trim() && codeValid && !codeTaken && !slugTaken;
  const step4Valid = !createAdmin || (!!adminEmail.trim() && !!adminName.trim());

  const applyPreset = (key: keyof typeof PRESETS) => {
    setPreset(key);
    const on = new Set(PRESETS[key].keys);
    setModules(Object.fromEntries(TOGGLEABLE_MODULES.map((m) => [m.key, on.has(m.key)])));
  };

  const enabledCount = TOGGLEABLE_MODULES.filter((m) => modules[m.key]).length;

  const goNext = () => setStep((s) => Math.min(5, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    setBusy(true);
    setSubmitError(null);
    try {
      const features: Record<string, boolean> = {};
      for (const m of TOGGLEABLE_MODULES) features[m.key] = !!modules[m.key];

      const body: Record<string, unknown> = {
        name,
        slug,
        company_code: companyCode,
        domain: domain || undefined,
        plan,
        max_users: maxUsers,
        max_jobs_per_month: maxJobs,
        primary_color: primaryColor,
        features,
        demo_request_id: fromLead || undefined,
      };
      if (createAdmin && adminEmail) {
        body.admin_email = adminEmail;
        body.admin_name = adminName;
        body.admin_role = adminRole;
      }

      const headers = await getJsonHeaders();
      const res = await fetch('/api/admin/tenants', { method: 'POST', headers, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) {
        setResult({ name, slug, companyCode, id: json.data?.id });
      } else {
        setSubmitError(json.error || 'Failed to create tenant.');
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Unexpected error.');
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2.5 min-h-[44px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand/50';

  // ── Success screen ──────────────────────────────────────────────────────
  if (result) {
    const loginUrl = `https://www.pontifexindustries.com/login`;
    const shareText = `Company code: ${result.companyCode}\nLogin: ${loginUrl}`;
    return (
      <div className="max-w-xl mx-auto py-8">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-8 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{result.name} is live</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
            Send them the company code + login link below to get started.
          </p>
          <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 text-left space-y-2 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-slate-400">Company code</span>
              <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">{result.companyCode}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-slate-400">Login</span>
              <a href={loginUrl} target="_blank" rel="noreferrer" className="font-mono text-xs text-brand hover:underline flex items-center gap-1">
                pontifexindustries.com/login <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(shareText);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex-1 px-4 py-2.5 min-h-[44px] bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy details'}
            </button>
            <Link
              href={`/dashboard/platform/tenants/${result.id}`}
              className="flex-1 px-4 py-2.5 min-h-[44px] bg-brand hover:bg-brand-dark text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center"
            >
              View tenant
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Wizard ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/dashboard/platform/tenants" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to tenants
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 bg-brand/10 dark:bg-brand/20 rounded-xl flex items-center justify-center">
          <Building2 className="w-5 h-5 text-brand" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Onboard a new company</h1>
      </div>
      {lead && (
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-4 ml-14">
          Converting lead: <span className="font-medium">{lead.company || lead.name}</span>
        </p>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-1 mb-6 mt-4">
        {STEPS.map((s, i) => {
          const active = s.num === step;
          const done = s.num < step;
          const Icon = s.icon;
          return (
            <div key={s.num} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                    done
                      ? 'bg-brand border-brand text-white'
                      : active
                      ? 'border-brand text-brand'
                      : 'border-gray-200 dark:border-slate-700 text-gray-300 dark:text-slate-600'
                  }`}
                >
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={`text-[10px] font-medium text-center hidden sm:block ${active ? 'text-brand' : 'text-gray-400 dark:text-slate-500'}`}>
                  {s.title}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 -mt-4 sm:-mt-5 ${done ? 'bg-brand' : 'bg-gray-200 dark:bg-slate-700'}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4 min-h-[320px]">
        {step === 1 && (
          <>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Company</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Company Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Apex Concrete" className={inputCls} autoFocus />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">URL Slug *</label>
                <input
                  type="text" value={slug}
                  onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }}
                  placeholder="apex-concrete" className={`${inputCls} font-mono ${slug && slugTaken ? 'border-red-300 focus:ring-red-500/20' : ''}`}
                />
                {slug && slugTaken && <p className="text-[11px] mt-1 text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Already taken</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Company Code *</label>
                <input
                  type="text" value={companyCode}
                  onChange={(e) => { setCodeTouched(true); setCompanyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20)); }}
                  placeholder="APEX" className={`${inputCls} font-mono ${companyCode && (!codeValid || codeTaken) ? 'border-red-300 focus:ring-red-500/20' : ''}`}
                />
                <p className={`text-[11px] mt-1 flex items-center gap-1 ${companyCode && (!codeValid || codeTaken) ? 'text-red-500' : 'text-gray-400'}`}>
                  {!companyCode
                    ? 'Login key — 3–20 chars: A–Z, 0–9, _ (permanent)'
                    : codeTaken
                    ? <><AlertCircle className="w-3 h-3" />Already taken</>
                    : !codeValid
                    ? <><AlertCircle className="w-3 h-3" />3–20 chars: A–Z, 0–9, _</>
                    : <><Check className="w-3 h-3 text-green-500" />Available</>}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Custom Domain (optional)</label>
              <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="app.apexconcrete.com" className={inputCls} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Branding</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Primary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-11 h-11 rounded-lg border border-gray-200 dark:border-slate-700 bg-transparent" />
                <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className={`${inputCls} font-mono max-w-[140px]`} />
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Logo upload happens after launch, from Settings → Branding — keeps this step fast.</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">Login page preview</p>
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="p-6 flex flex-col items-center gap-3" style={{ background: `linear-gradient(135deg, ${primaryColor}22, #0f172a)` }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: primaryColor }}>
                    {(name || 'Co').slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-white font-semibold text-sm">Welcome to {name || 'your company'}</p>
                  <div className="w-full max-w-[220px] h-9 rounded-lg bg-white/10 border border-white/15" />
                  <div className="w-full max-w-[220px] h-9 rounded-lg bg-white/10 border border-white/15" />
                  <div className="w-full max-w-[220px] h-9 rounded-lg flex items-center justify-center text-xs font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                    Sign In
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Modules</h2>
              <span className="text-[11px] text-gray-400">{enabledCount}/{TOGGLEABLE_MODULES.length} on</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((key) => (
                <button
                  key={key} type="button" onClick={() => applyPreset(key)}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    preset === key ? 'bg-brand/10 dark:bg-brand/15 border-brand/40' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{PRESETS[key].label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{PRESETS[key].description}</p>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {TOGGLEABLE_MODULES.map((m) => {
                const on = !!modules[m.key];
                return (
                  <button
                    key={m.key} type="button"
                    onClick={() => { setPreset('full'); setModules((s) => ({ ...s, [m.key]: !s[m.key] })); }}
                    className={`flex items-center gap-2 p-2.5 min-h-[44px] rounded-xl border text-left transition-colors ${
                      on ? 'bg-brand/10 dark:bg-brand/15 border-brand/40' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${on ? 'bg-brand' : 'bg-gray-300 dark:bg-slate-600'}`}>
                      {on && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className="text-xs font-medium text-gray-700 dark:text-slate-200 truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400">Recorded as configuration; gating activates in a later phase.</p>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">First Admin</h2>
            <label className="flex items-center gap-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={createAdmin} onChange={(e) => setCreateAdmin(e.target.checked)} className="w-4 h-4 accent-brand" />
              Create &amp; invite a first admin now
            </label>
            {createAdmin && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Admin Name *</label>
                  <input type="text" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Jane Doe" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Admin Email *</label>
                  <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="owner@apex.com" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Role</label>
                  <select value={adminRole} onChange={(e) => setAdminRole(e.target.value)} className={inputCls}>
                    <option value="admin">Admin</option>
                    <option value="operations_manager">Operations Manager</option>
                  </select>
                </div>
              </div>
            )}
            {!createAdmin && (
              <p className="text-xs text-gray-400">You can invite the first admin later from the tenant's Users tab.</p>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Review &amp; Launch</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500 dark:text-slate-400">Company</dt><dd className="font-medium text-gray-900 dark:text-white">{name}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500 dark:text-slate-400">Company code</dt><dd className="font-mono font-medium text-gray-900 dark:text-white">{companyCode}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500 dark:text-slate-400">Slug</dt><dd className="font-mono text-gray-900 dark:text-white">{slug}</dd></div>
              <div className="flex justify-between items-center"><dt className="text-gray-500 dark:text-slate-400">Color</dt><dd className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: primaryColor }} /><span className="font-mono text-gray-900 dark:text-white">{primaryColor}</span></dd></div>
              <div className="flex justify-between"><dt className="text-gray-500 dark:text-slate-400">Modules</dt><dd className="font-medium text-gray-900 dark:text-white">{enabledCount}/{TOGGLEABLE_MODULES.length} on ({PRESETS[preset]?.label ?? 'Custom'})</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500 dark:text-slate-400">First admin</dt><dd className="font-medium text-gray-900 dark:text-white">{createAdmin ? `${adminName} <${adminEmail}>` : 'None yet'}</dd></div>
            </dl>
            {submitError && (
              <p className="text-xs text-red-500 flex items-center gap-1 bg-red-50 dark:bg-red-500/10 rounded-lg p-2.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />{submitError}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex gap-3 mt-5">
        {step > 1 && (
          <button type="button" onClick={goBack} className="flex-1 px-4 py-2.5 min-h-[44px] bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition-colors">
            Back
          </button>
        )}
        {step < 5 ? (
          <button
            type="button" onClick={goNext}
            disabled={(step === 1 && !step1Valid) || (step === 4 && !step4Valid)}
            className="flex-1 px-4 py-2.5 min-h-[44px] bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button" onClick={submit} disabled={busy}
            className="flex-1 px-4 py-2.5 min-h-[44px] bg-brand hover:bg-brand-dark disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            {busy ? 'Launching…' : <>Launch company <Rocket className="w-4 h-4" /></>}
          </button>
        )}
      </div>
    </div>
  );
}

export default function NewTenantPage() {
  return (
    <Suspense fallback={null}>
      <NewTenantWizard />
    </Suspense>
  );
}
