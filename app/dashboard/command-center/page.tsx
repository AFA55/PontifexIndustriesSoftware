'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  Clock,
  Users,
  Receipt,
  Wrench,
  Bell,
  Briefcase,
  ClipboardCheck,
  ChevronLeft,
  Mic,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import { formatTime } from '@/lib/dates';
import ArcReactor from '@/components/command-center/ArcReactor';

// Roles allowed into the command center.
const COMMAND_CENTER_ROLES = ['admin', 'super_admin', 'operations_manager'];

interface OverviewData {
  clockedIn: number;
  rosterCount: number;
  todaysJobs: number;
  pendingApprovals: number;
  unreadAlerts: number;
  asOf: string | null;
}

interface ManagementTab {
  label: string;
  href: string;
  icon: LucideIcon;
}

const TABS: ManagementTab[] = [
  { label: 'Schedule Board', href: '/dashboard/admin/schedule-board', icon: CalendarDays },
  { label: 'Timecards', href: '/dashboard/admin/timecards', icon: Clock },
  { label: 'Team Profiles', href: '/dashboard/admin/team-profiles', icon: Users },
  { label: 'Invoicing', href: '/dashboard/admin/billing', icon: Receipt },
  { label: 'Equipment', href: '/dashboard/admin/equipment', icon: Wrench },
];

