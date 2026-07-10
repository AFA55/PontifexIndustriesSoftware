'use client';

/**
 * Job Board — Billing (customer-facing, admin roles).
 * Hireline-style ad-spend passthrough: current balance, threshold explainer,
 * card on file (Stripe.js Elements via SetupIntent), and spend history
 * (billed amounts only — the customer never sees our raw ad cost).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { HIRING_ADMIN_ROLES } from '@/lib/hiring/types';
import type { Stripe as StripeJs, StripeElements } from '@stripe/stripe-js';
import {
  ArrowLeft,
  CreditCard,
  DollarSign,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
  Receipt,
  ShieldCheck,
} from 'lucide-react';

const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

interface LedgerEntry {
  id: string;
  job_id: string | null;
  job_title: string | null;
  spend_date: string;
  channel: string;
  billed_amount: number;
  invoiced: boolean;
  note: string | null;
  created_at: string;
}

interface BillingData {
  billing: { threshold: number; lifetime_billed: number; balance_owed: number };
  unbilledSpend: number;
  recentLedger: LedgerEntry[];
  hasPaymentMethod: boolean;
}

const CHANNEL_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

async function authFetch(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Your session expired. Please log in again.');
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

export default function HiringBillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [data, setData] = useState<BillingData | null>(null);

  // Card entry (Stripe Elements) state
  const [cardFlow, setCardFlow] = useState<'idle' | 'starting' | 'ready' | 'saving'>('idle');
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardSaved, setCardSaved] = useState<string | null>(null); // "visa •••• 4242"
  const stripeRef = useRef<StripeJs | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Pay-now state
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/hiring/billing');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not load billing');
      setData(json.data as BillingData);
      setPageError(null);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Could not load billing');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || !HIRING_ADMIN_ROLES.includes(user.role)) {
      router.push('/dashboard');
      return;
    }
    load();
  }, [router, load]);

  // Mount the Payment Element once its container renders.
  useEffect(() => {
    if (cardFlow !== 'ready' || !elementsRef.current || !mountRef.current) return;
    const paymentElement =
      elementsRef.current.getElement('payment') ?? elementsRef.current.create('payment');
    paymentElement.mount(mountRef.current);
    return () => {
      paymentElement.unmount();
    };
  }, [cardFlow]);

  const startCardEntry = async () => {
    setCardError(null);
    setCardSaved(null);
    setCardFlow('starting');
    try {
      const res = await authFetch('/api/hiring/billing/setup-intent', { method: 'POST' });
      const json = await res.json();
      if (res.status === 503) {
        throw new Error('Card entry is coming online shortly — billing is not fully configured yet.');
      }
      if (!res.ok || !json.success || !json.data?.clientSecret) {
        throw new Error(json.error || 'Could not start card setup');
      }
      const { loadStripe } = await import('@stripe/stripe-js');
      const stripeJs = await loadStripe(STRIPE_PK);
      if (!stripeJs) throw new Error('Stripe failed to load. Please refresh and try again.');
      stripeRef.current = stripeJs;
      elementsRef.current = stripeJs.elements({
        clientSecret: json.data.clientSecret as string,
        appearance: {
          theme: 'stripe',
          variables: { colorPrimary: '#7C3AED', borderRadius: '10px' },
        },
      });
      setCardFlow('ready');
    } catch (e) {
      setCardError(e instanceof Error ? e.message : 'Could not start card setup');
      setCardFlow('idle');
    }
  };

  const saveCard = async () => {
    const stripeJs = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripeJs || !elements) return;
    setCardError(null);
    setCardFlow('saving');
    try {
      const { error, setupIntent } = await stripeJs.confirmSetup({
        elements,
        redirect: 'if_required',
      });
      if (error) throw new Error(error.message || 'Card could not be saved');
      const pmId =
        typeof setupIntent?.payment_method === 'string'
          ? setupIntent.payment_method
          : setupIntent?.payment_method?.id;
      if (!pmId) throw new Error('Card setup did not return a payment method');

      const res = await authFetch('/api/hiring/billing/confirm-payment-method', {
        method: 'POST',
        body: JSON.stringify({ payment_method_id: pmId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not save card');

      setCardSaved(
        json.data?.brand && json.data?.last4
          ? `${String(json.data.brand).toUpperCase()} •••• ${json.data.last4}`
          : 'Card saved'
      );
      setCardFlow('idle');
      stripeRef.current = null;
      elementsRef.current = null;
      await load();
    } catch (e) {
      setCardError(e instanceof Error ? e.message : 'Could not save card');
      setCardFlow('ready');
    }
  };

  const payNow = async () => {
    setPayError(null);
    setPaySuccess(null);
    setPaying(true);
    try {
      const res = await authFetch('/api/hiring/billing/charge', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Payment failed');
      if (json.data?.pending) {
        setPaySuccess(
          json.data.message ||
            'Your payment is processing. No action needed — it will show as paid once it completes.'
        );
      } else {
        setPaySuccess(`Paid ${money(json.data.charged)} — thank you!`);
      }
      await load();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  const balance = data?.billing.balance_owed ?? 0;
  const threshold = data?.billing.threshold ?? 25;
  const canPayNow = !!data?.hasPaymentMethod && balance > 0 && balance >= threshold;

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/dashboard/hiring"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Job Board
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Billing</h1>
          <p className="text-sm text-gray-500 mt-1">
            You only pay for ad spend — there&apos;s no subscription fee.
          </p>
        </div>

        {pageError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{pageError}</p>
          </div>
        )}

        {/* Balance card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                <DollarSign className="w-4 h-4 text-brand" />
                Current balance
              </div>
              <div className="text-4xl font-bold text-gray-900 mt-2">{money(balance)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {money(data?.unbilledSpend ?? 0)} in unbilled ad spend ·{' '}
                {money(data?.billing.lifetime_billed ?? 0)} billed lifetime
              </div>
            </div>
            {canPayNow && (
              <button
                onClick={payNow}
                disabled={paying}
                className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-colors"
              >
                {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Pay {money(balance)} now
              </button>
            )}
          </div>

          {payError && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{payError}</p>
            </div>
          )}
          {paySuccess && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-700">{paySuccess}</p>
            </div>
          )}

          {/* Threshold explainer (Hireline-style FAQ copy) */}
          <div className="mt-5 bg-brand/5 border border-brand/15 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <div className="text-sm text-gray-800 dark:text-white/85">
              <p>
                You&apos;ll be charged what you owe on the 1st of each month, when the amount you
                owe reaches <span className="font-semibold">{money(threshold)}</span>, or after you
                pause all your jobs — whichever comes first.
              </p>
              <p className="text-xs text-gray-600 dark:text-white/60 mt-1.5">
                As your lifetime spend grows, this threshold increases automatically ($25 → $50 →
                $250), so you see fewer, larger charges.
              </p>
            </div>
          </div>
        </div>

        {/* Payment method card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-4 h-4 text-brand" />
            <h2 className="text-base font-semibold text-gray-900">Payment method</h2>
          </div>

          {data?.hasPaymentMethod ? (
            <div className="flex items-center gap-2 text-sm text-gray-700 mb-4">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              {cardSaved ? (
                <span>
                  Card on file: <span className="font-medium">{cardSaved}</span>
                </span>
              ) : (
                <span>A card is on file for automatic billing.</span>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-4">
              Add a card to run job ads — it&apos;s only charged for actual ad spend, per the
              schedule above.
            </p>
          )}

          {STRIPE_PK ? (
            <div>
              {cardFlow === 'idle' && (
                <button
                  onClick={startCardEntry}
                  className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl border border-brand/25 bg-brand/5 text-brand text-sm font-semibold hover:bg-brand/10 transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                  {data?.hasPaymentMethod ? 'Replace card' : 'Add card'}
                </button>
              )}
              {cardFlow === 'starting' && (
                <div className="inline-flex items-center gap-2 text-sm text-gray-500 min-h-[44px]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Preparing secure card entry…
                </div>
              )}
              {(cardFlow === 'ready' || cardFlow === 'saving') && (
                <div className="space-y-4">
                  <div ref={mountRef} className="border border-gray-200 rounded-xl p-4 bg-white" />
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={saveCard}
                      disabled={cardFlow === 'saving'}
                      className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-colors"
                    >
                      {cardFlow === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save card
                    </button>
                    <button
                      onClick={() => {
                        setCardFlow('idle');
                        setCardError(null);
                        stripeRef.current = null;
                        elementsRef.current = null;
                      }}
                      disabled={cardFlow === 'saving'}
                      className="inline-flex items-center justify-center px-5 min-h-[44px] rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">
                    Card details go directly to Stripe — they never touch our servers.
                  </p>
                </div>
              )}
              {cardError && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{cardError}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5 text-center">
              <CreditCard className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600">Card entry is coming online shortly</p>
              <p className="text-xs text-gray-400 mt-1">
                Secure card-on-file setup will appear here once payments are switched on.
              </p>
            </div>
          )}
        </div>

        {/* Spend history */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 pt-6 pb-4">
            <Receipt className="w-4 h-4 text-brand" />
            <h2 className="text-base font-semibold text-gray-900">Spend history</h2>
          </div>
          {data && data.recentLedger.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-t border-b border-gray-100 bg-gray-50">
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Job</th>
                    <th className="px-4 py-3 font-medium">Channel</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-6 py-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.recentLedger.map((entry) => (
                    <tr key={entry.id} className="text-gray-700">
                      <td className="px-6 py-3 whitespace-nowrap">
                        {/* Bare DATE column — parse local, never as UTC (lib/dates convention) */}
                        {new Date(entry.spend_date + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 max-w-[220px] truncate">
                        {entry.job_title || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {CHANNEL_LABELS[entry.channel] || entry.channel}
                      </td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                        {money(entry.billed_amount)}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        {entry.invoiced ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Unbilled
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 pb-8 pt-2 text-center">
              <p className="text-sm text-gray-400">
                No ad spend yet. Once your job ads start running, each day&apos;s spend shows up
                here.
              </p>
            </div>
          )}
          {data && data.recentLedger.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
              Showing the last {data.recentLedger.length} entries.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
