'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar, Send, Users, Clock, MapPin, Plus, ChevronLeft, ChevronRight,
  LayoutGrid, CalendarDays, Bell, FileText, Phone, Package, AlertCircle,
  UserCheck, UserX, Eye, FolderOpen, Timer
} from 'lucide-react';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import OperatorRow from './_components/OperatorRow';
import PendingQueueSidebar from './_components/PendingQueueSidebar';
import Toast from './_components/Toast';
import ApprovalModal from './_components/ApprovalModal';
import MissingInfoModal from './_components/MissingInfoModal';
import AssignOperatorModal from './_components/AssignOperatorModal';
import EditJobPanel from './_components/EditJobPanel';
import ChangeRequestModal from './_components/ChangeRequestModal';
import NotesDrawer, { getNotesForJob } from './_components/NotesDrawer';
import QuickAddModal from './_components/QuickAddModal';
import ConflictModal from './_components/ConflictModal';
import type { JobCardData } from './_components/JobCard';
import type { PendingJob } from './_components/PendingQueueSidebar';
import type { ToastData } from './_components/Toast';
import type { NoteData } from './_components/NotesDrawer';

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

// ─── CREW ROSTER — operators and helpers are independently selectable ───
const ALL_OPERATORS = [
  'Mike Rodriguez', 'Juan Salazar', 'Tony Martinez', 'Eddie Lopez',
  'Chris Johnson', 'Robert Garcia', 'James Wilson', 'Steven Kim',
];

const ALL_HELPERS = [
  'Carlos Mendez', 'David Torres', 'Alex Reyes', 'Marco Flores',
  'Ryan Mitchell', 'Luis Hernandez', 'Daniel Ortiz', 'Kevin Nguyen',
];

const NUM_ROWS = 8;

// Default pairings (can be changed via dropdowns)
const INITIAL_ROW_ASSIGNMENTS: { operator: string | null; helper: string | null }[] = [
  { operator: 'Mike Rodriguez', helper: 'Carlos Mendez' },
  { operator: 'Juan Salazar', helper: 'David Torres' },
  { operator: 'Tony Martinez', helper: 'Alex Reyes' },
  { operator: 'Eddie Lopez', helper: 'Marco Flores' },
  { operator: 'Chris Johnson', helper: 'Ryan Mitchell' },
  { operator: 'Robert Garcia', helper: 'Luis Hernandez' },
  { operator: 'James Wilson', helper: 'Daniel Ortiz' },
  { operator: 'Steven Kim', helper: 'Kevin Nguyen' },
];

// Mock salesmen
const SALESMEN = ['Robert Altamirano', 'Michael Chen'];

// ─── INITIAL MOCK DATA ──────────────────────────────────────────────────

