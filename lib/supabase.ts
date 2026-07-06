import { createClient } from '@supabase/supabase-js';

// Placeholder URL keeps build & static generation working — real env vars set on Vercel / .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || 'placeholder-key';

if (typeof window !== 'undefined' && supabaseUrl === 'https://placeholder.supabase.co') {
  console.error('[Supabase] NEXT_PUBLIC_SUPABASE_URL is not set — API calls will fail. Check .env.local');
}

/**
 * "Remember me" storage adapter.
 *
 * The Supabase auth session is persisted through this adapter so the "Remember
 * me" checkbox on /login actually means something on EVERY platform (web +
 * the iOS Capacitor webview):
 *   - Remember me ON (default)  → session lives in localStorage → survives a
 *     full browser/app restart (auto-refresh keeps the token alive). This is
 *     the behaviour field operators want.
 *   - Remember me OFF           → session lives in sessionStorage → it is wiped
 *     when the browser window / app is fully closed, forcing a fresh login next
 *     launch. (Reloads within the same session still work.)
 *
 * The preference itself (`pontifex.rememberMe`) is always kept in localStorage
 * so it survives to drive the routing decision. The login flow writes that flag
 * BEFORE calling setSession(), so the very first write already lands in the
 * correct store. getItem() falls back to the other store so an in-flight session
 * is never lost the instant the preference flips.
 */
const REMEMBER_KEY = 'pontifex.rememberMe';

function rememberPersistent(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    // Default OFF: only persistent when the user explicitly opted in ('true').
    // Matches the login pages' auto-resume guard (=== 'true') so an absent flag
    // is treated as not-remembered consistently across the app.
    return window.localStorage.getItem(REMEMBER_KEY) === 'true';
  } catch {
    return true;
  }
}

const rememberAwareStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const primary = rememberPersistent() ? window.localStorage : window.sessionStorage;
      const secondary = rememberPersistent() ? window.sessionStorage : window.localStorage;
      // Prefer the store that matches the current preference, but fall back to
      // the other so a session written before the preference changed is found.
      return primary.getItem(key) ?? secondary.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      if (rememberPersistent()) {
        window.localStorage.setItem(key, value);
        window.sessionStorage.removeItem(key);
      } else {
        window.sessionStorage.setItem(key, value);
        window.localStorage.removeItem(key);
      }
    } catch {
      /* storage unavailable (private mode / quota) — non-fatal */
    }
  },
  removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch { /* ignore */ }
    try {
      window.sessionStorage.removeItem(key);
    } catch { /* ignore */ }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Custom adapter so the "Remember me" choice controls whether the session
    // survives a full browser/app restart. Defaults to localStorage behaviour.
    storage: typeof window !== 'undefined' ? rememberAwareStorage : undefined,
    // Passkeys / WebAuthn (Face ID, Touch ID, security keys). Experimental in
    // supabase-js — must be opted into explicitly. Enables auth.registerPasskey
    // / auth.signInWithPasskey used by the biometric sign-in components.
    experimental: { passkey: true },
  },
} as Parameters<typeof createClient>[2]);
