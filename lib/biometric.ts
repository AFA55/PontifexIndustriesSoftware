/**
 * Native Face ID / Touch ID biometric sign-in.
 *
 * The Pontifex app is a remote-URL Capacitor webview, so this web code is served
 * from prod and calls the native @capgo/capacitor-native-biometric plugin through
 * the Capacitor bridge ONLY when running inside the native shell. On the website
 * (and SSR) every function is a safe no-op — the plugin is dynamically imported so
 * it's never bundled into the web build.
 *
 * ── SECURITY MODEL (reworked Jun 2026 — see docs/plans/BIOMETRIC_LOGIN_ARCHITECTURE.md) ──
 * We store the Supabase **refresh token** (NOT the password) in the iOS Keychain,
 * protected by OS-enforced biometric access control (`BIOMETRY_CURRENT_SET`):
 *
 *   - The token lives in the credential's `password` slot (the plugin stores a
 *     username/password pair); the email is the `username`.
 *   - `accessControl: BIOMETRY_CURRENT_SET` makes the *operating system* require a
 *     live biometric match before the Keychain item can be read — the gate is the
 *     Secure Enclave, NOT a JS `verifyIdentity()` boolean (which is bypassable on a
 *     jailbroken device by hooking the bridge). The stored token is also invalidated
 *     by the OS if the device's biometric set changes (a new face/finger enrolled).
 *   - On return: biometric unlock → read the refresh token → mint a fresh Supabase
 *     session via `supabase.auth.refreshSession({ refresh_token })`. The password is
 *     NEVER persisted, and the token is revocable server-side.
 *
 * Supabase ROTATES refresh tokens on each use (single-use), so callers MUST re-store
 * the new token after a successful session restore — see `enrollBiometric` callers in
 * the login flow.
 *
 * ⚠️ Requires the NATIVE plugin (@capgo/capacitor-native-biometric 8.4.x, which adds
 * `accessControl` + `getSecureCredentials`, since 8.4.0). It's bundled in iOS Build 9.
 * These calls no-op on the website and degrade gracefully (no crash) on any older
 * native build that lacks the plugin or the accessControl param.
 */
import { isNativeApp } from './is-native';

// Keychain "server" key that scopes the stored credential to this app.
const SERVER = 'com.pontifexindustries.app';

/**
 * localStorage key (native-only) recording the EMAIL the device's biometric entry is
 * bound to. The Keychain item is keyed only by SERVER, so WITHOUT this binding a
 * different user on a shared device could tap "Sign in with Face ID" and restore the
 * PREVIOUS user's session (cross-account restore). The email is NOT a secret (it's
 * already kept in pontifex.lastEmail) — it exists only so the next password login can
 * detect a user switch and invalidate the stale biometric entry. Written by
 * enrollBiometric, cleared by disableBiometric, and compared in the login flow.
 */
export const BIOMETRIC_EMAIL_KEY = 'pontifex.biometricEmail';

/**
 * localStorage flag (native-only) recording that the user declined an
 * "enable Face ID?" enrollment offer, so we don't nag them again. Distinct from
 * being enrolled. Shared by BOTH offer surfaces — the post-password-login prompt
 * (app/login/page.tsx) and the post-resume dashboard nudge
 * (components/BiometricEnrollNudge.tsx) — so declining either one suppresses both.
 */
export const BIOMETRIC_DECLINED_KEY = 'pontifex.biometricDeclined';

/**
 * AccessControl.BIOMETRY_CURRENT_SET from @capgo/capacitor-native-biometric.
 * Mirrored as a literal so we don't have to statically import the plugin's enum on
 * web (the plugin is dynamic-import-only). Verified against the plugin's
 * definitions.d.ts: enum AccessControl { NONE = 0, BIOMETRY_CURRENT_SET = 1, BIOMETRY_ANY = 2 }.
 * The native iOS layer reads it as `call.getInt("accessControl")` and maps 1 →
 * SecAccessControlCreateFlags.biometryCurrentSet.
 */
const ACCESS_CONTROL_BIOMETRY_CURRENT_SET = 1;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function getPlugin(): Promise<any | null> {
  if (!isNativeApp()) return null;
  try {
    const mod = await import('@capgo/capacitor-native-biometric');
    return (mod as any).NativeBiometric ?? null;
  } catch {
    return null; // plugin not present in this build (older app) — degrade gracefully
  }
}

