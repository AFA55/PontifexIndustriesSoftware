/**
 * useLocationBroadcast Hook
 *
 * Operator-side live location broadcaster (Customer Portal — Feature B,
 * "In Route" tracker). While an operator is `in_route` to a job, their device
 * periodically posts GPS to `POST /api/operator/location` so the customer can
 * watch the technician approach (DoorDash-style).
 *
 * Behavior:
 *  - When `active` is true AND `jobId` is present, starts a single
 *    `navigator.geolocation.watchPosition`.
 *  - Throttles posts to roughly once per THROTTLE_MS (~35s) — it does NOT post
 *    on every watchPosition fire (those can arrive every second or two).
 *  - Sends `Authorization: Bearer <access_token>` (from supabase.auth.getSession())
 *    per the platform convention for authenticated client → API calls.
 *  - If the endpoint replies `{ active: false }` (job no longer in_route, or the
 *    operator/tenant no longer matches), STOPS broadcasting + clears the watch.
 *  - Cleans up the watch on unmount / when `active` flips to false.
 *  - Handles permission-denied + unavailable geolocation gracefully (no throw,
 *    optional console.debug). No-ops on SSR / unsupported environments.
 *
 * Scope note (v1): works in the web + Capacitor WKWebView while the page is
 * foregrounded with location permission granted. NATIVE background tracking
 * (broadcasting while the app is backgrounded / screen locked) is OUT OF SCOPE
 * for v1 — that needs a Capacitor background-geolocation plugin. Revisit if
 * customers need updates while the operator's phone is in their pocket.
 */

'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// Post at most once per this interval, regardless of how often the GPS fires.
const THROTTLE_MS = 35_000; // ~35s (within the 30-45s target)

export function useLocationBroadcast(jobId: string, active: boolean): void {
  // Mutable refs so the long-lived watch callback always sees current values
  // without re-subscribing the watch on every render.
  const lastPostRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);
  const stoppedRef = useRef<boolean>(false);

  useEffect(() => {
    // Guard: nothing to do unless actively in_route with a real job, in a
    // browser/webview that actually exposes geolocation.
    if (!active || !jobId) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;

    let watchId: number | null = null;
    stoppedRef.current = false;
    lastPostRef.current = 0; // allow an immediate first post on (re)activation

    const clearWatch = () => {
      if (watchId !== null) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {
          /* no-op */
        }
        watchId = null;
      }
    };

    const postPing = async (coords: GeolocationCoordinates) => {
      if (stoppedRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          inFlightRef.current = false;
          return; // not signed in — skip silently, try again next tick
        }

        const res = await fetch('/api/operator/location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            jobId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          }),
        });

        // Endpoint signals the job is no longer in_route (or operator/tenant
        // mismatch) → stop broadcasting entirely. The endpoint may use a 204
        // no-op OR a 200 body of { active: false } — handle both.
        if (res.status === 204) {
          stoppedRef.current = true;
          clearWatch();
        } else if (res.ok) {
          const json = await res.json().catch(() => null);
          if (json && json.active === false) {
            stoppedRef.current = true;
            clearWatch();
          }
        }
        // Other non-ok statuses (e.g. transient 401/500): leave the watch up
        // and retry on the next throttled tick.
      } catch {
        // Network error — swallow; the next position fire will retry.
      } finally {
        inFlightRef.current = false;
      }
    };

    const onPosition: PositionCallback = (pos) => {
      if (stoppedRef.current) return;
      const now = Date.now();
      if (now - lastPostRef.current < THROTTLE_MS) return; // throttle
      lastPostRef.current = now;
      void postPing(pos.coords);
    };

    const onError: PositionErrorCallback = (err) => {
      // PERMISSION_DENIED (1): user said no — stop trying, don't crash.
      if (err.code === err.PERMISSION_DENIED) {
        stoppedRef.current = true;
        clearWatch();
      }
      // POSITION_UNAVAILABLE (2) / TIMEOUT (3): keep the watch; it may recover.
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[useLocationBroadcast] geolocation error', err?.code);
      }
    };

    try {
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: true,
        maximumAge: 15_000,
        timeout: 30_000,
      });
    } catch {
      // Some webviews throw synchronously if permission is hard-blocked.
      stoppedRef.current = true;
    }

    return () => {
      stoppedRef.current = true;
      clearWatch();
    };
  }, [jobId, active]);
}

export default useLocationBroadcast;
