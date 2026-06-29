'use client';

import { Fragment } from 'react';
import PushRegistration from '@/components/PushRegistration';
import SubscriptionGate from '@/components/SubscriptionGate';
import WelcomeProfileModal from '@/components/WelcomeProfileModal';
import BiometricEnrollNudge from '@/components/BiometricEnrollNudge';
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
 *
 * NOTE ON KEYS: this is a Client Component whose children are a *runtime*
 * array (the static helper components interleaved with the dynamic `children`
 * prop). React's dev reconciler validates every element of such an array for a
 * `key`, so each sibling — including the page subtree (wrapped in a keyed
 * <Fragment>) — carries an explicit key. Without this you get a console-only
 * "Each child in a list should have a unique key prop" warning attributed to
 * the nearest named ancestor (GoogleMapsProvider). See CLAUDE.md → "React keys
 * in layouts".
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GoogleMapsProvider>
      <PushRegistration key="push-registration" />
      <SubscriptionGate key="subscription-gate" />
      {/* One-time "finish your profile" nudge for accounts missing photo/nickname/phone */}
      <WelcomeProfileModal key="welcome-profile-modal" />
      {/* One-time "Enable Face ID?" offer for native users whose session auto-resumed
          (so they never hit the post-password-login enroll prompt). Native-only no-op. */}
      <BiometricEnrollNudge key="biometric-enroll-nudge" />
      <Fragment key="page">{children}</Fragment>
    </GoogleMapsProvider>
  );
}
