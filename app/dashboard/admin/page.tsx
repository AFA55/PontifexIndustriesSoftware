'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  AlertCircle,
  ChevronRight,
  CheckCircle2,
  DollarSign,
  Clock,
  TrendingUp,
  TrendingDown,
  Users,
  Briefcase,
  Plus,
  FileText,
  CreditCard,
  UserCircle2,
  Activity,
  Wrench,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import AdminOnboardingTour from '@/components/AdminOnboardingTour';
import { ADMIN_DASHBOARD_ROLES } from '@/lib/rbac';
import { useBranding } from '@/lib/branding-context';

// ─── API response types ───────────────────────────────────────────────────────

interface JobToday {
  id: string;
  job_number: string;
  scheduled_time: string | null;
  customer_name: string;
  operator_name: string | null;
  status: string;
}

interface RevenueMtd {
  total: number;
  last_month: number;
  trend_pct: number;
}

interface OpenItems {
  pending_timecards: number;
  unassigned_jobs: number;
  overdue_invoices: number;
}

interface CrewUtilization {
  active: number;
  total: number;
  pct: number;
}

interface TeamMember {
  id: string;
  name: string;
  status: 'active' | 'off' | 'idle';
  current_job: string | null;
  current_job_id: string | null;
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  created_at: string;
  link: string | null;
}

interface DashboardData {
  jobs_today: { count: number; jobs: JobToday[] };
  revenue_mtd: RevenueMtd;
  open_items: OpenItems;
  crew_utilization: CrewUtilization;
  team_status: TeamMember[];
  recent_activity: ActivityItem[];
}

