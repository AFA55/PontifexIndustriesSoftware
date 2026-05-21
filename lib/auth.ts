export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export const getCurrentUser = (): User | null => {
  if (typeof window === 'undefined') return null;

  try {
    const supabaseUserStr = localStorage.getItem('supabase-user');
    if (supabaseUserStr && supabaseUserStr.trim()) {
      const user = JSON.parse(supabaseUserStr);

      // Cross-validate cached user ID against the actual Supabase session.
      // Supabase stores its session under 'sb-{projectRef}-auth-token'.
      // If the IDs don't match, the cache is stale (different user logged in).
      try {
        const supabaseKeys = Object.keys(localStorage).filter(
          k => k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        for (const key of supabaseKeys) {
          const sessionStr = localStorage.getItem(key);
          if (sessionStr) {
            const session = JSON.parse(sessionStr);
            const sessionUserId = session?.user?.id;
            if (sessionUserId && user.id !== sessionUserId) {
              // Stale cache — different user is actually logged in
              localStorage.removeItem('supabase-user');
              return null;
            }
          }
        }
      } catch {
        // If validation fails, trust the localStorage value (best-effort)
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

  // Sign out from Supabase to clear the session token
  try {
    const { supabase } = await import('@/lib/supabase');
    await supabase.auth.signOut();
  } catch {
    // Supabase signOut may fail if no session exists
  }

  localStorage.removeItem('patriot-user');
  localStorage.removeItem('supabase-user');
  localStorage.removeItem('platform-user');
  localStorage.removeItem('current-tenant');
  // Clear all branding caches
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('branding-')) localStorage.removeItem(key);
  });
  // Clear Supabase-managed session keys to prevent stale session bleed across users
  Object.keys(localStorage)
    .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
    .forEach(k => localStorage.removeItem(k));
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