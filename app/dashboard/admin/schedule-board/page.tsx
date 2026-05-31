'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar, Send, Users, Clock, MapPin, Plus, ChevronLeft, ChevronRight,
  LayoutGrid, CalendarDays, Bell, FileText, Phone, Package, AlertCircle,
  UserCheck, UserX, FolderOpen, Timer, Loader2, Settings, Search, X,
  Megaphone, CheckCircle2, Sparkles, Zap, Brain, RefreshCw, KeyRound, Copy,
  MessageSquareOff
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { useFeatureFlags } from '@/lib/feature-flags';
import OperatorRow from './_components/OperatorRow';
import Toast from './_components/Toast';
import NotificationBell from './_components/NotificationBell';
import type { QuickAddData } from './_components/QuickAddModal';
import ScheduleDatePicker from './_components/ScheduleDatePicker';
import DailyNotesSection from './_components/DailyNotesSection';
import type { DailyNote } from './_components/DailyNotesSection';
import type { JobCardData } from './_components/JobCard';
import type { PendingJob } from './_components/PendingQueueSidebar';
import type { ToastData } from './_components/Toast';
import type { NoteData } from './_components/NotesDrawer';
import DndBoardWrapper from './_components/DndBoardWrapper';
import ViewToggle from './_components/ViewToggle';
import CapacitySettingsModal from './_components/CapacitySettingsModal';
import DispatchConfirmationModal from './_components/DispatchConfirmationModal';
import AutoScheduleResultsModal from './_components/AutoScheduleResultsModal';
import type { AutoScheduleResults } from './_components/AutoScheduleResultsModal';
import DailyCodeModal from './_components/DailyCodeModal';
import WillCallFolder from './_components/WillCallFolder';
import WeeklyView from './_components/WeeklyView';
import UnassignedSection from './_components/UnassignedSection';
import BoardLoadingSkeleton from './_components/BoardLoadingSkeleton';
import NextAvailableBanner from './_components/NextAvailableBanner';
import { OPERATOR_COLORS, SALESMEN } from './_components/constants';
import { parseLocalDate, toDateString, formatDisplayDate, daysAgo, apiFetch, toJobCard } from './_components/helpers';
import type { ConflictData, RowChangeConflict } from './_components/types';

