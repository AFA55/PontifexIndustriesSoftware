/**
 * Native Face ID / Touch ID biometric sign-in.
 *
 * The Pontifex app is a remote-URL Capacitor webview, so this web code is served
 * from prod and calls the native @capgo/capacitor-native-biometric plugin through
 * the Capacitor bridge ONLY when running inside the native shell. On the website
 * (and SSR) every function is a safe no-op — the plugin is dynamically imported so
 * it's never bundled into the web build.
 *
 * Flow: after a successful password login we silently store the credentials in the
 * iOS Keychain (saveCredentials). On the login screen, if credentials exist, we show
 * a "Sign in with Face ID" button → verifyAndGetCredentials() prompts Face ID, and on
 * success returns the stored email/password to auto-submit the normal login.
 *
 * ⚠️ Requires a NATIVE iOS build (the plugin is native): install + `npx cap sync ios`
 * + NSFaceIDUsageDescription in Info.plist + a new App Store build. Until that ships,
 * these calls no-op in the current installed app (no crash) and on the website.
 */
import { isNativeApp } from './is-native';

// Keychain "server" key that scopes the stored credential to this app.
const SERVER = 'com.pontifexindustries.app';

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

/** Friendly label for the device's biometry type. */
export function biometryLabel(biometryType: string): string {
  const t = (biometryType || '').toLowerCase();
  if (t.includes('face')) return 'Face ID';
  if (t.includes('touch')) return 'Touch ID';
  if (t.includes('finger')) return 'fingerprint';
  return 'biometrics';
}

/** Store the login credentials in the Keychain (silent — no prompt on save). */
export async function saveCredentials(email: string, password: string): Promise<boolean> {
  const NB = await getPlugin();
  if (!NB || !email || !password) return false;
  try {
    await NB.setCredentials({ username: email, password, server: SERVER });
    return true;
  } catch {
    return false;
  }
}

/** Are there stored credentials we could offer a Face ID sign-in for? */
export async function hasSavedCredentials(): Promise<boolean> {
  const NB = await getPlugin();
  if (!NB) return false;
  try {
    const c = await NB.getCredentials({ server: SERVER });
    return !!(c && c.username && c.password);
  } catch {
    return false;
  }
}

/** Prompt Face ID; on success return the stored credentials. null = cancelled/failed. */
export async function verifyAndGetCredentials(
  reason = 'Sign in to Pontifex'
): Promise<{ email: string; password: string } | null> {
  const NB = await getPlugin();
  if (!NB) return null;
  try {
    await NB.verifyIdentity({
      reason,
      title: 'Sign in',
      subtitle: 'Use Face ID to sign in to Pontifex',
      maxAttempts: 2,
      useFallback: true, // allow device passcode fallback
    });
    const c = await NB.getCredentials({ server: SERVER });
    if (c && c.username && c.password) return { email: c.username, password: c.password };
    return null;
  } catch {
    return null; // user cancelled or authentication failed
  }
}

/** Remove stored credentials (e.g. on logout or "disable Face ID"). */
export async function clearCredentials(): Promise<void> {
  const NB = await getPlugin();
  if (!NB) return;
  try {
    await NB.deleteCredentials({ server: SERVER });
  } catch {
    /* ignore */
  }
}
