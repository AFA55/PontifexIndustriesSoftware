'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, ClipboardCheck, User as UserIcon, Briefcase, Calendar,
  AlertTriangle, Star, Loader2, ArrowLeft, Search, Filter,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';

interface VisitRow {
  id: string;
  visit_date: string;
  operator_name: string;
  supervisor_name: string;
  job_number: string | null;
  customer_name: string | null;
  observations: string | null;
  issues_flagged: string | null;
  follow_up_required: boolean;
  performance_rating: number | null;
  safety_rating: number | null;
  cleanliness_rating: number | null;
  created_at: string;
}

const ALLOWED_ROLES = ['supervisor', 'admin', 'super_admin', 'operations_manager'];

// Format YYYY-MM-DD as a local date (avoids UTC midnight off-by-one).
function formatVisitDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function SiteVisitsListPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [followUpOnly, setFollowUpOnly] = useState(false);

  useEffect(() => {
    const cu = getCurrentUser();
    if (!cu) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(cu.role)) { router.push('/dashboard/admin'); return; }
    setUser(cu);
    setAuthLoading(false);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/admin/supervisor-visits?limit=100', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setVisits(json.data ?? []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const filtered = visits.filter((v) => {
    if (followUpOnly && !v.follow_up_required) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      v.operator_name.toLowerCase().includes(q) ||
      (v.supervisor_name || '').toLowerCase().includes(q) ||
      (v.job_number || '').toLowerCase().includes(q) ||
      (v.customer_name || '').toLowerCase().includes(q)
    );
  });

  const isSupervisor = user?.role === 'supervisor';

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Breadcrumb back */}
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <ClipboardCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Site Visit Reports</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {isSupervisor ? 'Reports you have filed' : 'All supervisor visit reports'}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/admin/site-visits/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white text-sm font-semibold shadow-lg shadow-violet-500/30 transition"
          >
            <Plus className="w-4 h-4" />
            New Visit Report
          </Link>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search operator, supervisor, job, customer…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
          </div>
          <button
            onClick={() => setFollowUpOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
              followUpOnly
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800/50'
                : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-600 hover:border-amber-400'
            }`}
          >
            <Filter className="w-4 h-4" />
            {followUpOnly ? 'Follow-up only' : 'All visits'}
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700">
            <ClipboardCheck className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400 text-sm">
              {search || followUpOnly ? 'No visits match your filters.' : 'No site visit reports yet.'}
            </p>
            {!search && !followUpOnly && (
              <Link
                href="/dashboard/admin/site-visits/new"
                className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline"
              >
                <Plus className="w-4 h-4" />
                File your first report
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((v) => (
              <article
                key={v.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 hover:border-violet-300 dark:hover:border-violet-700 transition"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 px-2 py-1 rounded-full">
                      <Calendar className="w-3 h-3" />
                      {formatVisitDate(v.visit_date)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded-full">
                      <UserIcon className="w-3 h-3" />
                      {v.operator_name || 'Unknown operator'}
                    </span>
                    {v.job_number && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 px-2 py-1 rounded-full">
                        <Briefcase className="w-3 h-3" />
                        {v.job_number}
                      </span>
                    )}
                    {v.follow_up_required && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full">
                        <AlertTriangle className="w-3 h-3" />
                        Follow-up
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 dark:text-slate-500">
                    by {v.supervisor_name || 'Supervisor'}
                  </span>
                </div>

                {/* Customer */}
                {v.customer_name && (
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                    {v.customer_name}
                  </p>
                )}

                {/* Observations + Issues */}
                <div className="grid sm:grid-cols-2 gap-3">
                  {v.observations && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1">Observations</p>
                      <p className="text-sm text-gray-700 dark:text-slate-200 line-clamp-3">{v.observations}</p>
                    </div>
                  )}
                  {v.issues_flagged && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 mb-1">Issues</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 line-clamp-3">{v.issues_flagged}</p>
                    </div>
                  )}
                </div>

                {/* Ratings */}
                {(v.performance_rating || v.safety_rating || v.cleanliness_rating) && (
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
                    {v.performance_rating && <RatingChip label="Performance" value={v.performance_rating} />}
                    {v.safety_rating && <RatingChip label="Safety" value={v.safety_rating} />}
                    {v.cleanliness_rating && <RatingChip label="Cleanliness" value={v.cleanliness_rating} />}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RatingChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`w-3 h-3 ${n <= value ? 'text-amber-500' : 'text-gray-200 dark:text-slate-600'}`}
            fill={n <= value ? 'currentColor' : 'none'}
          />
        ))}
      </div>
    </div>
  );
}
