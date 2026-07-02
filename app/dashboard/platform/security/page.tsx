'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  RefreshCw, ShieldCheck, ShieldAlert, Users as UsersIcon, Clock,
  ScrollText, ChevronDown, ChevronRight, CalendarClock, PackageSearch,
  Lock, CheckCircle2, Info,
} from 'lucide-react';
import { getHeaders } from '@/components/platform/shared';

// ---------------------------------------------------------------------------
// Static, dated audit summary — see the header comment in
// app/api/admin/platform/security/route.ts for why this is NOT live-computed.
// Re-run the underlying audits periodically and bump AUDIT_DATE when you do.
// ---------------------------------------------------------------------------

const AUDIT_DATE = 'Jul 2, 2026';

const RLS_SUMMARY = {
  tablesWithRls: 147,
  tablesTotal: 147,
  note: 'All public schema tables have RLS enabled. 2 tables (reminder_log, stripe_webhook_events) have RLS on with no policies defined, which defaults to deny-all — not a gap, just nothing reads/writes them via PostgREST today.',
};

const DEPENDENCY_SUMMARY = {
  critical: 0,
  high: 3,
  note: 'HIGH findings are confined to native-build CLI tooling (Capacitor/Xcode/Gradle toolchains) that never ships inside the deployed Next.js app — not reachable from production traffic.',
};

const IDOR_SUMMARY = {
  routesFixed: 8,
  routesRemaining: 0,
  note: 'Cross-tenant IDOR sweep found and fixed 8 routes missing a tenant_id scope check; re-verified adversarially afterward with 0 remaining.',
};

// ---------------------------------------------------------------------------
// Types for the live per-tenant signals
// ---------------------------------------------------------------------------

interface StaleAccount {
  id: string;
  email: string;
  fullName: string | null;
}

interface TenantSecuritySignal {
  tenantId: string;
  tenantName: string;
  companyCode: string | null;
  totalUsers: number;
  activeUsers: number;
  roleDistribution: Record<string, number>;
  adminTierCount: number;
  adminTierRatio: number;
  overProvisioned: boolean;
  staleAccountCount: number;
  staleAccounts: StaleAccount[];
  recentAuditEvents: number;
}

interface SecurityData {
  tenants: TenantSecuritySignal[];
  timecardsAvailable: boolean;
  auditLogsAvailable: boolean;
  staleWindowDays: number;
  staleAccountCaveat: string;
}