// ─── Heavy components — dynamic-imported (rendered conditionally) ─────────
const PendingQueueSidebar = dynamic(() => import('./_components/PendingQueueSidebar'), { ssr: false, loading: () => null });
const ApprovalModal = dynamic(() => import('./_components/ApprovalModal'), { ssr: false, loading: () => null });
const MissingInfoModal = dynamic(() => import('./_components/MissingInfoModal'), { ssr: false, loading: () => null });
const AssignOperatorModal = dynamic(() => import('./_components/AssignOperatorModal'), { ssr: false, loading: () => null });
const EditJobPanel = dynamic(() => import('./_components/EditJobPanel'), { ssr: false, loading: () => null });
const ChangeRequestModal = dynamic(() => import('./_components/ChangeRequestModal'), { ssr: false, loading: () => null });
const NotesDrawer = dynamic(() => import('./_components/NotesDrawer'), { ssr: false, loading: () => null });
const QuickAddModal = dynamic(() => import('./_components/QuickAddModal'), { ssr: false, loading: () => null });
const ConflictModal = dynamic(() => import('./_components/ConflictModal'), { ssr: false, loading: () => null });
const JobDetailView = dynamic(() => import('./_components/JobDetailView'), { ssr: false, loading: () => null });
const OperatorRowView = dynamic(() => import('./_components/OperatorRowView'), { ssr: false, loading: () => null });
const CrewScheduleGrid = dynamic(() => import('./_components/CrewScheduleGrid'), { ssr: false, loading: () => null });
const CancelJobModal = dynamic(() => import('./_components/CancelJobModal'), { ssr: false, loading: () => null });
const MarkOutModal = dynamic(() => import('./_components/MarkOutModal'), { ssr: false, loading: () => null });

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

  // canEdit: super_admin, operations_manager, and admin always can; others need the flag
  const canEdit = userRole === 'super_admin' || userRole === 'operations_manager' || userRole === 'admin' || featureFlags.can_edit_schedule_board;

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
  const [timeOffMap, setTimeOffMap] = useState<Record<string, { id: string; type: string; notes: string | null }>>({});
  const [rowNotesMap, setRowNotesMap] = useState<Record<string, string>>({}); // operatorId → note text

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

  // Update schedule state
  const [updatingSchedule, setUpdatingSchedule] = useState(false);

  // Modal states
  const [approvalTarget, setApprovalTarget] = useState<PendingJob | null>(null);
  const [missingInfoTarget, setMissingInfoTarget] = useState<PendingJob | null>(null);
  const [assignTarget, setAssignTarget] = useState<{ job: JobCardData; source: 'unassigned' | 'willcall' } | null>(null);
  const [editTarget, setEditTarget] = useState<{ job: JobCardData; rowIndex: number | null } | null>(null);
  const [changeRequestTarget, setChangeRequestTarget] = useState<JobCardData | null>(null);
  const [cancelJobTarget, setCancelJobTarget] = useState<JobCardData | null>(null);
  const [markOutTarget, setMarkOutTarget] = useState<{ rowIdx: number; operatorName: string } | null>(null);
  const [notesTarget, setNotesTarget] = useState<JobCardData | null>(null);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);
  const [rowChangeConflict, setRowChangeConflict] = useState<RowChangeConflict | null>(null);
  const [jobDetailTarget, setJobDetailTarget] = useState<{ job: JobCardData; rowIndex: number | null; operatorName?: string | null; helperName?: string | null } | null>(null);

  // ═══ SMS CONFIG WARNING STATE ═══
  const [smsConfigured, setSmsConfigured] = useState<boolean | null>(null);
  const [smsWarningDismissed, setSmsWarningDismissed] = useState(false);

  // ═══ DAILY CODE STATE ═══
  const [showDailyCode, setShowDailyCode] = useState(false);
  const [dailyCode, setDailyCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);

  // ═══ AI AUTO-SCHEDULE STATE ═══
  const [autoScheduleLoading, setAutoScheduleLoading] = useState(false);
  const [autoScheduleResults, setAutoScheduleResults] = useState<AutoScheduleResults | null>(null);

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
        addToast('success', 'Tickets Dispatched', json.message);
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
    if (!['admin', 'super_admin', 'salesman', 'operations_manager', 'supervisor'].includes(role)) {
      router.push('/dashboard');
      return;
    }
    setUserRole(role);
    setUserId(currentUser.id || null);
  }, [router]);

  // ═══ SMS CONFIG CHECK ═══
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem('sms_warning_dismissed') === 'true';
      setSmsWarningDismissed(dismissed);
    } catch { /* ignore */ }
    const adminRoles = ['admin', 'super_admin', 'operations_manager'];
    const currentUser = getCurrentUser();
    if (!currentUser || !adminRoles.includes(currentUser.role)) return;
    apiFetch('/api/admin/config-status')
      .then(r => r.json())
      .then(json => {
        if (json?.data != null) setSmsConfigured(json.data.sms_configured === true);
      })
      .catch(() => { /* non-fatal */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══ FEATURE FLAG GUARD ═══
  useEffect(() => {
    if (!userRole) return; // wait for auth to initialize
    if (flagsLoading) return;
    const isBypass = ['super_admin', 'operations_manager', 'admin'].includes(userRole);
    if (!isBypass && !featureFlags.can_view_schedule_board) {
      router.push('/dashboard/admin');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flagsLoading, featureFlags.can_view_schedule_board, userRole]);

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

      const unassigned = (json.data?.unassigned || []).map((j: any) => toJobCard(j, date));
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
        po_number: j.po_number || null,
        site_contact: null,
        contact_phone: j.site_contact_phone || null,
        project_name: j.project_name || null,
        location_name: null,
        scheduling_flexibility: j.scheduling_flexibility || null,
      }));
      const willCall = (json.data?.willCall || []).map((j: any) => toJobCard(j, date));

      // Group assigned jobs by operator name into rows
      const newRows: { operator: string | null; helper: string | null }[] = [];
      const newJobsByOp: Record<number, JobCardData[]> = {};
      const operatorGrouped = new Map<string, { jobs: JobCardData[]; helperName: string | null }>();

      for (const rawJob of json.data?.assigned || []) {
        const opName = rawJob.operator_name || 'Unassigned';
        if (!operatorGrouped.has(opName)) {
          operatorGrouped.set(opName, { jobs: [], helperName: rawJob.helper_name || null });
        }
        operatorGrouped.get(opName)!.jobs.push(toJobCard(rawJob, date));
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

  // ═══ UPDATE SCHEDULE (re-push to operators) ═══
  const handleUpdateSchedule = useCallback(async () => {
    setUpdatingSchedule(true);
    try {
      const res = await apiFetch('/api/admin/schedule-board/update-schedule', {
        method: 'POST',
        body: JSON.stringify({ date: selectedDate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update schedule');
      addToast('success', 'Schedule Updated', `${json.data?.operatorsNotified || 0} operators notified of changes`);
      fetchScheduleData(selectedDate);
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message);
    } finally {
      setUpdatingSchedule(false);
    }
  }, [selectedDate, addToast, fetchScheduleData]);

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
          const map: Record<string, { id: string; type: string; notes: string | null }> = {};
          for (const entry of json.data || []) {
            map[entry.operator_id] = { id: entry.id, type: entry.type, notes: entry.notes };
          }
          setTimeOffMap(map);
        }
      } catch { setTimeOffMap({}); }
    }
    fetchTimeOff();
  }, [selectedDate]);

  // ═══ FETCH ROW NOTES ═══
  useEffect(() => {
    async function fetchRowNotes() {
      try {
        const res = await apiFetch(`/api/admin/schedule-board/row-notes?date=${selectedDate}`);
        if (res.ok) {
          const json = await res.json();
          const map: Record<string, string> = {};
          for (const entry of json.data || []) {
            map[entry.operator_id] = entry.note;
          }
          setRowNotesMap(map);
        }
      } catch { setRowNotesMap({}); }
    }
    fetchRowNotes();
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
          assignment_date: selectedDate,
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
            if (capJson.summary.fullDates.length > 0) {
              addToast('error', 'Schedule Full', `Cannot approve — ${capJson.summary.fullDates.length} date(s) are at full capacity. Use the approval modal to find available dates.`);
              return;
            }
          } else {
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

  const proceedWithAssignment = async (rowIndex: number, job: JobCardData, source: 'unassigned' | 'willcall', helperName: string | null, explicitOperatorName?: string) => {
    const operatorName = explicitOperatorName ?? rowAssignments[rowIndex]?.operator;
    const operatorId = operatorName ? operatorIdMap[operatorName] : null;
    const helperId = helperName ? helperIdMap[helperName] : null;

    if (!operatorId && operatorName) {
      console.warn('operatorIdMap missing entry for:', operatorName, 'map:', operatorIdMap);
      addToast('error', 'Assignment Failed', `Operator "${operatorName}" not found in crew roster. Please refresh the page.`);
      return;
    }

    try {
      const res = await apiFetch('/api/admin/schedule-board/assign', {
        method: 'POST',
        body: JSON.stringify({ jobOrderId: job.id, operatorId, helperId, assignment_date: selectedDate }),
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

    const opName = operatorName || 'Operator';
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

    proceedWithAssignment(targetRow, job, source, helperName, operatorName);
    setAssignTarget(null);
  };

  const handleConflictAddSecondJob = () => {
    if (!conflictData) return;
    const { targetRowIndex, newJob, newJobSource, helperName } = conflictData;
    proceedWithAssignment(targetRowIndex, newJob, newJobSource, helperName, conflictData.personName);
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
            body: JSON.stringify({ jobOrderId: j.id, operatorId: null, helperId: null, assignment_date: selectedDate }),
          });
        } catch { /* continue */ }
      }
      setUnassignedJobs(prev => [...prev, ...existingJobs.map(j => ({ ...j, helper_names: [] }))]);
      setOperatorJobs(prev => ({ ...prev, [targetRowIndex]: [] }));
    }

    proceedWithAssignment(targetRowIndex, newJob, newJobSource, helperName, conflictData.personName);
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
    const targetJob = changeRequestTarget || editTarget?.job;
    if (!targetJob) return;

    const jobId = targetJob.id;
    const updateJobInPlace = (jobs: JobCardData[]) =>
      jobs.map(j => j.id === jobId ? { ...j, change_requests_count: j.change_requests_count + 1 } : j);

    for (let idx = 0; idx < NUM_ROWS; idx++) {
      if (operatorJobs[idx]?.some(j => j.id === jobId)) {
        setOperatorJobs(prev => ({ ...prev, [idx]: updateJobInPlace(prev[idx]) }));
        break;
      }
    }

    if (changeRequestTarget) {
      addToast('success', 'Change Request Submitted', `${targetJob.customer_name} — Supervisor will review`);
      setChangeRequestTarget(null);
    }
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

  // ── Time-off handlers ────────────────────────────────────────────────────
  const handleAddTimeOff = async (rowIdx: number, type: string, notes: string) => {
    const opName = rowAssignments[rowIdx]?.operator;
    const opId = opName ? operatorIdMap[opName] : null;
    if (!opId) return;
    try {
      const res = await apiFetch('/api/admin/schedule-board/time-off', {
        method: 'POST',
        body: JSON.stringify({ operator_id: opId, date: selectedDate, type, notes }),
      });
      if (res.ok) {
        const json = await res.json();
        setTimeOffMap(prev => ({ ...prev, [opId]: { id: json.data.id, type, notes } }));
        addToast('success', 'Time Off Recorded', `${opName} marked as ${type} on ${selectedDate}`);
      } else {
        const err = await res.json();
        addToast('error', 'Failed', err.error || 'Could not record time off');
      }
    } catch { addToast('error', 'Error', 'Network error'); }
  };

  const handleRemoveTimeOff = async (rowIdx: number) => {
    const opName = rowAssignments[rowIdx]?.operator;
    const opId = opName ? operatorIdMap[opName] : null;
    if (!opId) return;
    const entry = timeOffMap[opId];
    if (!entry?.id) return;
    try {
      const res = await apiFetch(`/api/admin/schedule-board/time-off?id=${entry.id}`, { method: 'DELETE' });
      if (res.ok) {
        setTimeOffMap(prev => { const n = { ...prev }; delete n[opId]; return n; });
        addToast('info', 'Time Off Removed', `${opName} is back on schedule`);
      }
    } catch { addToast('error', 'Error', 'Network error'); }
  };

  const handleMarkUnavailable = async (rowIdx: number, reason: string, notes?: string) => {
    const opName = rowAssignments[rowIdx]?.operator;
    const opId = opName ? operatorIdMap[opName] : null;
    if (!opId || !opName) throw new Error('Operator not found');

    const res = await apiFetch('/api/admin/schedule-board/time-off', {
      method: 'POST',
      body: JSON.stringify({ operator_id: opId, date: selectedDate, type: reason, notes: notes || null }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Could not mark operator as unavailable');
    }

    const json = await res.json();
    const reasonLabel: Record<string, string> = {
      sick: 'Sick', personal_day: 'Personal Day', no_show: 'No-Show',
      vacation: 'Vacation', unavailable: 'Unavailable',
    };
    const label = reasonLabel[reason] || reason;

    setTimeOffMap(prev => ({ ...prev, [opId]: { id: json.data.id, type: reason, notes: notes || null } }));
    addToast('success', `${opName} Marked Unavailable`, `${label} on ${selectedDate}`);
  };

  const handleSaveRowNote = async (rowIdx: number, note: string) => {
    const opName = rowAssignments[rowIdx]?.operator;
    const opId = opName ? operatorIdMap[opName] : null;
    if (!opId) return;
    try {
      await apiFetch('/api/admin/schedule-board/row-notes', {
        method: 'POST',
        body: JSON.stringify({ operator_id: opId, date: selectedDate, note }),
      });
      setRowNotesMap(prev => ({ ...prev, [opId]: note }));
    } catch { /* silent fail */ }
  };

  // ── Cancel job: reschedule or delete permanently ─────────────────────────
  const handleRescheduleJob = async (jobId: string, newDate: string, reason?: string) => {
    const notes = reason ? `Rescheduled: ${reason}` : undefined;
    const res = await apiFetch(`/api/admin/job-orders/${jobId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        scheduled_date: newDate,
        status: 'scheduled',
        ...(notes ? { notes } : {}),
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d?.error || 'Failed to reschedule');
    }
    addToast('success', 'Job Rescheduled', `Job moved to ${newDate}`);
    fetchScheduleData(selectedDate);
  };

  const handleDeleteJob = async (jobId: string) => {
    const res = await apiFetch(`/api/admin/job-orders/${jobId}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d?.error || 'Failed to delete job');
    }
    addToast('success', 'Job Deleted', 'Job has been permanently removed');
    fetchScheduleData(selectedDate);
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
  const handleChangeRowOperator = async (rowIndex: number, newOperator: string | null) => {
    if (!newOperator) {
      // Clearing operator — unassign all jobs in this row from the DB first
      const rowJobs = operatorJobs[rowIndex] || [];
      for (const j of rowJobs) {
        try {
          await apiFetch('/api/admin/schedule-board/assign', {
            method: 'POST',
            body: JSON.stringify({ jobOrderId: j.id, operatorId: null, helperId: null, assignment_date: selectedDate }),
          });
        } catch { /* continue */ }
      }
      // Move jobs back to unassigned pool
      if (rowJobs.length > 0) {
        setUnassignedJobs(prev => [...prev, ...rowJobs.map(j => ({ ...j, helper_names: [] }))]);
        setOperatorJobs(prev => ({ ...prev, [rowIndex]: [] }));
      }
      setRowAssignments(prev => prev.map((r, i) => i === rowIndex ? { operator: null, helper: null } : r));
      return;
    }

    // Check if this operator is already in another row that has jobs
    for (let i = 0; i < NUM_ROWS; i++) {
      if (i === rowIndex) continue;
      if (rowAssignments[i]?.operator === newOperator && (operatorJobs[i] || []).length > 0) {
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

    const existingJobs = operatorJobs[sourceRowIndex] || [];
    for (const j of existingJobs) {
      try {
        await apiFetch('/api/admin/schedule-board/assign', {
          method: 'POST',
          body: JSON.stringify({ jobOrderId: j.id, operatorId: null, helperId: null, assignment_date: selectedDate }),
        });
      } catch { /* continue */ }
    }
    setUnassignedJobs(prev => [...prev, ...existingJobs.map(j => ({ ...j, helper_names: [] }))]);
    setOperatorJobs(prev => ({ ...prev, [sourceRowIndex]: [] }));

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
  const handleChangeRowHelper = async (rowIndex: number, newHelper: string | null) => {
    const operatorName = rowAssignments[rowIndex]?.operator;
    const operatorId = operatorName ? operatorIdMap[operatorName] : null;
    const newHelperId = newHelper ? helperIdMap[newHelper] : null;

    const rowJobs = operatorJobs[rowIndex] || [];
    for (const j of rowJobs) {
      try {
        await apiFetch('/api/admin/schedule-board/assign', {
          method: 'POST',
          body: JSON.stringify({ jobOrderId: j.id, operatorId: operatorId || null, helperId: newHelperId, assignment_date: selectedDate }),
        });
      } catch { /* continue */ }
    }

    setRowAssignments(prev => prev.map((r, i) => i === rowIndex ? { ...r, helper: newHelper } : r));
  };

  // --- Daily Code ---
  const fetchDailyCode = async () => {
    setCodeLoading(true);
    try {
      const res = await apiFetch('/api/admin/daily-code');
      if (res.ok) {
        const json = await res.json();
        setDailyCode(json.data?.pin_code || null);
      }
    } catch {} finally { setCodeLoading(false); }
  };

  const regenerateDailyCode = async () => {
    setCodeLoading(true);
    try {
      const res = await apiFetch('/api/admin/daily-code', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setDailyCode(json.data?.pin_code || null);
        addToast('success', 'Code Updated', `New daily code: ${json.data?.pin_code}`);
      }
    } catch {} finally { setCodeLoading(false); }
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

  // ═══ LOADING STATE ═══
  if (loading && Object.keys(operatorJobs).length === 0 && unassignedJobs.length === 0) {
    return <BoardLoadingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 dark:from-[#0b0618] dark:via-[#0b0618] dark:to-[#0e0720]">
      {/* ═══ STICKY HEADER ════════════════════════════════════════════════ */}
      <div className="backdrop-blur-xl bg-white/90 dark:bg-[#0e0720]/95 border-b border-gray-200 dark:border-white/10 sticky top-0 z-30 shadow-lg">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/admin" className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-white/10 rounded-xl transition-all hover:scale-105">
                <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-white/70" />
              </Link>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-600" />
                  {canEdit ? 'Operations Schedule Board' : 'Schedule Board'}
                </h1>
                <p className="text-gray-500 dark:text-white/60 text-xs">
                  {canEdit ? 'Manage assignments, approvals & dispatch' : 'View scheduled jobs • Request changes'}
                </p>
              </div>
            </div>

            {/* Action toolbar — labels stay visible on narrow screens and the row
                wraps neatly instead of collapsing to icon-only buttons. */}
            <div className="flex items-center gap-2 w-full sm:w-auto sm:justify-end flex-wrap">
              {/* Notification bell for all users */}
              <NotificationBell />

              {canEdit && (
                <button onClick={() => setShowPendingQueue(true)} className="relative h-9 px-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg text-orange-700 text-sm font-semibold transition-all flex items-center gap-1.5">
                  <Bell className="w-4 h-4" /> <span className="whitespace-nowrap">Pending</span>
                  {pendingJobs.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{pendingJobs.length}</span>
                  )}
                </button>
              )}

              <button onClick={() => setShowWillCall(!showWillCall)} className={`h-9 px-3 border rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${showWillCall ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700'}`}>
                <FolderOpen className="w-4 h-4" /> <span className="whitespace-nowrap">Will Call</span>
                <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded-full text-xs font-bold">{willCallJobs.length}</span>
              </button>

              <button className="relative h-9 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-blue-700 text-sm font-semibold transition-all flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> <span className="whitespace-nowrap">Changes</span>
                {changeRequestCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{changeRequestCount}</span>
                )}
              </button>

              {canEdit && (
                <>
                  <button
                    onClick={handleAutoSchedule}
                    disabled={autoScheduleLoading || unassignedJobs.length === 0}
                    className={`relative h-9 px-3 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md ${
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
                    <span className="whitespace-nowrap">{autoScheduleLoading ? 'Scheduling...' : 'AI Schedule'}</span>
                    {unassignedJobs.length > 0 && !autoScheduleLoading && (
                      <span className="px-1.5 py-0.5 bg-white/20 rounded-full text-xs">{unassignedJobs.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setShowQuickAdd(true)}
                    className="h-9 px-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md"
                  >
                    <Plus className="w-4 h-4" /> <span className="whitespace-nowrap">Quick Add</span>
                  </button>
                  <button
                    onClick={handleUpdateSchedule}
                    disabled={updatingSchedule}
                    className="h-9 px-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Re-push schedule changes to operators"
                  >
                    {updatingSchedule ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> <span className="whitespace-nowrap">Updating...</span></>
                    ) : (
                      <><RefreshCw className="w-4 h-4" /> <span className="whitespace-nowrap">Update Schedule</span></>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      fetchDispatchStatus(selectedDate);
                      setShowDispatchModal(true);
                    }}
                    className="relative h-9 px-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md"
                  >
                    <Megaphone className="w-4 h-4" /> <span className="whitespace-nowrap">Push Tickets</span>
                    {dispatchInfo && dispatchInfo.total > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full flex items-center justify-center">{dispatchInfo.total}</span>
                    )}
                  </button>
                  <button
                    onClick={() => { setShowDailyCode(true); fetchDailyCode(); }}
                    className="h-9 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:hover:bg-indigo-500/25 border border-indigo-200 dark:border-indigo-400/30 rounded-lg text-indigo-700 dark:text-indigo-300 text-sm font-semibold transition-all flex items-center gap-1.5"
                  >
                    <KeyRound className="w-4 h-4" /> <span className="whitespace-nowrap">Daily Code</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ DATE NAVIGATION + STATS ═════════════════════════════════════ */}
      {/* SMS not configured warning */}
      {smsConfigured === false && !smsWarningDismissed && (
        <div className="container mx-auto px-4 md:px-6 pt-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-400/30">
            <MessageSquareOff className="w-4 h-4 text-amber-600 dark:text-amber-300 flex-shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200 flex-1">
              <span className="font-semibold">SMS not configured</span> — dispatch text notifications won&apos;t reach operators.
              Set <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">TELNYX_API_KEY</code> or{' '}
              <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">TWILIO_AUTH_TOKEN</code> in Vercel environment variables.
            </p>
            <button
              onClick={() => {
                setSmsWarningDismissed(true);
                try { localStorage.setItem('sms_warning_dismissed', 'true'); } catch { /* ignore */ }
              }}
              className="text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200 transition-colors flex-shrink-0"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 md:px-6 py-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 p-4 md:p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <ScheduleDatePicker value={selectedDate} onChange={setSelectedDate} />

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl">
                <button
                  onClick={() => setViewMode('day')}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                    viewMode === 'day'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg'
                      : 'text-gray-500 dark:text-white/60 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-200 dark:hover:bg-white/15'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" /> Day
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                    viewMode === 'week'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg'
                      : 'text-gray-500 dark:text-white/60 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-200 dark:hover:bg-white/15'
                  }`}
                >
                  <CalendarDays className="w-4 h-4" /> Week
                </button>
              </div>
              <ViewToggle viewMode={boardViewMode} onChange={handleBoardViewModeChange} />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-500/15 rounded-xl border border-purple-200 dark:border-purple-400/30">
                <UserCheck className="w-4 h-4 text-purple-600 dark:text-purple-300" />
                <div>
                  <div className="text-[10px] font-bold text-purple-500 dark:text-purple-400 uppercase">Active</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{activeOperators}</div>
                </div>
              </div>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                totalJobs >= capacityMaxSlots
                  ? 'bg-red-50 border-red-200 dark:bg-red-500/15 dark:border-red-400/30'
                  : totalJobs >= capacityWarningThreshold
                    ? 'bg-amber-50 border-amber-200 dark:bg-amber-500/15 dark:border-amber-400/30'
                    : 'bg-green-50 border-green-200 dark:bg-green-500/15 dark:border-green-400/30'
              }`}>
                <Package className={`w-4 h-4 ${
                  totalJobs >= capacityMaxSlots ? 'text-red-600 dark:text-red-400' : totalJobs >= capacityWarningThreshold ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'
                }`} />
                <div>
                  <div className={`text-[10px] font-bold uppercase ${
                    totalJobs >= capacityMaxSlots ? 'text-red-500 dark:text-red-400' : totalJobs >= capacityWarningThreshold ? 'text-amber-500 dark:text-amber-400' : 'text-green-500 dark:text-green-400'
                  }`}>
                    {totalJobs >= capacityMaxSlots ? 'Full' : totalJobs >= capacityWarningThreshold ? 'Near Cap' : 'Capacity'}
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{totalJobs}/{capacityMaxSlots}</div>
                </div>
              </div>

              {/* See Next Available — for admin/salesman (non-super_admin) */}
              {!canEdit && (
                <button
                  onClick={handleFindNextAvailable}
                  disabled={findingNextAvailable}
                  className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 dark:bg-purple-500/15 dark:hover:bg-purple-500/25 border border-purple-200 dark:border-purple-400/30 rounded-xl text-purple-700 dark:text-purple-300 text-sm font-semibold transition-all"
                >
                  {findingNextAvailable ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Next Available
                </button>
              )}

              {/* Capacity Settings — super_admin only */}
              {canEdit && (
                <button
                  onClick={() => setShowCapacitySettings(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-xl text-gray-600 dark:text-white/60 text-sm font-semibold transition-all"
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
        <WillCallFolder
          willCallJobs={willCallJobs}
          canEdit={canEdit}
          onMoveToSchedule={handleMoveWillCallToSchedule}
          onAssign={(job) => setAssignTarget({ job, source: 'willcall' })}
        />
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
        <WeeklyView
          weekData={weekData}
          selectedDate={selectedDate}
          capacityMaxSlots={capacityMaxSlots}
          canEdit={canEdit}
          onDayClick={(date) => { setSelectedDate(date); setViewMode('day'); }}
        />
      )}

      {/* ═══ CHANGE REQUEST BANNER (admin/salesman) ════════════════════════ */}
      {!canEdit && (userRole === 'admin' || userRole === 'salesman') && (
        <div className="container mx-auto px-4 md:px-6 pb-2">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-sm text-amber-300 flex items-center gap-2">
            <span>✏️</span>
            <span>Click any job to edit fields — changes will be submitted for supervisor approval.</span>
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
                onEditJob={(job) => canEdit ? setJobDetailTarget({ job, rowIndex: idx, operatorName: rowAssignments[idx]?.operator, helperName: rowAssignments[idx]?.helper }) : setEditTarget({ job, rowIndex: idx })}
                onRequestChange={(job) => setChangeRequestTarget(job)}
                onViewNotes={(job) => handleViewNotes(job)}
                onRemoveJob={(job) => setCancelJobTarget(job)}
                onPreviewJob={(job) => setJobDetailTarget({ job, rowIndex: idx, operatorName: rowAssignments[idx]?.operator, helperName: rowAssignments[idx]?.helper })}
                onAssignJob={() => handleAssignToAvailableOperator(idx)}
                onChangeOperator={(name) => handleChangeRowOperator(idx, name)}
                onChangeHelper={(name) => handleChangeRowHelper(idx, name)}
                onDropJob={handleDropJob}
                operatorId={rowAssignments[idx]?.operator ? (operatorIdMap[rowAssignments[idx].operator!] ?? null) : null}
                timeOff={(() => { const opId = rowAssignments[idx]?.operator ? operatorIdMap[rowAssignments[idx].operator!] : null; return opId ? (timeOffMap[opId] ?? null) : null; })()}
                rowNote={(() => { const opId = rowAssignments[idx]?.operator ? operatorIdMap[rowAssignments[idx].operator!] : null; return opId ? (rowNotesMap[opId] ?? '') : ''; })()}
                onAddTimeOff={(type, notes) => handleAddTimeOff(idx, type, notes)}
                onRemoveTimeOff={() => handleRemoveTimeOff(idx)}
                onSaveRowNote={(note) => handleSaveRowNote(idx, note)}
                onMarkUnavailable={rowAssignments[idx]?.operator ? () => setMarkOutTarget({ rowIdx: idx, operatorName: rowAssignments[idx].operator! }) : undefined}
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
            onEditJob={(job, rowIndex) => setEditTarget({ job, rowIndex: rowIndex ?? null })}
            onRequestChange={(job) => setChangeRequestTarget(job)}
            onViewNotes={(job) => handleViewNotes(job)}
            onPreviewJob={(job) => setJobDetailTarget({ job, rowIndex: null, operatorName: null, helperName: null })}
          />
        )}

        {/* ═══ SHOP / NOTES ROW ══════════════════════════════════════ */}
        {shopNotesEnabled && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-dashed border-blue-300 dark:border-blue-500/40 overflow-hidden">
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
                className="w-full h-20 px-3 py-2 border border-gray-200 dark:border-white/10 dark:bg-slate-700 dark:text-white dark:placeholder-white/40 rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder:text-gray-400"
              />
            </div>
          </div>
        )}

        {/* ═══ UNASSIGNED SECTION ═══════════════════════════════════════ */}
        {boardViewMode === 'slots' && (
          <UnassignedSection
            jobs={unassignedJobs}
            canEdit={canEdit}
            onJobClick={(job) => setJobDetailTarget({ job, rowIndex: null, operatorName: null, helperName: null })}
            onAssign={(job) => setAssignTarget({ job, source: 'unassigned' })}
          />
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
          canEdit={canEdit || userRole === 'admin' || userRole === 'salesman'}
          userRole={userRole}
          allOperators={allOperatorsList}
          allHelpers={allHelpersList}
          currentOperatorName={editTarget.rowIndex !== null ? rowAssignments[editTarget.rowIndex]?.operator ?? null : null}
          currentHelperName={editTarget.rowIndex !== null ? rowAssignments[editTarget.rowIndex]?.helper ?? null : null}
          busyOperators={busyOperators}
          busyHelpers={busyHelpers}
          operatorSkillMap={operatorSkillMap}
          onSave={handleEditSave}
          onChangeRequestSuccess={handleChangeRequestSuccess}
          onClose={() => setEditTarget(null)}
          onViewNotes={() => { setEditTarget(null); handleViewNotes(editTarget.job); }}
          onMakeWillCall={canEdit ? handleMakeWillCall : undefined}
          onRemoveFromSchedule={canEdit ? handleRemoveFromSchedule : undefined}
        />
      )}
      {changeRequestTarget && <ChangeRequestModal job={changeRequestTarget} onSuccess={handleChangeRequestSuccess} onClose={() => setChangeRequestTarget(null)} />}
      {markOutTarget && (
        <MarkOutModal
          operatorName={markOutTarget.operatorName}
          date={selectedDate}
          onConfirm={(reason, notes) => handleMarkUnavailable(markOutTarget.rowIdx, reason, notes)}
          onClose={() => setMarkOutTarget(null)}
        />
      )}
      {cancelJobTarget && (
        <CancelJobModal
          job={cancelJobTarget}
          onClose={() => setCancelJobTarget(null)}
          onReschedule={handleRescheduleJob}
          onDelete={handleDeleteJob}
        />
      )}
      {notesTarget && <NotesDrawer job={notesTarget} notes={jobNotes[notesTarget.id] || []} onAddNote={handleAddNote} onClose={() => setNotesTarget(null)} />}
      {showQuickAdd && <QuickAddModal salesmen={SALESMEN} onSubmit={handleQuickAdd} onClose={() => setShowQuickAdd(false)} />}

      {/* ═══ AI AUTO-SCHEDULE RESULTS MODAL ═══ */}
      {autoScheduleResults && (
        <AutoScheduleResultsModal
          results={autoScheduleResults}
          onClose={() => setAutoScheduleResults(null)}
        />
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

      {/* ═══ JOB DETAIL VIEW (full-page overlay) ═══════════════════════ */}
      {jobDetailTarget && (
        <JobDetailView
          job={jobDetailTarget.job}
          operatorName={jobDetailTarget.operatorName}
          helperName={jobDetailTarget.helperName}
          rowIndex={jobDetailTarget.rowIndex}
          userRole={userRole}
          onClose={() => setJobDetailTarget(null)}
          onEdit={() => {
            const target = jobDetailTarget;
            setJobDetailTarget(null);
            setEditTarget({ job: target.job, rowIndex: target.rowIndex });
          }}
          onRemove={canEdit ? () => {
            const target = jobDetailTarget;
            setJobDetailTarget(null);
            setCancelJobTarget(target.job);
          } : undefined}
        />
      )}

      {/* ═══ NEXT AVAILABLE DATE BANNER ════════════════════════════════ */}
      {nextAvailableDate && (
        <NextAvailableBanner
          date={nextAvailableDate.date}
          availableSlots={nextAvailableDate.availableSlots}
          onGo={() => { setSelectedDate(nextAvailableDate.date); setNextAvailableDate(null); }}
          onDismiss={() => setNextAvailableDate(null)}
        />
      )}

      {/* ═══ DISPATCH CONFIRMATION MODAL ═══════════════════════════════ */}
      {showDispatchModal && (
        <DispatchConfirmationModal
          selectedDate={selectedDate}
          dispatchInfo={dispatchInfo}
          dispatchLoading={dispatchLoading}
          onDispatch={() => handleDispatchJobs(selectedDate)}
          onClose={() => setShowDispatchModal(false)}
        />
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

      {/* ═══ DAILY CODE MODAL ═══════════════════════════════════════════ */}
      {showDailyCode && (
        <DailyCodeModal
          dailyCode={dailyCode}
          codeLoading={codeLoading}
          onCopy={() => { if (dailyCode) { navigator.clipboard.writeText(dailyCode); addToast('success', 'Copied', 'Code copied to clipboard'); } }}
          onRegenerate={regenerateDailyCode}
          onClose={() => setShowDailyCode(false)}
        />
      )}

      {/* ═══ TOASTS ═══════════════════════════════════════════════════ */}
      <Toast toasts={toasts} onRemove={removeToast} />

    </div>
  );
}
