'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Settings, Calendar, Save, Loader2,
  LayoutGrid, StickyNote, AlertTriangle, CheckCircle,
  Hash, Bell, Minus, Plus, Palette, ChevronRight,
  CreditCard, ExternalLink, ArrowUpRight,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { useBranding } from '@/lib/branding-context';

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

type StatusVariant = 'green' | 'amber' | 'red';
function statusConfig(status: string | null): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'active':    return { label: 'Active', variant: 'green' };
    case 'trialing':  return { label: 'Free Trial', variant: 'amber' };
    case 'past_due':  return { label: 'Past Due', variant: 'amber' };
    case 'canceled':  return { label: 'Canceled', variant: 'red' };
    case 'incomplete':return { label: 'Incomplete', variant: 'red' };
    case 'paused':    return { label: 'Paused', variant: 'amber' };
    default:          return { label: 'Trial', variant: 'amber' };
  }
}

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  green: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-400/30 dark:text-emerald-300',
  amber: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/15 dark:border-amber-400/30 dark:text-amber-300',
  red:   'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/15 dark:border-rose-400/30 dark:text-rose-300',
};

// ─── Billing section component ─────────────────────────────────────────────
function BillingSection({ userRole }: { userRole: string }) {
  const BILLING_ROLES = ['admin', 'super_admin', 'operations_manager'];
  if (!BILLING_ROLES.includes(userRole)) return null;

  const [billing, setBilling] = useState<TenantBilling | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

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

  const isTrialOrNull = !billing?.subscription_status ||
    billing.subscription_status === 'trialing';

  const { label, variant } = statusConfig(billing?.subscription_status ?? null);

  return (
    <div className="bg-white dark:bg-white/5 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden">
      <div className="bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-4 text-white">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Billing &amp; Subscription
        </h2>
        <p className="text-violet-100 text-sm mt-0.5">Manage your Pontifex Industries subscription</p>
      </div>

      <div className="p-6 space-y-5">
        {/* Status row */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-bold text-gray-500 dark:text-white/50 uppercase tracking-wider">Current Plan</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {billing ? formatPlanName(billing) : '—'}
            </p>
          </div>
          <span className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold border ${VARIANT_CLASSES[variant]}`}>
            {label}
          </span>
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
        {portalError && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-400/30 px-3 py-2.5 text-rose-700 dark:text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {portalError}
          </div>
        )}

        {/* Actions */}
        {isTrialOrNull ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-400/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 font-medium">
              You&apos;re on a free trial. Upgrade to a paid plan to keep access after your trial ends.
            </div>
            <Link
              href="/patriot#pricing"
              className="flex items-center justify-center gap-2 min-h-[44px] w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-sm transition-all shadow-lg"
            >
              View Plans &amp; Pricing
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <button
            onClick={handleManage}
            disabled={portalLoading}
            className="flex items-center justify-center gap-2 min-h-[44px] w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all shadow-lg"
          >
            {portalLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Opening portal…</>
            ) : (
              <><ExternalLink className="w-4 h-4" /> Manage Subscription</>
            )}
          </button>
        )}
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

export default function SettingsPage() {
  const router = useRouter();
  const { branding } = useBranding();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userRole, setUserRole] = useState('');
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
      setIsSuperAdmin(user.role === 'super_admin');
      setUserRole(user.role);
      const bypassRoles = ['super_admin', 'operations_manager'];
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-white/60 font-medium">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 dark:bg-white/5 border-b border-gray-200 dark:border-white/10 sticky top-0 z-30 shadow-lg">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/admin" className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-xl transition-all hover:scale-105">
                <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-white/80" />
              </Link>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-gray-600 dark:text-white/60" />
                  Admin Settings
                </h1>
                <p className="text-gray-500 dark:text-white/60 text-xs">Configure schedule board, capacity, and system preferences</p>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-6 max-w-4xl">
        {/* Success / Error Messages */}
        {saved && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-semibold animate-in slide-in-from-top duration-200 dark:bg-emerald-500/15 dark:border-emerald-400/30 dark:text-emerald-300">
            <CheckCircle className="w-4 h-4" />
            Settings saved successfully!
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold dark:bg-rose-500/15 dark:border-rose-400/30 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* ══════════════════════════════════════════════
              COMPANY BRANDING (super_admin only)
             ══════════════════════════════════════════════ */}
          {isSuperAdmin && (
            <Link
              href="/dashboard/admin/settings/branding"
              className="block bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden hover:shadow-2xl transition-all hover:scale-[1.01]"
            >
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 text-white flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  {branding.logo_url ? (
                    <img
                      src={branding.logo_url}
                      alt="Company logo"
                      className="h-10 w-auto max-w-[80px] object-contain rounded-lg bg-white/10 p-1 flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Palette className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold flex items-center gap-2 flex-wrap">
                      Branding &amp; White-Label
                      <span className="text-xs font-semibold bg-white/20 text-white px-2 py-0.5 rounded-full">
                        Super Admin Only
                      </span>
                    </h2>
                    <p className="text-purple-200 text-sm mt-0.5">Logo, colors, company name and tagline</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-white/70 flex-shrink-0" />
              </div>
            </Link>
          )}

          {/* ══════════════════════════════════════════════
              SCHEDULE BOARD CONFIGURATION
             ══════════════════════════════════════════════ */}
          <div className="bg-white dark:bg-white/5 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Schedule Board Configuration
              </h2>
              <p className="text-purple-200 text-sm mt-0.5">Control how many job slots appear on the daily schedule</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Max Slots */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <LayoutGrid className="w-4 h-4 text-purple-600" />
                    <label className="text-sm font-bold text-gray-900 dark:text-white">Available Schedule Spots</label>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-white/60">
                    Number of operator rows on the schedule board. Each spot = one operator assignment for the day.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustSlots(-1)}
                    disabled={settings.max_slots <= 1}
                    className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
                  >
                    <Minus className="w-4 h-4 text-gray-700 dark:text-white/80" />
                  </button>
                  <div className="w-16 h-12 flex items-center justify-center bg-purple-50 border-2 border-purple-200 dark:bg-purple-500/15 dark:border-purple-400/30 rounded-xl">
                    <span className="text-xl font-bold text-purple-700 dark:text-purple-300">{settings.max_slots}</span>
                  </div>
                  <button
                    onClick={() => adjustSlots(1)}
                    disabled={settings.max_slots >= 50}
                    className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
                  >
                    <Plus className="w-4 h-4 text-gray-700 dark:text-white/80" />
                  </button>
                </div>
              </div>

              {/* Visual preview */}
              <div className="bg-gray-50 dark:bg-white/3 rounded-xl p-4 border border-gray-200 dark:border-white/10">
                <div className="text-[10px] font-bold text-gray-400 dark:text-white/40 uppercase mb-2">Preview — Schedule Rows</div>
                <div className="space-y-1">
                  {Array.from({ length: Math.min(settings.max_slots, 12) }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                        i < settings.warning_threshold
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                      }`}>
                        {i + 1}
                      </div>
                      <div className={`flex-1 h-6 rounded-lg ${
                        i < settings.warning_threshold
                          ? 'bg-purple-50 border border-purple-200 dark:bg-purple-500/10 dark:border-purple-400/20'
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
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Bell className="w-4 h-4 text-amber-600" />
                    <label className="text-sm font-bold text-gray-900 dark:text-white">Capacity Warning Threshold</label>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-white/60">
                    When this many slots are filled, show a warning during job approval. Helps prevent over-scheduling.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustThreshold(-1)}
                    disabled={settings.warning_threshold <= 1}
                    className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
                  >
                    <Minus className="w-4 h-4 text-gray-700 dark:text-white/80" />
                  </button>
                  <div className="w-16 h-12 flex items-center justify-center bg-amber-50 border-2 border-amber-200 dark:bg-amber-500/15 dark:border-amber-400/30 rounded-xl">
                    <span className="text-xl font-bold text-amber-700 dark:text-amber-300">{settings.warning_threshold}</span>
                  </div>
                  <button
                    onClick={() => adjustThreshold(1)}
                    disabled={settings.warning_threshold >= settings.max_slots}
                    className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
                  >
                    <Plus className="w-4 h-4 text-gray-700 dark:text-white/80" />
                  </button>
                </div>
              </div>

              {/* Info callout */}
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 flex items-start gap-2 dark:bg-amber-500/15 dark:border-amber-400/30">
                <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-300 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  When <strong>{settings.warning_threshold}</strong> of <strong>{settings.max_slots}</strong> slots are filled, the approval modal will show an &ldquo;Approaching Capacity&rdquo; warning. At <strong>{settings.max_slots}/{settings.max_slots}</strong>, approval is blocked.
                </p>
              </div>

              <div className="border-t border-gray-200 dark:border-white/10 pt-6" />

              {/* Shop / Notes Row */}
              <div>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <StickyNote className="w-4 h-4 text-blue-600" />
                      <label className="text-sm font-bold text-gray-900 dark:text-white">Shop / Notes Row</label>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-white/60">
                      Extra row at the bottom of the schedule for shop work notes, who&apos;s working in the shop, and general day-of notes.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.shop_notes_enabled}
                      onChange={(e) => setSettings(prev => ({ ...prev, shop_notes_enabled: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                </div>

                {settings.shop_notes_enabled && (
                  <div className="pl-6 space-y-3">
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
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-200 dark:bg-blue-500/15 dark:border-blue-400/30">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        This row appears below all operator slots. Use it for shop assignments, daily notes, or special instructions for the team.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              NFC CLOCK-IN TAGS
             ══════════════════════════════════════════════ */}
          <div className="bg-white dark:bg-white/5 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden">
            <div className="bg-gradient-to-r from-cyan-600 to-blue-700 px-6 py-4 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                NFC Clock-In Tags
              </h2>
              <p className="text-cyan-100 text-sm mt-1">Manage NFC tags for operator clock-in verification</p>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 dark:text-white/60 mb-4">
                Keep an NFC tag on your keychain or mount one on the shop wall.
                All operators scan it when they arrive. Out-of-town crews use remote clock-in with selfie + GPS.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="text-center p-3 bg-cyan-50 border border-cyan-200 dark:bg-cyan-500/15 dark:border-cyan-400/30 rounded-xl">
                  <div className="text-xs font-bold text-cyan-600 dark:text-cyan-300 uppercase">🔑 NFC Scan</div>
                  <p className="text-[10px] text-cyan-500 dark:text-cyan-300/70 mt-1">Keychain or wall tag</p>
                </div>
                <div className="text-center p-3 bg-amber-50 border border-amber-200 dark:bg-amber-500/15 dark:border-amber-400/30 rounded-xl">
                  <div className="text-xs font-bold text-amber-600 dark:text-amber-300 uppercase">📷 Remote</div>
                  <p className="text-[10px] text-amber-500 dark:text-amber-300/70 mt-1">Selfie + GPS (needs approval)</p>
                </div>
              </div>
              <Link
                href="/dashboard/admin/settings/nfc-tags"
                className="block w-full text-center px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-xl font-bold text-sm transition-all hover:scale-[1.02] shadow-sm"
              >
                Manage NFC Tags →
              </Link>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              PAY CATEGORY CONFIG
             ══════════════════════════════════════════════ */}
          <div className="bg-white dark:bg-white/5 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Pay Category Rules
              </h2>
              <p className="text-emerald-100 text-sm mt-1">Configure overtime thresholds, night shift premiums, and shop time rules</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 bg-rose-50 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-400/30 rounded-xl">
                  <div className="text-xs font-bold text-rose-600 dark:text-rose-300 uppercase">Overtime</div>
                  <p className="text-[10px] text-rose-500 dark:text-rose-300/70 mt-1">After weekly threshold (default 40 hrs)</p>
                </div>
                <div className="text-center p-3 bg-indigo-50 border border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-400/30 rounded-xl">
                  <div className="text-xs font-bold text-indigo-600 dark:text-indigo-300 uppercase">Night Shift</div>
                  <p className="text-[10px] text-indigo-500 dark:text-indigo-300/70 mt-1">Field work from 3 PM (configurable)</p>
                </div>
                <div className="text-center p-3 bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-400/30 rounded-xl">
                  <div className="text-xs font-bold text-amber-600 dark:text-amber-300 uppercase">Shop Time</div>
                  <p className="text-[10px] text-amber-500 dark:text-amber-300/70 mt-1">Always regular rate</p>
                </div>
              </div>
              <Link
                href="/dashboard/admin/settings/pay-config"
                className="block w-full text-center px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl font-bold text-sm transition-all hover:scale-[1.02] shadow-sm"
              >
                Configure Pay Rules →
              </Link>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              COMPANY HOLIDAYS
             ══════════════════════════════════════════════ */}
          <div className="bg-white dark:bg-white/5 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Company Holidays
              </h2>
              <p className="text-purple-200 text-sm mt-1">Mark paid holidays and auto-apply holiday pay to eligible staff</p>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 dark:text-white/60 mb-4">
                Configure company holidays with per-day pay hours. Eligible hourly field and shop staff
                receive an overtime-exempt holiday-pay entry on their timecard with one click.
              </p>
              <Link
                href="/dashboard/admin/settings/holidays"
                className="block w-full text-center px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all hover:scale-[1.02] shadow-sm"
              >
                Manage Holidays →
              </Link>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              DATA BACKUPS
             ══════════════════════════════════════════════ */}
          <div className="bg-white dark:bg-white/5 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden">
            <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-4 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
                Data Backups
              </h2>
              <p className="text-violet-100 text-sm mt-1">Export and protect your customer and contact data</p>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 dark:text-white/60 mb-4">
                Download a CSV backup of all your customer contacts any time. Daily database backups
                run automatically — your data is always safe and exportable.
              </p>
              <Link
                href="/dashboard/admin/settings/backups"
                className="block w-full text-center px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white rounded-xl font-bold text-sm transition-all hover:scale-[1.02] shadow-sm"
              >
                Manage Backups →
              </Link>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              BILLING & SUBSCRIPTION
             ══════════════════════════════════════════════ */}
          <BillingSection userRole={userRole} />

          {/* ══════════════════════════════════════════════
              QUICK REFERENCE
             ══════════════════════════════════════════════ */}
          <div className="bg-white dark:bg-white/5 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-600 to-slate-800 px-6 py-4 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Hash className="w-5 h-5" />
                Quick Reference
              </h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-purple-50 border border-purple-200 dark:bg-purple-500/15 dark:border-purple-400/30 rounded-xl">
                  <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{settings.max_slots}</div>
                  <div className="text-[10px] font-bold text-purple-500 dark:text-purple-400 uppercase mt-1">Max Daily Slots</div>
                </div>
                <div className="text-center p-4 bg-amber-50 border border-amber-200 dark:bg-amber-500/15 dark:border-amber-400/30 rounded-xl">
                  <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{settings.warning_threshold}</div>
                  <div className="text-[10px] font-bold text-amber-500 dark:text-amber-400 uppercase mt-1">Warning At</div>
                </div>
                <div className="text-center p-4 bg-green-50 border border-green-200 dark:bg-emerald-500/15 dark:border-emerald-400/30 rounded-xl">
                  <div className="text-2xl font-bold text-green-700 dark:text-emerald-300">{settings.max_slots - settings.warning_threshold}</div>
                  <div className="text-[10px] font-bold text-green-500 dark:text-emerald-400 uppercase mt-1">Buffer Slots</div>
                </div>
                <div className="text-center p-4 bg-blue-50 border border-blue-200 dark:bg-blue-500/15 dark:border-blue-400/30 rounded-xl">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{settings.shop_notes_enabled ? 'On' : 'Off'}</div>
                  <div className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase mt-1">Notes Row</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
