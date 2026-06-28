'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  mondayOf,
  toLocalYMD,
  parseYMDLocal,
  formatDay,
} from '@/lib/dates';
import {
  ArrowLeft,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
  CheckCircle,
  Loader2,
  Save,
  X,
  CalendarClock,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────
interface LateEntry {
  id: string;
  user_id: string;
  operator_name: string;
  operator_role: string;
  date: string;
  scheduled_start_time: string;
  late_minutes: number;
  late_source: 'Job' | 'Day override' | 'Standard';
  clock_in_time: string;
  total_hours: number | null;
}

interface TimecardSettings {
  default_start_time: string;
  late_grace_minutes: number;
}

interface DayOverride {
  id: string;
  override_date: string;
  start_time: string;
  scope: 'all' | 'role' | 'operator';
  role: string | null;
  operator_id: string | null;
  operator_name: string | null;
  note: string | null;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
}

const ALLOWED_ROLES = ['admin', 'super_admin', 'operations_manager'];

const ROLE_OPTIONS = [
  'super_admin',
  'operations_manager',
  'admin',
  'salesman',
  'shop_manager',
  'inventory_manager',
  'operator',
  'apprentice',
];

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    operator: 'Operator',
    apprentice: 'Apprentice',
    admin: 'Admin',
    shop_manager: 'Shop Manager',
    operations_manager: 'Ops Manager',
    super_admin: 'Super Admin',
    salesman: 'Salesman',
    inventory_manager: 'Inventory Mgr',
  };
  return map[role] || role;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "HH:MM" (24h) from an ISO timestamp for display */
/** Derive the Sunday YYYY-MM-DD that ends the week starting at mondayYMD */
function sundayOf(mondayYMD: string): string {
  const d = parseYMDLocal(mondayYMD);
  d.setDate(d.getDate() + 6);
  return toLocalYMD(d);
}

const LATE_SOURCE_BADGE: Record<string, string> = {
  Job: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  'Day override': 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Standard: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/60',
};

