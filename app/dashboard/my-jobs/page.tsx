'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Inbox, Briefcase, Building2, CheckCircle2, Clock, AlertCircle, PauseCircle, PlayCircle, RefreshCw, ChevronDown, ChevronUp, ChevronRight, History, Star, HardHat } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import DayNavigator from './_components/DayNavigator';
import JobTicketCard, { type JobTicketData } from './_components/JobTicketCard';
import NotificationBanner from './_components/NotificationBanner';
import { useVisiblePoll } from '@/lib/hooks/useVisiblePoll';
import SubmitRatingModal from './_components/SubmitRatingModal';
import { formatMaybeDateTime } from '@/lib/dates';
import { getCardPermission } from '@/lib/rbac';
import { resolveScheduleBanners, type DispatchBannerStatus } from '@/lib/schedule-banners';

interface PendingRating {
  ratee: { id: string; name: string; role: string };
  job: { id: string; job_number: string; scheduled_date: string; customer_name: string };
  form_id: string;
  form_title: string;
  /** Comes back WITH the prompt. Fetching these separately from the admin
   *  rating-forms route 403'd for every operator and silently disabled the
   *  Rate button — see the comment in app/api/ratings/pending/route.ts. */
  questions: any[];
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function MyJobsPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(toDateString(new Date()));
  const [jobs, setJobs] = useState<JobTicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('operator');
  const [userId, setUserId] = useState<string>('');
  const [continuingProjects, setContinuingProjects] = useState<any[]>([]);
  const [multiDayScheduled, setMultiDayScheduled] = useState<any[]>([]);
  const [activeShopTicket, setActiveShopTicket] = useState<any>(null);

  // ── ONE JOB, ONE CARD ────────────────────────────────────────────────────
  // This screen builds THREE lists — today's schedule, multi-day carryover and
  // continuing projects — and each only deduped against ITSELF. So a job could
  // legitimately qualify for two of them and the operator saw the SAME job
  // twice (Aiden, Aug 2026: two tickets for one job). Now the day's schedule
  // wins and the secondary lists only ever show what it does NOT already
  // contain.
  const shownJobIds = new Set(jobs.map((j) => j.id));
  const visibleSpanCarryover = multiDayScheduled.filter((j: any) => !shownJobIds.has(j.id));
  const visibleOpenJobs = continuingProjects.filter(
    (j: any) => !shownJobIds.has(j.id) && !visibleSpanCarryover.some((m: any) => m.id === j.id)
  );

  // ── ONE LIST OF UNFINISHED WORK, NO "MULTI-DAY" ANYWHERE ─────────────────
  // Founder, Aug 2026: "remove multiday notification for operators — if they
  // have a job lasting longer they don't need to know and we can remove that."
  //
  // But the amber "Multi-Day In Progress" panel could NOT simply be deleted,
  // because for one shape of job it was the only door left. Trace it:
  //   • /api/job-orders?scheduled_date=D paints a job on EVERY day of its span
  //     when is_multi_day is true — so on day 2, 3, 4 the job arrives in
  //     `jobs` and renders as a normal ticket. That is the ordinary path and it
  //     never depended on this panel (which deduped those rows out anyway).
  //   • A job that OVERRUNS its booked end_date, though, stops matching that
  //     span query while still sitting at `scheduled`. And the Continuing
  //     Projects fetch explicitly excludes `is_multi_day === true` from its
  //     stale-singles bucket. So that job appeared in exactly one place on the
  //     whole screen: the amber panel. Delete the panel and a crew standing on
  //     the job could not open it.
  // So the panel's ROWS survive; only its language dies. They fold into
  // Continuing Projects, which is the same idea in plainer words — and which
  // already got the dark-mode contrast fix and full-row 64px tap targets the
  // amber card never had.
  //
  // AND THE ONE THING THAT DOES *NOT* CHANGE FOR THEM: the amber panel rendered
  // UNCONDITIONALLY, so an overrun job sat on screen BESIDE the red dispatch
  // banner. Continuing Projects is banner-gated. Folding these rows in without
  // an exemption would have put the one job shape with no other door behind a
  // banner that, for the operators who have such a job, is unread every single
  // day (live unread counts: 16, 13, 9, 7, 5, 4, 3, 3, 2 — a new dispatch adds
  // a new unread row daily, and the banner only clears the ids it fetched). So
  // `visibleSpanCarryover` — and ONLY that slice — is exempt from the
  // one-surface-at-a-time rule; see `spanCarryoverCount` in
  // lib/schedule-banners.ts for why widening it to the whole card would undo
  // the founder's decision.
  const visibleContinuing = [...visibleSpanCarryover, ...visibleOpenJobs];

