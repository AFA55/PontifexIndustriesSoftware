'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PLANS, type PlanId } from '@/lib/billing-plans';
import {
  CreditCard,
  Check,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  ArrowLeft,
  Users,
  Star,
  ExternalLink,
  RefreshCw,
  Zap,
} from 'lucide-react';

interface SubscriptionData {
  status: string;
  plan: string;
  periodEnd: string | null;
  trialEndsAt: string | null;
  hasStripeCustomer: boolean;
  operatorCount: number;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    active: {
      label: 'Active',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    trialing: {
      label: 'Trial',
      className: 'bg-blue-100 text-blue-700 border-blue-200',
      icon: <Clock className="w-3.5 h-3.5" />,
    },
    past_due: {
      label: 'Past Due',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
      icon: <AlertCircle className="w-3.5 h-3.5" />,
    },
    canceled: {
      label: 'Canceled',
      className: 'bg-gray-100 text-gray-600 border-gray-200',
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
    incomplete: {
      label: 'Incomplete',
      className: 'bg-orange-100 text-orange-700 border-orange-200',
      icon: <AlertCircle className="w-3.5 h-3.5" />,
    },
    paused: {
      label: 'Paused',
      className: 'bg-slate-100 text-slate-600 border-slate-200',
      icon: <Clock className="w-3.5 h-3.5" />,
    },
  };

  const c = config[status] ?? config.trialing;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.className}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

// ── Plan badge ────────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    starter: 'bg-slate-100 text-slate-700 border-slate-200',
    professional: 'bg-purple-100 text-purple-700 border-purple-200',
    enterprise: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  };
  const labels: Record<string, string> = {
    starter: 'Starter',
    professional: 'Professional',
    enterprise: 'Enterprise',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
        colors[plan] ?? colors.starter
      }`}
    >
      {plan === 'professional' && <Star className="w-3 h-3 fill-purple-600" />}
      {labels[plan] ?? plan}
    </span>
  );
}

// ── Compact plan card for upgrade section ─────────────────────────────────────

function CompactPlanCard({
  plan,
  isCurrent,
  onSelect,
  loading,
}: {
  plan: (typeof PLANS)[keyof typeof PLANS];
  isCurrent: boolean;
  onSelect: (planId: PlanId) => void;
  loading: boolean;
}) {
  return (
    <div
      className={`relative rounded-xl border p-5 transition-all ${
        plan.highlighted
          ? 'border-purple-300 bg-purple-50 shadow-md'
          : isCurrent
          ? 'border-gray-200 bg-gray-50'
          : 'border-gray-200 bg-white hover:border-purple-200 hover:shadow-sm'
      }`}
    >
      {plan.highlighted && (
        <div className="absolute -top-3 left-4">
          <span className="inline-flex items-center gap-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-[10px] font-bold px-3 py-0.5 rounded-full">
            <Star className="w-2.5 h-2.5 fill-white" />
            Most Popular
          </span>
        </div>
      )}

      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-900">{plan.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-black text-gray-900">${plan.price}</div>
          <div className="text-xs text-gray-400">/month</div>
        </div>
      </div>

      <ul className="space-y-1.5 mb-4">
        {plan.features.slice(0, 4).map((f) => (
          <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
            <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            {f}
          </li>
        ))}
        {plan.features.length > 4 && (
          <li className="text-xs text-gray-400 pl-5.5">
            +{plan.features.length - 4} more features
          </li>
        )}
      </ul>

      {plan.id === 'enterprise' ? (
        <Link
          href="/request-demo"
          className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          Contact Sales
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      ) : isCurrent ? (
        <div className="w-full py-2 px-4 rounded-lg text-sm font-medium text-center bg-gray-100 text-gray-500 border border-gray-200">
          Current Plan
        </div>
      ) : (
        <button
          onClick={() => onSelect(plan.id as PlanId)}
          disabled={loading}
          className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
            plan.highlighted
              ? 'bg-purple-600 hover:bg-purple-700 text-white'
              : 'bg-gray-700 hover:bg-gray-800 text-white'
          }`}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              Upgrade to {plan.name}
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ── Days until helper ─────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number {
  if (!dateStr) return 0;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Operator limit by plan ─────────────────────────────────────────────────────

function operatorLimit(plan: string): number | null {
  if (plan === 'starter') return 5;
  if (plan === 'professional') return 20;
  return null; // unlimited
}

// ── Inner page (uses useSearchParams) ────────────────────────────────────────

function SubscriptionPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const success = searchParams.get('success') === 'true';
  const canceled = searchParams.get('canceled') === 'true';

  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSub = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const res = await fetch('/api/billing/subscription', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json() as { success?: boolean; data?: SubscriptionData; error?: string };

      if (!res.ok || !json.success) {
        setError(json.error ?? 'Failed to load subscription');
        return;
      }

      setSub(json.data ?? null);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Auth guard
  useEffect(() => {
    const user = getCurrentUser();
    if (
      !user ||
      !['admin', 'super_admin', 'operations_manager'].includes(user.role)
    ) {
      router.push('/dashboard/admin');
      return;
    }
    fetchSub();
  }, [fetchSub, router]);

  const handleCheckout = async (planId: PlanId) => {
    setCheckoutLoading(planId);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planId }),
      });

      const json = await res.json() as { success?: boolean; data?: { url: string }; error?: string };
      if (!res.ok || !json.success || !json.data?.url) {
        setError(json.error ?? 'Failed to start checkout');
        return;
      }
      window.location.href = json.data.url;
    } catch {
      setError('Network error — please try again');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const res = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = await res.json() as { success?: boolean; data?: { url: string }; error?: string };
      if (!res.ok || !json.success || !json.data?.url) {
        setError(json.error ?? 'Failed to open billing portal');
        return;
      }
      window.location.href = json.data.url;
    } catch {
      setError('Network error — please try again');
    } finally {
      setPortalLoading(false);
    }
  };

  const currentPlan = sub?.plan as PlanId | undefined;
  const trialDays = daysUntil(sub?.trialEndsAt ?? null);
  const opLimit = currentPlan ? operatorLimit(currentPlan) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard/admin"
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white border border-transparent hover:border-gray-200 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Subscription & Billing</h1>
            <p className="text-sm text-gray-500">Manage your plan, payment method, and invoices</p>
          </div>
          <button
            onClick={fetchSub}
            disabled={loading}
            className="ml-auto p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white border border-transparent hover:border-gray-200 transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Success / canceled banners */}
        {success && (
          <div className="mb-6 flex items-start gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Payment successful!</p>
              <p className="text-sm text-emerald-700">Your subscription is now active. Welcome aboard!</p>
            </div>
          </div>
        )}
        {canceled && (
          <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Checkout canceled</p>
              <p className="text-sm text-amber-700">No charges were made. You can try again any time.</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          </div>
        ) : sub ? (
          <div className="space-y-6">
            {/* Current Plan Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-2">Current Plan</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <PlanBadge plan={sub.plan} />
                    <StatusBadge status={sub.status} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-gray-900">
                    ${PLANS[sub.plan as PlanId]?.price ?? '—'}
                  </p>
                  <p className="text-xs text-gray-400">per month</p>
                </div>
              </div>

              {/* Trial banner */}
              {sub.status === 'trialing' && sub.trialEndsAt && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-800">
                        Your free trial ends in {trialDays} day{trialDays !== 1 ? 's' : ''}
                      </p>
                      <p className="text-sm text-blue-600 mt-0.5">
                        Trial expires {formatDate(sub.trialEndsAt)}. Add a payment method to keep your access.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Past due banner */}
              {sub.status === 'past_due' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-800">Payment failed</p>
                      <p className="text-sm text-amber-600 mt-0.5">
                        Please update your payment method to avoid service interruption.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Details grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {sub.periodEnd && (
                  <div className="bg-gray-50 rounded-xl p-3.5">
                    <p className="text-xs text-gray-500 mb-1">Renews on</p>
                    <p className="text-sm font-semibold text-gray-900">{formatDate(sub.periodEnd)}</p>
                  </div>
                )}
                <div className="bg-gray-50 rounded-xl p-3.5">
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Operators
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {sub.operatorCount} {opLimit !== null ? `of ${opLimit}` : '(unlimited)'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3.5">
                  <p className="text-xs text-gray-500 mb-1">Billing portal</p>
                  <button
                    onClick={handlePortal}
                    disabled={portalLoading || !sub.hasStripeCustomer}
                    className="text-sm font-semibold text-purple-600 hover:text-purple-700 disabled:opacity-40 flex items-center gap-1 transition-colors"
                  >
                    {portalLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5" />
                    )}
                    Manage
                  </button>
                </div>
              </div>
            </div>

            {/* Billing management */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Manage Billing</h2>
              <p className="text-sm text-gray-500 mb-4">
                Update your payment method, download invoices, or cancel your subscription through the Stripe billing portal.
              </p>
              <button
                onClick={handlePortal}
                disabled={portalLoading || !sub.hasStripeCustomer}
                className="inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                {portalLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                {sub.hasStripeCustomer
                  ? 'Open Billing Portal'
                  : 'Subscribe to enable billing portal'}
              </button>
              {!sub.hasStripeCustomer && (
                <p className="text-xs text-gray-400 mt-2">
                  Select a plan below to add your payment method.
                </p>
              )}
            </div>

            {/* Upgrade section — show if not enterprise */}
            {sub.plan !== 'enterprise' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 mb-1">
                  {sub.status === 'trialing' || !sub.hasStripeCustomer
                    ? 'Choose Your Plan'
                    : 'Upgrade or Change Plan'}
                </h2>
                <p className="text-sm text-gray-500 mb-6">
                  {sub.status === 'trialing'
                    ? 'Select a plan to continue after your trial ends. You won\'t be charged until the trial is over.'
                    : 'Upgrades take effect immediately. Downgrades apply at the next billing cycle.'}
                </p>
                <div className="grid md:grid-cols-3 gap-4">
                  {(Object.values(PLANS) as (typeof PLANS)[keyof typeof PLANS][]).map((plan) => (
                    <CompactPlanCard
                      key={plan.id}
                      plan={plan}
                      isCurrent={plan.id === sub.plan}
                      onSelect={handleCheckout}
                      loading={checkoutLoading === plan.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Link to full pricing page */}
            <p className="text-center text-sm text-gray-400">
              View full feature comparison on the{' '}
              <Link href="/pricing" className="text-purple-600 hover:text-purple-700 underline">
                pricing page
              </Link>
            </p>
          </div>
        ) : (
          <div className="text-center py-20 text-gray-500">
            No subscription data found.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page export wrapped in Suspense for useSearchParams ───────────────────────

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        </div>
      }
    >
      <SubscriptionPageInner />
    </Suspense>
  );
}
