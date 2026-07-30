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

// Field roles that go to jobsites — only these get background location.
const FIELD_ROLES = new Set(['operator', 'apprentice', 'shop_manager', 'shop_help']);

export default function GeofenceRegistration() {
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session || cancelled) return;
      const user = getCurrentUser();
      if (!user || !FIELD_ROLES.has(user.role || '')) return;
      await startGeofencing();
    })();

    return () => {
      cancelled = true;
      void stopGeofencing();
    };
  }, []);

  return null;
}
