'use client';

/**
 * THE PROJECT MANAGER DASHBOARD.
 *
 * `salesman` is the internal role name; every label a user sees says "Project
 * Manager". This was an inline `if (isSalesman)` branch inside
 * app/dashboard/admin/page.tsx — it moved out here because customisation needs
 * `useDashboardCards`, and a hook cannot live behind an early return that sits
 * below three other role branches.
 *
 * Two things arrived with the move (founder, Aug 15):
 *   • "upcoming jobs, active jobs and completed jobs right on there dashboard"
 *     → <PmMyJobs />, split by lib/pm-job-buckets.ts.
 *   • "allow them to remove things or add cards to their dashboard"
 *     → every block below is wrapped in <Removable>, and the Customise panel
 *       offers back anything removed plus any ADMIN_CARDS their role permits.
 *
 * Nothing here decides ACCESS. lib/dashboard-cards.ts intersects the user's
 * stored preference with `getCardPermission` on every render, so a removed card
 * is a preference and an added card is still a permission check.
 */

import Link from 'next/link';
import {
  Briefcase,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Eye,
  FileText,
  HandCoins,
  Plus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { User } from '@/lib/auth';
import { PM_DASHBOARD_SECTIONS } from '@/lib/dashboard-cards';
import CommissionsCard from '@/components/CommissionsCard';
import CommandCenterLaunch from '@/components/command-center/CommandCenterLaunch';
import PmMyJobs from './PmMyJobs';
import {
  AddedFeatureCards,
  CustomiseButton,
  CustomisePanel,
  Removable,
  useDashboardCards,
} from './DashboardCustomiser';

// ─── types (mirrors the /api/sales/dashboard payload) ────────────────────────

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

export interface SalesDashboardData {
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

function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount.toFixed(0)}`;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function PmDashboard({
  user,
  salesData,
  salesLoading,
  today,
  onUpdateDefaultRate,
  onboarding,
}: {
  user: User;
  salesData: SalesDashboardData | null;
  salesLoading: boolean;
  today: string;
  onUpdateDefaultRate: (rate: number) => Promise<void>;
  onboarding?: React.ReactNode;
}) {
  const cards = useDashboardCards(user.role);
  const sections = PM_DASHBOARD_SECTIONS;

  const sd = salesData;
  const trendUp = (sd?.quoted.trend_pct ?? 0) >= 0;
  const expectedCommission =
    (sd?.commissions.pending ?? 0) + (sd?.commissions.earned_mtd ?? 0);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-900 min-h-full">
      {/* Header — never removable: it carries the way back out of an empty dashboard */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Project Manager Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {today} · Hi {user?.name?.split(' ')[0] ?? 'there'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CustomiseButton state={cards} />
          <Link
            href="/dashboard/admin/schedule-form"
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Quote
          </Link>
        </div>
      </div>

      {/* The restore/add panel sits ABOVE the content on purpose — a user who
          removed everything still finds it without scrolling. */}
      <CustomisePanel state={cards} sections={sections} />

      {/* ── Key numbers ───────────────────────────────────────────────────── */}
      <Removable state={cards} sections={sections} id="kpis">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. My Active Jobs */}
          <Link
            href="/dashboard/admin/active-jobs"
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 bg-brand/10 dark:bg-brand/20 rounded-full flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-brand dark:text-brand" />
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-brand transition-colors" />
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

          {/* 3. Expected Commission — forward-looking */}
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
      </Removable>

      {/* Scoping hint */}
      <div className="flex items-center gap-1.5 -mt-2 text-xs text-slate-500 dark:text-white/50">
        <Eye className="w-3.5 h-3.5" />
        <span>Showing your jobs only</span>
      </div>

      {/* ── Upcoming / Active / Completed ─────────────────────────────────── */}
      <Removable state={cards} sections={sections} id="my_jobs">
        <PmMyJobs role={cards.role} permissions={cards.permissions} />
      </Removable>

      {/* ── Commissions ───────────────────────────────────────────────────── */}
      <Removable state={cards} sections={sections} id="commissions">
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
            onUpdateDefaultRate={onUpdateDefaultRate}
          />
        )}
      </Removable>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <Removable state={cards} sections={sections} id="quick_actions">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Link
              href="/dashboard/admin/schedule-form"
              className="flex flex-col items-center gap-2 p-4 bg-brand/10 dark:bg-brand/20 hover:bg-brand/20 dark:hover:bg-brand/30 rounded-xl border border-brand/30 dark:border-brand/40 text-brand dark:text-brand transition-colors"
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
      </Removable>

      {/* ── Cards the user chose to add (role-permitted only) ──────────────── */}
      <AddedFeatureCards state={cards} />

      {/* ── Command Center launch ─────────────────────────────────────────── */}
      <Removable state={cards} sections={sections} id="command_center">
        <CommandCenterLaunch />
      </Removable>

      {onboarding}
    </div>
  );
}
