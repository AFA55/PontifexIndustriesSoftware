'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamicImport from 'next/dynamic';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { toLocalYMD, formatDayLong } from '@/lib/dates';
import QuickAccessButtons from '@/components/QuickAccessButtons';
import { Camera, Mic, Save, Zap, Home, CheckCircle2, ChevronDown, ChevronUp, Send, Loader2, MessageSquarePlus, Clock } from 'lucide-react';
import { DarkModeIconToggle } from '@/components/ui/DarkModeToggle';
import { NumberInput } from '@/components/ui/NumberInput';
import { RebarSizePicker } from '@/components/ui/RebarSizePicker';
import { rebarLabel } from '@/lib/work-items-format';

const EquipmentUsageForm = dynamicImport(() => import('@/components/EquipmentUsageForm'), {
  ssr: false,
  loading: () => null,
});
const RecommendedItems = dynamicImport(() => import('./_components/RecommendedItems'), {
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

// Organized work item categories based on DSM screenshots
const WORK_CATEGORIES = {
  'Core Drilling': [
    'CORE DRILL',
    'HYDRAULIC CORE DRILL',
    'SPOT/CAUGHT CORES'
  ],
  'Sawing': [
    'SLAB SAW',
    'ELECTRIC SLAB SAW',
    'WALL SAW',
    'WIRE SAW',
    'HAND SAW',
    'FLUSH CUT HAND SAW',
    'CHAIN SAW',
    'RING SAW',
    'PUSH SAW'
  ],
  'Breaking & Removal': [
    'BREAK & REMOVE',
    'DEMOLITION',
    'REMOVAL',
    'EXCAVATE DIRT',
    'BROKK'
  ],
  'Concrete Work': [
    'POURED/FINISH CONCRETE',
    'REPAIR',
    'GRINDING',
    'CHIPPING'
  ],
  'Installation': [
    'INSTALL BOLLARD(S)',
    'INSTALL LINTEL(S)',
    'MANHOLE BOOT',
    'JOINT SEALING'
  ],
  'Equipment & Tools': [
    'JACK HAMMERING',
    'HAND DRILL',
    'PRESSURE WASH',
    'VACUUMING & WATER CONTROL'
  ],
  'Services': [
    'IMAGE SCAN',
    'SAFETY MEETINGS/ORIENTATION',
    'STANDBY TIME',
    'TRAVEL CHARGE',
    'TRIP CHARGE',
    'HAULING',
    'DELIVER',
    'DUMPSTER CHARGE'
  ],
  'Materials': [
    'MATERIAL(S)',
    'SALE OF'
  ]
};

// Popular/Common items for quick access
const POPULAR_ITEMS = [
  'CORE DRILL',
  'SLAB SAW',
  'WALL SAW',
  'HAND SAW',
  'CHAIN SAW',
  'BREAK & REMOVE',
  'JACK HAMMERING'
];

// ─── Pure helpers (top-level so they aren't recreated each render) ───────────
const requiresDetailedData = (itemName: string) =>
  itemName.includes('CORE DRILL') ||
  itemName.includes('SAW') ||
  itemName.includes('CUTTING');

const isCoreDrilling = (itemName: string) => itemName.includes('CORE DRILL');
const isSawing = (itemName: string) =>
  itemName.includes('SAW') && !itemName.includes('CORE DRILL');
const isHandSaw = (itemName: string) => itemName.includes('HAND SAW');
const isSlabSaw = (itemName: string) => itemName.includes('SLAB SAW');
const isWallSaw = (itemName: string) => itemName.includes('WALL SAW');
const isChainsaw = (itemName: string) => itemName.includes('CHAIN SAW');
const isBreakAndRemove = (itemName: string) =>
  itemName.includes('BREAK & REMOVE') ||
  itemName.includes('REMOVAL') ||
  itemName.includes('DEMOLITION');
const isJackHammering = (itemName: string) =>
  itemName.includes('JACK HAMMERING') || itemName.includes('JACKHAMMER');
const isChipping = (itemName: string) => itemName.includes('CHIPPING');
const isBrokk = (itemName: string) => itemName.includes('BROKK');

/**
 * True for work types with NO specialised measurement form of their own —
 * GRINDING, EXCAVATE DIRT, POURED/FINISH CONCRETE, REPAIR, SPOT/CAUGHT CORES,
 * INSTALL BOLLARD(S), HAULING, MATERIAL(S) and friends.
 *
 * These previously offered the operator NOTHING but a notes box, so the
 * quantity they actually produced never reached the ticket — which is how a
 * customer-signed sheet ends up reading "SLAB SAW — 1" for 120 linear feet.
 * They now get a plain How much? + unit pair.
 */
const hasNoSpecialisedForm = (itemName: string) =>
  !isCoreDrilling(itemName) &&
  !isSawing(itemName) &&
  !isBreakAndRemove(itemName) &&
  !isJackHammering(itemName) &&
  !isChipping(itemName) &&
  !isBrokk(itemName);

/** Sensible default unit per work type, so the operator rarely changes it. */
const defaultUnitFor = (itemName: string): string => {
  const n = itemName.toUpperCase();
  if (n.includes('CORE')) return 'holes';
  if (n.includes('GRINDING') || n.includes('CONCRETE') || n.includes('REPAIR')) return 'sq ft';
  if (n.includes('EXCAVATE') || n.includes('HAUL') || n.includes('DUMPSTER')) return 'loads';
  if (n.includes('INSTALL') || n.includes('BOLLARD') || n.includes('LINTEL') || n.includes('BOOT')) return 'each';
  if (n.includes('SEALING')) return 'linear ft';
  if (n.includes('STANDBY') || n.includes('TRAVEL') || n.includes('MEETING') || n.includes('WASH') || n.includes('VACUUM')) return 'hours';
  if (n.includes('SCAN')) return 'sq ft';
  return 'each';
};

interface WorkItem {
  name: string;
  quantity: number;
  /** QUICK NOTE — the operator's narrative for this item (prep, access,
   *  delays). CANONICAL HOME: persisted to the `work_items.notes` column by
   *  /api/job-orders/[id]/work-items. Also mirrored into `details.notes` so
   *  the legacy details_json.notes readers keep working. */
  notes?: string;
  details?: CoreDrillingDetails | SawingDetails | DemolitionDetails | GeneralDetails;
}

/**
 * The rebar answer, shared by holes / cuts / areas.
 *
 * `rebarSize` is what the operator now answers ("what size rebar did you cut?",
 * replacing the old yes/no "Cut Steel"). `cutSteel` and `steelEncountered` are
 * NOT removed: they are still written, derived from the size by
 * `withRebarCompat()`, because every reader and every already-saved row keys
 * off them. See the storage note in lib/work-items-format.ts.
 */
interface RebarFields {
  /** '#4', or free text ('unknown'), or '' for none. */
  rebarSize?: string;
  cutSteel: boolean;
  steelEncountered?: string;
}

interface CoreDrillingHole extends RebarFields {
  bitSize: string;
  depthInches: number;
  quantity: number;
  plasticSetup: boolean;
}

interface CoreDrillingDetails {
  holes: CoreDrillingHole[];
  notes?: string;
}

interface CutArea extends RebarFields {
  length: number; // in feet
  width: number; // in feet
  depth: number; // in inches
  quantity: number; // number of areas
  overcut: boolean;
  chainsawed: boolean;
  chainsawAreas?: number;
  chainsawWidthInches?: number;
}

interface SawingCut extends RebarFields {
  inputMode: 'linear' | 'area'; // How the cut was specified
  linearFeet: number; // Total linear feet (calculated from areas or direct input)
  cutDepth: number;
  areas?: CutArea[]; // If using area mode
  bladesUsed: string[];
  overcut: boolean;
  chainsawed: boolean;
  chainsawAreas?: number;
  chainsawWidthInches?: number;
}

/**
 * Stamps the legacy fields from the new rebar-size answer, right before an
 * entry is captured. Writing all three keeps EVERY existing reader (the
 * completion-agreement PDF, WorkItemsSummary, the admin renders, the offline
 * localStorage payload) working unchanged, and never rewrites a stored row.
 */
const withRebarCompat = <T extends RebarFields>(entry: T): T => {
  const size = (entry.rebarSize || '').trim();
  return {
    ...entry,
    rebarSize: size,
    cutSteel: size.length > 0,
    steelEncountered: size ? (size.startsWith('#') ? `${size} rebar` : size) : '',
  };
};

/** A fresh, empty rebar answer — spread into every form reset. */
const EMPTY_REBAR: RebarFields = { rebarSize: '', cutSteel: false, steelEncountered: '' };

interface SawingDetails {
  cuts: SawingCut[];
  cutType: 'wet' | 'dry';
  notes?: string;
}

/**
 * Demolition / removal quick entries (break & remove, jack hammering,
 * chipping, Brokk). These used to be flattened into a generated notes STRING,
 * which both destroyed the numbers as data AND overwrote whatever the operator
 * had typed. They now emit real structured detail; `lib/work-items-format.ts`
 * renders the top-level `areas[]` branch. Sawing areas are nested under
 * `cuts[i].areas`, so the two shapes never collide.
 */
interface DemolitionArea {
  length: number; // feet
  width: number; // feet
  depth?: number; // inches (break & remove)
  thickness?: number; // inches (Brokk)
}

interface DemolitionDetails {
  areas: DemolitionArea[];
  totalSquareFeet: number;
  method?: string; // break & remove: how the slab left the site
  equipment?: string; // rigging / jackhammer equipment
  avgThicknessInches?: number;
  notes?: string;
}

interface GeneralDetails {
  duration?: number;
  equipment?: string[];
  notes?: string;
  /** sq ft / linear ft / holes / loads / hours ... — printed next to the qty. */
  unit?: string;
}

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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<WorkItem[]>([]);
  /**
   * Controls the WORK DETAIL PANEL. Named "modal" historically — it is now an
   * INLINE panel that opens below the work-type picker rather than a pop-up.
   *
   * WHY (founder, Aug 2026): tapping a work type used to throw a full-screen
   * overlay over the operator immediately. On a phone, in the field, that hides
   * what you just picked and everything you already added. The flow is now:
   * pick the type, then scroll down and enter every measurement and note in one
   * pass — which is how the crew actually works.
   */
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  /** The inline detail panel, so picking a type can scroll it into view. */
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  /** The search input + its autocomplete dropdown. Used to focus the field after
   *  "Add Another", and to close the dropdown when the operator taps away. */
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const [showAddMoreDialog, setShowAddMoreDialog] = useState(false);
  const [currentItem, setCurrentItem] = useState<string>('');
  const [currentQuantity, setCurrentQuantity] = useState(1);
  /** Unit for work types with no specialised form (sq ft, holes, loads, ...). */
  const [currentUnit, setCurrentUnit] = useState('each');
  const [currentNotes, setCurrentNotes] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [coreDrillingData, setCoreDrillingData] = useState<CoreDrillingDetails>({
    holes: [],
    notes: ''
  });
  const [currentHole, setCurrentHole] = useState<CoreDrillingHole>({
    bitSize: '',
    depthInches: 0,
    quantity: 1,
    plasticSetup: false,
    ...EMPTY_REBAR
  });
  const [sawingData, setSawingData] = useState<SawingDetails>({
    cuts: [],
    cutType: 'wet',
    notes: ''
  });
  const [currentCut, setCurrentCut] = useState<SawingCut>({
    inputMode: 'linear',
    linearFeet: 0,
    cutDepth: 0,
    areas: [],
    bladesUsed: [],
    ...EMPTY_REBAR,
    overcut: false,
    chainsawed: false,
    chainsawAreas: 0,
    chainsawWidthInches: 0
  });
  const [cutInputMode, setCutInputMode] = useState<'linear' | 'area'>('linear');
  const [currentArea, setCurrentArea] = useState<CutArea>({
    length: 0,
    width: 0,
    depth: 0,
    quantity: 1,
    ...EMPTY_REBAR,
    overcut: false,
    chainsawed: false,
    chainsawAreas: 0,
    chainsawWidthInches: 0
  });
  // Structured output of the break&remove / jackhammer / chipping / Brokk
  // quick-entry modals. Null until one of them is applied.
  const [demolitionData, setDemolitionData] = useState<DemolitionDetails | null>(null);
  /** Inline error INSIDE the Break & Remove calculator — a toast renders behind
   *  the overlay, which is how an operator's footage went missing silently. */
  const [breakRemoveError, setBreakRemoveError] = useState<string | null>(null);
  const [tempAreas, setTempAreas] = useState<CutArea[]>([]);
  const [selectedBlades, setSelectedBlades] = useState<string[]>([]);
  const [customBladeSize, setCustomBladeSize] = useState('');
  const [view, setView] = useState<'search' | 'selected'>('search');
  const [equipmentUsageEntries, setEquipmentUsageEntries] = useState<any[]>([]);
  const [showEquipmentForm, setShowEquipmentForm] = useState(false);
  const [savingEquipment, setSavingEquipment] = useState(false);
  // Per-submission difficulty (replaces the old dead rating states) — sent
  // with the work items and stored on work_items.accessibility_rating/_description.
  const [difficulty, setDifficulty] = useState<'' | 'easy' | 'moderate' | 'difficult'>('');
  const [difficultyNotes, setDifficultyNotes] = useState('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [jobType, setJobType] = useState<string>('');
  const [currentDayNumber, setCurrentDayNumber] = useState<number>(1);
  const [jobPhotos, setJobPhotos] = useState<string[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<string>('');

  // ─── Photo requirement gate ─────────────────────────────────────────────
  // Photos are MANDATORY unless the office flagged the jobsite as
  // photos-prohibited (job_orders.site_compliance.photos_prohibited). When
  // flagged, the operator must explicitly acknowledge the skip instead.
  const [photosProhibited, setPhotosProhibited] = useState(false);
  const [photosSkipAcknowledged, setPhotosSkipAcknowledged] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // ─── Day lock state (read-only if today's daily log already submitted) ──────
  const [dayAlreadySubmitted, setDayAlreadySubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Crew co-operator (job_crew role='operator') ────────────────────────────
  // Full work-performed input, but NO day-complete/survey — the LEAD completes
  // the ticket. After submit they get a confirmation instead of the survey nav.
  const [isCoOperator, setIsCoOperator] = useState(false);
  const [leadName, setLeadName] = useState<string | null>(null);
  const [coOpSubmitted, setCoOpSubmitted] = useState(false);

  // ─── Amendment note state (shown when day is already submitted) ──────────
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteSubmitted, setNoteSubmitted] = useState(false);
  const [submittedNotes, setSubmittedNotes] = useState<Array<{ id: string; content: string; created_at: string; author_name: string }>>([]);

  // ─── Auto-save state ─────────────────────────────────────────────────────────
  type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftLoadedRef = useRef(false);

  // Mark this job as having visited work-performed (for resume-last-position logic)
  useEffect(() => {
    if (params.id) {
      localStorage.setItem(`job_last_page_${params.id}`, 'work-performed');
    }
  }, [params.id]);

  // Back navigation — clears resume key so job ticket doesn't loop back here
  const goBack = () => {
    localStorage.removeItem(`job_last_page_${params.id}`);
    router.push(`/dashboard/my-jobs/${params.id}`);
  };

  // Fetch job type and day number for smart recommendations + correct work item tracking
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
          // Photos-prohibited flag set by the office on the schedule form
          // (site_compliance jsonb) — drives the mandatory-photo gate below.
          setPhotosProhibited(found?.site_compliance?.photos_prohibited === true);
          // Calculate the current day number: total_days_worked + 1 (today is a new day)
          const daysWorked = found?.total_days_worked || 0;
          setCurrentDayNumber(daysWorked + 1);
        }
      } catch (err) {
        console.error('Error fetching job info:', err);
      }
    };
    fetchJobInfo();
  }, [params.id]);

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
          // Has THIS user already closed out today? The daily-log endpoint
          // returns every operator's log for the job, so matching on date
          // alone locked a crew CO-OPERATOR out the moment the lead completed
          // the day — the item picker and submit bar both hang off
          // dayAlreadySubmitted, leaving them no way to log their own work.
          // Day-complete is lead-only, so scope this to the caller's own log.
          const todayLog = (json.logs || []).find(
            (l: any) =>
              l.log_date === today && l.day_completed_at && l.operator_id === session.user.id,
          );
          if (todayLog) {
            setDayAlreadySubmitted(true);
            // Also fetch any existing amendment notes for this job today
            fetchAmendmentNotes(session.access_token);
          }
        }
      } catch { /* non-critical — default to editable */ }
    };
    checkDaySubmitted();
    // Re-check when the operator pages to a different day.
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

  // ─── Draft save/load helpers ──────────────────────────────────────────────────
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

  // Load draft on mount (runs once after job info loads)
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

        // ── Try DB first ──────────────────────────────────────────────────────
        try {
          const res = await fetch(`/api/job-orders/${params.id}/work-performed-draft`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const json = await res.json();
            // API shape: { success, data: { draft } }
            draft = json.data?.draft ?? null;
          }
        } catch { /* network error — fall through to localStorage */ }

        // ── Fallback: localStorage ────────────────────────────────────────────
        if (!draft) {
          try {
            const stored = localStorage.getItem(`work-draft-${params.id}`);
            if (stored) draft = JSON.parse(stored);
          } catch { /* corrupt storage — ignore */ }
        }

        // ── Refuse a draft from a different day ───────────────────────────────
        // A multi-day job keeps its progress, but the ENTRY FORM starts clean
        // every morning (founder, Aug 2026). Older drafts have no `forDate`;
        // those are pre-fix and equally untrustworthy, so they go too.
        if (draft && draft.forDate !== toLocalYMD()) {
          draft = null;
          try {
            localStorage.removeItem(`work-draft-${params.id}`);
          } catch { /* storage unavailable — the date check already saved us */ }
          // Clear the server copy as well, so it can't come back on another device.
          saveDraft(null);
        }

        // ── Restore state ─────────────────────────────────────────────────────
        const draftHasItems = !!(draft && (
          (draft.selectedItems && draft.selectedItems.length > 0) ||
          draft.sawingData ||
          draft.coreDrillingData ||
          (draft.jobNotes !== undefined && draft.jobNotes !== '')
        ));

        if (draft) {
          if (draft.selectedItems?.length > 0) setSelectedItems(draft.selectedItems);
          if (draft.sawingData) setSawingData(draft.sawingData);
          if (draft.coreDrillingData) setCoreDrillingData(draft.coreDrillingData);
          if (draft.jobNotes !== undefined) setVoiceNotes(draft.jobNotes);
          if (draftHasItems) showNotification('Draft restored', 'success');
        }

        // ── Final fallback: hydrate from already-submitted work_items ─────────
        // If neither the DB draft nor localStorage produced anything to render,
        // the user may have already submitted work items today and is now
        // back-navigating from the day-complete/survey page. Pull the most
        // recent day's items from /work-history so the form isn't empty.
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
                // DAY ONE's — so the operator's form came up with yesterday's
                // work already ticked green and he couldn't tell what he had
                // actually entered today. That was the founder's report.
                //
                // The day's log is the authority on what "today" means. Find
                // this operator's log for today's date, then take only the work
                // items linked to it. No log for today means nothing has been
                // submitted today, and the form correctly stays empty.
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

  // Debounced auto-save: fires 500 ms after any major state change
  // (kept >300ms to avoid hammering the API; admin live-status panel polls
  // separately, so this cadence keeps that view current.)
  useEffect(() => {
    if (!draftLoadedRef.current) return; // don't save before draft is loaded
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
        // Tuesday, and every work type he touched yesterday is already ticked
        // green. He can't tell what he's actually entered today. Stamping the
        // date means a stale draft is DISCARDED on load rather than restored,
        // so a missed cleanup can never show him yesterday's answers again.
        forDate: toLocalYMD(),
        selectedItems,
        sawingData,
        coreDrillingData,
        jobNotes: voiceNotes,
      };

      // ── Save to localStorage immediately (synchronous backup) ──────────────
      try {
        localStorage.setItem(`work-draft-${params.id}`, JSON.stringify(draft));
      } catch { /* storage quota — ignore */ }

      // ── Save to DB ────────────────────────────────────────────────────────
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
  }, [selectedItems, sawingData, coreDrillingData, voiceNotes]);

  const [standbyLogs, setStandbyLogs] = useState<any[]>([]);
  const [totalStandbyMinutes, setTotalStandbyMinutes] = useState(0);

  // Quick Entry Modal State (Slab/Wall/Hand Saw)
  const [showQuickEntryModal, setShowQuickEntryModal] = useState(false);
  const [quickEntryCuts, setQuickEntryCuts] = useState<Array<{
    numCuts: number;
    lengthFeet: number;
    depth: number;
  }>>([]);
  const [quickEntryNumCuts, setQuickEntryNumCuts] = useState<number>(1);
  const [quickEntryLengthFeet, setQuickEntryLengthFeet] = useState<number>(0);
  const [quickEntryDepth, setQuickEntryDepth] = useState<number>(0);

  // Chain Saw Quick Entry State (length in inches)
  const [showChainsawModal, setShowChainsawModal] = useState(false);
  const [chainsawCuts, setChainsawCuts] = useState<Array<{
    numCuts: number;
    lengthInches: number;
    depth: number;
  }>>([]);
  const [chainsawNumCuts, setChainsawNumCuts] = useState<number>(1);
  const [chainsawLengthInches, setChainsawLengthInches] = useState<number>(0);
  const [chainsawDepth, setChainsawDepth] = useState<number>(0);

  // Break & Remove Quick Entry State
  const [showBreakRemoveModal, setShowBreakRemoveModal] = useState(false);
  const [breakRemoveAreas, setBreakRemoveAreas] = useState<Array<{
    length: number;
    width: number;
    depth: number;
  }>>([]);
  const [breakRemoveLength, setBreakRemoveLength] = useState<number>(0);
  const [breakRemoveWidth, setBreakRemoveWidth] = useState<number>(0);
  const [breakRemoveDepth, setBreakRemoveDepth] = useState<number>(0);
  const [removalMethod, setRemovalMethod] = useState<string>('');
  const [removalEquipment, setRemovalEquipment] = useState<string>('');

  // Jack Hammering Quick Entry State
  const [showJackhammerModal, setShowJackhammerModal] = useState(false);
  const [jackhammerEquipment, setJackhammerEquipment] = useState<string>('');
  const [jackhammerOther, setJackhammerOther] = useState<string>('');
  const [jackhammerAreas, setJackhammerAreas] = useState<Array<{
    length: number;
    width: number;
  }>>([]);
  const [jackhammerLength, setJackhammerLength] = useState<number>(0);
  const [jackhammerWidth, setJackhammerWidth] = useState<number>(0);

  // Brokk Quick Entry State
  const [showBrokkModal, setShowBrokkModal] = useState(false);
  const [brokkAreas, setBrokkAreas] = useState<Array<{
    length: number;
    width: number;
    thickness: number;
  }>>([]);
  const [brokkLength, setBrokkLength] = useState<number>(0);
  const [brokkWidth, setBrokkWidth] = useState<number>(0);
  const [brokkThickness, setBrokkThickness] = useState<number>(0);

  // Fetch standby logs for this job
  useEffect(() => {
    const fetchStandbyLogs = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`/api/standby?jobId=${params.id}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (response.ok) {
          const result = await response.json();
          const logs = result.data || [];
          setStandbyLogs(logs);

          // Calculate total standby time
          const totalMinutes = logs.reduce((sum: number, log: any) => {
            if (log.ended_at) {
              const start = new Date(log.started_at).getTime();
              const end = new Date(log.ended_at).getTime();
              const minutes = Math.round((end - start) / 60000);
              return sum + minutes;
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

  // Get all available work items
  const getAllItems = () => {
    let items: string[] = [];
    Object.values(WORK_CATEGORIES).forEach(categoryItems => {
      items = [...items, ...categoryItems];
    });
    return items;
  };

  // Filter work items based on search query
  const getFilteredItems = () => {
    const allItems = getAllItems();

    if (!searchQuery) {
      return allItems;
    }

    return allItems.filter(item =>
      item.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowDropdown(value.length > 0);
  };

  /**
   * BATCH 1d — tapping a work type TICKS it. It does not open its fields.
   *
   * WHY (founder): "Tapping one must NOT immediately pop its fields — that is
   * what confuses them. They tick everything they did first." Operators were
   * dropped into a measurement form the instant they touched a work type, so
   * they lost their place in the list and couldn't just say what they'd done.
   *
   * The item goes in with quantity 0 and no details, which is what "still needs
   * measurements" MEANS — derived, never stored, so nothing new has to be
   * written into the JSON operators have already saved.
   */
  const handleTogglePick = (itemName: string) => {
    setSearchQuery('');
    setShowDropdown(false);

    const existing = selectedItems.find((si) => si.name === itemName);

    // TAPPING AN ALREADY-MEASURED ITEM MUST NOT DELETE IT.
    //
    // The picker tiles show a green tick and "Qty: 12" for items that are done,
    // and this flow actively tells operators to go back to the picker ("tick
    // everything first"). A plain toggle would have thrown away every hole and
    // cut behind that tile on a tap that looks like "open it" — with no confirm,
    // no undo, and the 500ms autosave writing the deletion straight to the draft.
    // Removing work has a proper home: the ✕ on the "What you did" list.
    if (existing && !needsMeasurements(existing)) {
      handleSelectItem(itemName);
      return;
    }

    setSelectedItems((prev) =>
      existing
        ? prev.filter((si) => si.name !== itemName)   // ticked but empty — untick
        : [...prev, { name: itemName, quantity: 0 }]
    );
  };

  /**
   * Ticked, but nobody has entered what they actually did yet.
   *
   * OR, not AND. `handleAddItem` always attaches a `details` object for generic
   * work types even when the Amount box was left blank, so an && test let a
   * zero-quantity item through and the list rendered it GREEN as "0 recorded" —
   * a false all-clear on exactly the row this exists to catch.
   */
  const needsMeasurements = (item: WorkItem) => {
    if ((item.quantity ?? 0) > 0) return false;
    const d = item.details as
      | (Partial<CoreDrillingDetails> & Partial<SawingDetails> & Partial<DemolitionDetails>)
      | undefined;
    // A zero quantity is still real if measurements were actually entered.
    const hasRows =
      (Array.isArray(d?.holes) && d!.holes!.length > 0) ||
      (Array.isArray(d?.cuts) && d!.cuts!.length > 0) ||
      (Array.isArray((d as DemolitionDetails | undefined)?.areas) &&
        (d as DemolitionDetails).areas.length > 0);
    return !hasRows;
  };

  const pendingItems = selectedItems.filter(needsMeasurements);

  // Handle item selection from dropdown
  const handleQuickAddItem = (itemName: string) => {
    // Ticks it. Opening the measurement form here is the behaviour batch 1d
    // exists to remove — see handleTogglePick.
    handleTogglePick(itemName);
  };

  // Check if item requires detailed data collection

  const handleSelectItem = (itemName: string) => {
    setCurrentItem(itemName);
    setCurrentQuantity(1);
    // Sensible default unit so the operator rarely has to touch the picker.
    setCurrentUnit(defaultUnitFor(itemName));
    // Prefill the quick note from the already-added item. handleAddItem treats
    // an empty box as "clear the note", so re-opening an item to log more work
    // would otherwise silently wipe what the operator already wrote.
    setCurrentNotes(selectedItems.find(si => si.name === itemName)?.notes ?? '');

    // Reset detailed data forms
    setCoreDrillingData({
      holes: [],
      notes: ''
    });

    setCurrentHole({
      bitSize: '',
      depthInches: 0,
      quantity: 1,
      plasticSetup: false,
      ...EMPTY_REBAR
    });

    setSawingData({
      cuts: [],
      cutType: 'wet',
      notes: ''
    });

    setDemolitionData(null);

    setCurrentCut({
      inputMode: 'linear',
      linearFeet: 0,
      cutDepth: 0,
      areas: [],
      bladesUsed: [],
      ...EMPTY_REBAR,
      overcut: false,
      chainsawed: false,
      chainsawAreas: 0,
      chainsawWidthInches: 0
    });

    setSelectedBlades([]);
    setCustomBladeSize('');
    setCutInputMode('linear');
    setTempAreas([]);
    setCurrentArea({ length: 0, width: 0, depth: 0, quantity: 1, ...EMPTY_REBAR, overcut: false, chainsawed: false, chainsawAreas: 0, chainsawWidthInches: 0 });

    // RE-OPENING AN ITEM MUST NOT WIPE WHAT THEY ALREADY ENTERED.
    //
    // Everything above resets the forms to blank, which was survivable while the
    // only way in was picking a fresh work type. Batch 1d makes "Edit" a
    // first-class button on every item they've already filled in, so a blank
    // form here would show no holes/cuts and then SAVE that emptiness over their
    // real measurements (handleAddItem replaces details for an existing item).
    // Hydrate from what's already stored.
    const existing = selectedItems.find((si) => si.name === itemName);
    const existingDetails = existing?.details as
      | (Partial<CoreDrillingDetails> & Partial<SawingDetails> & Partial<DemolitionDetails>)
      | undefined;
    if (existingDetails) {
      if (Array.isArray(existingDetails.holes)) {
        // notes deliberately NOT hydrated here — currentNotes already carries it,
        // and duplicating it makes an emptied Quick Notes box un-clearable.
        setCoreDrillingData({ holes: existingDetails.holes, notes: '' });
      }
      if (Array.isArray(existingDetails.cuts)) {
        setSawingData({
          cuts: existingDetails.cuts,
          cutType: existingDetails.cutType === 'dry' ? 'dry' : 'wet',
          notes: '', // see the note above — currentNotes owns this
        });
      }
      if (Array.isArray((existingDetails as DemolitionDetails).areas)) {
        setDemolitionData(existing!.details as DemolitionDetails);
      }
      if (typeof existing?.quantity === 'number' && existing.quantity > 0) {
        setCurrentQuantity(existing.quantity);
      }
      // The UNIT is what makes the number mean anything on the customer's
      // ticket ("400" vs "400 sq ft"). Without this, opening a finished generic
      // item to fix a typo reset it to the default and saved that over the
      // operator's choice — GRINDING 400 sq ft became GRINDING 400 each.
      const storedUnit = (existing?.details as GeneralDetails | undefined)?.unit;
      if (storedUnit) setCurrentUnit(storedUnit);
    }

    setShowQuantityModal(true);
  };

  /**
   * Bring the detail panel into view once it has rendered.
   *
   * The panel is inline now, so picking a work type near the top of a long
   * picker would otherwise leave the operator staring at the list with no sign
   * anything happened. Runs after paint so the panel exists to scroll to.
   */
  useEffect(() => {
    if (!showQuantityModal) return;
    // A short delay, not requestAnimationFrame: the panel is inserted into the
    // DOM in this same commit and rAF fires before the browser has laid it out,
    // so scrollIntoView computes a position of 0 and nothing moves (measured).
    const id = setTimeout(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => clearTimeout(id);
  }, [showQuantityModal, currentItem]);

  /**
   * Let the operator dismiss the work-item autocomplete.
   *
   * The list opens on focus and used to have NO way out: tapping the page,
   * pressing Escape and tapping the field again all left it open, covering the
   * Popular Items grid underneath. The only escape was picking something or
   * emptying the box. Tapping away is the gesture people actually try, so
   * honour it — pointerdown so it fires for touch as well as mouse.
   */
  useEffect(() => {
    if (!showDropdown) return;

    const onPointerDown = (e: PointerEvent) => {
      if (searchBoxRef.current?.contains(e.target as Node)) return;
      setShowDropdown(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDropdown(false);
        searchInputRef.current?.blur();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showDropdown]);

  /** The hole still sitting in the input row, or null when it's incomplete.
   *  Shared by "Add This Hole" and the auto-flush in handleAddItem. */
  const buildPendingHole = (): CoreDrillingHole | null => {
    if (!currentHole.bitSize || currentHole.depthInches <= 0) return null;
    return withRebarCompat({ ...currentHole });
  };

  const addHole = () => {
    const holeToAdd = buildPendingHole();
    if (!holeToAdd) {
      showNotification('Please specify both bit size and depth for the hole', 'warning');
      return;
    }

    setCoreDrillingData(prev => ({
      ...prev,
      holes: [...prev.holes, holeToAdd]
    }));

    // Reset current hole for next entry
    setCurrentHole({
      bitSize: '',
      depthInches: 0,
      quantity: 1,
      plasticSetup: false,
      ...EMPTY_REBAR
    });
  };

  const removeHole = (index: number) => {
    setCoreDrillingData(prev => ({
      ...prev,
      holes: prev.holes.filter((_, i) => i !== index)
    }));
  };

  const getTotalHoles = () => {
    return coreDrillingData.holes.reduce((total, hole) => total + hole.quantity, 0);
  };

  /**
   * Every area the operator has entered: the ones already added to the list
   * PLUS one still sitting in the input row. Typing L/W/D and tapping "Add
   * This Cut" without first tapping "Add Area" used to silently drop it.
   */
  const collectAreas = (): CutArea[] => {
    const pending =
      currentArea.length > 0 && currentArea.width > 0 && currentArea.depth > 0
        ? [withRebarCompat({ ...currentArea })]
        : [];
    return [...tempAreas, ...pending];
  };

  /**
   * Builds a cut from the in-progress inputs, or null when nothing usable has
   * been typed. Shared by the "Add This Cut" button and the auto-flush in
   * handleAddItem — blades are deliberately NOT required (the founder: the
   * numbers and the conditions matter, the blade is nice-to-have).
   */
  const buildPendingCut = (): SawingCut | null => {
    if (cutInputMode === 'area') {
      const areas = collectAreas();
      if (areas.length === 0) return null;
      return withRebarCompat({
        inputMode: 'area' as const,
        // Perimeter math (2L + 2W) × qty — we bill linear feet of cut, not sq ft.
        linearFeet: calculateTotalFromAreas(areas),
        // All areas in one cut entry share the depth of the first.
        cutDepth: areas[0].depth,
        areas,
        bladesUsed: [...selectedBlades],
        // The rebar answer in AREA mode is recorded per area, so the cut itself
        // carries the size only if one was somehow set on the cut-level form.
        rebarSize: currentCut.rebarSize,
        cutSteel: currentCut.cutSteel,
        steelEncountered: currentCut.steelEncountered,
        overcut: currentCut.overcut,
        chainsawed: currentCut.chainsawed,
        chainsawAreas: currentCut.chainsawAreas,
        chainsawWidthInches: currentCut.chainsawWidthInches
      });
    }

    if (currentCut.linearFeet <= 0 || currentCut.cutDepth <= 0) return null;
    return withRebarCompat({ ...currentCut, inputMode: 'linear' as const, bladesUsed: [...selectedBlades] });
  };

  const addCut = () => {
    const cutToAdd = buildPendingCut();
    if (!cutToAdd) {
      showNotification(
        cutInputMode === 'area'
          ? 'Add at least one cut area — length, width and depth'
          : 'Please specify both linear feet and cut depth',
        'warning'
      );
      return;
    }

    setSawingData(prev => ({
      ...prev,
      cuts: [...prev.cuts, cutToAdd]
    }));

    // Reset current cut for next entry
    setCurrentCut({
      inputMode: 'linear',
      linearFeet: 0,
      cutDepth: 0,
      areas: [],
      bladesUsed: [],
      ...EMPTY_REBAR,
      overcut: false,
      chainsawed: false,
      chainsawAreas: 0,
      chainsawWidthInches: 0
    });
    setSelectedBlades([]);
    setCustomBladeSize('');
    setCutInputMode('linear');
    setTempAreas([]);
    setCurrentArea({ length: 0, width: 0, depth: 0, quantity: 1, ...EMPTY_REBAR, overcut: false, chainsawed: false, chainsawAreas: 0, chainsawWidthInches: 0 });
  };

  const removeCut = (index: number) => {
    setSawingData(prev => ({
      ...prev,
      cuts: prev.cuts.filter((_, i) => i !== index)
    }));
  };

  const getTotalLinearFeet = () => {
    return sawingData.cuts.reduce((total, cut) => total + cut.linearFeet, 0);
  };

  // Calculate linear feet from area (perimeter: 2 * length + 2 * width) * quantity
  const calculateLinearFeetFromArea = (area: CutArea): number => {
    const perimeter = (2 * area.length) + (2 * area.width);
    return perimeter * (area.quantity || 1);
  };

  // Calculate total linear feet from all areas
  const calculateTotalFromAreas = (areas: CutArea[]): number => {
    return areas.reduce((total, area) => total + calculateLinearFeetFromArea(area), 0);
  };

  // Add an area to the temporary areas list
  const addArea = () => {
    if (currentArea.length <= 0 || currentArea.width <= 0 || currentArea.depth <= 0) {
      showNotification('Please specify length, width, and depth for the area', 'warning');
      return;
    }

    setTempAreas(prev => [...prev, withRebarCompat({ ...currentArea })]);
    setCurrentArea({ length: 0, width: 0, depth: 0, quantity: 1, ...EMPTY_REBAR, overcut: false, chainsawed: false, chainsawAreas: 0, chainsawWidthInches: 0 });
  };

  // Remove an area from temporary areas list
  const removeArea = (index: number) => {
    setTempAreas(prev => prev.filter((_, i) => i !== index));
  };

  // Quick Entry Modal Functions
  const addQuickEntryCut = () => {
    if (quickEntryNumCuts <= 0 || quickEntryLengthFeet <= 0) {
      showNotification('Please specify number of cuts and length', 'warning');
      return;
    }

    const newCut = {
      numCuts: quickEntryNumCuts,
      lengthFeet: quickEntryLengthFeet,
      depth: quickEntryDepth
    };

    setQuickEntryCuts(prev => [...prev, newCut]);

    // Reset inputs
    setQuickEntryNumCuts(1);
    setQuickEntryLengthFeet(0);
    setQuickEntryDepth(0);
  };

  const removeQuickEntryCut = (index: number) => {
    setQuickEntryCuts(prev => prev.filter((_, i) => i !== index));
  };

  const calculateQuickEntryTotal = () => {
    return quickEntryCuts.reduce((total, cut) => {
      return total + (cut.numCuts * cut.lengthFeet);
    }, 0);
  };

  const applyQuickEntry = () => {
    if (quickEntryCuts.length === 0) {
      showNotification('Please add at least one cut entry', 'warning');
      return;
    }

    const totalLinearFeet = calculateQuickEntryTotal();
    // Get depth from the cut entries (not from quickEntryDepth which resets after each add)
    const maxDepth = Math.max(...quickEntryCuts.map(cut => cut.depth || 0));
    setCurrentCut(prev => ({ ...prev, linearFeet: totalLinearFeet, cutDepth: maxDepth }));

    // Close modal and reset
    setShowQuickEntryModal(false);
    setQuickEntryCuts([]);
    setQuickEntryNumCuts(1);
    setQuickEntryLengthFeet(0);
    setQuickEntryDepth(0);
  };

  // Chain Saw Quick Entry Functions
  const addChainsawCut = () => {
    if (chainsawNumCuts <= 0 || chainsawLengthInches <= 0) {
      showNotification('Please specify number of cuts and length in inches', 'warning');
      return;
    }

    const newCut = {
      numCuts: chainsawNumCuts,
      lengthInches: chainsawLengthInches,
      depth: chainsawDepth
    };

    setChainsawCuts(prev => [...prev, newCut]);

    // Reset inputs
    setChainsawNumCuts(1);
    setChainsawLengthInches(0);
    setChainsawDepth(0);
  };

  const removeChainsawCut = (index: number) => {
    setChainsawCuts(prev => prev.filter((_, i) => i !== index));
  };

  const calculateChainsawTotal = () => {
    return chainsawCuts.reduce((total, cut) => {
      // Convert inches to feet
      const lengthInFeet = cut.lengthInches / 12;
      return total + (cut.numCuts * lengthInFeet);
    }, 0);
  };

  const applyChainsawEntry = () => {
    if (chainsawCuts.length === 0) {
      showNotification('Please add at least one cut entry', 'warning');
      return;
    }

    const totalLinearFeet = calculateChainsawTotal();
    // Get depth from the cut entries (not from chainsawDepth which resets after each add)
    const maxDepth = Math.max(...chainsawCuts.map(cut => cut.depth || 0));
    setCurrentCut(prev => ({ ...prev, linearFeet: totalLinearFeet, cutDepth: maxDepth }));

    // Close modal and reset
    setShowChainsawModal(false);
    setChainsawCuts([]);
    setChainsawNumCuts(1);
    setChainsawLengthInches(0);
    setChainsawDepth(0);
  };

  // Break & Remove Quick Entry Functions
  const addBreakRemoveArea = () => {
    if (breakRemoveLength <= 0 || breakRemoveWidth <= 0 || breakRemoveDepth <= 0) {
      showNotification('Please specify length, width, and depth', 'warning');
      return;
    }

    const newArea = {
      length: breakRemoveLength,
      width: breakRemoveWidth,
      depth: breakRemoveDepth
    };

    setBreakRemoveAreas(prev => [...prev, newArea]);

    // Reset inputs
    setBreakRemoveLength(0);
    setBreakRemoveWidth(0);
    setBreakRemoveDepth(0);
  };

  const removeBreakRemoveArea = (index: number) => {
    setBreakRemoveAreas(prev => prev.filter((_, i) => i !== index));
  };

  const calculateBreakRemoveTotal = () => {
    return breakRemoveAreas.reduce((total, area) => {
      return total + (area.length * area.width);
    }, 0);
  };

  const applyBreakRemoveEntry = () => {
    // THE MEASUREMENT MUST NEVER BE THROWN AWAY (founder, Aug 2026 — an
    // operator measured 20 x 10 x 6, saw the calculator total 200 sq ft, hit
    // Apply, and the work item saved as quantity 1 with no dimensions at all).
    //
    // The cause was NOT a save bug: Apply bailed out because a REMOVAL METHOD
    // hadn't been picked, and the warning toast rendered BEHIND the calculator
    // overlay — so the operator saw nothing happen, the modal stayed open, and
    // the footage was lost. Removal method is useful context, not a
    // prerequisite for recording square footage, so it no longer blocks. The
    // one genuine requirement — that some area exists — is surfaced INLINE,
    // inside the modal, where it cannot be hidden.
    if (breakRemoveAreas.length === 0) {
      setBreakRemoveError('Add at least one area first — enter length and width, then "Add Area to List".');
      return;
    }
    setBreakRemoveError(null);

    const totalSquareFeet = calculateBreakRemoveTotal();

    // Structured detail, NOT a generated notes string — the string both threw
    // the numbers away and clobbered whatever quick note the operator typed.
    setDemolitionData({
      areas: breakRemoveAreas.map(a => ({ length: a.length, width: a.width, depth: a.depth })),
      totalSquareFeet,
      method: removalMethod,
      equipment: removalEquipment || undefined,
    });
    setCurrentQuantity(totalSquareFeet);

    // Close modal and reset
    setShowBreakRemoveModal(false);
    setBreakRemoveAreas([]);
    setBreakRemoveLength(0);
    setBreakRemoveWidth(0);
    setBreakRemoveDepth(0);
    setRemovalMethod('');
    setRemovalEquipment('');
  };

  // Jack Hammering Quick Entry Functions
  const addJackhammerArea = () => {
    if (jackhammerLength <= 0 || jackhammerWidth <= 0) {
      showNotification('Please specify length and width', 'warning');
      return;
    }

    const newArea = {
      length: jackhammerLength,
      width: jackhammerWidth
    };

    setJackhammerAreas(prev => [...prev, newArea]);

    // Reset inputs
    setJackhammerLength(0);
    setJackhammerWidth(0);
  };

  const removeJackhammerArea = (index: number) => {
    setJackhammerAreas(prev => prev.filter((_, i) => i !== index));
  };

  const calculateJackhammerTotal = () => {
    return jackhammerAreas.reduce((total, area) => {
      return total + (area.length * area.width);
    }, 0);
  };

  const applyJackhammerEntry = () => {
    if (jackhammerAreas.length === 0) {
      showNotification('Please add at least one area', 'warning');
      return;
    }

    if (!jackhammerEquipment) {
      showNotification('Please select equipment used', 'warning');
      return;
    }

    const equipment = jackhammerEquipment === 'other' ? jackhammerOther : jackhammerEquipment;
    const totalSquareFeet = calculateJackhammerTotal();

    setDemolitionData({
      areas: jackhammerAreas.map(a => ({ length: a.length, width: a.width })),
      totalSquareFeet,
      equipment: equipment || undefined,
    });
    setCurrentQuantity(totalSquareFeet);

    // Close modal and reset
    setShowJackhammerModal(false);
    setJackhammerAreas([]);
    setJackhammerLength(0);
    setJackhammerWidth(0);
    setJackhammerEquipment('');
    setJackhammerOther('');
  };

  // Brokk Quick Entry Functions
  const addBrokkArea = () => {
    if (brokkLength <= 0 || brokkWidth <= 0 || brokkThickness <= 0) {
      showNotification('Please specify length, width, and thickness', 'warning');
      return;
    }

    const newArea = {
      length: brokkLength,
      width: brokkWidth,
      thickness: brokkThickness
    };

    setBrokkAreas(prev => [...prev, newArea]);

    // Reset inputs
    setBrokkLength(0);
    setBrokkWidth(0);
    setBrokkThickness(0);
  };

  const removeBrokkArea = (index: number) => {
    setBrokkAreas(prev => prev.filter((_, i) => i !== index));
  };

  const calculateBrokkTotal = () => {
    return brokkAreas.reduce((total, area) => {
      return total + (area.length * area.width);
    }, 0);
  };

  const applyBrokkEntry = () => {
    if (brokkAreas.length === 0) {
      showNotification('Please add at least one area', 'warning');
      return;
    }

    const totalSquareFeet = calculateBrokkTotal();
    const avgThickness = brokkAreas.reduce((sum, area) => sum + area.thickness, 0) / brokkAreas.length;

    setDemolitionData({
      areas: brokkAreas.map(a => ({ length: a.length, width: a.width, thickness: a.thickness })),
      totalSquareFeet,
      avgThicknessInches: Math.round(avgThickness * 10) / 10,
    });
    setCurrentQuantity(totalSquareFeet);

    // Close modal and reset
    setShowBrokkModal(false);
    setBrokkAreas([]);
    setBrokkLength(0);
    setBrokkWidth(0);
    setBrokkThickness(0);
  };

  const toggleBladeSelection = (blade: string) => {
    setSelectedBlades(prev => {
      if (prev.includes(blade)) {
        return prev.filter(b => b !== blade);
      } else {
        return [...prev, blade];
      }
    });
  };

  const addCustomBlade = () => {
    if (customBladeSize.trim() && !selectedBlades.includes(customBladeSize.trim())) {
      setSelectedBlades(prev => [...prev, customBladeSize.trim()]);
      setCustomBladeSize('');
    }
  };

  const getBladesForSawType = (itemName: string) => {
    if (isHandSaw(itemName)) {
      return ['20" Hand Saw', '24" Hand Saw', '30" Hand Saw'];
    }

    if (isChainsaw(itemName)) {
      return ['10" Chain', '15" Chain', '20" Chain', '24" Chain'];
    }

    if (isWallSaw(itemName)) {
      return ['32" Diamond', '42" Diamond', '56" Diamond', '62" Diamond', '72" Diamond'];
    }

    if (isSlabSaw(itemName)) {
      return [
        '20" Diamond',
        '24" Diamond',
        '26" Diamond',
        '30" Diamond',
        '32" Diamond',
        '36" Diamond',
        '42" Diamond',
        '54" Diamond',
        '62" Diamond',
        '72" Diamond'
      ];
    }

    // Standard blades for other saw types
    return [
      '7" Diamond',
      '9" Diamond',
      '12" Diamond',
      '14" Diamond',
      '16" Diamond',
      '18" Diamond',
      '20" Diamond',
      '24" Diamond',
      'Abrasive',
      'Masonry',
      'Metal Cutting',
      'Wire Saw'
    ];
  };

  const handleAddItem = () => {
    const existingIndex = selectedItems.findIndex(item => item.name === currentItem);
    // A draft saved BEFORE the per-type "Additional Notes" textareas were
    // unified into Quick Notes still carries text on coreDrillingData.notes /
    // sawingData.notes. Fall back to it so a draft left open across the deploy
    // doesn't silently drop what the operator already wrote.
    const quickNote =
      currentNotes.trim() ||
      (isCoreDrilling(currentItem) ? (coreDrillingData.notes || '').trim() : '') ||
      (isSawing(currentItem) ? (sawingData.notes || '').trim() : '');

    // Prepare detailed data based on item type
    let details: CoreDrillingDetails | SawingDetails | DemolitionDetails | GeneralDetails | undefined;
    let itemQuantity = currentQuantity;

    if (isCoreDrilling(currentItem)) {
      // AUTO-FLUSH: a hole typed into the input row but never committed with
      // "Add This Hole" used to be silently discarded, and the operator got
      // "add at least one hole" for data they could see on screen.
      const pendingHole = buildPendingHole();
      const holes = pendingHole ? [...coreDrillingData.holes, pendingHole] : coreDrillingData.holes;
      if (holes.length === 0) {
        showNotification('Please add at least one hole entry with size and depth', 'warning');
        return;
      }
      details = { ...coreDrillingData, holes, notes: quickNote || undefined };
      itemQuantity = holes.reduce((total, hole) => total + (hole.quantity || 1), 0);
      // Mirror the flush into state so the summary + list match what we saved.
      if (pendingHole) {
        setCoreDrillingData(prev => ({ ...prev, holes: [...prev.holes, pendingHole] }));
        setCurrentHole({ bitSize: '', depthInches: 0, quantity: 1, plasticSetup: false, ...EMPTY_REBAR });
      }
    } else if (isSawing(currentItem)) {
      // AUTO-FLUSH: same for a cut (or an L×W area) left in the input row.
      const pendingCut = buildPendingCut();
      const cuts = pendingCut ? [...sawingData.cuts, pendingCut] : sawingData.cuts;
      if (cuts.length === 0) {
        showNotification('Please add at least one cut entry with linear feet and depth', 'warning');
        return;
      }
      details = { ...sawingData, cuts, notes: quickNote || undefined };
      itemQuantity = cuts.reduce((total, cut) => total + cut.linearFeet, 0);
      if (pendingCut) {
        setSawingData(prev => ({ ...prev, cuts: [...prev.cuts, pendingCut] }));
        setCurrentCut({
          inputMode: 'linear', linearFeet: 0, cutDepth: 0, areas: [], bladesUsed: [],
          ...EMPTY_REBAR, overcut: false, chainsawed: false,
          chainsawAreas: 0, chainsawWidthInches: 0
        });
        setSelectedBlades([]);
        setTempAreas([]);
        setCurrentArea({ length: 0, width: 0, depth: 0, quantity: 1, ...EMPTY_REBAR, overcut: false, chainsawed: false, chainsawAreas: 0, chainsawWidthInches: 0 });
      }
    } else if (
      demolitionData &&
      (isBreakAndRemove(currentItem) || isJackHammering(currentItem) || isChipping(currentItem) || isBrokk(currentItem))
    ) {
      // Break & remove / jack hammering / chipping / Brokk quick entries.
      // Predicate-guarded so a stale demolitionData can never attach an
      // areas[] payload to an unrelated work type.
      details = { ...demolitionData, notes: quickNote || undefined };
      itemQuantity = demolitionData.totalSquareFeet || currentQuantity;
    } else if (hasNoSpecialisedForm(currentItem)) {
      // Generic types: the unit is the only thing that makes the number mean
      // anything on the customer's ticket ("120" vs "120 sq ft").
      details = { unit: currentUnit, notes: quickNote || undefined };
      itemQuantity = currentQuantity;
    }

    if (existingIndex >= 0) {
      // Update existing item
      const updated = [...selectedItems];
      updated[existingIndex].quantity = itemQuantity; // Replace instead of add for core drilling
      // Quick notes are optional — an empty box must be able to CLEAR a note,
      // not silently keep a stale one.
      updated[existingIndex].notes = quickNote || undefined;
      if (details) {
        updated[existingIndex].details = details;
      }
      setSelectedItems(updated);
    } else {
      // Add new item
      const newItem: WorkItem = {
        name: currentItem,
        quantity: itemQuantity,
        notes: quickNote || undefined
      };

      if (details) {
        newItem.details = details;
      }

      setSelectedItems([...selectedItems, newItem]);
    }

    // Show the "Add More" dialog instead of closing immediately
    setShowAddMoreDialog(true);
  };

  const handleAddMore = () => {
    // Reset for adding another work item
    setShowAddMoreDialog(false);
    // CLOSE THE DETAIL PANEL FIRST.
    //
    // The panel, the search box, the work-type picker and the bottom action bar
    // are ALL gated on `showQuantityModal`. Leaving it true while clearing
    // `currentItem` rendered an empty-titled panel with no body and hid
    // everything else on the page — the "Add Another lands on a blank page"
    // the founder hit on his walkthrough. The picker must come back.
    setShowQuantityModal(false);
    setCurrentItem('');
    setCurrentQuantity(1);
    setCurrentNotes('');
    setCoreDrillingData({ holes: [], notes: '' });
    setSawingData({ cuts: [], cutType: 'wet', notes: '' });
    setDemolitionData(null);
    setCurrentCut({
      inputMode: 'linear',
      linearFeet: 0,
      cutDepth: 0,
      areas: [],
      bladesUsed: [],
      ...EMPTY_REBAR,
      overcut: false,
      chainsawed: false,
      chainsawAreas: 0,
      chainsawWidthInches: 0
    });
    setSelectedBlades([]);
    setCustomBladeSize('');
    setCutInputMode('linear');
    setTempAreas([]);
    setCurrentArea({ length: 0, width: 0, depth: 0, quantity: 1, ...EMPTY_REBAR, overcut: false, chainsawed: false, chainsawAreas: 0, chainsawWidthInches: 0 });
    setCurrentHole({
      bitSize: '',
      depthInches: 0,
      quantity: 1,
      plasticSetup: false,
      ...EMPTY_REBAR
    });
    // Show dropdown to select another work item. The input only exists once the
    // detail panel above has unmounted, so focus on the next paint — same
    // reason the panel's own scrollIntoView uses a timeout rather than rAF.
    // A leftover query would silently pre-filter the reopened list.
    setSearchQuery('');
    setShowDropdown(true);
    setTimeout(() => {
      searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // preventScroll: focus otherwise jump-scrolls and cancels the smooth scroll above.
      searchInputRef.current?.focus({ preventScroll: true });
    }, 80);
  };

  const handleContinue = () => {
    // Close everything and continue
    setShowAddMoreDialog(false);
    setShowQuantityModal(false);
  };

  const handleRemoveItem = (itemName: string) => {
    setSelectedItems(selectedItems.filter(item => item.name !== itemName));
  };

  const handleSaveEquipmentUsage = async (equipmentData: any) => {
    setSavingEquipment(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showNotification('Session expired. Please log in again.', 'error');
        return;
      }

      // Save equipment usage via API
      const response = await fetch('/api/equipment-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          job_order_id: params.id,
          ...equipmentData
        })
      });

      const result = await response.json();

      if (result.success) {
        // Add to local state
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
    if (!confirm('Are you sure you want to remove this equipment usage entry?')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/equipment-usage/${entryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
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

  const showNotification = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      showNotification('Please select at least one work item', 'warning');
      return;
    }

    // A ticked work type with nothing entered is not a record of anything.
    // Batch 1d lets them tick everything first, which means they can now reach
    // Submit with items still empty — name them so it's one tap to fix, rather
    // than sending the office a row that says a work type happened and nothing
    // about it.
    if (pendingItems.length > 0) {
      const names = pendingItems.map((i) => i.name).join(', ');
      showNotification(
        pendingItems.length === 1
          ? `Add the measurements for ${names} before submitting.`
          : `${pendingItems.length} work types still need measurements: ${names}`,
        'warning'
      );
      return;
    }

    // PHOTOS ARE OPTIONAL HERE (founder, Aug 3 2026 — an operator was standing
    // on a jobsite unable to submit his day). Requiring a photo to log work
    // performed blocks the day's numbers on a slow upload over site LTE. The
    // photo requirement lives at JOB COMPLETION, immediately before the
    // customer signature — that's the record that actually needs evidence.
    // Operators can still attach photos here whenever they want to.
    setPhotoError(null);

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // Save work items to database (primary storage)
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
            // Operator-local calendar date — anchors the day-note row
            // (never toISOString; UTC shifts the day).
            workDate,
          })
        });

        if (!res.ok) {
          console.error('Failed to save work items to DB, falling back to localStorage');
        }

        // Track blade usage for sawing work (fire and forget)
        fetch('/api/equipment/track-usage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            job_order_id: params.id,
            work_items: selectedItems
          })
        }).catch(err => console.error('Blade tracking error:', err));

        // Save photos if any were taken
        if (jobPhotos.length > 0) {
          fetch(`/api/job-orders/${params.id}/photos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ photo_urls: jobPhotos })
          }).catch(err => console.error('Photo save error:', err));
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
      // what they entered.
      //
      // It no longer leaks into tomorrow. The draft carries the date it was
      // written for and is discarded on load if that isn't today — which is
      // what the old TODO here was worrying about, solved at the read side so
      // it holds even when a cleanup is missed or the operator switches device.

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

      // Navigate to day completion page (done for today vs fully complete)
      setTimeout(() => {
        router.push(`/dashboard/job-schedule/${params.id}/day-complete`);
      }, 800);
    } catch (error) {
      console.error('Error submitting work performed:', error);
      // Fallback: save to localStorage and still navigate
      const workPerformedData = {
        jobId: params.id,
        items: selectedItems,
        photos: jobPhotos,
        notes: voiceNotes || '',
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(`work-performed-${params.id}`, JSON.stringify(workPerformedData));
      localStorage.removeItem(`job_last_page_${params.id}`);
      // NOTE: draft preserved on purpose — see comment in success path above.
      if (isCoOperator) {
        // Co-operators never go to day-complete — back to their ticket instead.
        router.push(`/dashboard/my-jobs/${params.id}`);
      } else {
        router.push(`/dashboard/job-schedule/${params.id}/day-complete`);
      }
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
              className="p-2 bg-gray-100 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-all"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <button
              onClick={() => { localStorage.removeItem(`job_last_page_${params.id}`); router.push('/dashboard'); }}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              title="Dashboard"
            >
              <Home className="w-5 h-5 text-gray-600 dark:text-white" />
            </button>
            <div className="w-10 h-10 bg-gradient-to-br from-brand to-brand-accent rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            {/* THE HEADER MUST NEVER CHANGE HEIGHT.
                It used to mount/unmount the "Saving…" / "Saved ✓" indicator
                inline next to a subtitle that wraps on a phone. Every click on
                this page triggers the autosave, so the header reflowed
                constantly and shoved the content below it — the operator would
                tap a field and find the page had "slid back up", losing the
                spot they were typing in (founder, Aug 2026).

                Now: one row, both lines truncate, and the status sits in a
                fixed-width slot that is always present and only changes what it
                shows. No mount, no reflow, no jump. */}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">Work Performed</h1>
              <div className="flex items-center gap-2 h-4">
                <p className="text-gray-500 dark:text-white/50 text-xs truncate">Select completed work items</p>
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
                <span className="px-2 py-1.5 bg-brand/10 dark:bg-brand/20 text-brand dark:text-brand rounded-xl text-xs font-semibold border border-brand/30 dark:border-brand/30">
                  {selectedItems.length}
                </span>
              )}
              <button
                onClick={() => setView(view === 'search' ? 'selected' : 'search')}
                className="px-3 py-1.5 bg-gradient-to-r from-brand to-brand-accent text-white rounded-xl hover:from-brand/90 hover:to-brand-accent/90 transition-all font-semibold text-xs shadow-sm min-h-[36px]"
              >
                <span className="hidden sm:inline">{view === 'search' ? 'View Selected' : 'Add More'}</span>
                <span className="sm:hidden">{view === 'search' ? 'Selected' : 'Search'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 pb-24 max-w-lg">
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
            {/* Main locked card */}
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-green-200 dark:border-green-800/50 shadow-sm overflow-hidden">
              {/* Green header stripe */}
              <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-base">Done for Today ✓</p>
                  <p className="text-emerald-100 text-xs mt-0.5">Your work log for today has been saved.</p>
                </div>
              </div>
              {/* Body */}
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

                {/* Success flash */}
                {noteSubmitted && (
                  <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-3 mb-4">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Note sent to supervisor ✓</p>
                  </div>
                )}

                {/* Expandable note form */}
                <button
                  onClick={() => setShowNoteForm(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquarePlus className="w-4 h-4 text-brand dark:text-brand" />
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
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.07] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand resize-none"
                    />
                    <button
                      onClick={handleSubmitNote}
                      disabled={noteSubmitting || !noteContent.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand to-brand-accent hover:from-brand/90 hover:to-brand-accent/90 text-white py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 shadow-sm"
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

            {/* Previously submitted amendment notes */}
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

            {/* Back to My Jobs */}
            <button
              onClick={() => router.push('/dashboard/my-jobs')}
              className="w-full py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
            >
              Back to My Jobs
            </button>
          </div>
        )}

        {!dayAlreadySubmitted && view === 'search' ? (
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

            {/* Search + picker are hidden while a work item is being entered,
                so the detail panel is the next thing on screen instead of a
                thousand pixels below the list you just picked from. "Cancel"
                brings them straight back. */}
            {!showQuantityModal && (
              <>
            {/* Autocomplete Search Bar */}
            <div className="bg-white dark:bg-white/[0.05] backdrop-blur-lg rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 mb-4">
              {/* Smart Recommendations based on job type */}
              <RecommendedItems
                jobType={jobType}
                selectedItems={selectedItems.map(i => i.name)}
                onAddItem={(itemName) => handleQuickAddItem(itemName)}
              />

              <label className="block text-sm font-bold text-gray-700 dark:text-white mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand" />
                Search and Add Work Items
              </label>
              <div className="relative" ref={searchBoxRef}>
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Type to search work items..."
                  className="w-full pl-12 pr-12 py-4 text-lg rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-brand dark:focus:border-brand focus:outline-none transition-colors text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] font-medium placeholder:text-gray-400 dark:placeholder-white/30"
                />

                {/* A visible way out of the list. Tapping away and Escape work
                    too, but a gloved thumb needs something to aim at. */}
                {showDropdown && (
                  <button
                    type="button"
                    onClick={() => { setShowDropdown(false); searchInputRef.current?.blur(); }}
                    aria-label="Close work item list"
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white rounded-xl"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}

                {/* Autocomplete Dropdown */}
                {showDropdown && getFilteredItems().length > 0 && (
                  <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border-2 border-gray-200 dark:border-white/10 max-h-96 overflow-y-auto">
                    {getFilteredItems().slice(0, 20).map((item) => {
                      const isSelected = selectedItems.some(si => si.name === item);
                      return (
                        <button
                          key={item}
                          onClick={() => handleQuickAddItem(item)}
                          className={`w-full px-4 py-3 text-left hover:bg-brand/5 dark:hover:bg-brand/10 transition-colors border-b border-gray-100 dark:border-white/5 last:border-b-0 ${
                            isSelected ? 'bg-green-50 dark:bg-green-500/10' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900 dark:text-white">{item}</span>
                            {isSelected && (
                              <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full font-bold">
                                Added
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-white/40 mt-2">
                Start typing to see suggestions. Click to add multiple items.
              </p>
            </div>
              </>
            )}
            {!showQuantityModal && (
              <>

            {/* ── WHAT YOU DID — then fill each one in ─────────────────────
                BATCH 1d. This replaces a row of read-only chips. Ticking a work
                type used to throw the operator straight into a measurement form;
                now everything they did gets ticked first and lands here, IN THE
                ORDER THEY PICKED IT, each waiting to be filled in. */}
            {selectedItems.length > 0 && (
              <div className="bg-white dark:bg-white/[0.05] border-2 border-green-200 dark:border-green-500/30 rounded-2xl p-4 mb-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    What you did ({selectedItems.length})
                  </h3>
                  {pendingItems.length > 0 && (
                    <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                      {pendingItems.length} need{pendingItems.length === 1 ? 's' : ''} measurements
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-white/50 mb-3">
                  Tick everything first. Then tap each one to enter what you did.
                </p>

                <div className="space-y-2">
                  {selectedItems.map((item, index) => {
                    const pending = needsMeasurements(item);
                    return (
                      <div
                        key={`${item.name}-${index}`}
                        className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all ${
                          pending
                            ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/10'
                            : 'border-green-200 dark:border-green-500/30 bg-green-50/60 dark:bg-green-500/10'
                        }`}
                      >
                        <button
                          onClick={() => handleSelectItem(item.name)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{item.name}</p>
                          <p className={`text-xs font-semibold mt-0.5 ${
                            pending ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300'
                          }`}>
                            {pending
                              ? 'Tap to add measurements'
                              : `${item.quantity} recorded${item.notes ? ' · note added' : ''}`}
                          </p>
                        </button>

                        <button
                          onClick={() => handleSelectItem(item.name)}
                          aria-label={pending ? `Add measurements for ${item.name}` : `Edit ${item.name}`}
                          className={`flex-shrink-0 min-h-[44px] px-3 rounded-xl text-xs font-bold transition-all ${
                            pending
                              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
                              : 'bg-white dark:bg-white/10 border border-green-300 dark:border-green-500/40 text-green-700 dark:text-green-300'
                          }`}
                        >
                          {pending ? 'Add' : 'Edit'}
                        </button>

                        <button
                          onClick={() => setSelectedItems(selectedItems.filter((_, i) => i !== index))}
                          aria-label={`Remove ${item.name}`}
                          className="flex-shrink-0 w-11 h-11 flex items-center justify-center text-gray-400 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Popular Items Quick Add */}
            <div className="bg-gradient-to-br from-brand/5 to-brand-accent/5 dark:from-brand/20 dark:to-brand-accent/20 rounded-2xl shadow-sm border border-brand/10 dark:border-brand/20 p-5 mb-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-br from-brand to-brand-accent rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
                Popular Items — Quick Add
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {POPULAR_ITEMS.map((item) => {
                const isSelected = selectedItems.some(si => si.name === item);
                return (
                  <button
                    key={item}
                    onClick={() => handleTogglePick(item)}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 text-left group ${
                      isSelected
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-500/40 shadow-md'
                        : 'bg-white dark:bg-white/[0.05] border-gray-200 dark:border-white/10 hover:border-brand dark:hover:border-brand/50 hover:shadow-md hover:bg-brand/5 dark:hover:bg-brand/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className={`font-bold text-sm ${isSelected ? 'text-green-800 dark:text-green-300' : 'text-gray-800 dark:text-white group-hover:text-brand dark:group-hover:text-brand'}`}>{item}</h3>
                        {isSelected && (() => {
                          const picked = selectedItems.find(si => si.name === item);
                          return (
                            <p className="text-xs mt-0.5 font-semibold text-green-600 dark:text-green-400">
                              {picked && needsMeasurements(picked)
                                ? 'Ticked — add measurements below'
                                : `Qty: ${picked?.quantity}`}
                            </p>
                          );
                        })()}
                      </div>
                      {isSelected ? (
                        <div className="w-7 h-7 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full border-2 border-gray-200 dark:border-white/20 group-hover:border-brand dark:group-hover:border-brand flex items-center justify-center flex-shrink-0 transition-colors">
                          <svg className="w-3.5 h-3.5 text-gray-300 dark:text-white/30 group-hover:text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
              </div>
            </div>
              </>
            )}
          </>
        ) : (
          /* Selected Items View */
          <div className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-brand to-brand-accent rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              Selected Work Items
            </h2>

            {/* Standby Time Summary */}
            {standbyLogs.length > 0 && (
              <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-yellow-900 mb-2">⏱️ Standby Time Recorded</h3>
                    <div className="space-y-2">
                      {standbyLogs.map((log, index) => {
                        const start = new Date(log.started_at);
                        const end = log.ended_at ? new Date(log.ended_at) : null;
                        const durationMinutes = end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0;
                        const hours = Math.floor(durationMinutes / 60);
                        const minutes = durationMinutes % 60;

                        return (
                          <div key={log.id || index} className="bg-white rounded-lg p-3 border border-yellow-200">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-gray-800">
                                  {start.toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                  })}
                                  {end && (
                                    <span className="text-gray-500"> → {end.toLocaleString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true
                                    })}</span>
                                  )}
                                </p>
                                {log.reason && (
                                  <p className="text-xs text-gray-600 mt-1">Reason: {log.reason}</p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-yellow-700">
                                  {hours > 0 ? `${hours}h ` : ''}{minutes}m
                                </p>
                                <p className="text-xs text-gray-500">Duration</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 pt-3 border-t-2 border-yellow-300">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-yellow-900">Total Standby Time:</p>
                        <p className="text-2xl font-bold text-yellow-700">
                          {Math.floor(totalStandbyMinutes / 60) > 0 ? `${Math.floor(totalStandbyMinutes / 60)}h ` : ''}
                          {totalStandbyMinutes % 60}m
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedItems.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No items selected yet</p>
                <button
                  onClick={() => setView('search')}
                  className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
                >
                  Add Work Items
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedItems.map((item) => (
                  <div key={item.name} className="bg-gray-50 dark:bg-white/[0.04] rounded-xl overflow-hidden border border-gray-100 dark:border-white/10">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          {isCoreDrilling(item.name) && (
                            <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          )}
                          {isSawing(item.name) && (
                            <svg className="w-4 h-4 text-brand flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                            </svg>
                          )}
                          {item.name}
                        </h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs font-semibold text-gray-500 dark:text-white/50 bg-gray-200 dark:bg-white/10 px-2 py-0.5 rounded-full">
                            Qty: {item.quantity}
                          </span>
                        </div>
                        {/* Quick note in full — truncating it to 150px hid the
                            exact detail the office asked operators to write. */}
                        {item.notes && (
                          <p className="mt-1.5 border-l-2 border-brand/40 pl-2 text-xs leading-relaxed whitespace-pre-wrap text-gray-600 dark:text-white/60">
                            {item.notes}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.name)}
                        className="p-2 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors border border-red-100 dark:border-red-500/20"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Show detailed information for sawing */}
                    {isSawing(item.name) && item.details && 'cuts' in item.details && (
                      <div className="px-4 pb-4">
                        <div className="bg-white rounded-lg p-3 border-l-4 border-blue-500">
                          <h4 className="font-medium text-gray-700 mb-3">Sawing Details:</h4>

                          {/* Cut Entries */}
                          {item.details.cuts.length > 0 && (
                            <div className="mb-4">
                              <h5 className="text-sm font-medium text-gray-600 mb-2">Cuts Made:</h5>
                              <div className="grid gap-2">
                                {item.details.cuts.map((cut, index) => (
                                  <div key={index} className="bg-gray-50 rounded-lg p-2 text-sm">
                                    <div className="flex items-center gap-4 mb-1">
                                      <div className="flex items-center gap-1">
                                        <span className="font-medium text-blue-600">{cut.linearFeet.toFixed(1)}&apos;</span>
                                        <span className="text-gray-500">linear feet at</span>
                                        <span className="font-medium">{cut.cutDepth}&quot;</span>
                                        <span className="text-gray-500">deep</span>
                                      </div>
                                      {cut.inputMode === 'area' && (
                                        <span className="px-2 py-1 bg-brand/10 text-brand rounded text-xs font-medium">
                                          Area Mode
                                        </span>
                                      )}
                                      {rebarLabel(cut) && (
                                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                                          {rebarLabel(cut)}
                                        </span>
                                      )}
                                      {cut.overcut && (
                                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                                          Overcut
                                        </span>
                                      )}
                                    </div>
                                    {/* Show areas if entered using area mode */}
                                    {cut.inputMode === 'area' && cut.areas && cut.areas.length > 0 && (
                                      <div className="mt-2 bg-white rounded-lg p-2 border border-brand/30">
                                        <div className="text-xs text-gray-600 mb-1">Cut Areas:</div>
                                        <div className="flex flex-wrap gap-1">
                                          {cut.areas.map((area, areaIndex) => (
                                            <span key={areaIndex} className="px-2 py-1 bg-brand/5 text-brand rounded text-xs">
                                              {area.length}&apos; × {area.width}&apos; ({area.depth}&quot; deep)
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {/* Blades are optional — don't render a
                                        dangling "Blades:" label with nothing after it. */}
                                    {cut.bladesUsed.length > 0 && (
                                      <div className="flex flex-wrap gap-1 text-xs mt-1">
                                        <span className="text-gray-500">
                                          {isChainsaw(item.name) ? 'Chains:' : 'Blades:'}
                                        </span>
                                        {cut.bladesUsed.map((blade, bladeIndex) => (
                                          <span key={bladeIndex} className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded">
                                            {blade}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {/* The badge above already carries the size;
                                        this line only adds the legacy free-text
                                        description an OLD row may have. */}
                                    {!cut.rebarSize && cut.cutSteel && cut.steelEncountered && (
                                      <div className="mt-1 text-xs">
                                        <span className="text-gray-500">Steel:</span>
                                        <span className="ml-1 text-red-600 font-medium">{cut.steelEncountered}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Other Details */}
                          <div className="grid grid-cols-2 gap-3 text-sm border-t pt-3">
                            <div>
                              <span className="text-gray-500">Cut Method:</span>
                              <span className={`ml-1 font-medium ${item.details.cutType === 'wet' ? 'text-blue-600' : 'text-orange-600'}`}>
                                {item.details.cutType === 'wet' ? 'Wet' : 'Dry'} Cutting
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Total Linear Feet:</span>
                              <span className="ml-1 font-medium text-blue-600">
                                {item.details.cuts.reduce((total, cut) => total + cut.linearFeet, 0)}&apos;
                              </span>
                            </div>
                            {item.details.notes && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Notes:</span>
                                <span className="ml-1 text-gray-700">{item.details.notes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Show detailed information for core drilling */}
                    {isCoreDrilling(item.name) && item.details && 'holes' in item.details && (
                      <div className="px-4 pb-4">
                        <div className="bg-white rounded-lg p-3 border-l-4 border-orange-500">
                          <h4 className="font-medium text-gray-700 mb-3">Core Drilling Details:</h4>

                          {/* Hole Entries */}
                          {item.details.holes.length > 0 && (
                            <div className="mb-4">
                              <h5 className="text-sm font-medium text-gray-600 mb-2">Holes Drilled:</h5>
                              <div className="grid gap-2">
                                {item.details.holes.map((hole, index) => (
                                  <div key={index} className="bg-gray-50 rounded-lg p-2 text-sm">
                                    <div className="flex items-center gap-1 mb-1">
                                      <span className="font-medium text-orange-600">{hole.quantity}x</span>
                                      <span className="font-medium">{hole.bitSize}</span>
                                      <span className="text-gray-500">at</span>
                                      <span className="font-medium">{hole.depthInches}&quot;</span>
                                      <span className="text-gray-500">deep</span>
                                    </div>
                                    {(hole.plasticSetup || rebarLabel(hole)) && (
                                      <div className="flex gap-1 text-xs mt-1">
                                        {hole.plasticSetup && (
                                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Plastic</span>
                                        )}
                                        {rebarLabel(hole) && (
                                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                                            {rebarLabel(hole)}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Notes */}
                          {item.details.notes && (
                            <div className="text-sm border-t pt-3">
                              <span className="text-gray-500">Notes:</span>
                              <span className="ml-1 text-gray-700">{item.details.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Equipment Usage Section */}
            {selectedItems.length > 0 && (
              <div className="mt-8 bg-gradient-to-br from-brand/5 to-brand-accent/5 rounded-2xl shadow-xl p-6 border-2 border-brand/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-600 to-brand rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      Equipment Usage Tracking
                    </h2>
                    <p className="text-gray-600 font-medium mt-1">Track equipment metrics for accurate job costing</p>
                  </div>
                  <button
                    onClick={() => setShowEquipmentForm(true)}
                    disabled={savingEquipment}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 via-brand to-brand-accent hover:from-blue-700 hover:via-brand/90 hover:to-brand-accent/90 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Equipment Usage
                  </button>
                </div>

                {/* Equipment Usage Entries */}
                {equipmentUsageEntries.length === 0 ? (
                  <div className="bg-white rounded-xl p-8 text-center border-2 border-dashed border-brand/30">
                    <svg className="w-16 h-16 mx-auto text-brand/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-gray-500 font-semibold mb-2">No equipment usage tracked yet</p>
                    <p className="text-gray-400 text-sm">Click "Add Equipment Usage" to track linear feet, blade usage, and resource consumption</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {equipmentUsageEntries.map((entry, index) => (
                      <div key={entry.id || index} className="bg-white rounded-xl p-5 border-2 border-gray-200 hover:border-brand/30 transition-all shadow-md">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Equipment</p>
                              <p className="text-sm font-bold text-gray-900">{entry.equipment_type.replace(/_/g, ' ').toUpperCase()}</p>
                              {entry.equipment_id && <p className="text-xs text-gray-500">{entry.equipment_id}</p>}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Linear Feet</p>
                              <p className="text-lg font-bold text-blue-600">{entry.linear_feet_cut} ft</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Difficulty</p>
                              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                                entry.difficulty_level === 'easy' ? 'bg-green-100 text-green-700' :
                                entry.difficulty_level === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                entry.difficulty_level === 'hard' ? 'bg-orange-100 text-orange-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {entry.difficulty_level.toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Blades Used</p>
                              <p className="text-sm font-bold text-brand">{entry.blades_used || 0}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveEquipmentEntry(entry.id)}
                            className="ml-4 p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {/* Resource Consumption Summary */}
                        <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-gray-500">Hydraulic:</span>
                            <span className="ml-1 font-semibold text-gray-700">{entry.hydraulic_hose_used_ft} ft</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Water:</span>
                            <span className="ml-1 font-semibold text-gray-700">{entry.water_hose_used_ft} ft</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Power:</span>
                            <span className="ml-1 font-semibold text-gray-700">{entry.power_hours} hrs</span>
                          </div>
                        </div>

                        {entry.notes && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-xs text-gray-500 mb-1">Notes:</p>
                            <p className="text-sm text-gray-700">{entry.notes}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* The day-level sections — photos, the whole-day note, difficulty —
            are hidden while a work item is being entered.
            They belong to the DAY, not to the item in hand, and leaving them
            between the work-type picker and the detail panel meant the operator
            picked a type and then had to scroll past three unrelated cards to
            reach the measurements. With them out of the way the panel opens
            directly under the picker, which is what "pick the type, then enter
            everything below" actually means on a phone. */}
        {!dayAlreadySubmitted && !showQuantityModal && (
          <>
            {/* Job Photos — OPTIONAL on this screen. The requirement lives at
                job completion, before the customer signature. */}
            <div id="job-photos-section" className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 p-5 shadow-sm mb-4">
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
                  <p className="text-xs text-gray-500 dark:text-white/50 mb-3">
                    Optional here — add them if you have them. Photos are required
                    when you finish the job, right before the customer signs.
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

              {photoError && (
                <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-400">{photoError}</p>
              )}
            </div>

            {/* Voice Memo Notes */}
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 p-5 shadow-sm mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Mic className="w-5 h-5 text-brand" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Job Notes — the whole day</h3>
                <span className="text-xs text-gray-400 dark:text-white/40">(voice or typed)</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-white/50 mb-3">
                Anything about the day overall — site conditions, hold-ups, who you worked with.
                Notes about a <span className="font-semibold">specific work item</span> go in that item&apos;s Quick notes instead.
              </p>
              <VoiceMemoNotes
                notes={voiceNotes}
                onNotesChange={setVoiceNotes}
                placeholder="Tap the mic and describe what you did today..."
              />
            </div>

            {/* Job Difficulty — one tap, stored with the work items so the
                office sees how hard the site actually was */}
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 p-5 shadow-sm mb-4">
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
                  className="mt-3 w-full px-4 py-3 bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
              )}
            </div>
          </>
        )}

        {/* Submit Button.
            HIDDEN while the measurement panel is open (`!showQuantityModal`).
            THE BUG (Devin + Zack, Aug 10): this bar is `fixed bottom-0`, so it
            sat on screen the whole time an operator was entering holes. They
            added "6 bit, 10in deep, 7 holes", typed a note, saw "Next: Job
            Survey" right there and pressed it — but those holes live in the
            panel's own state until "Add Work Item" commits them to
            selectedItems. So the item was still empty, the new pending-items
            guard fired, and they got "Add the measurements for CORE DRILL"
            while staring at the measurements they had just added. They could
            not submit their day.
            Every other action on this page is already hidden behind the panel
            (see the !showQuantityModal blocks above); this bar was missed. While
            you are filling in a work type, the only action is to save that work
            type. */}
        {selectedItems.length > 0 && !dayAlreadySubmitted && !coOpSubmitted && !showQuantityModal && (
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#0b0618]/95 backdrop-blur-lg border-t border-gray-200 dark:border-white/10 p-4 pb-safe z-50">
            <div className="container mx-auto max-w-lg">
              {/* Co-operator: submit YOUR work — the lead runs day-complete. */}
              {isCoOperator && (
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 text-center mb-2">
                  Submit your work — {leadName || 'the lead operator'} completes the ticket
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={goBack}
                  className="flex-shrink-0 px-5 py-3.5 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-all font-semibold text-sm border border-gray-200 dark:border-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-3.5 bg-gradient-to-r from-brand to-brand-accent hover:from-brand/90 hover:to-brand-accent/90 text-white rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* ── Work detail panel — INLINE, not an overlay ────────────────────────
          Sits in the page flow directly under the work-type picker so the
          operator picks a type and then scrolls down into the measurements.
          It used to be a fixed full-screen modal that covered everything the
          moment a type was tapped. */}
      {showQuantityModal && (
        <div ref={detailPanelRef} className="max-w-2xl mx-auto w-full px-4 pb-6 scroll-mt-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full shadow-lg border-2 border-brand/30 dark:border-brand/40 overflow-hidden">
            {/* Panel header — stays visible while scrolling the measurements */}
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-white/10 p-4 sm:p-6">
              <h3 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ${
                  isCoreDrilling(currentItem)
                    ? 'bg-gradient-to-br from-blue-500 to-cyan-500'
                    : isSawing(currentItem)
                    ? 'bg-gradient-to-br from-orange-500 to-red-500'
                    : 'bg-gradient-to-br from-brand to-brand-accent'
                }`}>
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <span className="block">{currentItem}</span>
                  <span className={`block h-0.5 w-16 mt-1 rounded-full ${
                    isCoreDrilling(currentItem) ? 'bg-gradient-to-r from-blue-500 to-cyan-500' :
                    isSawing(currentItem) ? 'bg-gradient-to-r from-orange-500 to-red-500' :
                    'bg-gradient-to-r from-brand to-brand-accent'
                  }`} />
                </div>
              </h3>
            </div>
            <div className="p-4 sm:p-6">

              <div className="space-y-6">
                {/* Core Drilling - Total Holes Summary */}
                {isCoreDrilling(currentItem) && (
                  <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-2xl p-4 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm uppercase tracking-wide opacity-90">Total Holes</h4>
                        <p className="text-blue-100 text-xs mt-0.5">All sizes combined</p>
                      </div>
                      <div className="text-4xl font-black text-white">
                        {getTotalHoles()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sawing - Total Linear Feet Summary */}
                {isSawing(currentItem) && (
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-4 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm uppercase tracking-wide opacity-90">Total Linear Feet</h4>
                        <p className="text-blue-100 text-xs mt-0.5">All cuts combined</p>
                      </div>
                      <div className="text-4xl font-black text-white">
                        {getTotalLinearFeet()}&apos;
                      </div>
                    </div>
                  </div>
                )}

                {/* Core Drilling Specific Fields */}
                {isCoreDrilling(currentItem) && (
                  <div className="space-y-4">
                    <h4 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 border-l-4 border-blue-500 pl-3">
                      <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Core Drilling Details
                    </h4>

                    {/* Add New Hole Entry */}
                    <div className="bg-white dark:bg-white/[0.04] rounded-2xl p-4 sm:p-6 border border-gray-100 dark:border-white/10 shadow-sm">
                      <h5 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2 text-base border-l-4 border-brand pl-3">
                        <svg className="w-5 h-5 text-brand flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Hole Entry
                      </h5>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                        {/* Bit Size - Text Input */}
                        <div>
                          <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Bit Size
                          </label>
                          <input
                            type="text"
                            value={currentHole.bitSize}
                            onChange={(e) => setCurrentHole(prev => ({ ...prev, bitSize: e.target.value }))}
                            className="w-full px-4 py-3 text-base font-semibold text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-white/30"
                            placeholder='e.g., 1", 2-1/2", 6"'
                          />
                          <p className="text-xs text-gray-500 dark:text-white/40 mt-1">Common: 1/2", 1", 2", 4", 6", 8", 12"</p>
                        </div>

                        {/* Depth - Modern Input */}
                        <div>
                          <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                            Depth (in)
                          </label>
                          <NumberInput
                            step="0.25"
                            min="0"
                            value={currentHole.depthInches || ''}
                            onValueChange={(nv) => setCurrentHole(prev => ({ ...prev, depthInches: nv }))}
                            className="w-full px-4 py-3 text-base font-semibold text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-white/30"
                            placeholder="0.00"
                            emptyValue={0}
                            blankZero
                          />
                        </div>

                        {/* Quantity - Modern Input */}
                        <div>
                          <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                            </svg>
                            Quantity
                          </label>
                          <NumberInput
                            min="1"
                            value={currentHole.quantity}
                            onValueChange={(nv) => setCurrentHole(prev => ({ ...prev, quantity: nv }))}
                            className="w-full px-4 py-3 text-base font-semibold text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-white/30"
                            placeholder="1"
                            emptyValue={1}
                            integer
                          />
                        </div>
                      </div>

                      {/* Plastic Setup for this hole */}
                      <div className={`mt-4 rounded-xl border-2 px-4 py-3 flex items-center justify-between cursor-pointer transition-all ${
                        currentHole.plasticSetup
                          ? 'border-brand bg-brand/5 dark:bg-brand/20'
                          : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                      }`}
                        onClick={() => setCurrentHole(prev => ({ ...prev, plasticSetup: !prev.plasticSetup }))}>
                        <div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">Plastic Setup Required</span>
                          <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">Need plastic for dust control?</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={currentHole.plasticSetup}
                          onChange={(e) => setCurrentHole(prev => ({ ...prev, plasticSetup: e.target.checked }))}
                          className="w-5 h-5 text-brand bg-white dark:bg-white/10 border-2 border-gray-300 dark:border-white/20 rounded focus:ring-2 focus:ring-brand"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>

                      {/* Cut Rebar (what SIZE) for this hole */}
                      <RebarSizePicker
                        className="mt-3"
                        title="Cut Rebar?"
                        value={currentHole.rebarSize || ''}
                        onChange={(size) => setCurrentHole(prev => ({ ...prev, rebarSize: size }))}
                      />

                      <button
                        onClick={addHole}
                        className="mt-4 w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl transition-all flex items-center justify-center gap-2 font-bold shadow-md hover:shadow-lg"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add This Hole
                      </button>
                    </div>

                    {/* Added Holes List */}
                    {coreDrillingData.holes.length > 0 && (
                      <div className="bg-white dark:bg-white/[0.04] rounded-2xl border border-gray-200 dark:border-white/10 p-4">
                        <h5 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2 border-l-4 border-brand pl-3 text-base">
                          <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Added Holes ({coreDrillingData.holes.length} entries)
                        </h5>
                        <div className="space-y-2">
                          {coreDrillingData.holes.map((hole, index) => (
                            <div key={index} className="bg-gray-50 dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/10 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-4 text-sm">
                                  <div>
                                    <span className="font-semibold text-gray-900 dark:text-white">{hole.bitSize}</span>
                                    <span className="text-gray-500 dark:text-white/40"> bit</span>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-gray-900 dark:text-white">{hole.depthInches}&quot;</span>
                                    <span className="text-gray-500 dark:text-white/40"> deep</span>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-gray-900 dark:text-white">{hole.quantity}</span>
                                    <span className="text-gray-500 dark:text-white/40"> {hole.quantity === 1 ? 'hole' : 'holes'}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => removeHole(index)}
                                  className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg p-1.5 transition-all"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                              {(hole.plasticSetup || rebarLabel(hole)) && (
                                <div className="flex gap-2 text-xs">
                                  {hole.plasticSetup && (
                                    <span className="px-2 py-1 bg-brand/10 dark:bg-brand/20 text-brand dark:text-brand rounded-full font-medium">Plastic Setup</span>
                                  )}
                                  {rebarLabel(hole) && (
                                    <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full font-medium">
                                      {rebarLabel(hole)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}


                    {/* Notes for this item live in the shared QUICK NOTES block
                        below — one field for every work type, always after the
                        numbers. */}
                  </div>
                )}

                {/* Sawing Specific Fields */}
                {isSawing(currentItem) && (
                  <div className="space-y-4">
                    <h4 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 border-l-4 border-orange-500 pl-3">
                      <svg className="w-5 h-5 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                      </svg>
                      Sawing Details
                    </h4>

                    {/* Add New Cut Entry */}
                    <div className="bg-white dark:bg-white/[0.04] rounded-2xl p-4 border border-gray-100 dark:border-white/10 shadow-sm">
                      <h5 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2 border-l-4 border-brand pl-3 text-base">
                        <svg className="w-5 h-5 text-brand flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Cut Entry
                      </h5>

                      {/* Input Mode Toggle — available for EVERY saw type. It
                          used to be gated to Hand Saw, which left slab/wall/
                          wire/ring/push crews with no way to report an L × W
                          area even though the whole area path already worked. */}
                      {/* NO FORK BEFORE THEY CAN TYPE (founder, Aug 11: "for
                          linear feet you don't need a width — they just need
                          the linear footage plus depth, that's it. Make it as
                          easy as possible.")

                          This used to be a 50/50 choice — "How do you want to
                          enter this cut?" — that every operator had to answer
                          on every cut before a single field appeared, and half
                          of it asked for a width that linear-foot work does not
                          have. Linear feet is now simply what you get. The area
                          helper is still here for the crew who cut a rectangle
                          and would rather give L × W, but it is one quiet link,
                          not a gate. */}
                      {cutInputMode === 'linear' ? (
                        <div className="mb-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setCutInputMode('area')}
                            className="min-h-[44px] px-3 text-sm font-semibold text-brand underline underline-offset-2"
                          >
                            Cut a rectangle instead (L × W)
                          </button>
                        </div>
                      ) : (
                        <div className="mb-4 bg-gray-50 dark:bg-white/[0.04] rounded-xl p-3 border border-gray-200 dark:border-white/10">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                              Entering a rectangle (L × W)
                            </span>
                            <button
                              type="button"
                              onClick={() => setCutInputMode('linear')}
                              className="min-h-[44px] px-3 text-sm font-semibold text-brand underline underline-offset-2 whitespace-nowrap"
                            >
                              Use linear feet
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-gray-500 dark:text-white/45">
                            Linear feet are calculated from the perimeter of each area (2 × L + 2 × W).
                          </p>
                        </div>
                      )}

                      {/* LINEAR MODE - Traditional linear feet input */}
                      {cutInputMode === 'linear' && (
                        <>
                          {/* Chainsaw Quick Entry (length in inches) */}
                          {isChainsaw(currentItem) ? (
                            <div className="mb-4">
                              {/* Chainsaw Quick Entry Button */}
                              <button
                                type="button"
                                onClick={() => setShowChainsawModal(true)}
                                className="w-full mb-3 px-4 py-3 bg-gradient-to-r from-brand to-brand-accent hover:from-brand/90 hover:to-brand-accent/90 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Quick Entry - Chain Saw (Inches)
                              </button>

                              {/* Total Linear Feet & Cut Depth */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white dark:bg-white/[0.05] rounded-xl p-4 border-2 border-gray-200 dark:border-white/10">
                                  <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1.5 uppercase tracking-wide">Total Linear Feet</label>
                                  <NumberInput
                                    step="0.1"
                                    min="0"
                                    value={currentCut.linearFeet || ''}
                                    onValueChange={(nv) => setCurrentCut(prev => ({ ...prev, linearFeet: nv }))}
                                    className="w-full px-4 py-3 text-lg border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-white/30"
                                    placeholder="Total linear feet"
                                    emptyValue={0}
                                    blankZero
                                  />
                                  <p className="text-xs text-gray-500 dark:text-white/40 mt-1.5">Use Quick Entry or type directly</p>
                                </div>
                                <div className="bg-white dark:bg-white/[0.05] rounded-xl p-4 border-2 border-gray-200 dark:border-white/10">
                                  <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1.5 uppercase tracking-wide">Cut Depth (in)</label>
                                  <NumberInput
                                    step="0.25"
                                    min="0"
                                    value={currentCut.cutDepth || ''}
                                    onValueChange={(nv) => setCurrentCut(prev => ({ ...prev, cutDepth: nv }))}
                                    className="w-full px-4 py-3 text-lg border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-white/30"
                                    placeholder="Depth"
                                    emptyValue={0}
                                    blankZero
                                  />
                                  <p className="text-xs text-gray-500 dark:text-white/40 mt-1.5">Auto-filled from Quick Entry or type directly</p>
                                </div>
                              </div>
                            </div>
                          ) : (isSlabSaw(currentItem) || isWallSaw(currentItem) || isHandSaw(currentItem)) ? (
                            /* Saw Types Multi-Cut Entry (Slab, Wall, Hand Saw) */
                            <div className="mb-4">
                              {/* Quick Entry Button */}
                              <button
                                type="button"
                                onClick={() => setShowQuickEntryModal(true)}
                                className="w-full mb-3 px-4 py-3 bg-gradient-to-r from-brand to-brand-accent hover:from-brand/90 hover:to-brand-accent/90 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Quick Entry - Multiple Cuts
                              </button>

                              {/* Total Linear Feet & Cut Depth */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white dark:bg-white/[0.05] rounded-xl p-4 border-2 border-gray-200 dark:border-white/10">
                                  <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1.5 uppercase tracking-wide">Total Linear Feet</label>
                                  <NumberInput
                                    step="0.1"
                                    min="0"
                                    value={currentCut.linearFeet || ''}
                                    onValueChange={(nv) => setCurrentCut(prev => ({ ...prev, linearFeet: nv }))}
                                    className="w-full px-4 py-3 text-lg border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-white/30"
                                    placeholder="Total linear feet"
                                    emptyValue={0}
                                    blankZero
                                  />
                                  <p className="text-xs text-gray-500 dark:text-white/40 mt-1.5">Use Quick Entry or type directly</p>
                                </div>
                                <div className="bg-white dark:bg-white/[0.05] rounded-xl p-4 border-2 border-gray-200 dark:border-white/10">
                                  <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1.5 uppercase tracking-wide">Cut Depth (in)</label>
                                  <NumberInput
                                    step="0.25"
                                    min="0"
                                    value={currentCut.cutDepth || ''}
                                    onValueChange={(nv) => setCurrentCut(prev => ({ ...prev, cutDepth: nv }))}
                                    className="w-full px-4 py-3 text-lg border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-white/30"
                                    placeholder="Depth"
                                    emptyValue={0}
                                    blankZero
                                  />
                                  <p className="text-xs text-gray-500 dark:text-white/40 mt-1.5">Auto-filled from Quick Entry or type directly</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            // Standard linear feet input for other saw types
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              {/* Linear Feet */}
                              <div>
                                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-1">Linear Feet Cut</label>
                                <NumberInput
                                  step="0.1"
                                  min="0"
                                  value={currentCut.linearFeet || ''}
                                  onValueChange={(nv) => setCurrentCut(prev => ({ ...prev, linearFeet: nv }))}
                                  className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white font-semibold placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  placeholder="Linear feet"
                                  emptyValue={0}
                                  blankZero
                                />
                              </div>

                              {/* Cut Depth */}
                              <div>
                                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-1">Cut Depth (in)</label>
                                <NumberInput
                                  step="0.25"
                                  min="0"
                                  value={currentCut.cutDepth || ''}
                                  onValueChange={(nv) => setCurrentCut(prev => ({ ...prev, cutDepth: nv }))}
                                  className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white font-semibold placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  placeholder="Depth"
                                  emptyValue={0}
                                  blankZero
                                />
                              </div>
                            </div>
                          )}

                          {/* Chainsaw Question */}
                          <div className={`mb-4 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all ${
                            currentCut.chainsawed
                              ? 'border-brand bg-brand/5 dark:bg-brand/20'
                              : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                          }`}
                            onClick={() => setCurrentCut(prev => ({ ...prev, chainsawed: !prev.chainsawed }))}>
                            <label className="flex items-center justify-between cursor-pointer mb-0">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">Did you chainsaw?</span>
                              <input
                                type="checkbox"
                                checked={currentCut.chainsawed}
                                onChange={(e) => setCurrentCut(prev => ({ ...prev, chainsawed: e.target.checked }))}
                                className="w-4 h-4 text-brand rounded"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </label>

                            {currentCut.chainsawed && (
                              <div className="grid grid-cols-2 gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                                <div>
                                  <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1">Number of Areas</label>
                                  <NumberInput
                                    min="1"
                                    value={currentCut.chainsawAreas || ''}
                                    onValueChange={(nv) => setCurrentCut(prev => ({ ...prev, chainsawAreas: nv }))}
                                    className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                    placeholder="e.g., 5"
                                    emptyValue={0}
                                    integer
                                    blankZero
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1">Avg Width (inches)</label>
                                  <NumberInput
                                    step="0.5"
                                    min="0"
                                    value={currentCut.chainsawWidthInches || ''}
                                    onValueChange={(nv) => setCurrentCut(prev => ({ ...prev, chainsawWidthInches: nv }))}
                                    className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                    placeholder="e.g., 3.5"
                                    emptyValue={0}
                                    blankZero
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Cut Rebar (what SIZE) and Overcut - Linear Mode */}
                          <div className="mb-4 space-y-2">
                            <RebarSizePicker
                              title="Cut Rebar?"
                              value={currentCut.rebarSize || ''}
                              onChange={(size) => setCurrentCut(prev => ({ ...prev, rebarSize: size }))}
                            />
                            {(isHandSaw(currentItem) || isChainsaw(currentItem)) && (
                              <div className={`rounded-xl border-2 px-4 py-3 flex items-center justify-between cursor-pointer transition-all ${
                                currentCut.overcut ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                              }`}
                                onClick={() => setCurrentCut(prev => ({ ...prev, overcut: !prev.overcut }))}>
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">Overcut</span>
                                <input
                                  type="checkbox"
                                  checked={currentCut.overcut}
                                  onChange={(e) => setCurrentCut(prev => ({ ...prev, overcut: e.target.checked }))}
                                  className="w-4 h-4 text-amber-600 rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* AREA MODE - Length x Width input for multiple areas */}
                      {cutInputMode === 'area' && (
                        <div className="mb-4">
                          {/* Area Input Form */}
                          <div className="bg-white dark:bg-white/[0.04] rounded-xl p-4 mb-3 border border-gray-200 dark:border-white/10 shadow-sm">
                            <label className="block text-sm font-bold text-gray-900 dark:text-white mb-3">
                              Add Cut Area (e.g., 5&apos; × 7&apos;)
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1">Length (ft)</label>
                                <NumberInput
                                  step="0.1"
                                  min="0"
                                  value={currentArea.length}
                                  onValueChange={(nv) => setCurrentArea(prev => ({ ...prev, length: nv }))}
                                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  placeholder="Length"
                                  emptyValue={0}
                                  blankZero
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1">Width (ft)</label>
                                <NumberInput
                                  step="0.1"
                                  min="0"
                                  value={currentArea.width}
                                  onValueChange={(nv) => setCurrentArea(prev => ({ ...prev, width: nv }))}
                                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  placeholder="Width"
                                  emptyValue={0}
                                  blankZero
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1">Depth (in)</label>
                                <NumberInput
                                  step="0.25"
                                  min="0"
                                  value={currentArea.depth}
                                  onValueChange={(nv) => setCurrentArea(prev => ({ ...prev, depth: nv }))}
                                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  placeholder="Depth"
                                  emptyValue={0}
                                  blankZero
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1">Qty</label>
                                <NumberInput
                                  min="1"
                                  value={currentArea.quantity}
                                  onValueChange={(nv) => setCurrentArea(prev => ({ ...prev, quantity: nv }))}
                                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  placeholder="1"
                                  emptyValue={1}
                                  integer
                                />
                              </div>
                            </div>

                            {/* Overcut for this area (the rebar SIZE follows) */}
                            <div className="mt-3">
                              <div className={`rounded-xl border-2 px-3 py-2.5 flex items-center justify-between cursor-pointer transition-all min-h-[44px] ${
                                currentArea.overcut ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                              }`}
                                onClick={() => setCurrentArea(prev => ({ ...prev, overcut: !prev.overcut }))}>
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">Overcut</span>
                                <input
                                  type="checkbox"
                                  checked={currentArea.overcut}
                                  onChange={(e) => setCurrentArea(prev => ({ ...prev, overcut: e.target.checked }))}
                                  className="w-4 h-4 text-amber-600 rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>

                            {/* Cut Rebar (what SIZE) for this area */}
                            <RebarSizePicker
                              className="mt-3"
                              title="Cut Rebar in this area?"
                              value={currentArea.rebarSize || ''}
                              onChange={(size) => setCurrentArea(prev => ({ ...prev, rebarSize: size }))}
                            />

                            {/* Chainsaw Question */}
                            <div className={`mt-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all ${
                              currentArea.chainsawed ? 'border-brand bg-brand/5 dark:bg-brand/20' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                            }`}
                              onClick={() => setCurrentArea(prev => ({ ...prev, chainsawed: !prev.chainsawed }))}>
                              <label className="flex items-center justify-between cursor-pointer mb-0">
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">Did you chainsaw?</span>
                                <input
                                  type="checkbox"
                                  checked={currentArea.chainsawed}
                                  onChange={(e) => setCurrentArea(prev => ({ ...prev, chainsawed: e.target.checked }))}
                                  className="w-4 h-4 text-brand rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </label>

                              {currentArea.chainsawed && (
                                <div className="grid grid-cols-2 gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                                  <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1">Number of Areas</label>
                                    <NumberInput
                                      min="1"
                                      value={currentArea.chainsawAreas || ''}
                                      onValueChange={(nv) => setCurrentArea(prev => ({ ...prev, chainsawAreas: nv }))}
                                      className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                      placeholder="e.g., 5"
                                      emptyValue={0}
                                      integer
                                      blankZero
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1">Avg Width (inches)</label>
                                    <NumberInput
                                      step="0.5"
                                      min="0"
                                      value={currentArea.chainsawWidthInches || ''}
                                      onValueChange={(nv) => setCurrentArea(prev => ({ ...prev, chainsawWidthInches: nv }))}
                                      className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                      placeholder="e.g., 6"
                                      emptyValue={0}
                                      blankZero
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={addArea}
                              className="mt-3 w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl transition-all flex items-center justify-center gap-2 font-bold shadow-md hover:shadow-lg text-sm"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                              Add Area
                            </button>
                          </div>

                          {/* Added Areas List */}
                          {tempAreas.length > 0 && (
                            <div className="bg-white dark:bg-white/[0.04] rounded-xl p-3 border border-gray-200 dark:border-white/10">
                              <h6 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                                <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Added Areas ({tempAreas.length})
                              </h6>
                              <div className="space-y-2 mb-3">
                                {tempAreas.map((area, index) => (
                                  <div key={index} className="bg-gray-50 dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/10 p-2 text-sm">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-brand dark:text-brand">
                                          {area.length}&apos; × {area.width}&apos; × {area.depth}&quot;
                                        </span>
                                        {area.quantity > 1 && (
                                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                            ×{area.quantity} areas
                                          </span>
                                        )}
                                        <span className="text-xs text-gray-400">
                                          ({calculateLinearFeetFromArea(area).toFixed(1)}&apos; total)
                                        </span>
                                        {rebarLabel(area) && (
                                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                            {rebarLabel(area)}
                                          </span>
                                        )}
                                        {area.overcut && (
                                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                                            Overcut
                                          </span>
                                        )}
                                        {area.chainsawed && (
                                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                            Chainsawed
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeArea(index)}
                                        className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg p-1.5 transition-all flex-shrink-0"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </div>
                                    {/* Legacy-only: with a size picked, the badge
                                        above already says it. */}
                                    {!area.rebarSize && area.steelEncountered && (
                                      <div className="mt-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                                        Steel: {area.steelEncountered}
                                      </div>
                                    )}
                                    {area.chainsawed && area.chainsawAreas && area.chainsawWidthInches && (
                                      <div className="mt-1 text-xs text-purple-700 bg-purple-50 px-2 py-1 rounded">
                                        Chainsaw: {area.chainsawAreas} areas × {area.chainsawWidthInches}&quot; width
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <div className="bg-gradient-to-r from-brand/5 to-brand-accent/5 dark:from-brand/20 dark:to-brand-accent/20 rounded-xl p-3 border border-brand/30 dark:border-brand/20">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="font-bold text-gray-700 dark:text-white/80">Total Linear Feet:</span>
                                  <span className="text-xl font-black text-brand dark:text-brand">
                                    {calculateTotalFromAreas(tempAreas).toFixed(1)}&apos;
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Blade Selection */}
                      <div className="mb-4">
                        <label className="block text-sm font-bold text-gray-900 dark:text-white mb-3 border-l-4 border-brand pl-3">
                          {isChainsaw(currentItem) ? 'Chain Size Used' : 'Blades Used'}{' '}
                          <span className="font-medium text-gray-500 dark:text-white/45">— optional, select any that apply</span>
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                          {getBladesForSawType(currentItem).map((blade) => (
                            <button
                              key={blade}
                              type="button"
                              onClick={() => toggleBladeSelection(blade)}
                              className={`px-3 py-2.5 text-sm rounded-xl border-2 font-semibold transition-all ${
                                selectedBlades.includes(blade)
                                  ? 'border-brand bg-brand/10 dark:bg-brand/20 text-brand dark:text-brand'
                                  : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-700 dark:text-white/70 hover:border-brand hover:bg-brand/5 dark:hover:bg-brand/20'
                              }`}
                            >
                              {blade}
                            </button>
                          ))}
                        </div>

                        {/* Custom Blade Input - Only show for non-hand saws and non-chainsaws */}
                        {!isHandSaw(currentItem) && !isChainsaw(currentItem) && (
                          <div className="bg-gray-50 dark:bg-white/[0.04] rounded-xl p-3 border border-gray-200 dark:border-white/10">
                            <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-2">Custom Blade Size</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={customBladeSize}
                                onChange={(e) => setCustomBladeSize(e.target.value)}
                                placeholder='e.g., 30" Diamond, 36" Wire'
                                className="flex-1 px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder:text-white/30"
                              />
                              <button
                                type="button"
                                onClick={addCustomBlade}
                                disabled={!customBladeSize.trim()}
                                className="px-3 py-2 bg-gradient-to-r from-brand to-brand-accent hover:from-brand/90 hover:to-brand-accent/90 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold transition-all"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Show selected blades */}
                        {selectedBlades.length > 0 && (
                          <div className="mt-3">
                            <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-2">
                              {isChainsaw(currentItem) ? 'Selected Chains:' : 'Selected Blades:'}
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {selectedBlades.map((blade, index) => (
                                <span key={index} className="px-2 py-1 bg-brand/10 dark:bg-brand/20 text-brand dark:text-brand rounded-lg text-xs flex items-center gap-1 font-medium">
                                  {blade}
                                  <button
                                    type="button"
                                    onClick={() => toggleBladeSelection(blade)}
                                    className="hover:bg-brand/20 dark:hover:bg-brand/30 rounded-full p-0.5 transition-colors"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={addCut}
                        className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl transition-all flex items-center justify-center gap-2 font-bold shadow-md hover:shadow-lg"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add This Cut
                      </button>
                    </div>

                    {/* Added Cuts List */}
                    {sawingData.cuts.length > 0 && (
                      <div className="bg-white dark:bg-white/[0.04] rounded-2xl border border-gray-200 dark:border-white/10 p-4">
                        <h5 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2 border-l-4 border-brand pl-3 text-base">
                          <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Added Cuts ({sawingData.cuts.length} entries)
                        </h5>
                        <div className="space-y-3">
                          {sawingData.cuts.map((cut, index) => (
                            <div key={index} className="bg-gray-50 dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/10 p-3">
                              <div className="flex items-start justify-between mb-2 gap-2">
                                <div className="flex flex-wrap items-center gap-2 text-sm flex-1">
                                  <div>
                                    <span className="font-bold text-brand dark:text-brand">{cut.linearFeet.toFixed(1)}&apos;</span>
                                    <span className="text-gray-500 dark:text-white/40"> linear feet</span>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-gray-700 dark:text-white/80">{cut.cutDepth}&quot;</span>
                                    <span className="text-gray-500 dark:text-white/40"> deep</span>
                                  </div>
                                  {cut.inputMode === 'area' && (
                                    <span className="px-2 py-0.5 bg-brand/10 dark:bg-brand/20 text-brand dark:text-brand rounded-full text-xs font-medium">
                                      Area Mode
                                    </span>
                                  )}
                                  {rebarLabel(cut) && (
                                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs font-medium">
                                      {rebarLabel(cut)}
                                    </span>
                                  )}
                                  {cut.overcut && (
                                    <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs font-medium">
                                      Overcut
                                    </span>
                                  )}
                                  {cut.chainsawed && (
                                    <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
                                      Chainsawed
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => removeCut(index)}
                                  className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg p-1.5 transition-all flex-shrink-0"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                              {cut.chainsawed && cut.chainsawAreas && cut.chainsawWidthInches && (
                                <div className="mb-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-2 border border-indigo-200 dark:border-indigo-500/20">
                                  <div className="text-xs text-indigo-700 dark:text-indigo-300">
                                    <span className="font-bold">Chainsaw:</span> {cut.chainsawAreas} areas × {cut.chainsawWidthInches}&quot; width
                                  </div>
                                </div>
                              )}
                              {/* Show areas if entered using area mode */}
                              {cut.inputMode === 'area' && cut.areas && cut.areas.length > 0 && (
                                <div className="mb-2 bg-white dark:bg-white/[0.04] rounded-lg p-2 border border-brand/30 dark:border-brand/20">
                                  <div className="text-xs text-gray-600 dark:text-white/50 mb-1">Cut Areas:</div>
                                  <div className="flex flex-wrap gap-1">
                                    {cut.areas.map((area, areaIndex) => (
                                      <span key={areaIndex} className="px-2 py-1 bg-brand/5 dark:bg-brand/20 text-brand dark:text-brand rounded-full text-xs font-medium">
                                        {area.length}&apos; × {area.width}&apos; ({area.depth}&quot; deep)
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {cut.bladesUsed.length > 0 && (
                                <div className="flex flex-wrap gap-1 text-xs">
                                  <span className="text-gray-500 dark:text-white/40">
                                    {isChainsaw(currentItem) ? 'Chains:' : 'Blades:'}
                                  </span>
                                  {cut.bladesUsed.map((blade, bladeIndex) => (
                                    <span key={bladeIndex} className="px-2 py-0.5 bg-brand/10 dark:bg-brand/20 text-brand dark:text-brand rounded-full font-medium">
                                      {blade}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Legacy free text only — a picked size is on the badge. */}
                              {!cut.rebarSize && cut.cutSteel && cut.steelEncountered && (
                                <div className="mt-2 text-xs">
                                  <span className="text-gray-500 dark:text-white/40">Steel type:</span>
                                  <span className="ml-1 text-red-600 dark:text-red-400 font-medium">{cut.steelEncountered}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes live in the shared QUICK NOTES block below. */}
                  </div>
                )}

                {/* Quick Entry Buttons for Specific Work Types */}
                {!isCoreDrilling(currentItem) && !isSawing(currentItem) && (
                  <div className="mb-6">
                    {/* Break & Remove Quick Entry */}
                    {isBreakAndRemove(currentItem) && (
                      <button
                        type="button"
                        onClick={() => setShowBreakRemoveModal(true)}
                        className="w-full mb-3 px-4 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Quick Entry - Area Calculator
                      </button>
                    )}

                    {/* Jack Hammering Quick Entry */}
                    {isJackHammering(currentItem) && (
                      <button
                        type="button"
                        onClick={() => setShowJackhammerModal(true)}
                        className="w-full mb-3 px-4 py-3 bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Quick Entry - Jack Hammering
                      </button>
                    )}

                    {/* Chipping Quick Entry */}
                    {isChipping(currentItem) && (
                      <button
                        type="button"
                        onClick={() => setShowJackhammerModal(true)}
                        className="w-full mb-3 px-4 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Quick Entry - Chipping Area
                      </button>
                    )}

                    {/* Brokk Quick Entry */}
                    {isBrokk(currentItem) && (
                      <button
                        type="button"
                        onClick={() => setShowBrokkModal(true)}
                        className="w-full mb-3 px-4 py-3 bg-brand hover:bg-brand/90 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Quick Entry - Brokk Area
                      </button>
                    )}
                  </div>
                )}

                {/* Demolition quick-entry result — the numbers the modal just
                    computed. These used to be flattened into a notes string
                    (which also wiped the operator's own note); they're real
                    structured detail now, so show them as data. */}
                {demolitionData && !isCoreDrilling(currentItem) && !isSawing(currentItem) && (
                  <div className="mb-4 rounded-2xl border-2 border-brand/30 dark:border-brand/25 bg-brand/[0.04] dark:bg-brand/10 p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">Recorded</span>
                      <span className="text-xl font-black text-brand">{demolitionData.totalSquareFeet.toFixed(1)} sq ft</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {demolitionData.areas.map((a, i) => (
                        <span key={i} className="px-2 py-1 rounded-lg bg-white dark:bg-white/[0.06] text-gray-700 dark:text-white/70 font-medium border border-gray-200 dark:border-white/10">
                          {a.length}&apos; × {a.width}&apos;
                          {(a.thickness || a.depth) ? ` @ ${a.thickness || a.depth}"` : ''}
                        </span>
                      ))}
                      {demolitionData.method && (
                        <span className="px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold">
                          {demolitionData.method}
                        </span>
                      )}
                      {demolitionData.equipment && (
                        <span className="px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold">
                          {demolitionData.equipment}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* ── HOW MUCH? (work types with no specialised form) ─────────
                    Without this, GRINDING / EXCAVATE DIRT / POURED CONCRETE /
                    REPAIR / SPOT CORES / INSTALL / HAULING offered only a notes
                    box, so the produced quantity never reached the ticket or
                    the invoice. */}
                {hasNoSpecialisedForm(currentItem) && (
                  <div className="mb-4 rounded-2xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4">
                    <h4 className="text-base font-bold text-gray-900 dark:text-white mb-1">How much did you do?</h4>
                    <p className="text-xs text-gray-500 dark:text-white/50 mb-3">
                      This is what goes on the customer&apos;s ticket.
                    </p>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">
                          Amount
                        </label>
                        <NumberInput
                          value={currentQuantity}
                          onValueChange={setCurrentQuantity}
                          emptyValue={0}
                          blankZero
                          min="0"
                          step="0.1"
                          placeholder="e.g. 120"
                          className="w-full px-4 py-3 text-lg font-bold text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none"
                        />
                      </div>
                      <div className="w-36">
                        <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">
                          Unit
                        </label>
                        <select
                          value={currentUnit}
                          onChange={(e) => setCurrentUnit(e.target.value)}
                          className="w-full px-3 py-3 text-base font-semibold text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:outline-none min-h-[44px]"
                        >
                          {['each', 'sq ft', 'linear ft', 'holes', 'loads', 'hours', 'lbs', 'yards'].map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── QUICK NOTES ─────────────────────────────────────────────
                    The founder's headline ask: after the numbers, one obvious,
                    optional box for HOW the job actually went. Same field for
                    every work type, canonical home = work_items.notes. This is
                    the PER-ITEM note; the page's "Job Notes" card covers the
                    whole day. */}
                <div className="rounded-2xl border-2 border-brand/40 dark:border-brand/30 bg-brand/[0.04] dark:bg-brand/10 p-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <MessageSquarePlus className="w-5 h-5 text-brand flex-shrink-0" />
                    <h4 className="text-base font-bold text-gray-900 dark:text-white">Quick notes</h4>
                    <span className="text-xs font-medium text-gray-500 dark:text-white/45">(optional)</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-white/55 mb-3">
                    Prep, access, delays — anything that affected this{' '}
                    <span className="font-semibold text-gray-800 dark:text-white/80">{currentItem.toLowerCase()}</span> work.
                    Tap the mic to talk instead of type.
                  </p>
                  <VoiceMemoNotes
                    compact
                    notes={currentNotes}
                    onNotesChange={setCurrentNotes}
                    placeholder="Set poly. Access was tight. Waited on the contractor."
                  />
                  {/* Honesty about the audience: the placeholder coaches candid
                      prose, so the operator has to know it stays in-house.
                      Enforced server-side — the customer portal, the signature
                      page and the signed PDF do not select work_items.notes. */}
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-white/45">
                    Office only — quick notes stay internal. They are not shown to the customer
                    and never appear on the signed completion sheet.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowQuantityModal(false);
                    // Put them back on the picker they came from.
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="flex-shrink-0 min-h-[44px] px-6 py-3 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-all font-semibold border border-gray-200 dark:border-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddItem}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-brand to-brand-accent hover:from-brand/90 hover:to-brand-accent/90 text-white rounded-xl shadow-md hover:shadow-lg transition-all font-bold flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Work Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add More Dialog */}
      {showAddMoreDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[60] sm:p-4">
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 dark:border-white/10">
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-green-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>

              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 text-center">Work Item Added!</h3>
              <p className="text-gray-500 dark:text-white/50 text-center mb-6">
                Would you like to add another work item or continue to the next step?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleAddMore}
                  className="flex-1 px-6 py-3 bg-white dark:bg-white/10 border-2 border-gray-200 dark:border-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-50 dark:hover:bg-white/20 transition-all font-bold"
                >
                  Add Another
                </button>
                <button
                  onClick={handleContinue}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-brand to-brand-accent hover:from-brand/90 hover:to-brand-accent/90 text-white rounded-xl shadow-md hover:shadow-lg transition-all font-bold"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Quick Entry Modal */}
      {showQuickEntryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-3xl w-full p-4 sm:p-8 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900">Quick Entry - Multiple Cuts</h3>
                <p className="text-sm text-gray-600 mt-1">Add multiple different cut lengths with ease</p>
              </div>
              <button
                onClick={() => {
                  setShowQuickEntryModal(false);
                  setQuickEntryCuts([]);
                  setQuickEntryNumCuts(1);
                  setQuickEntryLengthFeet(0);
                  setQuickEntryDepth(0);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Entry Form */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-blue-200">
              <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Cut Entry
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Number of Cuts */}
                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-2">
                    Number of Cuts
                  </label>
                  <NumberInput
                    min="1"
                    value={quickEntryNumCuts}
                    onValueChange={(nv) => setQuickEntryNumCuts(nv)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none bg-white text-gray-900 font-semibold"
                    placeholder="e.g., 5"
                    emptyValue={1}
                    integer
                  />
                </div>

                {/* Length in Feet */}
                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-2">
                    Length (ft)
                  </label>
                  <NumberInput
                    min="0"
                    step="0.1"
                    value={quickEntryLengthFeet}
                    onValueChange={(nv) => setQuickEntryLengthFeet(nv)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none bg-white text-gray-900 font-semibold"
                    placeholder="e.g., 25.5"
                    emptyValue={0}
                    blankZero
                  />
                </div>

                {/* Depth */}
                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-2">
                    Depth (in)
                  </label>
                  <NumberInput
                    step="0.25"
                    min="0"
                    value={quickEntryDepth}
                    onValueChange={(nv) => setQuickEntryDepth(nv)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none bg-white text-gray-900 font-semibold"
                    placeholder="e.g., 6"
                    emptyValue={0}
                    blankZero
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={addQuickEntryCut}
                className="mt-4 w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add to List
              </button>
            </div>

            {/* List of Added Cuts */}
            {quickEntryCuts.length > 0 && (
              <div className="mb-6">
                <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Cut Entries ({quickEntryCuts.length})
                </h4>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {quickEntryCuts.map((cut, index) => {
                    const totalForCut = cut.numCuts * cut.lengthFeet;

                    return (
                      <div
                        key={index}
                        className="bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-blue-300 transition-colors flex items-center justify-between"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">
                            {cut.numCuts} cuts @ {cut.lengthFeet} ft
                            {cut.depth > 0 && ` × ${cut.depth}" deep`}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            = {totalForCut.toFixed(2)} linear feet
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeQuickEntryCut(index)}
                          className="ml-4 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Total Calculation */}
                <div className="mt-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border-2 border-green-300">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-lg">Total Linear Feet:</span>
                    <span className="font-bold text-green-700 text-2xl">
                      {calculateQuickEntryTotal().toFixed(2)} ft
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowQuickEntryModal(false);
                  setQuickEntryCuts([]);
                  setQuickEntryNumCuts(1);
                  setQuickEntryLengthFeet(0);
                  setQuickEntryDepth(0);
                }}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyQuickEntry}
                disabled={quickEntryCuts.length === 0}
                className={`flex-1 px-6 py-4 rounded-xl font-bold transition-all shadow-lg ${
                  quickEntryCuts.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-xl hover:shadow-2xl'
                }`}
              >
                Apply to Total Linear Feet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chainsaw Quick Entry Modal */}
      {showChainsawModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-brand to-brand-accent text-white p-4 sm:p-6 rounded-t-3xl flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold">Chain Saw Quick Entry</h2>
                <p className="text-white/80 text-xs sm:text-sm mt-1">Length measurements in INCHES</p>
              </div>
              <button
                onClick={() => {
                  setShowChainsawModal(false);
                  setChainsawCuts([]);
                  setChainsawNumCuts(1);
                  setChainsawLengthInches(0);
                  setChainsawDepth(0);
                }}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Entry Form */}
            <div className="p-4 sm:p-6">
              <div className="bg-brand/5 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-brand/30">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Add Cut Entry</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Number of Cuts */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Number of Cuts
                    </label>
                    <NumberInput
                      min="1"
                      value={chainsawNumCuts}
                      onValueChange={(nv) => setChainsawNumCuts(nv)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 5"
                      emptyValue={1}
                      integer
                    />
                  </div>

                  {/* Length in Inches */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Length (inches)
                    </label>
                    <NumberInput
                      min="0"
                      step="0.25"
                      value={chainsawLengthInches}
                      onValueChange={(nv) => setChainsawLengthInches(nv)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 48"
                      emptyValue={0}
                      blankZero
                    />
                  </div>

                  {/* Depth */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Depth (in)
                    </label>
                    <NumberInput
                      step="0.25"
                      min="0"
                      value={chainsawDepth}
                      onValueChange={(nv) => setChainsawDepth(nv)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 12"
                      emptyValue={0}
                      blankZero
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addChainsawCut}
                  className="mt-4 w-full px-6 py-3 bg-brand hover:bg-brand/90 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
                >
                  Add to List
                </button>
              </div>

              {/* List of Cuts */}
              {chainsawCuts.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Cuts Added:</h3>
                  <div className="space-y-2">
                    {chainsawCuts.map((cut, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-100 rounded-xl p-4">
                        <div className="flex items-center gap-4 text-sm font-semibold text-gray-700">
                          <span>{cut.numCuts} cuts</span>
                          <span>×</span>
                          <span>{cut.lengthInches}" long</span>
                          {cut.depth > 0 && (
                            <>
                              <span>@</span>
                              <span>{cut.depth}" deep</span>
                            </>
                          )}
                          <span>=</span>
                          <span className="text-brand font-bold">
                            {((cut.numCuts * cut.lengthInches) / 12).toFixed(2)} ft
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeChainsawCut(index)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg p-2 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="mt-4 bg-brand/10 rounded-xl p-4 border-2 border-brand/30">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-gray-800">Total Linear Feet:</span>
                      <span className="text-2xl font-bold text-brand">
                        {calculateChainsawTotal().toFixed(2)} ft
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-3xl flex gap-4 border-t-2 border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowChainsawModal(false);
                  setChainsawCuts([]);
                  setChainsawNumCuts(1);
                  setChainsawLengthInches(0);
                  setChainsawDepth(0);
                }}
                className="flex-1 px-6 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyChainsawEntry}
                className="flex-1 px-6 py-3 bg-brand hover:bg-brand/90 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
              >
                Apply to Total Linear Feet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Break & Remove Quick Entry Modal */}
      {showBreakRemoveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-red-600 to-rose-600 text-white p-4 sm:p-6 rounded-t-3xl flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold">Break & Remove</h2>
                <p className="text-red-100 text-xs sm:text-sm mt-1">Calculate total square footage removed</p>
              </div>
              <button
                onClick={() => {
                  setShowBreakRemoveModal(false);
                  setBreakRemoveAreas([]);
                  setBreakRemoveLength(0);
                  setBreakRemoveWidth(0);
                  setBreakRemoveDepth(0);
                  setRemovalMethod('');
                  setRemovalEquipment('');
                }}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Entry Form */}
            <div className="p-4 sm:p-6">
              <div className="bg-red-50 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-red-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Add Area</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Length */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Length (ft)
                    </label>
                    <NumberInput
                      min="0"
                      step="0.1"
                      value={breakRemoveLength}
                      onValueChange={(nv) => setBreakRemoveLength(nv)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 10"
                      emptyValue={0}
                      blankZero
                    />
                  </div>

                  {/* Width */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Width (ft)
                    </label>
                    <NumberInput
                      min="0"
                      step="0.1"
                      value={breakRemoveWidth}
                      onValueChange={(nv) => setBreakRemoveWidth(nv)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 8"
                      emptyValue={0}
                      blankZero
                    />
                  </div>

                  {/* Depth */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Depth (in)
                    </label>
                    <NumberInput
                      step="0.25"
                      min="0"
                      value={breakRemoveDepth}
                      onValueChange={(nv) => setBreakRemoveDepth(nv)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 6"
                      emptyValue={0}
                      blankZero
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addBreakRemoveArea}
                  className="mt-4 w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
                >
                  Add Area to List
                </button>
              </div>

              {/* List of Areas */}
              {breakRemoveAreas.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Areas Added:</h3>
                  <div className="space-y-2">
                    {breakRemoveAreas.map((area, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-100 rounded-xl p-4">
                        <div className="flex items-center gap-4 text-sm font-semibold text-gray-700">
                          <span>{area.length} ft</span>
                          <span>×</span>
                          <span>{area.width} ft</span>
                          {area.depth > 0 && (
                            <>
                              <span>@</span>
                              <span>{area.depth}" deep</span>
                            </>
                          )}
                          <span>=</span>
                          <span className="text-red-600 font-bold">
                            {(area.length * area.width).toFixed(2)} sq ft
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBreakRemoveArea(index)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg p-2 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="mt-4 bg-red-100 rounded-xl p-4 border-2 border-red-300">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-gray-800">Total Square Feet:</span>
                      <span className="text-2xl font-bold text-red-600">
                        {calculateBreakRemoveTotal().toFixed(2)} sq ft
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Removal Method */}
              <div className="mb-6 bg-rose-50 rounded-2xl p-6 border-2 border-rose-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Removal Method</h3>

                {/* Method Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-800 mb-2">
                    How was the material removed?
                  </label>
                  <select
                    value={removalMethod}
                    onChange={(e) => {
                      setRemovalMethod(e.target.value);
                      if (e.target.value !== 'rigged') {
                        setRemovalEquipment('');
                      }
                    }}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none bg-white text-gray-900 font-semibold"
                  >
                    <option value="">Select removal method...</option>
                    <option value="hand_removal">Hand Removal</option>
                    <option value="rigged">Rigged with Equipment</option>
                  </select>
                </div>

                {/* Equipment Selection (only if rigged) */}
                {removalMethod === 'rigged' && (
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Equipment Used
                    </label>
                    <select
                      value={removalEquipment}
                      onChange={(e) => setRemovalEquipment(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none bg-white text-gray-900 font-semibold"
                    >
                      <option value="">Select equipment...</option>
                      <option value="lull">Lull</option>
                      <option value="forklift">Forklift</option>
                      <option value="skidsteer">Skidsteer</option>
                      <option value="mini_x">Mini X</option>
                      <option value="sherpa">Sherpa</option>
                      <option value="dingo">Dingo</option>
                      <option value="other">Other</option>
                    </select>

                    {/* Other Equipment Text Input */}
                    {removalEquipment === 'other' && (
                      <input
                        type="text"
                        placeholder="Specify equipment..."
                        value={removalEquipment === 'other' ? '' : removalEquipment}
                        onChange={(e) => setRemovalEquipment(e.target.value)}
                        className="w-full mt-3 px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-3xl flex gap-4 border-t-2 border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowBreakRemoveModal(false);
                  setBreakRemoveAreas([]);
                  setBreakRemoveLength(0);
                  setBreakRemoveWidth(0);
                  setBreakRemoveDepth(0);
                  setRemovalMethod('');
                  setRemovalEquipment('');
                }}
                className="flex-1 px-6 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyBreakRemoveEntry}
                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
              >
                Apply to Work Item
              </button>
            </div>
            {/* Inline, INSIDE the overlay — a toast here renders behind it. */}
            {breakRemoveError && (
              <p className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-3 py-2">
                {breakRemoveError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Jack Hammering Quick Entry Modal */}
      {showJackhammerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-yellow-600 to-amber-600 text-white p-4 sm:p-6 rounded-t-3xl flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold">
                  {isChipping(currentItem) ? 'Chipping' : 'Jack Hammering'} Quick Entry
                </h2>
                <p className="text-yellow-100 text-xs sm:text-sm mt-1">Calculate total square footage</p>
              </div>
              <button
                onClick={() => {
                  setShowJackhammerModal(false);
                  setJackhammerEquipment('');
                  setJackhammerOther('');
                  setJackhammerAreas([]);
                  setJackhammerLength(0);
                  setJackhammerWidth(0);
                }}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Entry Form */}
            <div className="p-4 sm:p-6">
              {/* Equipment Selection */}
              <div className="mb-4 sm:mb-6 bg-yellow-50 rounded-2xl p-4 sm:p-6 border-2 border-yellow-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Equipment Used</h3>
                <select
                  value={jackhammerEquipment}
                  onChange={(e) => {
                    setJackhammerEquipment(e.target.value);
                    if (e.target.value !== 'other') {
                      setJackhammerOther('');
                    }
                  }}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200 focus:outline-none bg-white text-gray-900 font-semibold"
                >
                  <option value="">Select equipment...</option>
                  <option value="hilti_1000">Hilti 1000</option>
                  <option value="hilti_3000">Hilti 3000</option>
                  <option value="other">Other</option>
                </select>

                {/* Other Equipment Text Input */}
                {jackhammerEquipment === 'other' && (
                  <input
                    type="text"
                    placeholder="Specify equipment..."
                    value={jackhammerOther}
                    onChange={(e) => setJackhammerOther(e.target.value)}
                    className="w-full mt-3 px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200 focus:outline-none bg-white text-gray-900 font-semibold"
                  />
                )}
              </div>

              {/* Area Entry */}
              <div className="bg-amber-50 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-amber-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Add Area</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Length */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Length (ft)
                    </label>
                    <NumberInput
                      min="0"
                      step="0.1"
                      value={jackhammerLength}
                      onValueChange={(nv) => setJackhammerLength(nv)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 10"
                      emptyValue={0}
                      blankZero
                    />
                  </div>

                  {/* Width */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Width (ft)
                    </label>
                    <NumberInput
                      min="0"
                      step="0.1"
                      value={jackhammerWidth}
                      onValueChange={(nv) => setJackhammerWidth(nv)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 8"
                      emptyValue={0}
                      blankZero
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addJackhammerArea}
                  className="mt-4 w-full px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
                >
                  Add Area to List
                </button>
              </div>

              {/* List of Areas */}
              {jackhammerAreas.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Areas Added:</h3>
                  <div className="space-y-2">
                    {jackhammerAreas.map((area, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-100 rounded-xl p-4">
                        <div className="flex items-center gap-4 text-sm font-semibold text-gray-700">
                          <span>{area.length} ft</span>
                          <span>×</span>
                          <span>{area.width} ft</span>
                          <span>=</span>
                          <span className="text-yellow-600 font-bold">
                            {(area.length * area.width).toFixed(2)} sq ft
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeJackhammerArea(index)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg p-2 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="mt-4 bg-yellow-100 rounded-xl p-4 border-2 border-yellow-300">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-gray-800">Total Square Feet:</span>
                      <span className="text-2xl font-bold text-yellow-600">
                        {calculateJackhammerTotal().toFixed(2)} sq ft
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-3xl flex gap-4 border-t-2 border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowJackhammerModal(false);
                  setJackhammerEquipment('');
                  setJackhammerOther('');
                  setJackhammerAreas([]);
                  setJackhammerLength(0);
                  setJackhammerWidth(0);
                }}
                className="flex-1 px-6 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyJackhammerEntry}
                className="flex-1 px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
              >
                Apply to Work Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brokk Quick Entry Modal */}
      {showBrokkModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 sm:p-6 rounded-t-3xl flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Brokk Quick Entry</h2>
                <p className="text-gray-500 text-xs sm:text-sm mt-1">Calculate area and thickness</p>
              </div>
              <button
                onClick={() => {
                  setShowBrokkModal(false);
                  setBrokkAreas([]);
                  setBrokkLength(0);
                  setBrokkWidth(0);
                  setBrokkThickness(0);
                }}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Entry Form */}
            <div className="p-4 sm:p-6">
              <div className="bg-gray-100 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-gray-300">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Add Area</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Length */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Length (ft)
                    </label>
                    <NumberInput
                      min="0"
                      step="0.1"
                      value={brokkLength}
                      onValueChange={(nv) => setBrokkLength(nv)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-gray-500 focus:ring-2 focus:ring-gray-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 10"
                      emptyValue={0}
                      blankZero
                    />
                  </div>

                  {/* Width */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Width (ft)
                    </label>
                    <NumberInput
                      min="0"
                      step="0.1"
                      value={brokkWidth}
                      onValueChange={(nv) => setBrokkWidth(nv)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-gray-500 focus:ring-2 focus:ring-gray-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 8"
                      emptyValue={0}
                      blankZero
                    />
                  </div>

                  {/* Thickness */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Thickness (in)
                    </label>
                    <NumberInput
                      step="0.25"
                      min="0"
                      value={brokkThickness}
                      onValueChange={(nv) => setBrokkThickness(nv)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-gray-500 focus:ring-2 focus:ring-gray-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 6"
                      emptyValue={0}
                      blankZero
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addBrokkArea}
                  className="mt-4 w-full px-6 py-3 bg-brand hover:bg-brand/90 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
                >
                  Add Area to List
                </button>
              </div>

              {/* List of Areas */}
              {brokkAreas.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Areas Added:</h3>
                  <div className="space-y-2">
                    {brokkAreas.map((area, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-100 rounded-xl p-4">
                        <div className="flex items-center gap-4 text-sm font-semibold text-gray-700">
                          <span>{area.length} ft</span>
                          <span>×</span>
                          <span>{area.width} ft</span>
                          <span>@</span>
                          <span>{area.thickness}" thick</span>
                          <span>=</span>
                          <span className="text-gray-700 font-bold">
                            {(area.length * area.width).toFixed(2)} sq ft
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBrokkArea(index)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg p-2 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="mt-4 bg-gray-200 rounded-xl p-4 border-2 border-gray-400">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-gray-800">Total Square Feet:</span>
                      <span className="text-2xl font-bold text-gray-700">
                        {calculateBrokkTotal().toFixed(2)} sq ft
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-600">Average Thickness:</span>
                      <span className="text-lg font-bold text-gray-600">
                        {brokkAreas.length > 0
                          ? (brokkAreas.reduce((sum, a) => sum + a.thickness, 0) / brokkAreas.length).toFixed(2)
                          : 0
                        } in
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-3xl flex gap-4 border-t-2 border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowBrokkModal(false);
                  setBrokkAreas([]);
                  setBrokkLength(0);
                  setBrokkWidth(0);
                  setBrokkThickness(0);
                }}
                className="flex-1 px-6 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyBrokkEntry}
                className="flex-1 px-6 py-3 bg-brand hover:bg-brand/90 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
              >
                Apply to Work Item
              </button>
            </div>
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
            <div className="flex-shrink-0">
              {notification.type === 'success' && (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {notification.type === 'error' && (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {notification.type === 'warning' && (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>
            <p className="font-semibold">{notification.message}</p>
            <button
              onClick={() => setNotification(null)}
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