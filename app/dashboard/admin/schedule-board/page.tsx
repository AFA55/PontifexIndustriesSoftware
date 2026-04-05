'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar, Send, Users, Clock, MapPin, Plus, ChevronLeft, ChevronRight,
  LayoutGrid, CalendarDays, Bell, FileText, Phone, Package, AlertCircle,
  UserCheck, UserX, Eye, FolderOpen, Timer, Loader2, Settings, Search, X,
  Megaphone, CheckCircle2, Sparkles, Zap, Brain
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { useFeatureFlags } from '@/lib/feature-flags';
import { supabase } from '@/lib/supabase';
import OperatorRow from './_components/OperatorRow';
import PendingQueueSidebar from './_components/PendingQueueSidebar';
import Toast from './_components/Toast';
import ApprovalModal from './_components/ApprovalModal';
import MissingInfoModal from './_components/MissingInfoModal';
import NotificationBell from './_components/NotificationBell';
import AssignOperatorModal from './_components/AssignOperatorModal';
import EditJobPanel from './_components/EditJobPanel';
import ChangeRequestModal from './_components/ChangeRequestModal';
import NotesDrawer from './_components/NotesDrawer';
import QuickAddModal, { type QuickAddData } from './_components/QuickAddModal';
import ConflictModal from './_components/ConflictModal';
import ScheduleDatePicker from './_components/ScheduleDatePicker';
import DailyNotesSection from './_components/DailyNotesSection';
import type { DailyNote } from './_components/DailyNotesSection';
import type { JobCardData } from './_components/JobCard';
import type { PendingJob } from './_components/PendingQueueSidebar';
import type { ToastData } from './_components/Toast';
import type { NoteData } from './_components/NotesDrawer';
import JobPreviewPanel from './_components/JobPreviewPanel';
import JobDetailView from './_components/JobDetailView';
import DndBoardWrapper from './_components/DndBoardWrapper';
import OperatorRowView from './_components/OperatorRowView';
import ViewToggle from './_components/ViewToggle';
import CrewScheduleGrid from './_components/CrewScheduleGrid';

