'use client';

/**
 * SubscriptionGate
 *
 * Mounts silently inside the dashboard layout. On mount it:
 *   1. Reads the current user from localStorage (getCurrentUser).
 *   2. super_admin always bypasses — no redirect.
 *   3. Fetches the tenant's subscription_status and current_period_end from
 *      Supabase using the authenticated session.
 *   4. Redirects to /patriot?upgrade=true if the subscription is lapsed:
 *        - status NOT IN ('active', 'trialing', null) → redirect immediately,
 *          EXCEPT 'past_due' which gets a 7-day grace period past current_period_end.
 *
 * Renders nothing visible — purely a side-effect gate.
 */

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isNativeApp } from '@/lib/is-native';

const GRACE_DAYS = 7;

export default function SubscriptionGate() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only run on /dashboard/* routes
    if (!pathname?.startsWith('/dashboard')) return;

    // App Store 3.1.1: never auto-redirect to the purchase/upgrade page inside
    // the native shell — Apple rejects apps that steer users to external
    // (non-IAP) purchasing. Subscription enforcement still runs on the website,
    // where the admin re-subscribes via Stripe. Fail open in the app.
    if (isNativeApp()) return;

    const check = async () => {
      const user = getCurrentUser();
      // No session — let the page-level auth guard handle the redirect
      if (!user) return;
      // super_admin always bypasses
      if (user.role === 'super_admin') return;

      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const { data: tenant, error } = await supabase
          .from('tenants')
          .select('subscription_status, current_period_end')
          .limit(1)
          .maybeSingle();

        if (error || !tenant) return;

        const { subscription_status: status, current_period_end: periodEnd } = tenant as {
          subscription_status: string | null;
          current_period_end: string | null;
        };

        // null / 'trialing' / 'active' → allowed
        if (!status || status === 'active' || status === 'trialing') return;

        // 'past_due' → 7-day grace window from current_period_end
        if (status === 'past_due') {
          if (periodEnd) {
            const graceCutoff = new Date(periodEnd);
            graceCutoff.setDate(graceCutoff.getDate() + GRACE_DAYS);
            if (new Date() <= graceCutoff) return; // still in grace period
          } else {
            // No period end recorded — grant grace by default (avoid false lockouts)
            return;
          }
        }

        // All other statuses (canceled, incomplete, paused) + past_due past grace → redirect
        router.replace('/patriot?upgrade=true');
      } catch {
        // Network / parse errors: fail open (don't lock out users due to transient errors)
      }
    };

    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
