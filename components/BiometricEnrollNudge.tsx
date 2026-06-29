'use client';

/**
 * BiometricEnrollNudge — one-time "Enable Face ID?" offer for users whose session
 * AUTO-RESUMED (so they never hit the post-password-login enroll prompt).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The post-login enroll prompt in app/login/page.tsx only fires inside onSubmit —
 * i.e. only after a FRESH PASSWORD login. But a user with "Remember me" on has
 * their session auto-resumed on app open (login page redirects straight to the
 * dashboard before any password submit), so that prompt is never reached and they
 * have no way to discover Face ID enrollment except by digging into My Profile →
 * Security. This headless component closes that gap by offering enrollment ONCE,
 * the first time such a user lands on the dashboard.
 *
 * ── Gating (all must hold) ───────────────────────────────────────────────────
 *   - native Capacitor shell only (isNativeApp); pure no-op on the website + SSR
 *   - biometric hardware available + enrolled on the device
 *   - NOT already enrolled for app sign-in (hasEnrolledBiometric)
 *   - user hasn't previously declined (BIOMETRIC_DECLINED_KEY) — shared with the
 *     login prompt, so skipping either surface suppresses both
 *   - an active Supabase session exists (we need its refresh token to enroll)
 *
 * On "Enable": store the CURRENT session's refresh token in the Keychain behind
 * OS biometric access control (reuses enrollBiometric — identical to the login
 * prompt + My Profile toggle). The next app-open then auto-prompts Face ID
 * (app/login/page.tsx launch effect). On "Not now": stamp the decline key.
 *
 * Renders nothing until it decides to show, then a small bottom-sheet card.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ScanFace } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isNativeApp } from '@/lib/is-native';
import {
  BIOMETRIC_DECLINED_KEY,
  biometricAvailable,
  biometryLabel,
  enrollBiometric,
  hasEnrolledBiometric,
} from '@/lib/biometric';

export default function BiometricEnrollNudge() {
  const [show, setShow] = useState(false);
  const [bioLabel, setBioLabel] = useState('Face ID');
  const [enrolling, setEnrolling] = useState(false);
  // The session refresh token + email captured at decision time.
  const [creds, setCreds] = useState<{ email: string; refreshToken: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Native shell only — pure no-op on the website + SSR.
      if (!isNativeApp()) return;

      // Already declined? Never nag again.
      try {
        if (localStorage.getItem(BIOMETRIC_DECLINED_KEY) === 'true') return;
      } catch {
        /* storage unavailable — fall through, decline simply won't persist */
      }

      // Hardware present + enrolled on device?
      const { available, biometryType } = await biometricAvailable();
      if (cancelled || !available) return;

      // Already enrolled for app sign-in? Nothing to offer.
      if (await hasEnrolledBiometric()) return;
      if (cancelled) return;

      // Need a live session to grab a refresh token to store.
      const { data } = await supabase.auth.getSession();
      const refreshToken = data.session?.refresh_token;
      const email = data.session?.user?.email;
      if (cancelled || !refreshToken || !email) return;

      setBioLabel(biometryLabel(biometryType));
      setCreds({ email, refreshToken });
      setShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnable = async () => {
    if (!creds) return;
    setEnrolling(true);
    try {
      // Prefer the freshest refresh token (it may have rotated since mount).
      let refreshToken = creds.refreshToken;
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.refresh_token) refreshToken = data.session.refresh_token;
      } catch {
        /* keep the captured token */
      }
      const ok = await enrollBiometric(creds.email, refreshToken);
      if (ok) {
        try { localStorage.removeItem(BIOMETRIC_DECLINED_KEY); } catch { /* non-fatal */ }
        // Enabling biometrics IS the durable "remember this device" opt-in — persist
        // the session to localStorage so a biometric restore survives an app kill.
        try { localStorage.setItem('pontifex.rememberMe', 'true'); } catch { /* non-fatal */ }
      }
    } catch {
      /* enrollment failed — just dismiss; user can retry in My Profile → Security */
    } finally {
      setEnrolling(false);
      setShow(false);
    }
  };

  const handleSkip = () => {
    try { localStorage.setItem(BIOMETRIC_DECLINED_KEY, 'true'); } catch { /* non-fatal */ }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center border border-gray-200"
      >
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
          <ScanFace className="w-7 h-7 text-blue-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Sign in faster next time?</h2>
        <p className="text-sm text-gray-600 mb-5">
          Use {bioLabel} to sign in without typing your password.
        </p>
        <button
          type="button"
          onClick={handleEnable}
          disabled={enrolling}
          className="w-full py-3 rounded-xl text-white font-bold bg-gradient-to-r from-blue-600 to-blue-700 hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mb-2"
        >
          {enrolling ? 'Enabling…' : `Enable ${bioLabel}`}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={enrolling}
          className="w-full py-3 rounded-xl text-gray-500 font-semibold hover:text-gray-700 transition-colors disabled:opacity-50"
        >
          Not now
        </button>
      </motion.div>
    </div>
  );
}
