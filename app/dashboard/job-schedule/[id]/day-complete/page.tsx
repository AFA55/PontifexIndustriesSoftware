'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import {
  CheckCircle2,
  ArrowLeft,
  Clock,
  Loader2,
  AlertTriangle,
  Sun,
  Trophy,
  PenTool,
  Camera,
  Send,
  Phone,
  X,
  FileText,
  Download,
  User,
  MapPin,
  Wrench,
  ClipboardList,
  MessageSquarePlus,
  Mail,
  Heart,
  Sparkles,
  Navigation,
} from 'lucide-react';
import PhotoUploader, { PhotoViewer } from '@/components/PhotoUploader';
import EsignConsentCheckbox from '@/components/EsignConsentCheckbox';
import CustomerSatisfactionSurvey from '@/components/CustomerSatisfactionSurvey';
import JobProgressLogger from '@/components/JobProgressLogger';
import DayCloseoutChoice from '@/components/DayCloseoutChoice';
import { toLocalYMD } from '@/lib/dates';
import { displayDayNumber } from '@/lib/phase-day';
import { photosFiledThisShift, currentShiftStartMs } from '@/lib/job-photo-day';
import {
  planDayCloseout,
  CONTINUE_CONFIRMATION_REQUIRED,
  type ContinueConfirmCopy,
} from '@/lib/day-closeout';

// Shop location for "Directions back to shop". Hardcoded for now — Patriot's
// verified shop coordinates. TODO: make tenant-configurable (e.g. read from
// tenants.shop_latitude / tenants.shop_longitude) when multi-tenant shops land.
const SHOP_LAT = 34.768775733693474;
const SHOP_LNG = -82.43564252936702;

function openDirectionsToShop(provider: 'apple' | 'google') {
  const url =
    provider === 'apple'
      ? `https://maps.apple.com/?daddr=${SHOP_LAT},${SHOP_LNG}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${SHOP_LAT},${SHOP_LNG}`;
  window.open(url, '_blank');
}