export interface BiometricStatus {
  available: boolean;
  /** 'faceId' | 'touchId' | 'fingerprint' | 'none' */
  biometryType: string;
}

/** Is biometric hardware available + enrolled on this device (native only)? */
export async function biometricAvailable(): Promise<BiometricStatus> {
  const NB = await getPlugin();
  if (!NB) return { available: false, biometryType: 'none' };
  try {
    const res = await NB.isAvailable({ useFallback: false });
    return { available: !!res?.isAvailable, biometryType: String(res?.biometryType ?? 'none') };
  } catch {
    return { available: false, biometryType: 'none' };
  }
}

/**
 * Full snapshot of the device's biometric state for the My Profile → Security UI.
 * Unlike biometricAvailable(), this NEVER throws and reports WHY enrollment can't be
 * offered, so the UI can show actionable guidance (and a status line the user can read
 * back) instead of silently hiding the whole feature.
 */
export interface BiometricDiagnostics {
  /** Running inside the native iOS/Android Capacitor shell? */
  nativeShell: boolean;
  /** Was the native biometric plugin resolvable in this build? */
  pluginPresent: boolean;
  /** Hardware present + enrolled at the OS level AND Pontifex allowed to use it? */
  available: boolean;
  /** 'faceId' | 'touchId' | 'fingerprint' | 'none' */
  biometryType: string;
  /** Has the user already enrolled biometric sign-in on this device? */
  enrolled: boolean;
  /** Plugin error code / message when not available (e.g. permission denied). */
  errorCode?: string;
}

/** Non-throwing snapshot of biometric state for the settings UI. Native-only. */
export async function biometricDiagnostics(): Promise<BiometricDiagnostics> {
  const nativeShell = isNativeApp();
  const NB = await getPlugin();
  const pluginPresent = !!NB;
  let available = false;
  let biometryType = 'none';
  let enrolled = false;
  let errorCode: string | undefined;
  if (NB) {
    try {
      const res = await NB.isAvailable({ useFallback: false });
      available = !!res?.isAvailable;
      biometryType = String(res?.biometryType ?? 'none');
      if (!available && res?.errorCode != null) errorCode = String(res.errorCode);
    } catch (e: unknown) {
      errorCode = e instanceof Error && e.message ? e.message : 'isAvailable failed';
    }
    try {
      enrolled = await hasEnrolledBiometric();
    } catch {
      /* leave enrolled=false */
    }
  }
  return { nativeShell, pluginPresent, available, biometryType, enrolled, errorCode };
}

/** Friendly label for the device's biometry type. */
export function biometryLabel(biometryType: string): string {
  const t = (biometryType || '').toLowerCase();
  if (t.includes('face')) return 'Face ID';
  if (t.includes('touch')) return 'Touch ID';
  if (t.includes('finger')) return 'fingerprint';
  return 'biometrics';
}

/**
 * Enroll biometric sign-in: store the Supabase refresh token in the Keychain behind
 * OS-enforced biometric access control. The token goes in the credential's `password`
 * slot; biometric auth is then required by the OS to read it back.
 *
 * Call this:
 *   1. when the user opts in (post-login prompt or the My Profile → Security toggle), and
 *   2. after each biometric session-restore, to re-store the rotated refresh token.
 *
 * No-op on web/SSR and on older native builds without the plugin (returns false).
 */
export async function enrollBiometric(email: string, refreshToken: string): Promise<boolean> {
  const NB = await getPlugin();
  if (!NB || !email || !refreshToken) return false;
  try {
    // Delete any prior entry first so a re-enroll with a fresh accessControl flag /
    // rotated token cleanly replaces the old (possibly NONE-protected) credential.
    try {
      await NB.deleteCredentials({ server: SERVER });
    } catch {
      /* nothing stored yet — fine */
    }
    await NB.setCredentials({
      username: email,
      password: refreshToken,
      server: SERVER,
      accessControl: ACCESS_CONTROL_BIOMETRY_CURRENT_SET,
    });
    // Bind the entry to this user so a different user on a shared device can't
    // restore it (see BIOMETRIC_EMAIL_KEY). Non-secret; native-only.
    try { window.localStorage.setItem(BIOMETRIC_EMAIL_KEY, email); } catch { /* non-fatal */ }
    return true;
  } catch {
    return false;
  }
}