const INITIAL_OPERATOR_JOBS: Record<number, JobCardData[]> = {
  0: [
    {
      id: '1', job_number: 'JOB-2026-100234', customer_name: 'Memorial Hospital', job_type: 'Core Drilling',
      location: 'Memorial Hermann - TMC', address: '6411 Fannin St, Houston TX', equipment_needed: ['HCD', 'CS-14', 'DPP'],
      description: '12 cores for new HVAC penetrations, floors 3-5', scheduled_date: '2026-03-10', end_date: '2026-03-12',
      arrival_time: '06:00', is_will_call: false, difficulty_rating: 6, notes_count: 3, change_requests_count: 0,
      helper_names: ['Carlos Mendez'], po_number: 'MH-2026-4412', day_label: 'Day 2 of 3',
    },
  ],
  1: [
    {
      id: '3', job_number: 'JOB-2026-100240', customer_name: 'TxDOT - HWY 59 Bridge', job_type: 'Slab Sawing',
      location: 'HWY 59 Overpass at Shepherd', address: 'US-59 at Shepherd Dr, Houston TX', equipment_needed: ['DFS', 'DPP', 'GPP'],
      description: 'Full depth cuts for bridge deck replacement - 850 linear ft', scheduled_date: '2026-03-08', end_date: '2026-03-14',
      arrival_time: '05:30', is_will_call: false, difficulty_rating: 9, notes_count: 7, change_requests_count: 1,
      helper_names: ['David Torres'], po_number: 'DOT-HWY59-2026', day_label: 'Day 3 of 7',
    },
  ],
  2: [],
  3: [],
  4: [
    {
      id: '5', job_number: 'JOB-2026-100260', customer_name: 'Hensel Phelps', job_type: 'Core Drilling, GPR Scanning',
      location: 'NRG Stadium - Suite Level', address: '1 NRG Pkwy, Houston TX', equipment_needed: ['ECD', 'GPR'],
      description: 'GPR scan and core 8 locations for new suite electrical', scheduled_date: '2026-03-10', end_date: '2026-03-11',
      arrival_time: '06:30', is_will_call: false, difficulty_rating: 7, notes_count: 2, change_requests_count: 0,
      helper_names: ['Ryan Mitchell'], po_number: 'HP-NRG-449', day_label: 'Day 1 of 2',
    },
  ],
  5: [
    {
      id: '6', job_number: 'JOB-2026-100265', customer_name: 'McCarthy Building', job_type: 'Wire Sawing',
      location: 'Texas Children\'s Hospital Expansion', address: '6621 Fannin St, Houston TX', equipment_needed: ['WS', 'HHS', 'DPP'],
      description: 'Wire saw column removal in new wing - structural concrete', scheduled_date: '2026-03-10', end_date: '2026-03-13',
      arrival_time: '06:00', is_will_call: false, difficulty_rating: 10, notes_count: 5, change_requests_count: 0,
      helper_names: ['Luis Hernandez'], po_number: 'MCB-TCH-2026', day_label: 'Day 1 of 4',
    },
  ],
  6: [
    {
      id: '7', job_number: 'JOB-2026-100270', customer_name: 'Skanska USA', job_type: 'Hand Sawing',
      location: 'MD Anderson - Pickens Tower', address: '1515 Holcombe Blvd, Houston TX', equipment_needed: ['HHS', 'ECD'],
      description: 'Precision hand saw cuts in existing patient rooms - night shift only', scheduled_date: '2026-03-10', end_date: null,
      arrival_time: '20:00', is_will_call: false, difficulty_rating: 8, notes_count: 4, change_requests_count: 1,
      helper_names: ['Daniel Ortiz'], po_number: 'SK-MDA-116', day_label: undefined,
    },
  ],
  7: [],
};

const INITIAL_UNASSIGNED: JobCardData[] = [
  {
    id: '8', job_number: 'JOB-2026-100275', customer_name: 'Office Park Renovation', job_type: 'Slab Sawing',
    location: 'Greenway Plaza - Building 9', address: '3831 Richmond Ave, Houston TX', equipment_needed: ['DFS', 'DPP'],
    description: 'Expansion joint cuts throughout parking garage', scheduled_date: '2026-03-10', end_date: null,
    arrival_time: null, is_will_call: false, difficulty_rating: 5, notes_count: 0, change_requests_count: 0,
    helper_names: [], po_number: 'OPR-GP9-221', day_label: undefined,
  },
  {
    id: '9', job_number: 'JOB-2026-100278', customer_name: 'Strip Mall Demolition', job_type: 'Wall Sawing, Demolition',
    location: 'Westheimer Strip Center', address: '8900 Westheimer Rd, Houston TX', equipment_needed: ['WS', 'TS', 'HHS'],
    description: 'Remove load-bearing wall sections for tenant renovation', scheduled_date: '2026-03-10', end_date: null,
    arrival_time: null, is_will_call: false, difficulty_rating: 6, notes_count: 0, change_requests_count: 0,
    helper_names: [], po_number: null, day_label: undefined,
  },
];

