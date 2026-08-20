'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, ClipboardCheck } from 'lucide-react';
import DashboardSidebar from '@/components/DashboardSidebar';
import GlobalJobSearch from '@/components/admin/GlobalJobSearch';
import NotificationBell from '@/components/NotificationBell';
import { DarkModeIconToggle } from '@/components/ui/DarkModeToggle';
import UserAvatar from '@/components/UserAvatar';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// User avatar — shown in header right side
// ---------------------------------------------------------------------------

function HeaderAvatar({ user }: { user: User | null }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    // Fetch the profile picture URL from the API (non-blocking)
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      fetch('/api/my-profile', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (json?.data?.profile_picture_url) setAvatarUrl(json.data.profile_picture_url);
        })
        .catch(() => {});
    });
  }, [user?.id]);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
      </div>
    );
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

// ---------------------------------------------------------------------------
// Admin Layout
// ---------------------------------------------------------------------------

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  // WHICH ACTION BUTTONS THE HEADER CARRIES — derived once, so the mobile
  // layout decision below cannot drift from what actually renders.
  const showNewVisit = user?.role === 'supervisor';
  const showNewJob = !['shop_manager', 'shop_help', 'admin'].includes(user?.role ?? '');
  const headerActionCount = (showNewVisit ? 1 : 0) + (showNewJob ? 1 : 0);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#0b0618]">
      {/*
        DashboardSidebar handles its own desktop/mobile rendering:
        - Desktop: fixed-width aside (240px expanded / 64px collapsed), hidden below lg
        - Mobile: self-contained hamburger button + drawer overlay (fixed top-3 left-3)
        No external state wiring needed.
      */}
      <DashboardSidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ---------------------------------------------------------------- */}
        {/* Sticky top header                                                */}
        {/* pt-safe pushes the header content below the iOS status bar /    */}
        {/* Dynamic Island so buttons are tappable. On non-iOS devices       */}
        {/* env() returns 0px — no visual change.                           */}
        {/* ---------------------------------------------------------------- */}
        {/* pt-safe-3 = safe-area-inset-top + 12px. On desktop env() returns 0  */}
        {/* so padding-top stays 12px. On iOS it clears the Dynamic Island.  */}
        <header className="
          sticky top-0 z-30 flex-shrink-0 flex items-center justify-between
          px-4 sm:px-6 pb-3 pt-safe-3 shadow-sm border-b
          bg-white border-gray-200
          dark:bg-[#0e0720]/90 dark:border-white/10 dark:backdrop-blur
        ">

          {/* Left: spacer on mobile (sidebar has its own hamburger), Search on sm+ */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/*
              On mobile (< lg) the sidebar renders its own fixed hamburger at top-3 left-3.
              We add left padding on mobile so the search doesn't overlap it.
            */}
            <div className="w-8 lg:hidden flex-shrink-0" aria-hidden="true" />

            {/*
              Global job search. This used to be an <input> with a placeholder
              and no onChange — it looked like a search bar and did nothing,
              while the founder read job numbers out of chat messages with no
              way to look them up. GlobalJobSearch renders an inline field from
              sm: up and a 44px icon button + sheet below that, and renders
              NOTHING for roles the search API refuses.

              showMobileTrigger: below sm: the header is a fixed budget — a 32px
              spacer clearing the sidebar's fixed hamburger, then the search
              trigger, then every action button. A role with ONE action button
              fits. `supervisor` has TWO (New Visit and New Job) and at 360px
              (Galaxy S-class) the row overflows, which the ancestor's
              overflow-hidden CLIPS the avatar rather than scrolling. So that one
              role keeps the inline field from sm: up and skips the phone
              trigger — which is exactly where the old dead input stood anyway.
            */}
            <GlobalJobSearch role={user?.role} showMobileTrigger={headerActionCount < 2} />
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Supervisor-only: New Visit Report. Sits next to + New Job.
                min-h-[44px] for tap-target compliance on mobile. */}
            {showNewVisit && (
              <Link
                href="/dashboard/admin/site-visits/new"
                prefetch
                className="flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-3 sm:px-3.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-brand to-brand-accent hover:from-brand-dark hover:to-brand-accent transition-all shadow-sm shadow-brand/30"
                aria-label="New Visit Report"
              >
                <ClipboardCheck className="w-5 h-5" />
                <span className="hidden sm:inline">New Visit</span>
              </Link>
            )}

            {/* + New Job — Link prefetches the schedule-form chunk on hover/viewport
                so the click feels instant instead of waiting for the JS to load.
                Hidden for shop_manager + shop_help (read-only schedule access) and
                for admin (back-office role — not a salesperson, doesn't create jobs). */}
            {showNewJob && (
              <Link
                href="/dashboard/admin/schedule-form"
                prefetch
                className="flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-3 sm:px-3.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 transition-all shadow-sm"
                aria-label="New Job"
              >
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline">New Job</span>
              </Link>
            )}

            {/* Notification bell — light variant for white header */}
            <NotificationBell variant="light" />

            {/* Dark mode toggle — primary surface for switching themes */}
            <DarkModeIconToggle />

            {/* User avatar */}
            <HeaderAvatar user={user} />
          </div>
        </header>

        {/* ---------------------------------------------------------------- */}
        {/* Scrollable page content                                          */}
        {/* ---------------------------------------------------------------- */}
        {/* overflow-y-scroll (not auto) keeps the scrollbar track always present so
            the content area never shifts horizontally when navigating between a
            long page (scrollbar visible) and a short page (no scrollbar).       */}
        <main className="flex-1 overflow-y-scroll overflow-x-hidden bg-gray-50 dark:bg-[#0b0618]">
          {children}
        </main>

      </div>
    </div>
  );
}
