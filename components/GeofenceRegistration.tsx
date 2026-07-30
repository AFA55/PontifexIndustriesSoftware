'use client';

/**
 * GeofenceRegistration — headless native bootstrapper for background geofencing
 * (Phase C1). No-op on web.
 *
 * COMPLIANCE-CRITICAL behaviors:
 *  - Background location runs ONLY while the operator is clocked in. It starts on
 *    clock-in and STOPS on clock-out (technical-truth for the "only while you're on
 *    the clock" disclosure). We poll clock status while the app is open; clocking
 *    out (an in-app action) stops the watcher.
 *  - Background geofencing never starts until the user has AGREED to the in-app
 *    prominent-disclosure consent (shown BEFORE the OS permission prompt). "Not now"
 *    is remembered and never re-triggers the OS prompt in the same session.
 *
 * ⚠️ Only active inside the Capacitor app AND after a native build that bundles the
 * background-geolocation plugin. Requires on-device testing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { isNativeApp } from '@/lib/is-native';
import { startGeofencing, stopGeofencing } from '@/lib/native/geofence-service';
import { getBgLocationConsent, setBgLocationConsent } from '@/lib/native/bg-location-consent';
import GeofenceConsentModal from '@/components/GeofenceConsentModal';

const FIELD_ROLES = new Set(['operator', 'apprentice']);
const POLL_MS = 2 * 60 * 1000;

export default function GeofenceRegistration() {
  const [showConsent, setShowConsent] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const declinedThisSessionRef = useRef(false);

  const evaluate = useCallback(async () => {
    if (!isNativeApp()) return;
    const user = getCurrentUser();
    if (!user || !FIELD_ROLES.has(user.role || '')) { void stopGeofencing(); return; }
    userIdRef.current = user.id;

    // Are they on the clock right now?
    let onTheClock = false;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/timecard/current', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) onTheClock = (await res.json()).isClockedIn === true;
    } catch {
      return; // transient — don't change state
    }

    if (!onTheClock) {
      // Off the clock → background location MUST be off (disclosure guarantee).
      setShowConsent(false);
      void stopGeofencing();
      return;
    }

    // On the clock → gate on consent.
    const consent = getBgLocationConsent(user.id);
    if (consent === 'granted') {
      setShowConsent(false);
      void startGeofencing();
    } else if (consent === 'declined' || declinedThisSessionRef.current) {
      setShowConsent(false); // respect their choice; don't nag
    } else {
      setShowConsent(true); // prompt the in-app disclosure BEFORE any OS prompt
    }
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    void evaluate();
    const t = setInterval(() => void evaluate(), POLL_MS);
    return () => {
      clearInterval(t);
      void stopGeofencing();
    };
  }, [evaluate]);

  if (!showConsent) return null;

  return (
    <GeofenceConsentModal
      onAgree={() => {
        setBgLocationConsent(userIdRef.current, 'granted');
        setShowConsent(false);
        void startGeofencing(); // this is where the OS "Always" prompt fires
      }}
      onDecline={() => {
        setBgLocationConsent(userIdRef.current, 'declined');
        declinedThisSessionRef.current = true;
        setShowConsent(false);
      }}
    />
  );
}
