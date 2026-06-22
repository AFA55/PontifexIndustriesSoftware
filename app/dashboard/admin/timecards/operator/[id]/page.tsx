'use client';

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Clock, Calendar, ArrowLeft, FileText, CheckCircle, Check,
  ChevronLeft, ChevronRight, Edit, XCircle, Moon, Factory,
  Briefcase, AlertTriangle, TrendingUp, Loader2, MapPin,
  ExternalLink, Users, Shield, MessageSquare, Send, Coffee,
  Navigation, Hammer, Flag, X, Save, ChevronDown, ChevronUp,
  RefreshCw, DollarSign, Zap, Timer, Camera, Plus, Minus
} from 'lucide-react';
import { getCurrentUser, isAdmin, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getGoogleMapsLink } from '@/lib/geolocation';
import { defaultLunchMinutes } from '@/lib/lunch';
import UserAvatar from '@/components/UserAvatar';

// ── Types ─────────────────────────────────────────────────────
interface OperatorInfo {
  id: string;
  full_name: string;
  email: string;
  role: string;
  phone: string | null;
  avatar_url: string | null;
}

interface GpsLog {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  event_type: string;
  timestamp: string;
}

interface Coworker {
  user_id: string;
  full_name: string;
}

interface TimecardEntry {
  id: string;
  user_id: string;
  date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  total_hours: number | null;
  gross_hours?: number | null;
  lunch_duration_minutes?: number | null;
  auto_lunch_applied?: boolean | null;
  is_approved: boolean;
  is_shop_hours: boolean;
  is_night_shift: boolean;
  hour_type: string;
  notes: string | null;
  admin_notes: string | null;
  employee_notes: string | null;
  entry_type: string;
  break_minutes: number;
  segments: any[];
  coworkers: any[];
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
  clock_in_gps_lat: number | null;
  clock_in_gps_lng: number | null;
  clock_out_gps_lat: number | null;
  clock_out_gps_lng: number | null;
  nfc_clock_in: boolean;
  nfc_clock_out: boolean;
  is_late?: boolean | null;
  late_minutes?: number | null;
  scheduled_start_time?: string | null;
  clock_in_method: string | null;
  requires_approval: boolean | null;
  remote_verified: boolean | null;
  remote_photo_url: string | null;
  clock_out_photo_url: string | null;
  // Short-lived signed URLs minted server-side for the PRIVATE timecard-photos
  // bucket. Render these (NOT the raw *_photo_url path, which is not viewable).
  remote_photo_signed_url: string | null;
  clock_out_photo_signed_url: string | null;
  clock_out_outside_radius: boolean | null;
  clock_out_verified: boolean | null;
  job_order_id: string | null;
  job_number: string | null;
  job_customer_name: string | null;
  job_title: string | null;
  gps_logs: GpsLog[];
  found_coworkers: Coworker[];
  // Night shift premium fields
  night_shift_premium_hours?: number | null;
  pay_type_override?: string | null;
  regular_hours?: number | null;
  overtime_hours?: number | null;
  double_time_hours?: number | null;
  labor_cost?: number | null;
}

interface WeekStats {
  totalHours: number;
  regularHours: number;
  weeklyOTHours: number;
  mandatoryOTHours: number;
  nightShiftHours: number;
  nightShiftPremiumHours: number;
  shopHours: number;
  daysWorked: number;
  breakMinutes: number;
  approvedCount: number;
  pendingCount: number;
  totalEntries: number;
  effectiveTotalPay?: number;
  punctuality?: {
    lateCountMonth: number;
    avgMinutesLate: number;
    lastLateDate: string | null;
    weekLateCount?: number;
    weekLateMinutes?: number;
    monthLateCount?: number;
    monthLateMinutes?: number;
    ytdLateCount?: number;
    ytdLateMinutes?: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────
function getWeekStart(offset: number): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}

function formatWeekRange(weekStart: string): string {
  const mon = new Date(weekStart + 'T00:00:00');
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const s = mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${s} - ${e}`;
}

function formatDate(dateString: string) {
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDayName(dateString: string) {
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
}

// Segment type colors for timeline
const SEGMENT_COLORS: Record<string, { bg: string; label: string; icon: any }> = {
  in_route: { bg: 'bg-blue-500', label: 'In Route', icon: Navigation },
  on_site: { bg: 'bg-yellow-500', label: 'On Site', icon: MapPin },
  working: { bg: 'bg-emerald-500', label: 'Working', icon: Hammer },
  complete: { bg: 'bg-slate-400', label: 'Complete', icon: Flag },
  break: { bg: 'bg-orange-400', label: 'Break', icon: Coffee },
};

// Entry type badge styling
const ENTRY_TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  regular: { bg: 'bg-emerald-50 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  overtime: { bg: 'bg-orange-50 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  double_time: { bg: 'bg-red-50 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
  time_off: { bg: 'bg-purple-50 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  holiday: { bg: 'bg-cyan-50 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300' },
  no_call_no_show: { bg: 'bg-red-50 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
  late: { bg: 'bg-amber-50 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
};

// Pay type override options
const PAY_TYPE_OPTIONS = [
  { value: '', label: 'Auto (system calculates)' },
  { value: 'regular', label: 'Regular' },
  { value: 'night_shift_premium', label: 'Night Shift Premium' },
  { value: 'overtime', label: 'Overtime' },
  { value: 'double_time', label: 'Double Time' },
  { value: 'mandatory_overtime', label: 'Mandatory OT' },
];

// ── Pay type badge helper ──────────────────────────────────────
function getPayTypeBadge(entry: TimecardEntry, weekRunningHours: number) {
  const override = entry.pay_type_override;
  const isNightShift = entry.is_night_shift;
  const nsHours = Number(entry.night_shift_premium_hours) || 0;
  const otHours = Number(entry.overtime_hours) || 0;
  const dtHours = Number(entry.double_time_hours) || 0;

  // Manual override
  if (override) {
    const overrideMap: Record<string, { label: string; className: string }> = {
      regular: { label: 'Regular', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
      night_shift_premium: { label: 'Night Shift Premium', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
      overtime: { label: 'Overtime (Override)', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
      double_time: { label: 'Double Time (Override)', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
      mandatory_overtime: { label: 'Mandatory OT (Override)', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
    };
    const o = overrideMap[override] || { label: override, className: 'bg-gray-500/10 text-gray-400 border-gray-500/20' };
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${o.className}`}>
        <Zap size={8} />
        {o.label}
      </span>
    );
  }

  // Night shift that crossed into OT
  if (isNightShift && nsHours > 0 && otHours > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">
        <Moon size={8} />
        Night Shift + OT
      </span>
    );
  }

  // Pure night shift premium
  if (isNightShift && nsHours > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
        <Moon size={8} />
        Night Shift Premium
      </span>
    );
  }

  // Double time
  if (dtHours > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
        <TrendingUp size={8} />
        Double Time
      </span>
    );
  }

  // Overtime
  if (otHours > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <TrendingUp size={8} />
        Overtime
      </span>
    );
  }

  // Regular
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <CheckCircle size={8} />
      Regular
    </span>
  );
}