// ══════════════════════════════════════════════════════════════
export default function LateEntriesPage() {
  const router = useRouter();
  const isRedirecting = useRef(false);

  const [user, setUser] = useState<User | null>(null);

  // ── Auth token helper ───────────────────────────────────────
  const getToken = useCallback(async (): Promise<string | null> => {
    if (isRedirecting.current) return null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        isRedirecting.current = true;
        router.push('/login');
        return null;
      }
      return data.session.access_token;
    } catch {
      return null;
    }
  }, [router]);

  // ── Toast ───────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, kind: 'ok' | 'err') => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ══════════════════════════════════════════════════════════════
  // SECTION 1 — Late Entries
  // ══════════════════════════════════════════════════════════════
  const [weekStart, setWeekStart] = useState<string>(() => mondayOf());
  const [lateEntries, setLateEntries] = useState<LateEntry[]>([]);
  const [lateLoading, setLateLoading] = useState(true);
  const [lateError, setLateError] = useState(false);

  const weekEnd = sundayOf(weekStart);

  const fetchLateEntries = useCallback(async (start: string, end: string) => {
    setLateLoading(true);
    setLateError(false);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/admin/timecards/late?start=${start}&end=${end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) { setLateError(true); return; }
      const result = await res.json();
      if (result.success) {
        setLateEntries(result.data ?? []);
      } else {
        setLateError(true);
      }
    } catch {
      setLateError(true);
    } finally {
      setLateLoading(false);
    }
  }, [getToken]);

  const goToPrevWeek = () => {
    const d = parseYMDLocal(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(toLocalYMD(d));
  };

  const goToNextWeek = () => {
    const d = parseYMDLocal(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(toLocalYMD(d));
  };

  const goToThisWeek = () => setWeekStart(mondayOf());

  const isThisWeek = weekStart === mondayOf();

  // ══════════════════════════════════════════════════════════════
  // SECTION 2 — Settings
  // ══════════════════════════════════════════════════════════════
  const [settings, setSettings] = useState<TimecardSettings>({
    default_start_time: '07:00',
    late_grace_minutes: 7,
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/admin/timecard-settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const result = await res.json();
      if (result.success && result.data) {
        setSettings({
          default_start_time: result.data.default_start_time ?? '07:00',
          late_grace_minutes: result.data.late_grace_minutes ?? 7,
        });
      }
    } catch { /* non-critical */ }
    finally { setSettingsLoading(false); }
  }, [getToken]);

  const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsSaved(false);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/admin/timecard-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          default_start_time: settings.default_start_time,
          late_grace_minutes: settings.late_grace_minutes,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(result.error || 'Failed to save settings', 'err');
      } else {
        setSettingsSaved(true);
        showToast('Settings saved', 'ok');
        // Re-fetch late entries since the grace window may have changed
        fetchLateEntries(weekStart, weekEnd);
        setTimeout(() => setSettingsSaved(false), 3000);
      }
    } catch {
      showToast('Something went wrong', 'err');
    } finally {
      setSettingsSaving(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // SECTION 3 — Day Overrides
  // ══════════════════════════════════════════════════════════════
  const [overrides, setOverrides] = useState<DayOverride[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(true);
  const [overridesError, setOverridesError] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add override form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDate, setAddDate] = useState('');
  const [addTime, setAddTime] = useState('');
  const [addScope, setAddScope] = useState<'all' | 'role' | 'operator'>('all');
  const [addRole, setAddRole] = useState('operator');
  const [addOperatorId, setAddOperatorId] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Team roster for operator select
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  const fetchOverrides = useCallback(async () => {
    setOverridesLoading(true);
    setOverridesError(false);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/admin/timecards/day-overrides', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setOverridesError(true); return; }
      const result = await res.json();
      if (result.success) {
        setOverrides(result.data ?? []);
      } else {
        setOverridesError(true);
      }
    } catch {
      setOverridesError(true);
    } finally {
      setOverridesLoading(false);
    }
  }, [getToken]);

  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      // Re-use the team-summary endpoint; fall back gracefully if unavailable
      const res = await fetch('/api/admin/timecards/team-summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const result = await res.json();
      if (result.success && Array.isArray(result.data)) {
        // Normalise whatever shape the endpoint returns
        const members: TeamMember[] = (result.data as Array<{
          user_id?: string; id?: string; name?: string; full_name?: string; role?: string;
        }>).map((m) => ({
          id: m.user_id ?? m.id ?? '',
          name: m.name ?? m.full_name ?? 'Unknown',
          role: m.role ?? '',
        })).filter((m) => m.id);
        setTeamMembers(members);
      }
    } catch { /* non-critical — operator scope just won't pre-populate */ }
    finally { setTeamLoading(false); }
  }, [getToken]);

  const deleteOverride = async (id: string) => {
    setDeletingId(id);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/admin/timecards/day-overrides?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        showToast(result.error || 'Failed to delete override', 'err');
        return;
      }
      showToast('Override deleted', 'ok');
      setOverrides((prev) => prev.filter((o) => o.id !== id));
    } catch {
      showToast('Something went wrong', 'err');
    } finally {
      setDeletingId(null);
    }
  };

  const resetAddForm = () => {
    setAddDate('');
    setAddTime('');
    setAddScope('all');
    setAddRole('operator');
    setAddOperatorId('');
    setAddNote('');
    setShowAddForm(false);
  };

  const submitOverride = async () => {
    if (!addDate || !addTime) {
      showToast('Date and time are required', 'err');
      return;
    }
    if (addScope === 'operator' && !addOperatorId) {
      showToast('Select an operator', 'err');
      return;
    }
    setAddSaving(true);
    try {
      const token = await getToken();
      if (!token) return;
      const body: Record<string, unknown> = {
        override_date: addDate,
        start_time: addTime,
        scope: addScope,
        note: addNote.trim() || null,
      };
      if (addScope === 'role') body.role = addRole;
      if (addScope === 'operator') body.operator_id = addOperatorId;

      const res = await fetch('/api/admin/timecards/day-overrides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      if (res.status === 409) {
        showToast('An override for that date/scope already exists.', 'err');
        return;
      }
      if (!res.ok) {
        showToast(result.error || 'Failed to add override', 'err');
        return;
      }
      showToast('Override added', 'ok');
      resetAddForm();
      fetchOverrides();
      // Re-fetch late entries since a new override could reclassify entries
      fetchLateEntries(weekStart, weekEnd);
    } catch {
      showToast('Something went wrong', 'err');
    } finally {
      setAddSaving(false);
    }
  };

  // ── Mount: auth guard + initial fetches ─────────────────────
  useEffect(() => {
    const u = getCurrentUser();
    if (!u) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(u.role)) { router.push('/dashboard'); return; }
    setUser(u);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    fetchSettings();
    fetchOverrides();
    fetchTeam();
  }, [user, fetchSettings, fetchOverrides, fetchTeam]);

  useEffect(() => {
    if (!user) return;
    fetchLateEntries(weekStart, weekEnd);
  }, [user, weekStart, weekEnd, fetchLateEntries]);

  // ── Loading guard ────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0b0618]/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link
            href="/dashboard/admin/timecards"
            className="flex items-center gap-2 px-3 py-1.5 text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-all text-sm font-medium min-h-[44px]"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Payroll</span>
          </Link>
          <div className="h-6 w-px bg-gray-200 dark:bg-white/10" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm">
              <AlertTriangle size={16} className="text-white" />
            </div>
            <span>Late Entries &amp; Start Time</span>
          </h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-8">

        {/* ════════════════════════════════════════════════════
            SECTION 1 — Late Entries
            ════════════════════════════════════════════════════ */}
        <section>
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Clock size={16} className="text-amber-500" />
                Late Clock-Ins
              </h2>
              <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
                Operators who clocked in after their start time + grace window
              </p>
            </div>

            {/* Week selector */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={goToPrevWeek}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-white/50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Previous week"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex flex-col items-center px-2 min-w-[130px] text-center">
                <span className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                  {formatDay(weekStart, { month: 'short', day: 'numeric' })}
                  {' – '}
                  {formatDay(weekEnd, { month: 'short', day: 'numeric' })}
                </span>
                {!isThisWeek && (
                  <button
                    onClick={goToThisWeek}
                    className="text-[11px] font-medium text-brand hover:text-brand-dark dark:hover:text-brand mt-0.5 transition-colors"
                  >
                    This week
                  </button>
                )}
              </div>
              <button
                onClick={goToNextWeek}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-white/50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Next week"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {lateLoading ? (
            <div className="space-y-2.5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-4 animate-pulse">
                  <div className="h-4 w-36 bg-gray-200 dark:bg-white/10 rounded mb-2" />
                  <div className="h-3 w-52 bg-gray-200 dark:bg-white/10 rounded" />
                </div>
              ))}
            </div>
          ) : lateError ? (
            <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-10 text-center">
              <AlertTriangle className="text-red-400 mx-auto mb-3" size={24} />
              <p className="text-gray-700 dark:text-white/80 font-semibold mb-1">Couldn&apos;t load late entries</p>
              <button
                onClick={() => fetchLateEntries(weekStart, weekEnd)}
                className="mt-3 min-h-[44px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
              >
                Try again
              </button>
            </div>
          ) : lateEntries.length === 0 ? (
            <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-10 text-center">
              <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="text-emerald-500" size={26} />
              </div>
              <p className="font-semibold text-gray-900 dark:text-white">No late entries this week 🎉</p>
              <p className="text-sm text-gray-400 dark:text-white/40 mt-1">Everyone clocked in on time.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
              {/* Table header — hidden on very small screens, shown sm+ */}
              <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-white/[0.02]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-white/40">Operator</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-white/40">Date</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-white/40">Scheduled</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-white/40">Clocked In</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-white/40">Late</span>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-white/8">
                {lateEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="px-4 py-3.5 flex flex-col sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center gap-1 sm:gap-3"
                  >
                    {/* Operator */}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                        {entry.operator_name}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-white/40">
                        {roleLabel(entry.operator_role)}
                      </p>
                    </div>

                    {/* Date */}
                    <span className="text-sm text-gray-700 dark:text-white/70 whitespace-nowrap">
                      <span className="sm:hidden text-xs text-gray-400 dark:text-white/40">Date: </span>
                      {formatDay(entry.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>

                    {/* Scheduled */}
                    <span className="text-sm text-gray-500 dark:text-white/50 whitespace-nowrap">
                      <span className="sm:hidden text-xs text-gray-400 dark:text-white/40">Sched: </span>
                      {entry.scheduled_start_time}
                    </span>

                    {/* Actual clock-in */}
                    <span className="text-sm text-gray-700 dark:text-white/70 whitespace-nowrap">
                      <span className="sm:hidden text-xs text-gray-400 dark:text-white/40">In: </span>
                      {fmtTime(entry.clock_in_time)}
                    </span>

                    {/* Minutes late + source badge */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-sm font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                        +{entry.late_minutes}m
                      </span>
                      <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${LATE_SOURCE_BADGE[entry.late_source] ?? LATE_SOURCE_BADGE['Standard']}`}>
                        {entry.late_source}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ════════════════════════════════════════════════════
            SECTION 2 — Standard Start Time & Grace Settings
            ════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Clock size={16} className="text-brand" />
            Standard Start Time &amp; Late Grace
          </h2>

          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-5">
            {settingsLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 w-48 bg-gray-200 dark:bg-white/10 rounded" />
                <div className="h-10 w-full bg-gray-200 dark:bg-white/10 rounded-xl" />
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-white/50 mb-5 leading-relaxed">
                  Operators are flagged late if they clock in more than{' '}
                  <span className="font-semibold text-gray-800 dark:text-white">
                    {settings.late_grace_minutes} minute{settings.late_grace_minutes !== 1 ? 's' : ''}
                  </span>{' '}
                  after their start time. This standard applies when there is no per-day override or
                  job-specific start time.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1.5">
                      Default Start Time
                    </label>
                    <input
                      type="time"
                      value={settings.default_start_time}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, default_start_time: e.target.value }))
                      }
                      className="w-full px-3 py-2.5 text-base bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1.5">
                      Grace Period (minutes)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={settings.late_grace_minutes}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          late_grace_minutes: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="w-full px-3 py-2.5 text-base bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all min-h-[44px]"
                    />
                  </div>
                </div>

                <button
                  onClick={saveSettings}
                  disabled={settingsSaving}
                  className="flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {settingsSaving ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : settingsSaved ? (
                    <CheckCircle size={15} />
                  ) : (
                    <Save size={15} />
                  )}
                  {settingsSaved ? 'Saved!' : 'Save Settings'}
                </button>
              </>
            )}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════
            SECTION 3 — Day Overrides
            ════════════════════════════════════════════════════ */}
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CalendarClock size={16} className="text-blue-500" />
                Day Overrides
              </h2>
              <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
                One-off start times for specific dates (e.g. safety training at 6:30 AM)
              </p>
            </div>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-semibold transition-all shadow-md shadow-blue-500/20 flex-shrink-0"
            >
              {showAddForm ? <X size={14} /> : <Plus size={14} />}
              {showAddForm ? 'Cancel' : 'Add Override'}
            </button>
          </div>

          {/* Add override form */}
          {showAddForm && (
            <div className="mb-4 bg-blue-50/60 dark:bg-blue-500/10 rounded-2xl border border-blue-100 dark:border-blue-500/20 p-5">
              <p className="text-sm font-bold text-blue-800 dark:text-blue-200 mb-4">New Day Override</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1.5">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    className="w-full px-3 py-2.5 text-base bg-white dark:bg-white/5 border border-blue-200 dark:border-blue-500/30 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1.5">
                    Start Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={addTime}
                    onChange={(e) => setAddTime(e.target.value)}
                    className="w-full px-3 py-2.5 text-base bg-white dark:bg-white/5 border border-blue-200 dark:border-blue-500/30 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all min-h-[44px]"
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1.5">
                  Scope
                </label>
                <select
                  value={addScope}
                  onChange={(e) => setAddScope(e.target.value as 'all' | 'role' | 'operator')}
                  className="w-full px-3 py-2.5 text-base bg-white dark:bg-white/5 border border-blue-200 dark:border-blue-500/30 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all min-h-[44px]"
                >
                  <option value="all">Everyone</option>
                  <option value="role">Specific Role</option>
                  <option value="operator">Specific Operator</option>
                </select>
              </div>

              {addScope === 'role' && (
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1.5">
                    Role
                  </label>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value)}
                    className="w-full px-3 py-2.5 text-base bg-white dark:bg-white/5 border border-blue-200 dark:border-blue-500/30 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all min-h-[44px]"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{roleLabel(r)}</option>
                    ))}
                  </select>
                </div>
              )}

              {addScope === 'operator' && (
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1.5">
                    Operator
                  </label>
                  {teamLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-white/40 py-2">
                      <Loader2 size={14} className="animate-spin" />
                      Loading team…
                    </div>
                  ) : teamMembers.length === 0 ? (
                    <input
                      type="text"
                      placeholder="Operator ID (team roster unavailable)"
                      value={addOperatorId}
                      onChange={(e) => setAddOperatorId(e.target.value)}
                      className="w-full px-3 py-2.5 text-base bg-white dark:bg-white/5 border border-blue-200 dark:border-blue-500/30 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all min-h-[44px]"
                    />
                  ) : (
                    <select
                      value={addOperatorId}
                      onChange={(e) => setAddOperatorId(e.target.value)}
                      className="w-full px-3 py-2.5 text-base bg-white dark:bg-white/5 border border-blue-200 dark:border-blue-500/30 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all min-h-[44px]"
                    >
                      <option value="">— select operator —</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({roleLabel(m.role)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1.5">
                  Note (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Safety training day"
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  className="w-full px-3 py-2.5 text-base bg-white dark:bg-white/5 border border-blue-200 dark:border-blue-500/30 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all min-h-[44px]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={resetAddForm}
                  disabled={addSaving}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-white/80 text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitOverride}
                  disabled={addSaving}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {addSaving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  Add Override
                </button>
              </div>
            </div>
          )}

          {/* Override list */}
          {overridesLoading ? (
            <div className="space-y-2.5 animate-pulse">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-4">
                  <div className="h-4 w-40 bg-gray-200 dark:bg-white/10 rounded mb-2" />
                  <div className="h-3 w-24 bg-gray-200 dark:bg-white/10 rounded" />
                </div>
              ))}
            </div>
          ) : overridesError ? (
            <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-8 text-center">
              <AlertTriangle className="text-red-400 mx-auto mb-2" size={20} />
              <p className="text-sm text-gray-600 dark:text-white/70 font-medium mb-3">Couldn&apos;t load overrides</p>
              <button
                onClick={fetchOverrides}
                className="min-h-[44px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
              >
                Try again
              </button>
            </div>
          ) : overrides.length === 0 ? (
            <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-8 text-center">
              <CalendarClock className="text-gray-300 dark:text-white/20 mx-auto mb-3" size={28} />
              <p className="text-sm font-semibold text-gray-700 dark:text-white/70">No overrides scheduled</p>
              <p className="text-xs text-gray-400 dark:text-white/40 mt-1">
                Add an override for days with unusual start times.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {overrides.map((ov) => {
                const isBusy = deletingId === ov.id;
                const scopeLabel =
                  ov.scope === 'all'
                    ? 'Everyone'
                    : ov.scope === 'role'
                    ? `Role: ${roleLabel(ov.role ?? '')}`
                    : `Operator: ${ov.operator_name ?? ov.operator_id ?? '—'}`;
                return (
                  <div
                    key={ov.id}
                    className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-4 flex items-start gap-3"
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                      <CalendarClock size={18} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">
                          {formatDay(ov.override_date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                          {ov.start_time}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">{scopeLabel}</p>
                      {ov.note && (
                        <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5 italic">{ov.note}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteOverride(ov.id)}
                      disabled={isBusy}
                      className="p-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50 flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label="Delete override"
                    >
                      {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>

      {/* ── Toast ──────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${
              toast.kind === 'ok' ? 'bg-emerald-600' : 'bg-rose-600'
            }`}
          >
            {toast.kind === 'ok' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
