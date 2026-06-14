'use client';

/**
 * Browser-side biometric (Touch ID / Face ID / Windows Hello / fingerprint)
 * sign-in for the website — the Bank-of-America-style flow:
 *   1. After a normal password login we ask "Use Touch ID next time?" and enroll
 *      a PLATFORM passkey, remembering the username on THIS device.
 *   2. On return the login screen shows the saved username + a "Use Touch ID"
 *      button → a DIRECT biometric prompt (no passkey chooser) signs the user in.
 *
 * Passwordless by design: the biometric assertion is the credential — we never
 * store the password. Web analogue of the native app's Face ID (lib/biometric.ts);
 * hidden on the native app (which has its own native biometric path).
 *
 * Thin glue over @simplewebauthn/browser + the ceremony routes under
 * /api/auth/webauthn/*. "Direct prompt, no chooser" is achieved by targeting the
 * one credential enrolled on this device (allowCredentials = [its id]).
 */

import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';
import { supabase } from '@/lib/supabase';

// Per-device record of the biometric enrollment, so the login screen can show
// the saved username + target the exact credential for a chooser-free prompt.
const BIOMETRIC_KEY = 'pontifex.biometric';

export interface EnrolledBiometric {
  credentialId: string;
  email: string;
  /** Device-appropriate label captured at enroll time ('Touch ID', 'Face ID', …). */
  label: string;
}

export function getEnrolledBiometric(): EnrolledBiometric | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BIOMETRIC_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v?.credentialId && v?.email ? (v as EnrolledBiometric) : null;
  } catch {
    return null;
  }
}

export function setEnrolledBiometric(v: EnrolledBiometric): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BIOMETRIC_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function clearEnrolledBiometric(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(BIOMETRIC_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Device-appropriate biometric label for the button/prompt copy:
 * "Touch ID" (Mac), "Face ID" (iPhone/iPad), "Windows Hello", "fingerprint"
 * (Android), or a generic fallback. The web has no API to read the actual
 * biometric type, so we infer from the platform — purely cosmetic.
 */
export function biometricLabel(): string {
  if (typeof navigator === 'undefined') return 'biometrics';
  const ua = navigator.userAgent || '';
  const plat = navigator.platform || '';
  if (/iPhone|iPad|iPod/.test(ua) || /iPad|iPhone/.test(plat)) return 'Face ID';
  if (/Mac/.test(plat) || /Macintosh/.test(ua)) return 'Touch ID';
  if (/Android/.test(ua)) return 'fingerprint';
  if (/Win/.test(plat) || /Windows/.test(ua)) return 'Windows Hello';
  return 'biometrics';
}

/** Does this browser support WebAuthn at all? */
export function passkeySupported(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/** Is a built-in platform authenticator (fingerprint / Face / Hello) available? */
export async function platformPasskeyAvailable(): Promise<boolean> {
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

export interface PasskeyLoginResult {
  success: boolean;
  error?: string;
  user?: { id: string; email: string; full_name: string; role: string; tenant_id: string | null };
  tenant?: { id: string; name: string; slug: string; company_code: string } | null;
  session?: { access_token: string; refresh_token: string };
}

/**
 * Enroll a PLATFORM biometric for the CURRENTLY SIGNED-IN user (call right after
 * a successful password login). Returns the new credential id so the caller can
 * remember it + the username on this device via setEnrolledBiometric().
 */
export async function registerPasskey(
  nickname?: string
): Promise<{ success: boolean; error?: string; credentialId?: string }> {
  if (!passkeySupported()) {
    return { success: false, error: 'This device does not support biometric sign-in.' };
  }
  try {
    const headers = await authHeaders();
    const optRes = await fetch('/api/auth/webauthn/register/options', { method: 'POST', headers });
    const optJson = await optRes.json();
    if (!optRes.ok || !optJson.options) {
      return { success: false, error: optJson.error || 'Could not start biometric setup.' };
    }

    // Prompts the platform biometric / creates the credential.
    const attResp = await startRegistration({ optionsJSON: optJson.options });

    const verifyRes = await fetch('/api/auth/webauthn/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ response: attResp, nickname }),
    });
    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok || !verifyJson.success) {
      return { success: false, error: verifyJson.error || 'Biometric setup failed.' };
    }
    return { success: true, credentialId: verifyJson.credential?.id };
  } catch (err) {
    return { success: false, error: cancelledOrMessage(err) };
  }
}

/**
 * Biometric login. Pass the credentialId enrolled on this device to fire a
 * DIRECT Touch ID/Face ID prompt (no passkey chooser). Omit it to fall back to
 * the usernameless/discoverable flow. On success the server returns a minted
 * Supabase session.
 */
export async function loginWithPasskey(credentialId?: string): Promise<PasskeyLoginResult> {
  if (!passkeySupported()) {
    return { success: false, error: 'This device does not support biometric sign-in.' };
  }
  try {
    const optRes = await fetch('/api/auth/webauthn/authenticate/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentialId ? { credentialId } : {}),
    });
    const optJson = await optRes.json();
    if (!optRes.ok || !optJson.options) {
      return { success: false, error: optJson.error || 'Could not start biometric sign-in.' };
    }

    const assertion = await startAuthentication({ optionsJSON: optJson.options });

    const verifyRes = await fetch('/api/auth/webauthn/authenticate/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: assertion }),
    });
    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok || !verifyJson.success) {
      return { success: false, error: verifyJson.error || 'Biometric sign-in failed.' };
    }
    return verifyJson as PasskeyLoginResult;
  } catch (err) {
    return { success: false, error: cancelledOrMessage(err) };
  }
}

export interface SavedPasskey {
  id: string;
  nickname: string | null;
  device_type: string | null;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

export async function listPasskeys(): Promise<SavedPasskey[]> {
  try {
    const res = await fetch('/api/auth/webauthn/credentials', { headers: await authHeaders() });
    const json = await res.json();
    return res.ok && json.success ? (json.data as SavedPasskey[]) : [];
  } catch {
    return [];
  }
}

export async function deletePasskey(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/auth/webauthn/credentials?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Authorization header for the authenticated (enrollment / management) calls.
 * The API's requireAuth() reads `Authorization: Bearer <access_token>`. The
 * PUBLIC login ceremonies don't need this (the user isn't signed in yet).
 */
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Friendly message; treat user-cancelled / aborted ceremonies as a soft no-op. */
function cancelledOrMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return 'cancelled';
  }
  return (err as { message?: string })?.message || 'Something went wrong.';
}
