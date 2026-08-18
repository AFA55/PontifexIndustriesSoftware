export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Set at login (Jul 11+). Used to keep platform-org users in the Platform Hub. */
  tenant_id?: string | null;
}

/**
 * Every browser store the Supabase session might be sitting in.
 *
 * WHY BOTH (bug found Aug 18): `lib/supabase.ts` routes the session through the
 * `rememberAwareStorage` adapter, which writes to **sessionStorage** unless the
 * user ticked "Remember me" — and the flag defaults to OFF, so sessionStorage is
 * where MOST sessions actually live. Everything in this file that went looking
 * for `sb-*-auth-token` looked only in localStorage. So:
 *
 *   - the stale-cache guard below scanned an empty set, found no session to
 *     disagree with, and returned the cached profile UNVALIDATED — the exact
 *     check its comment promised did not fire for most users;
 *   - `logout()` cleared the localStorage copy of a session that was in
 *     sessionStorage, and left it live.
 *
 * That matters because `supabase-user` (name, role, photo) is in localStorage
 * and therefore SHARED across tabs, while the session is per-tab. Amanda and
 * Andres sign in from the same office machine with identical browser
 * fingerprints: without this check one tab can render user B's name and role
 * beside user A's photo. It is display identity only — every fetch carries the
 * live bearer and the server re-authorises — but a nav that says the wrong
 * person is signed in is not something to leave running.
 */
const sessionStores = (): Storage[] => {
  const stores: Storage[] = [];
  // Read each one defensively: private mode / disabled storage throws on ACCESS,
  // not just on write, and one unavailable store must not hide the other.
  try {
    if (window.localStorage) stores.push(window.localStorage);
  } catch { /* unavailable — skip */ }
  try {
    if (window.sessionStorage) stores.push(window.sessionStorage);
  } catch { /* unavailable — skip */ }
  return stores;
};

/** Every `sb-{ref}-auth-token` blob present in either store, parsed. */
const readStoredSupabaseSessions = (): unknown[] => {
  const sessions: unknown[] = [];
  for (const store of sessionStores()) {
    for (const key of Object.keys(store)) {
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = store.getItem(key);
      if (!raw) continue;
      // A single unparseable blob is not a reason to give up on the others —
      // but it IS a reason to fail closed, so let it throw to the caller.
      sessions.push(JSON.parse(raw));
    }
  }
  return sessions;
};

/** Remove the Supabase session blob from BOTH stores. */
const clearStoredSupabaseSessions = (): void => {
  for (const store of sessionStores()) {
    try {
      Object.keys(store)
        .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .forEach(k => store.removeItem(k));
    } catch { /* unavailable — nothing to clear here */ }
  }
};

export const getCurrentUser = (): User | null => {
  if (typeof window === 'undefined') return null;

  try {
    const supabaseUserStr = localStorage.getItem('supabase-user');
    if (supabaseUserStr && supabaseUserStr.trim()) {
      const user = JSON.parse(supabaseUserStr);

      // Cross-validate cached user ID against the actual Supabase session.
      // Supabase stores its session under 'sb-{projectRef}-auth-token', in
      // whichever store the remember-me adapter chose — see sessionStores().
      // If the IDs don't match, the cache is stale (different user logged in).
      try {
        for (const session of readStoredSupabaseSessions()) {
          const sessionUserId = (session as { user?: { id?: string } } | null)?.user?.id;
          if (sessionUserId && user.id !== sessionUserId) {
            // Stale cache — a different user is actually logged in HERE.
            // Return null and stop: do NOT delete the blob. `supabase-user`
            // lives in localStorage, which every tab shares, while the SESSION
            // is per-tab (sessionStorage when "remember me" is off). Two people
            // on the office machine: this tab reloads with a stale cache,
            // disagrees with the blob the OTHER tab just wrote, and deleting it
            // would log HIM out — his next getCurrentUser() returns null, his
            // page guard bounces him to /login, and auto-resume needs the blob
            // that is now gone, so he retypes his password. Returning null is
            // the whole fix: this tab shows no user, his tab keeps working.
            return null;
          }
        }
      } catch {
        // Fail CLOSED: if we can't validate the cached user against the live
        // Supabase session token, treat the cache as untrustworthy and force a
        // fresh login rather than trusting a possibly-stale cached profile.
        // Prevents role/tenant bleed (previously this trusted localStorage).
        localStorage.removeItem('supabase-user');
        return null;
      }

      return user;
    }

  } catch (error) {
    console.error('Error getting user from localStorage:', error);
    localStorage.removeItem('supabase-user');
  }

  return null;
};

