'use client';

export const dynamic = 'force-dynamic';

/**
 * WORK PERFORMED — the operator's daily ticket.
 *
 * REBUILT Aug 15 2026 to the shape of the office's Scope of Work step
 * (`app/dashboard/admin/schedule-form/page.tsx` step 3), at the founder's
 * direct request after using both screens: tick every work type first, then
 * fill in the measurements below, then description + photos. The picking and
 * measuring now live in `_components/WorkEntryForm.tsx`; the pure logic behind
 * them (which builder a type gets, what lands in `details_json`, which types to
 * recommend) lives in `lib/work-types.ts` and is unit-tested.
 *
 * THIS PAGE keeps everything that is about the DAY rather than the work: which
 * day is being logged, the co-operator/lead distinction, the already-submitted
 * lock and its amendment notes, the draft autosave, photos, the whole-day
 * description, difficulty, and the single submit.
 *
 * ONE WRITE PATH. Submissions go to POST /api/job-orders/[id]/work-items with
 * `workDate` — the server replaces on (job, operator, work_date). Two write
 * paths that disagreed about the day is how Pratt's ticket reached 2,800 linear
 * feet on a day that was a fraction of that. Do not add a second one.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamicImport from 'next/dynamic';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toLocalYMD, formatDayLong } from '@/lib/dates';
import { displayDayNumber } from '@/lib/phase-day';
import QuickAccessButtons from '@/components/QuickAccessButtons';
import {
  Camera,
  Mic,
  Save,
  Home,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  MessageSquarePlus,
  Clock,
  Zap,
  Wrench,
} from 'lucide-react';
import { DarkModeIconToggle } from '@/components/ui/DarkModeToggle';
import { resolveRecommendedWorkTypes, type WorkItem } from '@/lib/work-types';
import { enqueue } from '@/lib/outbox';

const EquipmentUsageForm = dynamicImport(() => import('@/components/EquipmentUsageForm'), {
  ssr: false,
  loading: () => null,
});
const PhotoUploader = dynamicImport(() => import('@/components/PhotoUploader'), {
  ssr: false,
  loading: () => null,
});
const VoiceMemoNotes = dynamicImport(() => import('./_components/VoiceMemoNotes'), {
  ssr: false,
  loading: () => null,
});
const WorkEntryForm = dynamicImport(() => import('./_components/WorkEntryForm'), {
  ssr: false,
  loading: () => (
    <div className="h-40 rounded-2xl bg-white dark:bg-white/[0.03] border border-gray-100 dark:border-white/10 animate-pulse" />
  ),
});

export default function WorkPerformed() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  // ── WHICH DAY IS THIS TICKET FOR? ────────────────────────────────────────
  // Multi-day jobs: an operator who didn't get their ticket in yesterday has to
  // be able to page back and submit it for THAT day (the founder's DSM
  // reference — a day you missed stays on the schedule until you fill it in).
  // `?date=YYYY-MM-DD` carries the day being viewed; anything malformed or in
  // the FUTURE falls back to today, so nobody can pre-log work that hasn't
  // happened.
  const requestedDate = searchParams?.get('date') || '';
  const workDate = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return toLocalYMD();
    return requestedDate > toLocalYMD() ? toLocalYMD() : requestedDate;
  })();
  const isBackfill = workDate !== toLocalYMD();

  // ── The day's work ───────────────────────────────────────────────────────
  const [selectedItems, setSelectedItems] = useState<WorkItem[]>([]);
  /** Work types ticked with nothing entered behind them — blocks submit. */
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  /**
   * Bumped whenever an ASYNC load (draft, or "you already submitted today")
   * replaces the item list, so the entry form re-seeds itself from it. It is
   * NOT bumped on ordinary edits — the form is the one typing them.
   */
  const [hydrationToken, setHydrationToken] = useState(0);

  const [equipmentUsageEntries, setEquipmentUsageEntries] = useState<any[]>([]);
  const [showEquipmentForm, setShowEquipmentForm] = useState(false);
  const [showEquipmentSection, setShowEquipmentSection] = useState(false);
  const [savingEquipment, setSavingEquipment] = useState(false);
  // Per-submission difficulty — sent with the work items and stored on
  // work_items.accessibility_rating / _description.
  const [difficulty, setDifficulty] = useState<'' | 'easy' | 'moderate' | 'difficult'>('');
  const [difficultyNotes, setDifficultyNotes] = useState('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [jobPhotos, setJobPhotos] = useState<string[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<string>('');
  const [currentDayNumber, setCurrentDayNumber] = useState<number>(1);

  // ── What the office scoped for this job ──────────────────────────────────
  // Drives the RECOMMENDED tiles: the crew was sent here to do these, so they
  // are the first thing on screen. Everything else is one tap away.
  const [scopeDetails, setScopeDetails] = useState<Record<string, unknown> | null>(null);
  const [jobType, setJobType] = useState<string>('');
  const recommended = useMemo(
    () => resolveRecommendedWorkTypes({ scopeDetails, jobType }),
    [scopeDetails, jobType]
  );

  // ─── Photo requirement gate ─────────────────────────────────────────────
  // Photos are OPTIONAL on this screen (see handleSubmit). The photos-prohibited
  // flag still drives the acknowledgement UI for secure sites.
  const [photosProhibited, setPhotosProhibited] = useState(false);
  const [photosSkipAcknowledged, setPhotosSkipAcknowledged] = useState(false);
  /**
   * SET WHEN THE PHOTO WRITE FAILED — and it is the only thing that sets it.
   *
   * This used to be rendered and never populated: three `setPhotoError(null)`
   * calls and no message, so the line below the uploader could not appear. Dead
   * wiring is this codebase's recurring defect, so it is connected rather than
   * deleted: it is now exactly the surface a failed photo save needs, which is
   * the failure the copy in this section makes a promise about.
   */
  const [photoError, setPhotoError] = useState<string | null>(null);
  /**
   * Photo URLs the server has already accepted for this job.
   *
   * `/api/job-orders/[id]/photos` APPENDS. Retrying a submit after a photo
   * failure must not re-send what already landed, or the job's `photo_urls`
   * carries every photo twice — and the office bills off that array.
   */
  const savedPhotoUrls = useRef<Set<string>>(new Set());

  // ─── Day lock state (read-only if the day's log is already submitted) ─────
  const [dayAlreadySubmitted, setDayAlreadySubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set when the submit genuinely failed. Shown as a banner and, critically,
  // it means we do NOT navigate on — moving to the next screen is what made a
  // failed save look like a successful one.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Queued on the phone because there was no signal. Distinct from saveError:
  // this one is not a failure, it is a delay, and it must NOT read like a loss.
  const [queuedOffline, setQueuedOffline] = useState(false);

  // ─── Crew co-operator (job_crew role='operator') ─────────────────────────
  // Full work-performed input, but NO day-complete/survey — the LEAD completes
  // the ticket. After submit they get a confirmation instead of the survey nav.
  const [isCoOperator, setIsCoOperator] = useState(false);
  const [leadName, setLeadName] = useState<string | null>(null);
  const [coOpSubmitted, setCoOpSubmitted] = useState(false);

  // ─── Amendment note state (shown when the day is already submitted) ───────
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteSubmitted, setNoteSubmitted] = useState(false);
  const [submittedNotes, setSubmittedNotes] = useState<Array<{ id: string; content: string; created_at: string; author_name: string }>>([]);

  // ─── Standby ─────────────────────────────────────────────────────────────
  const [standbyLogs, setStandbyLogs] = useState<any[]>([]);
  const [totalStandbyMinutes, setTotalStandbyMinutes] = useState(0);

  // ─── Auto-save state ─────────────────────────────────────────────────────
  type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftLoadedRef = useRef(false);

  const showNotification = useCallback(
    (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), 5000);
    },
    []
  );

  /** The entry form's single output: the day's items + which are still empty. */
  const handleEntriesChange = useCallback((items: WorkItem[], pending: string[]) => {
    setSelectedItems(items);
    setPendingNames(pending);
  }, []);

  // Mark this job as having visited work-performed (resume-last-position logic)
  useEffect(() => {
    if (params.id) {
      localStorage.setItem(`job_last_page_${params.id}`, 'work-performed');
    }
  }, [params.id]);

  // Back navigation — clears resume key so the job ticket doesn't loop back here
  const goBack = () => {
    localStorage.removeItem(`job_last_page_${params.id}`);
    router.push(`/dashboard/my-jobs/${params.id}`);
  };

  // Fetch job info: the scope (for recommendations), the day number, the
  // co-operator/helper distinction, and the photos-prohibited flag.
  useEffect(() => {
    const fetchJobInfo = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        // Fetch only this specific job (not all jobs) for efficiency on long-term projects
        const res = await fetch(`/api/job-orders?id=${params.id}&include_helper_jobs=true&includeCompleted=true`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = await res.json();
          const found = (json.data || [])[0];
          // Helpers (helper slot OR crewed as helper) do NOT fill out the full
          // work ticket — they have the light work-log. Bounce them back.
          if (
            found &&
            (found.viewer_is_helper === true ||
              (found.helper_assigned_to === session.user.id && found.assigned_to !== session.user.id))
          ) {
            router.replace(`/dashboard/my-jobs/${params.id}`);
            return;
          }
          // Crew co-operator: full input here, but the LEAD runs day-complete.
          setIsCoOperator(found?.viewer_is_co_operator === true);
          setLeadName(found?.operator_name || null);
          if (found?.job_type) setJobType(found.job_type);
          if (found?.scope_details && typeof found.scope_details === 'object') {
            setScopeDetails(found.scope_details);
          }
          // Photos-prohibited flag set by the office on the schedule form
          // (site_compliance jsonb).
          setPhotosProhibited(found?.site_compliance?.photos_prohibited === true);
          // Current day number. The server sends `phase_day_number` for a job
          // that was parked and restarted — the day of THIS run, restarting at
          // 1 — and nothing for any other job, which then reads
          // `total_days_worked + 1` exactly as it always has. See
          // lib/phase-day.ts.
          setCurrentDayNumber(displayDayNumber(found));
        }
      } catch (err) {
        console.error('Error fetching job info:', err);
      }
    };
    fetchJobInfo();
  }, [params.id, router]);

  // Is the ticket for THE DAY BEING VIEWED already submitted? (lock if so)
  useEffect(() => {
    const checkDaySubmitted = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        // The day being logged — NOT necessarily today. Paging back to a day
        // you missed must show that day's state, not today's.
        const today = workDate;
        const res = await fetch(`/api/job-orders/${params.id}/daily-log`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = await res.json();
          // Has THIS user already closed out the day? The daily-log endpoint
          // returns every operator's log for the job, so matching on date
          // alone locked a crew CO-OPERATOR out the moment the lead completed
          // the day. Day-complete is lead-only, so scope this to the caller.
          const todayLog = (json.logs || []).find(
            (l: any) =>
              l.log_date === today && l.day_completed_at && l.operator_id === session.user.id,
          );
          if (todayLog) {
            setDayAlreadySubmitted(true);
            fetchAmendmentNotes(session.access_token);
          }
        }
      } catch { /* non-critical — default to editable */ }
    };
    checkDaySubmitted();
    // Re-check when the operator pages to a different day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, workDate]);

  // Fetch amendment notes already submitted for this job
  const fetchAmendmentNotes = async (accessToken: string) => {
    try {
      const res = await fetch(`/api/job-orders/${params.id}/notes`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        const amendmentNotes = (json.data || []).filter((n: any) => n.note_type === 'amendment');
        setSubmittedNotes(amendmentNotes);
      }
    } catch { /* non-critical */ }
  };

  // Submit amendment note
  const handleSubmitNote = async () => {
    if (!noteContent.trim()) return;
    setNoteSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/job-orders/${params.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: noteContent.trim(), noteType: 'amendment' }),
      });
      if (res.ok) {
        const json = await res.json();
        setSubmittedNotes(prev => [json.data, ...prev]);
        setNoteContent('');
        setNoteSubmitted(true);
        setShowNoteForm(false);
        setTimeout(() => setNoteSubmitted(false), 4000);
      }
    } catch { /* non-critical */ }
    finally { setNoteSubmitting(false); }
  };

  // ─── Draft save/load helpers ─────────────────────────────────────────────
  const saveDraft = useCallback(async (draft: object | null) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`/api/job-orders/${params.id}/work-performed-draft`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ draft }),
      });
    } catch { /* non-critical */ }
  }, [params.id]);

  // Load draft on mount (runs once)
  useEffect(() => {
    if (draftLoadedRef.current) return;
    const loadDraft = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          draftLoadedRef.current = true;
          return;
        }

        let draft: Record<string, any> | null = null;

        // ── Try DB first ─────────────────────────────────────────────────
        try {
          const res = await fetch(`/api/job-orders/${params.id}/work-performed-draft`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const json = await res.json();
            draft = json.data?.draft ?? null;
          }
        } catch { /* network error — fall through to localStorage */ }

        // ── Fallback: localStorage ───────────────────────────────────────
        if (!draft) {
          try {
            const stored = localStorage.getItem(`work-draft-${params.id}`);
            if (stored) draft = JSON.parse(stored);
          } catch { /* corrupt storage — ignore */ }
        }

        // ── Refuse a draft from a different day ──────────────────────────
        // A multi-day job keeps its progress, but the ENTRY FORM starts clean
        // every morning (founder, Aug 2026). Older drafts have no `forDate`;
        // those are pre-fix and equally untrustworthy, so they go too.
        if (draft && draft.forDate !== toLocalYMD()) {
          draft = null;
          try {
            localStorage.removeItem(`work-draft-${params.id}`);
          } catch { /* storage unavailable — the date check already saved us */ }
          // Clear the server copy too, so it can't come back on another device.
          saveDraft(null);
        }

        // ── Restore state ────────────────────────────────────────────────
        // Only `selectedItems` and the day note survive. A draft written by the
        // PREVIOUS version of this screen also carried `sawingData` /
        // `coreDrillingData` — the half-entered contents of the old modal. Those
        // were never part of a submitted item, so they are ignored rather than
        // resurrected into a form that no longer has a place to put them; the
        // items the operator actually committed still come back in full.
        const draftItems: WorkItem[] = Array.isArray(draft?.selectedItems) ? draft!.selectedItems : [];
        const draftHasItems = draftItems.length > 0 || !!draft?.jobNotes;

        if (draft) {
          if (draftItems.length > 0) {
            setSelectedItems(draftItems);
            setHydrationToken((t) => t + 1);
          }
          if (draft.jobNotes !== undefined) setVoiceNotes(draft.jobNotes);
          if (draftHasItems) showNotification('Draft restored', 'success');
        }

        // ── Final fallback: hydrate from already-submitted work_items ─────
        // If neither the DB draft nor localStorage produced anything, the user
        // may have already submitted today and be back-navigating from the
        // day-complete/survey page. Pull today's own items so the form isn't
        // empty and a resubmit doesn't wipe them.
        if (!draftHasItems) {
          try {
            const histRes = await fetch(`/api/job-orders/${params.id}/work-history`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (histRes.ok) {
              const histJson = await histRes.json();
              // ONLY this user's rows. /work-history returns every crew
              // member's work_items for the job; hydrating from all of them
              // pre-filled a co-operator's form with the LEAD's items, and
              // submitting re-inserted them stamped with the co-operator's
              // operator_id — silently duplicating the lead's work under
              // someone else's name and defeating per-person attribution.
              const allItems: any[] = (histJson?.data?.work_items || []).filter(
                (wi: any) => wi.operator_id === session.user.id,
              );
              if (allItems.length > 0) {
                // ONLY items this operator submitted TODAY.
                //
                // This used to take the highest day_number and call it "today".
                // On a multi-day job that is simply wrong: open day 2 before
                // entering anything and the highest day_number rows are still
                // DAY ONE's. The day's log is the authority on what "today"
                // means — no log for today means nothing has been submitted
                // today, and the form correctly stays empty.
                const todayYMD = toLocalYMD();
                const myLogToday = (histJson?.data?.logs || []).find(
                  (l: any) => l.operator_id === session.user.id && l.log_date === todayYMD,
                );
                const todayItems = myLogToday
                  ? allItems.filter((wi: any) => wi.daily_log_id === myLogToday.id)
                  : [];
                if (todayItems.length > 0) {
                  const hydrated: WorkItem[] = todayItems.map((wi) => ({
                    name: wi.work_type,
                    quantity: Number(wi.quantity) || 1,
                    notes: wi.notes || undefined,
                    details: wi.details_json || undefined,
                  }));
                  setSelectedItems(hydrated);
                  setHydrationToken((t) => t + 1);
                  showNotification('Loaded what you already submitted today', 'success');
                }
              }
            }
          } catch { /* non-critical — leave form empty */ }
        }
      } catch { /* non-critical */ }
      // Always mark draft as loaded so auto-save can proceed
      draftLoadedRef.current = true;
    };
    loadDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Debounced auto-save: fires 500 ms after any major state change.
  useEffect(() => {
    if (!draftLoadedRef.current) return; // don't save before the draft is loaded
    // Don't overwrite a previously saved draft with a completely empty state
    if (selectedItems.length === 0 && !voiceNotes) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setSaveStatus('saving');
    autoSaveTimerRef.current = setTimeout(async () => {
      const draft = {
        // THE DAY THIS DRAFT BELONGS TO.
        //
        // Without it, a draft keyed only by job id survives the night: the
        // operator submits Monday's work, opens the same multi-day ticket on
        // Tuesday, and every work type he touched yesterday is already ticked.
        // Stamping the date means a stale draft is DISCARDED on load rather
        // than restored.
        forDate: toLocalYMD(),
        selectedItems,
        jobNotes: voiceNotes,
      };

      // ── Save to localStorage immediately (synchronous backup) ───────────
      try {
        localStorage.setItem(`work-draft-${params.id}`, JSON.stringify(draft));
      } catch { /* storage quota — ignore */ }

      // ── Save to DB ─────────────────────────────────────────────────────
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setSaveStatus('error');
          return;
        }
        const res = await fetch(`/api/job-orders/${params.id}/work-performed-draft`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ draft }),
        });
        if (res.ok) {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 3000);
        } else {
          setSaveStatus('error');
        }
      } catch {
        setSaveStatus('error');
      }
    }, 500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems, voiceNotes]);

  // Fetch standby logs for this job
  useEffect(() => {
    const fetchStandbyLogs = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`/api/standby?jobId=${params.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (response.ok) {
          const result = await response.json();
          const logs = result.data || [];
          setStandbyLogs(logs);

          const totalMinutes = logs.reduce((sum: number, log: any) => {
            if (log.ended_at) {
              const start = new Date(log.started_at).getTime();
              const end = new Date(log.ended_at).getTime();
              return sum + Math.round((end - start) / 60000);
            }
            return sum;
          }, 0);
          setTotalStandbyMinutes(totalMinutes);
        }
      } catch (error) {
        console.error('Error fetching standby logs:', error);
      }
    };

    fetchStandbyLogs();
  }, [params.id]);

  const handleSaveEquipmentUsage = async (equipmentData: any) => {
    setSavingEquipment(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showNotification('Session expired. Please log in again.', 'error');
        return;
      }

      const response = await fetch('/api/equipment-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ job_order_id: params.id, ...equipmentData })
      });

      const result = await response.json();

      if (result.success) {
        setEquipmentUsageEntries(prev => [...prev, result.data]);
        setShowEquipmentForm(false);
        showNotification('Equipment usage saved!', 'success');
      } else {
        showNotification('Failed to save equipment usage: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('Error saving equipment usage:', error);
      showNotification('Failed to save equipment usage', 'error');
    } finally {
      setSavingEquipment(false);
    }
  };

  const handleRemoveEquipmentEntry = async (entryId: string) => {
    if (!confirm('Are you sure you want to remove this equipment usage entry?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/equipment-usage/${entryId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      const result = await response.json();

      if (result.success) {
        setEquipmentUsageEntries(prev => prev.filter(entry => entry.id !== entryId));
        showNotification('Equipment usage entry removed', 'success');
      } else {
        showNotification('Failed to remove entry: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('Error removing equipment entry:', error);
      showNotification('Failed to remove entry', 'error');
    }
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      showNotification('Tap what you did first — then fill in the numbers', 'warning');
      return;
    }

    // A ticked work type with nothing entered is not a record of anything.
    // Operators tick everything first, which means they can reach Submit with
    // types still empty — name them so it's one tap to fix, rather than sending
    // the office a row that says a work type happened and nothing about it.
    if (pendingNames.length > 0) {
      const names = pendingNames.join(', ');
      showNotification(
        pendingNames.length === 1
          ? `Add the measurements for ${names} before submitting.`
          : `${pendingNames.length} work types still need measurements: ${names}`,
        'warning'
      );
      return;
    }

    // PHOTOS ARE OPTIONAL HERE (founder, Aug 3 2026 — an operator was standing
    // on a jobsite unable to submit his day). Requiring a photo to log work
    // performed blocks the day's numbers on a slow upload over site LTE. The
    // photo requirement lives at JOB COMPLETION, immediately before the
    // customer signature — that's the record that actually needs evidence.
    setPhotoError(null);

    if (isSubmitting) return;
    setIsSubmitting(true);

    /** How many photos failed to reach the job, 0 when all of them landed. */
    let photoSaveFailed = 0;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // Save work items to the database (primary storage). ONE write path.
        const res = await fetch(`/api/job-orders/${params.id}/work-items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            items: selectedItems,
            dayNumber: currentDayNumber,
            notes: voiceNotes || undefined,
            difficulty: difficulty || undefined,
            difficultyNotes: difficultyNotes.trim() || undefined,
            // Operator-local calendar date — the row's identity, and what the
            // server replaces on (never toISOString; UTC shifts the day).
            workDate,
          })
        });

        if (!res.ok) {
          // THE MOST EXPENSIVE LINE IN THIS FILE USED TO BE THE ONE THAT WASN'T
          // HERE: a `return`.
          //
          // This branch logged to a console nobody reads and then fell straight
          // through to `showNotification('Work performed saved!')` and a
          // navigation to day-complete. The operator finished their day, saw the
          // word "saved", walked away — and the work was never written. There is
          // no background sync that would pick it up later: the localStorage
          // copy below is only ever read to PREFILL this form, and
          // NetworkMonitor's "Changes will sync when you reconnect" does nothing
          // but dismiss its own toast.
          //
          // That is how a day of billable cutting disappears quietly, which is
          // strictly worse than an error, because an error gets retried.
          //
          // Now: stop here, keep everything they typed (state and draft are both
          // untouched), and say plainly that it did not save.
          const detail = await res.json().catch(() => null);
          console.error('Failed to save work items to DB', res.status, detail);
          setSaveError(
            detail?.error ||
              'Your work could not be saved. Nothing has been lost — check your signal and tap Retry.'
          );
          setIsSubmitting(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        // /api/equipment/track-usage DOES NOT EXIST — there is no
        // app/api/equipment directory. This fired a 404 on every single
        // submission and swallowed it into a console line nobody reads. Blade
        // usage is captured on the Equipment Usage form below. Removed rather
        // than carried forward one more time.

        // ── SAVE THE PHOTOS, AND WAIT FOR IT ────────────────────────────────
        //
        // This used to be fire-and-forget with a `.catch(console.error)`, and
        // the page navigated 800ms later. The screen the operator lands on
        // reads the job's photos ONCE, at mount — so on weak site LTE the read
        // beat the write, found nothing, and demanded photos he had just taken.
        // On an outright failure the photos never reached `photo_urls` at all,
        // while the copy above promises him they are the whole day's
        // requirement. A promise carried by a request nobody waits for is not a
        // promise.
        //
        // Only URLs not already accepted by the server are sent: this endpoint
        // APPENDS, so a retry that re-sent the whole list would store every
        // photo twice on the job. That is also why the failure is not queued to
        // the outbox — a background replay racing a manual retry double-writes
        // the array, and there is no server-side de-duplication to catch it.
        // An immediate, honest error with a one-tap retry is the safer trade.
        const unsavedPhotos = jobPhotos.filter((u) => !savedPhotoUrls.current.has(u));
        if (unsavedPhotos.length > 0) {
          // Bounded: the operator is standing on a jobsite, not watching a
          // spinner. The files are ALREADY in storage by this point — this is a
          // small JSON write — so 20s is generous, not tight.
          const photoTimeout = new AbortController();
          const timer = setTimeout(() => photoTimeout.abort(), 20_000);
          let photoOk = false;
          try {
            const photoRes = await fetch(`/api/job-orders/${params.id}/photos`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
              },
              body: JSON.stringify({ photo_urls: unsavedPhotos }),
              signal: photoTimeout.signal,
            });
            photoOk = photoRes.ok;
            if (!photoOk) {
              console.error('Photo save failed', photoRes.status);
            }
          } catch (err) {
            console.error('Photo save error:', err);
          } finally {
            clearTimeout(timer);
          }

          if (photoOk) {
            // Accepted by the server — never send these again from this screen.
            unsavedPhotos.forEach((u) => savedPhotoUrls.current.add(u));
            setPhotoError(null);
          } else {
            // Flagged, not returned: the day's numbers, the localStorage backup
            // and the workflow step below all still deserve to run. Only the
            // NAVIGATION is withheld — see the branch further down.
            photoSaveFailed = unsavedPhotos.length;
          }
        }

        // Update workflow tracking (fire and forget)
        fetch('/api/workflow', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            jobId: params.id,
            completedStep: 'work_performed',
            currentStep: 'day_complete',
          })
        }).catch(() => {});
      }

      // Also save to localStorage as backup
      const workPerformedData = {
        jobId: params.id,
        items: selectedItems,
        photos: jobPhotos,
        notes: voiceNotes || '',
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(`work-performed-${params.id}`, JSON.stringify(workPerformedData));

      // The draft is deliberately KEPT here: it belongs to "today's in-progress
      // work", and pressing Back from the day-complete page must still show
      // what they entered. It no longer leaks into tomorrow — the draft carries
      // the date it was written for and is discarded on load if that isn't today.

      // THE PHOTOS DID NOT LAND. The day's work DID — the early return above
      // guarantees it, so nothing needs re-typing. Stop here rather than
      // navigating: the next screen would show a bare required uploader with no
      // explanation, which is exactly the second ask this change exists to
      // remove, and the copy in the photo section has just promised him the
      // opposite. He can tap Submit again (only the unsaved photos are re-sent),
      // or take the explicit way out rendered under the message.
      if (photoSaveFailed > 0) {
        setPhotoError(
          `Your work is saved, but ${photoSaveFailed === 1 ? 'the photo' : `${photoSaveFailed} photos`} did not upload — check your signal and tap Submit again. If you keep going, you'll be asked for photos again at day's end.`
        );
        document.getElementById('job-photos-section')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        return; // `finally` clears isSubmitting — the button re-arms itself.
      }

      showNotification('Work performed saved!', 'success');

      // Clear resume-last-position marker on successful submission
      localStorage.removeItem(`job_last_page_${params.id}`);

      // Crew co-operator: NO day-complete/survey — the lead completes the
      // ticket. Show the submitted confirmation instead of navigating.
      if (isCoOperator) {
        setCoOpSubmitted(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      setTimeout(() => {
        router.push(`/dashboard/job-schedule/${params.id}/day-complete`);
      }, 800);
    } catch (error) {
      console.error('Error submitting work performed:', error);
      // NO SIGNAL IS NOT A FAILURE — IT IS A DELAY (founder, Aug 16: "they try
      // to complete information but they don't have service; how can we resolve
      // that to ensure there is still a way for them to save information?").
      //
      // This used to write a localStorage copy that nothing ever re-sent, and
      // then navigate forward to day-complete — which reads exactly like
      // success. A dropped connection in a parking garage became a lost day of
      // cutting.
      //
      // Now the submission goes into the outbox and is re-sent automatically
      // when the phone gets a connection. Safe to retry because the server
      // REPLACES on (job, operator, work_date) rather than appending, so a
      // duplicate send is a no-op. The operator can walk away.
      const workPerformedData = {
        jobId: params.id,
        items: selectedItems,
        photos: jobPhotos,
        notes: voiceNotes || '',
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(`work-performed-${params.id}`, JSON.stringify(workPerformedData));
      // NOTE: draft preserved on purpose — see comment in the success path.

      enqueue(localStorage, {
        id: `work-items-${params.id}-${workDate}`,
        url: `/api/job-orders/${params.id}/work-items`,
        method: 'POST',
        body: JSON.stringify({
          items: selectedItems,
          dayNumber: currentDayNumber,
          notes: voiceNotes || undefined,
          difficulty: difficulty || undefined,
          difficultyNotes: difficultyNotes.trim() || undefined,
          workDate,
        }),
        // This page never loads the customer name, so the label names the day
        // instead — which is the part that matters when the office asks "which
        // ticket is still sitting on your phone?".
        label: `Work performed · ${formatDayLong(workDate)}`,
      });

      setQueuedOffline(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618]">
      {/* Header */}
      <div className="bg-white dark:bg-white/[0.03] border-b border-gray-200 dark:border-white/10 sticky top-0 z-10 shadow-sm pt-safe">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              aria-label="Back to job"
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-gray-100 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-all"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <button
              onClick={() => { localStorage.removeItem(`job_last_page_${params.id}`); router.push('/dashboard'); }}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              title="Dashboard"
            >
              <Home className="w-5 h-5 text-gray-600 dark:text-white" />
            </button>
            {/* THE HEADER MUST NEVER CHANGE HEIGHT.
                It used to mount/unmount the "Saving…" / "Saved ✓" indicator
                inline next to a subtitle that wraps on a phone. Every click on
                this page triggers the autosave, so the header reflowed
                constantly and shoved the content below it — the operator would
                tap a field and find the page had "slid back up" (founder, Aug
                2026). Now: one row, both lines truncate, and the status sits in
                a fixed-width slot that is always present. */}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">Work Performed</h1>
              <div className="flex items-center gap-2 h-4">
                <p className="text-gray-500 dark:text-white/50 text-xs truncate">Tap what you did, then fill it in</p>
                <span
                  aria-live="polite"
                  className="w-[62px] flex-shrink-0 text-xs flex items-center gap-1 justify-end"
                >
                  {saveStatus === 'saving' && (
                    <span className="text-gray-400 dark:text-white/30 flex items-center gap-1">
                      <Save className="w-3 h-3 animate-pulse" />
                      <span className="hidden xs:inline">Saving…</span>
                    </span>
                  )}
                  {saveStatus === 'saved' && (
                    <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                      <Save className="w-3 h-3" />
                      <span className="hidden xs:inline">Saved</span>
                      <span className="xs:hidden">✓</span>
                    </span>
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <DarkModeIconToggle />
              {selectedItems.length > 0 && (
                <span className="px-2 py-1.5 bg-brand/10 dark:bg-brand/20 text-brand rounded-xl text-xs font-semibold border border-brand/30">
                  {selectedItems.length}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 pb-32 max-w-lg">
        {/* A save that failed has to LOOK like a save that failed. This banner
            and the missing navigation are the whole fix — the operator stays
            here, with everything they typed, until it actually lands. */}
        {/* Held on the phone, not lost. Green rather than red on purpose: the
            operator did their job, the network didn't. Nothing to redo. */}
        {queuedOffline && (
          <div className="mb-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-400/40 dark:bg-emerald-500/10">
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
              Saved on your phone
            </p>
            <p className="mt-1 text-sm leading-relaxed text-emerald-700 dark:text-emerald-200/80">
              You have no signal right now, so this is being held and will send by itself as soon
              as you do. You can close the app — it will still go. Nothing to type again.
            </p>
            <button
              type="button"
              onClick={() => { setQueuedOffline(false); goBack(); }}
              className="mt-3 w-full min-h-[48px] rounded-xl bg-emerald-600 px-4 text-base font-bold text-white hover:bg-emerald-700 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {saveError && (
          <div className="mb-4 rounded-2xl border-2 border-red-300 bg-red-50 p-4 dark:border-red-400/40 dark:bg-red-500/10">
            <p className="text-sm font-bold text-red-800 dark:text-red-200">Not saved yet</p>
            <p className="mt-1 text-sm leading-relaxed text-red-700 dark:text-red-200/80">
              {saveError}
            </p>
            <button
              type="button"
              onClick={() => { setSaveError(null); void handleSubmit(); }}
              disabled={isSubmitting}
              className="
                mt-3 w-full min-h-[48px] rounded-xl bg-red-600 px-4 text-base font-bold text-white
                hover:bg-red-700 disabled:opacity-60 transition-colors
              "
            >
              {isSubmitting ? 'Sending…' : 'Retry'}
            </button>
          </div>
        )}

        {/* Quick Access Buttons */}
        <QuickAccessButtons jobId={params.id as string} />

        {/* ─── Crew co-operator: work submitted confirmation ───────────── */}
        {coOpSubmitted && (
          <div className="mb-6 bg-white dark:bg-white/[0.05] rounded-2xl border border-indigo-200 dark:border-indigo-500/40 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-blue-600 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-base">Your work is submitted ✓</p>
                <p className="text-indigo-100 text-xs mt-0.5">
                  {leadName ? `${leadName} completes the ticket.` : 'The lead operator completes the ticket.'}
                </p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Your items are on the ticket under your name. You can come back and
                resubmit to update what YOU logged — other crew members&apos; work is untouched.
              </p>
              <button
                onClick={goBack}
                className="w-full min-h-[44px] py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors"
              >
                Back to Job
              </button>
            </div>
          </div>
        )}

        {/* ─── Day Already Submitted — Locked Card ───────────────────── */}
        {dayAlreadySubmitted && (
          <div className="space-y-4 mb-6">
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-green-200 dark:border-green-800/50 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-base">Done for Today ✓</p>
                  <p className="text-emerald-100 text-xs mt-0.5">Your work log for today has been saved.</p>
                </div>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  This form is now locked. Your supervisor has received your work log.
                  Need to add something? Leave a note below.
                </p>

                {/* START THIS DAY OVER. Founder, Aug 2026: an operator who typed
                    the wrong footage or picked the wrong work type had no way
                    back — their only options were to leave a wrong number on
                    the customer's ticket or ring the office. This clears THEIR
                    OWN work for THIS DAY only; it can't touch a crewmate's
                    entry and it refuses once the job is completed and signed. */}
                <button
                  type="button"
                  onClick={async () => {
                    const ok = window.confirm(
                      `Start this day's ticket over?\n\nEverything you entered for ${formatDayLong(workDate)} will be deleted and you'll type it in again. Your crewmates' entries are not affected.`
                    );
                    if (!ok) return;
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session) { showNotification('Please sign in again.', 'error'); return; }
                      const res = await fetch(`/api/job-orders/${params.id}/reset-day`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({ date: workDate }),
                      });
                      const json = await res.json().catch(() => null);
                      if (!res.ok) {
                        showNotification(json?.error || 'Could not reset the ticket.', 'error');
                        return;
                      }
                      // Clear the local mirror too, or the old numbers come back.
                      localStorage.removeItem(`work-performed-${params.id}`);
                      localStorage.removeItem(`work-draft-${params.id}`);
                      window.location.reload();
                    } catch {
                      showNotification('Could not reset the ticket. Check your signal and try again.', 'error');
                    }
                  }}
                  className="w-full min-h-[44px] px-4 py-3 rounded-xl border-2 border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 font-bold text-sm hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
                >
                  Entered something wrong? Start this day over
                </button>

                {noteSubmitted && (
                  <div className="mt-4 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Note sent to supervisor ✓</p>
                  </div>
                )}

                <button
                  onClick={() => setShowNoteForm(v => !v)}
                  className="mt-4 w-full min-h-[44px] flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquarePlus className="w-4 h-4 text-brand" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Add a note or amendment?</span>
                  </div>
                  {showNoteForm
                    ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  }
                </button>

                {showNoteForm && (
                  <div className="mt-3 space-y-3">
                    <textarea
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Leave a note for your supervisor..."
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.07] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 text-base focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand resize-none"
                    />
                    <button
                      onClick={handleSubmitNote}
                      disabled={noteSubmitting || !noteContent.trim()}
                      className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-gradient-to-r from-brand to-brand-accent hover:from-brand/90 hover:to-brand-accent/90 text-white py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 shadow-sm"
                    >
                      {noteSubmitting
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                        : <><Send className="w-4 h-4" /> Submit Note</>
                      }
                    </button>
                  </div>
                )}
              </div>
            </div>

            {submittedNotes.length > 0 && (
              <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03]">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Notes Submitted Today</p>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {submittedNotes.map((note) => (
                    <li key={note.id} className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(note.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          {note.author_name ? ` · ${note.author_name}` : ''}
                        </p>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{note.content}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={() => router.push('/dashboard/my-jobs')}
              className="w-full min-h-[44px] py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
            >
              Back to My Jobs
            </button>
          </div>
        )}

        {!dayAlreadySubmitted && !coOpSubmitted && (
          <>
            {/* Filling in a PREVIOUS day — say so loudly. An operator catching
                up on yesterday must never be in doubt about which day their
                numbers are landing on. */}
            {isBackfill && (
              <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/40 p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    You&apos;re filling in {formatDayLong(workDate)}
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-0.5">
                    This work will be recorded against that day, not today.
                  </p>
                </div>
              </div>
            )}

            {/* ── THE FORM — same shape as the office's Scope of Work ────── */}
            <WorkEntryForm
              items={selectedItems}
              hydrationToken={hydrationToken}
              recommended={recommended}
              onChange={handleEntriesChange}
            />

            {/* Standby Time Summary — informational, recorded elsewhere */}
            {standbyLogs.length > 0 && (
              <div className="mt-5 bg-yellow-50 dark:bg-yellow-500/10 border-2 border-yellow-300 dark:border-yellow-500/30 rounded-2xl p-4">
                <h3 className="font-bold text-yellow-900 dark:text-yellow-200 mb-2">⏱️ Standby Time Recorded</h3>
                <div className="space-y-2">
                  {standbyLogs.map((log, index) => {
                    const start = new Date(log.started_at);
                    const end = log.ended_at ? new Date(log.ended_at) : null;
                    const durationMinutes = end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0;
                    const hours = Math.floor(durationMinutes / 60);
                    const minutes = durationMinutes % 60;
                    return (
                      <div key={log.id || index} className="bg-white dark:bg-white/[0.05] rounded-xl p-3 border border-yellow-200 dark:border-yellow-500/20 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                            {start.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                            {end && (
                              <span className="text-gray-500 dark:text-white/50"> → {end.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                            )}
                          </p>
                          {log.reason && <p className="text-xs text-gray-600 dark:text-white/50 mt-0.5">Reason: {log.reason}</p>}
                        </div>
                        <p className="text-lg font-bold text-yellow-700 dark:text-yellow-300 flex-shrink-0">
                          {hours > 0 ? `${hours}h ` : ''}{minutes}m
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-3 border-t-2 border-yellow-300 dark:border-yellow-500/30 flex items-center justify-between">
                  <p className="font-bold text-yellow-900 dark:text-yellow-200">Total Standby Time:</p>
                  <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                    {Math.floor(totalStandbyMinutes / 60) > 0 ? `${Math.floor(totalStandbyMinutes / 60)}h ` : ''}
                    {totalStandbyMinutes % 60}m
                  </p>
                </div>
              </div>
            )}

            {/* Job Photos — OPTIONAL on this screen. The requirement lives at
                job completion, before the customer signature. */}
            <div id="job-photos-section" className="mt-5 bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Camera className="w-5 h-5 text-brand" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Job Photos</h3>
                {!photosProhibited && (
                  <span className="text-xs text-gray-400 dark:text-white/40">(optional)</span>
                )}
              </div>

              {photosProhibited ? (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    Photos are not permitted at this jobsite
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 mb-3">
                    The office flagged this site as photo-prohibited (secure facility). Confirm to skip photos for this submission.
                  </p>
                  {photosSkipAcknowledged ? (
                    <p className="text-xs font-semibold text-green-700 dark:text-green-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Photos skipped — not allowed on site
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setPhotosSkipAcknowledged(true); setPhotoError(null); }}
                      className="min-h-[44px] px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors"
                    >
                      Skip photos (not allowed on site)
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* SAY THE ONCE-ONLY RULE OUT LOUD (founder, Aug 20 2026).
                      Day-complete now counts anything filed on this job today,
                      so photos added here are the whole day's requirement — but
                      the crew only stops resenting the second screen if they
                      know that BEFORE they get to it. */}
                  <p className="text-xs text-gray-500 dark:text-white/50 mb-3">
                    Add them here and you won&apos;t be asked again when you close out —
                    photos are needed once a shift, not on every screen.
                  </p>
                  <PhotoUploader
                    bucket="job-photos"
                    pathPrefix={params.id as string}
                    photos={jobPhotos}
                    onPhotosChange={(p) => { setJobPhotos(p); if (p.length > 0) setPhotoError(null); }}
                    maxPhotos={10}
                    label="Add Job Photos"
                    lightMode={true}
                    captureLocation
                    jobId={params.id as string}
                  />
                  <div className="mt-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3 flex items-start gap-2">
                    <span className="text-blue-500 text-lg flex-shrink-0">📸</span>
                    <div>
                      <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Showcase your work!</p>
                      <p className="text-xs text-blue-700 dark:text-blue-400">
                        Photos of you and your crew working are encouraged — they demonstrate professionalism and effort to the customer.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* THE PHOTO WRITE FAILED. The day's work is already saved — say
                  so first, because "error" on this screen used to mean a lost
                  day. Then a way forward that is never a dead end: tap Submit
                  again, or go on and take the second ask at day's end. The
                  second option exists so a phone with no signal cannot trap an
                  operator on a jobsite. */}
              {photoError && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/20 dark:bg-red-500/10">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300">{photoError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoError(null);
                      localStorage.removeItem(`job_last_page_${params.id}`);
                      if (isCoOperator) {
                        setCoOpSubmitted(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        return;
                      }
                      router.push(`/dashboard/job-schedule/${params.id}/day-complete`);
                    }}
                    className="mt-3 w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-red-300 dark:border-red-500/30 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                  >
                    Keep going without the photos
                  </button>
                </div>
              )}
            </div>

            {/* Description of Work — the office form's last field, and the
                operator's equivalent: what happened across the whole day.
                Per-work-type detail belongs in that type's Quick notes. */}
            <div className="mt-4 bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Mic className="w-5 h-5 text-brand" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Description of Work — the whole day</h3>
                <span className="text-xs text-gray-400 dark:text-white/40">(voice or typed)</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-white/50 mb-3">
                Anything about the day overall — site conditions, hold-ups, who you worked with.
                Notes about a <span className="font-semibold">specific work type</span> go in that card&apos;s Quick notes instead.
              </p>
              <VoiceMemoNotes
                notes={voiceNotes}
                onNotesChange={setVoiceNotes}
                placeholder="Tap the mic and describe what you did today..."
              />
            </div>

            {/* Job Difficulty — one tap, stored with the work items so the
                office sees how hard the site actually was */}
            <div className="mt-4 bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-5 h-5 text-brand" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">How difficult was this work?</h3>
                <span className="text-xs text-gray-400 dark:text-white/40">(optional)</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'easy', label: 'Easy', active: 'bg-green-500 text-white ring-1 ring-green-400' },
                  { value: 'moderate', label: 'Moderate', active: 'bg-amber-500 text-white ring-1 ring-amber-400' },
                  { value: 'difficult', label: 'Difficult', active: 'bg-red-500 text-white ring-1 ring-red-400' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDifficulty(difficulty === opt.value ? '' : opt.value)}
                    className={`min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      difficulty === opt.value
                        ? opt.active
                        : 'bg-gray-50 dark:bg-white/[0.05] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {difficulty && (
                <input
                  type="text"
                  value={difficultyNotes}
                  onChange={(e) => setDifficultyNotes(e.target.value)}
                  placeholder="What made it that way? (optional)"
                  className="mt-3 w-full px-4 py-3 bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 rounded-xl text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
              )}
            </div>

            {/* Equipment Usage — optional, collapsed. It is job-COSTING detail,
                not part of the ticket, so it stays out of the operator's way
                until they open it. */}
            {selectedItems.length > 0 && (
              <div className="mt-4 bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowEquipmentSection(v => !v)}
                  className="w-full min-h-[44px] flex items-center justify-between gap-2 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Wrench className="w-5 h-5 text-brand flex-shrink-0" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      Equipment usage <span className="font-medium text-gray-400 dark:text-white/40">(optional)</span>
                    </h3>
                    {equipmentUsageEntries.length > 0 && (
                      <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/30">
                        {equipmentUsageEntries.length}
                      </span>
                    )}
                  </div>
                  {showEquipmentSection
                    ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  }
                </button>

                {showEquipmentSection && (
                  <div className="px-5 pb-5 space-y-3">
                    <button
                      onClick={() => setShowEquipmentForm(true)}
                      disabled={savingEquipment}
                      className="w-full min-h-[44px] px-4 py-3 bg-gradient-to-r from-brand to-brand-accent text-white rounded-xl font-bold text-sm transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      Add Equipment Usage
                    </button>

                    {equipmentUsageEntries.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-white/50 text-center py-2">
                        Nothing tracked yet — linear feet, blade usage and resource consumption.
                      </p>
                    ) : (
                      equipmentUsageEntries.map((entry, index) => (
                        <div key={entry.id || index} className="bg-gray-50 dark:bg-white/[0.03] rounded-xl p-4 border border-gray-200 dark:border-white/10">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 grid grid-cols-2 gap-3 flex-1">
                              <div>
                                <p className="text-[11px] font-bold text-gray-500 dark:text-white/40 uppercase">Equipment</p>
                                <p className="text-sm font-bold text-gray-900 dark:text-white break-words">
                                  {String(entry.equipment_type || '').replace(/_/g, ' ').toUpperCase()}
                                </p>
                              </div>
                              <div>
                                <p className="text-[11px] font-bold text-gray-500 dark:text-white/40 uppercase">Linear Feet</p>
                                <p className="text-sm font-bold text-brand">{entry.linear_feet_cut} ft</p>
                              </div>
                              <div>
                                <p className="text-[11px] font-bold text-gray-500 dark:text-white/40 uppercase">Difficulty</p>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">{String(entry.difficulty_level || '').toUpperCase()}</p>
                              </div>
                              <div>
                                <p className="text-[11px] font-bold text-gray-500 dark:text-white/40 uppercase">Blades Used</p>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">{entry.blades_used || 0}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveEquipmentEntry(entry.id)}
                              aria-label="Remove equipment entry"
                              className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-red-50 dark:bg-red-500/10 text-red-600 rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {entry.notes && (
                            <p className="mt-3 pt-3 border-t border-gray-200 dark:border-white/10 text-sm text-gray-700 dark:text-white/70">
                              {entry.notes}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Submit bar.
            EVERYTHING IS ALREADY COMMITTED BY THE TIME THIS IS PRESSED. The
            old screen held holes and cuts in a detail panel's own state until
            an "Add Work Item" button copied them into the submission, so this
            bar had to be HIDDEN while that panel was open — Devin and Zack hit
            exactly that on Aug 10: they entered "6 bit, 10in deep, 7 holes",
            pressed Next, and were told to add the measurements they were
            looking at. There is no uncommitted state left to strand: every
            keystroke lands in the item list, so the bar can safely stay put. */}
        {selectedItems.length > 0 && !dayAlreadySubmitted && !coOpSubmitted && (
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#0b0618]/95 backdrop-blur-lg border-t border-gray-200 dark:border-white/10 p-4 pb-safe-4 z-50">
            <div className="container mx-auto max-w-lg">
              {pendingNames.length > 0 && (
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 text-center mb-2">
                  {pendingNames.length} still need{pendingNames.length === 1 ? 's' : ''} measurements: {pendingNames.join(', ')}
                </p>
              )}
              {/* Co-operator: submit YOUR work — the lead runs day-complete. */}
              {isCoOperator && (
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 text-center mb-2">
                  Submit your work — {leadName || 'the lead operator'} completes the ticket
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={goBack}
                  className="flex-shrink-0 min-h-[48px] px-5 py-3.5 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-all font-semibold text-sm border border-gray-200 dark:border-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 min-h-[48px] py-3.5 bg-gradient-to-r from-brand to-brand-accent hover:from-brand/90 hover:to-brand-accent/90 text-white rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  {isSubmitting ? 'Saving...' : isCoOperator ? 'Submit My Work' : 'Next: Job Survey'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Equipment Usage Form Modal */}
      {showEquipmentForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="w-full sm:my-8">
            <EquipmentUsageForm
              onSave={handleSaveEquipmentUsage}
              onCancel={() => setShowEquipmentForm(false)}
            />
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-[60] animate-slide-in">
          <div className={`rounded-2xl shadow-2xl p-4 flex items-center gap-3 max-w-[calc(100vw-2rem)] sm:min-w-[300px] ${
            notification.type === 'success' ? 'bg-green-500 text-white' :
            notification.type === 'error' ? 'bg-red-500 text-white' :
            'bg-yellow-500 text-white'
          }`}>
            <p className="font-semibold">{notification.message}</p>
            <button
              onClick={() => setNotification(null)}
              aria-label="Dismiss"
              className="ml-auto flex-shrink-0 hover:bg-white/20 rounded-lg p-1 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
