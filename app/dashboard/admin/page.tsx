'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import nextDynamic from 'next/dynamic';
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
  MapPin,
  User as UserIcon,
  Tag,
  HandCoins,
  Eye,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import { ADMIN_DASHBOARD_ROLES } from '@/lib/rbac';
import { useBranding } from '@/lib/branding-context';
import CommissionsCard from '@/components/CommissionsCard';

// Heavy demo-only walkthrough — only renders when showWalkthrough && isDemoAdmin
const AdminOnboardingTour = nextDynamic(() => import('@/components/AdminOnboardingTour'), { ssr: false, loading: () => null });

// ─── API response types ───────────────────────────────────────────────────────

interface JobToday {
  id: string;
  job_number: string;
  scheduled_time: string | null;
  customer_name: string;
  operator_name: string | null;
  helper_name: string | null;
  status: string;
  job_type: string | null;
  location: string | null;
  equipment: string[];
  is_will_call: boolean;
  is_multi_day: boolean;
  day_number: number | null;
  total_days: number | null;
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

interface SalesCommissionRow {
  job_id: string;
  job_number: string;
  job_status: string;
  customer_name: string;
  scheduled_date: string;
  total_quoted: number;
  total_invoiced: number;
  total_paid: number;
  commission_rate: number;
  commission_pending: number;
  commission_earned: number;
}

interface SalesDashboardData {
  user: { id: string; full_name: string; role: string; commission_rate_default: number };
  quoted: { mtd: number; ytd: number; last_month: number; trend_pct: number };
  jobs: { active_count: number; completed_count_mtd: number; total_count_mtd: number };
  commissions: {
    pending: number;
    earned_mtd: number;
    earned_ytd: number;
    earned_last_month: number;
    trend_pct: number;
    breakdown: SalesCommissionRow[];
  };
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
      return <div className={`${base} bg-emerald-100 dark:bg-emerald-900/40`}><CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /></div>;
    case 'invoice_paid':
      return <div className={`${base} bg-green-100 dark:bg-green-900/40`}><DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" /></div>;
    case 'invoice_created':
      return <div className={`${base} bg-blue-100 dark:bg-blue-900/40`}><FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" /></div>;
    case 'job_created':
      return <div className={`${base} bg-purple-100 dark:bg-purple-900/40`}><Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400" /></div>;
    case 'timecard_approved':
    case 'timecard_submitted':
      return <div className={`${base} bg-amber-100 dark:bg-amber-900/40`}><Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" /></div>;
    default:
      return <div className={`${base} bg-gray-100 dark:bg-slate-700`}><Briefcase className="w-4 h-4 text-gray-500 dark:text-slate-400" /></div>;
  }
}

// ─── skeleton helpers ──────────────────────────────────────────────────────────

function SkeletonRow({ cols = 3 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-4" style={{ flex: 1 }} />
      ))}
    </div>
  );
}

// ─── rich schedule widget helpers ─────────────────────────────────────────────

