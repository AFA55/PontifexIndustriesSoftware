/**
 * Native-shell detection.
 *
 * The same Vercel bundle is served to both the website and the iOS/Android
 * Capacitor webview (the app loads the live site via server.url). To stay
 * compliant with App Store Guideline 3.1.1 we must hide all in-app purchasing
 * UI (prices, Stripe checkout buttons, upgrade CTAs) ONLY when running inside
 * the native shell — the website keeps full billing.
 *
 * This is a RUNTIME check (not build-time env) because one bundle serves both
 * contexts. It defaults to `false` (web-visible) on the server and in browsers,
 * so SSR and the website are never affected — it returns true only inside the
 * Capacitor WKWebView/Android shell, where `Capacitor.isNativePlatform()` is true.
 *
 * Mirrors the detection pattern already used in components/PushRegistration.tsx.
 */
import { Capacitor } from '@capacitor/core';

/** True only inside the native iOS/Android Capacitor shell. False on web + SSR. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
