'use client';

/**
 * /nfc-clock — RETIRED (Jun 10, 2026).
 *
 * The NFC/PIN kiosk clock-in flow was removed from the product: clock-in is now
 * GPS-within-facility (or Remote with approval) on /dashboard/timecard. This stub
 * exists so old NFC chips / bookmarks don't 404 AND so the retired flow can never
 * be used to post an `nfc` clock-in that bypasses the GPS radius check.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export default function RetiredNfcClockPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/timecard');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
      <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 text-sm">
        <RefreshCw className="w-4 h-4 animate-spin" /> Redirecting to your timecard…
      </div>
    </div>
  );
}
