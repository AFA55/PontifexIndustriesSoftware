'use client';

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Clock, Calendar, ArrowLeft, FileText, CheckCircle, Check,
  ChevronLeft, ChevronRight, Edit, XCircle, Moon, Factory,
  Briefcase, AlertTriangle, TrendingUp, Loader2, MapPin,
  ExternalLink, Users, Shield, MessageSquare, Send, Coffee,
  Navigation, Hammer, Flag, X, Save, ChevronDown, ChevronUp
} from 'lucide-react';
import { getCurrentUser, isAdmin, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getGoogleMapsLink } from '@/lib/geolocation';

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
  clock_in_method: string | null;
  requires_approval: boolean | null;
  remote_verified: boolean | null;
  job_order_id: string | null;
  job_number: string | null;
  job_customer_name: string | null;
  job_title: string | null;
  gps_logs: GpsLog[];
  found_coworkers: Coworker[];
}

interface WeekStats {
  totalHours: number;
  regularHours: number;
  weeklyOTHours: number;
  mandatoryOTHours: number;
  nightShiftHours: number;
  shopHours: number;
  daysWorked: number;
  breakMinutes: number;
  approvedCount: number;
  pendingCount: number;
  totalEntries: number;
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
  regular: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  overtime: { bg: 'bg-orange-50', text: 'text-orange-700' },
  double_time: { bg: 'bg-red-50', text: 'text-red-700' },
  time_off: { bg: 'bg-purple-50', text: 'text-purple-700' },
  holiday: { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  no_call_no_show: { bg: 'bg-red-50', text: 'text-red-700' },
  late: { bg: 'bg-amber-50', text: 'text-amber-700' },
};

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
  const [editFormData, setEditFormData] = useState({ clock_in_time: '', clock_out_time: '', notes: '' });

