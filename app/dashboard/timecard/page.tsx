'use client';

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, logout, type User } from '@/lib/auth';
import {
  ArrowLeft, Clock, Calendar, CheckCircle, AlertTriangle,
  ChevronLeft, ChevronRight, Moon, Factory, Briefcase, TrendingUp,
  LogOut, Loader2, FileText, CalendarOff, Wifi, MapPin
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import NFCClockIn, { type ClockInResult } from '@/components/NFCClockIn';

interface TimecardEntry {
  id: string;
  date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  total_hours: number | null;
  is_approved: boolean;
  is_shop_hours: boolean;
  is_night_shift: boolean;
  hour_type: string;
  notes: string | null;
}

interface WeekData {
  weekStart: Date;
  weekEnd: Date;
  entries: TimecardEntry[];
  totalHours: number;
  regularHours: number;
  weeklyOvertimeHours: number;
  nightShiftHours: number;
  mandatoryOvertimeHours: number;
  shopHours: number;
  daysWorked: number;
}

function getWeekBounds(offset: number) {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

export default function TimecardPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>}>
      <TimecardPage />
    </Suspense>
  );
}

function TimecardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [timecards, setTimecards] = useState<TimecardEntry[]>([]);
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [activeTimecard, setActiveTimecard] = useState<any>(null);
  const [clockLoading, setClockLoading] = useState(true);
  const [clockingAction, setClockingAction] = useState(false);
  const [clockMethod, setClockMethod] = useState<'nfc' | 'gps' | 'remote'>('nfc');
  const [liveHours, setLiveHours] = useState('0.0');
  const [showTimeOffRequest, setShowTimeOffRequest] = useState(false);
  const [bypassNfc, setBypassNfc] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRedirecting = useRef(false);

  const redirectToLogin = useCallback(() => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    localStorage.removeItem('supabase-user');
    localStorage.removeItem('patriot-user');
    window.location.href = '/login';
  }, []);

  const { monday, sunday } = useMemo(() => getWeekBounds(currentWeekOffset), [currentWeekOffset]);

  // Check for bypass_nfc URL param
  useEffect(() => {
    if (searchParams.get('bypass_nfc') === 'true') {
      setBypassNfc(true);
      setClockMethod('gps');
    }
  }, [searchParams]);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    setUser(currentUser);
  }, [router]);

  // Fetch active timecard on mount
  const fetchActiveTimecard = useCallback(async () => {
    if (isRedirecting.current) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/timecard/current', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setActiveTimecard(json.data || null);
      }
    } catch (err) {
      console.error('Error fetching active timecard:', err);
    }
    setClockLoading(false);
  }, []);

  useEffect(() => {
    if (user) fetchActiveTimecard();
  }, [user, fetchActiveTimecard]);

  // Live hours counter
  useEffect(() => {
    if (!activeTimecard?.clockInTime) return;
    const update = () => {
      const start = new Date(activeTimecard.clockInTime).getTime();
      const hrs = ((Date.now() - start) / 3600000).toFixed(1);
      setLiveHours(hrs);
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [activeTimecard]);

  const handleClockIn = useCallback(async (nfcTagUid?: string) => {
    setClockingAction(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let latitude: number | undefined, longitude: number | undefined, accuracy: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        accuracy = pos.coords.accuracy;
      } catch { /* GPS optional for NFC */ }

      const body: Record<string, unknown> = {
        clock_in_method: nfcTagUid ? 'nfc' : clockMethod,
        latitude, longitude, accuracy,
      };
      if (nfcTagUid) body.nfc_tag_uid = nfcTagUid;

      const res = await fetch('/api/timecard/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await fetchActiveTimecard();
      } else {
        const err = await res.json();
        alert(err.error || 'Clock-in failed');
      }
    } catch (err: any) {
      alert(err.message || 'Clock-in failed');
    }
    setClockingAction(false);
  }, [clockMethod, fetchActiveTimecard]);

  const handleClockOut = useCallback(async () => {
    setClockingAction(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let latitude: number | undefined, longitude: number | undefined, accuracy: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        accuracy = pos.coords.accuracy;
      } catch { /* GPS optional */ }

      const res = await fetch('/api/timecard/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ latitude, longitude, accuracy }),
      });

      if (res.ok) {
        setActiveTimecard(null);
        fetchTimecards();
      } else {
        const err = await res.json();
        alert(err.error || 'Clock-out failed');
      }
    } catch (err: any) {
      alert(err.message || 'Clock-out failed');
    }
    setClockingAction(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTimecards = useCallback(async () => {
    if (isRedirecting.current) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) { redirectToLogin(); return; }
      const session = data.session;

      const url = `/api/timecard/history?startDate=${monday.toISOString().split('T')[0]}&endDate=${sunday.toISOString().split('T')[0]}&limit=100`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.status === 401) { redirectToLogin(); return; }
      const result = await response.json();

      if (result.success) {
        const entries: TimecardEntry[] = result.data.timecards;
        setTimecards(entries);

        const totalHours = entries.reduce((sum, entry) => sum + (entry.total_hours || 0), 0);
        const mandatoryOvertimeHours = entries.filter(e => e.hour_type === 'mandatory_overtime').reduce((sum, e) => sum + (e.total_hours || 0), 0);
        const weekdayHours = entries.filter(e => e.hour_type !== 'mandatory_overtime').reduce((sum, e) => sum + (e.total_hours || 0), 0);
        const weeklyOvertimeHours = Math.max(0, weekdayHours - 40);
        const regularHours = Math.min(weekdayHours, 40);
        const nightShiftHours = entries.filter(e => e.is_night_shift).reduce((sum, e) => sum + (e.total_hours || 0), 0);
        const shopHours = entries.filter(e => e.is_shop_hours).reduce((sum, e) => sum + (e.total_hours || 0), 0);
        const uniqueDays = new Set(entries.map(e => e.date));

        setWeekData({
          weekStart: monday, weekEnd: sunday, entries, totalHours, regularHours,
          weeklyOvertimeHours, nightShiftHours, mandatoryOvertimeHours, shopHours,
          daysWorked: uniqueDays.size,
        });
      }
    } catch (error) {
      console.error('Error fetching timecards:', error);
    } finally {
      setLoading(false);
    }
  }, [monday, sunday, redirectToLogin]);

  useEffect(() => {
    if (user) fetchTimecards();
  }, [user, fetchTimecards]);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const formatTime = (dateString: string) =>
    new Date(dateString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const formatWeekRange = () => {
    const start = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${start} – ${end}`;
  };

  const isCurrentWeek = () => currentWeekOffset === 0;

  const getEntryBadges = (entry: TimecardEntry) => {
    const badges: { label: string; color: string; icon: React.ReactNode }[] = [];
    if (entry.is_shop_hours) badges.push({ label: 'Shop', color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700/50', icon: <Factory size={10} /> });
    if (entry.is_night_shift) badges.push({ label: 'Night', color: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-700/50', icon: <Moon size={10} /> });
    if (entry.hour_type === 'mandatory_overtime') badges.push({ label: 'Weekend OT', color: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700/50', icon: <AlertTriangle size={10} /> });
    return badges;
  };

  // Build today's timeline segments from entries
  const todayEntries = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return (weekData?.entries || []).filter(e => e.date === today);
  }, [weekData]);

  // Week day grid
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayEntries = (weekData?.entries || []).filter(e => e.date === dateStr);
      const totalHrs = dayEntries.reduce((s, e) => s + (e.total_hours || 0), 0);
      days.push({
        date: d,
        dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
        entries: dayEntries,
        totalHrs,
        isToday: dateStr === new Date().toISOString().split('T')[0],
        hasEntries: dayEntries.length > 0,
      });
    }
    return days;
  }, [monday, weekData]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-purple-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-600 animate-spin"></div>
          </div>
          <p className="text-gray-500 dark:text-white/60 text-sm font-medium">Loading timecards...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618]">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-white dark:bg-white/5 border-b border-gray-200 dark:border-white/10 shadow-sm">
        <div className="max-w-[1024px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-3 py-1.5 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-all text-sm font-medium border border-gray-200 dark:border-white/10"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <div className="h-6 w-px bg-gray-200 dark:bg-white/10" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center shadow-sm">
                <Clock size={16} className="text-white" />
              </div>
              My Timecard
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/request-time-off"
              className="flex items-center gap-1.5 px-3 py-2.5 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 rounded-lg text-xs font-semibold border border-gray-200 dark:border-white/10 shadow-sm transition-all min-h-[40px]"
            >
              <CalendarOff size={14} />
              <span className="hidden sm:inline">Request Time Off</span>
            </Link>
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-800 dark:text-white leading-tight">{user?.name}</p>
                <p className="text-[11px] text-gray-400 dark:text-white/40 font-medium capitalize">{user?.role}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1024px] mx-auto px-4 sm:px-6 py-6">
        {/* ── Clock-In/Out Section ─────────────────────── */}
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm p-5 mb-6">
          {clockLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : activeTimecard ? (
            /* CLOCKED IN STATE */
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-700/50">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-semibold">Clocked In</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  since {new Date(activeTimecard.clockInTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>

              <div>
                <p className="text-4xl font-bold text-gray-900 dark:text-white tabular-nums">{liveHours}</p>
                <p className="text-sm text-gray-500 dark:text-white/60">hours today</p>
              </div>

              {/* Today's Timeline */}
              {todayEntries.length > 0 && (
                <div className="max-w-sm mx-auto">
                  <div className="flex items-center gap-1 mb-2">
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                      {todayEntries.map((entry, i) => {
                        const hrs = entry.total_hours || parseFloat(liveHours) || 0;
                        const pct = Math.min((hrs / 10) * 100, 100);
                        return (
                          <div
                            key={i}
                            className={`h-full rounded-full ${
                              entry.is_shop_hours ? 'bg-amber-400' :
                              entry.is_night_shift ? 'bg-indigo-500' :
                              entry.hour_type === 'mandatory_overtime' ? 'bg-red-400' :
                              'bg-blue-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 dark:text-white/40">
                    <span>0h</span>
                    <span>4h</span>
                    <span>8h</span>
                    <span>10h</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleClockOut}
                disabled={clockingAction}
                className="w-full max-w-xs mx-auto py-4 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {clockingAction ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                Clock Out
              </button>
            </div>
          ) : (
            /* NOT CLOCKED IN STATE */
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/60 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-sm font-semibold">Not Clocked In</span>
                </div>
              </div>

              {/* Bypass NFC Banner */}
              {bypassNfc && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl p-4 text-left max-w-sm mx-auto">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Remote Clock-In</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        NFC requirement has been bypassed by your admin. GPS location will still be captured. Clock in using the button below.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {bypassNfc ? (
                /* Legacy bypass flow — kept for admin-bypass notifications */
                <button onClick={() => handleClockIn()} disabled={clockingAction}
                  className="w-full max-w-xs mx-auto py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
                  {clockingAction ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
                  Clock In (Remote - No NFC)
                </button>
              ) : (
                /* NFCClockIn component: NFC scan / daily PIN / out-of-town GPS remote */
                <NFCClockIn
                  disabled={clockingAction}
                  onClockIn={(result: ClockInResult) => {
                    if (result.success) {
                      fetchActiveTimecard();
                    } else {
                      alert(result.error);
                    }
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Week Navigation ───────────────────────────── */}
        <div className="mb-5 flex items-center justify-between">
          <button
            onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 rounded-lg transition-all text-sm font-medium border border-gray-200 dark:border-white/10 shadow-sm hover:shadow"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Prev</span>
          </button>

          <div className="text-center">
            <p className="text-base font-bold text-gray-900 dark:text-white">{formatWeekRange()}</p>
            <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">
              {isCurrentWeek() ? 'Current Week' : `${Math.abs(currentWeekOffset)} ${Math.abs(currentWeekOffset) === 1 ? 'week' : 'weeks'} ago`}
            </p>
          </div>

          <button
            onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
            disabled={isCurrentWeek()}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all text-sm font-medium border shadow-sm ${
              isCurrentWeek()
                ? 'bg-gray-50 dark:bg-white/5 text-gray-300 dark:text-white/20 border-gray-100 dark:border-white/5 cursor-not-allowed'
                : 'bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 border-gray-200 dark:border-white/10 hover:shadow'
            }`}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* ── Week Day Grid (visual) ───────────────────── */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-5">
          {weekDays.map((day) => (
            <div
              key={day.dateStr}
              className={`bg-white dark:bg-white/5 rounded-xl p-1.5 sm:p-3 border text-center transition-all ${
                day.isToday
                  ? 'border-blue-300 dark:border-blue-500 shadow-md ring-2 ring-blue-100 dark:ring-blue-500/20'
                  : day.hasEntries
                    ? 'border-gray-200/60 dark:border-white/10 shadow-sm'
                    : 'border-gray-100 dark:border-white/5 opacity-60'
              }`}
            >
              <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${day.isToday ? 'text-blue-600' : 'text-gray-400 dark:text-white/40'}`}>
                {day.dayName}
              </p>
              <p className={`text-sm sm:text-lg font-bold ${day.isToday ? 'text-blue-700' : 'text-gray-800 dark:text-white'}`}>
                {day.dayNum}
              </p>
              {day.hasEntries ? (
                <p className={`text-[9px] sm:text-xs font-bold mt-0.5 sm:mt-1 ${day.totalHrs > 8 ? 'text-orange-600' : 'text-emerald-600'}`}>
                  {day.totalHrs.toFixed(1)}h
                </p>
              ) : (
                <p className="text-[9px] text-gray-300 dark:text-white/20 mt-0.5 sm:mt-1">&mdash;</p>
              )}
              {/* Tiny bar */}
              <div className="h-1 bg-gray-100 dark:bg-white/10 rounded-full mt-1 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    day.totalHrs > 8 ? 'bg-orange-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min((day.totalHrs / 10) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* ── PDF Download ──────────────────────────────── */}
        <div className="mb-5 flex justify-end">
          <button
            onClick={() => {
              const mondayStr = monday.toISOString().split('T')[0];
              window.open(`/api/timecard/pdf?weekStart=${mondayStr}`, '_blank');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-blue-700 dark:text-blue-400 rounded-lg transition-all text-sm font-medium border border-blue-200 dark:border-white/10 shadow-sm hover:shadow"
          >
            <FileText size={16} />
            Download My Timecard
          </button>
        </div>

        {/* ── Weekly Summary Cards ─────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          <div className="col-span-2 sm:col-span-1 bg-purple-600 rounded-xl p-5 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-6 translate-x-6" />
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={15} className="text-blue-200" />
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Total Hours</span>
            </div>
            <p className="text-3xl font-bold tracking-tight tabular-nums">{weekData?.totalHours.toFixed(1) || '0.0'}</p>
            <div className="mt-3 h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  (weekData?.weeklyOvertimeHours || 0) > 0 ? 'bg-gradient-to-r from-green-300 via-yellow-300 to-red-400' : 'bg-blue-300'
                }`}
                style={{ width: `${Math.min(((weekData?.totalHours || 0) / 60) * 100, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-blue-300 mt-1">
              {(weekData?.weeklyOvertimeHours || 0) > 0
                ? `${weekData?.weeklyOvertimeHours.toFixed(1)} hrs weekly OT`
                : `${(40 - ((weekData?.totalHours || 0) - (weekData?.mandatoryOvertimeHours || 0))).toFixed(1)} hrs to OT`}
            </p>
          </div>

          <div className="bg-white dark:bg-white/5 rounded-xl p-4 border border-gray-200/60 dark:border-white/10 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider">Days</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                <Calendar size={15} className="text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{weekData?.daysWorked || 0}</p>
            <p className="text-[11px] text-gray-400 dark:text-white/40 mt-0.5">{weekData?.entries.length || 0} entries</p>
          </div>

          <div className="bg-white dark:bg-white/5 rounded-xl p-4 border border-gray-200/60 dark:border-white/10 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider">Approved</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <CheckCircle size={15} className="text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {weekData?.entries.filter(e => e.is_approved).length || 0}
              <span className="text-sm font-normal text-gray-400 dark:text-white/40 ml-1">/ {weekData?.entries.length || 0}</span>
            </p>
            <p className="text-[11px] text-gray-400 dark:text-white/40 mt-0.5">
              {(weekData?.entries.filter(e => !e.is_approved).length || 0) > 0
                ? `${weekData?.entries.filter(e => !e.is_approved).length} pending`
                : 'All approved'}
            </p>
          </div>
        </div>

        {/* ── Hour Category Breakdown ────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          {[
            { label: 'Regular', value: (weekData?.regularHours || 0).toFixed(1), icon: <CheckCircle size={14} />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-100 dark:border-emerald-700/40' },
            { label: 'Weekly OT', value: (weekData?.weeklyOvertimeHours || 0).toFixed(1), icon: <TrendingUp size={14} />, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-100 dark:border-orange-700/40' },
            { label: 'Mandatory OT', value: (weekData?.mandatoryOvertimeHours || 0).toFixed(1), icon: <Briefcase size={14} />, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-100 dark:border-red-700/40' },
            { label: 'Night Shift', value: (weekData?.nightShiftHours || 0).toFixed(1), icon: <Moon size={14} />, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-100 dark:border-indigo-700/40' },
            { label: 'Shop Hours', value: (weekData?.shopHours || 0).toFixed(1), icon: <Factory size={14} />, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-100 dark:border-amber-700/40' },
          ].map(({ label, value, icon, color, bg, border }) => (
            <div key={label} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border ${border} ${bg}`}>
              <div className={color}>{icon}</div>
              <div>
                <p className={`text-sm font-bold ${color}`}>{value}<span className="text-[10px] font-normal ml-0.5">hrs</span></p>
                <p className="text-[10px] text-gray-500 dark:text-white/60 font-medium">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── OT Alerts ──────────────────────────────────── */}
        {weekData && weekData.weeklyOvertimeHours > 0 && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700/50 rounded-lg">
            <AlertTriangle size={16} className="text-orange-600 dark:text-orange-400 flex-shrink-0" />
            <p className="text-sm text-orange-700 dark:text-orange-300">
              <strong>{weekData.weeklyOvertimeHours.toFixed(1)} weekly overtime hours</strong> -- Mon-Fri hours exceeded 40.
            </p>
          </div>
        )}

        {weekData && weekData.mandatoryOvertimeHours > 0 && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg">
            <Briefcase size={16} className="text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">
              <strong>{weekData.mandatoryOvertimeHours.toFixed(1)} hours</strong> of weekend/mandatory overtime recorded.
            </p>
          </div>
        )}

        {/* ── Daily Entries Table ─────────────────────────── */}
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10">
            <h2 className="text-sm font-bold text-gray-800 dark:text-white">Daily Entries</h2>
            <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">
              {weekData?.entries.length || 0} {(weekData?.entries.length || 0) === 1 ? 'entry' : 'entries'} this week
            </p>
          </div>

          {loading ? (
            <div className="p-16 text-center">
              <div className="w-10 h-10 mx-auto mb-3 relative">
                <div className="absolute inset-0 rounded-full border-[3px] border-gray-100 dark:border-white/10"></div>
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-blue-600 animate-spin"></div>
              </div>
              <p className="text-gray-400 dark:text-white/40 text-sm">Loading entries...</p>
            </div>
          ) : !weekData || weekData.entries.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-gray-50 dark:bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="text-gray-300 dark:text-white/20" size={28} />
              </div>
              <p className="text-gray-600 dark:text-white/60 font-semibold">No entries this week</p>
              <p className="text-gray-400 dark:text-white/40 text-sm mt-1">Clock in from the dashboard to start tracking</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80 dark:bg-white/5 border-b border-gray-100 dark:border-white/10">
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-white/60 uppercase tracking-wider">Date</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-white/60 uppercase tracking-wider">In</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-white/60 uppercase tracking-wider">Out</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-white/60 uppercase tracking-wider">Hrs</th>
                    <th className="hidden sm:table-cell px-3 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-white/60 uppercase tracking-wider">Category</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-white/60 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {weekData.entries.map((entry) => {
                    const badges = getEntryBadges(entry);
                    const isMandatoryOT = entry.hour_type === 'mandatory_overtime';
                    return (
                      <tr
                        key={entry.id}
                        className={`group transition-colors hover:bg-blue-50/40 dark:hover:bg-white/5 ${
                          isMandatoryOT ? 'border-l-[3px] border-l-red-400' : 'border-l-[3px] border-l-transparent'
                        }`}
                      >
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-xs font-medium text-gray-700 dark:text-white/80">{formatDate(entry.date)}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-xs font-medium text-gray-700 dark:text-white/80 tabular-nums">{formatTime(entry.clock_in_time)}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {entry.clock_out_time ? (
                            <span className="text-xs font-medium text-gray-700 dark:text-white/80 tabular-nums">{formatTime(entry.clock_out_time)}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/50">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                              <span className="hidden sm:inline">Active</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {entry.total_hours !== null ? (
                            <span className="text-xs font-bold tabular-nums text-gray-800 dark:text-white">{entry.total_hours.toFixed(2)}</span>
                          ) : (
                            <span className="text-xs text-gray-300">&mdash;</span>
                          )}
                        </td>
                        <td className="hidden sm:table-cell px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {badges.length > 0 ? badges.map((badge, bidx) => (
                              <span key={bidx} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badge.color}`}>
                                {badge.icon}{badge.label}
                              </span>
                            )) : (
                              <span className="text-[10px] text-gray-400 dark:text-white/40 font-medium">Regular</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {entry.is_approved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/50">
                              <CheckCircle size={10} />
                              <span className="hidden sm:inline">Approved</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50">
                              <Clock size={10} />
                              <span className="hidden sm:inline">Pending</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Legend ──────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-2 py-3 text-[11px] text-gray-500 dark:text-white/60">
          {[
            { color: 'bg-emerald-500', label: 'Regular (Mon-Fri, up to 40 hrs)' },
            { color: 'bg-orange-500', label: 'Weekly OT (Mon-Fri over 40 hrs)' },
            { color: 'bg-red-500', label: 'Mandatory OT (Sat/Sun)' },
            { color: 'bg-indigo-500', label: 'Night Shift (clock-in after 3 PM)' },
            { color: 'bg-amber-500', label: 'Shop Hours (in-shop work)' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${color} rounded-full`} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
