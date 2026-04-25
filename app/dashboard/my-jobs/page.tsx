'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Loader2, Inbox, Briefcase, Building2, CheckCircle2, Clock, AlertCircle, PauseCircle, PlayCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import DayNavigator from './_components/DayNavigator';
import JobTicketCard, { type JobTicketData } from './_components/JobTicketCard';
import NotificationBanner from './_components/NotificationBanner';

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function MyJobsPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(toDateString(new Date()));
  const [jobs, setJobs] = useState<JobTicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('operator');
  const [userId, setUserId] = useState<string>('');
  const [hasLongDurationJob, setHasLongDurationJob] = useState(false);
  const [continuingProjects, setContinuingProjects] = useState<any[]>([]);
  const [activeShopTicket, setActiveShopTicket] = useState<any>(null);
  const [completingShop, setCompletingShop] = useState(false);
  const [shopDescription, setShopDescription] = useState('');
  const [scheduleUpdatedBanner, setScheduleUpdatedBanner] = useState(false);

  const isHelper = userRole === 'apprentice';

  const fetchJobs = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Fetch jobs for the selected date (including completed for lookback)
      const res = await fetch(
        `/api/job-orders?scheduled_date=${date}&include_helper_jobs=true&includeCompleted=true`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          // Mark jobs where current user is the helper (not the operator)
          const uid = session.user.id;
          setUserId(uid);
          const enriched = (json.data || []).map((j: any) => ({
            ...j,
            isHelper: j.helper_assigned_to === uid && j.assigned_to !== uid,
          }));
          setJobs(enriched);
          if (json.user_role) setUserRole(json.user_role);
        }
      }
    } catch (err) {
      console.error('Error fetching schedule:', err);
      setError('Failed to load your schedule. Pull down to retry.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Check for long-duration jobs (>3 days) for 7-day lookahead
  const checkLongDurationJobs = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const today = toDateString(new Date());
      const weekAhead = new Date();
      weekAhead.setDate(weekAhead.getDate() + 7);
      const weekStr = toDateString(weekAhead);

      const res = await fetch(
        `/api/job-orders?date_from=${today}&date_to=${weekStr}&include_helper_jobs=true&includeCompleted=false`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (res.ok) {
        const json = await res.json();
        const hasLong = (json.data || []).some((j: any) => {
          if (!j.end_date || !j.scheduled_date) return false;
          const start = parseDate(j.scheduled_date);
          const end = parseDate(j.end_date);
          const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          return days > 3;
        });
        setHasLongDurationJob(hasLong);
      }
    } catch {
      // silent
    }
  }, []);

  // Fetch on_hold and in_progress jobs from past dates (continuing projects)
  const fetchContinuingProjects = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const today = toDateString(new Date());

      // Fetch on_hold jobs assigned to this user (any date)
      const [onHoldRes, inProgressRes] = await Promise.all([
        fetch(`/api/job-orders?status=on_hold&include_helper_jobs=true&includeCompleted=false`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        }),
        fetch(`/api/job-orders?status=in_progress&include_helper_jobs=true&includeCompleted=false`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        }),
      ]);

      const onHoldData = onHoldRes.ok ? (await onHoldRes.json()).data || [] : [];
      const inProgressData = inProgressRes.ok ? (await inProgressRes.json()).data || [] : [];

      // Combine, filter to past dates only (don't double-show today's jobs)
      const uid = session.user.id;
      const all = [...onHoldData, ...inProgressData].filter((j: any) => {
        const isAssigned = j.assigned_to === uid || j.helper_assigned_to === uid;
        const isPastDate = j.scheduled_date && j.scheduled_date < today;
        return isAssigned && isPastDate;
      });

      // Deduplicate by id
      const seen = new Set<string>();
      const unique = all.filter((j: any) => { if (seen.has(j.id)) return false; seen.add(j.id); return true; });

      setContinuingProjects(unique);
    } catch {
      // silent
    }
  }, []);

  // Fetch active shop ticket for today (helpers only)
  const fetchShopTicket = useCallback(async () => {
    if (!isHelper) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/helper-work-log?all_today=true`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const shopTicket = (json.data || []).find((l: any) => l.is_shop_ticket && !l.completed_at);
        setActiveShopTicket(shopTicket || null);
        if (shopTicket?.work_description) setShopDescription(shopTicket.work_description);
      }
    } catch { /* silent */ }
  }, [isHelper]);

  const handleCompleteShopTicket = async () => {
    if (!activeShopTicket) return;
    setCompletingShop(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/helper-work-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          is_shop_ticket: true,
          work_description: shopDescription.trim() || 'Shop work',
          complete: true,
        }),
      });

      setActiveShopTicket(null);
      setShopDescription('');
    } catch (err) {
      console.error('Error completing shop ticket:', err);
    } finally {
      setCompletingShop(false);
    }
  };

  useEffect(() => {
    fetchJobs(selectedDate);
  }, [selectedDate, fetchJobs]);

  useEffect(() => {
    checkLongDurationJobs();
    fetchContinuingProjects();
  }, [checkLongDurationJobs, fetchContinuingProjects]);

  useEffect(() => {
    fetchShopTicket();
  }, [fetchShopTicket]);

  // Realtime subscription + polling fallback: auto-refresh when admin updates schedule
  useEffect(() => {
    if (!userId) return;

    // 1. Supabase realtime — fires instantly when admin hits "Update Schedule"
    const channel = supabase
      .channel(`schedule-updates-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'schedule_notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const type = payload.new && (payload.new as any).type;
          if (type === 'schedule_updated' || type === 'job_assigned') {
            fetchJobs(selectedDate);
            setScheduleUpdatedBanner(true);
            setTimeout(() => setScheduleUpdatedBanner(false), 8000);
          }
        }
      )
      .subscribe();

    // 2. Polling fallback every 30 seconds — catches any missed realtime events
    const pollInterval = setInterval(() => {
      fetchJobs(selectedDate);
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [userId, selectedDate, fetchJobs]);

  if (loading && jobs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-white/60 text-lg font-medium">Loading your schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618]">
      {/* Header */}
      <div className="bg-white dark:bg-white/5 border-b border-gray-200 dark:border-white/10 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 rounded-xl border border-gray-200 dark:border-white/10 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-white/80" />
            </Link>
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                {isHelper ? 'My Schedule' : 'My Schedule'}
              </h1>
              <p className="text-gray-500 dark:text-white/60 text-xs">
                {isHelper ? 'Team member duties for the day' : 'Dispatched job tickets'}
              </p>
            </div>
            {isHelper && (
              <span className="text-xs px-2.5 py-1 bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg font-semibold">
                Team Member
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 pb-24 max-w-lg">
        {/* Notification Banner */}
        <NotificationBanner />

        {/* Schedule Updated Banner */}
        {scheduleUpdatedBanner && (
          <div className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-3 shadow-sm">
            <RefreshCw className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-sm font-medium flex-1">Your schedule was updated — jobs have been refreshed.</span>
            <button
              onClick={() => setScheduleUpdatedBanner(false)}
              className="text-blue-400 hover:text-blue-600 transition-colors"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Continuing Projects (on_hold / in_progress from past dates) */}
        {continuingProjects.length > 0 && (
          <div className="mb-5 bg-purple-50 border-2 border-purple-200 rounded-2xl overflow-hidden shadow-md">
            <div className="flex items-center gap-3 px-4 py-3 bg-purple-600">
              <PauseCircle className="w-5 h-5 text-white" />
              <h3 className="text-sm font-bold text-white">
                Continuing Projects ({continuingProjects.length})
              </h3>
            </div>
            <div className="divide-y divide-purple-100">
              {continuingProjects.map((job: any) => (
                <div key={job.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${job.status === 'on_hold' ? 'bg-purple-500' : 'bg-orange-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{job.customer_name}</p>
                    <p className="text-xs text-slate-500 truncate">{job.job_number} &bull; {job.address || job.location || 'No address'}</p>
                    {job.status === 'on_hold' && job.pause_reason && (
                      <p className="text-xs text-purple-600 mt-0.5 truncate">Hold: {job.pause_reason}</p>
                    )}
                    {job.status === 'on_hold' && job.return_date && (
                      <p className="text-xs text-purple-500">Return: {job.return_date}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      job.status === 'on_hold' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {job.status === 'on_hold' ? 'On Hold' : 'In Progress'}
                    </span>
                    <a
                      href={`/dashboard/my-jobs/${job.id}`}
                      className="text-xs text-purple-600 font-semibold flex items-center gap-0.5 hover:text-purple-800"
                    >
                      <PlayCircle className="w-3 h-3" />
                      Resume
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Day Navigator */}
        <div className="mb-5">
          <DayNavigator
            selectedDate={selectedDate}
            onChange={setSelectedDate}
            hasLongDurationJob={hasLongDurationJob}
          />
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={() => { setError(null); fetchJobs(selectedDate); }} className="text-sm font-semibold text-red-600 hover:text-red-800 transition-colors">
              Retry
            </button>
          </div>
        )}

        {/* Job Tickets */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-200 dark:border-white/10 p-10 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Inbox className="w-8 h-8 text-gray-400 dark:text-white/60" />
            </div>
            <h3 className="text-lg font-bold text-gray-700 dark:text-white/80 mb-2">No jobs for this day</h3>
            <p className="text-sm text-gray-500 dark:text-white/60">
              {selectedDate === toDateString(new Date())
                ? 'Check back later — your schedule may not be dispatched yet.'
                : 'No jobs are scheduled for this date.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <JobTicketCard key={job.id} job={job} />
            ))}
          </div>
        )}

        {/* Active Shop Ticket (helpers only) */}
        {isHelper && activeShopTicket && selectedDate === toDateString(new Date()) && (
          <div className="mt-4 bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 dark:text-white">Working in Shop</h3>
                <p className="text-xs text-amber-700 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Started {new Date(activeShopTicket.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <textarea
              value={shopDescription}
              onChange={(e) => setShopDescription(e.target.value)}
              placeholder="Describe shop work..."
              rows={2}
              className="w-full px-3 py-2 border border-amber-300 dark:border-white/10 rounded-xl text-gray-900 dark:text-white dark:bg-white/5 placeholder-gray-400 dark:placeholder-white/40 focus:border-amber-500 focus:ring-1 focus:ring-amber-200 outline-none text-sm resize-none mb-3"
            />
            <button
              onClick={handleCompleteShopTicket}
              disabled={completingShop}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {completingShop ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Complete Shop Work
            </button>
          </div>
        )}

        {/* Job Count */}
        {jobs.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-400 dark:text-white/40 font-medium">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''} for this day
          </div>
        )}
      </div>
    </div>
  );
}
