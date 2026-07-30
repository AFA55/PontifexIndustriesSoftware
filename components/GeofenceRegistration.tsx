'use client';

/**
 * GeofenceRegistration — headless native bootstrapper for background geofencing
 * (Phase C1). No-op on web. On the native shell, for field workers who are logged
 * in, it starts the background-location watcher that powers auto-arrival + the
 * back-at-shop clock-out reminder. Stops on unmount / sign-out.
 *
 * ⚠️ Only does anything inside the Capacitor app AND after a native build that
 * bundles the background-geolocation plugin. On-device tuning required (v1).
 */

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { isNativeApp } from '@/lib/is-native';
import { startGeofencing, stopGeofencing } from '@/lib/native/geofence-service';

// Only field operators go to jobsites — shop staff would run an all-day background
// watcher for no benefit (battery), so they're excluded.
const FIELD_ROLES = new Set(['operator', 'apprentice']);

export default function GeofenceRegistration() {
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session || cancelled) return;
      // On a native cold-start the cached user (getCurrentUser) may not be
      // populated yet even though the session resumed — retry briefly so
      // geofencing still starts instead of silently no-op'ing.
      for (let i = 0; i < 8 && !cancelled; i++) {
        const user = getCurrentUser();
        if (user) {
          if (FIELD_ROLES.has(user.role || '')) await startGeofencing();
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    })();

    return () => {
      cancelled = true;
      void stopGeofencing();
    };
  }, []);

  return null;
}
