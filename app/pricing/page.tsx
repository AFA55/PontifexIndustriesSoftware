'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Star,
  Shield,
  Zap,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Lock,
} from 'lucide-react';
import { PLANS } from '@/lib/billing-plans';

const ANNUAL_DISCOUNT = 0.2;

const FAQ_ITEMS = [
  {
    q: 'Can I change plans after signing up?',
    a: 'Yes. You can upgrade or downgrade your plan at any time from your billing dashboard. Upgrades take effect immediately; downgrades apply at the end of your current billing period.',
  },
  {
    q: 'What happens after my free trial ends?',
    a: 'After your 14-day trial, you\'ll be asked to add a payment method. If you don\'t, your account will be paused — your data is safe and you can reactivate anytime within 30 days.',
  },
  {
    q: 'Is there a setup fee?',
    a: 'No. There are no setup fees, no contracts, and no hidden charges. You only pay the monthly subscription price.',
  },
  {
    q: 'Is my data secure?',
    a: 'All data is encrypted in transit (TLS 1.3) and at rest (AES-256). We use Supabase (backed by AWS) for database hosting, and Stripe for payment processing — neither company stores your card data on our servers.',
  },
  {
    q: 'Do you offer annual pricing?',
    a: 'Yes! Switching to annual billing saves you 20% (2 months free). Toggle the billing period above to see annual prices.',
  },
  {
    q: 'Can I export my data if I cancel?',
    a: 'Absolutely. You can export all your jobs, timecards, invoices, and customer data as CSV or PDF at any time from the dashboard — before or after cancellation.',
  },
];

function PlanCard({
  plan,
  annual,
  isCurrentPlan = false,
}: {
  plan: (typeof PLANS)[keyof typeof PLANS];
  annual: boolean;
  isCurrentPlan?: boolean;
}) {
  const monthlyPrice = annual ? Math.round(plan.price * (1 - ANNUAL_DISCOUNT)) : plan.price;
  const annualTotal = monthlyPrice * 12;

  return (
    <div
      className={`relative flex flex-col rounded-2xl p-8 transition-all duration-200 ${
        plan.highlighted
          ? 'bg-white/10 border-2 border-purple-400 shadow-[0_0_40px_rgba(168,85,247,0.25)]'
          : 'bg-white/5 border border-white/10 hover:border-white/20'
      }`}
    >
      {plan.highlighted && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
            <Star className="w-3 h-3 fill-white" />
            Most Popular
          </span>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
        <p className="text-sm text-slate-400">{plan.description}</p>
      </div>

      <div className="mb-6">
        <div className="flex items-end gap-1">
          <span className="text-4xl font-black text-white">${monthlyPrice}</span>
          <span className="text-slate-400 mb-1.5">/mo</span>
        </div>
        {annual && (
          <p className="text-xs text-emerald-400 mt-1">
            ${annualTotal}/yr &nbsp;·&nbsp; Save ${(plan.price - monthlyPrice) * 12}/yr
          </p>
        )}
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-300">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            {feature}
          </li>
        ))}
      </ul>

      {plan.id === 'enterprise' ? (
        <Link
          href="/request-demo"
          className="w-full py-3 px-6 rounded-xl text-center font-semibold text-sm bg-white/10 hover:bg-white/15 text-white border border-white/20 hover:border-white/30 transition-all duration-150"
        >
          Contact Sales
        </Link>
      ) : (
        <Link
          href={`/dashboard/admin/subscription?plan=${plan.id}`}
          className={`w-full py-3 px-6 rounded-xl text-center font-semibold text-sm transition-all duration-150 ${
            plan.highlighted
              ? 'bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white shadow-lg'
              : 'bg-white/10 hover:bg-white/15 text-white border border-white/20 hover:border-white/30'
          } ${isCurrentPlan ? 'opacity-60 cursor-default pointer-events-none' : ''}`}
        >
          {isCurrentPlan ? 'Current Plan' : plan.cta}
        </Link>
      )}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left text-white font-medium hover:text-purple-300 transition-colors"
      >
        <span>{q}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 flex-shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 flex-shrink-0 text-slate-400" />
        )}
      </button>
      {open && (
        <p className="pb-5 text-sm text-slate-400 leading-relaxed">{a}</p>
      )}
    </div>
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/30 to-slate-950">
      {/* Nav bar */}
      <header className="border-b border-white/5 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <span className="text-white text-sm font-black">P</span>
            </div>
            <span className="text-white font-bold text-sm">Pontifex Industries</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/request-demo"
              className="text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Request Demo
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 text-purple-300 text-xs font-medium mb-6">
          <Zap className="w-3.5 h-3.5" />
          14-day free trial · No credit card required
        </div>
        <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-tight mb-4">
          Simple, Transparent
          <br />
          <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
            Pricing
          </span>
        </h1>
        <p className="text-lg text-slate-400 max-w-xl mx-auto mb-10">
          Everything your concrete cutting crew needs, in one platform. Start your 14-day free trial — no credit card required.
        </p>

        {/* Annual toggle */}
        <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-1.5">
          <button
            onClick={() => setAnnual(false)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              !annual ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              annual ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
            }`}
          >
            Annual
            <span className="text-xs bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold">
              -20%
            </span>
          </button>
        </div>
      </section>

      {/* Plan cards */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid md:grid-cols-3 gap-6 items-start pt-8">
          {(Object.values(PLANS) as (typeof PLANS)[keyof typeof PLANS][]).map((plan) => (
            <PlanCard key={plan.id} plan={plan} annual={annual} />
          ))}
        </div>

        <p className="text-center text-slate-500 text-sm mt-8">
          Already have an account?{' '}
          <Link href="/dashboard/admin/subscription" className="text-purple-400 hover:text-purple-300 underline">
            Manage your subscription
          </Link>
        </p>
      </section>

      {/* Feature comparison callout */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/20 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Every plan includes a 14-day free trial
          </h2>
          <p className="text-slate-400 mb-6 max-w-lg mx-auto">
            No credit card required. Full access to all features during the trial. Cancel any time.
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-sm">
            {[
              'Full feature access',
              'Up to 5 team members',
              'Email support',
              'Export all data',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 text-emerald-400" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 pb-20">
        <h2 className="text-2xl font-bold text-white text-center mb-10">
          Frequently Asked Questions
        </h2>
        <div className="bg-white/5 border border-white/10 rounded-2xl px-8">
          {FAQ_ITEMS.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* Trust footer */}
      <section className="border-t border-white/5 py-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-slate-500 text-sm mb-6">
            Trusted by concrete cutting professionals across North America
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 text-slate-600">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              <span className="text-sm">SSL Encrypted</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span className="text-sm">SOC 2 Ready</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-10 h-5" viewBox="0 0 60 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                <text x="0" y="18" fontSize="14" fontWeight="700" fill="currentColor" fontFamily="sans-serif">stripe</text>
              </svg>
              <span className="text-sm">Payments</span>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="pb-20 pt-4">
        <div className="max-w-xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Ready to streamline your operations?
          </h2>
          <p className="text-slate-400 mb-6">
            Join concrete cutting companies using Pontifex to run their business.
          </p>
          <Link
            href="/dashboard/admin/subscription"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-semibold px-8 py-3.5 rounded-xl shadow-lg transition-all"
          >
            Start Free Trial
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
