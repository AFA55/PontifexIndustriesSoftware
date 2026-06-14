'use client';

/**
 * Browser-side passkey helpers — biometric (fingerprint / Touch ID / Windows
 * Hello) sign-in for the website. Thin glue over @simplewebauthn/browser that
 * talks to the ceremony routes under /api/auth/webauthn/*.
 *
 * Web analogue of the native app's Face ID (lib/biometric.ts). On the iOS
 * Capacitor webview the native Face ID path still applies; this is for real
 * browsers (incl. desktop Safari Touch ID, Chrome on Android, Windows Hello).
 */

import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';
import { supabase } from '@/lib/supabase';

/**
 * Authorization header for the authenticated (enrollment / management) calls.
 * The API's requireAuth() reads `Authorization: Bearer <access_token>`, matching
 * the rest of the app (see app/dashboard/my-profile/page.tsx). The PUBLIC login
 * ceremonies don't need this (the user isn't signed in yet).
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
 * Enroll a new passkey for the CURRENTLY SIGNED-IN user.
 * Returns { success } or { success:false, error } (incl. user-cancelled).
 */
export async function registerPasskey(
  nickname?: string
): Promise<{ success: boolean; error?: string }> {
  if (!passkeySupported()) {
    return { success: false, error: 'This device does not support passkeys.' };
  }
  try {
    const headers = await authHeaders();
    const optRes = await fetch('/api/auth/webauthn/register/options', { method: 'POST', headers });
    const optJson = await optRes.json();
    if (!optRes.ok || !optJson.options) {
      return { success: false, error: optJson.error || 'Could not start passkey setup.' };
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
      return { success: false, error: verifyJson.error || 'Passkey setup failed.' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: cancelledOrMessage(err) };
  }
}

/**
 * Passwordless login with a passkey. The browser surfaces the user's available
 * passkeys; on success the server returns a minted Supabase session.
 */
export async function loginWithPasskey(): Promise<PasskeyLoginResult> {
  if (!passkeySupported()) {
    return { success: false, error: 'This device does not support passkeys.' };
  }
  try {
    const optRes = await fetch('/api/auth/webauthn/authenticate/options', { method: 'POST' });
    const optJson = await optRes.json();
    if (!optRes.ok || !optJson.options) {
      return { success: false, error: optJson.error || 'Could not start passkey sign-in.' };
    }

    const assertion = await startAuthentication({ optionsJSON: optJson.options });

    const verifyRes = await fetch('/api/auth/webauthn/authenticate/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: assertion }),
    });
    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok || !verifyJson.success) {
      return { success: false, error: verifyJson.error || 'Passkey sign-in failed.' };
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

/** Friendly message; treat user-cancelled / aborted ceremonies as a soft no-op. */
function cancelledOrMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return 'cancelled';
  }
  return (err as { message?: string })?.message || 'Something went wrong.';
}
