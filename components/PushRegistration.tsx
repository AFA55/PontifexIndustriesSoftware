'use client';

/**
 * PushRegistration — headless native push-notification bootstrapper.
 *
 * On mount (native only) this:
 *   1. Confirms we're running inside the Capacitor shell (no-op in the browser).
 *   2. Confirms a Supabase session exists (only register tokens for logged-in users).
 *   3. Requests OS push permission and, if granted, calls register().
 *   4. Wires the four PushNotifications listeners exactly once:
 *        - 'registration'                  → POST the APNs/FCM token to our backend.
 *        - 'registrationError'             → warn, never crash.
 *        - 'pushNotificationReceived'      → (foreground) currently a no-op log.
 *        - 'pushNotificationActionPerformed' → deep-link to data.route on tap.
 *
 * Renders nothing. Safe to import on the web — the @capacitor/push-notifications
 * module is import-safe; we simply never invoke its native methods unless
 * Capacitor.isNativePlatform() is true.
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  type Token,
  type ActionPerformed,
  type PushNotificationSchema,
} from '@capacitor/push-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api-client';

export default function PushRegistration() {
  const router = useRouter();

  // Latest router instance, so the stable listener (registered once) always
  // navigates with the current router without re-subscribing on every render.
  const routerRef = useRef(router);
  routerRef.current = router;

  // Guard against double-initialization (React StrictMode double-invoke,
  // fast refresh, accidental remounts).
  const initStartedRef = useRef(false);

  useEffect(() => {
    // SSR / web browser short-circuit.
    if (typeof window === 'undefined') return;
    if (!Capacitor.isNativePlatform()) return;
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    const handles: PluginListenerHandle[] = [];
    let cancelled = false;

    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

    const setup = async () => {
      // Only register tokens for an authenticated user.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      if (cancelled) return;

      // --- Listeners (set up once, before register() so we don't miss the
      //     'registration' event that register() triggers). ---

      const onRegistration = await PushNotifications.addListener(
        'registration',
        (token: Token) => {
          // Fire-and-forget; a failed token POST must not crash the app.
          void apiFetch('/api/push-tokens/register', {
            method: 'POST',
            body: JSON.stringify({
              token: token.value,
              platform,
            }),
          }).catch((err) => {
            console.warn('[PushRegistration] token register failed', err);
          });
        },
      );
      handles.push(onRegistration);

      const onRegistrationError = await PushNotifications.addListener(
        'registrationError',
        (err) => {
          console.warn('[PushRegistration] registration error', err);
        },
      );
      handles.push(onRegistrationError);

      const onReceived = await PushNotifications.addListener(
        'pushNotificationReceived',
        (notification: PushNotificationSchema) => {
          // Foreground delivery — left as a no-op log for now.
          console.debug('[PushRegistration] notification received', notification);
        },
      );
      handles.push(onReceived);

      const onActionPerformed = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action: ActionPerformed) => {
          const route = action.notification?.data?.route;
          if (typeof route === 'string' && route.length > 0) {
            routerRef.current.push(route);
          }
        },
      );
      handles.push(onActionPerformed);

      if (cancelled) return;

      // --- Permission + register ---
      try {
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive === 'granted') {
          await PushNotifications.register();
        } else {
          console.warn('[PushRegistration] push permission not granted:', perm.receive);
        }
      } catch (err) {
        console.warn('[PushRegistration] requestPermissions/register failed', err);
      }
    };

    void setup();

    return () => {
      cancelled = true;
      for (const handle of handles) {
        // removeAllListeners on the plugin is heavier-handed; remove the
        // specific handles we added.
        void handle.remove();
      }
      // Allow re-init on a genuine remount (e.g. after logout/login).
      initStartedRef.current = false;
    };
    // Empty deps — run once per mount. router is read via routerRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
