'use client';

import PushRegistration from '@/components/PushRegistration';
import SubscriptionGate from '@/components/SubscriptionGate';
import { GoogleMapsProvider } from '@/components/providers/GoogleMapsProvider';

/**
 * Dashboard layout — wraps every authenticated dashboard route.
 *
 * Mounts the headless <PushRegistration /> so that, on the native Capacitor
 * shell, a logged-in user's device registers for push notifications exactly
 * once per session. It renders nothing and is a no-op in the web browser.
 *
 * Also mounts <SubscriptionGate /> which checks tenant subscription_status
 * and redirects to /patriot?upgrade=true if the subscription has lapsed.
 * super_admin always bypasses. 'past_due' gets a 7-day grace window.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GoogleMapsProvider>
      <PushRegistration />
      <SubscriptionGate />
      {children}
    </GoogleMapsProvider>
  );
}