  // Notes
  const [weekNotes, setWeekNotes] = useState('');
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

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
      notes: entry.admin_notes || entry.notes || ''
    });
    setShowEditModal(true);
  };

  const handleUpdateEntry = async () => {
    if (!selectedEntry) return;
    try {
      const token = await getSessionToken();
      if (!token) return;
      const response = await fetch(`/api/admin/timecards/${selectedEntry.id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(editFormData)
      });
      if (response.ok) {
        setShowEditModal(false);
        fetchData();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error updating entry:', error);
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
      draft: { bg: 'bg-gray-100', text: 'text-gray-600', icon: Clock, label: 'Draft' },
      pending: { bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock, label: 'Pending' },
      active: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: Clock, label: 'Active' },
      submitted: { bg: 'bg-blue-50', text: 'text-blue-700', icon: Send, label: 'Submitted' },
      approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle, label: 'Approved' },
      rejected: { bg: 'bg-red-50', text: 'text-red-700', icon: XCircle, label: 'Rejected' },
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
          <span className="text-[10px] text-gray-500 tabular-nums">{formatTime(entry.clock_in_time)}</span>
          <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden flex">
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
          <span className="text-[10px] text-gray-500 tabular-nums">
            {entry.clock_out_time ? formatTime(entry.clock_out_time) : 'Active'}
          </span>
        </div>
        {/* Legend for segments */}
        {Array.isArray(entry.segments) && entry.segments.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {entry.segments.map((seg: any, idx: number) => {
              const colors = SEGMENT_COLORS[seg.type] || SEGMENT_COLORS.working;
              return (
                <span key={idx} className="inline-flex items-center gap-1 text-[9px] text-gray-500">
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

  // ── Auth loading state ──────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-gray-500 text-sm font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────
  if (!loading && fetchError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-200 shadow-sm">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
            <Link
              href="/dashboard/admin/timecards"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Timecards</span>
            </Link>
            <div className="h-6 w-px bg-gray-200" />
            <h1 className="text-sm font-bold text-gray-900">Operator Detail</h1>
          </div>
        </header>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-red-50 items-center justify-center mb-4">
            <XCircle size={28} className="text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Could not load operator</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">{fetchError}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => fetchData()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Try Again
            </button>
            <Link
              href="/dashboard/admin/timecards"
              className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 transition-colors"
            >
              Back to Timecards
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard/admin/timecards"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all text-sm font-medium flex-shrink-0"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Timecards</span>
            </Link>

            <div className="h-6 w-px bg-gray-200 flex-shrink-0" />

            {/* Operator avatar & name */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-lg shadow-purple-500/20">
                {operator?.full_name?.charAt(0) || '?'}
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-gray-900 truncate">
                  {operator?.full_name || 'Loading...'}
                </h1>
                <p className="text-[10px] text-gray-500 truncate">
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
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-red-50 text-gray-500 hover:text-red-600 rounded-lg transition-all text-xs font-bold border border-gray-200"
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 rounded-lg transition-all text-xs font-bold border border-gray-200"
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
              <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-600 animate-spin" />
            </div>
            <p className="text-sm text-gray-500 font-medium">Loading timecard data...</p>
          </div>
        )}

        {!loading && (
        <>
        {/* ── Week Navigation ──────────────────────────────── */}
        <div className="mb-5 flex items-center justify-between">
          <button
            onClick={() => navigateWeek(-1)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg transition-all text-sm font-medium border border-gray-200 shadow-sm"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Prev Week</span>
          </button>

          <div className="text-center">
            <p className="text-base font-bold text-gray-900">
              {formatWeekRange(weekStart)}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {isCurrentWeek ? 'Current Week' : `Week of ${weekStart}`}
            </p>
          </div>

          <button
            onClick={() => navigateWeek(1)}
            disabled={isCurrentWeek}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all text-sm font-medium border ${
              isCurrentWeek
                ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm'
            }`}
          >
            <span className="hidden sm:inline">Next Week</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* ── Metrics Row ──────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
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
            <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Regular</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle size={13} className="text-emerald-400" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900">{stats.regularHours.toFixed(1)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Mon-Fri, up to 40h</p>
            </div>

            {/* Overtime */}
            <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Overtime</span>
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <TrendingUp size={13} className="text-orange-400" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900">{stats.weeklyOTHours.toFixed(1)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Over 40h weekly</p>
            </div>

            {/* Days Worked */}
            <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Days</span>
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Calendar size={13} className="text-purple-400" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900">{stats.daysWorked}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{stats.totalEntries} entries</p>
            </div>

            {/* Break Time */}
            <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Breaks</span>
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Coffee size={13} className="text-amber-400" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900">{stats.breakMinutes}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">minutes deducted</p>
            </div>
          </div>
        )}

        {/* ── Category Breakdown Pills ─────────────────────── */}
        {stats && (
          <div className="flex flex-wrap gap-2 mb-5">
            {[
              { label: 'Regular', value: stats.regularHours, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle },
              { label: 'Weekly OT', value: stats.weeklyOTHours, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: TrendingUp },
              { label: 'Mandatory OT', value: stats.mandatoryOTHours, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: Briefcase },
              { label: 'Night Shift', value: stats.nightShiftHours, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', icon: Moon },
              { label: 'Shop Hours', value: stats.shopHours, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Factory },
            ].filter(x => x.value > 0).map(({ label, value, color, bg, border, icon: Icon }) => (
              <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${border} ${bg}`}>
                <Icon size={12} className={color} />
                <span className={`text-xs font-bold ${color}`}>{value.toFixed(1)}h</span>
                <span className="text-[10px] text-gray-500">{label}</span>
              </div>
            ))}

            {/* Approval summary */}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] text-gray-500">
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

        {/* ── OT Alerts ────────────────────────────────────── */}
        {stats && stats.weeklyOTHours > 0 && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertTriangle size={16} className="text-orange-400 flex-shrink-0" />
            <p className="text-sm text-orange-700">
              <strong>{stats.weeklyOTHours.toFixed(1)} weekly overtime hours</strong> — Mon-Fri hours exceeded 40.
            </p>
          </div>
        )}

        {/* ── Daily Breakdown ──────────────────────────────── */}
        <div className="space-y-2 mb-5">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Loading entries...</p>
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
                  className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
                    isToday ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'
                  }`}
                >
                  {/* Day header row */}
                  <button
                    onClick={() => hasEntries && toggleDay(date)}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                      hasEntries ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    {/* Day indicator */}
                    <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0 ${
                      isToday ? 'bg-blue-100 text-blue-700' :
                      hasEntries ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-400'
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
                        <span className={`text-sm font-semibold ${hasEntries ? 'text-gray-900' : 'text-gray-400'}`}>
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
                        <p className="text-[10px] text-gray-400 mt-0.5">
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
                          <p className="text-base font-bold text-gray-900 tabular-nums">{dayTotal.toFixed(1)}<span className="text-[10px] text-gray-500 ml-0.5">hrs</span></p>
                          {dayEntries.some(e => e.hour_type === 'mandatory_overtime') && (
                            <span className="text-[9px] text-red-400 font-bold">MANDATORY OT</span>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-gray-300">--</p>
                      )}
                    </div>

                    {/* Expand arrow */}
                    {hasEntries && (
                      <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown size={16} className="text-gray-400" />
                      </div>
                    )}
                  </button>

                  {/* Expanded day detail */}
                  {isExpanded && hasEntries && (
                    <div className="border-t border-gray-100">
                      {dayEntries.map((entry, entryIdx) => (
                        <div
                          key={entry.id}
                          className={`px-4 py-3 ${entryIdx > 0 ? 'border-t border-gray-100' : ''} ${
                            entry.hour_type === 'mandatory_overtime' ? 'border-l-2 border-l-red-500' : ''
                          }`}
                        >
                          {/* Entry header */}
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              {/* Clock in/out times */}
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-gray-500 w-12">Clock In</span>
                                  <span className="text-sm font-bold text-gray-900 tabular-nums">{formatTime(entry.clock_in_time)}</span>
                                  {renderGpsLink(entry.clock_in_gps_lat || entry.clock_in_latitude, entry.clock_in_gps_lng || entry.clock_in_longitude, 'GPS')}
                                  {entry.nfc_clock_in && (
                                    <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-cyan-500/10 text-cyan-400">NFC</span>
                                  )}
                                </div>
                                <span className="text-gray-400">&rarr;</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-gray-500 w-14">Clock Out</span>
                                  {entry.clock_out_time ? (
                                    <>
                                      <span className="text-sm font-bold text-gray-900 tabular-nums">{formatTime(entry.clock_out_time)}</span>
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

                              {/* Job info */}
                              {entry.job_title && (
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <Briefcase size={10} className="text-gray-400" />
                                  <span className="text-[11px] text-gray-500">
                                    {entry.job_title}
                                    {entry.job_number ? ` (${entry.job_number})` : ''}
                                    {entry.job_customer_name ? ` \u2014 ${entry.job_customer_name}` : ''}
                                  </span>
                                </div>
                              )}

                              {/* Coworkers */}
                              {entry.found_coworkers && entry.found_coworkers.length > 0 && (
                                <div className="mt-1 flex items-center gap-1.5">
                                  <Users size={10} className="text-gray-400" />
                                  <span className="text-[11px] text-gray-500">
                                    Worked with: {entry.found_coworkers.map(c => c.full_name).join(', ')}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Right side: hours + badges + actions */}
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              <div className="flex items-center gap-2">
                                {entry.total_hours !== null && (
                                  <span className="text-lg font-bold text-gray-900 tabular-nums">
                                    {entry.total_hours.toFixed(2)}
                                    <span className="text-[10px] text-gray-500 ml-0.5">hrs</span>
                                  </span>
                                )}
                              </div>

                              {/* Badges */}
                              <div className="flex items-center gap-1 flex-wrap justify-end">
                                {/* Entry type */}
                                {entry.entry_type && entry.entry_type !== 'regular' && (
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${ENTRY_TYPE_STYLES[entry.entry_type]?.bg || ''} ${ENTRY_TYPE_STYLES[entry.entry_type]?.text || 'text-gray-500'}`}>
                                    {entry.entry_type.replace(/_/g, ' ')}
                                  </span>
                                )}
                                {entry.is_shop_hours && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400">Shop</span>
                                )}
                                {entry.is_night_shift && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/10 text-indigo-400">Night</span>
                                )}
                                {entry.hour_type === 'mandatory_overtime' && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400">Wknd OT</span>
                                )}
                                {entry.break_minutes > 0 && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/10 text-orange-400">
                                    -{entry.break_minutes}m break
                                  </span>
                                )}
                                {entry.clock_in_method === 'gps_remote' && (
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
                                  className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-700 rounded transition-colors"
                                  title="Edit entry"
                                >
                                  <Edit size={12} />
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
                                <div className="flex items-start gap-1.5 px-2 py-1.5 bg-gray-50 rounded-md border border-gray-200">
                                  <MessageSquare size={10} className="text-gray-400 mt-0.5 flex-shrink-0" />
                                  <p className="text-[10px] text-gray-600">{entry.notes}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* GPS Remote map link — shown for gps_remote clock-ins */}
                          {entry.clock_in_method === 'gps_remote' && (entry.clock_in_latitude || entry.clock_in_gps_lat) && (
                            <div className="mt-2 px-2 py-1.5 bg-amber-50 rounded-md border border-amber-200 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <MapPin size={10} className="text-amber-500" />
                                <span className="text-[9px] font-bold text-amber-700 uppercase">Remote Clock-In Location</span>
                                {entry.remote_verified === null && (
                                  <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-amber-500/20 text-amber-600 animate-pulse">Needs Review</span>
                                )}
                              </div>
                              <a
                                href={`https://maps.google.com/maps?q=${entry.clock_in_gps_lat || entry.clock_in_latitude},${entry.clock_in_gps_lng || entry.clock_in_longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-[9px] font-bold text-amber-700 hover:bg-amber-200 transition-colors"
                              >
                                <ExternalLink size={9} />
                                View on Maps
                              </a>
                            </div>
                          )}

                          {/* GPS breadcrumb trail (if logs exist) */}
                          {entry.gps_logs && entry.gps_logs.length > 0 && (
                            <div className="mt-2 px-2 py-1.5 bg-gray-50 rounded-md border border-gray-200">
                              <div className="flex items-center gap-1.5 mb-1">
                                <MapPin size={10} className="text-gray-400" />
                                <span className="text-[9px] font-bold text-gray-500 uppercase">GPS Trail ({entry.gps_logs.length} points)</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {entry.gps_logs.slice(0, 8).map((log: GpsLog) => (
                                  <a
                                    key={log.id}
                                    href={getGoogleMapsLink(log.latitude, log.longitude)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-[9px] text-gray-500 hover:text-blue-600 transition-colors"
                                  >
                                    {log.event_type.replace(/_/g, ' ')} @ {new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                  </a>
                                ))}
                                {entry.gps_logs.length > 8 && (
                                  <span className="text-[9px] text-gray-400">+{entry.gps_logs.length - 8} more</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Admin Notes Section ──────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-5">
          <button
            onClick={() => setNotesExpanded(!notesExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-amber-400" />
              <span className="text-sm font-bold text-gray-900">Admin Notes</span>
              {weekNotes && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400">Has Notes</span>
              )}
            </div>
            <div className={`transition-transform duration-200 ${notesExpanded ? 'rotate-180' : ''}`}>
              <ChevronDown size={16} className="text-gray-400" />
            </div>
          </button>

          {notesExpanded && (
            <div className="border-t border-gray-100 p-4">
              <p className="text-[10px] text-gray-500 mb-2">
                Track late arrivals, no-call-no-show, performance notes, or any other observations for this week.
              </p>
              <textarea
                value={weekNotes}
                onChange={(e) => setWeekNotes(e.target.value)}
                rows={4}
                placeholder="Add admin notes for this week..."
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none transition-all"
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
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white hover:bg-red-50 text-gray-500 hover:text-red-600 rounded-lg text-sm font-bold border border-gray-200"
            >
              <XCircle size={14} />
              Reject
            </button>
          </div>
        )}

        {/* ── Legend ────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-2 py-3 text-[10px] text-gray-500">
          {[
            { color: 'bg-emerald-500', label: 'Regular (Mon-Fri, up to 40 hrs)' },
            { color: 'bg-orange-500', label: 'Weekly OT (Mon-Fri over 40 hrs)' },
            { color: 'bg-red-500', label: 'Mandatory OT (Sat/Sun)' },
            { color: 'bg-indigo-500', label: 'Night Shift' },
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-200">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Edit size={14} className="text-purple-400" />
                  </div>
                  Edit Entry
                </h3>
                <p className="text-xs text-gray-500 mt-1 ml-9">
                  {operator?.full_name} &middot; {formatDate(selectedEntry.date)}
                </p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Clock In Time</label>
                <input
                  type="datetime-local"
                  value={editFormData.clock_in_time ? new Date(editFormData.clock_in_time).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setEditFormData({ ...editFormData, clock_in_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm text-gray-900 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Clock Out Time</label>
                <input
                  type="datetime-local"
                  value={editFormData.clock_out_time ? new Date(editFormData.clock_out_time).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setEditFormData({ ...editFormData, clock_out_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm text-gray-900 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Admin Notes</label>
                <textarea
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  rows={3}
                  placeholder="Add notes for this entry..."
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm text-gray-900 resize-none placeholder-slate-600 transition-all"
                />
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateEntry}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-semibold text-sm transition-all shadow-lg shadow-purple-500/20"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ───────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-200">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <XCircle size={14} className="text-red-400" />
                  </div>
                  Reject Week
                </h3>
                <p className="text-xs text-gray-500 mt-1 ml-9">
                  {operator?.full_name} &middot; {formatWeekRange(weekStart)}
                </p>
              </div>
              <button
                onClick={() => setShowRejectModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Rejection Reason</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why this week's timecard is being rejected..."
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-400 text-sm text-gray-900 resize-none placeholder-gray-400 transition-all"
                />
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold text-sm transition-colors"
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-gray-500 text-sm font-medium">Loading timecard...</p>
        </div>
      </div>
    }>
      <OperatorTimecardDetailPageInner />
    </Suspense>
  );
}
