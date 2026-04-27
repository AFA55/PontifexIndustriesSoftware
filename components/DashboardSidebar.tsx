'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  FileEdit,
  Clock,
  Users,
  UserCircle2,
  CreditCard,
  CheckCircle2,
  Building2,
  Wifi,
  Layout,
  Settings,
  Bell,
  BarChart3,
  Briefcase,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ArrowLeft,
  Menu,
  X,
} from 'lucide-react';
import { getCurrentUser, logout, type User } from '@/lib/auth';
import { useBranding } from '@/lib/branding-context';
import { supabase } from '@/lib/supabase';
import { useFeatureFlags, type UserFeatureFlags } from '@/lib/feature-flags';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badgeKey?: 'timecards' | 'notifications';
  title?: string;
  /** If set, this nav item is hidden when the flag is false (bypassed for super_admin/ops_manager) */
  flagKey?: keyof UserFeatureFlags;
  /** If true, only super_admin can see this item */
  superAdminOnly?: boolean;
}

interface NavSection {
  label: string;
  accent: string;
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Static nav structure
// ---------------------------------------------------------------------------

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'OPERATIONS',
    accent: 'text-blue-400',
    items: [
      { label: 'Dashboard', href: '/dashboard/admin', icon: LayoutDashboard },
      { label: 'Schedule Board', href: '/dashboard/admin/schedule-board', icon: Calendar, flagKey: 'can_view_schedule_board' },
      { label: 'Active Jobs', href: '/dashboard/admin/active-jobs', icon: Briefcase, flagKey: 'can_view_active_jobs' },
      { label: 'Schedule Form', href: '/dashboard/admin/schedule-form', icon: FileEdit, flagKey: 'can_create_schedule_forms' },
    ],
  },
  {
    label: 'MANAGEMENT',
    accent: 'text-purple-400',
    items: [
      { label: 'Timecards', href: '/dashboard/admin/timecards', icon: Clock, badgeKey: 'timecards', flagKey: 'can_view_timecards' },
      { label: 'Time Off', href: '/dashboard/admin/time-off', icon: CalendarOff, flagKey: 'can_view_timecards' },
      { label: 'Team Profiles', href: '/dashboard/admin/team-profiles', icon: Users, flagKey: 'can_manage_team' },
      { label: 'Customers', href: '/dashboard/admin/customers', icon: UserCircle2, flagKey: 'can_view_customers' },
      { label: 'Invoicing', href: '/dashboard/admin/billing', icon: CreditCard, flagKey: 'can_view_invoicing' },
      { label: 'Completed Jobs', href: '/dashboard/admin/completed-jobs', icon: CheckCircle2, flagKey: 'can_view_completed_jobs' },
    ],
  },
  {
    label: 'TOOLS',
    accent: 'text-emerald-400',
    items: [
      { label: 'Facilities', href: '/dashboard/admin/facilities', icon: Building2, flagKey: 'can_view_facilities' },
      { label: 'NFC Tags', href: '/dashboard/admin/settings/nfc-tags', icon: Wifi, flagKey: 'can_view_nfc_tags' },
      { label: 'Form Builder', href: '/dashboard/admin/form-builder', icon: Layout, flagKey: 'can_view_form_builder' },
    ],
  },
  {
    label: 'ADMIN',
    accent: 'text-red-400',
    items: [
      { label: 'Settings', href: '/dashboard/admin/settings', icon: Settings, flagKey: 'can_manage_settings' },
      { label: 'Notifications', href: '/dashboard/admin/notifications', icon: Bell, badgeKey: 'notifications' },
      { label: 'Analytics', href: '/dashboard/admin/analytics', icon: BarChart3, flagKey: 'can_view_analytics' },
      { label: 'Billing', href: '/dashboard/admin/subscription', icon: CreditCard, superAdminOnly: true },
    ],
  },
];

const SIDEBAR_STORAGE_KEY = 'admin-sidebar-collapsed';

// ---------------------------------------------------------------------------
// Badge counts hook
// ---------------------------------------------------------------------------

interface BadgeCounts {
  timecards: number;
  notifications: number;
}

