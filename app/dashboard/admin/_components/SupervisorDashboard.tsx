'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Clock, Plus, Briefcase, Calendar, ClipboardCheck, ChevronRight,
  AlertTriangle, FileText, MapPin, Users, Loader2, CheckCircle2,
  Eye,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User } from '@/lib/auth';
import NfcClockInModal from '@/components/NfcClockInModal';

interface VisitRow {
  id: string;
  visit_date: string;
  operator_name: string;
  job_number: string | null;
  customer_name: string | null;
  observations: string | null;
  follow_up_required: boolean;
  created_at: string;
}

interface ActiveJob {
  id: string;
  job_number: string;
  customer_name: string;
  operator_name: string | null;
  status: string;
  scheduled_date: string | null;
}

interface CurrentTimecard {
  id: string;
  clockInTime: string;
}

// Format a YYYY-MM-DD string as a local date (avoids UTC midnight off-by-one).
function formatVisitDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Local YYYY-MM-DD (avoids UTC midnight off-by-one when comparing date columns).
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// ISO week: Monday → Sunday. JS getDay() returns 0 for Sunday — treat as 7
// so Sunday correctly resolves to the END of the current week, not the next.
function startOfWeekISO(): string {
  const m = new Date();
  const dow = m.getDay() || 7;
  m.setDate(m.getDate() - dow + 1);
  return localDateStr(m);
}
function endOfWeekISO(): string {
  const m = new Date();
  const dow = m.getDay() || 7;
  m.setDate(m.getDate() - dow + 7);
  return localDateStr(m);
}