/**
 * The email the device's biometric sign-in is currently bound to, or null.
 * Lets the login flow detect a user switch (and display whose Face ID it is).
 * Native-only; null on web/SSR.
 */
export function enrolledBiometricEmail(): string | null {
  if (!isNativeApp()) return null;
  try {
    return window.localStorage.getItem(BIOMETRIC_EMAIL_KEY);
  } catch {
    return null;
  }
}

/**
 * Has the user enrolled biometric sign-in on this device (i.e. is there a stored
 * credential we could offer a Face ID sign-in for)? Uses the plugin's
 * `isCredentialsSaved` (since 7.3.0) which does NOT trigger a biometric prompt —
 * so we can decide whether to render the button without prompting the user.
 */
export async function hasEnrolledBiometric(): Promise<boolean> {
  const NB = await getPlugin();
  if (!NB) return false;
  try {
    if (typeof NB.isCredentialsSaved === 'function') {
      const res = await NB.isCredentialsSaved({ server: SERVER });
      return !!res?.isSaved;
    }
  } catch {
    /* fall through to a non-prompting best-effort check */
  }
  // Fallback for older plugins without isCredentialsSaved: we cannot read a
  // biometry-protected item without prompting, so assume not enrolled.
  return false;
}

/** Back-compat alias (older callers). Prefer hasEnrolledBiometric. */
export const hasSavedCredentials = hasEnrolledBiometric;

/**
 * Prompt biometrics (OS-enforced) and return the stored Supabase refresh token.
 * null = cancelled / failed / not enrolled.
 *
 * The real security gate is `getSecureCredentials`: because the item was stored with
 * `accessControl: BIOMETRY_CURRENT_SET`, the OS itself shows the Face ID/Touch ID
 * prompt and only releases the token on a live biometric match. We do NOT rely on a
 * separate `verifyIdentity()` boolean for security.
 */
export async function verifyAndGetSession(
  reason = 'Sign in to Pontifex'
): Promise<{ email: string; refreshToken: string } | null> {
  const NB = await getPlugin();
  if (!NB) return null;
  try {
    // getSecureCredentials (since 8.4.0) triggers the OS biometric prompt for an
    // accessControl-protected item and returns the credential on success.
    let creds: { username?: string; password?: string } | null = null;
    if (typeof NB.getSecureCredentials === 'function') {
      creds = await NB.getSecureCredentials({
        server: SERVER,
        reason,
        title: 'Sign in',
        subtitle: 'Use biometrics to sign in to Pontifex',
      });
    } else {
      // Fallback for older plugins: a JS verify + plain getCredentials. Weaker
      // (the boolean is the only gate) but keeps sign-in working on legacy builds.
      await NB.verifyIdentity({
        reason,
        title: 'Sign in',
        subtitle: 'Use biometrics to sign in to Pontifex',
        maxAttempts: 2,
        useFallback: true,
      });
      creds = await NB.getCredentials({ server: SERVER });
    }
    if (creds && creds.username && creds.password) {
      return { email: creds.username, refreshToken: creds.password };
    }
    return null;
  } catch {
    return null; // user cancelled, biometric failed, or token invalidated by the OS
  }
}

/**
 * Remove the stored biometric credential (refresh token) from the Keychain.
 * Call on explicit logout, when the user disables Face ID, or when a stored token
 * is found to be revoked. No-op on web/SSR.
 */
export async function disableBiometric(): Promise<void> {
  // Always clear the email binding, even if the plugin is absent (web/old build),
  // so a stale binding can't linger.
  try { window.localStorage.removeItem(BIOMETRIC_EMAIL_KEY); } catch { /* non-fatal */ }
  const NB = await getPlugin();
  if (!NB) return;
  try {
    await NB.deleteCredentials({ server: SERVER });
  } catch {
    /* ignore — nothing stored / plugin absent */
  }
}

/** Back-compat alias (older callers). Prefer disableBiometric. */
export const clearCredentials = disableBiometric;