// ─── Operator color palette ─────────────────────────────────────────────
const OPERATOR_COLORS = [
  { border: 'border-purple-500', bg: 'bg-purple-100', text: 'text-purple-700', badge: 'bg-purple-500', icon: 'text-purple-600' },
  { border: 'border-blue-500', bg: 'bg-blue-100', text: 'text-blue-700', badge: 'bg-blue-500', icon: 'text-blue-600' },
  { border: 'border-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-700', badge: 'bg-emerald-500', icon: 'text-emerald-600' },
  { border: 'border-rose-500', bg: 'bg-rose-100', text: 'text-rose-700', badge: 'bg-rose-500', icon: 'text-rose-600' },
  { border: 'border-indigo-500', bg: 'bg-indigo-100', text: 'text-indigo-700', badge: 'bg-indigo-500', icon: 'text-indigo-600' },
  { border: 'border-cyan-500', bg: 'bg-cyan-100', text: 'text-cyan-700', badge: 'bg-cyan-500', icon: 'text-cyan-600' },
  { border: 'border-amber-600', bg: 'bg-amber-100', text: 'text-amber-700', badge: 'bg-amber-600', icon: 'text-amber-600' },
  { border: 'border-pink-500', bg: 'bg-pink-100', text: 'text-pink-700', badge: 'bg-pink-500', icon: 'text-pink-600' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────
function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(dateString: string) {
  const date = parseLocalDate(dateString);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dateOnly = new Date(date); dateOnly.setHours(0, 0, 0, 0);
  if (dateOnly.getTime() === today.getTime()) return 'Today';
  if (dateOnly.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function daysAgo(dateString: string) {
  const added = parseLocalDate(dateString);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - added.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── API helper ──────────────────────────────────────────────────────────
async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function apiFetch(url: string, opts?: RequestInit) {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
}

// ─── Convert API job to JobCardData ──────────────────────────────────────
function toJobCard(job: any): JobCardData {
  return {
    id: job.id,
    job_number: job.job_number,
    customer_name: job.customer_name,
    job_type: job.job_type,
    location: job.location || '',
    address: job.address || '',
    equipment_needed: job.equipment_needed || [],
    description: job.description || null,
    scheduled_date: job.scheduled_date || '',
    end_date: job.end_date || null,
    arrival_time: job.arrival_time || null,
    is_will_call: job.is_will_call || false,
    difficulty_rating: job.difficulty_rating || null,
    notes_count: job.notes_count || 0,
    change_requests_count: job.pending_change_requests_count || 0,
    helper_names: job.helper_name ? [job.helper_name] : [],
    po_number: job.po_number || null,
    day_label: computeDayLabel(job),
    status: job.status || null,
  };
}

function computeDayLabel(job: any): string | undefined {
  if (!job.scheduled_date || !job.end_date) return undefined;
  const start = parseLocalDate(job.scheduled_date);
  const end = parseLocalDate(job.end_date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const currentDay = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (currentDay >= 1 && currentDay <= totalDays) return `Day ${currentDay} of ${totalDays}`;
  return undefined;
}

// ─── Conflict data type ─────────────────────────────────────────────────
interface ConflictData {
  personName: string;
  personRole: 'operator' | 'helper';
  currentJobName: string;
  newJob: JobCardData;
  newJobSource: 'unassigned' | 'willcall';
  targetRowIndex: number;
  helperName: string | null;
}

// ─── Row-change conflict (inline dropdown) ──────────────────────────────
interface RowChangeConflict {
  operatorName: string;
  sourceRowIndex: number;   // row where operator currently has jobs
  targetRowIndex: number;   // row where user wants to place operator
  currentJobNames: string[];
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function ScheduleBoardPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(toDateString(new Date()));
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [boardViewMode, setBoardViewMode] = useState<'slots' | 'operators' | 'crew-grid'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('schedule-board-view-mode') as 'slots' | 'operators' | 'crew-grid') || 'slots';
    }
    return 'slots';
  });
  const [weekData, setWeekData] = useState<Record<string, JobCardData[]>>({});
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('admin');
  const [userId, setUserId] = useState<string | null>(null);
  const [operatorSkillMap, setOperatorSkillMap] = useState<Record<string, number | null>>({});

  // Feature flags — determines read-only vs edit access for non-super-admins
  const { flags: featureFlags, loading: flagsLoading } = useFeatureFlags(userId, userRole);

  // canEdit: super_admin always can; operations_manager always can; others need the flag
  const canEdit = userRole === 'super_admin' || userRole === 'operations_manager' || featureFlags.can_edit_schedule_board;

  // ═══ DATA STATE (from API) ═══
  const [operatorJobs, setOperatorJobs] = useState<Record<number, JobCardData[]>>({});
  const [unassignedJobs, setUnassignedJobs] = useState<JobCardData[]>([]);
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);
  const [willCallJobs, setWillCallJobs] = useState<JobCardData[]>([]);
  const [jobNotes, setJobNotes] = useState<Record<string, NoteData[]>>({});
  const [dailyNotes, setDailyNotes] = useState<DailyNote[]>([]);

  // Crew roster from API
  const [allOperatorsList, setAllOperatorsList] = useState<string[]>([]);
  const [allHelpersList, setAllHelpersList] = useState<string[]>([]);
  const [operatorIdMap, setOperatorIdMap] = useState<Record<string, string>>({}); // name → id
  const [helperIdMap, setHelperIdMap] = useState<Record<string, string>>({}); // name → id

  // ═══ CAPACITY SETTINGS ═══
  const [capacityMaxSlots, setCapacityMaxSlots] = useState(8);
  const [capacityWarningThreshold, setCapacityWarningThreshold] = useState(7);
  const [shopNotesEnabled, setShopNotesEnabled] = useState(true);
  const [shopNotesLabel, setShopNotesLabel] = useState('Shop / Notes');
  const [shopNotesText, setShopNotesText] = useState('');
  const [findingNextAvailable, setFindingNextAvailable] = useState(false);
  const [nextAvailableDate, setNextAvailableDate] = useState<{ date: string; jobCount: number; availableSlots: number } | null>(null);

  // ═══ TIME-OFF STATE ═══
  const [timeOffMap, setTimeOffMap] = useState<Record<string, { type: string; notes: string | null }>>({});

  // ═══ ROW ASSIGNMENTS — who's in which crew row (driven by capacityMaxSlots) ═══
  const [rowAssignments, setRowAssignments] = useState<{ operator: string | null; helper: string | null }[]>(
    Array.from({ length: 8 }, () => ({ operator: null, helper: null }))
  );
  const NUM_ROWS = capacityMaxSlots;

  // ═══ UI STATE ═══
  const [showPendingQueue, setShowPendingQueue] = useState(false);
  const [showWillCall, setShowWillCall] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCapacitySettings, setShowCapacitySettings] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  // Dispatch state
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchInfo, setDispatchInfo] = useState<{ total: number; dispatched: number; undispatched: number } | null>(null);

  // Modal states
  const [approvalTarget, setApprovalTarget] = useState<PendingJob | null>(null);
  const [missingInfoTarget, setMissingInfoTarget] = useState<PendingJob | null>(null);
  const [assignTarget, setAssignTarget] = useState<{ job: JobCardData; source: 'unassigned' | 'willcall' } | null>(null);
  const [editTarget, setEditTarget] = useState<{ job: JobCardData; rowIndex: number | null } | null>(null);
  const [changeRequestTarget, setChangeRequestTarget] = useState<JobCardData | null>(null);
  const [notesTarget, setNotesTarget] = useState<JobCardData | null>(null);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);
  const [rowChangeConflict, setRowChangeConflict] = useState<RowChangeConflict | null>(null);
  const [previewJob, setPreviewJob] = useState<{ job: JobCardData; operatorName?: string | null; helperName?: string | null } | null>(null);
  const [jobDetailTarget, setJobDetailTarget] = useState<{ job: JobCardData; rowIndex: number | null; operatorName?: string | null; helperName?: string | null } | null>(null);

  // ═══ AI AUTO-SCHEDULE STATE ═══
  const [autoScheduleLoading, setAutoScheduleLoading] = useState(false);
  const [autoScheduleResults, setAutoScheduleResults] = useState<{
    assignments: { jobNumber: string; customerName: string; operatorName: string; matchQuality: string; reason: string; travelDistance?: number | null }[];
    skipped: { jobNumber: string; customerName: string; reason: string }[];
    totalAssigned: number;
    totalUnassigned: number;
    totalSkipped: number;
    message: string;
  } | null>(null);

  // ═══ TOAST HELPER ═══
  const addToast = useCallback((type: ToastData['type'], title: string, message?: string) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, title, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ═══ DISPATCH HELPERS ═══
  const fetchDispatchStatus = useCallback(async (date: string) => {
    try {
      const res = await apiFetch(`/api/admin/schedule-board/dispatch?date=${date}`);
      if (res.ok) {
        const json = await res.json();
        setDispatchInfo({ total: json.total, dispatched: json.dispatched, undispatched: json.undispatched });
      }
    } catch { /* ignore */ }
  }, []);

  const handleDispatchJobs = useCallback(async (targetDate: string) => {
    setDispatchLoading(true);
    try {
      const res = await apiFetch('/api/admin/schedule-board/dispatch', {
        method: 'POST',
        body: JSON.stringify({ target_date: targetDate }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        addToast('success', 'Jobs Dispatched', json.message);
        setShowDispatchModal(false);
        fetchDispatchStatus(targetDate);
      } else {
        addToast('error', 'Dispatch Failed', json.error || 'Unknown error');
      }
    } catch {
      addToast('error', 'Dispatch Failed', 'Network error occurred.');
    } finally {
      setDispatchLoading(false);
    }
  }, [addToast, fetchDispatchStatus]);

  // ═══ AUTH GUARD ═══
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    const role = currentUser.role || 'admin';
    if (!['admin', 'super_admin', 'salesman', 'operations_manager'].includes(role)) {
      router.push('/dashboard');
      return;
    }
    setUserRole(role);
    setUserId(currentUser.id || null);
  }, [router]);

  // ═══ FEATURE FLAG GUARD ═══
  useEffect(() => {
    if (flagsLoading) return;
    const isBypass = userRole === 'super_admin' || userRole === 'operations_manager';
    if (!isBypass && !featureFlags.can_view_schedule_board) {
      router.push('/dashboard/admin');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flagsLoading, featureFlags.can_view_schedule_board]);

  // ═══ FETCH OPERATORS/HELPERS ═══
  useEffect(() => {
    async function fetchCrew() {
      try {
        const res = await apiFetch('/api/admin/schedule-board/operators');
        if (res.ok) {
          const json = await res.json();
          const ops: { id: string; name: string }[] = json.data?.operators || [];
          const helpers: { id: string; name: string }[] = json.data?.helpers || [];
          setAllOperatorsList(ops.map(o => o.name));
          setAllHelpersList(helpers.map(h => h.name));
          const opMap: Record<string, string> = {};
          ops.forEach(o => { opMap[o.name] = o.id; });
          setOperatorIdMap(opMap);
          const helpMap: Record<string, string> = {};
          helpers.forEach(h => { helpMap[h.name] = h.id; });
          setHelperIdMap(helpMap);
        }
      } catch (err) {
        console.error('Failed to fetch crew:', err);
      }
    }
    fetchCrew();
  }, []);

  // ═══ FETCH OPERATOR SKILL LEVELS ═══
  useEffect(() => {
    async function fetchSkills() {
      try {
        const res = await apiFetch('/api/admin/schedule-board/operator-skills');
        if (res.ok) {
          const json = await res.json();
          const map: Record<string, number | null> = {};
          for (const op of json.data || []) {
            if (op.full_name) map[op.full_name] = op.skill_level_numeric ?? null;
          }
          setOperatorSkillMap(map);
        }
      } catch { /* ignore */ }
    }
    fetchSkills();
  }, []);

  // ═══ BOARD VIEW MODE HANDLER ═══
  const handleBoardViewModeChange = useCallback((mode: 'slots' | 'operators' | 'crew-grid') => {
    setBoardViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('schedule-board-view-mode', mode);
    }
  }, []);

  // ═══ DND REORDER HANDLER ═══
  const handleDndReorder = useCallback(async (
    jobId: string,
    targetOperatorId: string | null,
    _sourceOperatorId: string | null
  ): Promise<boolean> => {
    // Find the job in current state
    let draggedJob: JobCardData | null = null;
    let sourceRowIndex: number | null = null;

    for (let i = 0; i < NUM_ROWS; i++) {
      const jobs = operatorJobs[i] || [];
      const found = jobs.find(j => j.id === jobId);
      if (found) {
        draggedJob = found;
        sourceRowIndex = i;
        break;
      }
    }

    if (!draggedJob) {
      draggedJob = unassignedJobs.find(j => j.id === jobId) || null;
      sourceRowIndex = null;
    }

    if (!draggedJob) {
      addToast('error', 'Move Failed', 'Could not find job to move');
      return false;
    }

    // Find target row by operator ID
    let targetRowIndex: number | null = null;
    if (targetOperatorId === 'unassigned' || targetOperatorId === null) {
      targetRowIndex = null; // Move to unassigned
    } else {
      for (let i = 0; i < NUM_ROWS; i++) {
        const opName = rowAssignments[i]?.operator;
        if (opName && operatorIdMap[opName] === targetOperatorId) {
          targetRowIndex = i;
          break;
        }
      }
      // Also check by row-index format
      if (targetRowIndex === null && targetOperatorId.startsWith('row-')) {
        const idx = parseInt(targetOperatorId.replace('row-', ''));
        if (!isNaN(idx) && idx < NUM_ROWS) targetRowIndex = idx;
      }
    }

    // Same location — no change needed
    if (sourceRowIndex === targetRowIndex) return false;

    // Optimistic update: move in UI immediately
    // Remove from source
    if (sourceRowIndex !== null) {
      setOperatorJobs(prev => ({
        ...prev,
        [sourceRowIndex!]: (prev[sourceRowIndex!] || []).filter(j => j.id !== jobId),
      }));
    } else {
      setUnassignedJobs(prev => prev.filter(j => j.id !== jobId));
    }

    // Add to target
    if (targetRowIndex !== null) {
      setOperatorJobs(prev => ({
        ...prev,
        [targetRowIndex!]: [...(prev[targetRowIndex!] || []), draggedJob!],
      }));
    } else {
      setUnassignedJobs(prev => [...prev, draggedJob!]);
    }

    // Call API
    const targetOp = targetRowIndex !== null ? rowAssignments[targetRowIndex]?.operator : null;
    const targetOpId = targetOp ? operatorIdMap[targetOp] : null;
    const targetHelpName = targetRowIndex !== null ? rowAssignments[targetRowIndex]?.helper : null;
    const targetHelpId = targetHelpName ? operatorIdMap[targetHelpName] : null;

    try {
      const res = await apiFetch('/api/admin/schedule-board/reorder', {
        method: 'PATCH',
        body: JSON.stringify({
          jobId: jobId,
          newOperatorId: targetOpId || null,
          newHelperId: targetHelpId || null,
        }),
      });

      if (!res.ok) {
        // Revert optimistic update
        if (targetRowIndex !== null) {
          setOperatorJobs(prev => ({
            ...prev,
            [targetRowIndex!]: (prev[targetRowIndex!] || []).filter(j => j.id !== jobId),
          }));
        } else {
          setUnassignedJobs(prev => prev.filter(j => j.id !== jobId));
        }
        if (sourceRowIndex !== null) {
          setOperatorJobs(prev => ({
            ...prev,
            [sourceRowIndex!]: [...(prev[sourceRowIndex!] || []), draggedJob!],
          }));
        } else {
          setUnassignedJobs(prev => [...prev, draggedJob!]);
        }
        addToast('error', 'Move Failed', 'Could not reassign job');
        return false;
      }

      const targetName = targetOp || 'Unassigned';
      addToast('success', 'Job Moved', `${draggedJob.customer_name} → ${targetName}`);
      return true;
    } catch {
      // Revert optimistic: put it back
      if (targetRowIndex !== null) {
        setOperatorJobs(prev => ({
          ...prev,
          [targetRowIndex!]: (prev[targetRowIndex!] || []).filter(j => j.id !== jobId),
        }));
      } else {
        setUnassignedJobs(prev => prev.filter(j => j.id !== jobId));
      }
      if (sourceRowIndex !== null) {
        setOperatorJobs(prev => ({
          ...prev,
          [sourceRowIndex!]: [...(prev[sourceRowIndex!] || []), draggedJob!],
        }));
      } else {
        setUnassignedJobs(prev => [...prev, draggedJob!]);
      }
      addToast('error', 'Move Failed', 'An error occurred');
      return false;
    }
  }, [operatorJobs, unassignedJobs, rowAssignments, operatorIdMap, addToast, selectedDate, NUM_ROWS]);

  // ═══ FETCH SCHEDULE DATA ═══
  const fetchScheduleData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/schedule-board?date=${date}`);
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { const j = await res.json(); errMsg = j.error || errMsg; } catch { /* ignore */ }
        throw new Error(errMsg);
      }
      const json = await res.json();

      const unassigned = (json.data?.unassigned || []).map(toJobCard);
      const pending = (json.data?.pending || []).map((j: any) => ({
        id: j.id,
        job_number: j.job_number,
        customer_name: j.customer_name,
        job_type: j.job_type,
        location: j.location || '',
        address: j.address || '',
        equipment_needed: j.equipment_needed || [],
        description: j.description || null,
        submitted_by: j.salesman_name || 'Unknown',
        submitted_at: j.created_at,
        difficulty_rating: j.difficulty_rating || null,
        is_will_call: false,
        scheduled_date: j.scheduled_date,
        end_date: j.end_date || null,
        estimated_cost: j.estimated_cost ? Number(j.estimated_cost) : null,
        jobsite_conditions: j.jobsite_conditions || null,
        site_compliance: j.site_compliance || null,
        equipment_selections: j.equipment_selections || null,
        scope_details: j.scope_details || null,
        additional_info: j.additional_info || null,
        special_equipment: j.special_equipment || null,
        missing_info_flagged: j.missing_info_flagged || false,
        missing_info_items: j.missing_info_items || [],
        missing_info_note: j.missing_info_note || null,
      }));
      const willCall = (json.data?.willCall || []).map(toJobCard);

      // Group assigned jobs by operator name into rows
      const newRows: { operator: string | null; helper: string | null }[] = [];
      const newJobsByOp: Record<number, JobCardData[]> = {};
      const operatorGrouped = new Map<string, { jobs: JobCardData[]; helperName: string | null }>();

      for (const rawJob of json.data?.assigned || []) {
        const opName = rawJob.operator_name || 'Unassigned';
        if (!operatorGrouped.has(opName)) {
          operatorGrouped.set(opName, { jobs: [], helperName: rawJob.helper_name || null });
        }
        operatorGrouped.get(opName)!.jobs.push(toJobCard(rawJob));
      }

      let rowIdx = 0;
      operatorGrouped.forEach((group, opName) => {
        newRows.push({ operator: opName, helper: group.helperName });
        newJobsByOp[rowIdx] = group.jobs;
        rowIdx++;
      });

      // Fill remaining rows up to capacity
      while (newRows.length < capacityMaxSlots) {
        newRows.push({ operator: null, helper: null });
      }

      setRowAssignments(newRows);
      setOperatorJobs(newJobsByOp);
      setUnassignedJobs(unassigned);
      setPendingJobs(pending);
      setWillCallJobs(willCall);
    } catch (err: any) {
      console.error('Failed to fetch schedule:', err);
      addToast('error', 'Failed to Load', err?.message || 'Could not fetch schedule data');
    } finally {
      setLoading(false);
    }
  }, [addToast, capacityMaxSlots]);

  // ═══ FETCH WEEK DATA (for weekly view) ═══
  const fetchWeekData = useCallback(async (startDate: string) => {
    try {
      // Calculate Mon-Sun of the week containing startDate
      const d = parseLocalDate(startDate);
      const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ...
      const monday = new Date(d);
      monday.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const monStr = toDateString(monday);
      const sunStr = toDateString(sunday);

      const res = await apiFetch(`/api/admin/schedule-board?startDate=${monStr}&endDate=${sunStr}`);
      if (!res.ok) return;
      const json = await res.json();

      // Group all jobs by date
      const byDate: Record<string, JobCardData[]> = {};
      for (let i = 0; i < 7; i++) {
        const dt = new Date(monday);
        dt.setDate(monday.getDate() + i);
        byDate[toDateString(dt)] = [];
      }

      const allJobs = [...(json.data?.assigned || []), ...(json.data?.unassigned || [])];
      for (const rawJob of allJobs) {
        const jobDate = rawJob.scheduled_date;
        if (byDate[jobDate]) {
          byDate[jobDate].push(toJobCard(rawJob));
        } else {
          // Multi-day job might span the week
          byDate[jobDate] = [toJobCard(rawJob)];
        }
      }

      setWeekData(byDate);
    } catch (err) {
      console.error('Failed to fetch week data:', err);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'day') {
      fetchScheduleData(selectedDate);
      fetchDispatchStatus(selectedDate);
    } else {
      fetchWeekData(selectedDate);
    }
  }, [selectedDate, viewMode, fetchScheduleData, fetchDispatchStatus, fetchWeekData]);

  // ═══ FETCH DAILY NOTES ═══
  useEffect(() => {
    async function fetchDailyNotes() {
      try {
        const res = await apiFetch(`/api/admin/daily-notes?date=${selectedDate}`);
        if (res.ok) {
          const json = await res.json();
          setDailyNotes(json.data || []);
        }
      } catch { setDailyNotes([]); }
    }
    fetchDailyNotes();
  }, [selectedDate]);

  // ═══ FETCH TIME-OFF DATA ═══
  useEffect(() => {
    async function fetchTimeOff() {
      try {
        const res = await apiFetch(`/api/admin/schedule-board/time-off?date=${selectedDate}`);
        if (res.ok) {
          const json = await res.json();
          const map: Record<string, { type: string; notes: string | null }> = {};
          for (const entry of json.data || []) {
            map[entry.operator_id] = { type: entry.type, notes: entry.notes };
          }
          setTimeOffMap(map);
        }
      } catch { setTimeOffMap({}); }
    }
    fetchTimeOff();
  }, [selectedDate]);

  // ═══ FETCH CAPACITY SETTINGS ═══
  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await apiFetch('/api/admin/schedule-board/settings');
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setCapacityMaxSlots(json.data.max_slots ?? 10);
            setCapacityWarningThreshold(json.data.warning_threshold ?? 8);
            setShopNotesEnabled(json.data.shop_notes_enabled ?? true);
            setShopNotesLabel(json.data.shop_notes_label ?? 'Shop / Notes');
          }
        }
      } catch { /* use defaults */ }
    }
    fetchSettings();
  }, []);

  // ═══ FIND NEXT AVAILABLE DATE ═══
  const handleFindNextAvailable = async () => {
    setFindingNextAvailable(true);
    setNextAvailableDate(null);
    try {
      const res = await apiFetch(`/api/admin/schedule-board/capacity?findNext=true&from=${selectedDate}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data?.nextAvailableDate) {
          setNextAvailableDate({
            date: json.data.nextAvailableDate,
            jobCount: json.data.jobCount,
            availableSlots: json.data.availableSlots,
          });
          addToast('success', 'Next Available Found', `${new Date(json.data.nextAvailableDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} — ${json.data.availableSlots} slots open`);
        } else {
          addToast('info', 'No Available Dates', 'No date with capacity below warning threshold found in next 90 days');
        }
      }
    } catch {
      addToast('error', 'Search Failed', 'Could not search for available dates');
    }
    setFindingNextAvailable(false);
  };

  // ═══ SAVE CAPACITY SETTINGS ═══
  const handleSaveCapacitySettings = async (maxSlots: number, warningThreshold: number) => {
    try {
      const res = await apiFetch('/api/admin/schedule-board/settings', {
        method: 'PATCH',
        body: JSON.stringify({ max_slots: maxSlots, warning_threshold: warningThreshold }),
      });
      if (res.ok) {
        setCapacityMaxSlots(maxSlots);
        setCapacityWarningThreshold(warningThreshold);
        addToast('success', 'Settings Updated', `Capacity: ${maxSlots} slots, warning at ${warningThreshold}`);
        setShowCapacitySettings(false);
        // Refresh data with new row count
        fetchScheduleData(selectedDate);
      } else {
        addToast('error', 'Save Failed', 'Could not update capacity settings');
      }
    } catch {
      addToast('error', 'Save Failed', 'Could not connect to server');
    }
  };

  // ═══ AI AUTO-SCHEDULE HANDLER ═══
  const handleAutoSchedule = async () => {
    if (unassignedJobs.length === 0) {
      addToast('info', 'No Unassigned Jobs', 'All jobs for this date are already assigned');
      return;
    }

    setAutoScheduleLoading(true);
    try {
      const res = await apiFetch('/api/admin/schedule-board/auto-schedule', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedDate,
          options: { maxJobsPerOperator: Math.max(3, Math.ceil(unassignedJobs.length / allOperatorsList.length) + 2) },
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setAutoScheduleResults({
          assignments: json.data.assignments || [],
          skipped: json.data.skipped || [],
          totalAssigned: json.data.totalAssigned || 0,
          totalUnassigned: json.data.totalUnassigned || 0,
          totalSkipped: json.data.totalSkipped || 0,
          message: json.message || '',
        });

        // Refresh the board to show new assignments
        fetchScheduleData(selectedDate);

        if (json.data.totalAssigned > 0) {
          addToast('success', 'AI Schedule Complete', json.message);
        } else {
          addToast('info', 'No Assignments Made', json.message);
        }
      } else {
        addToast('error', 'Auto-Schedule Failed', json.error || 'Unknown error');
      }
    } catch {
      addToast('error', 'Auto-Schedule Failed', 'Network error occurred');
    } finally {
      setAutoScheduleLoading(false);
    }
  };

  // ═══ DRAG & DROP — Move job between rows ═══
  const handleDropJob = async (jobDataStr: string, targetRowIndex: number) => {
    try {
      const { jobId, sourceRowIndex } = JSON.parse(jobDataStr);
      if (sourceRowIndex === targetRowIndex) return; // dropped on same row

      // Find the job in current state
      let draggedJob: JobCardData | null = null;

      // Check if source is an operator row
      if (sourceRowIndex !== undefined && sourceRowIndex !== null && sourceRowIndex >= 0) {
        const sourceJobs = operatorJobs[sourceRowIndex] || [];
        draggedJob = sourceJobs.find(j => j.id === jobId) || null;
      }

      // Check unassigned jobs if not found
      if (!draggedJob) {
        draggedJob = unassignedJobs.find(j => j.id === jobId) || null;
      }

      if (!draggedJob) {
        addToast('error', 'Move Failed', 'Could not find job to move');
        return;
      }

      // Get target operator ID
      const targetOperator = rowAssignments[targetRowIndex]?.operator;
      const targetHelper = rowAssignments[targetRowIndex]?.helper;
      const targetOperatorId = targetOperator ? operatorIdMap[targetOperator] : null;
      const targetHelperId = targetHelper ? operatorIdMap[targetHelper] : null;

      // Update backend
      const res = await apiFetch('/api/admin/schedule-board/assign', {
        method: 'POST',
        body: JSON.stringify({
          jobOrderId: jobId,
          operatorId: targetOperatorId || null,
          helperId: targetHelperId || null,
        }),
      });

      if (!res.ok) {
        addToast('error', 'Move Failed', 'Could not reassign job');
        return;
      }

      // Update local state — remove from source
      if (sourceRowIndex !== undefined && sourceRowIndex !== null && sourceRowIndex >= 0) {
        setOperatorJobs(prev => ({
          ...prev,
          [sourceRowIndex]: (prev[sourceRowIndex] || []).filter(j => j.id !== jobId),
        }));
      } else {
        // Remove from unassigned
        setUnassignedJobs(prev => prev.filter(j => j.id !== jobId));
      }

      // Add to target row
      setOperatorJobs(prev => ({
        ...prev,
        [targetRowIndex]: [...(prev[targetRowIndex] || []), draggedJob!],
      }));

      const targetName = targetOperator || `Row ${targetRowIndex + 1}`;
      addToast('success', 'Job Moved', `${draggedJob.customer_name} → ${targetName}`);
    } catch (err) {
      console.error('Drop error:', err);
      addToast('error', 'Move Failed', 'An error occurred while moving the job');
    }
  };

  // ═══ COMPUTED: who's busy (has jobs) ═══
  const busyOperators = useMemo(() => {
    const map: Record<string, string> = {};
    for (let i = 0; i < NUM_ROWS; i++) {
      const jobs = operatorJobs[i] || [];
      const op = rowAssignments[i]?.operator;
      if (jobs.length > 0 && op) {
        map[op] = jobs[0].customer_name;
      }
    }
    return map;
  }, [operatorJobs, rowAssignments, NUM_ROWS]);

  const busyHelpers = useMemo(() => {
    const map: Record<string, string> = {};
    for (let i = 0; i < NUM_ROWS; i++) {
      const jobs = operatorJobs[i] || [];
      const helper = rowAssignments[i]?.helper;
      if (jobs.length > 0 && helper) {
        map[helper] = jobs[0].customer_name;
      }
    }
    return map;
  }, [operatorJobs, rowAssignments, NUM_ROWS]);

  // ═══ COMPUTED STATS ═══
  const totalJobs = Object.values(operatorJobs).reduce((sum, jobs) => sum + jobs.length, 0) + unassignedJobs.length;
  const activeOperators = Object.entries(operatorJobs).filter(([, jobs]) => jobs.length > 0).length;
  const availableOperators = NUM_ROWS - activeOperators;
  const changeRequestCount = Object.values(operatorJobs).flat().reduce((sum, j) => sum + j.change_requests_count, 0);

  // ═══ DATE NAVIGATION ═══
  const goToPreviousDay = () => {
    const d = parseLocalDate(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(toDateString(d));
  };
  const goToNextDay = () => {
    const d = parseLocalDate(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(toDateString(d));
  };

  // ═══ ACTION HANDLERS ═══

  // --- Pending: Approve ---
  const handleApprove = async (data: { scheduledDate: string }) => {
    if (!approvalTarget) return;
    const job = approvalTarget;

    // Weekend check — fetch scheduling_flexibility from DB
    const approveDate = new Date(data.scheduledDate + 'T12:00:00');
    const dayOfWeek = approveDate.getDay(); // 0=Sun 6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      try {
        const flexRes = await apiFetch(`/api/admin/job-orders/${job.id}`);
        if (flexRes.ok) {
          const flexData = await flexRes.json();
          const flex = flexData.data?.scheduling_flexibility;
          if (flex && !flex.can_work_weekends) {
            addToast('error', 'Weekend Not Allowed', `${job.customer_name} schedule form says no weekend work. Pick a weekday.`);
            return;
          }
        }
      } catch { /* proceed if we can't check */ }
    }

    // ── SERVER-SIDE CAPACITY CHECK ──
    // Double-check capacity right before approving (in case it changed since modal opened)
    if (!job.is_will_call) {
      try {
        const endDate = job.end_date || data.scheduledDate;
        const capUrl = endDate !== data.scheduledDate
          ? `/api/admin/schedule-board/capacity?startDate=${data.scheduledDate}&endDate=${endDate}`
          : `/api/admin/schedule-board/capacity?date=${data.scheduledDate}`;
        const capRes = await apiFetch(capUrl);
        if (capRes.ok) {
          const capJson = await capRes.json();
          if (capJson.summary) {
            // Multi-day
            if (capJson.summary.fullDates.length > 0) {
              addToast('error', 'Schedule Full', `Cannot approve — ${capJson.summary.fullDates.length} date(s) are at full capacity. Use the approval modal to find available dates.`);
              return;
            }
          } else {
            // Single date
            const info = capJson.data?.[data.scheduledDate];
            if (info?.isFull) {
              addToast('error', 'Schedule Full', `${data.scheduledDate} is at full capacity (${info.maxSlots}/${info.maxSlots}). Choose another date.`);
              return;
            }
          }
        }
      } catch { /* proceed if capacity check fails */ }
    }

    try {
      const res = await apiFetch(`/api/admin/job-orders/${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'scheduled',
          scheduled_date: data.scheduledDate,
          is_will_call: job.is_will_call,
        }),
      });
      if (!res.ok) throw new Error('Failed to approve');
    } catch {
      addToast('error', 'Approval Failed', 'Could not update job status');
      return;
    }

    // Create approval notification for submitter
    try {
      await apiFetch('/api/admin/schedule-board/notify', {
        method: 'POST',
        body: JSON.stringify({
          jobId: job.id,
          type: 'approved',
          title: `Approved: ${job.customer_name}`,
          message: `Scheduled for ${new Date(data.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
        }),
      });
    } catch { /* non-blocking */ }

    setPendingJobs(prev => prev.filter(p => p.id !== job.id));

    if (job.is_will_call) {
      addToast('success', `${job.customer_name} → Will Call`, 'Approved and added to Will Call folder');
    } else {
      addToast('success', `${job.customer_name} → Approved`, 'Added to schedule — assign operator closer to start date');
    }

    fetchScheduleData(selectedDate);
    setApprovalTarget(null);
    if (pendingJobs.length <= 1) setShowPendingQueue(false);
  };

  // --- Pending: Missing Info ---
  const handleMissingInfo = async (missingItems: string[], customNote: string) => {
    if (!missingInfoTarget) return;
    try {
      const res = await apiFetch('/api/admin/schedule-board/missing-info', {
        method: 'POST',
        body: JSON.stringify({
          jobId: missingInfoTarget.id,
          missingItems,
          customNote,
        }),
      });
      if (!res.ok) throw new Error('API error');
    } catch {
      addToast('error', 'Failed', 'Could not send missing info request');
      setMissingInfoTarget(null);
      return;
    }
    setPendingJobs(prev => prev.filter(p => p.id !== missingInfoTarget.id));
    const itemList = missingItems.join(', ');
    addToast('info', `${missingInfoTarget.customer_name} — Missing Info`, `Salesman notified: ${itemList}`);
    setMissingInfoTarget(null);
    if (pendingJobs.length <= 1) setShowPendingQueue(false);
  };

  // --- Will Call: Move to Schedule ---
  const handleMoveWillCallToSchedule = async (job: JobCardData) => {
    try {
      await apiFetch(`/api/admin/job-orders/${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_will_call: false, scheduled_date: selectedDate, assigned_to: null, helper_assigned_to: null, status: 'scheduled' }),
      });
    } catch {
      addToast('error', 'Move Failed', 'Could not move job to schedule');
      return;
    }

    setWillCallJobs(prev => prev.filter(wc => wc.id !== job.id));
    const movedJob = { ...job, is_will_call: false, scheduled_date: selectedDate };
    setUnassignedJobs(prev => [...prev, movedJob]);
    addToast('success', `${job.customer_name} → Scheduled`, `Moved to ${formatDisplayDate(selectedDate)} (unassigned)`);
  };

  // ═══ ASSIGNMENT WITH CONFLICT DETECTION ═══

  const findRowForOperator = (operatorName: string): number => {
    const existingRow = rowAssignments.findIndex(r => r.operator === operatorName);
    if (existingRow !== -1) return existingRow;
    for (let i = 0; i < NUM_ROWS; i++) {
      if (!rowAssignments[i].operator && (operatorJobs[i] || []).length === 0) return i;
    }
    for (let i = 0; i < NUM_ROWS; i++) {
      if ((operatorJobs[i] || []).length === 0) return i;
    }
    return -1;
  };

  const proceedWithAssignment = async (rowIndex: number, job: JobCardData, source: 'unassigned' | 'willcall', helperName: string | null) => {
    const operatorName = rowAssignments[rowIndex]?.operator;
    const operatorId = operatorName ? operatorIdMap[operatorName] : null;
    const helperId = helperName ? helperIdMap[helperName] : null;

    try {
      const res = await apiFetch('/api/admin/schedule-board/assign', {
        method: 'POST',
        body: JSON.stringify({ jobOrderId: job.id, operatorId, helperId }),
      });
      if (!res.ok) throw new Error('Failed to assign');
    } catch {
      addToast('error', 'Assignment Failed', 'Could not assign operator');
      return;
    }

    const assignedJob = {
      ...job,
      is_will_call: false,
      helper_names: helperName ? [helperName] : [],
      scheduled_date: job.scheduled_date || selectedDate,
    };

    if (source === 'unassigned') {
      setUnassignedJobs(prev => prev.filter(u => u.id !== job.id));
    } else {
      setWillCallJobs(prev => prev.filter(wc => wc.id !== job.id));
    }

    setOperatorJobs(prev => ({
      ...prev,
      [rowIndex]: [...(prev[rowIndex] || []), assignedJob],
    }));

    const opName = rowAssignments[rowIndex]?.operator || 'Operator';
    addToast('success', `${job.customer_name} → ${opName}`, 'Operator assigned successfully');
  };

  const handleAssignOperator = (operatorName: string, helperName: string | null) => {
    if (!assignTarget) return;
    const { job, source } = assignTarget;

    const targetRow = findRowForOperator(operatorName);
    if (targetRow === -1) {
      addToast('error', 'No Available Rows', 'All crew rows are full — remove a job first');
      setAssignTarget(null);
      return;
    }

    if (rowAssignments[targetRow].operator !== operatorName) {
      setRowAssignments(prev => prev.map((r, i) =>
        i === targetRow ? { operator: operatorName, helper: helperName } : r
      ));
    } else if (helperName && rowAssignments[targetRow].helper !== helperName) {
      setRowAssignments(prev => prev.map((r, i) =>
        i === targetRow ? { ...r, helper: helperName } : r
      ));
    }

    const existingJobs = operatorJobs[targetRow] || [];
    if (existingJobs.length > 0) {
      setConflictData({
        personName: operatorName,
        personRole: 'operator',
        currentJobName: existingJobs[0].customer_name,
        newJob: job,
        newJobSource: source,
        targetRowIndex: targetRow,
        helperName,
      });
      setAssignTarget(null);
      return;
    }

    proceedWithAssignment(targetRow, job, source, helperName);
    setAssignTarget(null);
  };

  const handleConflictAddSecondJob = () => {
    if (!conflictData) return;
    const { targetRowIndex, newJob, newJobSource, helperName } = conflictData;
    proceedWithAssignment(targetRowIndex, newJob, newJobSource, helperName);
    setConflictData(null);
  };

  const handleConflictMoveToJob = async () => {
    if (!conflictData) return;
    const { targetRowIndex, newJob, newJobSource, helperName } = conflictData;

    const existingJobs = operatorJobs[targetRowIndex] || [];
    if (existingJobs.length > 0) {
      for (const j of existingJobs) {
        try {
          await apiFetch('/api/admin/schedule-board/assign', {
            method: 'POST',
            body: JSON.stringify({ jobOrderId: j.id, operatorId: null, helperId: null }),
          });
        } catch { /* continue */ }
      }
      setUnassignedJobs(prev => [...prev, ...existingJobs.map(j => ({ ...j, helper_names: [] }))]);
      setOperatorJobs(prev => ({ ...prev, [targetRowIndex]: [] }));
    }

    proceedWithAssignment(targetRowIndex, newJob, newJobSource, helperName);
    setConflictData(null);
  };

  // --- Edit Job: Save ---
  const handleEditSave = async (updates: Partial<JobCardData> & { newOperatorName?: string | null; newHelperName?: string | null; customer_contact?: string; site_contact_phone?: string; estimated_cost?: number; jobsite_conditions?: string }) => {
    if (!editTarget) return;
    const { job, rowIndex: currentRowIdx } = editTarget;
    const newOpName = updates.newOperatorName;
    const newHelperName = updates.newHelperName;

    const jobUpdates = { ...updates };
    delete (jobUpdates as any).newOperatorName;
    delete (jobUpdates as any).newHelperName;

    const apiPayload: Record<string, unknown> = {};
    if (jobUpdates.arrival_time !== undefined) apiPayload.arrival_time = jobUpdates.arrival_time;
    if (jobUpdates.scheduled_date !== undefined) apiPayload.scheduled_date = jobUpdates.scheduled_date;
    if (jobUpdates.end_date !== undefined) apiPayload.end_date = jobUpdates.end_date;
    if (jobUpdates.description !== undefined) apiPayload.description = jobUpdates.description;
    if (jobUpdates.po_number !== undefined) apiPayload.po_number = jobUpdates.po_number;
    if (jobUpdates.equipment_needed !== undefined) apiPayload.equipment_needed = jobUpdates.equipment_needed;
    if (jobUpdates.customer_name !== undefined) apiPayload.customer_name = jobUpdates.customer_name;
    if (jobUpdates.location !== undefined) apiPayload.location_name = jobUpdates.location;
    if (jobUpdates.address !== undefined) apiPayload.site_address = jobUpdates.address;
    if (updates.customer_contact !== undefined) apiPayload.customer_contact = updates.customer_contact;
    if (updates.site_contact_phone !== undefined) apiPayload.site_contact_phone = updates.site_contact_phone;
    if (updates.estimated_cost !== undefined) apiPayload.estimated_cost = updates.estimated_cost;
    if (updates.jobsite_conditions !== undefined) apiPayload.jobsite_conditions = updates.jobsite_conditions;

    const currentOp = currentRowIdx !== null ? rowAssignments[currentRowIdx]?.operator : null;
    const operatorChanged = newOpName !== undefined && newOpName !== currentOp;

    if (operatorChanged) {
      const newOperatorId = newOpName ? operatorIdMap[newOpName] : null;
      const newHelperId = newHelperName ? helperIdMap[newHelperName] : null;
      apiPayload.assigned_to = newOperatorId;
      apiPayload.helper_assigned_to = newHelperId;
      apiPayload.status = newOperatorId ? 'assigned' : 'scheduled';
    }

    try {
      const res = await apiFetch(`/api/admin/job-orders/${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify(apiPayload),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      addToast('error', 'Save Failed', 'Could not update job');
      return;
    }

    if (operatorChanged) {
      if (currentRowIdx !== null) {
        setOperatorJobs(prev => ({
          ...prev,
          [currentRowIdx]: (prev[currentRowIdx] || []).filter(j => j.id !== job.id),
        }));
      } else {
        setUnassignedJobs(prev => prev.filter(u => u.id !== job.id));
      }

      if (newOpName) {
        const targetRow = findRowForOperator(newOpName);
        if (targetRow !== -1) {
          if (rowAssignments[targetRow].operator !== newOpName) {
            setRowAssignments(prev => prev.map((r, i) =>
              i === targetRow ? { operator: newOpName, helper: newHelperName ?? r.helper } : r
            ));
          }
          const updatedJob = { ...job, ...jobUpdates, helper_names: newHelperName ? [newHelperName] : [] };
          setOperatorJobs(prev => ({
            ...prev,
            [targetRow]: [...(prev[targetRow] || []), updatedJob],
          }));
          addToast('success', 'Job Updated', `${job.customer_name} moved to ${newOpName}`);
        }
      } else {
        const updatedJob = { ...job, ...jobUpdates, helper_names: [] };
        setUnassignedJobs(prev => [...prev, updatedJob]);
        addToast('success', 'Job Updated', `${job.customer_name} moved to unassigned`);
      }
    } else {
      const updatedJob = {
        ...job,
        ...jobUpdates,
        helper_names: newHelperName !== undefined ? (newHelperName ? [newHelperName] : []) : job.helper_names,
      };

      if (newHelperName !== undefined && currentRowIdx !== null) {
        setRowAssignments(prev => prev.map((r, i) =>
          i === currentRowIdx ? { ...r, helper: newHelperName } : r
        ));
      }

      if (currentRowIdx !== null) {
        setOperatorJobs(prev => ({
          ...prev,
          [currentRowIdx]: (prev[currentRowIdx] || []).map(j => j.id === job.id ? updatedJob : j),
        }));
      } else {
        setUnassignedJobs(prev => prev.map(j => j.id === job.id ? updatedJob : j));
      }
      addToast('success', 'Job Updated', `${job.customer_name} changes saved`);
    }

    setEditTarget(null);
  };

  // --- Change Request (success callback — modal handles the API call) ---
  const handleChangeRequestSuccess = () => {
    if (!changeRequestTarget) return;

    const jobId = changeRequestTarget.id;
    const updateJobInPlace = (jobs: JobCardData[]) =>
      jobs.map(j => j.id === jobId ? { ...j, change_requests_count: j.change_requests_count + 1 } : j);

    for (let idx = 0; idx < NUM_ROWS; idx++) {
      if (operatorJobs[idx]?.some(j => j.id === jobId)) {
        setOperatorJobs(prev => ({ ...prev, [idx]: updateJobInPlace(prev[idx]) }));
        break;
      }
    }

    addToast('success', 'Change Request Submitted', `${changeRequestTarget.customer_name} — Supervisor will review`);
    setChangeRequestTarget(null);
  };

  // --- Notes (from API) ---
  const handleViewNotes = async (job: JobCardData) => {
    if (!jobNotes[job.id]) {
      try {
        const res = await apiFetch(`/api/admin/job-notes?jobOrderId=${job.id}`);
        if (res.ok) {
          const json = await res.json();
          const notes = (json.data || []).map((n: any) => ({
            id: n.id,
            author: n.author_name,
            text: n.content,
            timestamp: n.created_at,
          }));
          setJobNotes(prev => ({ ...prev, [job.id]: notes }));
        }
      } catch {
        setJobNotes(prev => ({ ...prev, [job.id]: [] }));
      }
    }
    setNotesTarget(job);
  };

  const handleAddNote = async (text: string) => {
    if (!notesTarget) return;

    try {
      const res = await apiFetch('/api/admin/job-notes', {
        method: 'POST',
        body: JSON.stringify({ jobOrderId: notesTarget.id, content: text }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      const note = json.data;
      const newNote: NoteData = {
        id: note?.id || `note-${Date.now()}`,
        author: note?.author_name || 'You',
        text: note?.content || text,
        timestamp: note?.created_at || new Date().toISOString(),
      };
      setJobNotes(prev => ({
        ...prev,
        [notesTarget.id]: [...(prev[notesTarget.id] || []), newNote],
      }));
    } catch {
      const newNote: NoteData = { id: `note-${Date.now()}`, author: 'You', text, timestamp: new Date().toISOString() };
      setJobNotes(prev => ({
        ...prev,
        [notesTarget.id]: [...(prev[notesTarget.id] || []), newNote],
      }));
    }

    const updateCount = (jobs: JobCardData[]) =>
      jobs.map(j => j.id === notesTarget.id ? { ...j, notes_count: j.notes_count + 1 } : j);
    for (let idx = 0; idx < NUM_ROWS; idx++) {
      if (operatorJobs[idx]?.some(j => j.id === notesTarget.id)) {
        setOperatorJobs(prev => ({ ...prev, [idx]: updateCount(prev[idx]) }));
        break;
      }
    }
    setUnassignedJobs(prev => updateCount(prev));
    addToast('success', 'Note Added', `Added to ${notesTarget.customer_name}`);
  };

  // --- Daily notes ---
  const handleAddDailyNote = async (text: string) => {
    try {
      const res = await apiFetch('/api/admin/daily-notes', {
        method: 'POST',
        body: JSON.stringify({ date: selectedDate, content: text }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      const note = json.data;
      setDailyNotes(prev => [...prev, note]);
      addToast('success', 'Daily Note Added', 'Note saved');
    } catch {
      addToast('error', 'Note Failed', 'Could not save note');
    }
  };

  const handleDeleteDailyNote = async (id: string) => {
    try {
      const res = await apiFetch(`/api/admin/daily-notes?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      setDailyNotes(prev => prev.filter(n => n.id !== id));
    } catch {
      addToast('error', 'Delete Failed', 'Could not delete note');
    }
  };

  // --- Remove from schedule ---
  const handleRemoveFromSchedule = async () => {
    if (!editTarget) return;
    const { job, rowIndex } = editTarget;
    try {
      await apiFetch(`/api/admin/job-orders/${job.id}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }),
      });
    } catch { /* optimistic */ }
    if (rowIndex !== null) {
      setOperatorJobs(prev => ({ ...prev, [rowIndex]: (prev[rowIndex] || []).filter(j => j.id !== job.id) }));
    } else {
      setUnassignedJobs(prev => prev.filter(u => u.id !== job.id));
    }
    addToast('info', `${job.customer_name} — Removed`, 'Job removed from schedule');
    setEditTarget(null);
  };

  // --- Make will call ---
  const handleMakeWillCall = async () => {
    if (!editTarget) return;
    const { job, rowIndex } = editTarget;
    try {
      await apiFetch(`/api/admin/job-orders/${job.id}`, {
        method: 'PATCH', body: JSON.stringify({ is_will_call: true, assigned_to: null, helper_assigned_to: null, status: 'scheduled' }),
      });
    } catch { /* optimistic */ }
    if (rowIndex !== null) {
      setOperatorJobs(prev => ({ ...prev, [rowIndex]: (prev[rowIndex] || []).filter(j => j.id !== job.id) }));
    } else {
      setUnassignedJobs(prev => prev.filter(u => u.id !== job.id));
    }
    setWillCallJobs(prev => [...prev, { ...job, is_will_call: true }]);
    addToast('success', `${job.customer_name} → Will Call`, 'Moved to Will Call folder');
    setEditTarget(null);
  };

  // --- Assign job to available operator ---
  const handleAssignToAvailableOperator = (_rowIndex: number) => {
    if (unassignedJobs.length > 0) {
      setAssignTarget({ job: unassignedJobs[0], source: 'unassigned' });
    } else if (willCallJobs.length > 0) {
      setAssignTarget({ job: willCallJobs[0], source: 'willcall' });
    } else {
      addToast('info', 'No Jobs Available', 'No unassigned or will-call jobs to assign');
    }
  };

  // --- Row dropdown: change operator (with conflict detection) ---
  const handleChangeRowOperator = (rowIndex: number, newOperator: string | null) => {
    if (!newOperator) {
      // Clearing operator — no conflict possible
      setRowAssignments(prev => prev.map((r, i) => i === rowIndex ? { ...r, operator: newOperator } : r));
      return;
    }

    // Check if this operator is already in another row that has jobs
    for (let i = 0; i < NUM_ROWS; i++) {
      if (i === rowIndex) continue;
      if (rowAssignments[i]?.operator === newOperator && (operatorJobs[i] || []).length > 0) {
        // Operator already has jobs in row i — show conflict
        const jobNames = (operatorJobs[i] || []).map(j => j.customer_name);
        setRowChangeConflict({
          operatorName: newOperator,
          sourceRowIndex: i,
          targetRowIndex: rowIndex,
          currentJobNames: jobNames,
        });
        return;
      }
    }

    // No conflict — assign freely
    setRowAssignments(prev => prev.map((r, i) => i === rowIndex ? { ...r, operator: newOperator } : r));
  };

  // --- Row change conflict: Move operator (clear from old row) ---
  const handleRowConflictMove = async () => {
    if (!rowChangeConflict) return;
    const { operatorName, sourceRowIndex, targetRowIndex } = rowChangeConflict;

    // Unassign all jobs from the source row (put them back to unassigned)
    const existingJobs = operatorJobs[sourceRowIndex] || [];
    for (const j of existingJobs) {
      try {
        await apiFetch('/api/admin/schedule-board/assign', {
          method: 'POST',
          body: JSON.stringify({ jobOrderId: j.id, operatorId: null, helperId: null }),
        });
      } catch { /* continue */ }
    }
    setUnassignedJobs(prev => [...prev, ...existingJobs.map(j => ({ ...j, helper_names: [] }))]);
    setOperatorJobs(prev => ({ ...prev, [sourceRowIndex]: [] }));

    // Clear operator from source row
    setRowAssignments(prev => prev.map((r, i) =>
      i === sourceRowIndex ? { operator: null, helper: null } :
      i === targetRowIndex ? { ...r, operator: operatorName } : r
    ));

    addToast('success', `${operatorName} Moved`, `Moved to row ${targetRowIndex + 1} — previous jobs unassigned`);
    setRowChangeConflict(null);
  };

  // --- Row change conflict: Add to second row (keep in both) ---
  const handleRowConflictAddSecond = () => {
    if (!rowChangeConflict) return;
    const { operatorName, targetRowIndex } = rowChangeConflict;

    setRowAssignments(prev => prev.map((r, i) =>
      i === targetRowIndex ? { ...r, operator: operatorName } : r
    ));

    addToast('success', `${operatorName} — 2nd Row`, `Added to row ${targetRowIndex + 1} while keeping current jobs`);
    setRowChangeConflict(null);
  };

  // --- Row dropdown: change helper ---
  const handleChangeRowHelper = (rowIndex: number, newHelper: string | null) => {
    setRowAssignments(prev => prev.map((r, i) => i === rowIndex ? { ...r, helper: newHelper } : r));
  };

  // --- Quick Add ---
  const handleQuickAdd = async (data: QuickAddData) => {
    try {
      const res = await apiFetch('/api/admin/schedule-board/quick-add', {
        method: 'POST',
        body: JSON.stringify({
          contractorName: data.contractorName,
          start_date: data.start_date,
          end_date: data.end_date,
          scope: data.scope,
          salesmanName: data.salesmanName,
          salesmanId: data.salesmanId,
          jobTypes: data.jobTypes,
          address: data.address,
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          priority: data.priority,
          estimatedCost: data.estimatedCost,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create quick-add job');
      }
      addToast('success', `Quick Add: ${data.contractorName}`, `${data.jobTypes.join(', ')} job created — ${data.salesmanName} notified to complete Schedule Form`);
      fetchScheduleData(selectedDate);
    } catch (err: any) {
      addToast('error', 'Quick Add Failed', err.message || 'Could not create job');
    }
    setShowQuickAdd(false);
  };

  // Salesmen list — used for Quick Add
  const SALESMEN = ['Andres A', 'Adam I', 'Jey Y', 'Doug R', 'David S'];

  // ═══ LOADING STATE ═══
  if (loading && Object.keys(operatorJobs).length === 0 && unassignedJobs.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* ═══ STICKY HEADER ════════════════════════════════════════════════ */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-30 shadow-lg">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/admin" className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all hover:scale-105">
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </Link>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-600" />
                  {canEdit ? 'Operations Schedule Board' : 'Schedule Board'}
                </h1>
                <p className="text-gray-500 text-xs">
                  {canEdit ? 'Manage assignments, approvals & dispatch' : 'View scheduled jobs • Request changes'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              {/* Notification bell for all users */}
              <NotificationBell />

              {canEdit && (
                <button onClick={() => setShowPendingQueue(true)} className="relative px-3 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl text-orange-700 text-sm font-semibold transition-all flex items-center gap-2">
                  <Bell className="w-4 h-4" /> Pending
                  {pendingJobs.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{pendingJobs.length}</span>
                  )}
                </button>
              )}

              <button onClick={() => setShowWillCall(!showWillCall)} className={`px-3 py-2 border rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${showWillCall ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700'}`}>
                <FolderOpen className="w-4 h-4" /> Will Call
                <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded-full text-xs font-bold">{willCallJobs.length}</span>
              </button>

              <button className="relative px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-blue-700 text-sm font-semibold transition-all flex items-center gap-2">
                <FileText className="w-4 h-4" /> Changes
                {changeRequestCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{changeRequestCount}</span>
                )}
              </button>

              {canEdit && (
                <>
                  <button
                    onClick={handleAutoSchedule}
                    disabled={autoScheduleLoading || unassignedJobs.length === 0}
                    className={`relative px-3 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md ${
                      unassignedJobs.length > 0
                        ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {autoScheduleLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {autoScheduleLoading ? 'Scheduling...' : 'AI Schedule'}
                    {unassignedJobs.length > 0 && !autoScheduleLoading && (
                      <span className="px-1.5 py-0.5 bg-white/20 rounded-full text-xs">{unassignedJobs.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setShowQuickAdd(true)}
                    className="px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md"
                  >
                    <Plus className="w-4 h-4" /> Quick Add
                  </button>
                  <button
                    onClick={() => {
                      fetchDispatchStatus(selectedDate);
                      setShowDispatchModal(true);
                    }}
                    className="relative px-3 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md"
                  >
                    <Megaphone className="w-4 h-4" /> Push Tickets
                    {dispatchInfo && dispatchInfo.undispatched > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full flex items-center justify-center">{dispatchInfo.undispatched}</span>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ DATE NAVIGATION + STATS ═════════════════════════════════════ */}
      <div className="container mx-auto px-4 md:px-6 py-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4 md:p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <ScheduleDatePicker value={selectedDate} onChange={setSelectedDate} />

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => setViewMode('day')}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                    viewMode === 'day'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" /> Day
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                    viewMode === 'week'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <CalendarDays className="w-4 h-4" /> Week
                </button>
              </div>
              <ViewToggle viewMode={boardViewMode} onChange={handleBoardViewModeChange} />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-xl border border-purple-200">
                <UserCheck className="w-4 h-4 text-purple-600" />
                <div>
                  <div className="text-[10px] font-bold text-purple-500 uppercase">Active</div>
                  <div className="text-lg font-bold text-gray-900">{activeOperators}</div>
                </div>
              </div>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                totalJobs >= capacityMaxSlots
                  ? 'bg-red-50 border-red-200'
                  : totalJobs >= capacityWarningThreshold
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-green-50 border-green-200'
              }`}>
                <Package className={`w-4 h-4 ${
                  totalJobs >= capacityMaxSlots ? 'text-red-600' : totalJobs >= capacityWarningThreshold ? 'text-amber-600' : 'text-green-600'
                }`} />
                <div>
                  <div className={`text-[10px] font-bold uppercase ${
                    totalJobs >= capacityMaxSlots ? 'text-red-500' : totalJobs >= capacityWarningThreshold ? 'text-amber-500' : 'text-green-500'
                  }`}>
                    {totalJobs >= capacityMaxSlots ? 'Full' : totalJobs >= capacityWarningThreshold ? 'Near Cap' : 'Capacity'}
                  </div>
                  <div className="text-lg font-bold text-gray-900">{totalJobs}/{capacityMaxSlots}</div>
                </div>
              </div>

              {/* See Next Available — for admin/salesman (non-super_admin) */}
              {!canEdit && (
                <button
                  onClick={handleFindNextAvailable}
                  disabled={findingNextAvailable}
                  className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl text-purple-700 text-sm font-semibold transition-all"
                >
                  {findingNextAvailable ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Next Available
                </button>
              )}

              {/* Capacity Settings — super_admin only */}
              {canEdit && (
                <button
                  onClick={() => setShowCapacitySettings(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-gray-600 text-sm font-semibold transition-all"
                  title="Capacity Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ WILL CALL FOLDER ══════════════════════════════════════════════ */}
      {showWillCall && (
        <div className="container mx-auto px-4 md:px-6 pb-4">
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl border-2 border-amber-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-gray-900">Will Call Folder</h3>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-xs font-bold">{willCallJobs.length} jobs</span>
              </div>
              <p className="text-xs text-amber-600">Jobs waiting for an open slot — schedule when availability opens up</p>
            </div>
            {willCallJobs.length === 0 ? (
              <div className="text-center py-8 text-amber-500">
                <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="font-semibold">No will-call jobs</p>
                <p className="text-xs">Salesmen can mark jobs as will-call when submitting the schedule form</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {willCallJobs.map((job) => {
                  const daysWaiting = job.scheduled_date ? daysAgo(job.scheduled_date) : 0;
                  return (
                    <div key={job.id} className="bg-white rounded-xl border-2 border-amber-300 p-3 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-1">
                        <h4 className="font-bold text-gray-900 text-sm">{job.customer_name}</h4>
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold whitespace-nowrap">WILL CALL</span>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 mb-1">{job.job_type}</span>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mb-1"><MapPin className="w-3 h-3" /> {job.location}</p>

                      <div className="flex items-center justify-between mt-2 mb-2">
                        <span className="text-xs text-gray-400">
                          Tentative: {job.scheduled_date ? parseLocalDate(job.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                        </span>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          daysWaiting >= 7 ? 'bg-red-100 text-red-700' : daysWaiting >= 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <Timer className="w-3 h-3" />
                          {daysWaiting === 0 ? 'Today' : `${daysWaiting}d waiting`}
                        </span>
                      </div>

                      {canEdit && (
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => handleMoveWillCallToSchedule(job)}
                            className="flex-1 py-1.5 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors"
                          >
                            Schedule Now
                          </button>
                          <button
                            onClick={() => setAssignTarget({ job, source: 'willcall' })}
                            className="py-1.5 px-2.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
                          >
                            <Users className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ CREW GRID VIEW ═══════════════════════════════════════════════ */}
      {boardViewMode === 'crew-grid' && (
        <div className="container mx-auto px-4 md:px-6 pb-6">
          <CrewScheduleGrid
            onDateClick={(date) => {
              setSelectedDate(date);
              setBoardViewMode('slots');
            }}
          />
        </div>
      )}

      {/* ═══ WEEKLY VIEW ═══════════════════════════════════════════════════ */}
      {viewMode === 'week' && boardViewMode !== 'crew-grid' && (
        <div className="container mx-auto px-4 md:px-6 pb-6">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-x-auto">
            <div className="grid grid-cols-1 md:grid-cols-7 divide-x divide-gray-200 min-w-0 md:min-w-[1000px]">
              {Object.entries(weekData).sort(([a], [b]) => a.localeCompare(b)).map(([date, jobs]) => {
                const d = parseLocalDate(date);
                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                const dayNum = d.getDate();
                const monthName = d.toLocaleDateString('en-US', { month: 'short' });
                const isToday = toDateString(new Date()) === date;
                const isSelected = selectedDate === date;
                return (
                  <div key={date} className="min-w-0">
                    {/* Day header */}
                    <button
                      onClick={() => { setSelectedDate(date); setViewMode('day'); }}
                      className={`w-full px-3 py-2.5 text-center border-b-2 transition-all ${
                        isToday ? 'bg-purple-50 border-purple-500' :
                        isSelected ? 'bg-blue-50 border-blue-400' :
                        'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <p className={`text-xs font-bold uppercase ${isToday ? 'text-purple-600' : 'text-gray-500'}`}>{dayName}</p>
                      <p className={`text-lg font-bold ${isToday ? 'text-purple-700' : 'text-gray-900'}`}>{monthName} {dayNum}</p>
                      <p className={`text-[10px] font-semibold ${
                        jobs.length === 0 ? 'text-green-500' :
                        jobs.length >= capacityMaxSlots ? 'text-red-500' :
                        'text-gray-400'
                      }`}>
                        {jobs.length} job{jobs.length !== 1 ? 's' : ''}
                      </p>
                    </button>
                    {/* Jobs list */}
                    <div className="p-2 space-y-1.5 max-h-[60vh] overflow-y-auto">
                      {jobs.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-6 italic">No jobs</p>
                      ) : (
                        jobs.map(job => (
                          <div
                            key={job.id}
                            draggable={canEdit}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/job-card', JSON.stringify({ jobId: job.id, sourceRowIndex: -1 }));
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onClick={() => { setSelectedDate(date); setViewMode('day'); }}
                            className="p-2 rounded-lg border border-gray-200 bg-white hover:shadow-md transition-all cursor-pointer group"
                          >
                            <p className="text-xs font-bold text-gray-900 truncate">{job.customer_name}</p>
                            <p className="text-[10px] text-purple-600 font-semibold truncate">{job.job_type?.split(',')[0]?.trim()}</p>
                            {job.arrival_time && (
                              <p className="text-[10px] text-gray-400 mt-0.5">⏰ {job.arrival_time}</p>
                            )}
                            <div className="flex flex-wrap gap-0.5 mt-1">
                              {job.equipment_needed.slice(0, 3).map(eq => (
                                <span key={eq} className="px-1 py-0.5 bg-indigo-50 rounded text-[8px] text-indigo-600 font-medium">{eq}</span>
                              ))}
                              {job.equipment_needed.length > 3 && (
                                <span className="text-[8px] text-gray-400">+{job.equipment_needed.length - 3}</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ READ-ONLY BANNER (view-only admins) ════════════════════════ */}
      {!canEdit && (
        <div className="container mx-auto px-4 md:px-6 pb-2">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-sm text-amber-300 flex items-center gap-2">
            <span>👁️</span>
            <span>You have view-only access. Click any job to request a change.</span>
          </div>
        </div>
      )}

      {/* ═══ DAY VIEW — OPERATOR ROWS ════════════════════════════════════ */}
      {viewMode === 'day' && boardViewMode !== 'crew-grid' && <DndBoardWrapper canDrag={canEdit} onReorder={handleDndReorder}>
      <div className="container mx-auto px-4 md:px-6 pb-6 space-y-4">
        {boardViewMode === 'slots' ? (
          <>
            {Array.from({ length: NUM_ROWS }).map((_, idx) => (
              <OperatorRow
                key={idx}
                rowIndex={idx}
                operatorName={rowAssignments[idx]?.operator ?? null}
                helperName={rowAssignments[idx]?.helper ?? null}
                jobs={operatorJobs[idx] || []}
                colorScheme={OPERATOR_COLORS[idx % OPERATOR_COLORS.length]}
                canEdit={canEdit}
                isAvailable={(operatorJobs[idx] || []).length === 0}
                allOperators={allOperatorsList}
                allHelpers={allHelpersList}
                busyOperators={busyOperators}
                busyHelpers={busyHelpers}
                onEditJob={(job) => canEdit ? setJobDetailTarget({ job, rowIndex: idx, operatorName: rowAssignments[idx]?.operator, helperName: rowAssignments[idx]?.helper }) : setChangeRequestTarget(job)}
                onRequestChange={(job) => setChangeRequestTarget(job)}
                onViewNotes={(job) => handleViewNotes(job)}
                onPreviewJob={(job) => setPreviewJob({ job, operatorName: rowAssignments[idx]?.operator, helperName: rowAssignments[idx]?.helper })}
                onAssignJob={() => handleAssignToAvailableOperator(idx)}
                onChangeOperator={(name) => handleChangeRowOperator(idx, name)}
                onChangeHelper={(name) => handleChangeRowHelper(idx, name)}
                onDropJob={handleDropJob}
              />
            ))}
          </>
        ) : (
          <OperatorRowView
            operatorJobs={operatorJobs}
            unassignedJobs={unassignedJobs}
            rowAssignments={rowAssignments}
            operatorIdMap={operatorIdMap}
            operatorSkillMap={operatorSkillMap}
            allOperatorsList={allOperatorsList}
            timeOffMap={timeOffMap}
            canDrag={canEdit}
            canEdit={canEdit}
            onEditJob={(job, rowIndex) => canEdit ? setEditTarget({ job, rowIndex }) : setChangeRequestTarget(job)}
            onRequestChange={(job) => setChangeRequestTarget(job)}
            onViewNotes={(job) => handleViewNotes(job)}
            onPreviewJob={(job) => setPreviewJob({ job })}
          />
        )}

        {/* ═══ SHOP / NOTES ROW ══════════════════════════════════════ */}
        {shopNotesEnabled && (
          <div className="bg-white rounded-2xl shadow-lg border-2 border-dashed border-blue-300 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-600 px-5 py-2.5">
              <div className="flex items-center gap-2 text-white">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                <h3 className="font-bold text-sm">{shopNotesLabel}</h3>
              </div>
            </div>
            <div className="p-4">
              <textarea
                value={shopNotesText}
                onChange={(e) => setShopNotesText(e.target.value)}
                placeholder="Who's working in the shop today, notes for the crew, special instructions..."
                className="w-full h-20 px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder:text-gray-400"
              />
            </div>
          </div>
        )}

        {/* ═══ UNASSIGNED SECTION ═══════════════════════════════════════ */}
        {boardViewMode === 'slots' && unassignedJobs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg border-2 border-dashed border-orange-300 overflow-hidden">
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <AlertCircle className="w-5 h-5" />
                  <h3 className="font-bold">Unassigned Jobs for This Date</h3>
                  <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold">{unassignedJobs.length}</span>
                </div>
                <p className="text-orange-100 text-xs hidden sm:block">Approved but no operator assigned yet</p>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {unassignedJobs.map((job) => (
                  <div
                    key={job.id}
                    draggable={canEdit}
                    onDragStart={(e) => {
                      if (!canEdit) return;
                      e.dataTransfer.setData('application/job-card', JSON.stringify({ jobId: job.id, sourceRowIndex: -1 }));
                      e.dataTransfer.effectAllowed = 'move';
                      (e.currentTarget as HTMLElement).style.opacity = '0.5';
                    }}
                    onDragEnd={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                    onClick={() => setJobDetailTarget({ job, rowIndex: null, operatorName: null, helperName: null })}
                    className={`rounded-xl border-2 border-orange-200 bg-orange-50/50 p-4 hover:shadow-md transition-all cursor-pointer ${canEdit ? 'active:cursor-grabbing' : ''}`}
                  >
                    <h4 className="font-bold text-gray-900 text-sm mb-1">{job.customer_name}</h4>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 mb-2">{job.job_type?.split(',')[0]?.trim()}</span>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mb-2"><MapPin className="w-3 h-3 text-gray-400" /> {job.location}</p>
                    {job.equipment_needed.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {job.equipment_needed.map(eq => (
                          <span key={eq} className="px-2 py-0.5 bg-indigo-50 rounded text-xs text-indigo-600 font-medium">{eq}</span>
                        ))}
                      </div>
                    )}
                    {canEdit && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setAssignTarget({ job, source: 'unassigned' }); }}
                        className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow-md"
                      >
                        <Users className="w-3.5 h-3.5 inline mr-1.5" /> Assign Operator
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ DAILY NOTES ═══════════════════════════════════════════════ */}
        <DailyNotesSection
          date={selectedDate}
          notes={dailyNotes}
          canEdit={canEdit}
          onAddNote={handleAddDailyNote}
          onDeleteNote={handleDeleteDailyNote}
        />
      </div>
      </DndBoardWrapper>}

      {/* ═══ PENDING QUEUE SIDEBAR ══════════════════════════════════════ */}
      <PendingQueueSidebar
        open={showPendingQueue}
        onClose={() => setShowPendingQueue(false)}
        pendingJobs={pendingJobs}
        onApprove={(job) => { setShowPendingQueue(false); setApprovalTarget(job); }}
        onMissingInfo={(job) => { setShowPendingQueue(false); setMissingInfoTarget(job); }}
      />

      {/* ═══ MODALS ════════════════════════════════════════════════════ */}
      {approvalTarget && <ApprovalModal job={approvalTarget} onConfirm={handleApprove} onClose={() => setApprovalTarget(null)} />}
      {missingInfoTarget && <MissingInfoModal job={missingInfoTarget} onConfirm={handleMissingInfo} onClose={() => setMissingInfoTarget(null)} />}
      {assignTarget && (
        <AssignOperatorModal
          job={assignTarget.job}
          allOperators={allOperatorsList}
          allHelpers={allHelpersList}
          busyOperators={busyOperators}
          busyHelpers={busyHelpers}
          onConfirm={handleAssignOperator}
          onClose={() => setAssignTarget(null)}
        />
      )}
      {editTarget && (
        <EditJobPanel
          job={editTarget.job}
          canEdit={canEdit}
          allOperators={allOperatorsList}
          allHelpers={allHelpersList}
          currentOperatorName={editTarget.rowIndex !== null ? rowAssignments[editTarget.rowIndex]?.operator ?? null : null}
          currentHelperName={editTarget.rowIndex !== null ? rowAssignments[editTarget.rowIndex]?.helper ?? null : null}
          busyOperators={busyOperators}
          busyHelpers={busyHelpers}
          operatorSkillMap={operatorSkillMap}
          onSave={handleEditSave}
          onClose={() => setEditTarget(null)}
          onViewNotes={() => { setEditTarget(null); handleViewNotes(editTarget.job); }}
          onMakeWillCall={handleMakeWillCall}
          onRemoveFromSchedule={handleRemoveFromSchedule}
        />
      )}
      {changeRequestTarget && <ChangeRequestModal job={changeRequestTarget} onSuccess={handleChangeRequestSuccess} onClose={() => setChangeRequestTarget(null)} />}
      {notesTarget && <NotesDrawer job={notesTarget} notes={jobNotes[notesTarget.id] || []} onAddNote={handleAddNote} onClose={() => setNotesTarget(null)} />}
      {showQuickAdd && <QuickAddModal salesmen={SALESMEN} onSubmit={handleQuickAdd} onClose={() => setShowQuickAdd(false)} />}

      {/* ═══ AI AUTO-SCHEDULE RESULTS MODAL ═══ */}
      {autoScheduleResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setAutoScheduleResults(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">AI Auto-Schedule Results</h2>
                  <p className="text-violet-200 text-sm">{autoScheduleResults.message}</p>
                </div>
              </div>
              <button onClick={() => setAutoScheduleResults(null)} className="p-2 hover:bg-white/20 rounded-lg transition-all">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Stats */}
            <div className="px-6 py-4 grid grid-cols-3 gap-3 border-b border-gray-100">
              <div className="text-center p-3 bg-green-50 rounded-xl">
                <div className="text-2xl font-bold text-green-600">{autoScheduleResults.totalAssigned}</div>
                <div className="text-xs font-semibold text-green-500 uppercase">Assigned</div>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-xl">
                <div className="text-2xl font-bold text-amber-600">{autoScheduleResults.totalSkipped}</div>
                <div className="text-xs font-semibold text-amber-500 uppercase">Skipped</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-xl">
                <div className="text-2xl font-bold text-purple-600">{autoScheduleResults.totalUnassigned}</div>
                <div className="text-xs font-semibold text-purple-500 uppercase">Total Jobs</div>
              </div>
            </div>

            {/* Assignments list */}
            <div className="px-6 py-4 overflow-y-auto max-h-[45vh] space-y-2">
              {autoScheduleResults.assignments.length > 0 && (
                <>
                  <h3 className="text-sm font-bold text-gray-500 uppercase flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-green-500" /> Assignments
                  </h3>
                  {autoScheduleResults.assignments.map((a, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-sm truncate">{a.customerName}</div>
                        <div className="text-xs text-gray-500">{a.jobNumber}</div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className="text-sm font-medium text-gray-700">→ {a.operatorName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          a.matchQuality === 'good' ? 'bg-green-100 text-green-700' :
                          a.matchQuality === 'stretch' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {a.matchQuality === 'good' ? '✓ Good' : a.matchQuality === 'stretch' ? '~ Stretch' : '✗ Over'}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {autoScheduleResults.skipped.length > 0 && (
                <>
                  <h3 className="text-sm font-bold text-gray-500 uppercase flex items-center gap-2 mt-4 mb-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" /> Skipped
                  </h3>
                  {autoScheduleResults.skipped.map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-sm truncate">{s.customerName}</div>
                        <div className="text-xs text-gray-500">{s.jobNumber}</div>
                      </div>
                      <span className="text-xs text-amber-600 font-medium ml-3">{s.reason}</span>
                    </div>
                  ))}
                </>
              )}

              {autoScheduleResults.assignments.length === 0 && autoScheduleResults.skipped.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Sparkles className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p>No unassigned jobs to schedule</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setAutoScheduleResults(null)}
                className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {conflictData && (
        <ConflictModal
          personName={conflictData.personName}
          personRole={conflictData.personRole}
          currentJobName={conflictData.currentJobName}
          newJobName={conflictData.newJob.customer_name}
          onAddSecondJob={handleConflictAddSecondJob}
          onMoveToJob={handleConflictMoveToJob}
          onClose={() => setConflictData(null)}
        />
      )}
      {rowChangeConflict && (
        <ConflictModal
          personName={rowChangeConflict.operatorName}
          personRole="operator"
          currentJobName={rowChangeConflict.currentJobNames.join(', ')}
          newJobName={`Row ${rowChangeConflict.targetRowIndex + 1}`}
          onAddSecondJob={handleRowConflictAddSecond}
          onMoveToJob={handleRowConflictMove}
          onClose={() => setRowChangeConflict(null)}
        />
      )}

      {/* ═══ JOB PREVIEW PANEL ════════════════════════════════════════ */}
      {previewJob && (
        <JobPreviewPanel
          job={previewJob.job}
          operatorName={previewJob.operatorName}
          helperName={previewJob.helperName}
          onClose={() => setPreviewJob(null)}
        />
      )}

      {/* ═══ JOB DETAIL VIEW (full-page overlay) ═══════════════════════ */}
      {jobDetailTarget && (
        <JobDetailView
          job={jobDetailTarget.job}
          operatorName={jobDetailTarget.operatorName}
          helperName={jobDetailTarget.helperName}
          rowIndex={jobDetailTarget.rowIndex}
          onClose={() => setJobDetailTarget(null)}
          onEdit={() => {
            const target = jobDetailTarget;
            setJobDetailTarget(null);
            setEditTarget({ job: target.job, rowIndex: target.rowIndex });
          }}
        />
      )}

      {/* ═══ NEXT AVAILABLE DATE BANNER ════════════════════════════════ */}
      {nextAvailableDate && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white rounded-2xl shadow-2xl border-2 border-purple-200 p-4 flex items-center gap-4 max-w-md">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
              <CalendarDays className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">Next Available Date</p>
              <p className="text-xs text-gray-600">
                {new Date(nextAvailableDate.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                <span className="text-purple-600 font-semibold"> — {nextAvailableDate.availableSlots} slots open</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setSelectedDate(nextAvailableDate.date); setNextAvailableDate(null); }}
                className="px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl text-xs font-bold transition-all hover:shadow-md"
              >
                Go
              </button>
              <button
                onClick={() => setNextAvailableDate(null)}
                className="px-2 py-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DISPATCH CONFIRMATION MODAL ═══════════════════════════════ */}
      {showDispatchModal && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={() => !dispatchLoading && setShowDispatchModal(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
              <div className="bg-gradient-to-r from-orange-500 to-red-500 p-5 rounded-t-2xl text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <Megaphone className="w-5 h-5" />
                      Push Job Tickets
                    </h2>
                    <p className="text-orange-100 text-sm">Dispatch tickets for {formatDisplayDate(selectedDate)}</p>
                  </div>
                  <button onClick={() => !dispatchLoading && setShowDispatchModal(false)} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {dispatchInfo ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-3 bg-gray-50 rounded-xl">
                        <div className="text-2xl font-bold text-gray-900">{dispatchInfo.total}</div>
                        <div className="text-xs text-gray-500 font-medium">Total Jobs</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-xl border border-green-200">
                        <div className="text-2xl font-bold text-green-700">{dispatchInfo.dispatched}</div>
                        <div className="text-xs text-green-600 font-medium">Dispatched</div>
                      </div>
                      <div className="text-center p-3 bg-orange-50 rounded-xl border border-orange-200">
                        <div className="text-2xl font-bold text-orange-700">{dispatchInfo.undispatched}</div>
                        <div className="text-xs text-orange-600 font-medium">Ready to Push</div>
                      </div>
                    </div>

                    {dispatchInfo.undispatched === 0 ? (
                      <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                        <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-green-800">All jobs dispatched!</p>
                          <p className="text-xs text-green-600">All assigned jobs for this date have been pushed to operators.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                        <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-orange-800">{dispatchInfo.undispatched} job(s) ready to dispatch</p>
                          <p className="text-xs text-orange-600">This will notify all assigned operators and helpers.</p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowDispatchModal(false)}
                    disabled={dispatchLoading}
                    className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDispatchJobs(selectedDate)}
                    disabled={dispatchLoading || !dispatchInfo || dispatchInfo.undispatched === 0}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {dispatchLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Dispatching...</>
                    ) : (
                      <><Megaphone className="w-4 h-4" /> Push {dispatchInfo?.undispatched || 0} Tickets</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ CAPACITY SETTINGS MODAL (Super Admin only) ═════════════════ */}
      {showCapacitySettings && (
        <CapacitySettingsModal
          currentMax={capacityMaxSlots}
          currentWarning={capacityWarningThreshold}
          onSave={handleSaveCapacitySettings}
          onClose={() => setShowCapacitySettings(false)}
        />
      )}

      {/* ═══ TOASTS ═══════════════════════════════════════════════════ */}
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* ═══ ROLE INDICATOR ═════════════════════════════════════════════ */}
      <div className="fixed bottom-4 left-4 z-50">
        <div className={`px-4 py-2 rounded-xl text-sm font-bold shadow-lg ${canEdit ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white' : 'bg-gray-200 text-gray-700'}`}>
          <Eye className="w-4 h-4 inline mr-1.5" />
          {canEdit ? 'Super Admin — Full Edit' : userRole === 'salesman' ? 'Salesman — View & Request' : 'Admin — View & Request'}
        </div>
      </div>
    </div>
  );
}

// ─── Capacity Settings Modal ──────────────────────────────────────────
function CapacitySettingsModal({
  currentMax,
  currentWarning,
  onSave,
  onClose,
}: {
  currentMax: number;
  currentWarning: number;
  onSave: (maxSlots: number, warningThreshold: number) => void;
  onClose: () => void;
}) {
  const [maxSlots, setMaxSlots] = useState(currentMax);
  const [warningThreshold, setWarningThreshold] = useState(currentWarning);
  const isValid = maxSlots >= 1 && maxSlots <= 50 && warningThreshold >= 1 && warningThreshold <= maxSlots;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
          <div className="bg-gradient-to-r from-purple-600 to-pink-500 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Capacity Settings
                </h2>
                <p className="text-purple-200 text-sm">Adjust crew slots as your team grows</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Max Crew Slots
              </label>
              <p className="text-xs text-gray-500 mb-2">Total number of crew rows on the schedule board</p>
              <input
                type="number"
                min={1}
                max={50}
                value={maxSlots}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 1;
                  setMaxSlots(v);
                  if (warningThreshold > v) setWarningThreshold(v);
                }}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-lg font-bold text-gray-900 bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Warning Threshold
              </label>
              <p className="text-xs text-gray-500 mb-2">Show capacity warning when this many slots are filled</p>
              <input
                type="number"
                min={1}
                max={maxSlots}
                value={warningThreshold}
                onChange={(e) => setWarningThreshold(Math.min(parseInt(e.target.value) || 1, maxSlots))}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-200 text-lg font-bold text-gray-900 bg-white transition-all"
              />
            </div>

            {/* Preview */}
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <p className="text-xs text-gray-600">
                <strong>Preview:</strong> {maxSlots} total slots. Warning at {warningThreshold}+ jobs.
                {warningThreshold < maxSlots && (
                  <span className="block mt-1 text-amber-600">
                    Slots {warningThreshold}-{maxSlots - 1}: amber warning shown
                  </span>
                )}
                <span className="block mt-0.5 text-red-600">
                  At {maxSlots}: schedule marked full, approval blocked
                </span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => onSave(maxSlots, warningThreshold)}
                disabled={!isValid}
                className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
