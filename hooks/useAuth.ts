/**
 * useAuth Hook
 *
 * Provides authentication state and role checking.
 * Replaces the scattered auth checks in every page.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

interface UseAuthOptions {
  /** Require a specific role. Redirects to dashboard if wrong role. */
  requireRole?: 'admin' | 'operator';
  /** Redirect path when not authenticated. Default: '/login' */
  redirectTo?: string;
}

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isOperator: boolean;
  /** Get the current session token for API calls */
  getToken: () => Promise<string | null>;
}

export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const { requireRole, redirectTo = '/login' } = options;
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentUser = getCurrentUser();

    if (!currentUser) {
      router.push(redirectTo);
      setLoading(false);
      return;
    }

    if (requireRole && currentUser.role !== requireRole) {
      router.push(currentUser.role === 'admin' ? '/dashboard/admin' : '/dashboard');
      setLoading(false);
      return;
    }

    setUser(currentUser);
    setLoading(false);
  }, [requireRole, redirectTo, router]);

  const getToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  return {
    user,
    loading,
    isAdmin: user?.role === 'admin',
    isOperator: user?.role === 'operator',
    getToken,
  };
}
