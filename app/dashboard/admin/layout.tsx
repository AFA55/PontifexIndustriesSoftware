'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus } from 'lucide-react';
import DashboardSidebar from '@/components/DashboardSidebar';
import NotificationBell from '@/components/NotificationBell';
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

  const initial = user.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="flex items-center gap-2.5 cursor-default select-none">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={user.name}
          className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-2 ring-purple-500/30"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          {initial}
        </div>
      )}
      <span className="hidden sm:block text-sm font-medium text-gray-700 truncate max-w-[120px]">
        {user.name}
      </span>
    </div>
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

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
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
        {/* ---------------------------------------------------------------- */}
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm flex-shrink-0">

          {/* Left: spacer on mobile (sidebar has its own hamburger), Search on sm+ */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/*
              On mobile (< lg) the sidebar renders its own fixed hamburger at top-3 left-3.
              We add left padding on mobile so the search doesn't overlap it.
            */}
            <div className="w-8 lg:hidden flex-shrink-0" aria-hidden="true" />

            {/* Search input — hidden on mobile to keep header clean */}
            <div className="hidden sm:flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-64 xl:w-80">
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search jobs, customers..."
                className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none flex-1 min-w-0"
              />
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* + New Job */}
            <button
              onClick={() => router.push('/dashboard/admin/schedule-form')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Job</span>
            </button>

            {/* Notification bell — light variant for white header */}
            <NotificationBell variant="light" />

            {/* User avatar */}
            <HeaderAvatar user={user} />
          </div>
        </header>

        {/* ---------------------------------------------------------------- */}
        {/* Scrollable page content                                          */}
        {/* ---------------------------------------------------------------- */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

      </div>
    </div>
  );
}
