'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

/**
 * Deprecated alias — the platform console moved to /dashboard/platform/*.
 * This thin redirect keeps any existing bookmarks/links working.
 * (Super_admin gating is enforced by the new platform layout.)
 */
export default function TenantManagementRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/platform/tenants');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
      <RefreshCw className="w-8 h-8 text-violet-600 animate-spin" />
    </div>
  );
}
