'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Settings, Calendar, Save, Loader2,
  LayoutGrid, StickyNote, AlertTriangle, CheckCircle,
  Bell, Minus, Plus, Palette, ChevronRight,
  CreditCard, ExternalLink, ArrowUpRight, MessageSquareWarning,
  Building2, Shield, Wifi, Coins, CalendarDays, DatabaseBackup,
  DollarSign, Car,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { useBranding } from '@/lib/branding-context';
import {
  Card, Button, Alert, StatusBadge, PageHeader,
  Tabs, TabList, Tab, TabPanel,
} from '@/components/ui';

// ─── Billing section types ─────────────────────────────────────────────────
interface TenantBilling {
  subscription_status: string | null;
  plan_type: string | null;
  subscription_plan: string | null;
  current_period_end: string | null;
}

function formatPlanName(billing: TenantBilling): string {
  const pt = billing.plan_type || billing.subscription_plan || null;
  if (!pt) {
    const s = billing.subscription_status;
    if (!s || s === 'trialing') return 'Free Trial';
    return 'No plan';
  }
  if (pt === 'biannual' || pt === 'starter') return '6-Month Plan';
  if (pt === 'annual' || pt === 'professional' || pt === 'enterprise') return 'Annual Plan';
  // price_id based
  if (pt.includes('biannual')) return '6-Month Plan';
  if (pt.includes('annual')) return 'Annual Plan';
  return pt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatBillingDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

type StatusVariant = 'success' | 'warning' | 'danger';
function statusConfig(status: string | null): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'active':    return { label: 'Active', variant: 'success' };
    case 'trialing':  return { label: 'Free Trial', variant: 'warning' };
    case 'past_due':  return { label: 'Past Due', variant: 'warning' };
    case 'canceled':  return { label: 'Canceled', variant: 'danger' };
    case 'incomplete':return { label: 'Incomplete', variant: 'danger' };
    case 'paused':    return { label: 'Paused', variant: 'warning' };
    default:          return { label: 'Trial', variant: 'warning' };
  }
}

// ─── Billing section component ─────────────────────────────────────────────
// NOTE: internal state/hooks logic intentionally untouched (a parallel session
// fixed a conditional-hooks bug here) — only the surrounding chrome was
// restyled to use the shared Card/Button/Alert/StatusBadge primitives.
const BILLING_ROLES = ['admin', 'super_admin', 'operations_manager'];

function BillingSection({ userRole }: { userRole: string }) {
  const isBillingRole = BILLING_ROLES.includes(userRole);

  const [billing, setBilling] = useState<TenantBilling | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch billing data for roles that can see this section — but the
    // hook itself must run unconditionally on every render (rules-of-hooks).
    if (!isBillingRole) return;
    const load = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data } = await supabase
          .from('tenants')
          .select('subscription_status, plan_type, subscription_plan, current_period_end')
          .limit(1)
          .maybeSingle();
        if (data) setBilling(data as TenantBilling);
      } catch {
        // non-fatal — billing section just shows dashes
      }
    };
    load();
  }, [isBillingRole]);

  const handleManage = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json?.data?.url) {
        setPortalError(json?.error || 'Unable to open billing portal. Please try again.');
        return;
      }
      window.location.href = json.data.url;
    } catch {
      setPortalError('Network error — please try again.');
    } finally {
      setPortalLoading(false);
    }
  };

  if (!isBillingRole) return null;

  const isTrialOrNull = !billing?.subscription_status ||
    billing.subscription_status === 'trialing';

  const { label, variant } = statusConfig(billing?.subscription_status ?? null);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-brand" />
          Billing &amp; Subscription
        </span>
      }
      subtitle="Manage your subscription plan and payment method"
    >
      <div className="space-y-5">
        {/* Status row */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-bold text-gray-500 dark:text-white/50 uppercase tracking-wider">Current Plan</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {billing ? formatPlanName(billing) : '—'}
            </p>
          </div>
          <StatusBadge variant={variant}>{label}</StatusBadge>
        </div>

        {/* Next billing date */}
        {billing?.current_period_end && !isTrialOrNull && (
          <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm text-gray-500 dark:text-white/50">Next billing date</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {formatBillingDate(billing.current_period_end)}
            </span>
          </div>
        )}

        {/* Error */}
        {portalError && <Alert variant="danger">{portalError}</Alert>}

        {/* Actions */}
        {isTrialOrNull ? (
          <div className="space-y-3">
            <Alert variant="warning">
              You&apos;re on a free trial. Upgrade to a paid plan to keep access after your trial ends.
            </Alert>
            <Button href="/patriot#pricing" fullWidth rightIcon={<ArrowUpRight className="w-4 h-4" />}>
              View Plans &amp; Pricing
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleManage}
            loading={portalLoading}
            fullWidth
            rightIcon={!portalLoading ? <ExternalLink className="w-4 h-4" /> : undefined}
          >
            {portalLoading ? 'Opening portal…' : 'Manage Subscription'}
          </Button>
        )}
      </div>
    </Card>
  );
}

