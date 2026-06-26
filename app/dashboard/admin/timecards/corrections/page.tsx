'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatDay } from '@/lib/dates';
import {
  ArrowLeft, ClipboardEdit, Loader2, CheckCircle, XCircle,
  ArrowRight, AlertTriangle, MessageSquare, Pencil, X, Check, Inbox,
  MapPin, Camera, Wifi,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────
interface CorrectionRequest {
  id: string;
  timecard_id: string;
  requested_by: string;
  worker_name: string;
  worker_role: string;
  timecard_date: string | null;
  current_clock_in: string | null;
  current_clock_out: string | null;
  current_total_hours: number | null;
  requested_clock_in: string | null;
  requested_clock_out: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
  // Location fields (Part A)
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_in_method: string | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
  clock_out_outside_radius: boolean;
  remote_photo_url: string | null;
  clock_out_distance_meters: number | null;
  clock_out_distance_formatted: string | null;
  clock_out_drive_formatted: string | null;
  // Auto-flagged out-of-radius requests carry metadata.source = 'auto_out_of_radius'.
  metadata?: Record<string, unknown> | null;
  is_auto?: boolean;
}

// Remote clock-in entry from /api/admin/timecards/remote-verify GET
interface RemoteClockIn {
  id: string;
  user_id: string;
  employee_name: string;
  date: string; // YYYY-MM-DD
  clock_in_time: string; // ISO timestamp
  clock_in_method: string;
  remote_photo_url: string | null;
  // Short-lived signed URLs minted server-side for the PRIVATE timecard-photos
  // bucket. Render these (NOT the raw *_photo_url path, which is not viewable).
  remote_photo_signed_url: string | null;
  clock_out_photo_signed_url: string | null;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_in_accuracy: number | null;
  requires_approval: boolean | null;
  approval_note: string | null;
  maps_url: string | null;
  is_gps_remote: boolean;
}

type TabKey = 'pending' | 'approved' | 'rejected' | 'all' | 'remote';

const ALLOWED_ROLES = ['admin', 'super_admin', 'operations_manager'];

// ── Time helpers (clock_in/out are ISO timestamps → local time) ──
function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** ISO → value for a <input type="datetime-local"> (local components, NOT toISOString). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value (local) → ISO string. */
function localInputToISO(val: string): string | null {
  if (!val) return null;
  const d = new Date(val); // datetime-local has no tz → parsed as local
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDay(iso.slice(0, 10), { month: 'short', day: 'numeric' });
}

/** Compute total hours from two ISO timestamps (no lunch — display estimate only). */
function hoursBetween(inIso: string | null, outIso: string | null): number | null {
  if (!inIso || !outIso) return null;
  const a = new Date(inIso).getTime();
  const b = new Date(outIso).getTime();
  if (isNaN(a) || isNaN(b) || b <= a) return null;
  return Math.round(((b - a) / 3600000) * 100) / 100;
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    operator: 'Operator', apprentice: 'Apprentice', supervisor: 'Supervisor',
    admin: 'Admin', shop_manager: 'Shop Manager', operations_manager: 'Ops Manager',
    super_admin: 'Super Admin', salesman: 'Salesman', inventory_manager: 'Inventory',
  };
  return map[role] || role;
}