const JOB_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  'DFS':            { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'DFS'      },
  'EFS':            { bg: 'bg-purple-100', text: 'text-purple-700', label: 'EFS'      },
  'Demo':           { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Demo'     },
  'Core Drilling':  { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Core'     },
  'Wire Saw':       { bg: 'bg-teal-100',   text: 'text-teal-700',   label: 'Wire Saw' },
  'Chain Saw':      { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Chain Saw'},
  'Hand Saw':       { bg: 'bg-lime-100',   text: 'text-lime-700',   label: 'Hand Saw' },
  'GPR':            { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'GPR'      },
};

function ServiceTypeBadge({ jobType }: { jobType: string | null }) {
  if (!jobType) return null;
  const style = JOB_TYPE_STYLES[jobType] ?? {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    label: jobType,
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
      <Tag className="w-2.5 h-2.5" />
      {style.label}
    </span>
  );
}

const RICH_STATUS_STYLES: Record<string, { pill: string; label: string; border: string }> = {
  scheduled:   { pill: 'bg-purple-100 text-purple-700', label: 'Scheduled',   border: 'border-l-purple-400' },
  assigned:    { pill: 'bg-blue-100 text-blue-700',     label: 'Assigned',    border: 'border-l-blue-400'   },
  in_route:    { pill: 'bg-amber-100 text-amber-700',   label: 'En Route',    border: 'border-l-amber-400'  },
  on_site:     { pill: 'bg-green-100 text-green-700',   label: 'On Site',     border: 'border-l-green-400'  },
  in_progress: { pill: 'bg-green-100 text-green-700',   label: 'In Progress', border: 'border-l-green-400'  },
  completed:   { pill: 'bg-gray-100 text-gray-500',     label: 'Completed',   border: 'border-l-gray-300'   },
  cancelled:   { pill: 'bg-red-100 text-red-600',       label: 'Cancelled',   border: 'border-l-red-400'    },
};

function getJobBorderClass(job: JobToday): string {
  // Unassigned => orange
  if (!job.operator_name) return 'border-l-orange-400';
  const s = RICH_STATUS_STYLES[job.status];
  return s?.border ?? 'border-l-gray-200';
}

function RichStatusPill({ status }: { status: string }) {
  const s = RICH_STATUS_STYLES[status] ?? { pill: 'bg-gray-100 text-gray-500', label: status };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.pill}`}>
      {s.label}
    </span>
  );
}

function ScheduleJobCard({ job }: { job: JobToday }) {
  const isUnassigned = !job.operator_name;
  const borderClass = getJobBorderClass(job);

  return (
    <Link
      href="/dashboard/admin/schedule-board"
      className={`block bg-white dark:bg-slate-700/50 border border-gray-100 dark:border-slate-600 rounded-xl p-3 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors border-l-4 ${borderClass}`}
    >
      {/* Top row: time + job number + status */}
      <div className="flex items-center gap-2 mb-2">
        {job.is_will_call ? (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex-shrink-0">
            Will Call
          </span>
        ) : job.scheduled_time ? (
          <span className="text-[10px] font-mono font-bold bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-slate-300 px-2 py-0.5 rounded flex-shrink-0">
            {formatTime(job.scheduled_time)}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-gray-400 dark:text-slate-500 px-2 py-0.5 flex-shrink-0">--:--</span>
        )}
        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono truncate">{job.job_number}</span>
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {job.is_multi_day && job.day_number && job.total_days && (
            <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
              Day {job.day_number}/{job.total_days}
            </span>
          )}
          <RichStatusPill status={job.status} />
        </div>
      </div>

      {/* Customer name + service type */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight truncate">{job.customer_name}</p>
        <ServiceTypeBadge jobType={job.job_type} />
      </div>

      {/* Location */}
      {job.location && (
        <div className="flex items-center gap-1 mb-1.5">
          <MapPin className="w-3 h-3 text-gray-400 dark:text-slate-500 flex-shrink-0" />
          <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">{job.location}</p>
        </div>
      )}

      {/* Operators + equipment */}
      <div className="flex items-center gap-2 flex-wrap">
        {isUnassigned ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full">
            <UserIcon className="w-2.5 h-2.5" />
            Unassigned
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1 text-[10px] text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-600 px-2 py-0.5 rounded-full truncate max-w-[120px]">
              <UserIcon className="w-2.5 h-2.5 flex-shrink-0" />
              {job.operator_name}
            </span>
            {job.helper_name && (
              <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-600/50 px-2 py-0.5 rounded-full truncate max-w-[100px]">
                <Users className="w-2.5 h-2.5 flex-shrink-0" />
                {job.helper_name}
              </span>
            )}
          </>
        )}

        {/* Equipment tags (up to 3) */}
        {job.equipment && job.equipment.length > 0 && (
          <>
            {job.equipment.slice(0, 3).map((eq, i) => (
              <span key={i} className="text-[10px] text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-600/50 border border-gray-200 dark:border-slate-600 px-1.5 py-0.5 rounded truncate max-w-[80px]">
                {eq}
              </span>
            ))}
            {job.equipment.length > 3 && (
              <span className="text-[10px] text-gray-400 dark:text-slate-500">+{job.equipment.length - 3} more</span>
            )}
          </>
        )}
      </div>
    </Link>
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

  // ── salesman-specific dashboard state ──────────────────────────────────
  const [salesData, setSalesData] = useState<SalesDashboardData | null>(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const isSalesman = user?.role === 'salesman';

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

  // ── dashboard data (full admins) ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    // Salesmen use a dedicated endpoint — skip the admin summary entirely.
    if (user.role === 'salesman') {
      setDashLoading(false);
      return;
    }

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

  // ── sales dashboard data (salesman only) ──────────────────────────────────
  useEffect(() => {
    if (!user || user.role !== 'salesman') {
      setSalesLoading(false);
      return;
    }

    const fetchSales = async () => {
      setSalesLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/sales/dashboard', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setSalesData(json.data);
        }
      } catch {
        // silent — UI shows empty state
      } finally {
        setSalesLoading(false);
      }
    };

    fetchSales();
  }, [user]);

  // ── default-rate updater (passed to CommissionsCard) ──────────────────
  const handleUpdateDefaultRate = async (rate: number) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/profile/commission-rate-default', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ commission_rate_default: rate }),
    });
    if (!res.ok) throw new Error('Failed to update default rate');
    // Optimistically reflect in local state
    setSalesData((prev) =>
      prev
        ? { ...prev, user: { ...prev.user, commission_rate_default: rate } }
        : prev
    );
  };

  // ── active jobs fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    // Salesmen get their active count from /api/sales/dashboard.
    if (user.role === 'salesman') {
      setActiveJobsLoading(false);
      return;
    }

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
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500 dark:text-slate-400 text-sm">Loading dashboard...</p>
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

  // ── Salesman render branch (separate layout) ──────────────────────────────
  if (isSalesman) {
    const sd = salesData;
    const trendUp = (sd?.quoted.trend_pct ?? 0) >= 0;
    const expectedCommission =
      (sd?.commissions.pending ?? 0) + (sd?.commissions.earned_mtd ?? 0);

    return (
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-900 min-h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Sales Dashboard
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
              {today} · Hi {user?.name?.split(' ')[0] ?? 'there'}
            </p>
          </div>
          <Link
            href="/dashboard/admin/schedule-form"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Quote
          </Link>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. My Active Jobs */}
          <Link
            href="/dashboard/admin/active-jobs"
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/40 rounded-full flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-violet-500 transition-colors" />
            </div>
            {salesLoading ? (
              <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-8 w-12 mb-2" />
            ) : (
              <p className="text-4xl font-bold text-gray-900 dark:text-white tabular-nums">
                {sd?.jobs.active_count ?? 0}
              </p>
            )}
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">My Active Jobs</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
              Quote and ship more
            </p>
          </Link>

          {/* 2. Quoted MTD */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/40 rounded-full flex items-center justify-center">
                <FileText className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
              {!salesLoading && sd && (
                <span
                  className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    trendUp
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                  }`}
                >
                  {trendUp ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {Math.abs(sd.quoted.trend_pct ?? 0)}%
                </span>
              )}
            </div>
            {salesLoading ? (
              <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-8 w-24 mb-2" />
            ) : (
              <p className="text-4xl font-bold text-gray-900 dark:text-white tabular-nums">
                {formatCurrency(sd?.quoted.mtd ?? 0)}
              </p>
            )}
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Quoted MTD</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
              vs {formatCurrency(sd?.quoted.last_month ?? 0)} last month
            </p>
          </div>

          {/* 3. Expected Commission (emerald) — forward-looking, replaces Pending + Earned tiles */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-emerald-100 dark:border-emerald-900/40 p-6 ring-1 ring-emerald-100 dark:ring-emerald-900/30">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center">
                <HandCoins className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            {salesLoading ? (
              <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-8 w-24 mb-2" />
            ) : (
              <p className="text-4xl font-bold text-gray-900 dark:text-white tabular-nums">
                {formatCurrency(expectedCommission)}
              </p>
            )}
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Expected Commission</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
              If all current invoices get paid
            </p>
          </div>
        </div>

        {/* Scoping hint */}
        <div className="flex items-center gap-1.5 -mt-2 text-xs text-slate-500 dark:text-white/50">
          <Eye className="w-3.5 h-3.5" />
          <span>Showing your jobs only</span>
        </div>

        {/* Commissions card */}
        {salesLoading ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="grid grid-cols-3 gap-2">
                <div className="h-16 bg-slate-100 dark:bg-slate-700/60 rounded-xl" />
                <div className="h-16 bg-slate-100 dark:bg-slate-700/60 rounded-xl" />
                <div className="h-16 bg-slate-100 dark:bg-slate-700/60 rounded-xl" />
              </div>
              <div className="h-32 bg-slate-50 dark:bg-slate-700/40 rounded" />
            </div>
          </div>
        ) : (
          <CommissionsCard
            pending={sd?.commissions.pending ?? 0}
            earnedMtd={sd?.commissions.earned_mtd ?? 0}
            earnedYtd={sd?.commissions.earned_ytd ?? 0}
            breakdown={sd?.commissions.breakdown ?? []}
            defaultRate={sd?.user.commission_rate_default ?? 0}
            onUpdateDefaultRate={handleUpdateDefaultRate}
          />
        )}

        {/* Quick actions */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Link
              href="/dashboard/admin/schedule-form"
              className="flex flex-col items-center gap-2 p-4 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-xl border border-violet-200 dark:border-violet-800/50 text-violet-700 dark:text-violet-400 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-semibold">New Quote</span>
            </Link>
            <Link
              href="/dashboard/admin/active-jobs"
              className="flex flex-col items-center gap-2 p-4 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40 rounded-xl border border-sky-200 dark:border-sky-800/50 text-sky-700 dark:text-sky-400 transition-colors"
            >
              <Briefcase className="w-5 h-5" />
              <span className="text-xs font-semibold">Active Jobs</span>
            </Link>
            <Link
              href="/dashboard/admin/billing"
              className="flex flex-col items-center gap-2 p-4 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-xl border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 transition-colors"
            >
              <CreditCard className="w-5 h-5" />
              <span className="text-xs font-semibold">Billing</span>
            </Link>
            <Link
              href="/dashboard/admin/completed-jobs"
              className="flex flex-col items-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-xl border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 transition-colors"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-xs font-semibold">Completed</span>
            </Link>
          </div>
        </div>

        {/* Onboarding hook still respects salesman path */}
        {showWalkthrough && isDemoAdmin && user && (
          <AdminOnboardingTour userId={user.id} onComplete={markWalkthroughComplete} />
        )}
      </div>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-900 min-h-full">

      {/* ── Scope toggle header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {scope === 'personal' ? 'Your Dashboard' : 'Team Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {scope === 'personal'
              ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
              : `All operators · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
            }
          </p>
        </div>

        {/* Toggle — senior roles only */}
        {isSeniorRole && (
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 rounded-xl p-1">
            <button
              onClick={() => handleScopeChange('personal')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                scope === 'personal'
                  ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
              }`}
            >
              <UserCircle2 className="w-4 h-4" />
              My View
            </button>
            <button
              onClick={() => handleScopeChange('team')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                scope === 'team'
                  ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
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
        <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-100 dark:border-blue-900/50 rounded-xl px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {user?.name?.charAt(0) || '?'}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{user?.name}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 capitalize">
              {user?.role?.replace(/_/g, ' ')} · Viewing your personal metrics
            </p>
          </div>
          <div className="ml-auto">
            <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full font-medium">
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
          className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 hover:shadow-md transition-shadow group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors" />
          </div>
          {dashLoading ? (
            <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-8 w-16 mb-2" />
          ) : (
            <p className="text-4xl font-bold text-gray-900 dark:text-white">{dashData?.jobs_today.count ?? 0}</p>
          )}
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {scope === 'personal' ? 'Your Jobs Today' : 'Jobs Today'}
          </p>
        </Link>

        {/* Revenue MTD */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            {!dashLoading && dashData && (
              <span
                className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  dashData.revenue_mtd.trend_pct >= 0
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
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
            <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-8 w-24 mb-2" />
          ) : (
            <p className="text-4xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(dashData?.revenue_mtd.total ?? 0)}
            </p>
          )}
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {scope === 'personal' ? 'Your Revenue MTD' : 'Revenue MTD'}
          </p>
        </div>

        {/* Open Items */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            {!dashLoading && openItemsTotal > 0 && (
              <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
            )}
          </div>
          {dashLoading ? (
            <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-8 w-12 mb-2" />
          ) : (
            <p className="text-4xl font-bold text-gray-900 dark:text-white">{openItemsTotal}</p>
          )}
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {scope === 'personal' ? 'Your Open Items' : 'Open Items'}
          </p>
        </div>

        {/* Crew Utilization (team) / Pending Timecards (personal) */}
        {scope === 'personal' ? (
          <Link
            href="/dashboard/admin/timecards"
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-purple-500 transition-colors" />
            </div>
            {dashLoading ? (
              <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-8 w-16 mb-2" />
            ) : (
              <p className="text-4xl font-bold text-gray-900 dark:text-white">
                {dashData?.open_items.pending_timecards ?? 0}
              </p>
            )}
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Pending Timecards</p>
          </Link>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            {dashLoading ? (
              <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-8 w-16 mb-2" />
            ) : (
              <p className="text-4xl font-bold text-gray-900 dark:text-white">
                {dashData?.crew_utilization.pct ?? 0}%
              </p>
            )}
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {dashLoading ? (
                <span className="inline-block animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-3 w-20" />
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

          {/* Today's Schedule — rich quick-view */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {scope === 'personal' ? 'Your Schedule Today' : "Today's Schedule"}
                </h2>
                <span className="text-xs text-gray-400 dark:text-slate-500">{today}</span>
              </div>
              <Link
                href="/dashboard/admin/schedule-board"
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View Full Board
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-3 space-y-2">
              {dashLoading ? (
                /* Loading skeletons */
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 dark:border-slate-700 border-l-4 border-l-gray-200 dark:border-l-slate-600 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-4 w-14" />
                      <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-3 w-24" />
                      <div className="ml-auto animate-pulse bg-gray-200 dark:bg-slate-700 rounded-full h-4 w-16" />
                    </div>
                    <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-4 w-3/4" />
                    <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-3 w-1/2" />
                    <div className="flex gap-2">
                      <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded-full h-4 w-20" />
                      <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-4 w-16" />
                    </div>
                  </div>
                ))
              ) : !dashData || dashData.jobs_today.jobs.length === 0 ? (
                <div className="py-12 text-center">
                  <Calendar className="w-10 h-10 text-gray-200 dark:text-slate-700 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
                    {scope === 'personal'
                      ? 'You have no jobs scheduled today'
                      : 'No jobs scheduled for today'}
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
                <>
                  {dashData.jobs_today.jobs.slice(0, 6).map((job) => (
                    <ScheduleJobCard key={job.id} job={job} />
                  ))}
                  {dashData.jobs_today.jobs.length > 6 && (
                    <Link
                      href="/dashboard/admin/schedule-board"
                      className="block text-center py-2 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
                    >
                      View {dashData.jobs_today.jobs.length - 6} more on board &rarr;
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Recent Notifications placeholder — NotificationBell handles the popover */}
          {/* Removed: notifications are in layout header bell */}

        </div>

        {/* Right column — 2/5 */}
        <div className="xl:col-span-2 space-y-6">

          {/* Action Required */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 dark:border-slate-700">
              <AlertCircle className="w-5 h-5 text-gray-400 dark:text-slate-500" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Action Required</h2>
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
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer border-b border-gray-50 dark:border-slate-700/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span className="text-sm text-gray-700 dark:text-slate-300">
                        {scope === 'personal' ? 'Your Pending Timecard' : 'Pending Timecards'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          (dashData?.open_items.pending_timecards ?? 0) > 0
                            ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
                        }`}
                      >
                        {dashData?.open_items.pending_timecards ?? 0}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-gray-500 dark:group-hover:text-slate-400 transition-colors" />
                    </div>
                  </Link>

                  {/* Unassigned Jobs — team scope only */}
                  {scope === 'team' && (
                    <Link
                      href="/dashboard/admin/schedule-board"
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer border-b border-gray-50 dark:border-slate-700/50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        <span className="text-sm text-gray-700 dark:text-slate-300">Unassigned Jobs</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            (dashData?.open_items.unassigned_jobs ?? 0) > 0
                              ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                              : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
                          }`}
                        >
                          {dashData?.open_items.unassigned_jobs ?? 0}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-gray-500 dark:group-hover:text-slate-400 transition-colors" />
                      </div>
                    </Link>
                  )}

                  {/* Overdue Invoices / Your Overdue Invoices */}
                  <Link
                    href="/dashboard/admin/billing"
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-gray-700 dark:text-slate-300">
                        {scope === 'personal' ? 'Your Overdue Invoices' : 'Overdue Invoices'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          (dashData?.open_items.overdue_invoices ?? 0) > 0
                            ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
                        }`}
                      >
                        {dashData?.open_items.overdue_invoices ?? 0}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-gray-500 dark:group-hover:text-slate-400 transition-colors" />
                    </div>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Team Status / Your Status */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 dark:border-slate-700">
              <Users className="w-5 h-5 text-gray-400 dark:text-slate-500" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                {scope === 'personal' ? 'Your Status' : 'Team Status'}
              </h2>
            </div>

            <div className="px-2 py-2">
              {dashLoading ? (
                Array.from({ length: scope === 'personal' ? 1 : 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2">
                    <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded-full w-2.5 h-2.5" />
                    <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-3 flex-1" />
                    <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-3 w-16" />
                  </div>
                ))
              ) : !dashData || dashData.team_status.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400 dark:text-slate-500">
                  {scope === 'personal' ? 'No status available' : 'No crew data available'}
                </div>
              ) : (
                <>
                  {dashData.team_status.slice(0, scope === 'personal' ? 1 : 8).map((member) => (
                    <div key={member.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                      <span
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          member.status === 'active'
                            ? 'bg-green-500'
                            : member.status === 'off'
                            ? 'bg-blue-400'
                            : 'bg-gray-300 dark:bg-slate-600'
                        }`}
                      />
                      <span className="text-sm font-medium text-gray-800 dark:text-slate-200 flex-1 truncate">{member.name}</span>
                      <span className="text-xs text-gray-400 dark:text-slate-500 truncate max-w-[80px]">
                        {member.current_job ?? (member.status === 'off' ? 'Time Off' : 'Idle')}
                      </span>
                    </div>
                  ))}
                  {scope === 'team' && dashData.team_status.length > 8 && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-2">
                      +{dashData.team_status.length - 8} more
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/dashboard/admin/schedule-form"
                className="flex flex-col items-center gap-2 p-4 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-xl border border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-400 transition-colors cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                <span className="text-xs font-semibold">New Job</span>
              </Link>
              <Link
                href="/dashboard/admin/completed-jobs"
                className="flex flex-col items-center gap-2 p-4 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-xl border border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-xs font-semibold">Completed Jobs</span>
              </Link>
              <Link
                href="/dashboard/admin/timecards"
                className="flex flex-col items-center gap-2 p-4 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-xl border border-purple-200 dark:border-purple-800/50 text-purple-700 dark:text-purple-400 transition-colors cursor-pointer"
              >
                <Clock className="w-5 h-5" />
                <span className="text-xs font-semibold">Timecards</span>
              </Link>
              <Link
                href="/dashboard/admin/billing"
                className="flex flex-col items-center gap-2 p-4 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-xl border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 transition-colors cursor-pointer"
              >
                <CreditCard className="w-5 h-5" />
                <span className="text-xs font-semibold">Billing</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── View Active Jobs ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center">
              <Activity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">View Active Jobs</h2>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Jobs currently in progress or assigned</p>
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
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-700/50">
                  <div className="animate-pulse bg-gray-200 dark:bg-slate-600 rounded w-20 h-4" />
                  <div className="animate-pulse bg-gray-200 dark:bg-slate-600 rounded flex-1 h-4" />
                  <div className="animate-pulse bg-gray-200 dark:bg-slate-600 rounded w-16 h-4" />
                </div>
              ))}
            </div>
          ) : activeJobs.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">No active jobs right now</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">Jobs with status &ldquo;assigned&rdquo; or &ldquo;in progress&rdquo; will appear here</p>
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
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-700/50 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-600 hover:border-purple-300 dark:hover:border-purple-700 transition-all group"
                >
                  {/* Job number */}
                  <span className="text-xs font-mono bg-purple-100 dark:bg-purple-900/40 px-2 py-1 rounded text-purple-700 dark:text-purple-400 flex-shrink-0 min-w-[72px] text-center">
                    {job.job_number}
                  </span>

                  {/* Customer + operator */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{job.customer_name}</p>
                    {job.operator_name && (
                      <p className="text-xs text-gray-500 dark:text-slate-400 truncate flex items-center gap-1 mt-0.5">
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
                        ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50'
                        : job.status === 'in_route'
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50'
                        : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50'
                    }`}
                  >
                    {job.status === 'in_progress' ? 'In Progress'
                      : job.status === 'on_site' ? 'On Site'
                      : job.status === 'in_route' ? 'En Route'
                      : 'Assigned'}
                  </span>

                  <ChevronRight className="w-4 h-4 text-gray-400 dark:text-slate-500 group-hover:text-purple-500 transition-colors flex-shrink-0" />
                </Link>
              ))}

              {activeJobs.length > 6 && (
                <Link
                  href="/dashboard/admin/active-jobs"
                  className="block text-center py-2 text-xs text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 font-medium transition-colors"
                >
                  +{activeJobs.length - 6} more active jobs &rarr;
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Activity ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <Clock className="w-5 h-5 text-gray-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
        </div>

        <div className="divide-y divide-gray-50 dark:divide-slate-700">
          {dashLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-3">
                <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded-full w-8 h-8 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-3 w-3/4" />
                  <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded h-3 w-1/4" />
                </div>
              </div>
            ))
          ) : !dashData || dashData.recent_activity.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400 dark:text-slate-500">No recent activity</div>
          ) : (
            dashData.recent_activity.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                <ActivityIcon type={item.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-slate-300 truncate">{item.description}</p>
                </div>
                <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">{relativeTime(item.created_at)}</span>
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