export const logout = async (): Promise<void> => {
  if (typeof window === 'undefined') return;

  // Sign out from Supabase. When a Face ID enrollment exists on this device,
  // sign out LOCALLY only (scope:'local' clears this device's session WITHOUT
  // revoking the refresh token server-side) — so the Keychain copy stays
  // valid and "log out → Face ID back in" actually works (founder Jul 21;
  // previously every logout revoked the token AND wiped enrollment, forcing
  // a password login + re-enroll every time). With no enrollment, a full
  // (global) signOut revokes as before.
  let keepBiometric = false;
  try {
    const { hasEnrolledBiometric } = await import('@/lib/biometric');
    keepBiometric = await hasEnrolledBiometric();
  } catch {
    /* biometric plugin absent / web — treat as not enrolled */
  }
  try {
    const { supabase } = await import('@/lib/supabase');
    await supabase.auth.signOut(keepBiometric ? { scope: 'local' } : undefined);
  } catch {
    // signOut can fail for two very different reasons — no session to sign out
    // of (harmless) or the network/auth service being unreachable (not
    // harmless). We cannot tell them apart here, and neither is a reason to
    // abandon the logout: the local teardown below runs unconditionally and
    // clears the session from BOTH stores, so a failed round trip can no longer
    // leave a live session behind on this machine. What a network failure DOES
    // cost is server-side revocation — the refresh token stays valid until it
    // expires. That is the honest limit of a client-side logout, and it is why
    // the local clear must never be conditional on this call succeeding.
  }
  if (!keepBiometric) {
    // No enrollment to preserve — clear any stale Keychain entry.
    try {
      const { disableBiometric } = await import('@/lib/biometric');
      await disableBiometric();
    } catch {
      /* biometric plugin absent / web — non-fatal */
    }
  }

  localStorage.removeItem('patriot-user');
  localStorage.removeItem('supabase-user');
  localStorage.removeItem('platform-user');
  localStorage.removeItem('current-tenant');
  // Clear all branding caches
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('branding-')) localStorage.removeItem(key);
  });
  // Clear Supabase-managed session keys to prevent stale session bleed across
  // users — from BOTH stores. With "Remember me" off (the default) the session
  // is in sessionStorage, so the old localStorage-only sweep cleared nothing
  // and the signed-out tab kept a working session.
  clearStoredSupabaseSessions();
  // ⚠️ Deliberately PRESERVED across logout (do not "clean up" these):
  //  - localStorage 'pontifex.lastCompany' → powers the one-tap "Continue to
  //    {Company}" fast path on /company-login (no re-typing the company code)
  //  - localStorage 'pontifex.rememberMe' → the user's remember-me preference
  //  - the iOS Keychain biometric entry WHEN ENROLLED (local-scope signOut above
  //    keeps its refresh token valid so Face ID re-login works after logout)
  console.log('User logged out');
};

export const isAuthenticated = (): boolean => {
  return getCurrentUser() !== null;
};

export const isAdmin = (): boolean => {
  const user = getCurrentUser();
  return ['admin', 'super_admin', 'operations_manager', 'supervisor', 'salesman'].includes(user?.role || '');
};

export const isSuperAdmin = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'super_admin';
};

export const isOpsManager = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'operations_manager';
};

export const isSupervisor = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'supervisor';
};

export const isSalesman = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'salesman';
};

export const isOperator = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'operator';
};

export const hasRole = (role: string): boolean => {
  const user = getCurrentUser();
  return user?.role === role;
};

export const isShopUser = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'shop_manager' || user?.role === 'admin' || user?.role === 'operator';
};

export const isShopManager = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'shop_manager' || user?.role === 'admin';
};