// ── Split Date + Time picker ──────────────────────────────────
// Replaces the native <input type="datetime-local"> which has known click-
// registration bugs in some browsers (especially the wheel spinner on Mac
// where tapping "6" can register as "10"). Splitting into a date input
// (reliable across all browsers) + an HTML time input (12h-aware) gives
// predictable behavior + better mobile UX.
function SplitDateTimePicker({
  value, onChange, accent = 'blue', allowEmpty = false,
}: {
  value: string;            // ISO timestamp or '' / null when allowEmpty
  onChange: (iso: string) => void;
  accent?: 'blue' | 'emerald' | 'violet';
  allowEmpty?: boolean;
}) {
  const ring = accent === 'emerald' ? 'focus:ring-emerald-500/20 focus:border-emerald-500 dark:focus:border-emerald-400' :
               accent === 'violet'  ? 'focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-violet-400' :
                                      'focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400';

  // Parse local-date + local-time from the ISO string (in browser-local TZ).
  const [localDate, localTime] = useMemo(() => {
    if (!value) return ['', ''];
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return ['', ''];
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return [`${yyyy}-${mm}-${dd}`, `${hh}:${mi}`];
  }, [value]);

  function pushChange(date: string, time: string) {
    if (!date && !time) {
      if (allowEmpty) onChange('');
      return;
    }
    if (!date || !time) return; // need both
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    if ([y, mo, d, h, mi].some(n => Number.isNaN(n))) return;
    const local = new Date(y, mo - 1, d, h, mi, 0, 0);
    onChange(local.toISOString());
  }

  const inputClass = `w-full px-4 py-3.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-base text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 hover:border-slate-300 dark:hover:border-white/20 focus:ring-2 transition-all duration-200 ${ring}`;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          <Calendar size={12} /> Date
        </label>
        <input
          type="date"
          value={localDate}
          onChange={(e) => pushChange(e.target.value, localTime || '08:00')}
          className={inputClass}
          aria-label="Date"
        />
      </div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          <Clock size={12} /> Time
        </label>
        <input
          type="time"
          value={localTime}
          step={60}
          onChange={(e) => pushChange(localDate, e.target.value)}
          className={inputClass}
          aria-label="Time"
        />
      </div>
      {allowEmpty && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="col-span-2 text-xs text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 underline self-start"
        >
          Clear (still on shift)
        </button>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────
function OperatorTimecardDetailPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const operatorId = params.id as string;
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [operator, setOperator] = useState<OperatorInfo | null>(null);
  const [entries, setEntries] = useState<TimecardEntry[]>([]);
  const [stats, setStats] = useState<WeekStats | null>(null);
  const [weekStatus, setWeekStatus] = useState<string>('draft');
  const [weekStart, setWeekStart] = useState<string>(() => {
    return searchParams.get('weekStart') || getWeekStart(0);
  });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimecardEntry | null>(null);
  const [editFormData, setEditFormData] = useState({
    clock_in_time: '',
    clock_out_time: '',
    notes: '',
    pay_type_override: '' as string, // '' = Auto/null
    is_night_shift: false,
    pay_category: 'regular' as string,
    is_shop_time: false,
    lunch_duration_minutes: 30,
    lunch_override_reason: '',
  });
  const [editSaving, setEditSaving] = useState(false);

  // Notes
  const [weekNotes, setWeekNotes] = useState('');
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Night shift multiplier (fetched from settings for display)
  const [nightShiftMultiplier, setNightShiftMultiplier] = useState(1.25);

  // Subsistence (per-diem) nights for the displayed week + tenant rate.
  // Nights are sourced from the separate subsistence_nights table (OT-exempt).
  const [subsistenceNights, setSubsistenceNights] = useState<string[]>([]); // night_date list (YYYY-MM-DD)
  const [subsistenceRate, setSubsistenceRate] = useState(0);
  const [subsistenceSaving, setSubsistenceSaving] = useState(false);

  // Manual entry (PTO / sick / holiday / manual / called-out) — for days
  // with no clock-in. Wired to POST /api/admin/timecards/manual.
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualDate, setManualDate] = useState<string>('');
  const [manualType, setManualType] = useState<'pto' | 'sick' | 'holiday' | 'manual' | 'admin_adjustment'>('pto');
  const [manualHours, setManualHours] = useState<string>('8');
  const [manualStartTime, setManualStartTime] = useState<string>('07:00');
  const [manualEndTime, setManualEndTime] = useState<string>('15:30');
  const [manualNotes, setManualNotes] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // PTO balance (allocated / used / remaining / callouts) for THIS operator
  const [ptoBalance, setPtoBalance] = useState<{
    allocated: number;
    used: number;
    callouts: number;
  } | null>(null);
  const [ptoEditing, setPtoEditing] = useState(false);
  const [ptoInput, setPtoInput] = useState('');
  const [ptoSaving, setPtoSaving] = useState(false);

  async function savePtoAllocation() {
    const days = Number(ptoInput);
    if (!Number.isFinite(days) || days < 0) return;
    setPtoSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/operators/pto-balance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ operatorId, ptoDaysAllocated: days, year: new Date().getFullYear() }),
      });
      if (res.ok) {
        setPtoBalance((prev) => (prev ? { ...prev, allocated: days } : { allocated: days, used: 0, callouts: 0 }));
        setPtoEditing(false);
      }
    } finally {
      setPtoSaving(false);
    }
  }

  const isRedirecting = useRef(false);

  // Auth guard
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || !isAdmin()) {
      router.push('/dashboard');
      return;
    }
    setUser(currentUser);
  }, [router]);

  const redirectToLogin = useCallback(() => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    window.location.href = '/login';
  }, []);

  const getSessionToken = useCallback(async (): Promise<string | null> => {
    if (isRedirecting.current) return null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) { redirectToLogin(); return null; }
      return data.session.access_token;
    } catch { redirectToLogin(); return null; }
  }, [redirectToLogin]);

  // ── Fetch data ──────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const token = await getSessionToken();
      if (!token) return;

      const response = await fetch(
        `/api/admin/timecards/operator/${operatorId}?weekStart=${weekStart}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.status === 401) { redirectToLogin(); return; }
      if (response.status === 403) {
        setFetchError('You do not have permission to view this operator\'s timecards.');
        return;
      }
      if (response.status === 404) {
        setFetchError('Operator not found. The user may have been deactivated or does not exist.');
        return;
      }
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        setFetchError(errBody.error || `Server error (${response.status}). Please try again.`);
        return;
      }

      const result = await response.json();
      if (result.success) {
        setOperator(result.data.operator);
        setEntries(result.data.entries);
        setStats(result.data.stats);
        setWeekStatus(result.data.weekStatus);
        setWeekNotes(result.data.weekSummary?.notes || '');
      } else {
        setFetchError(result.error || 'Failed to load operator data.');
      }

      // Fetch PTO balance (separate endpoint, fire-and-forget). Not blocking.
      fetch(`/api/admin/operators/pto-balance?year=${new Date().getFullYear()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          if (!j?.data) return;
          const row = (j.data as any[]).find(r => r.operator_id === operatorId || r.id === operatorId);
          if (row) {
            setPtoBalance({
              allocated: Number(row.pto_days_allocated ?? 10),
              used: Number(row.pto_days_used ?? 0),
              callouts: Number(row.callout_count ?? 0),
            });
          }
        })
        .catch(() => {});
    } catch (error) {
      console.error('Error fetching operator data:', error);
      setFetchError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [operatorId, weekStart, getSessionToken, redirectToLogin]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  // ── Fetch night shift multiplier + subsistence rate from settings ──
  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase
        .from('timecard_settings_v2')
        .select('night_shift_multiplier, subsistence_rate')
        .limit(1)
        .single();
      if (data?.night_shift_multiplier) {
        setNightShiftMultiplier(Number(data.night_shift_multiplier));
      }
      setSubsistenceRate(Number(data?.subsistence_rate) || 0);
    };
    loadSettings().catch(() => {});
  }, []);

  // ── Subsistence nights for the displayed week (admin route, owned elsewhere) ──
  const fetchSubsistenceNights = useCallback(async () => {
    const token = await getSessionToken();
    if (!token) return;
    try {
      const res = await fetch(
        `/api/admin/subsistence-nights?operatorId=${operatorId}&weekStart=${weekStart}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const json = await res.json();
      const rows = (json?.data ?? json?.nights ?? []) as Array<{ night_date: string }>;
      setSubsistenceNights(rows.map(r => r.night_date).filter(Boolean));
    } catch {
      // Route/table may not be live yet — leave at 0 nights.
    }
  }, [operatorId, weekStart, getSessionToken]);

  useEffect(() => {
    if (user) fetchSubsistenceNights();
  }, [user, fetchSubsistenceNights]);

  // Admin override: add (+) or remove (-) a subsistence night for a given date.
  const adjustSubsistenceNight = async (action: 'add' | 'remove', nightDate: string) => {
    const token = await getSessionToken();
    if (!token) return;
    setSubsistenceSaving(true);
    try {
      const res = await fetch('/api/admin/subsistence-nights', {
        method: action === 'add' ? 'POST' : 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator_id: operatorId, night_date: nightDate }),
      });
      if (res.ok) {
        await fetchSubsistenceNights();
      }
    } catch {
      // ignore — non-blocking override
    } finally {
      setSubsistenceSaving(false);
    }
  };

  // ── Week navigation ─────────────────────────────────────────
  const navigateWeek = (direction: -1 | 1) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + direction * 7);
    const newStart = d.toISOString().split('T')[0];
    setWeekStart(newStart);
    // Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set('weekStart', newStart);
    window.history.replaceState({}, '', url.toString());
  };

  const isCurrentWeek = weekStart === getWeekStart(0);

  // ── Actions ─────────────────────────────────────────────────
  const handleApproveEntry = async (entryId: string) => {
    setActionLoading(entryId);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const response = await fetch(`/api/admin/timecards/${entryId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) fetchData();
    } catch (error) {
      console.error('Error approving entry:', error);
    } finally {
      setActionLoading(null);
    }
  };

  // Record a no-call/no-show for a specific empty day. Writes a zero-hour
  // no-show row to the timecard + the schedule/availability callout ledger via
  // the dedicated no-show API (NOT /manual, which forces 0.25–16 hrs).
  const handleNoShow = async (dateStr: string) => {
    const pretty = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (!window.confirm(`Mark a NO-SHOW for ${pretty}?\n\nThis records a zero-hour no-show on the timecard and counts as a callout.`)) return;
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetch('/api/admin/timecards/no-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ user_id: operatorId, date: dateStr }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        window.alert(j.error || 'Failed to record no-show.');
        return;
      }
      fetchData();
    } catch (error) {
      console.error('Error recording no-show:', error);
    }
  };

  // Approve / reject an out-of-radius (or remote) clock-out.
  const handleApproveClockOut = async (entryId: string, approved: boolean) => {
    setActionLoading(entryId);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const response = await fetch('/api/admin/timecards/clock-out-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ timecard_id: entryId, approved }),
      });
      if (response.ok) fetchData();
    } catch (error) {
      console.error('Error verifying clock-out:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveWeek = async () => {
    setActionLoading('approve_week');
    try {
      const token = await getSessionToken();
      if (!token) return;
      const response = await fetch(`/api/admin/timecards/operator/${operatorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ weekStart, action: 'approve_week', admin_notes: weekNotes })
      });
      if (response.ok) fetchData();
    } catch (error) {
      console.error('Error approving week:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectWeek = async () => {
    setActionLoading('reject_week');
    try {
      const token = await getSessionToken();
      if (!token) return;
      const response = await fetch(`/api/admin/timecards/operator/${operatorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ weekStart, action: 'reject_week', reason: rejectReason, admin_notes: weekNotes })
      });
      if (response.ok) {
        setShowRejectModal(false);
        setRejectReason('');
        fetchData();
      }
    } catch (error) {
      console.error('Error rejecting week:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const token = await getSessionToken();
      if (!token) return;
      await fetch(`/api/admin/timecards/operator/${operatorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ weekStart, admin_notes: weekNotes })
      });
    } catch (error) {
      console.error('Error saving notes:', error);
    } finally {
      setSavingNotes(false);
    }
  };

  const openEditModal = (entry: TimecardEntry) => {
    setSelectedEntry(entry);
    setEditFormData({
      clock_in_time: entry.clock_in_time,
      clock_out_time: entry.clock_out_time || '',
      notes: entry.admin_notes || entry.notes || '',
      pay_type_override: entry.pay_type_override || '',
      is_night_shift: entry.is_night_shift,
      pay_category: (entry as any).pay_category || 'regular',
      is_shop_time: (entry as any).is_shop_time || entry.is_shop_hours || false,
      // Lunch field — show the recorded lunch (prefer a non-zero value across the two
      // legacy columns, since `?? ` would surface a stale 0); else the role default.
      lunch_duration_minutes:
        ((entry as any).lunch_duration_minutes || (entry as any).break_minutes || 0) > 0
          ? ((entry as any).lunch_duration_minutes || (entry as any).break_minutes)
          : defaultLunchMinutes(operator?.role),
      lunch_override_reason: '',
    });
    setShowEditModal(true);
  };

  const handleUpdateEntry = async () => {
    if (!selectedEntry) return;
    setEditSaving(true);
    try {
      const token = await getSessionToken();
      if (!token) return;

      // Attempt the new per-entry endpoint first (handles both tables)
      const newPayload: Record<string, unknown> = {
        clock_in: editFormData.clock_in_time || undefined,
        clock_out: editFormData.clock_out_time || undefined,
        admin_notes: editFormData.notes,
        pay_category: editFormData.pay_category,
        is_shop_time: editFormData.is_shop_time,
        is_night_shift: editFormData.is_night_shift,
        pay_type_override: editFormData.pay_type_override || null,
        lunch_duration_minutes: editFormData.lunch_duration_minutes,
        lunch_override_reason: editFormData.lunch_override_reason || undefined,
      };
      const newRes = await fetch(`/api/admin/timecards/entries/${selectedEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(newPayload),
      });

      if (!newRes.ok) {
        // Fall back to legacy update endpoint
        const legacyPayload: Record<string, unknown> = {
          clock_in_time: editFormData.clock_in_time,
          clock_out_time: editFormData.clock_out_time,
          notes: editFormData.notes,
          is_night_shift: editFormData.is_night_shift,
          is_shop_hours: editFormData.is_shop_time,
          pay_type_override: editFormData.pay_type_override || null,
        };
        const legacyRes = await fetch(`/api/admin/timecards/${selectedEntry.id}/update`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(legacyPayload),
        });
        if (!legacyRes.ok) {
          const errBody = await legacyRes.json().catch(() => ({}));
          alert(`Error: ${errBody.error || 'Failed to update'}`);
          return;
        }
      }

      setShowEditModal(false);
      fetchData();
    } catch (error) {
      console.error('Error updating entry:', error);
    } finally {
      setEditSaving(false);
    }
  };

  // ── Recalculate week ────────────────────────────────────────
  const handleRecalculateWeek = async () => {
    setActionLoading('recalculate');
    try {
      const token = await getSessionToken();
      if (!token) return;
      const response = await fetch('/api/admin/timecards/recalculate-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: operatorId, weekStart })
      });
      if (response.ok) {
        await fetchData();
      } else {
        const err = await response.json();
        alert(`Recalculation failed: ${err.error}`);
      }
    } catch (error) {
      console.error('Error recalculating week:', error);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Group entries by day ────────────────────────────────────
  const entriesByDay = useMemo(() => {
    const grouped: Record<string, TimecardEntry[]> = {};
    // Initialize all 7 days of the week
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart + 'T00:00:00');
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      grouped[dateStr] = [];
    }
    entries.forEach(entry => {
      if (!grouped[entry.date]) grouped[entry.date] = [];
      grouped[entry.date].push(entry);
    });
    return grouped;
  }, [entries, weekStart]);

  // Running weekly total per entry (for 40hr crossover display)
  const runningTotals = useMemo(() => {
    const sortedEntries = [...entries].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.clock_in_time.localeCompare(b.clock_in_time);
    });
    let running = 0;
    const map: Record<string, number> = {};
    for (const e of sortedEntries) {
      map[e.id] = running;
      running += Number(e.total_hours) || 0;
    }
    return map;
  }, [entries]);

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  // ── Status badge helper ─────────────────────────────────────
  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: any; label: string }> = {
      draft: { bg: 'bg-gray-100 dark:bg-white/10', text: 'text-gray-600 dark:text-slate-300', icon: Clock, label: 'Draft' },
      pending: { bg: 'bg-amber-50 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', icon: Clock, label: 'Pending' },
      active: { bg: 'bg-emerald-50 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', icon: Clock, label: 'Active' },
      submitted: { bg: 'bg-blue-50 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', icon: Send, label: 'Submitted' },
      approved: { bg: 'bg-emerald-50 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', icon: CheckCircle, label: 'Approved' },
      rejected: { bg: 'bg-red-50 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', icon: XCircle, label: 'Rejected' },
    };
    const s = styles[status] || styles.draft;
    const Icon = s.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${s.bg} ${s.text}`}>
        <Icon size={12} />
        {s.label}
      </span>
    );
  };

  // ── Timeline bar for a single day ──────────────────────────
  const renderTimeline = (entry: TimecardEntry) => {
    if (!entry.clock_in_time) return null;

    const clockIn = new Date(entry.clock_in_time).getTime();
    const clockOut = entry.clock_out_time ? new Date(entry.clock_out_time).getTime() : Date.now();
    const totalDuration = clockOut - clockIn;

    if (totalDuration <= 0) return null;

    const segments = Array.isArray(entry.segments) && entry.segments.length > 0
      ? entry.segments
      : [{ type: 'working', start: entry.clock_in_time, end: entry.clock_out_time || new Date().toISOString() }];

    return (
      <div className="mt-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] text-gray-500 dark:text-slate-400 tabular-nums">{formatTime(entry.clock_in_time)}</span>
          <div className="flex-1 h-3 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden flex">
            {segments.map((seg: any, idx: number) => {
              const segStart = new Date(seg.start).getTime();
              const segEnd = seg.end ? new Date(seg.end).getTime() : Date.now();
              const width = ((segEnd - segStart) / totalDuration) * 100;
              const left = ((segStart - clockIn) / totalDuration) * 100;
              const colors = SEGMENT_COLORS[seg.type] || SEGMENT_COLORS.working;

              return (
                <div
                  key={idx}
                  className={`${colors.bg} h-full relative group/seg`}
                  style={{ width: `${Math.max(width, 2)}%`, marginLeft: idx === 0 ? `${Math.max(left, 0)}%` : '0' }}
                  title={`${colors.label}: ${formatTime(seg.start)} - ${seg.end ? formatTime(seg.end) : 'now'}`}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover/seg:block bg-gray-900 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-10">
                    {colors.label}
                  </div>
                </div>
              );
            })}
          </div>
          <span className="text-[10px] text-gray-500 dark:text-slate-400 tabular-nums">
            {entry.clock_out_time ? formatTime(entry.clock_out_time) : 'Active'}
          </span>
        </div>
        {/* Legend for segments */}
        {Array.isArray(entry.segments) && entry.segments.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {entry.segments.map((seg: any, idx: number) => {
              const colors = SEGMENT_COLORS[seg.type] || SEGMENT_COLORS.working;
              return (
                <span key={idx} className="inline-flex items-center gap-1 text-[9px] text-gray-500 dark:text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${colors.bg}`} />
                  {colors.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── GPS link helper ─────────────────────────────────────────
  const renderGpsLink = (lat: number | null, lng: number | null, label: string) => {
    if (!lat || !lng) return <span className="text-[10px] text-gray-400">No GPS</span>;
    return (
      <a
        href={getGoogleMapsLink(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 transition-colors"
      >
        <MapPin size={10} />
        {label}
        <ExternalLink size={8} />
      </a>
    );
  };

  // ── Effective pay rate display ──────────────────────────────
  const getEffectiveRateLabel = (payType: string): string => {
    switch (payType) {
      case 'night_shift_premium': return `${nightShiftMultiplier}×`;
      case 'overtime': return '1.5×';
      case 'double_time': return '2.0×';
      case 'mandatory_overtime': return '1.5×';
      default: return '1.0×';
    }
  };

  // ── Hours breakdown preview for edit modal ─────────────────
  const getHoursBreakdownPreview = (entry: TimecardEntry | null, formPayType: string, formIsNightShift: boolean) => {
    if (!entry || !entry.total_hours) return null;
    const totalHours = Number(entry.total_hours);
    const weekBefore = runningTotals[entry.id] ?? 0;
    const hoursUntil40 = Math.max(0, 40 - weekBefore);
    const laborCost = Number(entry.labor_cost) || 0;
    const baseRate = totalHours > 0 && laborCost > 0 ? laborCost / totalHours : null;

    if (formPayType) {
      // Override mode — simple
      const mult = formPayType === 'night_shift_premium' ? nightShiftMultiplier
        : formPayType === 'overtime' || formPayType === 'mandatory_overtime' ? 1.5
        : formPayType === 'double_time' ? 2.0 : 1.0;
      return (
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between text-gray-600 dark:text-slate-300">
            <span>{PAY_TYPE_OPTIONS.find(o => o.value === formPayType)?.label || formPayType}</span>
            <span className="font-bold">{totalHours.toFixed(2)} hrs × {mult}×{baseRate ? ` = $${(totalHours * baseRate * mult).toFixed(2)}` : ''}</span>
          </div>
        </div>
      );
    }

    if (formIsNightShift) {
      const nsHours = Math.min(totalHours, hoursUntil40);
      const otHours = Math.max(0, totalHours - hoursUntil40);
      return (
        <div className="space-y-1 text-[11px]">
          {nsHours > 0 && (
            <div className="flex justify-between text-purple-600 dark:text-purple-300">
              <span>Night Shift Premium ({nightShiftMultiplier}×)</span>
              <span className="font-bold">{nsHours.toFixed(2)} hrs{baseRate ? ` = $${(nsHours * baseRate * nightShiftMultiplier).toFixed(2)}` : ''}</span>
            </div>
          )}
          {otHours > 0 && (
            <div className="flex justify-between text-amber-600 dark:text-amber-300">
              <span>Overtime (1.5×) — 40hr crossover</span>
              <span className="font-bold">{otHours.toFixed(2)} hrs{baseRate ? ` = $${(otHours * baseRate * 1.5).toFixed(2)}` : ''}</span>
            </div>
          )}
          {baseRate && (
            <div className="flex justify-between text-gray-900 dark:text-white font-bold border-t border-gray-200 dark:border-white/10 pt-1 mt-1">
              <span>Total</span>
              <span>${((nsHours * baseRate * nightShiftMultiplier) + (otHours * baseRate * 1.5)).toFixed(2)}</span>
            </div>
          )}
        </div>
      );
    }

    const regHours = Math.min(totalHours, hoursUntil40);
    const otHours = Math.max(0, totalHours - hoursUntil40);
    return (
      <div className="space-y-1 text-[11px]">
        {regHours > 0 && (
          <div className="flex justify-between text-emerald-600 dark:text-emerald-300">
            <span>Regular (1.0×)</span>
            <span className="font-bold">{regHours.toFixed(2)} hrs{baseRate ? ` = $${(regHours * baseRate).toFixed(2)}` : ''}</span>
          </div>
        )}
        {otHours > 0 && (
          <div className="flex justify-between text-amber-600 dark:text-amber-300">
            <span>Overtime (1.5×) — weekly OT</span>
            <span className="font-bold">{otHours.toFixed(2)} hrs{baseRate ? ` = $${(otHours * baseRate * 1.5).toFixed(2)}` : ''}</span>
          </div>
        )}
        {baseRate && totalHours > 0 && (
          <div className="flex justify-between text-gray-900 dark:text-white font-bold border-t border-gray-200 dark:border-white/10 pt-1 mt-1">
            <span>Total</span>
            <span>${((regHours * baseRate) + (otHours * baseRate * 1.5)).toFixed(2)}</span>
          </div>
        )}
      </div>
    );
  };

  // ── Auth loading state ──────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200 dark:border-white/10"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-violet-500 animate-spin"></div>
          </div>
          <p className="text-gray-500 dark:text-slate-400 text-sm font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────
  if (!loading && fetchError) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618]">
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#12082a]/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 shadow-sm">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
            <Link
              href="/dashboard/admin/timecards"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-all text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Timecards</span>
            </Link>
            <div className="h-6 w-px bg-gray-200 dark:bg-white/10" />
            <h1 className="text-sm font-bold text-gray-900 dark:text-white">Operator Detail</h1>
          </div>
        </header>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/30 items-center justify-center mb-4">
            <XCircle size={28} className="text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Could not load operator</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">{fetchError}</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => fetchData()}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <RefreshCw size={16} />
              Try Again
            </button>
            <Link
              href="/dashboard/admin/timecards"
              className="inline-flex items-center justify-center min-h-[44px] py-3 px-4 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-slate-200 rounded-lg text-sm font-semibold border border-gray-200 dark:border-white/10 transition-colors"
            >
              Back to Timecards
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618]">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#12082a]/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard/admin/timecards"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-all text-sm font-medium flex-shrink-0"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Timecards</span>
            </Link>

            <div className="h-6 w-px bg-gray-200 dark:bg-white/10 flex-shrink-0" />

            {/* Operator avatar & name */}
            <div className="flex items-center gap-2.5 min-w-0">
              {operator?.avatar_url ? (
                <UserAvatar src={operator.avatar_url} name={operator.full_name} size={36} className="shadow-lg shadow-purple-500/20" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-lg shadow-purple-500/20">
                  {operator?.full_name?.charAt(0) || '?'}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  {operator?.full_name || 'Loading...'}
                </h1>
                <p className="text-[10px] text-gray-500 dark:text-slate-400 truncate">
                  {operator ? `${operator.role.replace(/_/g, ' ')} ${operator.email ? `\u00b7 ${operator.email}` : ''}` : ''}
                </p>
              </div>
            </div>

            {getStatusBadge(weekStatus)}
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {stats && stats.pendingCount > 0 && (
              <button
                onClick={handleApproveWeek}
                disabled={actionLoading === 'approve_week'}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all text-xs font-bold disabled:opacity-50"
              >
                {actionLoading === 'approve_week' ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
                Approve Week
              </button>
            )}

            <button
              onClick={() => setShowRejectModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-white/5 hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-all text-xs font-bold border border-gray-200 dark:border-white/10"
            >
              <XCircle size={13} />
              Reject
            </button>

            <button
              onClick={async () => {
                const token = await getSessionToken();
                if (!token) return;
                try {
                  const res = await fetch(`/api/admin/timecards/export?weekStart=${weekStart}&userId=${operatorId}&format=pdf`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (!res.ok) { console.error('PDF export failed'); return; }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `timecard_${operatorId}_${weekStart}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch (error) {
                  console.error('Error exporting PDF:', error);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-slate-200 rounded-lg transition-all text-xs font-bold border border-gray-200 dark:border-white/10"
            >
              <FileText size={13} />
              <span className="hidden sm:inline">Export PDF</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5">
        {/* ── Data loading spinner ─────────────────────────── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-12 h-12 relative mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-gray-200 dark:border-white/10" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-600 dark:border-t-violet-500 animate-spin" />
            </div>
            <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">Loading timecard data...</p>
          </div>
        )}

        {!loading && (
        <>
        {/* ── Week Navigation ──────────────────────────────── */}
        <div className="mb-5 flex items-center justify-between">
          <button
            onClick={() => navigateWeek(-1)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-slate-200 rounded-lg transition-all text-sm font-medium border border-gray-200 dark:border-white/10 shadow-sm"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Prev Week</span>
          </button>

          <div className="text-center">
            <p className="text-base font-bold text-gray-900 dark:text-white">
              {formatWeekRange(weekStart)}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
              {isCurrentWeek ? 'Current Week' : `Week of ${weekStart}`}
            </p>
          </div>

          <button
            onClick={() => navigateWeek(1)}
            disabled={isCurrentWeek}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all text-sm font-medium border ${
              isCurrentWeek
                ? 'bg-gray-50 dark:bg-white/[0.02] text-gray-300 dark:text-white/20 border-gray-100 dark:border-white/5 cursor-not-allowed'
                : 'bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-white/10 shadow-sm'
            }`}
          >
            <span className="hidden sm:inline">Next Week</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* ── Metrics Row ──────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-5">
            {/* Total Hours — hero card */}
            <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 rounded-xl p-4 text-white shadow-lg shadow-purple-500/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingUp size={13} className="text-purple-200" />
                <span className="text-[10px] font-bold text-purple-200 uppercase tracking-wider">Total Hours</span>
              </div>
              <p className="text-2xl font-bold tracking-tight">{stats.totalHours.toFixed(1)}</p>
              <p className="text-[10px] text-purple-300 mt-0.5">
                {stats.weeklyOTHours > 0
                  ? `${stats.weeklyOTHours.toFixed(1)} hrs OT`
                  : `${Math.max(0, 40 - (stats.totalHours - stats.mandatoryOTHours)).toFixed(1)} hrs to OT`}
              </p>
            </div>

            {/* Regular Hours */}
            <div className="bg-white dark:bg-slate-800/60 rounded-xl p-3.5 border border-gray-100 dark:border-white/10 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Regular</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle size={13} className="text-emerald-400" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.regularHours.toFixed(1)}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">Mon-Fri, up to 40h</p>
            </div>

            {/* Overtime */}
            <div className="bg-white dark:bg-slate-800/60 rounded-xl p-3.5 border border-gray-100 dark:border-white/10 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Overtime</span>
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <TrendingUp size={13} className="text-orange-400" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.weeklyOTHours.toFixed(1)}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">Over 40h weekly</p>
            </div>

            {/* Night Shift Premium */}
            <div className="bg-white dark:bg-slate-800/60 rounded-xl p-3.5 border border-gray-100 dark:border-white/10 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Night Shift</span>
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Moon size={13} className="text-purple-400" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{(stats.nightShiftPremiumHours ?? stats.nightShiftHours ?? 0).toFixed(1)}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{nightShiftMultiplier}× premium hrs</p>
            </div>

            {/* Days Worked */}
            <div className="bg-white dark:bg-slate-800/60 rounded-xl p-3.5 border border-gray-100 dark:border-white/10 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Days</span>
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Calendar size={13} className="text-purple-400" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.daysWorked}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{stats.totalEntries} entries</p>
            </div>

            {/* Effective Total Pay */}
            <div className="bg-white dark:bg-slate-800/60 rounded-xl p-3.5 border border-gray-100 dark:border-white/10 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Est. Pay</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <DollarSign size={13} className="text-emerald-400" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {stats.effectiveTotalPay != null
                  ? `$${stats.effectiveTotalPay.toFixed(0)}`
                  : '--'}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">with multipliers</p>
            </div>

            {/* Punctuality — 30-day late arrivals */}
            {(() => {
              const p = stats.punctuality;
              const lateCount = p?.lateCountMonth ?? 0;
              const color = lateCount === 0
                ? { iconBg: 'bg-emerald-500/10', icon: 'text-emerald-400', value: 'text-emerald-600 dark:text-emerald-400', sub: 'text-emerald-400' }
                : lateCount <= 2
                  ? { iconBg: 'bg-amber-500/10', icon: 'text-amber-400', value: 'text-amber-600 dark:text-amber-400', sub: 'text-amber-400' }
                  : { iconBg: 'bg-red-500/10', icon: 'text-red-400', value: 'text-red-600 dark:text-red-400', sub: 'text-red-400' };
              return (
                <div className={`bg-white dark:bg-slate-800/60 rounded-xl p-3.5 border shadow-sm ${lateCount >= 3 ? 'border-red-200 dark:border-red-500/30 ring-1 ring-red-100 dark:ring-red-500/20' : 'border-gray-100 dark:border-white/10'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Punctuality</span>
                    <div className={`w-7 h-7 rounded-lg ${color.iconBg} flex items-center justify-center`}>
                      <Timer size={13} className={color.icon} />
                    </div>
                  </div>
                  <p className={`text-xl font-bold ${color.value}`}>
                    {lateCount === 0 ? '0' : `${lateCount}×`}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${lateCount === 0 ? 'text-gray-400 dark:text-slate-500' : color.sub}`}>
                    {lateCount === 0 ? 'On time (30 days)' : `${p?.avgMinutesLate ?? 0}m avg late`}
                  </p>
                  {lateCount > 0 && p?.lastLateDate && (
                    <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5 truncate">
                      Last: {new Date(p.lastLateDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Lateness rollups — This Week / This Month / YTD */}
            {(() => {
              const p = stats.punctuality;
              const lateColor = (n: number) =>
                n === 0
                  ? { value: 'text-emerald-600 dark:text-emerald-400', sub: 'text-gray-400 dark:text-slate-500' }
                  : n <= 2
                    ? { value: 'text-amber-600 dark:text-amber-400', sub: 'text-amber-500 dark:text-amber-400' }
                    : { value: 'text-red-600 dark:text-red-400', sub: 'text-red-500 dark:text-red-400' };
              const rows: { label: string; count: number; minutes: number }[] = [
                { label: 'This Week', count: p?.weekLateCount ?? 0, minutes: p?.weekLateMinutes ?? 0 },
                { label: 'This Month', count: p?.monthLateCount ?? 0, minutes: p?.monthLateMinutes ?? 0 },
                { label: 'YTD', count: p?.ytdLateCount ?? 0, minutes: p?.ytdLateMinutes ?? 0 },
              ];
              const worst = Math.max(...rows.map(r => r.count));
              return (
                <div className={`bg-white dark:bg-slate-800/60 rounded-xl p-3.5 border shadow-sm ${worst >= 3 ? 'border-red-200 dark:border-red-500/30 ring-1 ring-red-100 dark:ring-red-500/20' : 'border-gray-100 dark:border-white/10'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Late Arrivals</span>
                    <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
                      <AlertTriangle size={13} className="text-rose-400" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {rows.map((r) => {
                      const c = lateColor(r.count);
                      return (
                        <div key={r.label} className="flex items-baseline justify-between gap-2">
                          <span className="text-[11px] text-gray-500 dark:text-slate-400">{r.label}</span>
                          <span className="flex items-baseline gap-1.5">
                            <span className={`text-sm font-bold tabular-nums ${c.value}`}>
                              {r.count === 0 ? '0' : `${r.count}×`}
                            </span>
                            {r.count > 0 && (
                              <span className={`text-[10px] tabular-nums ${c.sub}`}>{r.minutes}m total</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Subsistence Nights — count of overnight stays this week (OT-exempt) */}
            {(() => {
              const nights = subsistenceNights.length;
              // Target date for inline +/-: add to the last day of the week,
              // remove the most recent recorded night.
              const addDate = getWeekEnd(weekStart);
              const removeDate = nights > 0 ? [...subsistenceNights].sort().slice(-1)[0] : null;
              return (
                <div className="bg-white dark:bg-slate-800/60 rounded-xl p-3.5 border border-gray-100 dark:border-white/10 shadow-sm">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Subsistence</span>
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                      <Moon size={13} className="text-indigo-400" />
                    </div>
                  </div>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {nights}
                    {subsistenceRate > 0 && nights > 0 && (
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 ml-1.5">
                        ${(nights * subsistenceRate).toFixed(0)}
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                    {nights === 1 ? '1 night away' : `${nights} nights away`}
                    {subsistenceRate > 0 && ` · $${subsistenceRate}/night`}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      onClick={() => removeDate && adjustSubsistenceNight('remove', removeDate)}
                      disabled={subsistenceSaving || nights === 0}
                      className="w-7 h-7 rounded-md border border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-600 dark:text-slate-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-white/5"
                      title="Remove most recent subsistence night"
                    >
                      <Minus size={13} />
                    </button>
                    <button
                      onClick={() => adjustSubsistenceNight('add', addDate)}
                      disabled={subsistenceSaving}
                      className="w-7 h-7 rounded-md border border-indigo-200 dark:border-indigo-400/30 bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-300 disabled:opacity-40 hover:bg-indigo-100 dark:hover:bg-indigo-500/20"
                      title={`Add a subsistence night (${addDate})`}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Category Breakdown Pills ─────────────────────── */}
        {stats && (
          <div className="flex flex-wrap gap-2 mb-5">
            {[
              { label: 'Regular', value: stats.regularHours, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle },
              { label: 'Weekly OT', value: stats.weeklyOTHours, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: TrendingUp },
              { label: 'Mandatory OT', value: stats.mandatoryOTHours, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: Briefcase },
              { label: `Night Shift Premium (${nightShiftMultiplier}×)`, value: stats.nightShiftPremiumHours ?? stats.nightShiftHours ?? 0, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: Moon },
              { label: 'Shop Hours', value: stats.shopHours, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Factory },
            ].filter(x => x.value > 0).map(({ label, value, color, bg, border, icon: Icon }) => (
              <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${border} ${bg}`}>
                <Icon size={12} className={color} />
                <span className={`text-xs font-bold ${color}`}>{value.toFixed(1)}h</span>
                <span className="text-[10px] text-gray-500 dark:text-slate-400">{label}</span>
              </div>
            ))}

            {/* Recalculate button */}
            <button
              onClick={handleRecalculateWeek}
              disabled={actionLoading === 'recalculate'}
              title="Re-apply weekly 40hr OT rule to all entries this week"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'recalculate'
                ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} />}
              <span className="text-[10px] font-bold">Apply 40hr Rule</span>
            </button>

            {/* Approval summary */}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] text-gray-500 dark:text-slate-400">
                {stats.approvedCount}/{stats.totalEntries} approved
              </span>
              {stats.pendingCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Clock size={10} />
                  {stats.pendingCount} pending
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── 40hr Crossover Info Banner ───────────────────── */}
        {stats && (() => {
          const totalHrs = stats.totalHours;
          const hoursToOT = Math.max(0, 40 - totalHrs);
          if (totalHrs >= 40) {
            return (
              <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-500/30 rounded-lg">
                <AlertTriangle size={16} className="text-orange-400 flex-shrink-0" />
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  <strong>{stats.weeklyOTHours.toFixed(1)} weekly overtime hours</strong> — 40hr threshold reached. Night shift premium stops; standard OT (1.5×) applies.
                </p>
              </div>
            );
          }
          if (hoursToOT < 8 && hoursToOT > 0) {
            return (
              <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-lg">
                <Clock size={16} className="text-amber-400 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Week total: {totalHrs.toFixed(1)} hrs — next shift triggers OT at 40 hrs ({hoursToOT.toFixed(1)} hrs remaining)
                </p>
              </div>
            );
          }
          return null;
        })()}

        {/* ── PTO Balance card (editable) ───────────────────── */}
        {ptoBalance && (
          <div className="mb-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-md">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/75">PTO Balance · {new Date().getFullYear()}</p>
                <p className="text-2xl font-bold tabular-nums leading-tight mt-0.5">
                  {Math.max(0, ptoBalance.allocated - ptoBalance.used).toFixed(1)} <span className="text-sm font-medium text-white/80">days remaining</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-white/75">Allocated</p>
                    <p className="text-base font-bold tabular-nums">{ptoBalance.allocated}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/75">Used</p>
                    <p className="text-base font-bold tabular-nums">{ptoBalance.used.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/75">Callouts</p>
                    <p className="text-base font-bold tabular-nums">{ptoBalance.callouts}</p>
                  </div>
                </div>
                {!ptoEditing && (
                  <button
                    type="button"
                    onClick={() => { setPtoInput(String(ptoBalance.allocated)); setPtoEditing(true); }}
                    className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
            {ptoEditing && (
              <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-2 flex-wrap">
                <label className="text-xs font-semibold text-white/90">Allocated days for {new Date().getFullYear()}</label>
                <input
                  type="number" min="0" step="0.5" inputMode="decimal"
                  value={ptoInput}
                  onChange={(e) => setPtoInput(e.target.value)}
                  className="w-24 px-3 py-1.5 rounded-lg bg-white text-gray-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-white/60"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={savePtoAllocation}
                  disabled={ptoSaving}
                  className="px-3 py-1.5 rounded-lg bg-white text-emerald-700 text-xs font-bold hover:bg-emerald-50 transition-colors disabled:opacity-50"
                >
                  {ptoSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setPtoEditing(false)}
                  className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Daily Breakdown ──────────────────────────────── */}
        <div className="space-y-2 mb-5">
          {loading ? (
            <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm p-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-violet-500 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-slate-400 text-sm">Loading entries...</p>
            </div>
          ) : (
            Object.entries(entriesByDay).map(([date, dayEntries]) => {
              const isExpanded = expandedDays.has(date);
              const dayTotal = dayEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
              const hasEntries = dayEntries.length > 0;
              const allApproved = dayEntries.every(e => e.is_approved);
              const hasActive = dayEntries.some(e => !e.clock_out_time);
              const hasPending = dayEntries.some(e => !e.is_approved);
              const isToday = date === new Date().toISOString().split('T')[0];

              return (
                <div
                  key={date}
                  className={`bg-white dark:bg-slate-800/60 rounded-xl border shadow-sm overflow-hidden transition-all ${
                    isToday ? 'border-blue-300 dark:border-violet-500/40 ring-2 ring-blue-100 dark:ring-violet-500/20' : 'border-gray-200 dark:border-white/10'
                  }`}
                >
                  {/* Day header row */}
                  <button
                    onClick={() => hasEntries && toggleDay(date)}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                      hasEntries ? 'hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    {/* Day indicator */}
                    <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0 ${
                      isToday ? 'bg-blue-100 dark:bg-violet-500/20 text-blue-700 dark:text-violet-300' :
                      hasEntries ? 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-slate-200' : 'bg-gray-50 dark:bg-white/[0.03] text-gray-400 dark:text-slate-500'
                    }`}>
                      <span className="text-[9px] font-bold uppercase leading-none">
                        {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className="text-sm font-bold leading-tight">
                        {new Date(date + 'T00:00:00').getDate()}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${hasEntries ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                          {formatDayName(date)}
                        </span>
                        {isToday && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/10 text-purple-400">
                            TODAY
                          </span>
                        )}
                        {hasActive && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                            Active
                          </span>
                        )}
                        {hasPending && !hasActive && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-400">
                            Pending
                          </span>
                        )}
                        {allApproved && hasEntries && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400">
                            <Check size={9} />
                          </span>
                        )}
                      </div>
                      {hasEntries && (
                        <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                          {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}
                          {dayEntries[0].job_title ? ` \u00b7 ${dayEntries[0].job_title}` : ''}
                          {dayEntries[0].job_number ? ` (${dayEntries[0].job_number})` : ''}
                        </p>
                      )}
                    </div>

                    {/* Hours for the day */}
                    <div className="text-right flex-shrink-0">
                      {hasEntries ? (
                        <>
                          <p className="text-base font-bold text-gray-900 dark:text-white tabular-nums">{dayTotal.toFixed(1)}<span className="text-[10px] text-gray-500 dark:text-slate-400 ml-0.5">hrs</span></p>
                          {dayEntries.some(e => e.hour_type === 'mandatory_overtime') && (
                            <span className="text-[9px] text-red-400 font-bold">MANDATORY OT</span>
                          )}
                          {dayEntries.some(e => e.is_night_shift) && (
                            <span className="text-[9px] text-purple-400 font-bold ml-1">NIGHT</span>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-gray-300 dark:text-slate-600">--</p>
                      )}
                    </div>

                    {/* Expand arrow */}
                    {hasEntries && (
                      <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown size={16} className="text-gray-400 dark:text-slate-500" />
                      </div>
                    )}
                  </button>

                  {/* Empty-day quick actions — admin can log PTO / sick / holiday /
                      manual hours for someone who didn't clock in.
                      Wired to POST /api/admin/timecards/manual. */}
                  {!hasEntries && (
                    <div className="px-4 pb-3 pt-1 border-t border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/[0.02]">
                      <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                        No clock-in for this day
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                        {[
                          { type: 'pto' as const, label: 'PTO', defaultHours: '8', tone: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border-emerald-200 dark:border-emerald-500/30' },
                          { type: 'sick' as const, label: 'Sick', defaultHours: '8', tone: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 border-rose-200 dark:border-rose-500/30' },
                          { type: 'holiday' as const, label: 'Holiday', defaultHours: '8', tone: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50 border-violet-200 dark:border-violet-500/30' },
                          { type: 'manual' as const, label: 'Manual hrs', defaultHours: '8', tone: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 border-amber-200 dark:border-amber-500/30' },
                        ].map(({ type, label, defaultHours, tone }) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              setManualDate(date);
                              setManualType(type);
                              setManualHours(defaultHours);
                              setManualNotes('');
                              setManualError(null);
                              setShowManualModal(true);
                            }}
                            className={`px-2.5 py-2 rounded-lg border text-xs font-semibold transition ${tone}`}
                          >
                            + {label}
                          </button>
                        ))}
                        {/* No-Show — records a zero-hour no-show on the timecard +
                            callout ledger for THIS day. Calls the dedicated no-show API
                            (not /manual, which forces 0.25–16 hrs). */}
                        <button
                          type="button"
                          onClick={() => handleNoShow(date)}
                          className="px-2.5 py-2 rounded-lg border text-xs font-semibold transition bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 border-rose-200 dark:border-rose-500/30"
                        >
                          + No-Show
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expanded day detail */}
                  {isExpanded && hasEntries && (
                    <div className="border-t border-gray-100 dark:border-white/10">
                      {dayEntries.map((entry, entryIdx) => {
                        const weekBefore = runningTotals[entry.id] ?? 0;
                        const hoursToOT = Math.max(0, 40 - weekBefore);

                        return (
                        <div
                          key={entry.id}
                          className={`px-4 py-3 ${entryIdx > 0 ? 'border-t border-gray-100 dark:border-white/10' : ''} ${
                            entry.hour_type === 'mandatory_overtime' ? 'border-l-2 border-l-red-500' :
                            entry.is_night_shift ? 'border-l-2 border-l-purple-400' : ''
                          }`}
                        >
                          {/* Entry header */}
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              {/* Clock in/out times */}
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-gray-500 dark:text-slate-400 w-12">Clock In</span>
                                  <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatTime(entry.clock_in_time)}</span>
                                  {renderGpsLink(entry.clock_in_gps_lat || entry.clock_in_latitude, entry.clock_in_gps_lng || entry.clock_in_longitude, 'GPS')}
                                  {entry.nfc_clock_in && (
                                    <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-cyan-500/10 text-cyan-400">NFC</span>
                                  )}
                                  {entry.is_late && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30"
                                      title={
                                        entry.scheduled_start_time
                                          ? `${entry.late_minutes ?? 0}m late (scheduled ${entry.scheduled_start_time})`
                                          : `${entry.late_minutes ?? 0}m late`
                                      }
                                    >
                                      <AlertTriangle size={10} />
                                      {entry.late_minutes ? `${entry.late_minutes}m late` : 'Late'}
                                    </span>
                                  )}
                                </div>
                                <span className="text-gray-400 dark:text-slate-500">&rarr;</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-gray-500 dark:text-slate-400 w-14">Clock Out</span>
                                  {entry.clock_out_time ? (
                                    <>
                                      <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatTime(entry.clock_out_time)}</span>
                                      {renderGpsLink(entry.clock_out_gps_lat || entry.clock_out_latitude, entry.clock_out_gps_lng || entry.clock_out_longitude, 'GPS')}
                                    </>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400">
                                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                      Active
                                    </span>
                                  )}
                                  {entry.nfc_clock_out && (
                                    <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-cyan-500/10 text-cyan-400">NFC</span>
                                  )}
                                </div>
                              </div>

                              {/* Running weekly total indicator */}
                              <div className="mt-1.5 flex items-center gap-2">
                                <span className="text-[10px] text-gray-400 dark:text-slate-500">
                                  Week before this entry: <span className="font-bold text-gray-600 dark:text-slate-300">{weekBefore.toFixed(1)} hrs</span>
                                  {weekBefore < 40 && hoursToOT > 0 && (
                                    <span className="text-gray-400 dark:text-slate-500"> — {hoursToOT.toFixed(1)} hrs until OT</span>
                                  )}
                                  {weekBefore >= 40 && (
                                    <span className="text-amber-500 font-bold"> — OT applies</span>
                                  )}
                                </span>
                              </div>

                              {/* Job info */}
                              {entry.job_title && (
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <Briefcase size={10} className="text-gray-400 dark:text-slate-500" />
                                  <span className="text-[11px] text-gray-500 dark:text-slate-400">
                                    {entry.job_title}
                                    {entry.job_number ? ` (${entry.job_number})` : ''}
                                    {entry.job_customer_name ? ` \u2014 ${entry.job_customer_name}` : ''}
                                  </span>
                                </div>
                              )}

                              {/* Coworkers */}
                              {entry.found_coworkers && entry.found_coworkers.length > 0 && (
                                <div className="mt-1 flex items-center gap-1.5">
                                  <Users size={10} className="text-gray-400 dark:text-slate-500" />
                                  <span className="text-[11px] text-gray-500 dark:text-slate-400">
                                    Worked with: {entry.found_coworkers.map(c => c.full_name).join(', ')}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Right side: hours + badges + actions */}
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              <div className="flex items-center gap-2">
                                {entry.total_hours !== null && (
                                  <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                                    {entry.total_hours.toFixed(2)}
                                    <span className="text-[10px] text-gray-500 dark:text-slate-400 ml-0.5">hrs</span>
                                  </span>
                                )}
                              </div>

                              {/* Lunch deduction — visible breakdown of gross -> net */}
                              {(() => {
                                const lunchMin = Number((entry as any).lunch_duration_minutes ?? (entry as any).break_minutes ?? 0);
                                if (!lunchMin || entry.total_hours === null) return null;
                                const gross = (entry as any).gross_hours != null
                                  ? Number((entry as any).gross_hours)
                                  : Number(entry.total_hours) + lunchMin / 60;
                                return (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30"
                                    title={`Gross ${gross.toFixed(2)} hrs − ${lunchMin} min lunch = ${Number(entry.total_hours).toFixed(2)} hrs net`}
                                  >
                                    <Coffee size={10} />
                                    {gross.toFixed(2)} gross − {lunchMin}m lunch
                                  </span>
                                );
                              })()}

                              {/* Badges */}
                              <div className="flex items-center gap-1 flex-wrap justify-end">
                                {/* Pay category badge (new system) */}
                                {(entry as any).pay_category && (entry as any).pay_category !== 'regular' ? (
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                    (entry as any).pay_category === 'night_shift' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30' :
                                    (entry as any).pay_category === 'shop' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30' :
                                    (entry as any).pay_category === 'overtime' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30' :
                                    'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10'
                                  }`}>
                                    {(entry as any).pay_category === 'night_shift' ? 'Night Shift' :
                                     (entry as any).pay_category === 'shop' ? 'Shop Time' :
                                     (entry as any).pay_category === 'overtime' ? 'Overtime' : 'Regular'}
                                  </span>
                                ) : (
                                  /* Legacy pay type badge */
                                  getPayTypeBadge(entry, weekBefore)
                                )}

                                {/* Entry type */}
                                {entry.entry_type && entry.entry_type !== 'regular' && (
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${ENTRY_TYPE_STYLES[entry.entry_type]?.bg || ''} ${ENTRY_TYPE_STYLES[entry.entry_type]?.text || 'text-gray-500'}`}>
                                    {entry.entry_type.replace(/_/g, ' ')}
                                  </span>
                                )}
                                {(entry.is_shop_hours || (entry as any).is_shop_time) && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400">Shop</span>
                                )}
                                {entry.hour_type === 'mandatory_overtime' && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400">Wknd OT</span>
                                )}
                                {entry.break_minutes > 0 && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/10 text-orange-400">
                                    -{entry.break_minutes}m break
                                  </span>
                                )}
                                {(entry.clock_in_method === 'gps_remote' || entry.clock_in_method === 'remote') && (
                                  <span
                                    title={
                                      entry.remote_verified === null
                                        ? 'Remote GPS clock-in — needs admin approval'
                                        : entry.remote_verified
                                        ? 'Remote GPS — approved'
                                        : 'Remote GPS — rejected'
                                    }
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      entry.remote_verified === null
                                        ? 'bg-amber-500/15 text-amber-500'
                                        : entry.remote_verified
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : 'bg-red-500/10 text-red-400'
                                    }`}
                                  >
                                    <MapPin size={8} />
                                    {entry.remote_verified === null ? 'Remote · Review' : entry.remote_verified ? 'Remote · OK' : 'Remote · Rejected'}
                                  </span>
                                )}
                              </div>

                              {/* Hours breakdown (when not all regular) */}
                              {(Number(entry.night_shift_premium_hours) > 0 || Number(entry.overtime_hours) > 0 || Number(entry.double_time_hours) > 0) && (
                                <div className="text-[9px] text-right space-y-0.5">
                                  {Number(entry.regular_hours) > 0 && (
                                    <div className="text-emerald-500">{Number(entry.regular_hours).toFixed(2)}h reg</div>
                                  )}
                                  {Number(entry.night_shift_premium_hours) > 0 && (
                                    <div className="text-purple-500">{Number(entry.night_shift_premium_hours).toFixed(2)}h NS ({nightShiftMultiplier}×)</div>
                                  )}
                                  {Number(entry.overtime_hours) > 0 && (
                                    <div className="text-amber-500">{Number(entry.overtime_hours).toFixed(2)}h OT (1.5×)</div>
                                  )}
                                  {Number(entry.double_time_hours) > 0 && (
                                    <div className="text-red-500">{Number(entry.double_time_hours).toFixed(2)}h DT (2×)</div>
                                  )}
                                </div>
                              )}

                              {/* Status + actions */}
                              <div className="flex items-center gap-1.5">
                                {entry.is_approved ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400">
                                    <CheckCircle size={10} />
                                    Approved
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400">
                                    <Clock size={10} />
                                    Pending
                                  </span>
                                )}

                                <button
                                  onClick={() => openEditModal(entry)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-violet-500/15 hover:bg-blue-100 dark:hover:bg-violet-500/25 text-blue-700 dark:text-violet-300 border border-blue-200 dark:border-violet-500/30 text-xs font-semibold transition-colors"
                                  title="Edit entry"
                                  aria-label="Edit entry"
                                >
                                  <Edit size={14} />
                                  Edit
                                </button>

                                {!entry.is_approved && (
                                  <button
                                    onClick={() => handleApproveEntry(entry.id)}
                                    disabled={actionLoading === entry.id}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold transition-colors disabled:opacity-50"
                                  >
                                    {actionLoading === entry.id ? <Loader2 size={10} className="animate-spin" /> : 'Approve'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Timeline visualization */}
                          {renderTimeline(entry)}

                          {/* Notes */}
                          {(entry.admin_notes || entry.employee_notes || entry.notes) && (
                            <div className="mt-2 space-y-1">
                              {entry.admin_notes && (
                                <div className="flex items-start gap-1.5 px-2 py-1.5 bg-amber-500/5 rounded-md border border-amber-500/10">
                                  <MessageSquare size={10} className="text-amber-400 mt-0.5 flex-shrink-0" />
                                  <p className="text-[10px] text-amber-300">{entry.admin_notes}</p>
                                </div>
                              )}
                              {entry.employee_notes && (
                                <div className="flex items-start gap-1.5 px-2 py-1.5 bg-blue-500/5 rounded-md border border-blue-500/10">
                                  <MessageSquare size={10} className="text-blue-400 mt-0.5 flex-shrink-0" />
                                  <p className="text-[10px] text-blue-300">{entry.employee_notes}</p>
                                </div>
                              )}
                              {entry.notes && !entry.admin_notes && !entry.employee_notes && (
                                <div className="flex items-start gap-1.5 px-2 py-1.5 bg-gray-50 dark:bg-white/5 rounded-md border border-gray-200 dark:border-white/10">
                                  <MessageSquare size={10} className="text-gray-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                                  <p className="text-[10px] text-gray-600 dark:text-slate-300">{entry.notes}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* GPS Remote map link — shown for remote clock-ins */}
                          {(entry.clock_in_method === 'gps_remote' || entry.clock_in_method === 'remote') && (entry.clock_in_latitude || entry.clock_in_gps_lat) && (
                            <div className="mt-2 px-2 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-500/30 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <MapPin size={10} className="text-amber-500" />
                                <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 uppercase">Remote Clock-In Location</span>
                                {entry.remote_verified === null && (
                                  <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-amber-500/20 text-amber-600 animate-pulse">Needs Review</span>
                                )}
                              </div>
                              <a
                                href={`https://maps.google.com/maps?q=${entry.clock_in_gps_lat || entry.clock_in_latitude},${entry.clock_in_gps_lng || entry.clock_in_longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-[9px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                              >
                                <ExternalLink size={9} />
                                View on Maps
                              </a>
                            </div>
                          )}

                          {/* Verification photos — clock-in selfie + clock-out photo.
                              Render the server-minted signed URLs only; legacy rows
                              (sentinel / raw private path / null) have no signed URL
                              and are simply not shown. */}
                          {(entry.remote_photo_signed_url || entry.clock_out_photo_signed_url) && (
                            <div className="mt-2 px-2 py-1.5 bg-gray-50 dark:bg-white/5 rounded-md border border-gray-200 dark:border-white/10">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <Camera size={10} className="text-gray-400 dark:text-slate-500" />
                                <span className="text-[9px] font-bold text-gray-500 dark:text-slate-400 uppercase">Verification Photos</span>
                              </div>
                              <div className="flex gap-3">
                                {entry.remote_photo_signed_url && (
                                  <a href={entry.remote_photo_signed_url} target="_blank" rel="noopener noreferrer" className="block">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={entry.remote_photo_signed_url} alt="Clock-in photo" className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-white/10" />
                                    <span className="text-[8px] text-gray-400 dark:text-slate-500 block text-center mt-0.5">Clock-in</span>
                                  </a>
                                )}
                                {entry.clock_out_photo_signed_url && (
                                  <a href={entry.clock_out_photo_signed_url} target="_blank" rel="noopener noreferrer" className="block">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={entry.clock_out_photo_signed_url} alt="Clock-out photo" className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-white/10" />
                                    <span className="text-[8px] text-gray-400 dark:text-slate-500 block text-center mt-0.5">Clock-out</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Out-of-radius clock-out — allowed, flagged for admin approval */}
                          {entry.clock_out_outside_radius && (
                            <div className="mt-2 px-2 py-1.5 bg-rose-50 dark:bg-rose-900/20 rounded-md border border-rose-200 dark:border-rose-500/30">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <AlertTriangle size={10} className="text-rose-500" />
                                  <span className="text-[9px] font-bold text-rose-700 dark:text-rose-300 uppercase">Clocked out off-site</span>
                                  {entry.clock_out_verified === null && (
                                    <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-rose-500/20 text-rose-600 animate-pulse">Needs Review</span>
                                  )}
                                  {entry.clock_out_verified === true && (
                                    <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-emerald-500/15 text-emerald-600">Approved</span>
                                  )}
                                  {entry.clock_out_verified === false && (
                                    <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-gray-300/50 dark:bg-white/15 text-gray-600 dark:text-slate-300">Rejected</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {(entry.clock_out_latitude || entry.clock_out_gps_lat) && (
                                    <a
                                      href={`https://maps.google.com/maps?q=${entry.clock_out_gps_lat || entry.clock_out_latitude},${entry.clock_out_gps_lng || entry.clock_out_longitude}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-[9px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900/60 transition-colors"
                                    >
                                      <ExternalLink size={9} /> Location
                                    </a>
                                  )}
                                  {entry.clock_out_verified === null && (
                                    <>
                                      <button
                                        onClick={() => handleApproveClockOut(entry.id, true)}
                                        disabled={actionLoading === entry.id}
                                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[9px] font-bold transition-colors disabled:opacity-50"
                                      >
                                        {actionLoading === entry.id ? <Loader2 size={9} className="animate-spin" /> : 'Approve'}
                                      </button>
                                      <button
                                        onClick={() => handleApproveClockOut(entry.id, false)}
                                        disabled={actionLoading === entry.id}
                                        className="px-2 py-0.5 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-700 dark:text-slate-200 rounded text-[9px] font-bold transition-colors disabled:opacity-50"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* GPS breadcrumb trail (if logs exist) */}
                          {entry.gps_logs && entry.gps_logs.length > 0 && (
                            <div className="mt-2 px-2 py-1.5 bg-gray-50 dark:bg-white/5 rounded-md border border-gray-200 dark:border-white/10">
                              <div className="flex items-center gap-1.5 mb-1">
                                <MapPin size={10} className="text-gray-400 dark:text-slate-500" />
                                <span className="text-[9px] font-bold text-gray-500 dark:text-slate-400 uppercase">GPS Trail ({entry.gps_logs.length} points)</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {entry.gps_logs.slice(0, 8).map((log: GpsLog) => (
                                  <a
                                    key={log.id}
                                    href={getGoogleMapsLink(log.latitude, log.longitude)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-[9px] text-gray-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-violet-400 transition-colors"
                                  >
                                    {log.event_type.replace(/_/g, ' ')} @ {new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                  </a>
                                ))}
                                {entry.gps_logs.length > 8 && (
                                  <span className="text-[9px] text-gray-400 dark:text-slate-500">+{entry.gps_logs.length - 8} more</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Admin Notes Section ──────────────────────────── */}
        <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden mb-5">
          <button
            onClick={() => setNotesExpanded(!notesExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-amber-400" />
              <span className="text-sm font-bold text-gray-900 dark:text-white">Admin Notes</span>
              {weekNotes && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400">Has Notes</span>
              )}
            </div>
            <div className={`transition-transform duration-200 ${notesExpanded ? 'rotate-180' : ''}`}>
              <ChevronDown size={16} className="text-gray-400 dark:text-slate-500" />
            </div>
          </button>

          {notesExpanded && (
            <div className="border-t border-gray-100 dark:border-white/10 p-4">
              <p className="text-[10px] text-gray-500 dark:text-slate-400 mb-2">
                Track late arrivals, no-call-no-show, performance notes, or any other observations for this week.
              </p>
              <textarea
                value={weekNotes}
                onChange={(e) => setWeekNotes(e.target.value)}
                rows={4}
                placeholder="Add admin notes for this week..."
                className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-500/20 focus:border-blue-400 dark:focus:border-violet-400 resize-none transition-all"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {savingNotes ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Save Notes
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Mobile Week Actions ──────────────────────────── */}
        {stats && stats.pendingCount > 0 && (
          <div className="sm:hidden flex gap-2 mb-5">
            <button
              onClick={handleApproveWeek}
              disabled={actionLoading === 'approve_week'}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold disabled:opacity-50"
            >
              {actionLoading === 'approve_week' ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              Approve Week
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white dark:bg-white/5 hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg text-sm font-bold border border-gray-200 dark:border-white/10"
            >
              <XCircle size={14} />
              Reject
            </button>
          </div>
        )}

        {/* ── Legend ────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-2 py-3 text-[10px] text-gray-500 dark:text-slate-400">
          {[
            { color: 'bg-emerald-500', label: 'Regular (Mon-Fri, up to 40 hrs)' },
            { color: 'bg-orange-500', label: 'Weekly OT (Mon-Fri over 40 hrs)' },
            { color: 'bg-red-500', label: 'Mandatory OT (Sat/Sun)' },
            { color: 'bg-purple-500', label: `Night Shift Premium (${nightShiftMultiplier}×)` },
            { color: 'bg-amber-500', label: 'Shop Hours' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${color} rounded-full`} />
              <span>{label}</span>
            </div>
          ))}
        </div>
        </>
        )}
      </div>

      {/* ── Edit Modal ─────────────────────────────────────── */}
      {showEditModal && selectedEntry && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#12082a] rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 dark:border-white/10 max-h-[90vh] overflow-y-auto">
            <div className="p-5 flex items-center justify-between sticky top-0 z-10 bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <Edit size={15} className="text-white" />
                  </div>
                  Edit Time Entry
                </h3>
                <p className="text-xs text-white/80 mt-1 ml-[42px]">
                  {operator?.full_name} &middot; {formatDate(selectedEntry.date)}
                </p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X size={18} className="text-white" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Clock times — split date + time pickers (avoids the native
                  datetime-local wheel bug where tapping "6" registers as "10") */}
              <div className="bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                    <Clock size={14} className="text-violet-600 dark:text-violet-300" />
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">Clock In / Out</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Clock In</p>
                  <SplitDateTimePicker
                    value={editFormData.clock_in_time}
                    onChange={(iso) => setEditFormData({ ...editFormData, clock_in_time: iso })}
                    accent="emerald"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Clock Out</p>
                  <SplitDateTimePicker
                    value={editFormData.clock_out_time}
                    onChange={(iso) => setEditFormData({ ...editFormData, clock_out_time: iso })}
                    accent="violet"
                    allowEmpty
                  />
                </div>
              </div>

              {/* Lunch Deduction (admin-only override) */}
              {(() => {
                const roleDefault = defaultLunchMinutes(operator?.role);
                const presets = Array.from(new Set([0, 30, 60, roleDefault])).sort((a, b) => a - b);
                return (
                  <div className="bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/10 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                        <Coffee size={14} className="text-violet-600 dark:text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-white">Lunch Deduction</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Auto-deducts <span className="font-semibold text-slate-600 dark:text-slate-300">{roleDefault} min</span> for this role when a shift exceeds 6h. Set 0 if no lunch was taken.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="number"
                        min="0"
                        max="480"
                        step="5"
                        value={editFormData.lunch_duration_minutes}
                        onChange={(e) => setEditFormData({ ...editFormData, lunch_duration_minutes: parseInt(e.target.value, 10) || 0 })}
                        className="w-20 px-3 py-2.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-violet-400 text-sm text-slate-800 dark:text-white tabular-nums transition-all"
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400">min</span>
                      <div className="flex gap-2 ml-auto">
                        {presets.map((m) => {
                          const active = editFormData.lunch_duration_minutes === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setEditFormData({ ...editFormData, lunch_duration_minutes: m })}
                              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                                active
                                  ? 'bg-violet-600 border-violet-600 text-white shadow-sm shadow-violet-500/30'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-500/50'
                              }`}
                            >
                              {m === 0 ? 'None' : `${m}m`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Reason for override (optional, e.g. 'doctor appt')"
                      value={editFormData.lunch_override_reason}
                      onChange={(e) => setEditFormData({ ...editFormData, lunch_override_reason: e.target.value })}
                      className="w-full px-4 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-violet-400 text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 transition-all"
                    />
                  </div>
                );
              })()}

              {/* Pay overrides */}
              <div className="bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                    <DollarSign size={14} className="text-violet-600 dark:text-violet-300" />
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">Pay Overrides</p>
                </div>

                {/* Pay Type Override */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Pay Type Override</label>
                  <div className="relative">
                    <select
                      value={editFormData.pay_type_override}
                      onChange={(e) => setEditFormData({ ...editFormData, pay_type_override: e.target.value })}
                      className="w-full px-4 py-3.5 pr-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl text-base text-slate-800 dark:text-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-violet-400 transition-all appearance-none cursor-pointer"
                    >
                      {PAY_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  {editFormData.pay_type_override && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                      <Zap size={11} />
                      Override locks this entry to {editFormData.pay_type_override.replace(/_/g, ' ')} ({getEffectiveRateLabel(editFormData.pay_type_override)}) regardless of weekly hours.
                    </p>
                  )}
                  {!editFormData.pay_type_override && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">Auto: system calculates based on night shift flag and weekly hours.</p>
                  )}
                </div>

                {/* Pay Category (new system) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Pay Category</label>
                  <div className="relative">
                    <select
                      value={editFormData.pay_category}
                      onChange={(e) => {
                        const cat = e.target.value;
                        setEditFormData({
                          ...editFormData,
                          pay_category: cat,
                          // Auto-sync is_shop_time when shop is selected
                          is_shop_time: cat === 'shop' ? true : editFormData.is_shop_time,
                        });
                      }}
                      className="w-full px-4 py-3.5 pr-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl text-base text-slate-800 dark:text-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-violet-400 transition-all appearance-none cursor-pointer"
                    >
                      <option value="regular" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">Regular — standard rate</option>
                      <option value="night_shift" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">Night Shift — premium rate (field only)</option>
                      <option value="shop" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">Shop Time — regular rate regardless of hour</option>
                      <option value="overtime" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">Overtime — 1.5× rate</option>
                    </select>
                    <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                    Auto-calculated based on clock-in time and weekly hours. Override here to lock the category.
                  </p>
                </div>
              </div>

              {/* Classification toggles */}
              <div className="space-y-3">
                {/* Shop Time toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const checked = !editFormData.is_shop_time;
                    setEditFormData({
                      ...editFormData,
                      is_shop_time: checked,
                      pay_category: checked ? 'shop' : (editFormData.pay_category === 'shop' ? 'regular' : editFormData.pay_category),
                    });
                  }}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border p-4 transition-all text-left ${
                    editFormData.is_shop_time
                      ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-400/30'
                      : 'bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Coffee size={16} className="text-amber-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">Shop Time</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">No night shift premium — always regular rate</p>
                    </div>
                  </div>
                  <div className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${editFormData.is_shop_time ? 'bg-amber-500' : 'bg-slate-300 dark:bg-white/20'}`}>
                    <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${editFormData.is_shop_time ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </div>
                </button>

                {/* Night Shift toggle — only when not overriding pay type */}
                {!editFormData.pay_type_override && editFormData.pay_category !== 'shop' && (
                  <button
                    type="button"
                    onClick={() => setEditFormData({ ...editFormData, is_night_shift: !editFormData.is_night_shift })}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl border p-4 transition-all text-left ${
                      editFormData.is_night_shift
                        ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-400/30'
                        : 'bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Moon size={16} className="text-violet-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">Mark as Night Shift (legacy)</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Applies {nightShiftMultiplier}× premium (up to 40hr weekly threshold)</p>
                      </div>
                    </div>
                    <div className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${editFormData.is_night_shift ? 'bg-violet-600' : 'bg-slate-300 dark:bg-white/20'}`}>
                      <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${editFormData.is_night_shift ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                    </div>
                  </button>
                )}
              </div>

              {/* Effective rate display */}
              {selectedEntry.labor_cost && selectedEntry.total_hours && (
                <div className="px-4 py-3 bg-slate-50/80 dark:bg-white/[0.03] rounded-xl border border-slate-200/60 dark:border-white/10">
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Effective Pay Rate</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <DollarSign size={13} className="text-slate-400 dark:text-slate-500" />
                    <span className="text-sm font-bold text-slate-800 dark:text-white">
                      ${(selectedEntry.labor_cost / selectedEntry.total_hours).toFixed(2)}/hr base
                    </span>
                    {editFormData.pay_type_override ? (
                      <span className="text-xs text-violet-600 dark:text-violet-300 font-semibold">
                        × {getEffectiveRateLabel(editFormData.pay_type_override)} = ${((selectedEntry.labor_cost / selectedEntry.total_hours) * parseFloat(getEffectiveRateLabel(editFormData.pay_type_override))).toFixed(2)}/hr
                      </span>
                    ) : editFormData.is_night_shift ? (
                      <span className="text-xs text-violet-600 dark:text-violet-300 font-semibold">× {nightShiftMultiplier} night shift</span>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Hours breakdown preview */}
              {selectedEntry.total_hours && (
                <div className="px-4 py-3 bg-slate-50/80 dark:bg-white/[0.03] rounded-xl border border-slate-200/60 dark:border-white/10">
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Hours Breakdown Preview</p>
                  {getHoursBreakdownPreview(selectedEntry, editFormData.pay_type_override, editFormData.is_night_shift)}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Admin Notes</label>
                <textarea
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  rows={3}
                  placeholder="Add notes for this entry..."
                  className="w-full px-4 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-violet-400 hover:border-slate-300 dark:hover:border-white/20 text-base text-slate-800 dark:text-white resize-none placeholder-slate-400 dark:placeholder-white/30 transition-all duration-200"
                />
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 rounded-xl font-semibold text-sm transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateEntry}
                  disabled={editSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-violet-500/20 min-h-[44px]"
                >
                  {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual Entry Modal (PTO / Sick / Holiday / Manual hrs) ─── */}
      {showManualModal && (() => {
        const TYPE_META = {
          pto:               { label: 'PTO',           gradient: 'from-emerald-500 to-teal-600', dot: 'bg-emerald-100 text-emerald-700' },
          sick:              { label: 'Sick',          gradient: 'from-rose-500 to-pink-600',    dot: 'bg-rose-100 text-rose-700' },
          holiday:           { label: 'Holiday',       gradient: 'from-violet-500 to-indigo-600', dot: 'bg-violet-100 text-violet-700' },
          manual:            { label: 'Manual hours',  gradient: 'from-amber-500 to-orange-600', dot: 'bg-amber-100 text-amber-700' },
          admin_adjustment:  { label: 'Adjustment',    gradient: 'from-sky-500 to-blue-600',     dot: 'bg-sky-100 text-sky-700' },
        };
        const meta = TYPE_META[manualType];
        const usesTimePicker = manualType === 'manual' || manualType === 'admin_adjustment';
        // For time-picker types, compute hours from start/end times
        const computedHoursFromTimes = (() => {
          if (!usesTimePicker) return NaN;
          const [sh, sm] = manualStartTime.split(':').map(Number);
          const [eh, em] = manualEndTime.split(':').map(Number);
          const diff = (eh * 60 + em) - (sh * 60 + sm);
          return diff > 0 ? parseFloat((diff / 60).toFixed(2)) : NaN;
        })();
        const hoursNum = usesTimePicker ? computedHoursFromTimes : parseFloat(manualHours);
        const validHours = !Number.isNaN(hoursNum) && hoursNum >= 0.25 && hoursNum <= 16;

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-[#12082a] rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-white/10 overflow-hidden">
              {/* Hero gradient swaps based on type */}
              <div className={`bg-gradient-to-br ${meta.gradient} p-5 text-white`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-white/75">Add Time Entry</p>
                    <h3 className="text-xl font-bold leading-tight mt-0.5">{meta.label}</h3>
                    <p className="text-xs text-white/80 mt-0.5">{operator?.full_name ?? '—'} · {formatDayName(manualDate)}</p>
                  </div>
                  <button
                    onClick={() => setShowManualModal(false)}
                    className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white"
                    aria-label="Close"
                  >
                    <XCircle size={16} />
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Type picker chips */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {(Object.keys(TYPE_META) as Array<keyof typeof TYPE_META>).map(key => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setManualType(key)}
                        className={`px-2.5 py-2 rounded-lg text-xs font-semibold transition border ${
                          manualType === key
                            ? `bg-gradient-to-br ${TYPE_META[key].gradient} text-white border-transparent shadow-sm`
                            : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
                        }`}
                      >
                        {TYPE_META[key].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hours — time pickers for manual/adjustment, hour input for leave types */}
                {usesTimePicker ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Shift Times</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <p className="text-[10px] text-gray-500 dark:text-slate-400 mb-1">Clock In</p>
                        <input
                          type="time"
                          value={manualStartTime}
                          onChange={(e) => setManualStartTime(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg text-base font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                        />
                      </div>
                      <div className="text-gray-400 dark:text-slate-500 font-bold mt-4">→</div>
                      <div className="flex-1">
                        <p className="text-[10px] text-gray-500 dark:text-slate-400 mb-1">Clock Out</p>
                        <input
                          type="time"
                          value={manualEndTime}
                          onChange={(e) => setManualEndTime(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg text-base font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                        />
                      </div>
                    </div>
                    {validHours && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1.5">
                        <strong>{hoursNum.toFixed(2)} hours</strong> computed from selected times
                      </p>
                    )}
                    {!validHours && manualStartTime && manualEndTime && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5">End time must be after start time (max 16 hrs)</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Hours</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step={0.25}
                        min={0.25}
                        max={16}
                        value={manualHours}
                        onChange={(e) => setManualHours(e.target.value)}
                        className="flex-1 px-3 py-2.5 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg text-base font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                      />
                      <div className="flex gap-1.5">
                        {['4', '8'].map(h => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => setManualHours(h)}
                            className="px-3 py-2.5 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-slate-200 rounded-lg text-sm font-semibold transition"
                          >
                            {h}h
                          </button>
                        ))}
                      </div>
                    </div>
                    {manualType === 'pto' && validHours && ptoBalance && (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-1.5">
                        Will use <strong>{(hoursNum / 8).toFixed(2)} day(s)</strong> · {Math.max(0, ptoBalance.allocated - ptoBalance.used - hoursNum / 8).toFixed(1)} day(s) remaining after
                      </p>
                    )}
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Notes (optional)</label>
                  <textarea
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. doctor appointment, called out morning of, federal holiday"
                    className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 text-sm text-gray-900 dark:text-white resize-none placeholder-gray-400 dark:placeholder-white/30"
                  />
                </div>

                {manualError && (
                  <div className="rounded-lg bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-500/30 p-3 text-sm text-rose-700 dark:text-rose-300">
                    {manualError}
                  </div>
                )}

                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowManualModal(false)}
                    className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-slate-200 rounded-lg font-semibold text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={manualSaving || !validHours}
                    onClick={async () => {
                      setManualError(null);
                      if (!validHours) { setManualError('Hours must be between 0.25 and 16.'); return; }
                      setManualSaving(true);
                      try {
                        const token = await getSessionToken();
                        if (!token) { setManualError('Session expired'); return; }
                        const res = await fetch('/api/admin/timecards/manual', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                          body: JSON.stringify({
                            user_id: operatorId,
                            date: manualDate,
                            entry_type: manualType,
                            hours: hoursNum,
                            start_time: usesTimePicker ? manualStartTime : undefined,
                            notes: manualNotes.trim() || null,
                          }),
                        });
                        const j = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          setManualError(j.error || j.details || 'Failed to add entry.');
                          return;
                        }
                        setShowManualModal(false);
                        fetchData();
                      } catch (err: any) {
                        setManualError(err.message || 'Failed to add entry.');
                      } finally {
                        setManualSaving(false);
                      }
                    }}
                    className={`flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-br ${meta.gradient}`}
                  >
                    {manualSaving ? 'Saving…' : `Log ${meta.label}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Reject Modal ───────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#12082a] rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-white/10">
            <div className="p-5 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <XCircle size={14} className="text-red-400" />
                  </div>
                  Reject Week
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 ml-9">
                  {operator?.full_name} &middot; {formatWeekRange(weekStart)}
                </p>
              </div>
              <button
                onClick={() => setShowRejectModal(false)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={18} className="text-gray-400 dark:text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Rejection Reason</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why this week's timecard is being rejected..."
                  className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-400 text-sm text-gray-900 dark:text-white resize-none placeholder-gray-400 dark:placeholder-white/30 transition-all"
                />
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-slate-200 rounded-lg font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectWeek}
                  disabled={actionLoading === 'reject_week'}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
                >
                  {actionLoading === 'reject_week' ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Reject Week'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OperatorTimecardDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200 dark:border-white/10"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-violet-500 animate-spin"></div>
          </div>
          <p className="text-gray-500 dark:text-slate-400 text-sm font-medium">Loading timecard...</p>
        </div>
      </div>
    }>
      <OperatorTimecardDetailPageInner />
    </Suspense>
  );
}