const INITIAL_PENDING: PendingJob[] = [
  { id: 'p1', job_number: 'SF-2026-0089', customer_name: 'Turner Construction', job_type: 'Core Drilling', location: 'UH Medical Center', equipment_needed: ['HCD', 'ECD', 'DPP'], description: '24 cores for MEP rough-in, multiple floors', submitted_by: 'Robert Altamirano', submitted_at: '2026-03-09T14:30:00', difficulty_rating: 7, is_will_call: false, scheduled_date: '2026-03-15' },
  { id: 'p2', job_number: 'SF-2026-0090', customer_name: 'Brasfield & Gorrie', job_type: 'Slab Sawing', location: 'Post Oak Blvd Development', equipment_needed: ['DFS', 'GPP'], description: 'Control joints for new retail space - 2000 sq ft', submitted_by: 'Michael Chen', submitted_at: '2026-03-09T16:15:00', difficulty_rating: 4, is_will_call: false, scheduled_date: '2026-03-17' },
  { id: 'p3', job_number: 'SF-2026-0091', customer_name: 'Clark Construction', job_type: 'GPR Scanning', location: 'Memorial City Mall Expansion', equipment_needed: ['GPR'], description: 'Full GPR survey of existing slab for rebar mapping', submitted_by: 'Robert Altamirano', submitted_at: '2026-03-10T08:00:00', difficulty_rating: 3, is_will_call: true, scheduled_date: null },
  { id: 'p4', job_number: 'SF-2026-0092', customer_name: 'DPR Construction', job_type: 'Wall Sawing, Core Drilling', location: 'Shell Tower - Downtown', equipment_needed: ['WS', 'ECD', 'TS'], description: 'New elevator shaft opening + core penetrations in existing tower', submitted_by: 'Michael Chen', submitted_at: '2026-03-10T09:45:00', difficulty_rating: 9, is_will_call: false, scheduled_date: '2026-03-18' },
  { id: 'p5', job_number: 'SF-2026-0093', customer_name: 'Tellepsen Builders', job_type: 'Demolition', location: 'HISD Elementary School', equipment_needed: ['HHS', 'DPP'], description: 'Selective demo of concrete partitions for classroom expansion', submitted_by: 'Robert Altamirano', submitted_at: '2026-03-10T10:30:00', difficulty_rating: 5, is_will_call: false, scheduled_date: '2026-03-19' },
];

const INITIAL_WILL_CALL: JobCardData[] = [
  { id: 'wc1', job_number: 'JOB-2026-100245', customer_name: 'Cadence McShane', job_type: 'Core Drilling', location: 'Heights Mixed-Use Project', address: '1200 Yale St, Houston TX', equipment_needed: ['ECD', 'CS-14'], description: 'Utility penetrations for new mixed-use building', scheduled_date: '2026-03-14', end_date: null, arrival_time: null, is_will_call: true, difficulty_rating: 4, notes_count: 1, change_requests_count: 0, helper_names: [], po_number: 'CMS-HTS-901', day_label: undefined },
  { id: 'wc2', job_number: 'JOB-2026-100248', customer_name: 'Swinerton', job_type: 'Slab Sawing', location: 'The Woodlands Town Center', address: '9400 Grogans Mill Rd, The Woodlands TX', equipment_needed: ['DFS'], description: 'Trench cuts for underground conduit', scheduled_date: '2026-03-16', end_date: null, arrival_time: null, is_will_call: true, difficulty_rating: 3, notes_count: 0, change_requests_count: 0, helper_names: [], po_number: null, day_label: undefined },
  { id: 'wc3', job_number: 'JOB-2026-100252', customer_name: 'Vaughn Construction', job_type: 'Hand Sawing', location: 'Rice University - Science Building', address: '6100 Main St, Houston TX', equipment_needed: ['HHS'], description: 'Precision cuts in lab spaces - dust containment required', scheduled_date: '2026-03-18', end_date: null, arrival_time: null, is_will_call: true, difficulty_rating: 6, notes_count: 2, change_requests_count: 0, helper_names: [], po_number: 'VC-RICE-330', day_label: undefined },
  { id: 'wc4', job_number: 'JOB-2026-100258', customer_name: 'Balfour Beatty', job_type: 'Wire Sawing', location: 'Hobby Airport - Terminal Expansion', address: '7800 Airport Blvd, Houston TX', equipment_needed: ['WS', 'DPP'], description: 'Large opening cuts for new jet bridge connections', scheduled_date: '2026-03-20', end_date: '2026-03-22', arrival_time: null, is_will_call: true, difficulty_rating: 8, notes_count: 0, change_requests_count: 0, helper_names: [], po_number: 'BB-HOU-AIR', day_label: undefined },
];

const WILL_CALL_ADDED: Record<string, string> = {
  wc1: '2026-03-02',
  wc2: '2026-03-04',
  wc3: '2026-03-06',
  wc4: '2026-03-07',
};

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

let nextId = 100;
const genId = () => `gen-${nextId++}`;

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

