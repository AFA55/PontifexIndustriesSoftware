'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Loader2, Inbox, Briefcase } from 'lucide-react';
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
  const [userRole, setUserRole] = useState<string>('operator');
  const [userId, setUserId] = useState<string>('');
  const [hasLongDurationJob, setHasLongDurationJob] = useState(false);

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

  useEffect(() => {
    fetchJobs(selectedDate);
  }, [selectedDate, fetchJobs]);

  useEffect(() => {
    checkLongDurationJobs();
  }, [checkLongDurationJobs]);


  if (loading && jobs.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">Loading your schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Professional Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white sticky top-0 z-50 shadow-2xl">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/20 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
              <Briefcase className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-bold">
                {isHelper ? 'My Schedule' : 'My Schedule'}
              </h1>
              <p className="text-blue-200 text-xs">
                {isHelper ? 'Team member duties for the day' : 'Dispatched job tickets'}
              </p>
            </div>
            {isHelper && (
              <span className="text-xs px-2.5 py-1 bg-emerald-500/30 border border-emerald-400/30 text-emerald-200 rounded-lg font-semibold">
                Team Member
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 max-w-lg">
        {/* Notification Banner */}
        <NotificationBanner />

        {/* Day Navigator */}
        <div className="mb-5">
          <DayNavigator
            selectedDate={selectedDate}
            onChange={setSelectedDate}
            hasLongDurationJob={hasLongDurationJob}
          />
        </div>

        {/* Job Tickets */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-10 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Inbox className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-700 mb-2">No jobs for this day</h3>
            <p className="text-sm text-gray-500">
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

        {/* Job Count */}
        {jobs.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-400 font-medium">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''} for this day
          </div>
        )}
      </div>
    </div>
  );
}