export default function CommandCenterPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Live clock — updates every second.
  const [now, setNow] = useState<Date | null>(null);

  // Reactor size, responsive (SSR-safe: starts at a sane default, set on mount).
  const [reactorSize, setReactorSize] = useState(360);

  // ── auth guard (client-side, same pattern as other dashboard pages) ────────
  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.push('/login');
      return;
    }
    if (!COMMAND_CENTER_ROLES.includes(current.role)) {
      router.push('/dashboard');
      return;
    }
    setUser(current);
    setAuthChecked(true);
  }, [router]);

  // ── live clock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── responsive reactor size ─────────────────────────────────────────────────
  // Cap to the viewport so the canvas never crowds the edges on narrow phones,
  // and stay generous on larger screens.
  useEffect(() => {
    const apply = () => {
      const target = window.innerWidth < 480 ? 260 : 360;
      const fits = Math.max(180, window.innerWidth - 48); // 24px gutter each side
      setReactorSize(Math.min(target, fits));
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  // ── overview data: fetch + poll every 30s, fail-soft ───────────────────────
  const overviewRef = useRef<OverviewData | null>(null);
  overviewRef.current = overview;

  useEffect(() => {
    if (!authChecked || !user) return;

    let cancelled = false;

    const fetchOverview = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/command-center/overview', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return; // fail-soft: keep last value / show "—"
        const json = await res.json();
        if (!cancelled && json?.success && json.data) {
          setOverview(json.data as OverviewData);
        }
      } catch {
        // fail-soft: never crash the panel
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    };

    fetchOverview();
    const id = setInterval(fetchOverview, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [authChecked, user]);

  if (!authChecked || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0d0820]">
        <ArcReactor state="thinking" size={120} />
      </div>
    );
  }

  // Clock pieces (avoid SSR mismatch: now is null until mounted).
  const clockTime = now
    ? now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : '—';
  const clockDate = now
    ? now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '';

  const asOfLabel = overview?.asOf ? `as of ${formatTime(overview.asOf)}` : 'live';

  return (
    <div className="flex h-full w-full flex-col">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin"
            aria-label="Back to dashboard"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2.5">
            <ArcReactor state="idle" size={28} />
            <h1 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/90 sm:text-base">
              Pontifex <span className="text-white/50">Command Center</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 text-right">
          <Clock className="hidden h-4 w-4 text-violet-300/70 sm:block" />
          <div className="leading-tight">
            <div className="font-mono text-sm font-semibold tabular-nums text-white sm:text-base">
              {clockTime}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-white/40">{clockDate}</div>
          </div>
        </div>
      </header>

      {/* ── Body: tabs · reactor · rail ───────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* CENTER — reactor first in DOM so it stacks on TOP on mobile */}
        <main className="order-1 flex flex-1 flex-col items-center justify-center px-4 py-8 lg:order-2 lg:py-0">
          <div className="relative flex items-center justify-center">
            <ArcReactor
              state="idle"
              size={reactorSize}
              className="drop-shadow-[0_0_40px_rgba(124,58,237,0.35)]"
            />
          </div>
          <p className="mt-6 max-w-sm text-center text-sm text-white/55">
            Systems nominal. Standing by.
          </p>
          <p className="mt-1 text-center text-xs uppercase tracking-[0.25em] text-white/30">
            {asOfLabel}
          </p>

          {/* Talk to Jarvis — Phase 3 placeholder */}
          <div className="group relative mt-8">
            <button
              type="button"
              disabled
              className="flex h-12 min-w-[200px] cursor-not-allowed items-center justify-center gap-2 rounded-full border border-white/10 bg-gradient-to-r from-[#7C3AED]/30 via-[#DB2777]/30 to-[#EF4444]/30 px-6 text-sm font-medium text-white/60"
            >
              <Mic className="h-4 w-4" />
              Talk to Jarvis
            </button>
            <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#1e1b4b] px-2.5 py-1 text-[11px] text-white/70 opacity-0 transition-opacity group-hover:opacity-100">
              Voice arrives in a later phase
            </span>
          </div>
        </main>

        {/* LEFT — management tabs */}
        <nav
          aria-label="Management"
          className="order-2 shrink-0 border-t border-white/10 px-4 py-5 lg:order-1 lg:w-64 lg:border-r lg:border-t-0 lg:px-4 lg:py-6"
        >
          <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
            Management
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {TABS.map(({ label, href, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="group flex min-h-[44px] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm text-white/75 transition-all hover:border-violet-400/40 hover:bg-white/[0.07] hover:text-white"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#7C3AED]/25 to-[#EF4444]/25 text-violet-200 transition-colors group-hover:from-[#7C3AED]/45 group-hover:to-[#EF4444]/45">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="truncate font-medium">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* RIGHT — live metric rail */}
        <aside
          aria-label="Live metrics"
          className="order-3 shrink-0 border-t border-white/10 px-4 py-5 lg:w-72 lg:border-l lg:border-t-0 lg:px-4 lg:py-6"
        >
          <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
            Live
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <MetricCard
              icon={Users}
              label="Clocked in"
              accent="from-[#7C3AED] to-[#DB2777]"
              loading={overviewLoading}
              value={
                overview ? `${overview.clockedIn} / ${overview.rosterCount}` : null
              }
            />
            <MetricCard
              icon={Bell}
              label="Notifications"
              accent="from-[#DB2777] to-[#EF4444]"
              loading={overviewLoading}
              value={overview ? `${overview.unreadAlerts}` : null}
            />
            <MetricCard
              icon={Briefcase}
              label="Jobs today"
              accent="from-[#7C3AED] to-[#EF4444]"
              loading={overviewLoading}
              value={overview ? `${overview.todaysJobs}` : null}
            />
            <MetricCard
              icon={ClipboardCheck}
              label="Pending approvals"
              accent="from-[#DB2777] to-[#7C3AED]"
              loading={overviewLoading}
              value={overview ? `${overview.pendingApprovals}` : null}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Metric card ───────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  accent: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${accent} text-white/90`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-white/45">
          {label}
        </span>
      </div>
      <div className="mt-2.5">
        {loading && value === null ? (
          <div className="h-7 w-16 animate-pulse rounded bg-white/10" />
        ) : (
          <span className="font-mono text-2xl font-semibold tabular-nums text-white">
            {value ?? '—'}
          </span>
        )}
      </div>
    </div>
  );
}