function useBadgeCounts(): BadgeCounts {
  const [counts, setCounts] = useState<BadgeCounts>({ timecards: 0, notifications: 0 });

  const fetchCounts = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      };

      const [tcRes, notifRes] = await Promise.allSettled([
        fetch('/api/admin/timecards?pending=true', { headers }),
        fetch('/api/notifications?unread=true', { headers }),
      ]);

      let timecards = 0;
      let notifications = 0;

      if (tcRes.status === 'fulfilled' && tcRes.value.ok) {
        const json = await tcRes.value.json();
        timecards = json.total ?? json.count ?? (Array.isArray(json.data) ? json.data.length : 0);
      }

      if (notifRes.status === 'fulfilled' && notifRes.value.ok) {
        const json = await notifRes.value.json();
        notifications = json.unread_count ?? json.total ?? (Array.isArray(json.data) ? json.data.length : 0);
      }

      setCounts({ timecards, notifications });
    } catch {
      // silently fail — badges are non-critical
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 60_000);
    return () => clearInterval(interval);
  }, [fetchCounts]);

  return counts;
}

// ---------------------------------------------------------------------------
// Badge component
// ---------------------------------------------------------------------------

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
      {count > 99 ? '99+' : count}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Avatar helper
// ---------------------------------------------------------------------------

function UserAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="flex-shrink-0 w-8 h-8 rounded-lg object-cover ring-1 ring-purple-500/40 select-none"
      />
    );
  }
  return (
    <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold select-none">
      {initial}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Role display helper
// ---------------------------------------------------------------------------

function formatRole(role: string): string {
  return role
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Single nav item
// ---------------------------------------------------------------------------

interface NavItemRowProps {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  badge: number;
  onClick?: () => void;
}

function NavItemRow({ item, isActive, collapsed, badge, onClick }: NavItemRowProps) {
  const Icon = item.icon;

  const baseClasses =
    'relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 group cursor-pointer select-none';
  const activeClasses =
    'bg-slate-100 border-l-2 border-blue-500 text-slate-900 pl-[10px] dark:bg-slate-800 dark:text-white dark:border-blue-500';
  const inactiveClasses =
    'text-slate-500 hover:text-slate-900 hover:bg-slate-100 border-l-2 border-transparent dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800';

  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          <Badge count={badge} />
        </>
      )}
      {/* Badge dot when collapsed */}
      {collapsed && badge > 0 && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Sidebar inner content (shared between desktop and mobile drawer)
// ---------------------------------------------------------------------------

interface SidebarContentProps {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  user: User | null;
  branding: { company_name: string; company_short_name: string };
  badgeCounts: BadgeCounts;
  pathname: string;
  onNavClick?: () => void;
  onSignOut: () => void;
  flags: UserFeatureFlags;
  flagsLoading: boolean;
  userRole: string | null;
}

function SidebarContent({
  collapsed,
  onToggleCollapse,
  user,
  branding,
  badgeCounts,
  pathname,
  onNavClick,
  onSignOut,
  flags,
  flagsLoading,
  userRole,
}: SidebarContentProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    // Fetch avatar non-blocking
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data }) => {
        const token = data.session?.access_token;
        if (!token) return;
        fetch('/api/my-profile', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : null)
          .then(json => { if (json?.data?.profile_picture_url) setAvatarUrl(json.data.profile_picture_url); })
          .catch(() => {});
      });
    });
  }, [user?.id]);

  return (
    <div className="flex flex-col h-full">
      {/* ------------------------------------------------------------------ */}
      {/* Logo / brand header */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`flex items-center gap-3 px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-black">P</span>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-slate-900 dark:text-white text-sm font-bold truncate leading-tight">
              {branding.company_short_name || branding.company_name}
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-[10px] leading-tight">Admin Portal</p>
          </div>
        )}
        {/* Collapse toggle — only shown on desktop sidebar */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex-shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-white dark:hover:bg-slate-700 transition-colors ${
              collapsed ? 'mt-0' : 'ml-auto'
            }`}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Nav sections — scrollable */}
      {/* ------------------------------------------------------------------ */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
        {NAV_SECTIONS.map(section => {
          // While flags are loading, show all items so there's no flash-hide.
          // Once loaded, filter items whose flagKey is false.
          const visibleItems = flagsLoading
            ? section.items.filter(item => !item.superAdminOnly || userRole === 'super_admin')
            : section.items.filter(item => {
                if (item.superAdminOnly && userRole !== 'super_admin') return false;
                if (!item.flagKey) return true; // no flag = always visible
                return flags[item.flagKey] !== false;
              });

          // If every flagged item in this section is hidden, hide the section header too
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.label}>
              {/* Section header */}
              {!collapsed && (
                <p
                  className={`px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest ${section.accent}`}
                >
                  {section.label}
                </p>
              )}
              {collapsed && (
                <div className="flex justify-center mb-1">
                  <div className={`w-5 h-[1px] bg-current opacity-30 ${section.accent}`} />
                </div>
              )}

              <div className="space-y-0.5">
                {visibleItems.map(item => {
                  const badge =
                    item.badgeKey === 'timecards'
                      ? badgeCounts.timecards
                      : item.badgeKey === 'notifications'
                      ? badgeCounts.notifications
                      : 0;

                  // Exact match for dashboard root, prefix match for sub-pages
                  const isActive =
                    item.href === '/dashboard/admin'
                      ? pathname === '/dashboard/admin'
                      : pathname.startsWith(item.href);

                  return (
                    <NavItemRow
                      key={item.href}
                      item={item}
                      isActive={isActive}
                      collapsed={collapsed}
                      badge={badge}
                      onClick={onNavClick}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom: Operator View link */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-2 pb-1 flex-shrink-0">
        <Link
          href="/dashboard"
          onClick={onNavClick}
          title={collapsed ? 'Operator View' : undefined}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800 text-xs font-medium transition-colors border-l-2 border-transparent"
        >
          <ArrowLeft className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Operator View</span>}
        </Link>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom: User profile + sign out */}
      {/* ------------------------------------------------------------------ */}
      <div className="border-t border-slate-200 dark:border-slate-800 px-2 py-3 flex-shrink-0">
        {user ? (
          <div
            className={`flex items-center gap-3 px-2 py-1.5 ${
              collapsed ? 'justify-center flex-col' : ''
            }`}
          >
            <UserAvatar name={user.name} avatarUrl={avatarUrl} />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 dark:text-white text-xs font-semibold truncate leading-tight">
                  {user.name}
                </p>
                <p className="text-purple-600 dark:text-purple-400 text-[10px] leading-tight truncate">
                  {formatRole(user.role)}
                </p>
              </div>
            )}
            <button
              onClick={onSignOut}
              title="Sign out"
              className="flex-shrink-0 p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className={`flex items-center gap-2 px-2 py-1.5 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
            {!collapsed && <div className="flex-1 h-4 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile Menu Button (exported for use in headers)
// ---------------------------------------------------------------------------

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open navigation menu"
      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors lg:hidden"
    >
      <Menu className="w-5 h-5" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main DashboardSidebar component
// ---------------------------------------------------------------------------

export default function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { branding } = useBranding();
  const badgeCounts = useBadgeCounts();

  const [user, setUser] = useState<User | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Hydrate collapsed state from localStorage after mount
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === 'true') setCollapsed(true);
  }, []);

  // Load user
  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  // Feature flags — gated nav items hide/show per user permissions.
  // Super admins and ops_managers bypass all flags (handled inside the hook).
  const { flags, loading: flagsLoading } = useFeatureFlags(
    user?.id ?? null,
    user?.role ?? null
  );

  // Close mobile drawer on route change
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      setMobileOpen(false);
      prevPathRef.current = pathname;
    }
  }, [pathname]);

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const handleSignOut = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [router]);

  const sharedProps: Omit<SidebarContentProps, 'collapsed' | 'onToggleCollapse' | 'onNavClick'> = {
    user,
    branding: {
      company_name: branding.company_name,
      company_short_name: branding.company_short_name,
    },
    badgeCounts,
    pathname,
    onSignOut: handleSignOut,
    flags,
    flagsLoading,
    userRole: user?.role ?? null,
  };

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Desktop sidebar */}
      {/* ------------------------------------------------------------------ */}
      <aside
        className={`hidden lg:flex flex-col h-screen bg-white border-r border-slate-200 dark:bg-slate-900 dark:border-slate-800 transition-all duration-300 flex-shrink-0 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <SidebarContent
          {...sharedProps}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile: hamburger trigger (rendered inline — callers can use       */}
      {/* MobileMenuButton instead if they prefer it in the header)          */}
      {/* ------------------------------------------------------------------ */}
      <div className="lg:hidden fixed top-3 left-3 z-50">
        {!mobileOpen && (
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="p-2 rounded-lg bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-100 shadow-lg transition-colors border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700 dark:border-slate-700"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile drawer overlay */}
      {/* ------------------------------------------------------------------ */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 dark:bg-slate-900 dark:border-slate-800 flex flex-col shadow-2xl">
            {/* Close button */}
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              className="absolute top-3 right-3 p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-white dark:hover:bg-slate-700 transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <SidebarContent
              {...sharedProps}
              collapsed={false}
              onNavClick={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}
    </>
  );
}
