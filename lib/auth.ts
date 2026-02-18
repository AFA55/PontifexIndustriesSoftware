/**
 * Pontifex Industries - Authentication Helpers
 *
 * Provides client-side auth utilities backed by Supabase Auth.
 * All session state comes from the Supabase session + localStorage cache.
 *
 * NOTE: The login flow is handled by /api/auth/login which uses
 * supabase.auth.signInWithPassword(). This file only provides
 * helpers to read the current user on the client side.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

/**
 * Get the currently logged-in user from the localStorage session cache.
 * The cache is populated on login by the login page after a successful
 * Supabase Auth sign-in + profile fetch.
 *
 * Returns null if no user is logged in.
 */
export const getCurrentUser = (): User | null => {
  if (typeof window === 'undefined') return null;

  try {
    const userStr = localStorage.getItem('supabase-user');
    if (userStr && userStr.trim()) {
      const user = JSON.parse(userStr);
      return user;
    }
  } catch (error) {
    console.error('Error reading user session:', error);
    localStorage.removeItem('supabase-user');
  }

  return null;
};

/**
 * Log out the current user.
 * Clears the Supabase session and the localStorage cache.
 */
export const logout = async (): Promise<void> => {
  if (typeof window === 'undefined') return;

  try {
    const { supabase } = await import('@/lib/supabase');
    await supabase.auth.signOut();
  } catch (e) {
    console.log('Supabase signOut error:', e);
  }

  localStorage.removeItem('supabase-user');
  // Clean up any legacy keys that might still exist
  localStorage.removeItem('pontifex-user');
};

/**
 * Check if a user is currently authenticated.
 */
export const isAuthenticated = (): boolean => {
  return getCurrentUser() !== null;
};

/**
 * Check if the current user is an admin.
 */
export const isAdmin = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'admin';
};

/**
 * Check if the current user is an operator.
 */
export const isOperator = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'operator';
};

/**
 * Check if the current user has a specific role.
 */
export const hasRole = (role: string): boolean => {
  const user = getCurrentUser();
  return user?.role === role;
};