function roleLabel(role: string) {
  return role.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ---------------------------------------------------------------------------
// Static summary card
// ---------------------------------------------------------------------------

function StaticSummaryCard({
  icon: Icon, title, accent, children,
}: {
  icon: React.ElementType;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-tenant row
// ---------------------------------------------------------------------------

function TenantSecurityRow({ signal, staleWindowDays }: { signal: TenantSecuritySignal; staleWindowDays: number }) {
  const [expanded, setExpanded] = useState(false);
  const roles = Object.entries(signal.roleDistribution).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3 p-4 min-h-[44px] hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate flex items-center gap-1.5">
              {signal.tenantName}
              {signal.overProvisioned && <ShieldAlert className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
            </p>
            <p className="text-[11px] text-gray-400 font-mono truncate">{signal.companyCode || signal.tenantId}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-center hidden sm:block">
            <p className="text-sm font-bold text-gray-900 dark:text-white">{signal.totalUsers}</p>
            <p className="text-[10px] text-gray-400">Users</p>
          </div>
          <div className="text-center">
            <p className={`text-sm font-bold ${signal.overProvisioned ? 'text-amber-600' : 'text-gray-900 dark:text-white'}`}>
              {signal.adminTierCount}
              <span className="text-[10px] text-gray-400 font-normal"> ({Math.round(signal.adminTierRatio * 100)}%)</span>
            </p>
            <p className="text-[10px] text-gray-400">Admin-tier</p>
          </div>
          <div className="text-center">
            <p className={`text-sm font-bold ${signal.staleAccountCount > 0 ? 'text-amber-600' : 'text-gray-900 dark:text-white'}`}>
              {signal.staleAccountCount}
            </p>
            <p className="text-[10px] text-gray-400">Stale</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-slate-800 space-y-4">
          {signal.overProvisioned && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
              <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {Math.round(signal.adminTierRatio * 100)}% of users are admin-tier (admin/operations_manager/super_admin) — above the 40% watch threshold. Worth confirming this staffing is intentional.
              </p>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Role distribution</p>
            <div className="flex flex-wrap gap-1.5">
              {roles.map(([role, count]) => (
                <span
                  key={role}
                  className="px-2 py-1 text-[11px] font-medium rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300"
                >
                  {roleLabel(role)}: {count}
                </span>
              ))}
              {roles.length === 0 && <span className="text-xs text-gray-400">No users.</span>}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Stale accounts ({staleWindowDays}d no timecard activity)
            </p>
            {signal.staleAccountCount === 0 ? (
              <p className="text-xs text-gray-400">None — every active user has recent timecard activity.</p>
            ) : (
              <ul className="space-y-1">
                {signal.staleAccounts.map((a) => (
                  <li key={a.id} className="text-xs text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    {a.fullName || a.email} <span className="text-gray-400">({a.email})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
            <ScrollText className="w-3.5 h-3.5" /> {signal.recentAuditEvents} audit-log event{signal.recentAuditEvents === 1 ? '' : 's'} in the last {staleWindowDays}d
          </div>

          <Link
            href={`/dashboard/platform/tenants/${signal.tenantId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
          >
            Manage tenant <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlatformSecurityPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SecurityData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/platform/security', { headers });
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(json.error || 'Failed to load security signals');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const overProvisionedCount = (data?.tenants || []).filter((t) => t.overProvisioned).length;
  const totalStale = (data?.tenants || []).reduce((sum, t) => sum + t.staleAccountCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-500" /> Security
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Platform-wide posture (point-in-time audit) + live per-tenant signals
          </p>
        </div>
        <button
          onClick={load}
          title="Refresh"
          className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-gray-900 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Platform-wide posture — static, dated, explicitly not live */}
      {/* ---------------------------------------------------------------- */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-500 flex items-center gap-1.5">
            <Lock className="w-4 h-4" /> Platform-Wide Posture
          </h2>
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <CalendarClock className="w-3.5 h-3.5" /> As of {AUDIT_DATE}
          </span>
        </div>

        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 mb-4">
          <Info className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-sky-700 dark:text-sky-300">
            This section is a point-in-time audit summary, not live monitoring — the platform is a single shared Postgres database, so RLS coverage and dependency scans aren&rsquo;t something a request handler can safely recompute on every page load. Re-run the underlying audits periodically and update the date above.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StaticSummaryCard icon={ShieldCheck} title="RLS Coverage" accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            <p className="text-2xl font-black text-gray-900 dark:text-white leading-none mb-1">
              {RLS_SUMMARY.tablesWithRls}/{RLS_SUMMARY.tablesTotal}
            </p>
            <p className="text-[11px] text-gray-400 mb-2">tables with RLS enabled</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">{RLS_SUMMARY.note}</p>
          </StaticSummaryCard>

          <StaticSummaryCard icon={PackageSearch} title="Dependency Audit" accent="bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
            <p className="text-2xl font-black text-gray-900 dark:text-white leading-none mb-1">
              {DEPENDENCY_SUMMARY.critical} critical
            </p>
            <p className="text-[11px] text-gray-400 mb-2">{DEPENDENCY_SUMMARY.high} high (npm audit)</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">{DEPENDENCY_SUMMARY.note}</p>
          </StaticSummaryCard>

          <StaticSummaryCard icon={ShieldAlert} title="Cross-Tenant IDOR Sweep" accent="bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
            <p className="text-2xl font-black text-gray-900 dark:text-white leading-none mb-1">
              {IDOR_SUMMARY.routesRemaining} remaining
            </p>
            <p className="text-[11px] text-gray-400 mb-2">{IDOR_SUMMARY.routesFixed} fixed this audit</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">{IDOR_SUMMARY.note}</p>
          </StaticSummaryCard>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Per-tenant signals — live */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-500 flex items-center gap-1.5">
            <UsersIcon className="w-4 h-4" /> Per-Tenant Signals
          </h2>
          {!loading && data && (
            <span className="text-[11px] text-gray-400">
              {overProvisionedCount} over-provisioned · {totalStale} stale accounts
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mb-4">Live-queried, not cached — refresh anytime.</p>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-7 h-7 text-amber-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-10 px-3 rounded-xl border border-dashed border-red-200 dark:border-red-900">
            <ShieldAlert className="w-7 h-7 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : !data || data.tenants.length === 0 ? (
          <div className="text-center py-10 px-3 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
            <UsersIcon className="w-7 h-7 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-slate-400">No tenants yet.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {data.tenants.map((signal) => (
                <TenantSecurityRow key={signal.tenantId} signal={signal} staleWindowDays={data.staleWindowDays} />
              ))}
            </div>

            <div className="mt-4 space-y-1.5">
              {!data.timecardsAvailable && (
                <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" /> timecards table unavailable — stale-account detection is disabled.
                </p>
              )}
              {!data.auditLogsAvailable && (
                <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" /> audit_logs table unavailable — activity counts are disabled.
                </p>
              )}
              <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {data.staleAccountCaveat}
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
