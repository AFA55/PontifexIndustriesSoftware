'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, LogOut, RefreshCw } from 'lucide-react';
import { getCurrentUser, logout, type User } from '@/lib/auth';

/**
 * Platform Console layout — super_admin ONLY.
 *
 * Single guard surface for the whole /dashboard/platform/* area (per
 * PLATFORM_CONSOLE_PLAN.md §1.2). Wraps every platform page in a deep-indigo
 * shell carrying the real Pontifex mark + journey gradient (public/icon-512.png,
 * #7C3AED -> #DB2777 -> #EF4444) — brand-correct per the pontifex-brand skill
 * (the Platform Hub is a Pontifex-owned surface, unlike tenant-facing screens
 * which stay white-label). The deep-indigo background — not the client admin's
 * white/slate — is still what signals "you're in the platform console."
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
      <div className="min-h-screen bg-[#120A24] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="bg-[#120A24] border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard/admin"
              title="Back to admin"
              className="p-2 -ml-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-9 h-9 rounded-xl bg-white p-1.5 shadow-lg shadow-violet-500/20 flex-shrink-0">
              <Image src="/icon-512.png" alt="Pontifex Industries" width={36} height={36} className="w-full h-full object-contain" priority />
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-black tracking-wide leading-tight truncate">
                PONTIFEX{' '}
                <span className="bg-gradient-to-r from-[#7C3AED] via-[#DB2777] to-[#EF4444] bg-clip-text text-transparent">
                  PLATFORM
                </span>
              </p>
              <p className="text-white/40 text-[10px] leading-tight truncate">
                Platform owner console &middot; super admin
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <span className="w-2 h-2 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#EF4444]" />
                <span className="text-white/70 text-xs font-medium truncate max-w-[160px]">{user.name}</span>
              </div>
            )}
            <button
              type="button"
              onClick={async () => { await logout(); router.push('/company-login'); }}
              title="Sign out"
              aria-label="Sign out"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-semibold">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
