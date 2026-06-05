'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Crown, ArrowLeft, RefreshCw } from 'lucide-react';
import { getCurrentUser, type User } from '@/lib/auth';

/**
 * Platform Console layout — super_admin ONLY.
 *
 * Single guard surface for the whole /dashboard/platform/* area (per
 * PLATFORM_CONSOLE_PLAN.md §1.2). Wraps every platform page in a DISTINCT
 * slate + amber/crown shell so a super_admin never confuses a cross-tenant
 * destructive action with their own client dashboard.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u || u.role !== 'super_admin') {
      router.push('/dashboard');
      return;
    }
    setUser(u);
    setChecked(true);
  }, [router]);

  if (!checked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Platform wordmark bar — slate/amber, distinct from the violet client shell */}
      <header className="bg-slate-900 border-b border-amber-500/30 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard/admin"
              title="Back to admin"
              className="p-2 -ml-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-slate-900" />
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-black tracking-wide leading-tight truncate">
                PONTIFEX <span className="text-amber-400">PLATFORM</span>
              </p>
              <p className="text-slate-400 text-[10px] leading-tight truncate">
                Platform owner console &middot; super admin
              </p>
            </div>
          </div>
          {user && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-slate-300 text-xs font-medium truncate max-w-[160px]">{user.name}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