export default function SupervisorDashboard({ user }: { user: User }) {
  // Clock state
  const [clocked, setClocked] = useState(false);
  const [card, setCard] = useState<CurrentTimecard | null>(null);
  const [hours, setHours] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [clockBusy, setClockBusy] = useState(false);
  const [clockMsg, setClockMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data
  const [weeklyHours, setWeeklyHours] = useState(0);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [visitsThisWeek, setVisitsThisWeek] = useState(0);
  const [followUps, setFollowUps] = useState(0);
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Initial fetch ────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const headers = { Authorization: `Bearer ${session.access_token}` };

      const [curRes, histRes, visitsRes, jobsRes] = await Promise.all([
        fetch('/api/timecard/current', { headers }),
        fetch(`/api/timecard/history?startDate=${startOfWeekISO()}&endDate=${endOfWeekISO()}&limit=50`, { headers }),
        fetch('/api/admin/supervisor-visits?limit=20', { headers }),
        fetch('/api/admin/active-jobs-summary', { headers }),
      ]);

      if (curRes.ok) {
        const j = await curRes.json();
        if (j.isClockedIn && j.data) {
          setClocked(true);
          setCard({ id: j.data.id, clockInTime: j.data.clockInTime });
        } else {
          setClocked(false);
          setCard(null);
        }
      }

      if (histRes.ok) {
        const j = await histRes.json();
        const tot = (j.data?.timecards ?? []).reduce(
          (s: number, t: any) => s + (t.total_hours || 0),
          0
        );
        setWeeklyHours(tot);
      }

      if (visitsRes.ok) {
        const j = await visitsRes.json();
        const list: VisitRow[] = j.data ?? [];
        setVisits(list);
        const wkStart = startOfWeekISO();
        const wkEnd = endOfWeekISO();
        const week = list.filter((v) => v.visit_date >= wkStart && v.visit_date <= wkEnd);
        setVisitsThisWeek(week.length);
        setFollowUps(list.filter((v) => v.follow_up_required).length);
      }

      if (jobsRes.ok) {
        const j = await jobsRes.json();
        setActiveJobs((j.data ?? []).slice(0, 5));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Live timer while clocked in
  useEffect(() => {
    if (!clocked || !card) return;
    const tick = () => {
      const ms = Date.now() - new Date(card.clockInTime).getTime();
      setHours(parseFloat((ms / 3_600_000).toFixed(2)));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [clocked, card]);

  // ── Clock in / out handlers ──────────────────────────────────────────────
  async function performClockIn(data: {
    method: string;
    nfc_tag_id?: string;
    nfc_tag_uid?: string;
    remote_photo_url?: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
  }) {
    setClockBusy(true);
    setClockMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired');
      const res = await fetch('/api/timecard/clock-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          clock_in_method: data.method,
          nfc_tag_id: data.nfc_tag_id,
          nfc_tag_uid: data.nfc_tag_uid,
          remote_photo_url: data.remote_photo_url,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.details || 'Failed to clock in');
      setClocked(true);
      setCard({ id: j.data.id, clockInTime: j.data.clockInTime });
      setShowModal(false);
      setClockMsg({ type: 'success', text: 'Clocked in.' });
      // Re-sync from server (covers any race between modal close + state update)
      fetchAll();
    } catch (err: any) {
      setClockMsg({ type: 'error', text: err.message || 'Failed to clock in' });
      throw err;
    } finally {
      setClockBusy(false);
    }
  }

  async function performClockOut(data: { latitude: number; longitude: number; accuracy?: number }) {
    setClockBusy(true);
    setClockMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired');
      const res = await fetch('/api/timecard/clock-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.details || 'Failed to clock out');
      setClocked(false);
      setCard(null);
      setHours(0);
      setShowModal(false);
      setClockMsg({ type: 'success', text: 'Clocked out.' });
      fetchAll();
    } catch (err: any) {
      setClockMsg({ type: 'error', text: err.message || 'Failed to clock out' });
      throw err;
    } finally {
      setClockBusy(false);
    }
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-gray-50 dark:bg-slate-900 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Supervisor Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {today} · Hi {user.name?.split(' ')[0] ?? 'there'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/admin/site-visits/new"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <ClipboardCheck className="w-4 h-4" />
            New Visit Report
          </Link>
          <Link
            href="/dashboard/admin/schedule-form"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Quote
          </Link>
        </div>
      </div>

      {/* Clock-in widget */}
      <div
        className={`rounded-2xl shadow-sm border p-5 ${
          clocked
            ? 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/10 border-emerald-200 dark:border-emerald-800/40'
            : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                clocked
                  ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30'
                  : 'bg-gray-200 dark:bg-slate-700'
              }`}
            >
              <Clock className={`w-6 h-6 ${clocked ? 'text-white' : 'text-gray-500 dark:text-slate-400'}`} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-slate-400">
                {clocked ? 'You are clocked in' : 'Clock-in'}
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                {clocked ? `${hours.toFixed(2)} hrs today` : 'Not clocked in'}
              </p>
              {clocked && card && (
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  Since {new Date(card.clockInTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            disabled={clockBusy}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm shadow-md transition disabled:opacity-50 ${
              clocked
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/30'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30'
            }`}
          >
            {clockBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : clocked ? (
              'Clock Out'
            ) : (
              'Clock In'
            )}
          </button>
        </div>

        {clockMsg && (
          <p
            className={`mt-3 text-sm ${
              clockMsg.type === 'success'
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {clockMsg.text}
          </p>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiTile
          icon={<Clock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
          accent="bg-emerald-100 dark:bg-emerald-900/40"
          value={weeklyHours.toFixed(1)}
          unit="hrs"
          label="My Hours This Week"
          loading={loading}
        />
        <KpiTile
          icon={<ClipboardCheck className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
          accent="bg-violet-100 dark:bg-violet-900/40"
          value={visitsThisWeek}
          label="Visits This Week"
          loading={loading}
          href="/dashboard/admin/site-visits"
        />
        <KpiTile
          icon={<AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
          accent="bg-amber-100 dark:bg-amber-900/40"
          value={followUps}
          label="Open Follow-ups"
          loading={loading}
          href="/dashboard/admin/site-visits"
        />
        <KpiTile
          icon={<Briefcase className="w-5 h-5 text-sky-600 dark:text-sky-400" />}
          accent="bg-sky-100 dark:bg-sky-900/40"
          value={activeJobs.length}
          label="Active Jobs"
          loading={loading}
          href="/dashboard/admin/active-jobs"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent visits */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4 text-violet-500" />
              Recent Site Visits
            </h2>
            <Link
              href="/dashboard/admin/site-visits"
              className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-0.5"
            >
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
            </div>
          ) : visits.length === 0 ? (
            <div className="py-8 text-center">
              <ClipboardCheck className="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">No visits yet.</p>
              <Link
                href="/dashboard/admin/site-visits/new"
                className="text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline"
              >
                File your first report
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {visits.slice(0, 5).map((v) => (
                <li
                  key={v.id}
                  className="p-3 rounded-lg border border-gray-100 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-700 transition"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {v.operator_name}
                      {v.job_number && (
                        <span className="ml-2 text-xs font-normal text-gray-500 dark:text-slate-400">
                          {v.job_number}
                        </span>
                      )}
                    </p>
                    <span className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">
                      {formatVisitDate(v.visit_date)}
                    </span>
                  </div>
                  {v.observations && (
                    <p className="text-xs text-gray-600 dark:text-slate-400 line-clamp-2">
                      {v.observations}
                    </p>
                  )}
                  {v.follow_up_required && (
                    <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-full">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Follow-up
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Active jobs (you submitted) */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-sky-500" />
              My Active Jobs
            </h2>
            <Link
              href="/dashboard/admin/active-jobs"
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-0.5"
            >
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
            </div>
          ) : activeJobs.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400 py-6 text-center">
              No active jobs scheduled.
            </p>
          ) : (
            <ul className="space-y-2">
              {activeJobs.map((j) => (
                <li
                  key={j.id}
                  className="p-3 rounded-lg border border-gray-100 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-700 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {j.job_number} — {j.customer_name}
                      </p>
                      {j.operator_name && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate mt-0.5">
                          {j.operator_name}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] uppercase font-semibold tracking-wide text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      {j.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Quick actions */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <QuickAction
            href="/dashboard/admin/site-visits/new"
            icon={<ClipboardCheck className="w-5 h-5" />}
            label="New Visit"
            tone="violet"
          />
          <QuickAction
            href="/dashboard/admin/schedule-form"
            icon={<Plus className="w-5 h-5" />}
            label="New Quote"
            tone="indigo"
          />
          <QuickAction
            href="/dashboard/admin/schedule-board"
            icon={<Calendar className="w-5 h-5" />}
            label="Schedule"
            tone="sky"
          />
          <QuickAction
            href="/dashboard/admin/timecards"
            icon={<Users className="w-5 h-5" />}
            label="Timecards"
            tone="emerald"
          />
        </div>
      </div>

      {/* Clock-in modal */}
      {showModal && (
        <NfcClockInModal
          isShopHours={false}
          isClockedIn={clocked}
          onClockIn={performClockIn}
          onClockOut={async (d) => performClockOut({ latitude: d.latitude, longitude: d.longitude, accuracy: d.accuracy })}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function KpiTile({
  icon, accent, value, unit, label, loading, href,
}: {
  icon: React.ReactNode;
  accent: string;
  value: string | number;
  unit?: string;
  label: string;
  loading?: boolean;
  href?: string;
}) {
  const inner = (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-4 hover:shadow-md transition h-full">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 ${accent} rounded-full flex items-center justify-center`}>
          {icon}
        </div>
        {href && <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600" />}
      </div>
      {loading ? (
        <div className="h-7 w-16 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" />
      ) : (
        <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
          {value}
          {unit && <span className="text-sm font-normal text-gray-500 dark:text-slate-400 ml-1">{unit}</span>}
        </p>
      )}
      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const TONE_MAP: Record<string, string> = {
  violet: 'bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/40 border-violet-200 dark:border-violet-800/50 text-violet-700 dark:text-violet-400',
  indigo: 'bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-400',
  sky: 'bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40 border-sky-200 dark:border-sky-800/50 text-sky-700 dark:text-sky-400',
  emerald: 'bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400',
};

function QuickAction({
  href, icon, label, tone,
}: { href: string; icon: React.ReactNode; label: string; tone: keyof typeof TONE_MAP }) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${TONE_MAP[tone]}`}
    >
      {icon}
      <span className="text-xs font-semibold">{label}</span>
    </Link>
  );
}
