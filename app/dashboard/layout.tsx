'use client';

import PushRegistration from '@/components/PushRegistration';

/**
 * Dashboard layout — wraps every authenticated dashboard route.
 *
 * Mounts the headless <PushRegistration /> so that, on the native Capacitor
 * shell, a logged-in user's device registers for push notifications exactly
 * once per session. It renders nothing and is a no-op in the web browser.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PushRegistration />
      {children}
    </>
  );
}