// ─── Small reusable bits ───────────────────────────────────────────────────

/** A settings control row: label + one-line explanation + control on the right. */
function SettingRow({
  icon: Icon,
  iconColorClass = 'text-brand',
  label,
  description,
  control,
}: {
  icon: React.ElementType;
  iconColorClass?: string;
  label: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 shrink-0 ${iconColorClass}`} />
          <label className="text-sm font-bold text-gray-900 dark:text-white">{label}</label>
        </div>
        <p className="text-xs text-gray-500 dark:text-white/60">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/** Card that links out to a fuller settings sub-page. */
function LinkOutCard({
  href,
  icon: Icon,
  title,
  description,
  logoUrl,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  logoUrl?: string | null;
}) {
  return (
    <Link href={href} className="block group">
      <Card className="transition-all hover:border-brand/40 hover:shadow-md">
        <div className="flex items-center gap-4 min-w-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="h-10 w-10 rounded-lg object-contain bg-gray-50 dark:bg-white/10 p-1 flex-shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-brand" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
            <p className="text-xs text-gray-500 dark:text-white/60 mt-0.5">{description}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300 dark:text-white/30 group-hover:text-brand transition-colors flex-shrink-0" />
        </div>
      </Card>
    </Link>
  );
}

// ─── Job Cost Standards section ────────────────────────────────────────────
const COST_STANDARDS_ROLES = ['admin', 'super_admin', 'operations_manager'];

interface JobCostStandards {
  default_mileage_rate: number;
  default_equipment_cost: number;
  default_other_cost: number;
}

function JobCostStandardsSection({ userRole }: { userRole: string }) {
  const isCostRole = COST_STANDARDS_ROLES.includes(userRole);

  const [standards, setStandards] = useState<JobCostStandards | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const fetchStandards = useCallback(async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/api/admin/job-cost-standards', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) setStandards(json.data as JobCostStandards);
      }
    } catch {
      // non-fatal — section just shows defaults
    }
  }, []);

  useEffect(() => {
    if (!isCostRole) return;
    fetchStandards();
  }, [isCostRole, fetchStandards]);

  const handleSave = async () => {
    if (!standards) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/api/admin/job-cost-standards', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(standards),
      });

      if (res.ok) {
        const json = await res.json();
        if (json?.data) setStandards(json.data as JobCostStandards);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Failed to save job cost standards');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isCostRole) return null;
  if (!standards) return null;

  const update = (field: keyof JobCostStandards, value: string) => {
    const num = value === '' ? 0 : Number(value);
    setStandards(prev => prev ? { ...prev, [field]: Number.isFinite(num) ? num : 0 } : prev);
  };

  return (
    <div className="bg-white dark:bg-white/5 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden">
      <div className="bg-gradient-to-r from-brand to-brand-accent px-6 py-4 text-white flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <DollarSign className="w-5 h-5 shrink-0" />
            Job Cost Standards
          </h2>
          <p className="text-white/80 text-sm mt-0.5">Default cost inputs used on job tickets and the P&amp;L dashboard</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-white/15 hover:bg-white/25 disabled:opacity-50 rounded-xl font-bold text-sm transition-all flex items-center gap-2 flex-shrink-0"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="p-6 space-y-5">
        {saved && (
          <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-semibold dark:bg-emerald-500/15 dark:border-emerald-400/30 dark:text-emerald-300">
            <CheckCircle className="w-4 h-4" />
            Job cost standards saved!
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold dark:bg-rose-500/15 dark:border-rose-400/30 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}

        <p className="text-sm text-gray-600 dark:text-white/60">
          Keeping this simple for now: labor (from timecards) + mileage. This pre-fills the mileage
          rate on new job tickets — dispatchers can still override it per job. Equipment/material/
          other cost tracking can be added later if you want it.
        </p>

        <div className="max-w-xs">
          <div className="flex items-center gap-2 mb-1.5">
            <Car className="w-4 h-4 text-brand" />
            <label className="text-xs font-bold text-gray-600 dark:text-white/60">Mileage Rate ($/mile)</label>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={standards.default_mileage_rate}
              onChange={(e) => update('default_mileage_rate', e.target.value)}
              className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent dark:bg-white/5 dark:border-white/10 dark:text-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface ScheduleSettings {
  max_slots: number;
  warning_threshold: number;
  shop_notes_enabled: boolean;
  shop_notes_label: string;
}

type SectionId = 'company' | 'schedule' | 'payroll' | 'billing' | 'security';

const SECTIONS: { id: SectionId; label: string; icon: React.ElementType }[] = [
  { id: 'company', label: 'Company & Branding', icon: Building2 },
  { id: 'schedule', label: 'Schedule & Dispatch', icon: Calendar },
  { id: 'payroll', label: 'Payroll & Time', icon: Coins },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'security', label: 'Security & Data', icon: Shield },
];

export default function SettingsPage() {
  const router = useRouter();
  const { branding } = useBranding();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState('');
  const [activeTab, setActiveTab] = useState<SectionId>('company');
  const [settings, setSettings] = useState<ScheduleSettings>({
    max_slots: 10,
    warning_threshold: 8,
    shop_notes_enabled: true,
    shop_notes_label: 'Shop / Notes',
  });

  // Auth guard — bypass roles OR can_manage_settings flag
  useEffect(() => {
    const guard = async () => {
      const user = getCurrentUser();
      if (!user) { router.push('/login'); return; }
      setUserRole(user.role);
      // Admin, super_admin, and operations_manager always manage their own tenant's
      // settings — consistent with the sidebar gating and the branding sub-page guard.
      // (The can_manage_settings flag below is a fallback for any OTHER role a super_admin
      // has explicitly granted; plain admins have no flag row, so don't gate on it.)
      const bypassRoles = ['admin', 'super_admin', 'operations_manager'];
      if (bypassRoles.includes(user.role)) return;

      // Check feature flag
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const resp = await fetch(`/api/admin/user-flags/${user.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const json = await resp.json();
          if (json?.data?.can_manage_settings) return;
        }
      } catch {
        // fall through to redirect
      }
      router.push('/dashboard');
    };
    guard();
  }, [router]);

  // Fetch current settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/api/admin/schedule-board/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setSettings(prev => ({
          ...prev,
          max_slots: json.data?.max_slots ?? 10,
          warning_threshold: json.data?.warning_threshold ?? 8,
          shop_notes_enabled: json.data?.shop_notes_enabled ?? true,
          shop_notes_label: json.data?.shop_notes_label ?? 'Shop / Notes',
        }));
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/api/admin/schedule-board/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          max_slots: settings.max_slots,
          warning_threshold: settings.warning_threshold,
          shop_notes_enabled: settings.shop_notes_enabled,
          shop_notes_label: settings.shop_notes_label,
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const json = await res.json();
        setError(json.error || 'Failed to save settings');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  };

  const adjustSlots = (delta: number) => {
    setSettings(prev => {
      const newMax = Math.min(50, Math.max(1, prev.max_slots + delta));
      return {
        ...prev,
        max_slots: newMax,
        warning_threshold: Math.min(prev.warning_threshold, newMax),
      };
    });
  };

  const adjustThreshold = (delta: number) => {
    setSettings(prev => ({
      ...prev,
      warning_threshold: Math.min(prev.max_slots, Math.max(1, prev.warning_threshold + delta)),
    }));
  };

  const canManageBilling = ['admin', 'super_admin', 'operations_manager'].includes(userRole);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-3" />
          <p className="text-gray-600 dark:text-white/60 font-medium">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
      <div className="container mx-auto px-4 md:px-6 py-6 max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <Settings className="w-6 h-6 text-gray-500 dark:text-white/60" />
              Settings
            </span>
          }
          subtitle="Manage your company's branding, schedule, payroll rules, billing, and data — all in one place."
          backHref="/dashboard/admin"
          backLabel="Back to Admin"
          action={
            activeTab === 'schedule' ? (
              <Button onClick={handleSave} loading={saving} leftIcon={!saving ? <Save className="w-4 h-4" /> : undefined}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            ) : undefined
          }
        />

        {/* Success / Error Messages (schedule-board save feedback) */}
        {saved && (
          <div className="mb-4">
            <Alert variant="success" icon={CheckCircle}>Settings saved successfully!</Alert>
          </div>
        )}
        {error && (
          <div className="mb-4">
            <Alert variant="danger" icon={AlertTriangle}>{error}</Alert>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SectionId)}>
          <TabList className="mb-6 -mx-1 px-1">
            {SECTIONS.map((s) => (
              <Tab key={s.id} value={s.id} className="flex items-center gap-1.5">
                <s.icon className="w-4 h-4" />
                {s.label}
              </Tab>
            ))}
          </TabList>

          {/* ══════════════════════════════════════════════
              COMPANY & BRANDING
             ══════════════════════════════════════════════ */}
          <TabPanel value="company">
            <div className="space-y-4">
              <LinkOutCard
                href="/dashboard/admin/settings/branding"
                icon={Palette}
                title="Branding & White-Label"
                description="Logo, brand colors, company name, and tagline shown across the app, emails, and login page"
                logoUrl={branding.logo_url}
              />
              <LinkOutCard
                href="/dashboard/admin/settings/feedback"
                icon={MessageSquareWarning}
                title="Report an Issue / Request a Change"
                description="Report a bug, request a tweak, or share an idea with the Pontifex team"
              />
            </div>
          </TabPanel>

          {/* ══════════════════════════════════════════════
              SCHEDULE & DISPATCH
             ══════════════════════════════════════════════ */}
          <TabPanel value="schedule">
            <div className="space-y-4">
              <Card
                title={
                  <span className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-brand" />
                    Schedule Board Configuration
                  </span>
                }
                subtitle="Control how many job slots appear on the daily schedule"
              >
                <div className="space-y-6">
                  {/* Max Slots */}
                  <SettingRow
                    icon={LayoutGrid}
                    label="Available Schedule Spots"
                    description="Number of operator rows on the schedule board. Each spot = one operator assignment for the day."
                    control={
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => adjustSlots(-1)}
                          disabled={settings.max_slots <= 1}
                          aria-label="Decrease schedule spots"
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
                        >
                          <Minus className="w-4 h-4 text-gray-700 dark:text-white/80" />
                        </button>
                        <div className="w-16 h-12 flex items-center justify-center bg-brand/10 border-2 border-brand/20 dark:bg-brand/15 dark:border-brand/30 rounded-xl">
                          <span className="text-xl font-bold text-brand dark:text-brand">{settings.max_slots}</span>
                        </div>
                        <button
                          onClick={() => adjustSlots(1)}
                          disabled={settings.max_slots >= 50}
                          aria-label="Increase schedule spots"
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
                        >
                          <Plus className="w-4 h-4 text-gray-700 dark:text-white/80" />
                        </button>
                      </div>
                    }
                  />

                  {/* Visual preview */}
                  <div className="bg-gray-50 dark:bg-white/3 rounded-xl p-4 border border-gray-200 dark:border-white/10">
                    <div className="text-[10px] font-bold text-gray-400 dark:text-white/40 uppercase mb-2">Preview — Schedule Rows</div>
                    <div className="space-y-1">
                      {Array.from({ length: Math.min(settings.max_slots, 12) }, (_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                            i < settings.warning_threshold
                              ? 'bg-brand/10 text-brand dark:bg-brand/15 dark:text-brand'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                          }`}>
                            {i + 1}
                          </div>
                          <div className={`flex-1 h-6 rounded-lg ${
                            i < settings.warning_threshold
                              ? 'bg-brand/5 border border-brand/20 dark:bg-brand/10 dark:border-brand/20'
                              : 'bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-400/20'
                          }`}>
                            <div className="px-2 py-0.5 text-[10px] text-gray-400 dark:text-white/40">
                              {i < settings.warning_threshold ? 'Operator slot' : 'Warning zone'}
                            </div>
                          </div>
                        </div>
                      ))}
                      {settings.max_slots > 12 && (
                        <div className="text-[10px] text-gray-400 dark:text-white/40 text-center py-1">
                          ... +{settings.max_slots - 12} more slots
                        </div>
                      )}
                      {/* Shop / Notes Row */}
                      {settings.shop_notes_enabled && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-300 dark:border-white/10">
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-blue-100 dark:bg-blue-500/15">
                            <StickyNote className="w-3.5 h-3.5 text-blue-600 dark:text-blue-300" />
                          </div>
                          <div className="flex-1 h-6 rounded-lg bg-blue-50 border border-blue-200 border-dashed dark:bg-blue-500/10 dark:border-blue-400/20">
                            <div className="px-2 py-0.5 text-[10px] text-blue-600 dark:text-blue-300 font-semibold">
                              {settings.shop_notes_label}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-white/10 pt-6" />

                  {/* Warning Threshold */}
                  <SettingRow
                    icon={Bell}
                    iconColorClass="text-amber-600"
                    label="Capacity Warning Threshold"
                    description="When this many slots are filled, show a warning during job approval. Helps prevent over-scheduling."
                    control={
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => adjustThreshold(-1)}
                          disabled={settings.warning_threshold <= 1}
                          aria-label="Decrease warning threshold"
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
                        >
                          <Minus className="w-4 h-4 text-gray-700 dark:text-white/80" />
                        </button>
                        <div className="w-16 h-12 flex items-center justify-center bg-amber-50 border-2 border-amber-200 dark:bg-amber-500/15 dark:border-amber-400/30 rounded-xl">
                          <span className="text-xl font-bold text-amber-700 dark:text-amber-300">{settings.warning_threshold}</span>
                        </div>
                        <button
                          onClick={() => adjustThreshold(1)}
                          disabled={settings.warning_threshold >= settings.max_slots}
                          aria-label="Increase warning threshold"
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
                        >
                          <Plus className="w-4 h-4 text-gray-700 dark:text-white/80" />
                        </button>
                      </div>
                    }
                  />

                  {/* Info callout */}
                  <Alert variant="warning">
                    When <strong>{settings.warning_threshold}</strong> of <strong>{settings.max_slots}</strong> slots are filled, the approval modal will show an &ldquo;Approaching Capacity&rdquo; warning. At <strong>{settings.max_slots}/{settings.max_slots}</strong>, approval is blocked.
                  </Alert>

                  <div className="border-t border-gray-200 dark:border-white/10 pt-6" />

                  {/* Shop / Notes Row */}
                  <div>
                    <SettingRow
                      icon={StickyNote}
                      iconColorClass="text-blue-600"
                      label="Shop / Notes Row"
                      description="Extra row at the bottom of the schedule for shop work notes, who's working in the shop, and general day-of notes."
                      control={
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.shop_notes_enabled}
                            onChange={(e) => setSettings(prev => ({ ...prev, shop_notes_enabled: e.target.checked }))}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                        </label>
                      }
                    />

                    {settings.shop_notes_enabled && (
                      <div className="pl-6 space-y-3 mt-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1">Row Label</label>
                          <input
                            type="text"
                            value={settings.shop_notes_label}
                            onChange={(e) => setSettings(prev => ({ ...prev, shop_notes_label: e.target.value }))}
                            placeholder="Shop / Notes"
                            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/30"
                          />
                        </div>
                        <Alert variant="info">
                          This row appears below all operator slots. Use it for shop assignments, daily notes, or special instructions for the team.
                        </Alert>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              <LinkOutCard
                href="/dashboard/admin/settings/nfc-tags"
                icon={Wifi}
                title="NFC Clock-In Tags"
                description="Manage NFC tags for operator clock-in verification — keychain fobs and shop-wall tags"
              />
            </div>
          </TabPanel>

          {/* ══════════════════════════════════════════════
              PAYROLL & TIME
             ══════════════════════════════════════════════ */}
          <TabPanel value="payroll">
            <div className="space-y-4">
              <LinkOutCard
                href="/dashboard/admin/settings/pay-config"
                icon={Coins}
                title="Pay Category Rules"
                description="Overtime thresholds, night-shift premiums, and shop-time pay rules"
              />
              <LinkOutCard
                href="/dashboard/admin/settings/holidays"
                icon={CalendarDays}
                title="Company Holidays"
                description="Mark paid holidays and auto-apply holiday pay to eligible staff with one click"
              />
            </div>
          </TabPanel>

          {/* ══════════════════════════════════════════════
              BILLING
             ══════════════════════════════════════════════ */}
          <TabPanel value="billing">
            <div className="space-y-4">
              {canManageBilling ? (
                <BillingSection userRole={userRole} />
              ) : (
                <Card>
                  <p className="text-sm text-gray-500 dark:text-white/60">
                    You don&apos;t have permission to manage billing for this account.
                  </p>
                </Card>
              )}
              <JobCostStandardsSection userRole={userRole} />
            </div>
          </TabPanel>

          {/* ══════════════════════════════════════════════
              SECURITY & DATA
             ══════════════════════════════════════════════ */}
          <TabPanel value="security">
            <div className="space-y-4">
              <LinkOutCard
                href="/dashboard/admin/settings/backups"
                icon={DatabaseBackup}
                title="Data Backups"
                description="Download a CSV backup of all customer contacts. Daily database backups run automatically."
              />
            </div>
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
}
