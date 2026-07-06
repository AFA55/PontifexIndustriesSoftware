'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import DashboardSidebar from '@/components/DashboardSidebar';
import NotificationBell from '@/components/NotificationBell';
import { DarkModeIconToggle } from '@/components/ui/DarkModeToggle';
import UserAvatar from '@/components/UserAvatar';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/**
 * Hiring (Opifex Job Board) layout.
 *
 * Fix for the "Opifex tenant is a navigation trap" defect (QA loop, Jul 6):
 * /dashboard/hiring previously had NO layout, so hiring-only tenants got a bare
 * page with no sidebar — no Sign out, no My Profile, no way to reach Billing.
 * This wraps the hiring pages in the SAME shell as the admin dashboard
 * (DashboardSidebar gates its own items by role + features.hiring, so a
 * hiring-only tenant sees Dashboard, Job Board, Team, Settings, My Profile,
 * Sign out — and NOT the ops modules). The header omits the ops "New Job"
 * (schedule-form) button — the Job Board pages carry their own New Job CTA.
 */
function HeaderAvatar({ user }: { user: User | null }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      fetch('/api/my-profile', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.data?.profile_picture_url) setAvatarUrl(json.data.profile_picture_url);
        })
        .catch(() => {});
    });
  }, [user?.id]);

  if (!user) {
    return <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />;
  }
  return (
    <Link
      href="/dashboard/my-profile"
      title="My Profile"
      aria-label="My Profile"
      className="flex items-center gap-2.5 min-h-[44px] px-1.5 -mx-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors select-none"
    >
      <UserAvatar src={avatarUrl} name={user.name} size="sm" className="ring-2 ring-brand/30" />
      <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-white/80 truncate max-w-[120px]">
        {user.name}
      </span>
    </Link>
  );
}

export default function HiringLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#0b0618]">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="sticky top-0 z-30 flex-shrink-0 flex items-center justify-between px-4 sm:px-6 pb-3 pt-safe-3 shadow-sm border-b bg-white border-gray-200 dark:bg-[#0e0720]/90 dark:border-white/10 dark:backdrop-blur">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Mobile: sidebar renders its own hamburger at top-3 left-3 — reserve space. */}
            <div className="w-8 lg:hidden flex-shrink-0" aria-hidden="true" />
            <span className="hidden sm:flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-white/50">
              <Megaphone className="w-4 h-4" /> Job Board
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <Link
              href="/dashboard/hiring/new"
              className="flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-3 sm:px-3.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-brand to-brand-accent hover:from-brand-dark hover:to-brand-accent transition-all shadow-sm shadow-brand/30"
              aria-label="New Job"
            >
              <Megaphone className="w-5 h-5" />
              <span className="hidden sm:inline">New Job</span>
            </Link>
            <NotificationBell variant="light" />
            <DarkModeIconToggle />
            <HeaderAvatar user={user} />
          </div>
        </header>
        <main className="flex-1 overflow-y-scroll overflow-x-hidden bg-gray-50 dark:bg-[#0b0618]">
          {children}
        </main>
      </div>
    </div>
  );
}
