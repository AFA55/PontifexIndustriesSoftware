export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export const getCurrentUser = (): User | null => {
  if (typeof window === 'undefined') return null;

  try {
    // Check for Supabase user
    const supabaseUserStr = localStorage.getItem('supabase-user');
    if (supabaseUserStr && supabaseUserStr.trim()) {
      return JSON.parse(supabaseUserStr);
    }

    // Fallback to old localStorage system for backwards compatibility
    const userStr = localStorage.getItem('pontifex-user');
    if (userStr && userStr.trim()) {
      return JSON.parse(userStr);
    }
  } catch (error) {
    console.error('Error getting user from localStorage:', error);
    localStorage.removeItem('pontifex-user');
    localStorage.removeItem('supabase-user');
  }

  return null;
};

export const logout = async (): Promise<void> => {
  if (typeof window === 'undefined') return;

  try {
    const { supabase } = await import('@/lib/supabase');
    await supabase.auth.signOut();
  } catch (e) {
    // Supabase signOut may fail if not initialized
  }

  localStorage.removeItem('pontifex-user');
  localStorage.removeItem('supabase-user');
};

export const isAuthenticated = (): boolean => {
  return getCurrentUser() !== null;
};

export const isAdmin = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'admin' || user?.role === 'super_admin';
};

export const isOperator = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'operator';
};

export const hasRole = (role: string): boolean => {
  const user = getCurrentUser();
  return user?.role === role;
};