export default function DayCompletePage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isAdminViewing, setIsAdminViewing] = useState(false);
  // One ticket, whole crew: crew members (co-operator or helper) never run
  // day-complete — the LEAD does. When detected, show a short message and
  // bounce back to the job ticket (server enforces this too).
  const [crewBlocked, setCrewBlocked] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [surveyMode, setSurveyMode] = useState(false);
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
  // Derived from job_orders.site_compliance.photos_prohibited (set by the
  // office on the schedule form) — operators can no longer self-exempt via a
  // local checkbox. Flag true → photo gate auto-satisfied + notice shown.
  const [photosProhibited, setPhotosProhibited] = useState(false);

  // ─── Photos ALREADY on this job this shift ───────────────────────────────
  //
  // ASKED ONCE PER JOB PER SHIFT (founder, Aug 20 2026 — Nate wanted to go back
  // to paper over exactly this). The work-performed screen uploads into the
  // same bucket and the same `job_orders.photo_urls` column this screen writes
  // to, but the gate below only ever looked at `completionPhotos` — local
  // state that starts empty on every mount. So the crew shot the work, walked
  // to this screen, and were told to shoot it again; production shows the two
  // clusters minutes (once thirty-five seconds) apart.
  //
  // These are held SEPARATELY from `completionPhotos` on purpose, and are NOT
  // loaded into the uploader. They are already saved on the job: folding them
  // into the editable list would re-POST them on submit (duplicating the array)
  // and would put an X button on them that removes nothing server-side — a lie
  // to the operator. Read-only here, editable list stays new-photos-only, so
  // the POST paths below need no change.
  //
  // (Name kept for continuity; "today" here means the SHIFT's day — see
  // fetchPhotosAlreadyToday and lib/job-photo-day.ts. A crew that shot the cut
  // at 23:50 and closes out at 00:05 is on one shift, not two days.)
  const [photosAlreadyToday, setPhotosAlreadyToday] = useState<string[]>([]);

  /** Stops two reads of the photo list overlapping (mount + a focus refetch). */
  const photosRefetching = useRef(false);
  /** `submitting`, readable from the window listeners below without re-binding. */
  const submittingRef = useRef(false);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);

  /**
   * WHAT THE CUSTOMER'S THANK-YOU EMAIL SHOWS, AND IN WHAT ORDER.
   *
   * `emails/CompletionThankYouEmail.tsx` keeps only the FIRST SIX. This list
   * used to be built chronologically — everything already on the job today,
   * then the completion shots — so a crew that filed seven in-progress photos
   * on the work log and two finished-cut photos here sent the customer six
   * mid-job photos and NONE of the finished work. The one thing the email
   * exists to show was the one thing truncated away.
   *
   * Completion photos therefore lead. Two consequences, both deliberate:
   *
   *  - The finished work can never be the part that gets cut. Whatever else
   *    happens, photo #1 is the completed cut.
   *  - The set reads "after, then before". That is the right order for this
   *    audience: the customer opens the email to see the work is done, and the
   *    in-progress shots read as supporting context behind it. (The office asked
   *    for the process photos to reach the customer — Aug 3 — so they are kept
   *    rather than dropped; they simply follow.)
   *
   * De-duplicated because a focus refetch can pull a photo this page already
   * uploaded into `photosAlreadyToday`; the customer should not see it twice.
   */
  const customerPhotoUrls = Array.from(
    new Set([...completionPhotos, ...photosAlreadyToday])
  );

  /**
   * The photo requirement, in one place, used by all three terminal actions.
   *
   * NOT weakened to nothing: photos are still required to finish a job, and
   * still required for THIS SHIFT (a day-1 photo cannot close out day 5 of a
   * multi-day job — the office bills and defends the work with these). What
   * changed is that evidence already filed on this shift COUNTS, wherever on
   * the ticket it was filed from — including the half of an overnight shift
   * that fell on yesterday's date.
   */
  const photoRequirementMet =
    photosProhibited || completionPhotos.length > 0 || photosAlreadyToday.length > 0;
  const PHOTO_REQUIRED_MESSAGE =
    'Add at least one job photo before finishing — none have been added on this job this shift.';
  const [esignConsented, setEsignConsented] = useState(false);
  const [pdfSaved, setPdfSaved] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [workPerformedItems, setWorkPerformedItems] = useState<Array<{
    type?: string; description?: string; quantity?: string | number;
    unit?: string; depth?: string | number; notes?: string;
  }>>([]);

  // ─── What the OFFICE actually booked ─────────────────────────────────────
  // The booked span — not job_orders.is_multi_day — decides whether "Done for
  // Today" is the expected action or a job-shape change that has to be
  // confirmed. is_multi_day is the field the wrong tap corrupts, so it can
  // never be the thing that authorises the next wrong tap.
  const [booking, setBooking] = useState<{
    scheduledDate: string | null;
    scheduledEndDate: string | null;
  } | null>(null);
  const [isLastScheduledDay, setIsLastScheduledDay] = useState<boolean | null>(null);
  /** Set when the SERVER refuses an unconfirmed "Done for Today" (409). */
  const [continueBlockedMessage, setContinueBlockedMessage] = useState<string | null>(null);
  /** The 409's structured copy, when it sent one — title AND body from the server. */
  const [continueBlockedCopy, setContinueBlockedCopy] = useState<ContinueConfirmCopy | null>(null);

  // `booking` is null until fetchScheduleInfo resolves (and on a fetch failure),
  // so this plan is built from nulls in that window — which reads as "the office
  // booked one day" and would put that warning in front of a genuine 8-day job.
  // planPending below suppresses the question until the dates are known; the
  // server re-evaluates the same rule against the real ones either way.
  const bookingUnknown = booking === null;
  const closeoutPlan = planDayCloseout({
    // Device-local calendar. The server evaluates the same rule in the TENANT's
    // timezone, so an out-of-town crew near midnight can disagree with it — that
    // disagreement lands as the 409 below, which is handled, so the worst case
    // is one extra question rather than a wrong write.
    today: toLocalYMD(),
    scheduledDate: booking?.scheduledDate ?? null,
    scheduledEndDate: booking?.scheduledEndDate ?? null,
  });

  // ─── Subsistence (out-of-town overnight) ─────────────────────────────────
  // Only relevant when the job is flagged out_of_town in scheduling_flexibility.
  // null = unanswered (blocks terminal actions on out-of-town jobs only).
  const [stayedOvernight, setStayedOvernight] = useState<boolean | null>(null);
  const isOutOfTown = job?.scheduling_flexibility?.out_of_town === true;
  // Out-of-town jobs require an answer before the operator can wrap up.
  const subsistenceUnanswered = isOutOfTown && stayedOvernight === null;

  // ─── Completion request modal state ──────────────────────────────────────
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // ─── Post-submission success screen state ─────────────────────────────────
  type SuccessMode = null | 'done_for_day' | 'complete';
  const [successMode, setSuccessMode] = useState<SuccessMode>(null);
  const [showSupervisorNoteForm, setShowSupervisorNoteForm] = useState(false);
  const [supervisorNote, setSupervisorNote] = useState('');
  const [supervisorNoteSubmitting, setSupervisorNoteSubmitting] = useState(false);
  const [supervisorNoteSent, setSupervisorNoteSent] = useState(false);
  const [showDirectionsChooser, setShowDirectionsChooser] = useState(false);

  // ─── Remote signature (Option 3) state ───────────────────────────────────
  const [showRemotePanel, setShowRemotePanel] = useState(false);
  const [remotePhone, setRemotePhone] = useState('');
  const [remoteSending, setRemoteSending] = useState(false);
  const [remoteSent, setRemoteSent] = useState(false);
  /** Shown INSIDE the send-link panel. A toast alone was not enough — the
   *  operator's eyes are on the button he just pressed, not the top of the
   *  screen behind a dimmed overlay. */
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteSentPhone, setRemoteSentPhone] = useState('');

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Crew gate — same redirect the jobsite + work-performed pages apply. The
  // flagged list endpoint marks viewer_is_co_operator / viewer_is_helper;
  // the raw /api/job-orders/[id] GET used by fetchJob doesn't carry flags.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(
          `/api/job-orders?id=${jobId}&include_helper_jobs=true&includeCompleted=true`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        if (!res.ok) return; // fail open here — the daily-log API still 403s
        const json = await res.json();
        const found = (json.data || [])[0];
        if (
          !cancelled &&
          found &&
          (found.viewer_is_co_operator === true || found.viewer_is_helper === true)
        ) {
          setCrewBlocked(true);
          setTimeout(() => router.replace(`/dashboard/my-jobs/${jobId}`), 2000);
        }
      } catch { /* server still enforces */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    fetchJob();
    fetchScheduleInfo();
    fetchPhotosAlreadyToday();
    // DB-first: fetch saved work items; fall back to localStorage if DB is empty
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        // SCOPED TO TODAY, AND TO ME (founder P0, Aug 14).
        //
        // This used to ask for the job's work items with no filter at all, get
        // back EVERY day and EVERY operator, load the lot into "what I did
        // today", and submit it. One-day jobs never showed it. Multi-day jobs
        // compounded: day 2 resubmitted day 1, day 3 resubmitted 1 and 2, and
        // Pratt reached 2,800 linear feet on day 3 against a real day a
        // fraction of that. Those are the numbers an invoice is built from.
        //
        // `mine=1` matters as much as the date: without it one operator's
        // day-complete resubmitted a crewmate's work under their own name.
        const today = toLocalYMD();
        const res = await fetch(
          `/api/job-orders/${jobId}/work-items?date=${today}&mine=1`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        if (res.ok) {
          const json = await res.json();
          const rows: any[] = json.data || json.items || [];
          if (rows.length > 0) {
            setWorkPerformedItems(rows.map((r: any) => ({
              type: r.work_type || r.type,
              description: r.details_json?.description || r.description,
              quantity: r.quantity,
              unit: r.unit || r.details_json?.unit,
              depth: r.cut_depth_inches || r.core_depth_inches || r.depth,
              notes: r.notes,
            })));
            return;
          }
        }
      } catch { /* fall through to localStorage */ }
      // localStorage fallback
      const stored = localStorage.getItem(`work-performed-${jobId}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setWorkPerformedItems(parsed.items || []);
        } catch { /* ignore */ }
      }
    })();
  }, [jobId]);

  // ─── A PHOTO THAT LANDS LATE MUST STILL BE SEEN ──────────────────────────
  //
  // The gate reads the job's photos once, at mount. That single read is a race
  // with the work-performed screen's write: the work log now waits for its
  // photo POST before it navigates, but a phone that was backgrounded mid-write
  // — a jobsite, weak LTE, the operator locks the screen and comes back — can
  // still land the write after this page has already made up its mind and put
  // an empty required uploader in front of him.
  //
  // So: re-read whenever the screen comes back to the front. Cheap (one small
  // GET), and it can only ever ADD photos to the list, never take the
  // requirement away.
  useEffect(() => {
    const refetch = () => {
      // Not while submitting. This page POSTs the photos it is holding; a read
      // landing between those writes would fold them into the read-only
      // "already added" list and send the customer the same photo twice.
      if (submittingRef.current) return;
      if (document.visibilityState === 'hidden') return;
      fetchPhotosAlreadyToday();
    };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', refetch);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', refetch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const fetchJob = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const res = await fetch(`/api/job-orders/${jobId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const jobData = data.data || data;
        setJob(jobData);
        // Office-set photos-prohibited flag drives the photo gate — replaces
        // the old operator-facing "photos prohibited" checkbox.
        setPhotosProhibited(jobData?.site_compliance?.photos_prohibited === true);
        // Pre-fill phone from job data
        const phone = jobData.site_contact_phone || jobData.foreman_phone || '';
        setRemotePhone(phone);
      } else {
        console.error('Failed to fetch job details:', res.status);
      }

      // Check if the current user is an admin/manager visiting this operator page
      const adminRoles = ['admin', 'super_admin', 'operations_manager'];
      const currentUser = getCurrentUser();
      if (currentUser && adminRoles.includes(currentUser.role)) {
        setIsAdminViewing(true);
      }
    } catch (err) {
      console.error('Error fetching job:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * What this job already has on file for THIS SHIFT.
   *
   * Two reads, in parallel: the job's photos, and the operator's own recent
   * clock cycles — because "today" here means the shift's day, not the phone's
   * date. `docs/plans/NIGHT_SHIFT_AND_LATE_CLOSEOUT.md`: "A shift belongs to the
   * day it STARTED." A crew that photographed the cut at 23:50 and closes out at
   * 00:05 filed those photos on THIS shift, and must not be asked again.
   *
   * DELIBERATELY NOT `/api/timecard/current`. That endpoint auto-closes any open
   * card dated before today — calling it at 00:05 would clock the operator out
   * of the overnight shift he is standing in, stamping a clock-out on a live
   * payroll row. `/api/timecard/history` is a plain read.
   *
   * FAILS OPEN — a network hiccup, a missing timecard, an operator who never
   * clocked in: every one of those leaves this at the wall-clock behaviour that
   * shipped before, which is that the operator is asked. Never the other way
   * round; a failed read must not waive the evidence requirement.
   */
  const fetchPhotosAlreadyToday = async () => {
    if (photosRefetching.current) return;
    photosRefetching.current = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const authHeaders = { Authorization: `Bearer ${session.access_token}` };

      // Yesterday and today: an overnight shift's clock-in is dated yesterday.
      // Local components, never toISOString — the recurring off-by-a-day bug.
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const shiftUrl =
        `/api/timecard/history?startDate=${toLocalYMD(yesterday)}` +
        `&endDate=${toLocalYMD()}&limit=5`;

      const [photoRes, shiftRes] = await Promise.all([
        fetch(`/api/job-orders/${jobId}/photos`, { headers: authHeaders }),
        // Its own catch: the shift read is an ENHANCEMENT. If it fails, the
        // photo gate still works on the wall clock — it must not take the
        // photo read down with it.
        fetch(shiftUrl, { headers: authHeaders }).catch(() => null),
      ]);

      if (!photoRes.ok) return;
      const json = await photoRes.json();

      let shiftStartMs: number | null = null;
      if (shiftRes?.ok) {
        const shiftJson = await shiftRes.json().catch(() => null);
        shiftStartMs = currentShiftStartMs(shiftJson?.data?.timecards);
      }

      setPhotosAlreadyToday(
        photosFiledThisShift(json?.data?.photo_urls, { shiftStartMs })
      );
    } catch {
      /* fail open — the gate simply asks, as it did before */
    } finally {
      photosRefetching.current = false;
    }
  };

  const fetchScheduleInfo = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/jobs/${jobId}/schedule-info`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        // LOCAL day — toISOString() is UTC and flips at ~8pm ET.
        const today = toLocalYMD();
        // LOAD-BEARING, and invisible here: the route already coalesces
        // `scheduled_end_date ?? end_date` (app/api/jobs/[id]/schedule-info),
        // so this single field covers the legacy multi-day column too. Drop that
        // coalesce and every legacy multi-day job starts asking to continue.
        const endDate = json.data?.scheduled_end_date ?? null;
        const scheduledDate = json.data?.scheduled_date ?? null;
        setBooking({ scheduledDate, scheduledEndDate: endDate });
        const isLast = endDate ? endDate === today : scheduledDate === today;
        setIsLastScheduledDay(isLast);
      } else {
        setBooking(null);
        setIsLastScheduledDay(null);
      }
    } catch {
      setBooking(null);
      setIsLastScheduledDay(null);
    }
  };

  const handleSubmitCompletion = async () => {
    // Same completion requirements — work log + photos (unless prohibited).
    if (workPerformedItems.length === 0) {
      setNotification({ message: 'Add what work was performed before submitting.', type: 'error' });
      return;
    }
    if (!photoRequirementMet) {
      setNotification({ message: PHOTO_REQUIRED_MESSAGE, type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/jobs/${jobId}/completion-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ operator_notes: completionNotes || null }),
      });
      if (res.ok) {
        setShowCompletionModal(false);
        setSubmitted(true);
        localStorage.removeItem(`work-performed-${jobId}`);
      } else {
        const data = await res.json();
        showNotif(data.error || 'Failed to submit completion request', 'error');
      }
    } catch (err) {
      console.error('Error submitting completion request:', err);
      showNotif('Failed to submit. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const showNotif = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Submit supervisor note after Done for Today / Complete Job
  const handleSubmitSupervisorNote = async () => {
    if (!supervisorNote.trim()) return;
    setSupervisorNoteSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`/api/job-orders/${jobId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          content: supervisorNote.trim(),
          noteType: successMode === 'complete' ? 'completion' : 'done_for_day',
        }),
      });
      setSupervisorNoteSent(true);
      setShowSupervisorNoteForm(false);
      // Redirect after 2s
      setTimeout(() => router.push('/dashboard/my-jobs'), 2000);
    } catch {
      /* non-critical */
    } finally {
      setSupervisorNoteSubmitting(false);
    }
  };


  // LATE COMPLETION (founder Jul 20): finishing a ticket after its scheduled
  // day books the work to THAT day, not the submission day. Only for jobs
  // with no prior daily logs (multi-day in-flight jobs keep normal dating).
  const lateWorkDate = (() => {
    if (!job?.scheduled_date) return undefined;
    const d = new Date();
    const localToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (job.scheduled_date < localToday && !(job.total_days_worked > 0)) return job.scheduled_date;
    return undefined;
  })();

  // Calculate hours worked today
  const getHoursWorked = () => {
    if (!job) return 0;
    const start = job.work_started_at ? new Date(job.work_started_at) :
                  job.route_started_at ? new Date(job.route_started_at) : null;
    if (!start) return 0;
    return ((Date.now() - start.getTime()) / (1000 * 60 * 60)).toFixed(1);
  };

  // ─── DONE FOR TODAY (Continue Tomorrow) ───────────────────────────────────
  //
  // `confirmed` is true only when the crew went through the confirmation in
  // DayCloseoutChoice. It is forwarded to the API so the SERVER can refuse a
  // request that never asked the question — the client's schedule read can be
  // stale, and `is_multi_day: true` is too expensive to take on trust.
  const handleDoneForToday = async (confirmed: boolean) => {
    // Required: today's work. PHOTOS ARE NOT REQUIRED TO CLOSE OUT A DAY on a
    // multi-day job (founder, Aug 3 2026) — the crew is coming back tomorrow,
    // nothing is being handed to the customer, and nobody is signing anything.
    // Photos become mandatory only on the FINAL step, when the job is actually
    // completed and the customer signs (handleSubmitCompletion below).
    if (workPerformedItems.length === 0) {
      setNotification({ message: 'Log what you did today before finishing for the day.', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (completionPhotos.length > 0) {
        try {
          await fetch(`/api/job-orders/${jobId}/photos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ photo_urls: completionPhotos })
          });
        } catch (err) {
          console.error('Photo save error:', err);
        }
      }

      const workPerformed = workPerformedItems;

      const res = await fetch(`/api/job-orders/${jobId}/daily-log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          workPerformed,
          notes: `Day complete. Continuing tomorrow.`,
          work_date: lateWorkDate,
          continueNextDay: true,
          confirm_continue_next_day: confirmed,
          latitude: null,
          longitude: null,
          stayed_overnight: stayedOvernight,
        })
      });

      if (res.ok) {
        localStorage.removeItem(`work-performed-${jobId}`);
        localStorage.removeItem(`work-draft-${jobId}`);
        setContinueBlockedMessage(null);
        setContinueBlockedCopy(null);
        setSuccessMode('done_for_day');
      } else {
        const data = await res.json();
        // The server holds the same rule and says no: this job was not booked
        // past today. Nothing was written — put the question in front of the
        // crew instead of a red toast they'd have to interpret.
        if (res.status === 409 && data?.error === CONTINUE_CONFIRMATION_REQUIRED) {
          setContinueBlockedCopy((data.confirm as ContinueConfirmCopy) ?? null);
          setContinueBlockedMessage(data.message || 'This job was not booked past today.');
          return;
        }
        showNotif(data.error || 'Failed to save daily log', 'error');
      }
    } catch (err) {
      console.error('Error saving daily log:', err);
      showNotif('Failed to save. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── JOB FULLY COMPLETE (on-site signature path) ──────────────────────────
  const handleJobComplete = async () => {
    // Required to complete: what work was performed, and job photos (unless the
    // site prohibits photos — the operator can mark that to skip).
    if (workPerformedItems.length === 0) {
      setNotification({ message: 'Add what work was performed before completing the job.', type: 'error' });
      return;
    }
    if (!photoRequirementMet) {
      setNotification({ message: PHOTO_REQUIRED_MESSAGE, type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const signatureUrl = await uploadSignature();

      if (completionPhotos.length > 0) {
        try {
          await fetch(`/api/job-orders/${jobId}/photos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ photo_urls: completionPhotos })
          });
        } catch (err) {
          console.error('Photo save error:', err);
        }
      }

      const workPerformed = workPerformedItems;

      // ── Generate & upload completion PDF ──────────────────────────────────
      let generatedPdfUrl: string | null = null;
      try {
        const pdfRes = await fetch(`/api/job-orders/${jobId}/generate-completion-pdf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            signerName: signerName || null,
            signatureDataUrl: signatureData || null,
            workPerformed,
            customer_email: customerEmail.trim() || undefined,
            // This shift's evidence, wherever on the ticket it was filed from.
            // It used to be `completionPhotos` alone, so a crew that
            // photographed the work on the work-performed screen and added
            // nothing here sent the customer a thank-you email with no photos
            // in it. Completion shots lead — the email keeps only the first six
            // and the finished work must never be what gets cut. See the
            // `customerPhotoUrls` note above.
            reference_photo_urls: customerPhotoUrls,
          }),
        });
        if (pdfRes.ok) {
          const pdfData = await pdfRes.json();
          generatedPdfUrl = pdfData.pdf_url || null;
          if (generatedPdfUrl) {
            setPdfUrl(generatedPdfUrl);
            setPdfSaved(true);
          }
        }
      } catch (pdfErr) {
        console.error('PDF generation error (non-fatal):', pdfErr);
      }

      await fetch(`/api/job-orders/${jobId}/daily-log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          work_date: lateWorkDate,
          workPerformed,
          notes: 'Final day. Job complete.',
          signerName: signerName || undefined,
          signatureData: signatureUrl || undefined,
          continueNextDay: false,
          latitude: null,
          longitude: null,
          stayed_overnight: stayedOvernight,
        })
      }).catch(() => {});

      const statusRes = await fetch(`/api/job-orders/${jobId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          status: 'completed',
          work_completed_at: new Date().toISOString(),
          completion_signer_name: signerName || undefined,
          completion_signature: signatureUrl || undefined,
          // Canonical customer-signature columns — mirror the remote-sign path
          // so onsite-signed jobs are queryable by the same columns.
          customer_signature: signatureUrl || undefined,
          customer_signed_at: new Date().toISOString(),
          // 'on_site' with the underscore — the column's CHECK constraint
          // allows ('on_site','remote','none'). 'onsite' would be rejected and
          // the status route's silent fallback would drop the whole payload
          // again, which is how zero signatures ever saved.
          customer_signature_method: 'on_site',
        })
      });

      const statusJson = await statusRes.json().catch(() => null);

      // The job is scheduled past today and the server wants an explicit
      // confirmation before closing it for good. Ask plainly, in the crew's
      // terms, then retry with the confirmation.
      if (statusRes.status === 409 && statusJson?.error === 'finish_early_confirmation_required') {
        const ok = window.confirm(
          `${statusJson.message}\n\nOK = the work really is finished, close the job.\nCancel = go back.`
        );
        if (!ok) { setSubmitting(false); return; }
        const retry = await fetch(`/api/job-orders/${jobId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            status: 'completed',
            work_completed_at: new Date().toISOString(),
            completion_signer_name: signerName || undefined,
            completion_signature: signatureUrl || undefined,
            customer_signature: signatureUrl || undefined,
            customer_signed_at: new Date().toISOString(),
            customer_signature_method: 'on_site',
            confirm_finish_early: true,
          }),
        });
        if (!retry.ok) {
          const rj = await retry.json().catch(() => null);
          showNotif(rj?.error || 'Failed to complete job', 'error');
          setSubmitting(false);
          return;
        }
        localStorage.removeItem(`work-performed-${jobId}`);
        localStorage.removeItem(`work-draft-${jobId}`);
        void sendReviewToContact(session.access_token);
        setSuccessMode('complete');
        return;
      }

      // NEVER report a clean completion when the database refused part of the
      // payload. This is the exact failure that lost every signature: the
      // request came back 200, the operator saw "Job Complete", and the
      // signature was silently gone. If the signature specifically didn't
      // land, say so and keep the local copy — do NOT clear it.
      const droppedSignature = (statusJson?.partial_save?.dropped_fields || []).some(
        (f: string) => f.includes('signature') || f.includes('signed')
      );
      if (statusRes.ok && droppedSignature) {
        showNotif(
          'The job was marked complete but the SIGNATURE did not save. Tell the office before you leave — do not re-sign.',
          'error'
        );
        setSubmitting(false);
        return;
      }

      if (statusRes.ok) {
        localStorage.removeItem(`work-performed-${jobId}`);
        localStorage.removeItem(`work-draft-${jobId}`);
        // The REVIEW goes to the CUSTOMER's phone — never the operator's device
        // (so the operator can't fill it out for them). The customer signs + rates
        // on their own phone via the texted link. Best-effort; completion still
        // succeeds if the text can't send. Fire-and-forget so it never stalls
        // the success screen.
        void sendReviewToContact(session.access_token);
        setSuccessMode('complete');
      } else {
        showNotif(statusJson?.error || 'Failed to complete job', 'error');
      }
    } catch (err) {
      console.error('Error completing job:', err);
      showNotif('Failed to complete. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── CUSTOMER SATISFACTION SURVEY HANDLERS ───────────────────────────────
  const handleSurveySubmit = async (data: {
    cleanliness_rating: number;
    communication_rating: number;
    operator_feedback_notes?: string;
    likely_to_use_again_rating: number;
    send_to_email?: string;
  }) => {
    setSurveySubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`/api/job-orders/${jobId}/customer-survey`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(data),
      }).catch(() => {});
      setSurveySubmitted(true);
    } catch (err) {
      console.error('Survey submit error (non-fatal):', err);
    } finally {
      setSurveySubmitting(false);
      setSurveyMode(false);
      setSuccessMode('complete');
    }
  };

  const handleSkipSurvey = () => {
    setSurveyMode(false);
    setSuccessMode('complete');
  };

  // Text the customer a review/sign link to the on-site contact number so THEY
  // fill out the satisfaction review on their own phone (not the operator's).
  const sendReviewToContact = async (accessToken: string) => {
    const phone = job?.site_contact_phone || job?.foreman_phone || '';
    if (!phone) return; // no contact phone on file — nothing to send
    try {
      const sigRes = await fetch(`/api/job-orders/${jobId}/request-signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ request_type: 'completion', contact_name: job?.customer_name || undefined, contact_phone: phone }),
      });
      if (!sigRes.ok) return;
      const sigData = await sigRes.json();
      const signUrl: string | undefined = sigData.data?.sign_url;
      if (!signUrl) return;
      await fetch(`/api/job-orders/${jobId}/send-completion-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ phoneNumber: phone, signUrl, jobNumber: job?.job_number, customerName: job?.customer_name }),
      });
    } catch { /* best-effort — completion already succeeded */ }
  };

  // ─── REMOTE SIGNATURE — Send link & finish ────────────────────────────────
  const handleSendRemoteLink = async () => {
    /** Every refusal has to be VISIBLE inside the panel and as a toast. This
     *  button used to fail all three checks below in complete silence. */
    const refuse = (message: string, type: 'error' | 'warning' = 'error') => {
      setRemoteError(message);
      showNotif(message, type);
    };

    // Same completion requirements as the on-site path — no skipping work/photos.
    if (workPerformedItems.length === 0) {
      refuse('Add what work was performed before finishing the job.');
      return;
    }
    if (!photoRequirementMet) {
      refuse(PHOTO_REQUIRED_MESSAGE);
      return;
    }
    if (!remotePhone.trim()) {
      refuse('Enter the contact’s phone number.', 'warning');
      return;
    }
    setRemoteError(null);
    // Persist the photos on this path too (it previously never saved them).
    if (completionPhotos.length > 0) {
      try {
        const { data: { session: photoSession } } = await supabase.auth.getSession();
        if (photoSession) {
          await fetch(`/api/job-orders/${jobId}/photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${photoSession.access_token}` },
            body: JSON.stringify({ photo_urls: completionPhotos }),
          });
        }
      } catch { /* best-effort */ }
    }
    setRemoteSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        refuse('Your session expired. Log in again, then resend the link.');
        return;
      }

      // 1. Create a signature request and get the sign URL
      const sigRes = await fetch(`/api/job-orders/${jobId}/request-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          request_type: 'completion',
          contact_name: job?.customer_name || undefined,
          contact_phone: remotePhone.trim(),
        }),
      });

      if (!sigRes.ok) {
        const err = await sigRes.json().catch(() => ({}));
        refuse(err.error || 'Could not generate the signature link. Try again.');
        return;
      }

      const sigData = await sigRes.json();
      const signUrl: string = sigData.data?.sign_url;

      // In dev, open the link BEFORE the send. Local machines have no SMS
      // provider, so the send returns 502 and returns early — opening the tab
      // afterwards meant the remote-signature flow could not be tested at all.
      if (process.env.NODE_ENV === 'development') {
        window.open(signUrl, '_blank');
      }

      // 2. Send SMS.
      //    The result is CHECKED. It used to be fired and ignored, so a failed
      //    text still showed the operator "Link Sent!" and he walked off site
      //    believing the customer had it.
      const smsRes = await fetch(`/api/job-orders/${jobId}/send-completion-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          phoneNumber: remotePhone.trim(),
          signUrl,
          jobNumber: job?.job_number,
          customerName: job?.customer_name,
        }),
      });

      if (!smsRes.ok) {
        const smsErr = await smsRes.json().catch(() => ({}));
        refuse(smsErr.error || 'The text could not be sent. Check the number and try again.');
        return;
      }

      // 3. Log the day and submit for completion.
      //    These are the writes that actually CLOSE the job. They used to end
      //    in .catch(() => {}) with no status check, so the text could go out,
      //    both writes fail, and the operator still saw "Link Sent!" and drove
      //    away from a job that was never submitted. If they fail, say so.
      const workPerformed = workPerformedItems;

      const logRes = await fetch(`/api/job-orders/${jobId}/daily-log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          work_date: lateWorkDate,
          workPerformed,
          notes: `Job complete. Remote signature link sent to ${remotePhone.trim()}.`,
          continueNextDay: false,
          latitude: null,
          longitude: null,
          stayed_overnight: stayedOvernight,
        }),
      }).catch(() => null);

      const completionRes = await fetch(`/api/jobs/${jobId}/completion-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          operator_notes: `Remote signature link sent to customer at ${remotePhone.trim()}.`,
        }),
      }).catch(() => null);

      // 409 from completion-request means "already submitted", not a failure.
      //
      // Resending the link is normal: the operator sends it, the customer
      // doesn't sign, he reopens the ticket (pending_completion jobs stay
      // navigable) and sends again. The second attempt gets a 409 because the
      // job is ALREADY pending_completion — which is the desired state. Treating
      // that as failure would tell him to go find dispatch about a job that is
      // perfectly fine, at the worst possible moment.
      const completionOk = completionRes?.ok || completionRes?.status === 409;
      if (!logRes?.ok || !completionOk) {
        refuse(
          'The text went out, but the job did not close. Tell dispatch before you leave the site.'
        );
        return;
      }

      localStorage.removeItem(`work-performed-${jobId}`);
      localStorage.removeItem(`work-draft-${jobId}`);
      setRemoteSentPhone(remotePhone.trim());
      setShowRemotePanel(false);
      setRemoteSent(true);
    } catch (err) {
      console.error('Error sending remote link:', err);
      refuse('Could not reach the server. Check your signal and try again.');
    } finally {
      setRemoteSending(false);
    }
  };

  // ─── UPLOAD SIGNATURE TO STORAGE ─────────────────────────────────────────
  const uploadSignature = async (): Promise<string | null> => {
    if (!signatureData) return null;
    try {
      const res = await fetch(signatureData);
      const blob = await res.blob();
      const fileName = `${jobId}/signatures/completion-${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(fileName, blob, { contentType: 'image/png' });

      if (uploadError) {
        console.error('Signature upload error:', uploadError);
        return signatureData;
      }

      const { data } = supabase.storage
        .from('job-photos')
        .getPublicUrl(fileName);

      return data?.publicUrl || signatureData;
    } catch {
      return signatureData;
    }
  };

  // ─── SIGNATURE CANVAS HANDLERS ────────────────────────────────────────────
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = ('touches' in e) ? e.touches[0].clientX : e.clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = ('touches' in e) ? e.touches[0].clientX : e.clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData('');
  };

  // ─── Customer satisfaction survey screen (after signature, before success) ─
  if (surveyMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand/5 via-white to-brand/5 dark:from-[#0b0618] dark:via-[#0b0618] dark:to-[#0f0a1e] py-8 px-4">
        <div className="max-w-lg mx-auto space-y-5">
          {/* Branded header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-accent shadow-lg shadow-brand/30 mb-3">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              How did we do?
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Your sign-off has been saved. Help us improve with a quick survey.
            </p>
          </div>

          <CustomerSatisfactionSurvey
            initialEmail={customerEmail}
            contactPhoneOnSite={job?.site_contact_phone || null}
            onSubmit={handleSurveySubmit}
            submitting={surveySubmitting}
            variant="light"
          />

          {/* Skip survey */}
          <div className="text-center">
            <button
              onClick={handleSkipSurvey}
              disabled={surveySubmitting}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2 disabled:opacity-40 transition-colors"
            >
              Skip survey
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Post-submission success screen ──────────────────────────────────────
  if (successMode) {
    const isDoneForDay = successMode === 'done_for_day';
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-xl border border-green-100 dark:border-green-900/30 p-8 max-w-sm w-full text-center">
          {/* Icon */}
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ${
            isDoneForDay
              ? 'bg-amber-100 dark:bg-amber-900/40'
              : 'bg-emerald-100 dark:bg-emerald-900/40'
          }`}>
            {isDoneForDay
              ? <Sun className="w-10 h-10 text-amber-500 dark:text-amber-400" />
              : <Trophy className="w-10 h-10 text-emerald-500 dark:text-emerald-400" />
            }
          </div>

          {/* Heading */}
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {isDoneForDay ? 'Done for Today ✓' : 'Job Complete ✓'}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            {isDoneForDay
              ? 'Day logged. Job continues tomorrow.'
              : 'Great work! This job has been completed.'
            }
          </p>

          {/* Survey thanks */}
          {surveySubmitted && successMode === 'complete' && (
            <div className="flex items-center justify-center gap-2 bg-brand/5 dark:bg-brand/20 border border-brand/30 dark:border-brand/20 rounded-xl px-4 py-3 mb-3">
              <Heart className="w-4 h-4 text-brand dark:text-brand flex-shrink-0" />
              <p className="text-sm font-medium text-brand dark:text-brand">Thanks for your feedback ✓</p>
            </div>
          )}

          {/* Note sent confirmation */}
          {supervisorNoteSent && (
            <div className="flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-3 mb-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Note sent to supervisor ✓</p>
            </div>
          )}

          {/* Add note toggle */}
          {!supervisorNoteSent && (
            <div className="mb-4">
              {!showSupervisorNoteForm ? (
                <button
                  onClick={() => setShowSupervisorNoteForm(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.05] text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                  <MessageSquarePlus className="w-4 h-4 text-brand dark:text-brand" />
                  Add a note for your supervisor
                </button>
              ) : (
                <div className="space-y-3 text-left">
                  <textarea
                    value={supervisorNote}
                    onChange={(e) => setSupervisorNote(e.target.value)}
                    placeholder="Leave a note for your supervisor..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.07] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSubmitSupervisorNote}
                      disabled={supervisorNoteSubmitting || !supervisorNote.trim()}
                      className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-brand to-brand-accent text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-all"
                    >
                      {supervisorNoteSubmitting
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                        : <><Send className="w-4 h-4" /> Send Note</>
                      }
                    </button>
                    <button
                      onClick={() => setShowSupervisorNoteForm(false)}
                      className="px-4 py-3 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Directions back to shop */}
          <div className="mb-3">
            {!showDirectionsChooser ? (
              <button
                onClick={() => setShowDirectionsChooser(true)}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.05] text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <Navigation className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                Directions back to shop
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Open directions in
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => openDirectionsToShop('apple')}
                    className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-gray-900 dark:bg-white/10 text-white text-sm font-semibold hover:bg-gray-800 dark:hover:bg-white/20 transition-colors"
                  >
                    <Navigation className="w-4 h-4" />
                    Apple Maps
                  </button>
                  <button
                    onClick={() => openDirectionsToShop('google')}
                    className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                  >
                    <Navigation className="w-4 h-4" />
                    Google Maps
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Back to My Jobs */}
          <button
            onClick={() => router.push('/dashboard/my-jobs')}
            className={`w-full py-3 rounded-xl font-semibold text-white transition-all ${
              isDoneForDay
                ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                : 'bg-gradient-to-r from-emerald-500 to-green-600'
            }`}
          >
            Back to My Jobs
          </button>
        </div>
      </div>
    );
  }

  // Crew member (co-operator/helper) landed here — message + bounce.
  if (crewBlocked) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-xl border border-indigo-200 dark:border-indigo-500/30 p-8 max-w-sm w-full text-center">
          <CheckCircle2 className="w-12 h-12 text-indigo-500 dark:text-indigo-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">The lead completes the ticket</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            Your submitted work is already on the ticket. Taking you back to the job…
          </p>
          <button
            onClick={() => router.replace(`/dashboard/my-jobs/${jobId}`)}
            className="w-full min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            Back to Job
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    );
  }

  if (!loading && !job) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-xl border border-red-100 dark:border-red-900/30 p-8 max-w-sm w-full text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Job Not Found</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            Could not load job details. Please go back and try again.
          </p>
          <button
            onClick={() => router.push('/dashboard/my-jobs')}
            className="w-full bg-gray-700 dark:bg-white/10 hover:bg-gray-800 dark:hover:bg-white/20 text-white dark:text-gray-300 py-3 rounded-xl font-semibold transition-colors"
          >
            Back to My Jobs
          </button>
        </div>
      </div>
    );
  }

  // ─── Remote link sent — success screen ────────────────────────────────────
  if (remoteSent) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-xl border border-brand/30 dark:border-brand/20 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-brand/10 dark:bg-brand/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Send className="w-8 h-8 text-brand dark:text-brand" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Link Sent!</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">
            A signature link was sent to
          </p>
          <p className="text-brand dark:text-brand font-semibold mb-4">{remoteSentPhone}</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            The customer will receive a text to review and sign the work. Your supervisor has been notified.
          </p>
          <button
            onClick={() => router.push('/dashboard/my-jobs')}
            className="w-full bg-gradient-to-r from-brand to-brand-accent text-white py-3 rounded-xl font-semibold"
          >
            Back to My Jobs
          </button>
        </div>
      </div>
    );
  }

  // ─── Submitted success screen ─────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-xl border border-green-100 dark:border-green-900/30 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Submitted!</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            Your supervisor has been notified and will review shortly.
          </p>
          <button
            onClick={() => router.push('/dashboard/my-jobs')}
            className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white py-3 rounded-xl font-semibold"
          >
            Back to My Jobs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618]">
      {/* Header */}
      <div className="bg-white dark:bg-white/[0.04] border-b border-gray-200 dark:border-white/10 sticky top-0 z-10 shadow-sm pt-safe">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/job-schedule/${jobId}/work-performed`}
              className="p-2 bg-gray-100 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Day Complete</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">{job?.job_number} &bull; {job?.customer_name}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Notification.
          z-[100], NOT z-50: every modal on this page is z-50 and sits LATER in
          the DOM, so an equal z-index put the toast *behind* the modal overlay.
          Tapping "Send Link & Complete Job" with a missing photo showed the
          operator absolutely nothing. The toast has to outrank the modals. */}
      {notification && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-lg text-white text-sm font-medium max-w-[90vw] text-center ${
          notification.type === 'success' ? 'bg-emerald-500 dark:bg-emerald-600' :
          notification.type === 'error' ? 'bg-red-500 dark:bg-red-600' : 'bg-amber-500 dark:bg-amber-600'
        }`}>
          {notification.message}
        </div>
      )}

      <div className="container mx-auto px-4 py-6 max-w-lg space-y-6">
        {/* Admin viewing banner */}
        {isAdminViewing && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 shadow-sm">
            <AlertTriangle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-800 font-medium">
              You are viewing this page as an admin. Operator actions apply.
            </p>
          </div>
        )}

        {/* Hours Worked Today */}
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-xl">
              <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Hours Worked Today</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{getHoursWorked()} hrs</p>
            </div>
          </div>
          {job?.is_multi_day && (
            <div className="mt-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800/40">
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                {/* Day of THIS run of work: `phase_day_number` when the job has
                    been parked and restarted, otherwise the lifetime
                    `total_days_worked + 1` it has always shown. */}
                Multi-day job &bull; Day {displayDayNumber(job)}
              </p>
            </div>
          )}
        </div>

        {/* Completion Photos */}
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
              <Camera className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              {/* Photos are required only to COMPLETE the job. On a multi-day
                  job, "Done for today" needs none — the crew is coming back and
                  nothing is being signed. `isLastScheduledDay !== true` is the
                  same condition that shows the Done-for-today button below. */}
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">
                Job Photos{' '}
                {!photosProhibited &&
                  isLastScheduledDay === true &&
                  photosAlreadyToday.length === 0 && <span className="text-red-500">*</span>}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {photosProhibited
                  ? 'Not allowed at this jobsite'
                  : photosAlreadyToday.length > 0
                    ? 'Already covered for this shift'
                    : isLastScheduledDay === true
                      ? 'Required to complete the job — before/after photos, site conditions'
                      : 'Optional today — required only when you complete the job'}
              </p>
            </div>
          </div>

          {/* ONE ASK PER JOB PER SHIFT. If the crew already filed photos on this
              shift — from the work log or from here — say so plainly and show
              them, instead of putting an empty required uploader in front of a
              man who photographed the same work four minutes ago. That second
              ask is the reason an operator asked to go back to paper.
              "This shift", not "today", because a crew that shot the cut at
              23:50 and closes out at 00:05 is on the same shift and would
              otherwise be told those photos belonged to yesterday. */}
          {!photosProhibited && photosAlreadyToday.length > 0 && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                {photosAlreadyToday.length} photo{photosAlreadyToday.length === 1 ? '' : 's'} already added on this shift
              </p>
              <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                These are on the ticket already — you don&apos;t need to take them again.
              </p>
              <div className="mt-2">
                <PhotoViewer photos={photosAlreadyToday} label="Added this shift" />
              </div>
            </div>
          )}

          {photosProhibited ? (
            // Office flagged this jobsite photo-prohibited (secure facility) —
            // the photo requirement is auto-waived; operators cannot self-exempt.
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Photos are not permitted at this jobsite
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                This site is flagged photo-prohibited by the office — the photo requirement is skipped.
              </p>
            </div>
          ) : (
            <PhotoUploader
              bucket="job-photos"
              pathPrefix={`${jobId}/completion`}
              photos={completionPhotos}
              onPhotosChange={setCompletionPhotos}
              maxPhotos={10}
              label={photosAlreadyToday.length > 0 ? 'Add More Photos (optional)' : 'Add Completion Photos'}
              lightMode={true}
              captureLocation
              jobId={jobId}
            />
          )}
        </div>

        {/* ── Job Progress (against office-set targets; renders only if targets exist) ── */}
        <JobProgressLogger jobId={jobId} />

        {/* ── Subsistence (out-of-town overnight) ───────────────────────────── */}
        {isOutOfTown && (
          <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-violet-100 dark:bg-violet-900/40 rounded-xl">
                <MapPin className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Out-of-Town Job</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Did you stay overnight away from home tonight?</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStayedOvernight(true)}
                className={`flex-1 min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  stayedOvernight === true
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/30 ring-1 ring-violet-400/30'
                    : 'bg-gray-50 dark:bg-white/[0.05] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10'
                }`}
              >
                {stayedOvernight === true && <CheckCircle2 className="w-4 h-4" />}
                Yes, I stayed
              </button>
              <button
                type="button"
                onClick={() => setStayedOvernight(false)}
                className={`flex-1 min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  stayedOvernight === false
                    ? 'bg-slate-700 dark:bg-white/20 text-white shadow-md ring-1 ring-slate-500/30'
                    : 'bg-gray-50 dark:bg-white/[0.05] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10'
                }`}
              >
                {stayedOvernight === false && <CheckCircle2 className="w-4 h-4" />}
                No
              </button>
            </div>
            {subsistenceUnanswered && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Please answer before wrapping up.
              </p>
            )}
          </div>
        )}

        {/* ── Main Decision ─────────────────────────────────────────────────── */}
        {!showSignature ? (
          /* The terminal choice. "Done for Today" stays ALWAYS AVAILABLE
             (founder, Aug 2026) — jobs run long and the schedule is a plan, not
             a fact — but it is no longer a sibling of "Complete Job", and on a
             job the office booked for a single day it now names its own cost
             before it changes the job's shape. See components/DayCloseoutChoice
             and lib/day-closeout. */
          <DayCloseoutChoice
            plan={closeoutPlan}
            disabled={subsistenceUnanswered}
            submitting={submitting}
            planPending={bookingUnknown}
            onContinue={handleDoneForToday}
            onSignOnSite={() => setShowSignature(true)}
            onSendLink={() => { setRemoteError(null); setShowRemotePanel(true); }}
            serverConfirmMessage={continueBlockedMessage}
            serverConfirmCopy={continueBlockedCopy}
            onServerConfirmDismissed={() => {
              setContinueBlockedMessage(null);
              setContinueBlockedCopy(null);
            }}
          />
        ) : (
          /* ── On-site Sign-Off Document ────────────────────────────────────── */
          <div className="space-y-4">
            {/* Back button + title */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSignature(false)}
                className="p-2 bg-gray-100 dark:bg-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-all"
              >
                <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-gray-300" />
              </button>
              <div>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Job Completion Sign-Off</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Review work summary with customer, then sign below</p>
              </div>
            </div>

            {/* ── Company Header Card ──────────────────────────────────────── */}
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden">
              {/* Header stripe — keep slate-800/900 in both modes */}
              <div className="bg-slate-800 dark:bg-slate-900 px-5 py-4">
                <p className="text-white font-bold text-base tracking-wide">PATRIOT CONCRETE CUTTING</p>
                <p className="text-slate-300 text-xs mt-0.5">Job Completion Sign-Off</p>
              </div>

              {/* Job meta grid */}
              <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-white/5">
                <div className="bg-white dark:bg-[#0f0a1e] px-4 py-3">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Job #</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{job?.job_number || '—'}</p>
                </div>
                <div className="bg-white dark:bg-[#0f0a1e] px-4 py-3">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Date</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="bg-white dark:bg-[#0f0a1e] px-4 py-3 col-span-2">
                  <div className="flex items-start gap-1.5">
                    <User className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Customer</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{job?.customer_name || '—'}</p>
                    </div>
                  </div>
                </div>
                {(job?.address || job?.location) && (
                  <div className="bg-white dark:bg-[#0f0a1e] px-4 py-3 col-span-2">
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Location</p>
                        <p className="text-sm text-gray-700 dark:text-gray-200">{job?.address || job?.location}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Work Ordered ─────────────────────────────────────────────── */}
            {(job?.scope_of_work || job?.description) && (
              <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03]">
                  <ClipboardList className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Work Ordered</h3>
                </div>
                <div className="px-5 py-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {job?.scope_of_work || job?.description}
                  </p>
                </div>
              </div>
            )}

            {/* ── Work Performed ────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03]">
                <Wrench className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Work Performed</h3>
              </div>
              <div className="px-5 py-4">
                {workPerformedItems.length > 0 ? (
                  <ul className="space-y-2">
                    {workPerformedItems.map((item, idx) => {
                      const parts: string[] = [];
                      if (item.quantity) parts.push(String(item.quantity));
                      if (item.unit) parts.push(item.unit);
                      if (item.depth) parts.push(`${item.depth}" depth`);
                      const qtyStr = parts.join(' ');
                      // ⚠️ `item.notes` is the operator's INTERNAL quick note —
                      // prep, access, delays, who held them up. This block is the
                      // sheet the CUSTOMER reads and signs, and the entry form
                      // promises the operator "Office only … never appear on the
                      // signed completion sheet". It appeared here anyway.
                      //
                      // CompletionSignOffPDF has two guard layers and a comment
                      // saying notes "must never appear here"; the ON-SCREEN sheet
                      // had none, so the PDF was clean and the screen the customer
                      // actually looks at was not. Measurements only.
                      const desc = item.description || '';
                      return (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-emerald-500 dark:text-emerald-400 font-bold mt-0.5">•</span>
                          <span className="text-gray-700 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-white">{item.type || 'Work'}</span>
                            {qtyStr ? ` — ${qtyStr}` : ''}
                            {desc ? `, ${desc}` : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                    No individual work items recorded. Work was performed as described in the scope above.
                  </p>
                )}
              </div>
            </div>

            {/* ── Disclaimer ───────────────────────────────────────────────── */}
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800/50 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-200 dark:border-amber-800/50">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                  Acknowledgement &amp; Disclaimer
                </h3>
              </div>
              <div className="px-5 py-4 space-y-3">
                <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  Patriot Concrete Cutting assumes no responsibility for layout, water damage, embedments, or buried utilities. I agree that the work described above has been completed satisfactorily.
                </p>
                <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  Patriot Concrete Cutting will not be liable for any reinforcement, utilities, or other obstructions that are damaged and are outside the capabilities of our equipment to detect. This includes but is not limited to: obstructions below the concrete on a slab on grade; low voltage or low current power lines not currently under load; any obstruction in newly poured concrete.
                </p>
                <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  By signing below, the customer acknowledges that they have reviewed the scope of work and work performed above, and that the work has been completed to their satisfaction. Any claims or disputes must be reported within 48 hours of job completion. This signature authorizes Patriot Concrete Cutting to invoice for services rendered.
                </p>
              </div>
            </div>

            {/* ── Signature Form ────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <PenTool className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Customer Signature</h3>
              </div>

              {/* Signer Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Printed Name <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Name of person signing"
                  className="w-full px-4 py-3 border border-slate-300 dark:border-white/20 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 dark:text-white bg-white dark:bg-white/[0.07] placeholder:text-gray-400 dark:placeholder:text-white/30"
                />
              </div>

              {/* Customer Email — sends PDF receipt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Customer Email <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="customer@example.com"
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-white/20 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 dark:text-white bg-white dark:bg-white/[0.07] placeholder:text-gray-400 dark:placeholder:text-white/30"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  We&apos;ll send a copy of the sign-off PDF to this address.
                </p>
              </div>

              {/* Signature Pad */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1">
                    <PenTool className="w-3.5 h-3.5" />
                    Signature <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">(draw below)</span>
                  </label>
                  {signatureData && (
                    <button
                      onClick={clearSignature}
                      className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="border-2 border-dashed border-slate-300 dark:border-white/20 rounded-xl overflow-hidden bg-gray-50 dark:bg-white/[0.03] relative">
                  {!signatureData && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className="text-xs text-gray-300 dark:text-gray-600 select-none">Sign here</p>
                    </div>
                  )}
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={160}
                    className="w-full touch-none cursor-crosshair"
                    style={{ height: '160px' }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
              </div>

              {/* E-Sign Consent */}
              <EsignConsentCheckbox
                onConsentChange={setEsignConsented}
                consented={esignConsented}
              />

              {/* Thank-you callout */}
              <div className="rounded-2xl p-4 bg-gradient-to-br from-brand to-brand-accent shadow-md shadow-brand/25 ring-1 ring-brand/30">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-white/20 backdrop-blur-sm ring-1 ring-white/30">
                    <Heart className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white leading-tight">
                      Thank you for choosing Patriot Concrete Cutting
                    </p>
                    <p className="text-xs text-white/85 mt-1 leading-relaxed">
                      Once you sign, your work is complete. We&apos;d love to hear how we did — a brief survey will follow your signature.
                    </p>
                  </div>
                </div>
              </div>

              {/* PDF notice */}
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-800/40">
                <FileText className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  A PDF of this sign-off will be generated and saved to the job record automatically.
                </p>
              </div>

              {/* Submit button */}
              <button
                onClick={handleJobComplete}
                disabled={submitting}
                className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl py-4 font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Saving PDF &amp; Completing…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Complete Job &amp; Save Sign-Off</span>
                  </>
                )}
              </button>

              <button
                onClick={() => { setShowSignature(false); setShowCompletionModal(true); }}
                disabled={submitting}
                className="w-full text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-200 py-2 disabled:opacity-40 transition-colors"
              >
                Skip signature — submit for supervisor approval instead
              </button>
            </div>
          </div>
        )}

        {/* The one difference that costs money, said plainly and at a size a
            gloved operator can read in the sun. The old version of this box
            said "Complete Job submits to your supervisor for approval", which
            was both wrong and no help in telling the two apart. */}
        {!showSignature && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                Only <strong>Complete Job</strong> finishes a job — it takes the customer&apos;s
                signature and lets the office bill it. <strong>Done for Today</strong> leaves the
                job open and brings it back tomorrow.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Remote Signature Panel (modal) ─────────────────────────────────── */}
      {showRemotePanel && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand/10 dark:bg-brand/20 flex items-center justify-center">
                  <Send className="w-5 h-5 text-brand dark:text-brand" />
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Send Signature Link</h2>
              </div>
              <button
                onClick={() => setShowRemotePanel(false)}
                className="p-2 bg-gray-100 dark:bg-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-all"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              We&apos;ll text the customer a link so they can review the work and sign remotely.
            </p>

            {remoteError && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm font-medium text-red-700 dark:text-red-300">{remoteError}</p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Contact&apos;s Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="tel"
                  value={remotePhone}
                  onChange={(e) => setRemotePhone(e.target.value)}
                  placeholder="(555) 867-5309"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-white/20 rounded-xl focus:ring-2 focus:ring-brand focus:border-brand text-gray-900 dark:text-white bg-white dark:bg-white/[0.07] placeholder:text-gray-400 dark:placeholder:text-white/30"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSendRemoteLink}
                disabled={remoteSending || !remotePhone.trim()}
                className="flex-1 bg-gradient-to-r from-brand to-brand-accent text-white py-3 rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {remoteSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {remoteSending ? 'Sending...' : 'Send Link & Complete Job'}
              </button>
              <button
                onClick={() => setShowRemotePanel(false)}
                disabled={remoteSending}
                className="px-4 py-3 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Completion Confirmation Modal ───────────────────────────────────── */}
      {showCompletionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Submit for Completion</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              This will send the job to your supervisor for final approval.
            </p>

            <textarea
              placeholder="Any final notes for the supervisor? (optional)"
              className="w-full border border-gray-300 dark:border-white/20 rounded-lg p-3 text-base sm:text-sm mb-4 h-24 focus:outline-none focus:border-emerald-500 text-gray-900 dark:text-white bg-white dark:bg-white/[0.07] placeholder:text-gray-400 dark:placeholder:text-white/30 resize-none"
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
            />

            <div className="flex gap-3">
              <button
                onClick={handleSubmitCompletion}
                disabled={submitting}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {submitting ? 'Submitting…' : 'Submit for Approval'}
              </button>
              <button
                onClick={() => setShowCompletionModal(false)}
                disabled={submitting}
                className="px-4 py-3 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