  // ── ONE SURFACE AT A TIME ────────────────────────────────────────────────
  // Founder, Aug 16: "remove that notification in bright red — have one or the
  // other. After they click X on the notification then show continuing
  // projects. Both showing up at once takes up a lot of space."
  //
  // NotificationBanner reports whether it owns the slot; the rule (and the
  // reason 'checking' is not the same as 'no banner') lives in
  // lib/schedule-banners.ts. A banner the operator NEVER received must never
  // withhold Continuing Projects — there would be nothing to dismiss.
  const [dispatchStatus, setDispatchStatus] = useState<DispatchBannerStatus>('checking');
  const { showContinuingProjects } = resolveScheduleBanners({
    dispatchStatus,
    continuingCount: visibleContinuing.length,
    spanCarryoverCount: visibleSpanCarryover.length,
  });
  const [completingShop, setCompletingShop] = useState(false);
  const [shopDescription, setShopDescription] = useState('');
  const [scheduleUpdatedBanner, setScheduleUpdatedBanner] = useState(false);
  const [pastJobs, setPastJobs] = useState<any[]>([]);
  const [pastJobsOpen, setPastJobsOpen] = useState(false);
  const [pastJobsLoading, setPastJobsLoading] = useState(false);
  const [doneTodayMap, setDoneTodayMap] = useState<Record<string, boolean>>({});
  // jobId → true when THIS user (as a helper) already submitted today's work
  // log. Drives the "Tap to submit your work log" prompt on helper cards.
  const [helperLogMap, setHelperLogMap] = useState<Record<string, boolean>>({});

  // Peer ratings
  const [pendingRatings, setPendingRatings] = useState<PendingRating[]>([]);
  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [ratingModalItem, setRatingModalItem] = useState<PendingRating | null>(null);
  const [dismissedRatings, setDismissedRatings] = useState<Set<string>>(new Set());

  /**
   * Role-based. Drives the shop-ticket panel, which genuinely belongs to the
   * apprentice role rather than to any one job.
   */
  const isHelper = userRole === 'apprentice';

  /**
   * Whether to frame this screen as a team member's.
   *
   * WHY (founder, Aug 7): an apprentice can be put in the OPERATOR slot — "sometimes
   * we test helpers... if I assign them as operators I would like them to have to do
   * operator workflow." The ticket itself already honours that, because it branches on
   * SLOT not role. This header did not: it read the role alone, so Javier leading a job
   * was still told "Team member duties for the day" and badged Team Member while running
   * the full operator ticket. If any job in view has them in the operator slot, they are
   * operating today — say so.
   */
  const showTeamMemberFraming =
    isHelper && (jobs.length === 0 || jobs.every((j: any) => j.isHelper));

  /**
   * This viewer's home is the MANAGEMENT dashboard, not this one.
   *
   * Gated on the same `operator_view` card permission that puts the "Open
   * Operator View" card on their dashboard, so the door and the way back can
   * never disagree — change the preset in lib/rbac.ts and both follow.
   */
  const isManagementViewer =
    !!userRole && getCardPermission(null, 'operator_view', userRole) !== 'none';

