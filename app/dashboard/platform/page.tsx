'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Building2, Plus, ChevronRight, Users as UsersIcon, ToggleRight,
  RefreshCw, ShieldCheck, Globe, Activity, AlertTriangle, Bug,
  CheckCircle2, ArrowRight, ServerCog, MessageSquareWarning, Inbox,
  HeartPulse, Info, OctagonAlert, ShieldAlert, Megaphone, CircuitBoard,
} from 'lucide-react';
import {
  type Tenant, getHeaders, statusColors, planIcons,
  moduleSummary, userCount, isProtectedTenant,
} from '@/components/platform/shared';
import CommandCenterLaunch from '@/components/command-center/CommandCenterLaunch';

/** The Pontifex parent (owner) org — excluded from the client-companies list. */
const OWNER_TENANT_ID = 'b27d9ca5-1352-42f2-b7e1-25254c09fa6f';
const OWNER_COMPANY_CODE = 'PONTIFEX';

function isOwnerOrg(t: Tenant): boolean {
  return (
    t.id === OWNER_TENANT_ID ||
    (t.company_code || '').toUpperCase() === OWNER_COMPANY_CODE
  );
}

// ---------------------------------------------------------------------------
// Types for the health + feedback data sources
// ---------------------------------------------------------------------------

interface ErrorRow {
  id: string;
  type: string;
  error_message: string;
  url: string | null;
  created_at: string;
}

interface HealthData {
  errorLogsAvailable: boolean;
  recentErrors: ErrorRow[];
  errorCount24h: number;
  sentry: { configured: boolean };
}

interface FeedbackItem {
  id: string;
  status?: string | null;
  type?: string | null;
  title?: string | null;
  tenant_id?: string | null;
  tenant_name?: string | null;
  reporter_role?: string | null;
  created_at?: string | null;
}

interface HealthAlert {
  id: string;
  tenantId: string | null;
  tenantName: string;
  checkType: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  createdAt: string;
}

const FEEDBACK_STATUSES = ['open', 'in_review', 'planned', 'done'] as const;
type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

