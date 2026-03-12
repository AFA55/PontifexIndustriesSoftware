'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Access Requests page — merged into Team Management.
 * Redirects to the unified Team Management page.
 */
export default function AccessRequestsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/admin/team-management');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to Team Management...</p>
      </div>
    </div>
  );
}