  // Check which of today's jobs have a "Done for Today" log (day_completed_at set today)
  const fetchDoneTodayStatus = useCallback(async (jobList: any[]) => {
    if (!jobList.length) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const today = toDateString(new Date());
      const map: Record<string, boolean> = {};

      await Promise.all(
        jobList.map(async (job: any) => {
          try {
            const res = await fetch(`/api/job-orders/${job.id}/daily-log`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (res.ok) {
              const json = await res.json();
              const logs: any[] = json.logs || [];
              const hasTodayLog = logs.some(
                (l: any) => l.log_date === today && l.day_completed_at != null
              );
              if (hasTodayLog) map[job.id] = true;
            }
          } catch {
            // silent per job
          }
        })
      );

      setDoneTodayMap(map);
    } catch {
      // silent
    }
  }, []);

  // One request for all of today's helper work logs (the endpoint is scoped to
  // the caller), so each helper card can say whether it still needs a log.
  const fetchHelperLogStatus = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/helper-work-log?all_today=true', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      const map: Record<string, boolean> = {};
      for (const log of json.data || []) {
        if (log.job_order_id) map[log.job_order_id] = !!log.completed_at;
      }
      setHelperLogMap(map);
    } catch {
      // silent — the card just falls back to no prompt
    }
  }, []);

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
        `/api/job-orders?scheduled_date=${date}&include_helper_jobs=true&includeCompleted=true&as=operator`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const uid = session.user.id;
          setUserId(uid);
          const role = json.user_role || 'operator';
          if (json.user_role) setUserRole(role);

          // Visibility is keyed on the CREW SLOT, not the person's role
          // (founder Jul 14 bug): an operator assigned to the HELPER slot on
          // another crew's job was filtered out and never saw the ticket.
          // If you're in either slot, you're on the crew → you see it.
          // On-crew = either slot OR crewed on the job (the server already scoped
          // the list to jobs the user is on, incl. job_crew, and set
          // viewer_is_helper — so keep every returned row, don't re-filter it out).
          const uidRef = uid;
          // viewer_is_daily = the per-day assignment ledger maps this user to
          // the job for this date (e.g. day-2 operator of a multi-day job
          // before assigned_to syncs over) — keep those rows too.
          const onCrew = (j: any) =>
            j.assigned_to === uidRef || j.helper_assigned_to === uidRef || j.viewer_is_helper === true || j.viewer_is_co_operator === true || j.viewer_is_daily === true;
          const visible = ((json.data || []) as any[]).filter(onCrew);

          const enriched = visible.map((j: any) => ({
            ...j,
            isHelper: j.viewer_is_helper ?? (j.helper_assigned_to === uid && j.assigned_to !== uid),
          }));
          setJobs(enriched);
          // Fetch done-for-today status when viewing today's schedule
          if (date === toDateString(new Date())) {
            fetchDoneTodayStatus(enriched);
            if (enriched.some((j: any) => j.isHelper)) fetchHelperLogStatus();
          }
        }
      }
    } catch (err) {
      console.error('Error fetching schedule:', err);
      setError('Failed to load your schedule. Pull down to retry.');
    } finally {
      setLoading(false);
    }
  }, [router, fetchDoneTodayStatus, fetchHelperLogStatus]);

  // (Removed Aug 11) The 7-day lookahead that fed DayNavigator's forward arrow.
  // The queue now stops at today, so there is nothing to look ahead for — and
  // this was one network round-trip on every load to decide whether to show
  // days the operator should never have been offered. See DayNavigator.

  // Fetch on_hold and in_progress jobs from past dates (continuing projects)
  const fetchContinuingProjects = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const today = toDateString(new Date());

      // Fetch on_hold, in_progress, pending_completion, scheduled (multi-day
      // reset), assigned + in_route (unfinished tickets from past days —
      // founder Jul 20: forgot-to-complete tickets must stay visible so the
      // clock-out reminder has a landing place and late completion works)
      const authH = { headers: { Authorization: `Bearer ${session.access_token}` } };
      const [onHoldRes, inProgressRes, pendingCompletionRes, scheduledRes, assignedRes, inRouteRes] = await Promise.all([
        fetch(`/api/job-orders?status=on_hold&include_helper_jobs=true&includeCompleted=false&as=operator`, authH),
        fetch(`/api/job-orders?status=in_progress&include_helper_jobs=true&includeCompleted=false&as=operator`, authH),
        fetch(`/api/job-orders?status=pending_completion&include_helper_jobs=true&includeCompleted=false&as=operator`, authH),
        fetch(`/api/job-orders?status=scheduled&include_helper_jobs=true&includeCompleted=false&as=operator`, authH),
        fetch(`/api/job-orders?status=assigned&include_helper_jobs=true&includeCompleted=false&as=operator`, authH),
        fetch(`/api/job-orders?status=in_route&include_helper_jobs=true&includeCompleted=false&as=operator`, authH),
      ]);

      const onHoldData = onHoldRes.ok ? (await onHoldRes.json()).data || [] : [];
      const inProgressData = inProgressRes.ok ? (await inProgressRes.json()).data || [] : [];
      const pendingCompletionData = pendingCompletionRes.ok ? (await pendingCompletionRes.json()).data || [] : [];
      const scheduledData = scheduledRes.ok ? (await scheduledRes.json()).data || [] : [];
      const assignedData = assignedRes.ok ? (await assignedRes.json()).data || [] : [];
      const inRouteData = inRouteRes.ok ? (await inRouteRes.json()).data || [] : [];
      // Past-date single-day jobs that never got completed count as continuing
      // work too (multi-day resets keep their own dedicated card below).
      const staleSingles = [...assignedData, ...inRouteData, ...scheduledData.filter((j: any) => j.is_multi_day !== true)];

      // Combine, filter to past dates only (don't double-show today's jobs)
      const uid = session.user.id;
      // Slot-based, not role-based (see today-list note): on-crew in either slot
      // OR crewed on the job (viewer_is_helper from the server).
      const isPrimaryOrHelper = (j: any) =>
        j.assigned_to === uid || j.helper_assigned_to === uid || j.viewer_is_helper === true || j.viewer_is_co_operator === true;
      const all = [...onHoldData, ...inProgressData, ...pendingCompletionData, ...staleSingles].filter((j: any) => {
        const isPastDate = j.scheduled_date && j.scheduled_date < today;
        return isPrimaryOrHelper(j) && isPastDate;
      });

      // Deduplicate by id
      const seen = new Set<string>();
      const unique = all.filter((j: any) => { if (seen.has(j.id)) return false; seen.add(j.id); return true; });

      setContinuingProjects(unique);

      // Multi-day jobs in scheduled status (reset after "Done for Today") assigned to this user.
      //
      // `j.scheduled_date <= today` matters: these six status queries carry no
      // date at all, so the server's "the crew queue stops at today" guard —
      // which only fires on a scheduled_date param — cannot see them. Without
      // this, a multi-day job that has not STARTED yet (Parkk runs to Sep 3)
      // rendered in the amber "Multi-Day In Progress" panel on the default
      // view, which is the very phantom the day clamp was meant to remove.
      // A job that hasn't begun is not in progress.
      const multiDay = scheduledData.filter((j: any) =>
        isPrimaryOrHelper(j) &&
        j.is_multi_day === true &&
        (!j.scheduled_date || j.scheduled_date <= today)
      );
      const seenMulti = new Set<string>();
      const uniqueMulti = multiDay.filter((j: any) => { if (seenMulti.has(j.id)) return false; seenMulti.add(j.id); return true; });
      setMultiDayScheduled(uniqueMulti);
    } catch {
      // silent
    }
  }, []);

  // Fetch completed/pending_completion jobs from the past 7 days
  const fetchPastJobs = useCallback(async () => {
    setPastJobsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = toDateString(cutoff);

      const res = await fetch(
        `/api/job-orders?includeCompleted=true&include_helper_jobs=true&date_from=${cutoffStr}&as=operator`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (res.ok) {
        const json = await res.json();
        const uid = session.user.id;
        const completed = (json.data || []).filter((j: any) => {
          const isAssigned = j.assigned_to === uid || j.helper_assigned_to === uid || j.viewer_is_helper === true || j.viewer_is_co_operator === true;
          const isCompletedStatus = j.status === 'completed' || j.status === 'pending_completion';
          return isAssigned && isCompletedStatus;
        });
        // Sort newest first
        completed.sort((a: any, b: any) => {
          const aDate = a.work_completed_at || a.scheduled_date || '';
          const bDate = b.work_completed_at || b.scheduled_date || '';
          return bDate.localeCompare(aDate);
        });
        setPastJobs(completed);
      }
    } catch {
      // silent
    } finally {
      setPastJobsLoading(false);
    }
  }, []);

  // Fetch pending peer ratings
  const fetchPendingRatings = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/ratings/pending', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      const pending: PendingRating[] = json.data ?? [];
      // A prompt with no questions is a button that does nothing. Drop it
      // rather than showing the crew a Rate button that opens an empty form.
      setPendingRatings(pending.filter((p) => Array.isArray(p.questions) && p.questions.length > 0));
    } catch {
      // silent — ratings are optional feature
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
    fetchContinuingProjects();
    fetchPastJobs();
    fetchPendingRatings();
  }, [fetchContinuingProjects, fetchPastJobs, fetchPendingRatings]);

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

    // Realtime is the primary path. Polling fallback now lives in the
    // useVisiblePoll hook below — paused when the tab is hidden + longer
    // interval (3 min) since Realtime should catch most updates.
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, selectedDate, fetchJobs]);

  // Polling fallback (2 min) — only fires while the tab is visible.
  // Backstop for missed Realtime events; not the primary refresh path.
  useVisiblePoll(() => fetchJobs(selectedDate), { intervalMs: 180_000 });

  // ── Same-day sequencing (Aug 2026): an operator can hold 2+ jobs a day,
  // ordered by day_sequence (from the per-day assignment ledger). The list
  // sorts by sequence; a later job renders visually LOCKED until the earlier
  // one is done for the day (server enforces via a 403 sequence_block on the
  // status route — this is the matching UI affordance).
  const isDoneForDay = (j: any) =>
    j.status === 'completed' || !!j.work_completed_at || !!doneTodayMap[j.id];
  const mySequencedJobs = jobs
    .filter((j: any) => j.assigned_to === userId && j.day_sequence != null)
    .sort((a: any, b: any) => (a.day_sequence ?? 1) - (b.day_sequence ?? 1));
  const showSequence = mySequencedJobs.length > 1;
  const firstIncompleteSeqJob = showSequence
    ? mySequencedJobs.find((j: any) => !isDoneForDay(j)) || null
    : null;
  const sequenceLockFor = (j: any) =>
    showSequence &&
    firstIncompleteSeqJob &&
    selectedDate === toDateString(new Date()) &&
    j.assigned_to === userId &&
    j.day_sequence != null &&
    (j.day_sequence ?? 1) > (firstIncompleteSeqJob.day_sequence ?? 1)
      ? firstIncompleteSeqJob
      : null;
  const sortedJobs = showSequence
    ? [...jobs].sort((a: any, b: any) => (a.day_sequence ?? 99) - (b.day_sequence ?? 99))
    : jobs;

  if (loading && jobs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand mx-auto mb-4" />
          <p className="text-gray-600 dark:text-white/60 text-lg font-medium">Loading your schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618]">
      {/* Header */}
      <div className="bg-white dark:bg-white/5 border-b border-gray-200 dark:border-white/10 sticky top-0 z-10 shadow-sm pt-safe">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          {/* The way back for someone wearing two hats.
              The founder (operations_manager) and David (supervisor) both run
              jobs of their own and reach this screen from the "Open Operator
              View" card. Without a named exit, the only route back to the
              management side is an unlabelled arrow — so say it plainly. */}
          {isManagementViewer && (
            <Link
              href="/dashboard/admin"
              className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-sky-200 dark:border-sky-800/50 bg-sky-50 dark:bg-sky-900/20 px-3 py-2.5 transition-colors hover:bg-sky-100 dark:hover:bg-sky-900/40"
            >
              <span className="flex items-center gap-2 min-w-0">
                <HardHat className="h-4 w-4 flex-shrink-0 text-sky-600 dark:text-sky-400" />
                <span className="truncate text-xs font-semibold text-sky-800 dark:text-sky-300">
                  You&apos;re in operator view
                </span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-1 text-xs font-bold text-sky-700 dark:text-sky-300">
                Back to management
                <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
              </span>
            </Link>
          )}

          <div className="flex items-center gap-3">
            <Link
              href={isManagementViewer ? '/dashboard/admin' : '/dashboard'}
              className="p-2 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 rounded-xl border border-gray-200 dark:border-white/10 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-white/80" />
            </Link>
            <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-brand" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">My Schedule</h1>
              <p className="text-gray-500 dark:text-white/60 text-xs">
                {showTeamMemberFraming ? 'Team member duties for the day' : 'Dispatched job tickets'}
              </p>
            </div>
            {showTeamMemberFraming && (
              <span className="text-xs px-2.5 py-1 bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg font-semibold">
                Team Member
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 pb-24 max-w-lg">
        {/* Notification Banner — owns the top of the screen while unread. */}
        <NotificationBanner onStatusChange={setDispatchStatus} />

        {/* Schedule Updated Banner */}
        {scheduleUpdatedBanner && (
          <div className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-3 shadow-sm">
            <RefreshCw className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-sm font-medium flex-1">Your schedule was updated — jobs have been refreshed.</span>
            <button
              onClick={() => setScheduleUpdatedBanner(false)}
              className="p-2 -mr-2 text-blue-400 hover:text-blue-600 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* (Removed Aug 2026) The amber "Multi-Day In Progress (N)" panel, its
            "Multi-Day" chip and its "Up next: Day N" line. Its rows did not go
            anywhere — see the fold into `visibleContinuing` at the top of this
            file, and the note there explaining which job shape depended on it. */}

        {/* ── Continuing Projects (on_hold / in_progress from past dates) ────
            DARK MODE WAS UNREADABLE (founder, Aug 16): "make continuing
            projects easier to see in dark mode". The card had NO dark variants
            at all, and its surface was `bg-brand/5` — a tenant-brand tint,
            which over the #0b0618 page renders near-black. So the job name sat
            at text-slate-800 (#1e293b) on roughly #150819: about 1.3:1, i.e.
            invisible. Meanwhile the pill and the Resume link were text-brand
            (Patriot red) — the loudest things on the card were the two least
            important. The hierarchy was upside down.

            The fix, and why it is written this way for EVERY tenant: in dark
            mode the type is neutral (white at graded opacity), never the brand
            colour. Brand red on a dark surface is ~3.9:1 and fails AA — and a
            tenant is free to pick any primary, so a brand-coloured label can
            never be guaranteed legible. Brand identity is carried by the solid
            header band and the status dot, where it is a background and safe.
            Job name: white on the dark card = 18.6:1. Meta line: white/70 =
            9.4:1. Both clear AA (4.5:1) with room for a sunlit screen.

            The whole row is now the link, so the tap target is the full ~64px
            row instead of a 32px text link — one-handed, with gloves. */}
        {showContinuingProjects && (
          <div className="mb-5 rounded-2xl overflow-hidden shadow-md border-2 border-brand/30 dark:border-white/15 bg-brand/5 dark:bg-white/[0.04]">
            <div className="flex items-center gap-3 px-4 py-3 bg-brand">
              <PauseCircle className="w-5 h-5 text-white" />
              <h3 className="text-sm font-bold text-white">
                {/* The DEDUPED count. `continuingProjects.length` counted jobs
                    already shown as today's ticket, so the header could claim
                    (2) above a single row. */}
                Continuing Projects ({visibleContinuing.length})
              </h3>
            </div>
            <div className="divide-y divide-brand/10 dark:divide-white/10">
              {visibleContinuing.map((job: any) => (
                <Link
                  key={job.id}
                  href={`/dashboard/my-jobs/${job.id}`}
                  className="flex items-center gap-3 px-4 py-3 min-h-[64px] transition-colors hover:bg-brand/5 dark:hover:bg-white/[0.06] active:bg-brand/10 dark:active:bg-white/10"
                >
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    job.status === 'on_hold' ? 'bg-brand' :
                    job.status === 'scheduled' ? 'bg-slate-400' :
                    'bg-orange-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    {/* THE JOB NAME IS THE POINT OF THE CARD — biggest, boldest,
                        highest contrast element in the row. */}
                    <p className="text-[15px] font-bold leading-tight truncate text-slate-900 dark:text-white">
                      {job.customer_name}
                    </p>
                    <p className="text-[13px] leading-snug mt-0.5 truncate text-slate-600 dark:text-white/70">
                      {job.job_number} &bull; {job.address || job.location || 'No address'}
                    </p>
                    {job.status === 'on_hold' && job.pause_reason && (
                      <p className="text-[13px] leading-snug mt-0.5 truncate text-slate-600 dark:text-white/70">
                        Hold: {job.pause_reason}
                      </p>
                    )}
                    {/* slate-500 here was 4.40:1 on the tinted card — a hair
                        under AA. slate-600 clears it at 7.01:1. */}
                    {job.status === 'on_hold' && job.return_date && (
                      <p className="text-[13px] leading-snug truncate text-slate-600 dark:text-white/65">
                        Return: {job.return_date}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    {/* Kept at 12px, not shrunk further: the pill is secondary
                        but still has to be readable in sunlight. The hierarchy
                        is carried by the 15px bold name above it, not by
                        making the status too small to read.

                        'scheduled' IS ITS OWN CASE, not a fallthrough. This
                        list gained the span-carryover rows in Aug 2026 and
                        those are `scheduled` — JOB-2026-160762 has never been
                        started. The old else-branch told the crew a job was
                        "In Progress" when nobody had touched it, which is a
                        phone call to the office. */}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${
                      job.status === 'on_hold' ? 'bg-brand/10 text-brand-dark dark:bg-white/10 dark:text-white/80' :
                      job.status === 'pending_completion' ? 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200' :
                      job.status === 'scheduled' ? 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-white/80' :
                      'bg-orange-100 text-orange-700 dark:bg-amber-400/15 dark:text-amber-200'
                    }`}>
                      {job.status === 'on_hold' ? 'On Hold' :
                       job.status === 'pending_completion' ? 'Awaiting' :
                       job.status === 'scheduled' ? 'Not Started' :
                       'In Progress'}
                    </span>
                    {/* Affordance only — the row itself is the link. Same
                        reason as the pill: you cannot "Resume" a job nobody
                        has started. */}
                    <span className="text-[13px] font-semibold flex items-center gap-1 text-brand-dark dark:text-white/90">
                      <PlayCircle className="w-4 h-4" />
                      {job.status === 'scheduled' ? 'Open' : 'Resume'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Day Navigator */}
        <div className="mb-5">
          <DayNavigator
            selectedDate={selectedDate}
            onChange={setSelectedDate}
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
            {sortedJobs.map((job: any) => {
              const lockedBy = sequenceLockFor(job);
              const showSeqBadge = showSequence && job.assigned_to === userId && job.day_sequence != null;
              return (
                <div key={job.id}>
                  {showSeqBadge && (
                    <div className="flex items-center gap-2 mb-1.5 px-1">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-500/40">
                        Job #{job.day_sequence} of your day
                      </span>
                      {lockedBy && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 border border-slate-300 dark:border-white/20">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                          Complete {lockedBy.job_number} first
                        </span>
                      )}
                    </div>
                  )}
                  <div className={lockedBy ? 'opacity-60 saturate-50' : ''}>
                    <JobTicketCard
                      job={job}
                      doneToday={!!doneTodayMap[job.id]}
                      helperLogSubmitted={
                        job.isHelper && selectedDate === toDateString(new Date())
                          ? !!helperLogMap[job.id]
                          : undefined
                      }
                    />
                  </div>
                </div>
              );
            })}
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

        {/* Past 7 Days — Completed Jobs */}
        <div className="mt-6 mb-2">
          <button
            onClick={() => setPastJobsOpen((o) => !o)}
            className="w-full flex items-center gap-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 shadow-sm hover:bg-gray-50 dark:hover:bg-white/10 transition-all"
            aria-expanded={pastJobsOpen}
          >
            <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
              <History className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 text-left">
              <span className="text-sm font-bold text-gray-800 dark:text-white">Past 7 Days</span>
              {!pastJobsLoading && pastJobs.length > 0 && (
                <span className="ml-2 text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full font-semibold border border-emerald-200 dark:border-emerald-700">
                  {pastJobs.length}
                </span>
              )}
            </div>
            {pastJobsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-white/40" />
            ) : pastJobsOpen ? (
              <ChevronUp className="w-4 h-4 text-gray-400 dark:text-white/40" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400 dark:text-white/40" />
            )}
          </button>

          {pastJobsOpen && (
            <div className="mt-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
              {pastJobs.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400 dark:text-white/40">
                  No completed jobs in the past 7 days.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-white/10">
                  {pastJobs.map((job: any) => (
                    // MUST be next/link, NOT a raw <a>. A bare anchor is a FULL
                    // page navigation, and inside the iOS/Android webview that
                    // can hop the operator out into Safari — which is exactly
                    // what happened to Lucas when he opened a past job. Link
                    // keeps it in the app's own router. (CLAUDE.md documents
                    // this: navigate IN the webview, never window-level.)
                    <Link
                      key={job.id}
                      href={`/dashboard/my-jobs/${job.id}?view=history`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                          {job.customer_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-white/50 truncate">
                          {job.job_number}
                          {(job.work_completed_at || job.scheduled_date) && (
                            <> &bull; {formatMaybeDateTime(
                              job.work_completed_at || job.scheduled_date,
                              '—',
                              { month: 'short', day: 'numeric', year: 'numeric' }
                            )}</>
                          )}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold border ${
                        job.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700'
                          : 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'
                      }`}>
                        {job.status === 'completed' ? 'Completed' : 'Pending'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-white/30 flex-shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rate Your Crew — shown when there are pending ratings */}
        {(() => {
          const visibleRatings = pendingRatings.filter(
            (p) => !dismissedRatings.has(`${p.form_id}:${p.ratee.id}:${p.job.id}`)
          );
          if (visibleRatings.length === 0) return null;
          return (
            <div className="mt-4 mb-2">
              <button
                onClick={() => setRatingsOpen((o) => !o)}
                className="w-full flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl px-4 py-3 shadow-sm hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all"
                aria-expanded={ratingsOpen}
              >
                <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Star className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <span className="text-sm font-bold text-amber-800 dark:text-amber-300">Rate Your Crew</span>
                  <span className="ml-2 text-xs px-2 py-0.5 bg-amber-200 dark:bg-amber-700 text-amber-800 dark:text-amber-200 rounded-full font-semibold">
                    {visibleRatings.length}
                  </span>
                </div>
                {ratingsOpen ? (
                  <ChevronUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                )}
              </button>

              {ratingsOpen && (
                <div className="mt-2 bg-white dark:bg-white/5 border border-amber-200 dark:border-amber-700/50 rounded-2xl overflow-hidden shadow-sm divide-y divide-amber-100 dark:divide-amber-900/40">
                  {visibleRatings.map((item) => {
                    const key = `${item.form_id}:${item.ratee.id}:${item.job.id}`;
                    return (
                      <div key={key} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {item.ratee.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{item.ratee.name}</p>
                          <p className="text-xs text-gray-500 dark:text-white/50 truncate">{item.job.job_number} &bull; {item.job.customer_name}</p>
                        </div>
                        <button
                          onClick={() => setRatingModalItem(item)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold transition-all min-h-[40px] flex-shrink-0"
                        >
                          <Star className="w-3.5 h-3.5" />
                          Rate
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Submit Rating Modal */}
      {ratingModalItem && (
        <SubmitRatingModal
          pending={ratingModalItem}
          questions={ratingModalItem.questions}
          onClose={() => setRatingModalItem(null)}
          onSubmitted={(formId, rateeId, jobId) => {
            // Hide it immediately, then re-ask the server. The local set only
            // survives this page view; the refetch is what makes "already rated"
            // still true tomorrow.
            setDismissedRatings((prev) => new Set([...prev, `${formId}:${rateeId}:${jobId}`]));
            setRatingModalItem(null);
            void fetchPendingRatings();
          }}
        />
      )}
    </div>
  );
}
