'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

interface AdminProtectionProps {
  children: ReactNode;
}

export default function AdminProtection({ children }: AdminProtectionProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    console.log('🔍 Checking admin access...');
    const currentUser = getCurrentUser();

    if (!currentUser) {
      console.log('❌ No authenticated user found, redirecting to login...');
      router.push('/login');
      return;
    }

    if (currentUser.role !== 'admin') {
      console.log('🚫 User is not admin, access denied. Redirecting to operator dashboard...');
      router.push('/dashboard');
      return;
    }

    console.log('✅ Admin access granted');
    setIsAuthorized(true);
    setLoading(false);
  }, [router]);

  if (loading || !isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Verifying access...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