// ══════════════════════════════════════════════════════════════
export default function TimecardCorrectionsPage() {
  const router = useRouter();
  const isRedirecting = useRef(false);

  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<TabKey>('pending');
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Remote clock-ins state (Part B)
  const [remoteClockIns, setRemoteClockIns] = useState<RemoteClockIn[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteLoadError, setRemoteLoadError] = useState(false);
  const [remoteCount, setRemoteCount] = useState(0);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Per-request action state
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);      // request with open deny note field
  const [denyNote, setDenyNote] = useState('');
  const [modifyingId, setModifyingId] = useState<string | null>(null);  // request with open modify editor
  const [modifyIn, setModifyIn] = useState('');
  const [modifyOut, setModifyOut] = useState('');

  // Toast
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, kind: 'ok' | 'err') => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Auth guard ───────────────────────────────────────────────
  useEffect(() => {
    const u = getCurrentUser();
    if (!u) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(u.role)) { router.push('/dashboard'); return; }
    setUser(u);
  }, [router]);

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

  // ── Fetch list for a tab ─────────────────────────────────────
  const fetchRequests = useCallback(async (status: TabKey) => {
    setLoading(true);
    setLoadError(false);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/admin/timecards/correction-requests?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setLoadError(true); return; }
      const result = await res.json();
      if (result.success) {
        setRequests(result.data.requests || []);
      } else {
        setLoadError(true);
      }
    } catch (err) {
      console.error('Error fetching correction requests:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // ── Refresh pending badge count ──────────────────────────────
  const refreshPendingCount = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/admin/timecards/correction-requests?status=pending', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const result = await res.json();
      if (result.success) setPendingCount((result.data.requests || []).length);
    } catch { /* non-critical */ }
  }, [getToken]);

  // ── Fetch remote clock-ins (Part B) ─────────────────────────
  const fetchRemoteClockIns = useCallback(async () => {
    setRemoteLoading(true);
    setRemoteLoadError(false);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/admin/timecards/remote-verify', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setRemoteLoadError(true); return; }
      const result = await res.json();
      if (result.success) {
        const items: RemoteClockIn[] = result.data || [];
        setRemoteClockIns(items);
        setRemoteCount(items.length);
      } else {
        setRemoteLoadError(true);
      }
    } catch {
      setRemoteLoadError(true);
    } finally {
      setRemoteLoading(false);
    }
  }, [getToken]);

  // Seed the remote badge count on mount
  const refreshRemoteCount = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/admin/timecards/remote-verify', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const result = await res.json();
      if (result.success) setRemoteCount((result.data || []).length);
    } catch { /* non-critical */ }
  }, [getToken]);

  // POST to verify / reject a remote clock-in
  const verifyRemote = useCallback(async (timecardId: string, approved: boolean) => {
    setVerifyingId(timecardId);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/admin/timecards/remote-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ timecard_id: timecardId, approved }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(result.error || 'Failed to verify clock-in', 'err');
        return;
      }
      showToast(approved ? 'Remote clock-in approved' : 'Remote clock-in rejected', 'ok');
      // Remove the row optimistically and refresh
      setRemoteClockIns((prev) => prev.filter((r) => r.id !== timecardId));
      setRemoteCount((c) => Math.max(0, c - 1));
    } catch {
      showToast('Something went wrong', 'err');
    } finally {
      setVerifyingId(null);
    }
  }, [getToken, showToast]);

  useEffect(() => {
    if (user && tab !== 'remote') fetchRequests(tab);
    if (user && tab === 'remote') fetchRemoteClockIns();
  }, [user, tab, fetchRequests, fetchRemoteClockIns]);

  useEffect(() => {
    if (user) {
      refreshPendingCount();
      refreshRemoteCount();
    }
  }, [user, refreshPendingCount, refreshRemoteCount]);

  // ── Close any open inline editors ────────────────────────────
  const closeEditors = () => {
    setDenyingId(null);
    setDenyNote('');
    setModifyingId(null);
    setModifyIn('');
    setModifyOut('');
  };

  // ── Approve / Reject / Modify-and-approve ────────────────────
  const submitReview = useCallback(async (
    req: CorrectionRequest,
    action: 'approve' | 'reject',
    opts: { reviewerNotes?: string; overrideIn?: string | null; overrideOut?: string | null } = {}
  ) => {
    setSubmittingId(req.id);
    try {
      const token = await getToken();
      if (!token) return;

      const payload: Record<string, unknown> = { action };
      if (opts.reviewerNotes) payload.reviewer_notes = opts.reviewerNotes;
      if (opts.overrideIn !== undefined) payload.override_clock_in = opts.overrideIn;
      if (opts.overrideOut !== undefined) payload.override_clock_out = opts.overrideOut;

      const res = await fetch(`/api/admin/timecards/correction-requests/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(result.error || 'Failed to process request', 'err');
        return;
      }

      showToast(
        action === 'approve' ? 'Correction approved' : 'Correction denied',
        'ok'
      );
      closeEditors();
      // Optimistic: drop the row from the current view (it leaves "pending")
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      // Re-sync from server + badge
      fetchRequests(tab);
      refreshPendingCount();
    } catch (err) {
      console.error('Error reviewing correction:', err);
      showToast('Something went wrong', 'err');
    } finally {
      setSubmittingId(null);
    }
  }, [getToken, showToast, fetchRequests, tab, refreshPendingCount]);

  const openModify = (req: CorrectionRequest) => {
    setDenyingId(null);
    setModifyingId(req.id);
    // Prefill from requested values, falling back to current.
    setModifyIn(isoToLocalInput(req.requested_clock_in || req.current_clock_in));
    setModifyOut(isoToLocalInput(req.requested_clock_out || req.current_clock_out));
  };

  const confirmModify = (req: CorrectionRequest) => {
    const overrideIn = localInputToISO(modifyIn);
    const overrideOut = localInputToISO(modifyOut);
    if (overrideIn && overrideOut && new Date(overrideOut) <= new Date(overrideIn)) {
      showToast('Clock-out must be after clock-in', 'err');
      return;
    }
    if (!overrideIn && !overrideOut) {
      showToast('Enter at least one time', 'err');
      return;
    }
    submitReview(req, 'approve', {
      // Only send a side that has a value (null clears nothing; undefined = "don't override")
      overrideIn: overrideIn ?? undefined,
      overrideOut: overrideOut ?? undefined,
    });
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
    { key: 'remote', label: 'Remote Clock-ins' },
  ];

  const isReadOnlyTab = tab === 'approved' || tab === 'rejected';

  // ── Loading guard ────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-sm">
              <ClipboardEdit size={16} className="text-white" />
            </div>
            <span>Time Edit Requests</span>
          </h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5">
        {/* ── Tabs ───────────────────────────────────────────── */}
        <div className="mb-5 flex gap-1 bg-white dark:bg-white/5 rounded-xl p-1 border border-gray-200 dark:border-white/10 shadow-sm overflow-x-auto">
          {tabs.map(({ key, label }) => {
            const badgeCount = key === 'pending' ? pendingCount : key === 'remote' ? remoteCount : 0;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative flex-1 min-w-[72px] px-3 py-2 rounded-lg text-sm font-semibold transition-all min-h-[40px] ${
                  tab === key
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/80 hover:bg-gray-50 dark:hover:bg-white/8'
                }`}
              >
                {label}
                {badgeCount > 0 && (
                  <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                    tab === key ? 'bg-white text-violet-700' : 'bg-red-500 text-white'
                  }`}>
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Body ───────────────────────────────────────────── */}

        {/* ── Remote Clock-ins Tab (Part B) ──────────────────── */}
        {tab === 'remote' && (
          remoteLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-5 animate-pulse">
                  <div className="h-4 w-40 bg-gray-200 dark:bg-white/10 rounded mb-3" />
                  <div className="h-28 w-28 bg-gray-200 dark:bg-white/10 rounded-xl mb-3" />
                  <div className="h-3 w-32 bg-gray-200 dark:bg-white/10 rounded" />
                </div>
              ))}
            </div>
          ) : remoteLoadError ? (
            <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-12 text-center">
              <div className="w-14 h-14 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="text-red-500 dark:text-red-400" size={24} />
              </div>
              <p className="text-gray-700 dark:text-white/80 font-semibold mb-1">Couldn&apos;t load remote clock-ins</p>
              <p className="text-gray-400 dark:text-white/40 text-sm mb-5">Check your connection and try again.</p>
              <button
                onClick={fetchRemoteClockIns}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] py-3 px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
              >
                Try again
              </button>
            </div>
          ) : remoteClockIns.length === 0 ? (
            <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-12 text-center">
              <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="text-emerald-500 dark:text-emerald-400" size={26} />
              </div>
              <p className="text-gray-700 dark:text-white/80 font-semibold">All clear</p>
              <p className="text-gray-400 dark:text-white/40 text-sm mt-1">No pending remote clock-ins to review.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {remoteClockIns.map((entry) => {
                const busyVerify = verifyingId === entry.id;
                const dateLabel = entry.date ? formatDay(entry.date, { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
                const timeLabel = entry.clock_in_time ? fmtTime(entry.clock_in_time) : '—';
                return (
                  <div
                    key={entry.id}
                    className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm p-5"
                  >
                    {/* Header: name + date + method badge */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white text-[15px]">{entry.employee_name}</p>
                        <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">
                          {dateLabel} · {timeLabel}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
                        entry.is_gps_remote
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                      }`}>
                        <Wifi size={11} />
                        {entry.is_gps_remote ? 'GPS Remote' : 'Remote'}
                      </span>
                    </div>

                    {/* Selfie photo — render the server-minted signed URL only.
                        Legacy rows have the 'photo-upload-failed' sentinel or a
                        raw private path (no signed URL) → fall through to the
                        "No photo" placeholder instead of a broken <img>. */}
                    <div className="mb-4">
                      {(entry.remote_photo_signed_url || entry.clock_out_photo_signed_url) ? (
                        <img
                          src={(entry.remote_photo_signed_url || entry.clock_out_photo_signed_url) as string}
                          alt={`${entry.employee_name} clock-in selfie`}
                          className="w-28 h-28 object-cover rounded-xl border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5"
                        />
                      ) : (
                        <div className="w-28 h-28 rounded-xl border border-dashed border-gray-200 dark:border-white/15 bg-gray-50 dark:bg-white/[0.03] flex flex-col items-center justify-center gap-1.5">
                          <Camera size={22} className="text-gray-300 dark:text-white/20" />
                          <span className="text-[11px] text-gray-400 dark:text-white/30">No photo</span>
                        </div>
                      )}
                    </div>

                    {/* GPS coords */}
                    {(entry.clock_in_latitude != null && entry.clock_in_longitude != null) ? (
                      <div className="flex items-start gap-2 mb-4">
                        <MapPin size={14} className="text-gray-400 dark:text-white/40 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-700 dark:text-white/80">
                            {entry.clock_in_latitude.toFixed(6)}, {entry.clock_in_longitude.toFixed(6)}
                          </p>
                          {entry.clock_in_accuracy != null && (
                            <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">
                              Accuracy: ±{Math.round(entry.clock_in_accuracy)} m
                            </p>
                          )}
                          {entry.maps_url && (
                            <a
                              href={entry.maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-1 text-xs text-violet-600 dark:text-violet-400 hover:underline min-h-[44px] leading-tight"
                            >
                              <MapPin size={11} />
                              View on map
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 dark:text-white/40 mb-4 flex items-center gap-1.5">
                        <MapPin size={12} />
                        No GPS coordinates recorded
                      </p>
                    )}

                    {/* Admin note if any */}
                    {entry.approval_note && (
                      <div className="flex items-start gap-2 mb-3 px-1">
                        <MessageSquare size={14} className="text-gray-400 dark:text-white/40 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-gray-600 dark:text-white/70 leading-snug">{entry.approval_note}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        onClick={() => verifyRemote(entry.id, true)}
                        disabled={busyVerify}
                        className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {busyVerify ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                        Approve
                      </button>
                      <button
                        onClick={() => verifyRemote(entry.id, false)}
                        disabled={busyVerify}
                        className="min-h-[44px] px-4 rounded-xl bg-white dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <XCircle size={14} />
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── Correction Requests Tabs (pending/approved/rejected/all) ── */}
        {tab !== 'remote' && (
          loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-5 animate-pulse">
                  <div className="h-4 w-40 bg-gray-200 dark:bg-white/10 rounded mb-3" />
                  <div className="h-3 w-24 bg-gray-200 dark:bg-white/10 rounded mb-4" />
                  <div className="h-12 w-full bg-gray-200 dark:bg-white/10 rounded-xl" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-12 text-center">
              <div className="w-14 h-14 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="text-red-500 dark:text-red-400" size={24} />
              </div>
              <p className="text-gray-700 dark:text-white/80 font-semibold mb-1">Couldn&apos;t load requests</p>
              <p className="text-gray-400 dark:text-white/40 text-sm mb-5">Check your connection and try again.</p>
              <button
                onClick={() => fetchRequests(tab)}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] py-3 px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
              >
                Try again
              </button>
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 p-12 text-center">
              <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                {tab === 'pending'
                  ? <CheckCircle className="text-emerald-500 dark:text-emerald-400" size={26} />
                  : <Inbox className="text-gray-300 dark:text-white/30" size={26} />}
              </div>
              <p className="text-gray-700 dark:text-white/80 font-semibold">
                {tab === 'pending' ? 'All caught up' : 'Nothing here'}
              </p>
              <p className="text-gray-400 dark:text-white/40 text-sm mt-1">
                {tab === 'pending'
                  ? 'No pending time edit requests to review.'
                  : `No ${tab === 'all' ? '' : tab + ' '}requests found.`}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {(() => {
                // Founder's ask: keep auto-flagged out-of-geofence clock-outs in
                // their OWN section — they aren't worker-submitted edit requests.
                const geofenceRows = requests.filter((r) => r.is_auto);
                const realRequests = requests.filter((r) => !r.is_auto);
                const renderCard = (req: CorrectionRequest) => {
                const requestedTotal = hoursBetween(
                  req.requested_clock_in || req.current_clock_in,
                  req.requested_clock_out || req.current_clock_out
                );
                const inChanged = !!req.requested_clock_in &&
                  (!req.current_clock_in || new Date(req.requested_clock_in).getTime() !== new Date(req.current_clock_in).getTime());
                const outChanged = !!req.requested_clock_out &&
                  (!req.current_clock_out || new Date(req.requested_clock_out).getTime() !== new Date(req.current_clock_out).getTime());
                const busy = submittingId === req.id;
                const isPending = req.status === 'pending';
                const adminAdjusted = !!req.reviewer_notes && req.reviewer_notes.includes('[admin adjusted times]');
                // Show clock-out location when outside radius or distance data available.
                // Always show it for auto geofence flags — the distance IS the point.
                const showClockOutLocation =
                  req.is_auto ||
                  req.clock_out_outside_radius ||
                  (req.clock_out_distance_meters != null && req.clock_out_distance_formatted != null);

                return (
                  <div
                    key={req.id}
                    className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm p-5"
                  >
                    {/* Worker + date + submitted */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white text-[15px]">{req.worker_name}</p>
                        <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">
                          {roleLabel(req.worker_role)}
                          {req.timecard_date && <> · {formatDay(req.timecard_date, { weekday: 'short', month: 'short', day: 'numeric' })}</>}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className="text-[11px] text-gray-400 dark:text-white/40 whitespace-nowrap">{relativeTime(req.created_at)}</span>
                        {!isPending && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                            req.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                          }`}>
                            {req.status === 'approved' ? <Check size={10} /> : <X size={10} />}
                            {req.status}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* BEFORE → AFTER diff — only for real worker edit requests.
                        Auto geofence flags aren't a requested change, so the diff
                        (and its misleading "+0.50" lunch artifact) is suppressed. */}
                    {!req.is_auto && (
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 bg-gray-50 dark:bg-white/[0.03] rounded-xl p-3 sm:p-4 mb-3">
                      {/* Current */}
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-white/40 mb-1.5">Current</p>
                        <div className="space-y-1">
                          <p className="text-sm text-gray-700 dark:text-white/80">
                            <span className="text-gray-400 dark:text-white/40 text-xs">In </span>{fmtTime(req.current_clock_in)}
                          </p>
                          <p className="text-sm text-gray-700 dark:text-white/80">
                            <span className="text-gray-400 dark:text-white/40 text-xs">Out </span>{fmtTime(req.current_clock_out)}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-white/40 pt-0.5">
                            {req.current_total_hours != null ? `${req.current_total_hours.toFixed(2)} hrs` : '—'}
                          </p>
                        </div>
                      </div>

                      <ArrowRight size={18} className="text-violet-400 dark:text-violet-500 flex-shrink-0" />

                      {/* Requested */}
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500 dark:text-violet-400 mb-1.5">Requested</p>
                        <div className="space-y-1">
                          <p className={`text-sm font-medium ${inChanged ? 'text-violet-700 dark:text-violet-300' : 'text-gray-700 dark:text-white/80'}`}>
                            <span className="text-gray-400 dark:text-white/40 text-xs font-normal">In </span>
                            {fmtTime(req.requested_clock_in || req.current_clock_in)}
                          </p>
                          <p className={`text-sm font-medium ${outChanged ? 'text-violet-700 dark:text-violet-300' : 'text-gray-700 dark:text-white/80'}`}>
                            <span className="text-gray-400 dark:text-white/40 text-xs font-normal">Out </span>
                            {fmtTime(req.requested_clock_out || req.current_clock_out)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-white/50 pt-0.5">
                            {requestedTotal != null ? (
                              <>
                                {requestedTotal.toFixed(2)} hrs
                                {req.current_total_hours != null && (
                                  <span className={`ml-1 font-semibold ${
                                    requestedTotal - req.current_total_hours > 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : requestedTotal - req.current_total_hours < 0
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : ''
                                  }`}>
                                    ({requestedTotal - req.current_total_hours >= 0 ? '+' : ''}
                                    {(requestedTotal - req.current_total_hours).toFixed(2)})
                                  </span>
                                )}
                              </>
                            ) : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Clock-out location (Part A) */}
                    {showClockOutLocation && (
                      <div className={`flex items-start gap-2 mb-3 px-3 py-2.5 rounded-xl ${
                        req.clock_out_outside_radius
                          ? 'bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20'
                          : 'bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/10'
                      }`}>
                        <MapPin size={14} className={`mt-0.5 flex-shrink-0 ${
                          req.clock_out_outside_radius
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-gray-400 dark:text-white/40'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm leading-snug ${
                            req.clock_out_outside_radius
                              ? 'text-amber-800 dark:text-amber-200 font-medium'
                              : 'text-gray-600 dark:text-white/70'
                          }`}>
                            {req.clock_out_outside_radius && req.clock_out_distance_formatted
                              ? `Clocked out ${req.clock_out_distance_formatted} from shop (outside radius)`
                              : req.clock_out_distance_formatted
                                ? `Clocked out ${req.clock_out_distance_formatted} from shop`
                                : 'Clocked out outside geofence radius'}
                          </p>
                          {req.clock_out_drive_formatted && (
                            <p className={`text-xs mt-0.5 font-medium ${
                              req.clock_out_outside_radius
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-gray-500 dark:text-white/60'
                            }`}>
                              {req.clock_out_drive_formatted} drive from shop
                            </p>
                          )}
                          <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">
                            <span className="text-gray-500 dark:text-white/50">In </span>{fmtTime(req.current_clock_in)}
                            {' · '}
                            <span className="text-gray-500 dark:text-white/50">Out </span>{fmtTime(req.current_clock_out)}
                          </p>
                          {req.clock_out_latitude != null && req.clock_out_longitude != null && (
                            <a
                              href={`https://www.google.com/maps?q=${req.clock_out_latitude},${req.clock_out_longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-1 text-xs text-violet-600 dark:text-violet-400 hover:underline min-h-[44px] leading-tight"
                            >
                              <MapPin size={11} />
                              View on map
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Reason */}
                    <div className="flex items-start gap-2 mb-3 px-1">
                      <MessageSquare size={14} className="text-gray-400 dark:text-white/40 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-600 dark:text-white/70 leading-snug">{req.reason}</p>
                    </div>

                    {/* Read-only review info (approved/rejected) */}
                    {!isPending && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/10 space-y-1">
                        {req.reviewed_at && (
                          <p className="text-xs text-gray-400 dark:text-white/40">
                            Reviewed {relativeTime(req.reviewed_at)}
                            {adminAdjusted && <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-medium">· times adjusted by admin</span>}
                          </p>
                        )}
                        {req.reviewer_notes && (
                          <p className="text-sm text-gray-600 dark:text-white/70">
                            <span className="text-gray-400 dark:text-white/40 text-xs">Note: </span>
                            {req.reviewer_notes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* ── Pending actions ── */}
                    {isPending && !isReadOnlyTab && (
                      <>
                        {/* Deny note editor */}
                        {denyingId === req.id && (
                          <div className="mt-3 p-3 bg-rose-50/60 dark:bg-rose-500/10 rounded-xl border border-rose-100 dark:border-rose-500/20">
                            <label className="block text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1.5">
                              Reason for denial (optional)
                            </label>
                            <textarea
                              value={denyNote}
                              onChange={(e) => setDenyNote(e.target.value)}
                              rows={2}
                              placeholder="Let them know why…"
                              className="w-full px-3 py-2 text-base sm:text-sm bg-white dark:bg-white/5 border border-rose-200 dark:border-rose-500/30 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400 transition-all resize-none"
                            />
                            <div className="flex gap-2 mt-2.5">
                              <button
                                onClick={closeEditors}
                                disabled={busy}
                                className="flex-1 min-h-[44px] px-4 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-white/80 text-sm font-semibold transition-colors disabled:opacity-50"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => submitReview(req, 'reject', { reviewerNotes: denyNote.trim() || undefined })}
                                disabled={busy}
                                className="flex-1 min-h-[44px] px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                              >
                                {busy ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                                Confirm Deny
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Modify & approve editor */}
                        {modifyingId === req.id && (
                          <div className="mt-3 p-3 bg-violet-50/60 dark:bg-violet-500/10 rounded-xl border border-violet-100 dark:border-violet-500/20">
                            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-2.5">
                              Adjust the times before approving
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div>
                                <label className="block text-[11px] font-medium text-gray-500 dark:text-white/50 mb-1">Clock In</label>
                                <input
                                  type="datetime-local"
                                  value={modifyIn}
                                  onChange={(e) => setModifyIn(e.target.value)}
                                  className="w-full px-3 py-2 text-base sm:text-sm bg-white dark:bg-white/5 border border-violet-200 dark:border-violet-500/30 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition-all min-h-[44px]"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-gray-500 dark:text-white/50 mb-1">Clock Out</label>
                                <input
                                  type="datetime-local"
                                  value={modifyOut}
                                  onChange={(e) => setModifyOut(e.target.value)}
                                  className="w-full px-3 py-2 text-base sm:text-sm bg-white dark:bg-white/5 border border-violet-200 dark:border-violet-500/30 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition-all min-h-[44px]"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={closeEditors}
                                disabled={busy}
                                className="flex-1 min-h-[44px] px-4 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-white/80 text-sm font-semibold transition-colors disabled:opacity-50"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => confirmModify(req)}
                                disabled={busy}
                                className="flex-1 min-h-[44px] px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                              >
                                {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                Approve Adjusted
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Primary action row */}
                        {denyingId !== req.id && modifyingId !== req.id && (
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button
                              onClick={() => submitReview(req, 'approve')}
                              disabled={busy}
                              className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                              {req.is_auto ? 'Acknowledge' : 'Approve'}
                            </button>
                            <button
                              onClick={() => { closeEditors(); openModify(req); }}
                              disabled={busy}
                              className="min-h-[44px] px-4 rounded-xl bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                              <Pencil size={14} />
                              Modify
                            </button>
                            <button
                              onClick={() => { closeEditors(); setDenyingId(req.id); }}
                              disabled={busy}
                              className="min-h-[44px] px-4 rounded-xl bg-white dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                              <XCircle size={14} />
                              Deny
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
                };
                return (
                  <>
                    {geofenceRows.length > 0 && (
                      <section>
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <MapPin size={15} className="text-amber-500 dark:text-amber-400" />
                          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Clock-outs Outside Geofence</h2>
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 text-[11px] font-bold">{geofenceRows.length}</span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-white/40 mb-3 px-1 leading-snug">
                          No edit was requested — these crew clocked out beyond the shop radius. Review how far, then acknowledge.
                        </p>
                        <div className="space-y-3">{geofenceRows.map(renderCard)}</div>
                      </section>
                    )}
                    {realRequests.length > 0 && (
                      <section>
                        <div className="flex items-center gap-2 mb-3 px-1">
                          <ClipboardEdit size={15} className="text-violet-500 dark:text-violet-400" />
                          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Time Edit Requests</h2>
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 text-[11px] font-bold">{realRequests.length}</span>
                        </div>
                        <div className="space-y-3">{realRequests.map(renderCard)}</div>
                      </section>
                    )}
                  </>
                );
              })()}
            </div>
          )
        )}
      </div>

      {/* ── Toast ──────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${
            toast.kind === 'ok' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}>
            {toast.kind === 'ok' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