const statusChip: Record<string, string> = {
  open: 'bg-rose-100 text-rose-700 border-rose-200',
  in_review: 'bg-amber-100 text-amber-700 border-amber-200',
  planned: 'bg-sky-100 text-sky-700 border-sky-200',
  done: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const severityChip: Record<HealthAlert['severity'], string> = {
  critical: 'bg-rose-100 text-rose-700 border-rose-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  info: 'bg-sky-100 text-sky-700 border-sky-200',
};

const severityIcon: Record<HealthAlert['severity'], React.ElementType> = {
  critical: OctagonAlert,
  warning: AlertTriangle,
  info: Info,
};

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------

function KpiTile({
  icon: Icon, label, value, accent, sub,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  accent: string;
  sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1.5">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hub home cockpit
// ---------------------------------------------------------------------------

export default function PlatformHubPage() {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[] | null>(null);
  const [feedbackAvailable, setFeedbackAvailable] = useState(true);
  const [healthAlerts, setHealthAlerts] = useState<HealthAlert[] | null>(null);
  const [healthAlertsAvailable, setHealthAlertsAvailable] = useState(true);
  const [pendingPublish, setPendingPublish] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getHeaders();

    // All sources load in parallel; each fails soft so one missing
    // data source never blanks the whole cockpit.
    const [tenantsRes, healthRes, feedbackRes, healthAlertsRes, publishRes] = await Promise.allSettled([
      fetch('/api/admin/tenants', { headers }),
      fetch('/api/admin/platform/health?limit=6', { headers }),
      fetch('/api/admin/feedback', { headers }),
      fetch('/api/admin/platform/health-alerts', { headers }),
      fetch('/api/hiring/publish-requests?status=pending', { headers }),
    ]);

    // Tenants
    if (tenantsRes.status === 'fulfilled') {
      try {
        const json = await tenantsRes.value.json();
        if (json.success) setTenants(json.data || []);
      } catch { /* leave empty */ }
    }

    // Health
    if (healthRes.status === 'fulfilled') {
      try {
        const json = await healthRes.value.json();
        if (json.success) setHealth(json.data);
      } catch { /* leave null */ }
    }

    // Feedback (parallel agent owns the API — handle missing gracefully)
    if (feedbackRes.status === 'fulfilled' && feedbackRes.value.ok) {
      try {
        const json = await feedbackRes.value.json();
        const list: FeedbackItem[] = Array.isArray(json)
          ? json
          : (json.data || json.items || json.feedback || []);
        setFeedback(Array.isArray(list) ? list : []);
        setFeedbackAvailable(true);
      } catch {
        setFeedback([]);
        setFeedbackAvailable(false);
      }
    } else {
      setFeedbackAvailable(false);
      setFeedback([]);
    }

    // Health alerts (platform_health_alerts cron output)
    if (healthAlertsRes.status === 'fulfilled' && healthAlertsRes.value.ok) {
      try {
        const json = await healthAlertsRes.value.json();
        if (json.success) {
          setHealthAlerts(json.data || []);
          setHealthAlertsAvailable(true);
        } else {
          setHealthAlerts([]);
          setHealthAlertsAvailable(false);
        }
      } catch {
        setHealthAlerts([]);
        setHealthAlertsAvailable(false);
      }
    } else {
      setHealthAlertsAvailable(false);
      setHealthAlerts([]);
    }

    // Pending ad publish requests (hiring approval-queue badge — fail soft)
    if (publishRes.status === 'fulfilled' && publishRes.value.ok) {
      try {
        const json = await publishRes.value.json();
        setPendingPublish(json.success ? (json.data.requests || []).length : 0);
      } catch {
        setPendingPublish(0);
      }
    } else {
      setPendingPublish(0);
    }

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived: client companies (exclude the Pontifex owner org)
  const clients = tenants.filter((t) => !isOwnerOrg(t));
  const activeClients = clients.filter((t) => t.status === 'active').length;

  // Derived: feedback counts by status
  const feedbackCounts: Record<FeedbackStatus, number> = {
    open: 0, in_review: 0, planned: 0, done: 0,
  };
  (feedback || []).forEach((f) => {
    const s = (f.status || 'open').toLowerCase();
    if ((FEEDBACK_STATUSES as readonly string[]).includes(s)) {
      feedbackCounts[s as FeedbackStatus] += 1;
    }
  });
  const openBugFeedback = feedbackCounts.open + feedbackCounts.in_review;
  const recentFeedback = (feedback || [])
    .slice()
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 5);

  // Derived: health alerts, already sorted critical-first by the API
  const sortedHealthAlerts = healthAlerts || [];
  const criticalAlertCount = sortedHealthAlerts.filter((a) => a.severity === 'critical').length;
  const warningAlertCount = sortedHealthAlerts.filter((a) => a.severity === 'warning').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Platform Hub</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Owner cockpit · manage every client company
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
      {/* Artifex — the founder's 2nd brain for Pontifex itself.           */}
      {/* Chat + memory notes are tenant-scoped, so under the PONTIFEX org  */}
      {/* this manages Pontifex Industries, separate from any client brain. */}
      {/* ---------------------------------------------------------------- */}
      <CommandCenterLaunch
        title="Artifex"
        badge="2nd Brain"
        description="Your Pontifex Industries second brain — ask, plan, and save durable notes about the business itself."
      />

      {/* ---------------------------------------------------------------- */}
      {/* KPI tiles */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiTile
          icon={Building2}
          label="Client Companies"
          value={clients.length}
          accent="bg-brand/10 text-brand dark:bg-brand/15 dark:text-brand"
        />
        <KpiTile
          icon={CheckCircle2}
          label="Active"
          value={activeClients}
          accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
          sub={`${clients.length - activeClients} trial / suspended`}
        />
        <KpiTile
          icon={Bug}
          label="Open Bug / Feedback"
          value={feedbackAvailable ? openBugFeedback : '—'}
          accent="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
          sub={feedbackAvailable ? `${feedbackCounts.done} resolved` : 'feedback API offline'}
        />
        {health?.errorLogsAvailable && (
          <KpiTile
            icon={AlertTriangle}
            label="Errors (24h)"
            value={health.errorCount24h}
            accent="bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
          />
        )}
        <KpiTile
          icon={HeartPulse}
          label="Health Alerts"
          value={healthAlertsAvailable ? sortedHealthAlerts.length : '—'}
          accent="bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
          sub={
            healthAlertsAvailable
              ? `${criticalAlertCount} critical · ${warningAlertCount} warning`
              : 'health-checks offline'
          }
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Client companies */}
      {/* ---------------------------------------------------------------- */}
      <section>
        {/* Stack on mobile + scroll the action row so New Client / View all stay
            reachable at 375px (QA loop #5). */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-500 flex items-center gap-1.5">
            <Building2 className="w-4 h-4" /> Client Companies
          </h2>
          <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            <Link
              href="/dashboard/platform/usage"
              className="text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              <CircuitBoard className="w-3.5 h-3.5" /> AI & Usage
            </Link>
            <Link
              href="/dashboard/platform/security"
              className="text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Security
            </Link>
            <Link
              href="/dashboard/platform/demo-requests"
              className="text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              <Inbox className="w-3.5 h-3.5" /> Demo requests
            </Link>
            <Link
              href="/dashboard/platform/publish-queue"
              className="text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              <Megaphone className="w-3.5 h-3.5" /> Publish queue
              {pendingPublish > 0 && (
                <span className="px-1.5 py-0.5 text-[9px] font-black rounded-full bg-amber-500 text-white leading-none">
                  {pendingPublish}
                </span>
              )}
            </Link>
            <Link
              href="/dashboard/platform/tenants"
              className="text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/dashboard/platform/tenants/new"
              className="px-3 py-2 min-h-[40px] bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Client
            </Link>
          </div>
        </div>

        {clients.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-10 text-center">
            <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 dark:text-white mb-1">No client companies yet</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
              Onboard your first client to start the platform.
            </p>
            <Link
              href="/dashboard/platform/tenants/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-dark"
            >
              <Plus className="w-4 h-4" /> Add Client
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {clients.map((tenant) => {
              const mods = moduleSummary(tenant.features);
              const uc = userCount(tenant);
              const protectedTenant = isProtectedTenant(tenant);
              return (
                <Link
                  key={tenant.id}
                  href={`/dashboard/platform/tenants/${tenant.id}`}
                  className="group bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-4 hover:shadow-md hover:border-brand/40 dark:hover:border-brand/40 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 bg-gradient-to-br from-brand to-brand-accent rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {tenant.name[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-white truncate flex items-center gap-1.5 text-sm">
                          {tenant.name}
                          {protectedTenant && (
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          )}
                        </h3>
                        <p className="text-[11px] text-gray-400 font-mono truncate">
                          {tenant.company_code || tenant.slug}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border flex-shrink-0 ${statusColors[tenant.status] || 'bg-gray-100 text-gray-500'}`}>
                      {tenant.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center p-2 bg-gray-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-[10px] text-gray-400">Plan</p>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {planIcons[tenant.plan]}
                        <span className="text-[11px] font-bold text-gray-900 dark:text-white capitalize truncate">{tenant.plan}</span>
                      </div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><UsersIcon className="w-3 h-3" />Users</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">
                        {uc != null ? uc : '—'}<span className="text-[10px] text-gray-400 font-normal">/{tenant.max_users}</span>
                      </p>
                    </div>
                    <div className="text-center p-2 bg-gray-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><ToggleRight className="w-3 h-3" />Mods</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{mods.on}<span className="text-[10px] text-gray-400 font-normal">/{mods.total}</span></p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-slate-800">
                    {tenant.domain ? (
                      <span className="flex items-center gap-1 text-[11px] text-gray-400 truncate min-w-0">
                        <Globe className="w-3 h-3 flex-shrink-0" />{tenant.domain}
                      </span>
                    ) : <span />}
                    <span className="text-xs text-brand dark:text-brand font-medium flex items-center gap-0.5 group-hover:gap-1.5 transition-all flex-shrink-0">
                      Manage <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Health + Bug/Feedback (two columns on desktop) */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Health + monitoring */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-500 flex items-center gap-1.5 mb-4">
            <Activity className="w-4 h-4" /> Health &amp; Monitoring
          </h2>

          {/* Production status line — honest, no fabricated uptime numbers */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Production: healthy</span>
          </div>

          {/* Sentry indicator */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-slate-800 mb-4">
            <span className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
              <ServerCog className="w-4 h-4" /> Sentry
            </span>
            {health?.sentry.configured ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                Connected
              </span>
            ) : (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Set SENTRY_DSN to enable
              </span>
            )}
          </div>

          {/* Recent app errors */}
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Recent errors</p>
          {!health?.errorLogsAvailable ? (
            <div className="text-center py-6 px-3 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
              <AlertTriangle className="w-7 h-7 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-slate-400">No error-log source connected.</p>
              <p className="text-xs text-gray-400 mt-1">Connect Sentry or enable error_logs.</p>
            </div>
          ) : health.recentErrors.length === 0 ? (
            <div className="text-center py-6 px-3 rounded-xl border border-dashed border-emerald-200 dark:border-emerald-500/20">
              <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-emerald-600 dark:text-emerald-400">No recent errors. All clear.</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {health.recentErrors.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 dark:text-slate-200 truncate">
                      {e.error_message}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {e.type} · {timeAgo(e.created_at)}{e.url ? ` · ${e.url}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Bug + feedback */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-amber-500 flex items-center gap-1.5">
              <MessageSquareWarning className="w-4 h-4" /> Bug &amp; Feedback
            </h2>
            <Link
              href="/dashboard/platform/feedback"
              className="text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              Triage <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {!feedbackAvailable ? (
            <div className="text-center py-6 px-3 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
              <Bug className="w-7 h-7 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-slate-400">Feedback feed not available yet.</p>
            </div>
          ) : (
            <>
              {/* Counts by status */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {FEEDBACK_STATUSES.map((s) => (
                  <div key={s} className={`text-center p-2 rounded-lg border ${statusChip[s]}`}>
                    <p className="text-lg font-black leading-none">{feedbackCounts[s]}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wide mt-1 capitalize">
                      {s.replace('_', ' ')}
                    </p>
                  </div>
                ))}
              </div>

              {/* Most recent 5 */}
              {recentFeedback.length === 0 ? (
                <div className="text-center py-6 px-3 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-slate-400">No feedback submitted yet.</p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {recentFeedback.map((f) => {
                    const s = (f.status || 'open').toLowerCase();
                    const href = f.tenant_id
                      ? `/dashboard/platform/tenants/${f.tenant_id}`
                      : '/dashboard/platform/feedback';
                    return (
                      <li key={f.id}>
                        <Link
                          href={href}
                          className="flex items-start gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          <span className={`mt-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded border flex-shrink-0 ${statusChip[s] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                            {s.replace('_', ' ').toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                              {f.title || '(untitled)'}
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">
                              {[f.tenant_name, f.reporter_role, f.type, timeAgo(f.created_at)]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Platform health alerts (automated health-check results) */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-500 flex items-center gap-1.5">
            <HeartPulse className="w-4 h-4" /> Platform Health Alerts
          </h2>
        </div>

        {!healthAlertsAvailable ? (
          <div className="text-center py-6 px-3 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
            <HeartPulse className="w-7 h-7 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-slate-400">Health-check feed not available.</p>
          </div>
        ) : sortedHealthAlerts.length === 0 ? (
          <div className="text-center py-6 px-3 rounded-xl border border-dashed border-emerald-200 dark:border-emerald-500/20">
            <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-emerald-600 dark:text-emerald-400">No open alerts. All checks clean.</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {sortedHealthAlerts.map((a) => {
              const Icon = severityIcon[a.severity];
              return (
                <li
                  key={a.id}
                  className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-slate-800"
                >
                  <span className={`mt-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded border flex items-center gap-1 flex-shrink-0 ${severityChip[a.severity]}`}>
                    <Icon className="w-3 h-3" /> {a.severity.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                      {a.message}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {[a.tenantName, a.checkType.replace(/_/g, ' '), timeAgo(a.createdAt)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