// ─── Main Component ─────────────────────────────────────────────────────
export default function ScheduleBoardPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState('2026-03-10');
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [canEdit, setCanEdit] = useState(true);

  // ═══ DATA STATE (mock — will become API calls) ═══
  const [operatorJobs, setOperatorJobs] = useState<Record<number, JobCardData[]>>(INITIAL_OPERATOR_JOBS);
  const [unassignedJobs, setUnassignedJobs] = useState<JobCardData[]>(INITIAL_UNASSIGNED);
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>(INITIAL_PENDING);
  const [willCallJobs, setWillCallJobs] = useState<JobCardData[]>(INITIAL_WILL_CALL);
  const [willCallDates, setWillCallDates] = useState<Record<string, string>>(WILL_CALL_ADDED);
  const [jobNotes, setJobNotes] = useState<Record<string, NoteData[]>>({});

  // ═══ ROW ASSIGNMENTS — who's in which crew row ═══
  const [rowAssignments, setRowAssignments] = useState(INITIAL_ROW_ASSIGNMENTS);

  // ═══ UI STATE ═══
  const [showPendingQueue, setShowPendingQueue] = useState(false);
  const [showWillCall, setShowWillCall] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  // Modal states
  const [approvalTarget, setApprovalTarget] = useState<PendingJob | null>(null);
  const [missingInfoTarget, setMissingInfoTarget] = useState<PendingJob | null>(null);
  const [assignTarget, setAssignTarget] = useState<{ job: JobCardData; source: 'unassigned' | 'willcall' } | null>(null);
  const [editTarget, setEditTarget] = useState<{ job: JobCardData; rowIndex: number | null } | null>(null);
  const [changeRequestTarget, setChangeRequestTarget] = useState<JobCardData | null>(null);
  const [notesTarget, setNotesTarget] = useState<JobCardData | null>(null);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);

  // Auth guard
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    if (!isAdmin()) { router.push('/dashboard'); return; }
  }, [router]);

  // ═══ TOAST HELPER ═══
  const addToast = useCallback((type: ToastData['type'], title: string, message?: string) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, title, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

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
  }, [operatorJobs, rowAssignments]);

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
  }, [operatorJobs, rowAssignments]);

  // ═══ COMPUTED STATS ═══
  const totalJobs = Object.values(operatorJobs).reduce((sum, jobs) => sum + jobs.length, 0) + unassignedJobs.length;
  const activeOperators = Object.entries(operatorJobs).filter(([, jobs]) => jobs.length > 0).length;
  const availableOperators = Object.entries(operatorJobs).filter(([, jobs]) => jobs.length === 0).length;
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
  const handleApprove = (data: { scheduledDate: string }) => {
    if (!approvalTarget) return;
    const job = approvalTarget;

    const newJob: JobCardData = {
      id: genId(),
      job_number: job.job_number.replace('SF-', 'JOB-'),
      customer_name: job.customer_name,
      job_type: job.job_type,
      location: job.location,
      address: '',
      equipment_needed: job.equipment_needed,
      description: job.description,
      scheduled_date: data.scheduledDate,
      end_date: null,
      arrival_time: null,
      is_will_call: job.is_will_call,
      difficulty_rating: job.difficulty_rating,
      notes_count: 0,
      change_requests_count: 0,
      helper_names: [],
      po_number: null,
      day_label: undefined,
    };

    setPendingJobs(prev => prev.filter(p => p.id !== job.id));

    if (job.is_will_call) {
      setWillCallJobs(prev => [...prev, newJob]);
      setWillCallDates(prev => ({ ...prev, [newJob.id]: toDateString(new Date()) }));
      addToast('success', `${job.customer_name} → Will Call`, 'Approved and added to Will Call folder');
    } else {
      setUnassignedJobs(prev => [...prev, newJob]);
      addToast('success', `${job.customer_name} → Approved`, 'Added to schedule — assign operator closer to start date');
    }

    setApprovalTarget(null);
    if (pendingJobs.length <= 1) setShowPendingQueue(false);
  };

  // --- Pending: Missing Info ---
  const handleMissingInfo = (missingItems: string[], customNote: string) => {
    if (!missingInfoTarget) return;
    setPendingJobs(prev => prev.filter(p => p.id !== missingInfoTarget.id));
    const itemList = missingItems.join(', ');
    addToast('info', `${missingInfoTarget.customer_name} — Missing Info`, `Salesman notified: ${itemList}`);
    setMissingInfoTarget(null);
    if (pendingJobs.length <= 1) setShowPendingQueue(false);
  };

  // --- Will Call: Move to Schedule ---
  const handleMoveWillCallToSchedule = (job: JobCardData) => {
    setWillCallJobs(prev => prev.filter(wc => wc.id !== job.id));
    const movedJob = { ...job, is_will_call: false, scheduled_date: selectedDate };
    setUnassignedJobs(prev => [...prev, movedJob]);
    addToast('success', `${job.customer_name} → Scheduled`, `Moved to ${formatDisplayDate(selectedDate)} (unassigned)`);
  };

  // ═══ ASSIGNMENT WITH CONFLICT DETECTION ═══

  // Helper: find the row for a given operator, or pick an empty row
  const findRowForOperator = (operatorName: string): number => {
    // Check if operator is already in a row
    const existingRow = rowAssignments.findIndex(r => r.operator === operatorName);
    if (existingRow !== -1) return existingRow;

    // Find first empty row (no operator and no jobs)
    for (let i = 0; i < NUM_ROWS; i++) {
      if (!rowAssignments[i].operator && (operatorJobs[i] || []).length === 0) return i;
    }

    // Fallback: find any row with no jobs
    for (let i = 0; i < NUM_ROWS; i++) {
      if ((operatorJobs[i] || []).length === 0) return i;
    }

    return -1; // all rows busy
  };

  // Assign job directly (no conflict)
  const proceedWithAssignment = (rowIndex: number, job: JobCardData, source: 'unassigned' | 'willcall', helperName: string | null) => {
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

  // Main assignment handler (from AssignOperatorModal)
  const handleAssignOperator = (operatorName: string, helperName: string | null) => {
    if (!assignTarget) return;
    const { job, source } = assignTarget;

    const targetRow = findRowForOperator(operatorName);
    if (targetRow === -1) {
      addToast('error', 'No Available Rows', 'All crew rows are full — remove a job first');
      setAssignTarget(null);
      return;
    }

    // Ensure this operator is set in the target row
    if (rowAssignments[targetRow].operator !== operatorName) {
      setRowAssignments(prev => prev.map((r, i) =>
        i === targetRow ? { operator: operatorName, helper: helperName } : r
      ));
    } else if (helperName && rowAssignments[targetRow].helper !== helperName) {
      setRowAssignments(prev => prev.map((r, i) =>
        i === targetRow ? { ...r, helper: helperName } : r
      ));
    }

    // Check conflict: does this operator already have jobs?
    const existingJobs = operatorJobs[targetRow] || [];
    if (existingJobs.length > 0) {
      // CONFLICT — show modal
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

    // No conflict — assign directly
    proceedWithAssignment(targetRow, job, source, helperName);
    setAssignTarget(null);
  };

  // Conflict: Add as 2nd job
  const handleConflictAddSecondJob = () => {
    if (!conflictData) return;
    const { targetRowIndex, newJob, newJobSource, helperName } = conflictData;
    proceedWithAssignment(targetRowIndex, newJob, newJobSource, helperName);
    setConflictData(null);
  };

  // Conflict: Move operator to new job (old jobs → unassigned)
  const handleConflictMoveToJob = () => {
    if (!conflictData) return;
    const { targetRowIndex, newJob, newJobSource, helperName } = conflictData;

    // Move existing jobs from this row to unassigned
    const existingJobs = operatorJobs[targetRowIndex] || [];
    if (existingJobs.length > 0) {
      setUnassignedJobs(prev => [...prev, ...existingJobs.map(j => ({ ...j, helper_names: [] }))]);
      setOperatorJobs(prev => ({ ...prev, [targetRowIndex]: [] }));
    }

    // Now assign the new job
    proceedWithAssignment(targetRowIndex, newJob, newJobSource, helperName);
    setConflictData(null);
  };

  // --- Edit Job: Save ---
  const handleEditSave = (updates: Partial<JobCardData> & { newOperatorName?: string | null; newHelperName?: string | null }) => {
    if (!editTarget) return;
    const { job, rowIndex: currentRowIdx } = editTarget;
    const newOpName = updates.newOperatorName;
    const newHelperName = updates.newHelperName;

    // Clean operator fields from the job updates
    const jobUpdates = { ...updates };
    delete (jobUpdates as any).newOperatorName;
    delete (jobUpdates as any).newHelperName;

    // Check if operator changed
    const currentOp = currentRowIdx !== null ? rowAssignments[currentRowIdx]?.operator : null;
    const operatorChanged = newOpName !== undefined && newOpName !== currentOp;

    if (operatorChanged) {
      // Remove from current row
      if (currentRowIdx !== null) {
        setOperatorJobs(prev => ({
          ...prev,
          [currentRowIdx]: (prev[currentRowIdx] || []).filter(j => j.id !== job.id),
        }));
      } else {
        setUnassignedJobs(prev => prev.filter(u => u.id !== job.id));
      }

      if (newOpName) {
        // Moving to a named operator
        const targetRow = findRowForOperator(newOpName);
        if (targetRow !== -1) {
          // Ensure operator is set in row
          if (rowAssignments[targetRow].operator !== newOpName) {
            setRowAssignments(prev => prev.map((r, i) =>
              i === targetRow ? { operator: newOpName, helper: newHelperName ?? r.helper } : r
            ));
          }

          const updatedJob = {
            ...job,
            ...jobUpdates,
            helper_names: newHelperName ? [newHelperName] : [],
          };

          // Check for conflict
          const existingJobs = operatorJobs[targetRow] || [];
          if (existingJobs.length > 0 && targetRow !== currentRowIdx) {
            // Conflict — for edit, just add as 2nd job (simpler flow)
            setOperatorJobs(prev => ({
              ...prev,
              [targetRow]: [...(prev[targetRow] || []), updatedJob],
            }));
            addToast('info', 'Job Updated', `${job.customer_name} added as 2nd job for ${newOpName}`);
          } else {
            setOperatorJobs(prev => ({
              ...prev,
              [targetRow]: [...(prev[targetRow] || []), updatedJob],
            }));
            addToast('success', 'Job Updated', `${job.customer_name} moved to ${newOpName}`);
          }
        }
      } else {
        // Moving to unassigned
        const updatedJob = { ...job, ...jobUpdates, helper_names: [] };
        setUnassignedJobs(prev => [...prev, updatedJob]);
        addToast('success', 'Job Updated', `${job.customer_name} moved to unassigned`);
      }
    } else {
      // No operator change — update in place
      const updatedJob = {
        ...job,
        ...jobUpdates,
        helper_names: newHelperName !== undefined ? (newHelperName ? [newHelperName] : []) : job.helper_names,
      };

      // Update helper in row assignment if changed
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

  // --- Change Request (salesman) ---
  const handleChangeRequest = (data: { type: string; description: string }) => {
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

    addToast('success', 'Change Request Submitted', `${changeRequestTarget.customer_name} — Ops Manager will review`);
    setChangeRequestTarget(null);
  };

  // --- Notes ---
  const handleViewNotes = (job: JobCardData) => {
    if (!jobNotes[job.id]) {
      setJobNotes(prev => ({ ...prev, [job.id]: getNotesForJob(job.id) }));
    }
    setNotesTarget(job);
  };

  const handleAddNote = (text: string) => {
    if (!notesTarget) return;
    const newNote: NoteData = {
      id: `note-${Date.now()}`,
      author: 'You',
      text,
      timestamp: new Date().toISOString(),
    };
    setJobNotes(prev => ({
      ...prev,
      [notesTarget.id]: [...(prev[notesTarget.id] || []), newNote],
    }));

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

  // --- Remove from schedule ---
  const handleRemoveFromSchedule = () => {
    if (!editTarget) return;
    const { job, rowIndex } = editTarget;
    if (rowIndex !== null) {
      setOperatorJobs(prev => ({
        ...prev,
        [rowIndex]: (prev[rowIndex] || []).filter(j => j.id !== job.id),
      }));
    } else {
      setUnassignedJobs(prev => prev.filter(u => u.id !== job.id));
    }
    addToast('info', `${job.customer_name} — Removed`, 'Job removed from schedule');
    setEditTarget(null);
  };

  // --- Make will call ---
  const handleMakeWillCall = () => {
    if (!editTarget) return;
    const { job, rowIndex } = editTarget;
    if (rowIndex !== null) {
      setOperatorJobs(prev => ({
        ...prev,
        [rowIndex]: (prev[rowIndex] || []).filter(j => j.id !== job.id),
      }));
    } else {
      setUnassignedJobs(prev => prev.filter(u => u.id !== job.id));
    }
    setWillCallJobs(prev => [...prev, { ...job, is_will_call: true }]);
    setWillCallDates(prev => ({ ...prev, [job.id]: toDateString(new Date()) }));
    addToast('success', `${job.customer_name} → Will Call`, 'Moved to Will Call folder');
    setEditTarget(null);
  };

  // --- Assign job to available operator ---
  const handleAssignToAvailableOperator = (rowIndex: number) => {
    if (unassignedJobs.length > 0) {
      setAssignTarget({ job: unassignedJobs[0], source: 'unassigned' });
    } else if (willCallJobs.length > 0) {
      setAssignTarget({ job: willCallJobs[0], source: 'willcall' });
    } else {
      addToast('info', 'No Jobs Available', 'No unassigned or will-call jobs to assign');
    }
  };

  // --- Row dropdown: change operator ---
  const handleChangeRowOperator = (rowIndex: number, newOperator: string | null) => {
    setRowAssignments(prev => prev.map((r, i) =>
      i === rowIndex ? { ...r, operator: newOperator } : r
    ));
  };

  // --- Row dropdown: change helper ---
  const handleChangeRowHelper = (rowIndex: number, newHelper: string | null) => {
    setRowAssignments(prev => prev.map((r, i) =>
      i === rowIndex ? { ...r, helper: newHelper } : r
    ));
  };

  // --- Quick Add ---
  const handleQuickAdd = (data: { salesmanName: string; startDate: string; contractorName: string }) => {
    const newPending: PendingJob = {
      id: `qa-${genId()}`,
      job_number: `QA-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      customer_name: data.contractorName,
      job_type: 'TBD',
      location: 'TBD',
      equipment_needed: [],
      description: null,
      submitted_by: data.salesmanName,
      submitted_at: new Date().toISOString(),
      difficulty_rating: null,
      is_will_call: false,
      scheduled_date: data.startDate,
    };
    setPendingJobs(prev => [...prev, newPending]);
    addToast('success', `Quick Add: ${data.contractorName}`, `Pending — reminder sent to ${data.salesmanName} to fill full form`);
    setShowQuickAdd(false);
  };

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
                  {canEdit ? 'Manage assignments, approvals & dispatch' : 'View scheduled jobs'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              <button onClick={() => setShowPendingQueue(true)} className="relative px-3 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl text-orange-700 text-sm font-semibold transition-all flex items-center gap-2">
                <Bell className="w-4 h-4" /> Pending
                {pendingJobs.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{pendingJobs.length}</span>
                )}
              </button>

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
                    onClick={() => setShowQuickAdd(true)}
                    className="px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md"
                  >
                    <Plus className="w-4 h-4" /> Quick Add
                  </button>
                  <button className="px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md">
                    <Send className="w-4 h-4" /> Send
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
            <div className="flex items-center gap-3">
              <button onClick={goToPreviousDay} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all hover:scale-105"><ChevronLeft className="w-5 h-5 text-gray-700" /></button>
              <div className="flex items-center gap-3 bg-gray-50 px-5 py-3 rounded-xl border border-gray-200">
                <Calendar className="w-5 h-5 text-purple-600" />
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Viewing</div>
                  <span className="text-lg font-bold text-gray-900">{formatDisplayDate(selectedDate)}</span>
                </div>
              </div>
              <button onClick={goToNextDay} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all hover:scale-105"><ChevronRight className="w-5 h-5 text-gray-700" /></button>
            </div>

            <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setViewMode('day')} className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${viewMode === 'day' ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}>
                <LayoutGrid className="w-4 h-4" /> Day View
              </button>
              <button onClick={() => setViewMode('week')} className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${viewMode === 'week' ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}>
                <CalendarDays className="w-4 h-4" /> Week View
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-xl border border-purple-200">
                <UserCheck className="w-4 h-4 text-purple-600" />
                <div>
                  <div className="text-[10px] font-bold text-purple-500 uppercase">Active</div>
                  <div className="text-lg font-bold text-gray-900">{activeOperators}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl border border-green-200">
                <UserX className="w-4 h-4 text-green-600" />
                <div>
                  <div className="text-[10px] font-bold text-green-500 uppercase">Available</div>
                  <div className="text-lg font-bold text-gray-900">{availableOperators}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl border border-blue-200">
                <Package className="w-4 h-4 text-blue-600" />
                <div>
                  <div className="text-[10px] font-bold text-blue-500 uppercase">Jobs</div>
                  <div className="text-lg font-bold text-gray-900">{totalJobs}</div>
                </div>
              </div>
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
                  const daysWaiting = willCallDates[job.id] ? daysAgo(willCallDates[job.id]) : 0;
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
                          Tentative: {parseLocalDate(job.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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

      {/* ═══ DAY VIEW — OPERATOR ROWS ════════════════════════════════════ */}
      <div className="container mx-auto px-4 md:px-6 pb-6 space-y-4">
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
            allOperators={ALL_OPERATORS}
            allHelpers={ALL_HELPERS}
            busyOperators={busyOperators}
            busyHelpers={busyHelpers}
            onEditJob={(job) => canEdit ? setEditTarget({ job, rowIndex: idx }) : setChangeRequestTarget(job)}
            onRequestChange={(job) => setChangeRequestTarget(job)}
            onViewNotes={(job) => handleViewNotes(job)}
            onAssignJob={() => handleAssignToAvailableOperator(idx)}
            onChangeOperator={(name) => handleChangeRowOperator(idx, name)}
            onChangeHelper={(name) => handleChangeRowHelper(idx, name)}
          />
        ))}

        {/* ═══ UNASSIGNED SECTION ═══════════════════════════════════════ */}
        {unassignedJobs.length > 0 && (
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
                  <div key={job.id} className="rounded-xl border-2 border-orange-200 bg-orange-50/50 p-4 hover:shadow-md transition-all">
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
                        onClick={() => setAssignTarget({ job, source: 'unassigned' })}
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
      </div>

      {/* ═══ PENDING QUEUE SIDEBAR ══════════════════════════════════════ */}
      <PendingQueueSidebar
        open={showPendingQueue}
        onClose={() => setShowPendingQueue(false)}
        pendingJobs={pendingJobs}
        onApprove={(job) => { setShowPendingQueue(false); setApprovalTarget(job); }}
        onMissingInfo={(job) => { setShowPendingQueue(false); setMissingInfoTarget(job); }}
      />

      {/* ═══ MODALS ════════════════════════════════════════════════════ */}

      {approvalTarget && (
        <ApprovalModal
          job={approvalTarget}
          onConfirm={handleApprove}
          onClose={() => setApprovalTarget(null)}
        />
      )}

      {missingInfoTarget && (
        <MissingInfoModal
          job={missingInfoTarget}
          onConfirm={handleMissingInfo}
          onClose={() => setMissingInfoTarget(null)}
        />
      )}

      {assignTarget && (
        <AssignOperatorModal
          job={assignTarget.job}
          allOperators={ALL_OPERATORS}
          allHelpers={ALL_HELPERS}
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
          allOperators={ALL_OPERATORS}
          allHelpers={ALL_HELPERS}
          currentOperatorName={editTarget.rowIndex !== null ? rowAssignments[editTarget.rowIndex]?.operator ?? null : null}
          currentHelperName={editTarget.rowIndex !== null ? rowAssignments[editTarget.rowIndex]?.helper ?? null : null}
          busyOperators={busyOperators}
          busyHelpers={busyHelpers}
          onSave={handleEditSave}
          onClose={() => setEditTarget(null)}
          onViewNotes={() => { setEditTarget(null); handleViewNotes(editTarget.job); }}
          onMakeWillCall={handleMakeWillCall}
          onRemoveFromSchedule={handleRemoveFromSchedule}
        />
      )}

      {changeRequestTarget && (
        <ChangeRequestModal
          job={changeRequestTarget}
          onSubmit={handleChangeRequest}
          onClose={() => setChangeRequestTarget(null)}
        />
      )}

      {notesTarget && (
        <NotesDrawer
          job={notesTarget}
          notes={jobNotes[notesTarget.id] || getNotesForJob(notesTarget.id)}
          onAddNote={handleAddNote}
          onClose={() => setNotesTarget(null)}
        />
      )}

      {showQuickAdd && (
        <QuickAddModal
          salesmen={SALESMEN}
          onSubmit={handleQuickAdd}
          onClose={() => setShowQuickAdd(false)}
        />
      )}

      {/* ═══ CONFLICT MODAL ════════════════════════════════════════════ */}
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

      {/* ═══ TOASTS ═══════════════════════════════════════════════════ */}
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* ═══ ROLE TOGGLE ══════════════════════════════════════════════ */}
      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={() => setCanEdit(!canEdit)}
          className={`px-4 py-2 rounded-xl text-sm font-bold shadow-lg transition-all ${canEdit ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          <Eye className="w-4 h-4 inline mr-1.5" />
          {canEdit ? 'Super Admin View' : 'Salesman View (Read-Only)'}
        </button>
      </div>
    </div>
  );
}
