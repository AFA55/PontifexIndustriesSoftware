'use client';

/**
 * Headless: keep the native status bar from sitting on top of the page.
 *
 * WHY (founder, Aug 11): "For most people the camera in front blocks being able
 * to see the full screen — this is happening on both Apple and Android. I'd
 * like them to be able to view everything, not have something blocked by the
 * camera."
 *
 * The root layout sets `viewport-fit=cover`, which lets the WebView paint edge
 * to edge — under the clock, the battery, and the Dynamic Island. That is only
 * safe if every page then re-claims the space with `env(safe-area-inset-top)`.
 * Dozens did not, so their headers rendered *behind* the notch: the back button
 * and the print button on the job ticket were half-covered.
 *
 * There are two different fixes because the two platforms differ:
 *
 * THE CSS IS THE REAL FIX ON BOTH PLATFORMS. This component is a best-effort
 * extra for older Android, and is explicitly NOT load-bearing:
 *
 *   `setOverlaysWebView` is Android-only in @capacitor/status-bar (iOS has no
 *   implementation), and on Android it is written against the deprecated
 *   `View.setSystemUiVisibility` flags — which Android 15+ ignores under
 *   enforced edge-to-edge. This app targets SDK 36 and does not set
 *   `windowOptOutEdgeToEdgeEnforcement`, so on a modern handset the call is
 *   expected to do nothing at all. It still helps Android 14 and below.
 *
 *   Everywhere else — iOS, Android 15+, and the mobile browser — clearance
 *   comes from `env(safe-area-inset-top)` via the `.pt-safe` / `.pt-safe-3`
 *   utilities in globals.css, which every top-level sticky header must carry.
 *   Android WebView reports those insets correctly under enforced edge-to-edge,
 *   so the CSS route covers the cases this call cannot.
 *
 * Guarded three ways, because a Capacitor plugin proxy that is not really there
 * is how we shipped the `NativeBiometric.then() is not implemented` error to 20
 * users: native-only, isPluginAvailable, and a catch that stays quiet.
 */

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export default function NativeStatusBar() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!Capacitor.isNativePlatform()) return;
        if (Capacitor.getPlatform() !== 'android') return;
        if (!Capacitor.isPluginAvailable('StatusBar')) return;

        const mod = await import('@capacitor/status-bar');
        if (cancelled) return;

        // Reserve the strip: web content starts below the status bar.
        await mod.StatusBar.setOverlaysWebView({ overlay: false });
      } catch {
        // A missing/older native shell must never break the page it wraps.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
