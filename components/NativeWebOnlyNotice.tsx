'use client';

/**
 * NativeWebOnlyNotice
 *
 * Full-screen "manage this on the web" placeholder shown on purchase/marketing
 * pages (pricing, plans, special offers) when the app is running inside the
 * native iOS/Android Capacitor shell. App Store Guideline 3.1.1 forbids steering
 * users to external (non-IAP) purchasing inside the app, so these pages render
 * no prices or checkout buttons natively. The website is unaffected.
 */

import Link from 'next/link';
import { Globe, ArrowRight } from 'lucide-react';

export default function NativeWebOnlyNotice() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white/[0.05] rounded-2xl border border-white/10 shadow-2xl p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-indigo-500/20 flex items-center justify-center">
          <Globe className="w-6 h-6 text-indigo-300" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Available on the web</h1>
        <p className="text-sm text-slate-300 mb-6">
          Plans and subscriptions are managed from your computer at{' '}
          <span className="font-semibold text-white">pontifexindustries.com</span>. Sign in there
          to view pricing or change your subscription.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 w-full py-3 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all"
        >
          Go to Dashboard <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
