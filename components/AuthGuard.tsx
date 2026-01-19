'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'operator' | 'apprentice';
}

export default function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, [pathname]);

  async function checkAuth() {
    try {
      // Check Supabase session
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        console.log('❌ No valid session, redirecting to login...');
        router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      // Get user profile to check role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, active')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile) {
        console.error('❌ Profile fetch error:', profileError);
        router.push('/login');
        return;
      }

      if (!profile.active) {
        console.log('❌ Account is inactive');
        router.push('/login');
        return;
      }

      // Check if user has required role
      if (requiredRole) {
        const hasPermission = profile.role === requiredRole || profile.role === 'admin';
        if (!hasPermission) {
          console.log('❌ Insufficient permissions');
          // Redirect to appropriate dashboard based on role
          if (profile.role === 'operator' || profile.role === 'apprentice') {
            router.push('/dashboard');
          } else {
            router.push('/login');
          }
          return;
        }
      }

      // User is authenticated and authorized
      setIsAuthorized(true);
      setIsLoading(false);
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/login');
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
