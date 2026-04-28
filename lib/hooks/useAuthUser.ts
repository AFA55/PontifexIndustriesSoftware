'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';

export type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'unauthorized';

interface UseAuthUserOptions {
  requiredRoles?: string[];
  redirectTo?: string;
}

export function useAuthUser(options: UseAuthUserOptions = {}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<AuthState>('loading');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        // 1. Verify the actual Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (!cancelled) {
            setState('unauthenticated');
            router.push(options.redirectTo ?? '/login');
          }
          return;
        }

        // 2. Get cached user (now cross-validated against session in getCurrentUser)
        const cached = getCurrentUser();

        // 3. If IDs match, use cached role; otherwise fetch from profiles
        let userObj: User | null = cached;
        if (!cached || cached.id !== session.user.id) {
          // Fetch fresh profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, email, role')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile) {
            userObj = {
              id: profile.id,
              name: (profile as { full_name?: string }).full_name ?? '',
              email: (profile as { email?: string }).email ?? session.user.email ?? '',
              role: (profile as { role?: string }).role ?? 'operator',
            };
            // Update cache
            if (typeof window !== 'undefined') {
              localStorage.setItem('supabase-user', JSON.stringify(userObj));
            }
          }
        }

        if (!userObj) {
          if (!cancelled) {
            setState('unauthenticated');
            router.push(options.redirectTo ?? '/login');
          }
          return;
        }

        // 4. Role check
        if (options.requiredRoles && !options.requiredRoles.includes(userObj.role)) {
          if (!cancelled) {
            setState('unauthorized');
            // Send to their appropriate home
            const ADMIN_ROLES = ['super_admin', 'admin', 'operations_manager', 'salesman', 'shop_manager', 'inventory_manager'];
            router.push(ADMIN_ROLES.includes(userObj.role) ? '/dashboard/admin' : '/dashboard');
          }
          return;
        }

        if (!cancelled) {
          setUser(userObj);
          setState('authenticated');
        }
      } catch {
        if (!cancelled) {
          setState('unauthenticated');
          router.push(options.redirectTo ?? '/login');
        }
      }
    }

    check();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, state, loading: state === 'loading' };
}