interface ActiveJob {
  id: string;
  job_number: string;
  customer_name: string;
  operator_name: string | null;
  status: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  work_items_count: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '--:--';
  // Handle HH:MM:SS or HH:MM
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

const STATUS_STYLES: Record<string, { pill: string; label: string }> = {
  scheduled:  { pill: 'bg-blue-100 text-blue-700',   label: 'Scheduled'  },
  in_route:   { pill: 'bg-amber-100 text-amber-700',  label: 'En Route'   },
  on_site:    { pill: 'bg-green-100 text-green-700',  label: 'On Site'    },
  in_progress:{ pill: 'bg-green-100 text-green-700',  label: 'In Progress'},
  completed:  { pill: 'bg-emerald-100 text-emerald-700', label: 'Completed'},
  cancelled:  { pill: 'bg-red-100 text-red-700',      label: 'Cancelled'  },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { pill: 'bg-gray-100 text-gray-600', label: status };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.pill}`}>
      {s.label}
    </span>
  );
}

function ActivityIcon({ type }: { type: string }) {
  const base = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0';
  switch (type) {
    case 'job_completed':
      return <div className={`${base} bg-emerald-100`}><CheckCircle2 className="w-4 h-4 text-emerald-600" /></div>;
    case 'invoice_paid':
      return <div className={`${base} bg-green-100`}><DollarSign className="w-4 h-4 text-green-600" /></div>;
    case 'invoice_created':
      return <div className={`${base} bg-blue-100`}><FileText className="w-4 h-4 text-blue-600" /></div>;
    case 'job_created':
      return <div className={`${base} bg-purple-100`}><Calendar className="w-4 h-4 text-purple-600" /></div>;
    case 'timecard_approved':
    case 'timecard_submitted':
      return <div className={`${base} bg-amber-100`}><Clock className="w-4 h-4 text-amber-600" /></div>;
    default:
      return <div className={`${base} bg-gray-100`}><Briefcase className="w-4 h-4 text-gray-500" /></div>;
  }
}

// ─── skeleton helpers ──────────────────────────────────────────────────────────

function SkeletonRow({ cols = 3 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="animate-pulse bg-gray-200 rounded h-4" style={{ flex: 1 }} />
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();
  const { branding } = useBranding();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [isDemoAdmin, setIsDemoAdmin] = useState(false);

  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(true);

  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [activeJobsLoading, setActiveJobsLoading] = useState(true);

  // ── scope toggle (personal / team) ────────────────────────────────────────
  const [scope, setScope] = useState<'personal' | 'team'>('personal');

  // Initialise scope from localStorage once user is known
  useEffect(() => {
    if (!user) return;
    const isSenior = user.role === 'super_admin' || user.role === 'operations_manager';
    const saved = localStorage.getItem('admin-dashboard-scope') as 'personal' | 'team' | null;
    if (saved === 'personal' || saved === 'team') {
      setScope(saved);
    } else {
      // super_admin / ops_manager default to team; everyone else personal
      setScope(isSenior ? 'team' : 'personal');
    }
  }, [user]);

  const handleScopeChange = (s: 'personal' | 'team') => {
    setScope(s);
    localStorage.setItem('admin-dashboard-scope', s);
    // Trigger a fresh fetch with the new scope
    setDashLoading(true);
    setDashData(null);
  };

  // ── auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const currentUser = getCurrentUser();

    if (!currentUser) {
      router.push('/login');
      return;
    }

    if (!ADMIN_DASHBOARD_ROLES.includes(currentUser.role)) {
      router.push('/dashboard');
      return;
    }

    setUser(currentUser);

    const isDemo =
      currentUser.email?.toLowerCase().includes('demo') ||
      currentUser.email === 'admin@demo.com' ||
      currentUser.email === 'admin@patriotcc.com';
    setIsDemoAdmin(isDemo);

    if (isDemo) {
      checkOnboardingStatus(currentUser.id);
    }

    setLoading(false);
  }, [router]);

  // ── dashboard data ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const fetchDash = async () => {
      setDashLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const params = new URLSearchParams({ scope });
        const res = await fetch(`/api/admin/dashboard-summary?${params}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
          const json = await res.json();
          setDashData(json.data);
        }
      } catch {
        // silently fail — UI handles null dashData gracefully
      } finally {
        setDashLoading(false);
      }
    };

    fetchDash();
  }, [user, scope]);

  // ── active jobs fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const fetchActiveJobs = async () => {
      setActiveJobsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch('/api/admin/active-jobs-summary', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
          const json = await res.json();
          setActiveJobs(json.data ?? []);
        }
      } catch {
        // silently fail
      } finally {
        setActiveJobsLoading(false);
      }
    };

    fetchActiveJobs();
  }, [user]);

  // ── onboarding ────────────────────────────────────────────────────────────
  const checkOnboardingStatus = async (userId: string) => {
    try {
      const shownThisSession = sessionStorage.getItem('admin-walkthrough-shown-this-session');
      if (shownThisSession === 'true') return;

      const response = await fetch(`/api/onboarding?userId=${userId}&type=admin`);
      const data = await response.json();

      if (!data.hasCompleted && !data.hasSkipped) {
        setShowWalkthrough(true);
        sessionStorage.setItem('admin-walkthrough-shown-this-session', 'true');
      }
    } catch {
      const hasSeenWalkthrough = localStorage.getItem('demo-admin-walkthrough-seen');
      const shownThisSession = sessionStorage.getItem('admin-walkthrough-shown-this-session');
      if (!hasSeenWalkthrough && shownThisSession !== 'true') {
        setShowWalkthrough(true);
        sessionStorage.setItem('admin-walkthrough-shown-this-session', 'true');
      }
    }
  };

  const markWalkthroughComplete = () => {
    localStorage.setItem('demo-admin-walkthrough-seen', 'true');
    setShowWalkthrough(false);
  };

  // ── loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // ── derived values ────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // In personal scope, exclude unassigned_jobs from the open-items total
  const openItemsTotal = dashData
    ? scope === 'personal'
      ? dashData.open_items.pending_timecards +
        dashData.open_items.overdue_invoices
      : dashData.open_items.pending_timecards +
        dashData.open_items.unassigned_jobs +
        dashData.open_items.overdue_invoices
    : 0;

  const isSeniorRole = user?.role === 'super_admin' || user?.role === 'operations_manager';

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-full">

      {/* ── Scope toggle header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {scope === 'personal' ? 'Your Dashboard' : 'Team Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {scope === 'personal'
              ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
              : `All operators · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
            }
          </p>
        </div>

        {/* Toggle — senior roles only */}
        {isSeniorRole && (
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => handleScopeChange('personal')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                scope === 'personal'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <UserCircle2 className="w-4 h-4" />
              My View
            </button>
            <button
              onClick={() => handleScopeChange('team')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                scope === 'team'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users className="w-4 h-4" />
              Team View
            </button>
          </div>
        )}
      </div>

      {/* ── Personal identity banner (personal scope only) ────────────────── */}
      {scope === 'personal' && (
        <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {user?.name?.charAt(0) || '?'}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500 capitalize">
              {user?.role?.replace(/_/g, ' ')} · Viewing your personal metrics
            </p>
          </div>
          <div className="ml-auto">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
              Personal View
            </span>
          </div>
        </div>
      )}

      {/* ── KPI Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Jobs Today */}
        <Link
          href="/dashboard/admin/schedule-board"
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
          </div>
          {dashLoading ? (
            <div className="animate-pulse bg-gray-200 rounded h-8 w-16 mb-2" />
          ) : (
            <p className="text-4xl font-bold text-gray-900">{dashData?.jobs_today.count ?? 0}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {scope === 'personal' ? 'Your Jobs Today' : 'Jobs Today'}
          </p>
        </Link>

        {/* Revenue MTD */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            {!dashLoading && dashData && (
              <span
                className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  dashData.revenue_mtd.trend_pct >= 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {dashData.revenue_mtd.trend_pct >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {Math.abs(dashData.revenue_mtd.trend_pct)}%
              </span>
            )}
          </div>
          {dashLoading ? (
            <div className="animate-pulse bg-gray-200 rounded h-8 w-24 mb-2" />
          ) : (
            <p className="text-4xl font-bold text-gray-900">
              {formatCurrency(dashData?.revenue_mtd.total ?? 0)}
            </p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {scope === 'personal' ? 'Your Revenue MTD' : 'Revenue MTD'}
          </p>
        </div>

        {/* Open Items */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            {!dashLoading && openItemsTotal > 0 && (
              <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
            )}
          </div>
          {dashLoading ? (
            <div className="animate-pulse bg-gray-200 rounded h-8 w-12 mb-2" />
          ) : (
            <p className="text-4xl font-bold text-gray-900">{openItemsTotal}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {scope === 'personal' ? 'Your Open Items' : 'Open Items'}
          </p>
        </div>

        {/* Crew Utilization (team) / Your Active Jobs (personal) */}
        {scope === 'personal' ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            {dashLoading ? (
              <div className="animate-pulse bg-gray-200 rounded h-8 w-16 mb-2" />
            ) : (
              <p className="text-4xl font-bold text-gray-900">
                {dashData?.jobs_today.count ?? 0}
              </p>
            )}
            <p className="text-sm text-gray-500 mt-1">Your Active Jobs</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            {dashLoading ? (
              <div className="animate-pulse bg-gray-200 rounded h-8 w-16 mb-2" />
            ) : (
              <p className="text-4xl font-bold text-gray-900">
                {dashData?.crew_utilization.pct ?? 0}%
              </p>
            )}
            <p className="text-sm text-gray-500 mt-1">
              {dashLoading ? (
                <span className="inline-block animate-pulse bg-gray-200 rounded h-3 w-20" />
              ) : (
                `${dashData?.crew_utilization.active ?? 0} of ${dashData?.crew_utilization.total ?? 0} active`
              )}
            </p>
          </div>
        )}
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Left column — 3/5 */}
        <div className="xl:col-span-3 space-y-6">

          {/* Today's Schedule */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900">
                  {scope === 'personal' ? 'Your Schedule Today' : "Today's Schedule"}
                </h2>
                <span className="text-xs text-gray-400">{today}</span>
              </div>
              <Link
                href="/dashboard/admin/schedule-board"
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View Full Board
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div>
              {dashLoading ? (
                <>
                  <SkeletonRow cols={4} />
                  <SkeletonRow cols={4} />
                  <SkeletonRow cols={4} />
                </>
              ) : !dashData || dashData.jobs_today.jobs.length === 0 ? (
                <div className="py-12 text-center">
                  <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 mb-3">
                    {scope === 'personal'
                      ? 'You have no jobs scheduled today'
                      : 'No jobs scheduled today'}
                  </p>
                  <Link
                    href="/dashboard/admin/schedule-form"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Schedule a Job
                  </Link>
                </div>
              ) : (
                dashData.jobs_today.jobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/dashboard/admin/schedule-board`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors"
                  >
                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600 flex-shrink-0 w-20 text-center">
                      {formatTime(job.scheduled_time)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{job.job_number}</p>
                      <p className="text-xs text-gray-500 truncate">{job.customer_name}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {job.operator_name && (
                        <span className="text-xs text-gray-500 hidden sm:inline">{job.operator_name}</span>
                      )}
                      <StatusPill status={job.status} />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Recent Notifications placeholder — NotificationBell handles the popover */}
          {/* Removed: notifications are in layout header bell */}

        </div>

        {/* Right column — 2/5 */}
        <div className="xl:col-span-2 space-y-6">

          {/* Action Required */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
              <AlertCircle className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Action Required</h2>
            </div>

            <div>
              {dashLoading ? (
                <>
                  <SkeletonRow cols={3} />
                  <SkeletonRow cols={3} />
                  <SkeletonRow cols={3} />
                </>
              ) : (
                <>
                  {/* Pending Timecards / Your Pending Timecard */}
                  <Link
                    href="/dashboard/admin/timecards"
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span className="text-sm text-gray-700">
                        {scope === 'personal' ? 'Your Pending Timecard' : 'Pending Timecards'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          (dashData?.open_items.pending_timecards ?? 0) > 0
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {dashData?.open_items.pending_timecards ?? 0}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </Link>

                  {/* Unassigned Jobs — team scope only */}
                  {scope === 'team' && (
                    <Link
                      href="/dashboard/admin/schedule-board"
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        <span className="text-sm text-gray-700">Unassigned Jobs</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            (dashData?.open_items.unassigned_jobs ?? 0) > 0
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {dashData?.open_items.unassigned_jobs ?? 0}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </div>
                    </Link>
                  )}

                  {/* Overdue Invoices / Your Overdue Invoices */}
                  <Link
                    href="/dashboard/admin/billing"
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-gray-700">
                        {scope === 'personal' ? 'Your Overdue Invoices' : 'Overdue Invoices'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          (dashData?.open_items.overdue_invoices ?? 0) > 0
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {dashData?.open_items.overdue_invoices ?? 0}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Team Status / Your Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
              <Users className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">
                {scope === 'personal' ? 'Your Status' : 'Team Status'}
              </h2>
            </div>

            <div className="px-2 py-2">
              {dashLoading ? (
                Array.from({ length: scope === 'personal' ? 1 : 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2">
                    <div className="animate-pulse bg-gray-200 rounded-full w-2.5 h-2.5" />
                    <div className="animate-pulse bg-gray-200 rounded h-3 flex-1" />
                    <div className="animate-pulse bg-gray-200 rounded h-3 w-16" />
                  </div>
                ))
              ) : !dashData || dashData.team_status.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  {scope === 'personal' ? 'No status available' : 'No crew data available'}
                </div>
              ) : (
                <>
                  {dashData.team_status.slice(0, scope === 'personal' ? 1 : 8).map((member) => (
                    <div key={member.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <span
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          member.status === 'active'
                            ? 'bg-green-500'
                            : member.status === 'off'
                            ? 'bg-blue-400'
                            : 'bg-gray-300'
                        }`}
                      />
                      <span className="text-sm font-medium text-gray-800 flex-1 truncate">{member.name}</span>
                      <span className="text-xs text-gray-400 truncate max-w-[80px]">
                        {member.current_job ?? (member.status === 'off' ? 'Time Off' : 'Idle')}
                      </span>
                    </div>
                  ))}
                  {scope === 'team' && dashData.team_status.length > 8 && (
                    <p className="text-xs text-gray-400 text-center py-2">
                      +{dashData.team_status.length - 8} more
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/dashboard/admin/schedule-form"
                className="flex flex-col items-center gap-2 p-4 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 text-blue-700 transition-colors cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                <span className="text-xs font-semibold">New Job</span>
              </Link>
              <Link
                href="/dashboard/admin/schedule-form"
                className="flex flex-col items-center gap-2 p-4 bg-green-50 hover:bg-green-100 rounded-xl border border-green-200 text-green-700 transition-colors cursor-pointer"
              >
                <Calendar className="w-5 h-5" />
                <span className="text-xs font-semibold">Schedule Form</span>
              </Link>
              <Link
                href="/dashboard/admin/timecards"
                className="flex flex-col items-center gap-2 p-4 bg-purple-50 hover:bg-purple-100 rounded-xl border border-purple-200 text-purple-700 transition-colors cursor-pointer"
              >
                <Clock className="w-5 h-5" />
                <span className="text-xs font-semibold">Timecards</span>
              </Link>
              <Link
                href="/dashboard/admin/billing"
                className="flex flex-col items-center gap-2 p-4 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 text-amber-700 transition-colors cursor-pointer"
              >
                <CreditCard className="w-5 h-5" />
                <span className="text-xs font-semibold">Billing</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── View Active Jobs ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl border border-purple-500/30 shadow-lg shadow-purple-900/10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Activity className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">View Active Jobs</h2>
              <p className="text-xs text-slate-400 mt-0.5">Jobs currently in progress or assigned</p>
            </div>
          </div>
          <Link
            href="/dashboard/admin/active-jobs"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            View All
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="p-4">
          {activeJobsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50">
                  <div className="animate-pulse bg-slate-700 rounded w-20 h-4" />
                  <div className="animate-pulse bg-slate-700 rounded flex-1 h-4" />
                  <div className="animate-pulse bg-slate-700 rounded w-16 h-4" />
                </div>
              ))}
            </div>
          ) : activeJobs.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400 mb-1">No active jobs right now</p>
              <p className="text-xs text-slate-500">Jobs with status &ldquo;assigned&rdquo; or &ldquo;in progress&rdquo; will appear here</p>
              <Link
                href="/dashboard/admin/schedule-form"
                className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Schedule a Job
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {activeJobs.slice(0, 6).map(job => (
                <Link
                  key={job.id}
                  href={`/dashboard/admin/active-jobs`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/60 border border-slate-700/40 hover:border-purple-500/30 transition-all group"
                >
                  {/* Job number */}
                  <span className="text-xs font-mono bg-slate-700 px-2 py-1 rounded text-purple-300 flex-shrink-0 min-w-[72px] text-center">
                    {job.job_number}
                  </span>

                  {/* Customer + operator */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{job.customer_name}</p>
                    {job.operator_name && (
                      <p className="text-xs text-slate-400 truncate flex items-center gap-1 mt-0.5">
                        <Users className="w-3 h-3 inline flex-shrink-0" />
                        {job.operator_name}
                      </p>
                    )}
                  </div>

                  {/* Work items */}
                  {job.work_items_count > 0 && (
                    <div className="flex items-center gap-1 text-xs text-emerald-400 flex-shrink-0">
                      <Wrench className="w-3.5 h-3.5" />
                      <span>{job.work_items_count} item{job.work_items_count !== 1 ? 's' : ''}</span>
                    </div>
                  )}

                  {/* Status pill */}
                  <span
                    className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      job.status === 'in_progress' || job.status === 'on_site'
                        ? 'bg-green-900/50 text-green-400 border border-green-700/30'
                        : job.status === 'in_route'
                        ? 'bg-amber-900/50 text-amber-400 border border-amber-700/30'
                        : 'bg-blue-900/50 text-blue-400 border border-blue-700/30'
                    }`}
                  >
                    {job.status === 'in_progress' ? 'In Progress'
                      : job.status === 'on_site' ? 'On Site'
                      : job.status === 'in_route' ? 'En Route'
                      : 'Assigned'}
                  </span>

                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-purple-400 transition-colors flex-shrink-0" />
                </Link>
              ))}

              {activeJobs.length > 6 && (
                <Link
                  href="/dashboard/admin/active-jobs"
                  className="block text-center py-2 text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
                >
                  +{activeJobs.length - 6} more active jobs &rarr;
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Activity ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
          <Clock className="w-5 h-5 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
        </div>

        <div className="divide-y divide-gray-50">
          {dashLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-3">
                <div className="animate-pulse bg-gray-200 rounded-full w-8 h-8 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="animate-pulse bg-gray-200 rounded h-3 w-3/4" />
                  <div className="animate-pulse bg-gray-200 rounded h-3 w-1/4" />
                </div>
              </div>
            ))
          ) : !dashData || dashData.recent_activity.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No recent activity</div>
          ) : (
            dashData.recent_activity.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                <ActivityIcon type={item.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{item.description}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{relativeTime(item.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Admin Onboarding Tour */}
      {showWalkthrough && isDemoAdmin && user && (
        <AdminOnboardingTour userId={user.id} onComplete={markWalkthroughComplete} />
      )}
    </div>
  );
}
