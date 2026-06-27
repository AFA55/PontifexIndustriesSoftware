'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Info,
  AlertTriangle,
  CheckCircle2,
  Send,
  ArrowLeft,
  Loader2,
  Wallet,
  History,
  Pencil,
  XCircle,
  BadgeDollarSign,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { toLocalYMD, formatDay, formatDayLong, parseYMDLocal } from '@/lib/dates';

type TimeOffType = 'vacation' | 'pto' | 'unpaid';

interface MyRequest {
  id: string;
  date: string;
  end_date: string | null;
  type: string;
  is_paid: boolean;
  pay_override: string | null;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  notes: string | null;
  pto_days_used: number;
  edited_at: string | null;
  created_at: string;
}

interface PtoBalance {
  year: number;
  allocated: number;
  used: number;
  remaining: number;
}

function countDays(start: string, end?: string | null) {
  if (!start) return 0;
  const e = end && end >= start ? end : start;
  const ms = parseYMDLocal(e).getTime() - parseYMDLocal(start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 ring-1 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300',
    approved: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300',
    denied: 'bg-rose-100 text-rose-700 ring-1 ring-rose-300 dark:bg-rose-500/15 dark:text-rose-300',
    cancelled: 'bg-gray-100 text-gray-500 ring-1 ring-gray-300 dark:bg-white/10 dark:text-white/50',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${map[status] ?? map.cancelled}`}>
      {status}
    </span>
  );
}

export default function RequestTimeOffPage() {
  const [token, setToken] = useState('');
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    type: 'vacation' as TimeOffType,
    reason: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advanceError, setAdvanceError] = useState<{ message: string; earliestDate: string } | null>(null);

  const [balance, setBalance] = useState<PtoBalance | null>(null);
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? '');
    });
  }, []);

  const authHeaders = useCallback(
    (): Record<string, string> => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token]
  );

  /** Parse a fetch Response defensively — a 404/HTML body must never throw
   *  Safari's cryptic "The string did not match the expected pattern". */
  const safeJson = async (res: Response): Promise<any> => {
    try {
      return await res.json();
    } catch {
      return { error: `Request failed (${res.status}). Please try again.` };
    }
  };

  const loadHistory = useCallback(async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const [reqRes, balRes] = await Promise.all([
        fetch('/api/operator/time-off', { headers: authHeaders() }),
        fetch('/api/operator/pto-balance', { headers: authHeaders() }),
      ]);
      const reqJson = await safeJson(reqRes);
      if (reqRes.ok && reqJson.success) setRequests(reqJson.data ?? []);
      const balJson = await safeJson(balRes);
      if (balRes.ok && balJson.success) setBalance(balJson.data);
    } catch {
      /* non-fatal — form still works */
    }
    setHistoryLoading(false);
  }, [token, authHeaders]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === 'startDate') setAdvanceError(null);
  };

  const getEarliestEligibleDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 28);
    return toLocalYMD(d);
  };

  const startEdit = (r: MyRequest) => {
    setEditingId(r.id);
    setFormData({
      startDate: r.date,
      endDate: r.end_date || r.date,
      type: (['vacation', 'pto', 'unpaid'].includes(r.type) ? r.type : 'vacation') as TimeOffType,
      reason: r.notes ?? '',
    });
    setError(null);
    setAdvanceError(null);
    setSuccess(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ startDate: '', endDate: '', type: 'vacation', reason: '' });
  };

  const handleCancelRequest = async (id: string) => {
    setCancelingId(id);
    try {
      const res = await fetch(`/api/operator/time-off?id=${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const json = await safeJson(res);
      if (!res.ok) setError(json.error ?? 'Failed to cancel request');
      else {
        if (editingId === id) cancelEdit();
        await loadHistory();
      }
    } catch {
      setError('Failed to cancel request');
    }
    setCancelingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdvanceError(null);

    if (!formData.startDate || !formData.endDate || !formData.reason.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    if (formData.endDate < formData.startDate) {
      setError('End date must be after start date');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const user = getCurrentUser();
      if (!user) {
        setError('Not authenticated. Please log in again.');
        return;
      }

      const res = await fetch('/api/operator/time-off', {
        method: editingId ? 'PATCH' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          startDate: formData.startDate,
          endDate: formData.endDate,
          type: formData.type,
          reason: formData.reason,
        }),
      });

      const json = await safeJson(res);

      if (res.status === 422 && json.error_code === 'advance_notice_required') {
        setAdvanceError({
          message: json.error ?? 'Request submitted less than 28 days in advance.',
          earliestDate: json.earliest_date ?? getEarliestEligibleDate(),
        });
        return;
      }

      if (!res.ok) {
        setError(json.error ?? 'Failed to submit request');
        return;
      }

      setSuccess(
        editingId
          ? 'Your request was updated and sent back for re-approval.'
          : 'Your time off request has been sent for approval.'
      );
      setEditingId(null);
      setFormData({ startDate: '', endDate: '', type: 'vacation', reason: '' });
      await loadHistory();
      setTimeout(() => setSuccess(null), 6000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to submit request: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeOptions: { value: TimeOffType; label: string; icon: string; description: string; color: string }[] = [
    { value: 'vacation', label: 'Vacation Time', icon: '🏖️', description: 'Paid — uses your accrued vacation days', color: 'from-blue-500 to-cyan-600' },
    { value: 'pto', label: 'PTO (Paid Time Off)', icon: '🎯', description: 'Paid — uses your PTO balance', color: 'from-green-500 to-emerald-600' },
    { value: 'unpaid', label: 'Unpaid Time Off', icon: '📅', description: 'Time off without pay', color: 'from-gray-500 to-gray-600' },
  ];

  const typeLabel = (t: string) =>
    t === 'pto' ? 'PTO' : t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand/5 dark:from-[#0b0618] dark:via-[#0b0618] dark:to-[#150b2e]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand/30 rounded-full opacity-10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-brand-accent/30 rounded-full opacity-10 blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-8 relative">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard"
            className="p-3 min-h-[44px] min-w-[44px] bg-white/70 dark:bg-white/[0.06] backdrop-blur-xl rounded-xl border border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 hover:bg-white dark:hover:bg-white/10 transition-all shadow-sm flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-brand to-brand-accent bg-clip-text text-transparent">
              Request Time Off
            </h1>
            <p className="text-gray-600 dark:text-white/50 font-medium mt-1">Submit your vacation and PTO requests</p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          {/* PTO balance */}
          <div className="bg-white/80 dark:bg-white/[0.05] backdrop-blur-lg rounded-2xl border border-gray-200 dark:border-white/10 p-5 shadow-lg flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center flex-shrink-0 shadow">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-500 dark:text-white/50">
                Paid Time Off Balance {balance ? `(${balance.year})` : ''}
              </p>
              {balance ? (
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {balance.remaining}
                  <span className="text-sm font-medium text-gray-400 dark:text-white/40"> of {balance.allocated} days remaining</span>
                </p>
              ) : (
                <p className="text-sm text-gray-400 dark:text-white/40">Loading…</p>
              )}
            </div>
            {balance && (
              <div className="hidden sm:block w-32">
                <div className="h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
                    style={{ width: `${Math.min(100, Math.round((balance.remaining / Math.max(1, balance.allocated)) * 100))}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 dark:text-white/35 mt-1 text-right">{balance.used} used</p>
              </div>
            )}
          </div>

          {/* 4-Week Advance Notice Banner */}
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 rounded-xl p-4 flex gap-3 items-start">
            <Info size={18} className="text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Plan Ahead — 4-Week Advance Notice Required</p>
              <p className="text-sm text-blue-600 dark:text-blue-300/80 mt-0.5">
                To keep our crews covered and customers happy, all time-off requests must be submitted
                at least <strong>4 weeks before your first day off</strong>. Requests submitted less than
                28 days in advance cannot be approved. The earlier you submit, the better your chances
                of approval!
              </p>
            </div>
          </div>

          {/* Advance Notice Error */}
          {advanceError && (
            <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 rounded-xl p-4 flex gap-3 items-start">
              <AlertTriangle size={18} className="text-rose-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">Request Cannot Be Submitted</p>
                <p className="text-sm text-rose-600 dark:text-rose-300/80 mt-0.5">{advanceError.message}</p>
                <p className="text-sm text-rose-700 dark:text-rose-300 mt-2 font-medium">
                  Earliest date you can request off:{' '}
                  <strong className="text-rose-800 dark:text-rose-200">{formatDayLong(advanceError.earliestDate)}</strong>
                </p>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="bg-green-50 dark:bg-emerald-500/10 rounded-2xl border-2 border-green-300 dark:border-emerald-500/30 p-6 shadow-lg">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-emerald-400 flex-shrink-0" />
                <div>
                  <h3 className="text-gray-800 dark:text-white font-bold text-lg">Request Submitted!</h3>
                  <p className="text-gray-600 dark:text-white/60 font-medium">{success}</p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-500/10 rounded-2xl border-2 border-red-200 dark:border-red-500/25 p-4 flex items-center justify-between gap-3">
              <p className="text-red-800 dark:text-red-300 font-medium text-sm">{error}</p>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-sm font-semibold shrink-0 min-h-[44px] px-2">
                Dismiss
              </button>
            </div>
          )}

          {/* Editing banner */}
          {editingId && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-sm font-semibold">
                <Pencil className="w-4 h-4 shrink-0" />
                Editing a pending request — saving sends it back for re-approval.
              </div>
              <button
                onClick={cancelEdit}
                className="text-amber-700 dark:text-amber-300 text-sm font-semibold underline shrink-0 min-h-[44px] px-2"
              >
                Stop editing
              </button>
            </div>
          )}

          {/* Main Form */}
          <form onSubmit={handleSubmit} className="bg-white/80 dark:bg-white/[0.05] backdrop-blur-lg rounded-2xl border border-gray-200 dark:border-white/10 p-5 sm:p-8 shadow-lg space-y-8">
            {/* Date range */}
            <div>
              <label className="text-gray-800 dark:text-white font-bold text-lg mb-4 block">
                Select Dates <span className="text-red-600">*</span>
              </label>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="text-gray-700 dark:text-white/70 font-semibold text-sm mb-2 block">Start Date</label>
                  <input
                    type="date"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleInputChange}
                    min={toLocalYMD()}
                    required
                    className="w-full px-4 py-4 bg-white dark:bg-white/[0.06] border-2 border-gray-300 dark:border-white/15 rounded-xl text-gray-800 dark:text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all shadow-sm min-h-[56px]"
                  />
                </div>
                <div>
                  <label className="text-gray-700 dark:text-white/70 font-semibold text-sm mb-2 block">End Date</label>
                  <input
                    type="date"
                    name="endDate"
                    value={formData.endDate}
                    onChange={handleInputChange}
                    min={formData.startDate || toLocalYMD()}
                    required
                    className="w-full px-4 py-4 bg-white dark:bg-white/[0.06] border-2 border-gray-300 dark:border-white/15 rounded-xl text-gray-800 dark:text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all shadow-sm min-h-[56px]"
                  />
                </div>
              </div>
              {formData.startDate && formData.endDate && (
                <div className="mt-4 bg-brand/10 dark:bg-brand/15 border-2 border-brand/40 dark:border-brand/30 rounded-xl p-4 text-center">
                  <p className="text-brand dark:text-brand font-bold">
                    Total Days Requested: <span className="text-2xl">{countDays(formData.startDate, formData.endDate)}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Type */}
            <div>
              <label className="text-gray-800 dark:text-white font-bold text-lg mb-4 block">
                Type of Time Off <span className="text-red-600">*</span>
              </label>
              <div className="grid md:grid-cols-3 gap-4">
                {typeOptions.map(({ value, label, icon, description, color }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, type: value }))}
                    className={`p-5 sm:p-6 rounded-xl border-2 transition-all duration-300 text-left shadow-sm min-h-[44px] ${
                      formData.type === value
                        ? `bg-gradient-to-br ${color} border-transparent text-white shadow-lg`
                        : 'bg-white dark:bg-white/[0.04] border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/[0.08] hover:border-gray-300'
                    }`}
                  >
                    <div className="text-4xl mb-3">{icon}</div>
                    <h4 className={`font-bold mb-2 ${formData.type === value ? 'text-white' : 'text-gray-800 dark:text-white'}`}>{label}</h4>
                    <p className={`text-sm ${formData.type === value ? 'text-white/90' : 'text-gray-600 dark:text-white/50'} font-medium`}>{description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="text-gray-800 dark:text-white font-bold text-lg mb-4 block">
                Reason for Request <span className="text-red-600">*</span>
              </label>
              <textarea
                name="reason"
                value={formData.reason}
                onChange={handleInputChange}
                placeholder="Please provide a brief reason for your time off request..."
                rows={5}
                required
                className="w-full px-4 py-4 bg-white dark:bg-white/[0.06] border-2 border-gray-300 dark:border-white/15 rounded-xl text-gray-800 dark:text-white text-base sm:text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all resize-none shadow-sm"
              />
              <p className="text-gray-500 dark:text-white/40 text-sm mt-2 font-medium">{formData.reason.length} characters</p>
            </div>

            {/* Submit */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                type="submit"
                disabled={isSubmitting || !formData.startDate || !formData.endDate || !formData.reason.trim()}
                className="flex-1 bg-gradient-to-r from-brand to-brand-accent hover:opacity-90 disabled:from-gray-400 disabled:to-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl min-h-[56px] flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{editingId ? 'Saving...' : 'Submitting...'}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>{editingId ? 'Save Changes' : 'Submit Request'}</span>
                  </>
                )}
              </button>
              <Link
                href="/dashboard"
                className="px-8 py-4 bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.12] border-2 border-gray-300 dark:border-white/15 text-gray-800 dark:text-white font-bold rounded-xl transition-all shadow-md min-h-[56px] flex items-center justify-center"
              >
                Cancel
              </Link>
            </div>
          </form>

          {/* My Requests */}
          <div className="bg-white/80 dark:bg-white/[0.05] backdrop-blur-lg rounded-2xl border border-gray-200 dark:border-white/10 p-5 sm:p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-5 h-5 text-brand dark:text-brand" />
              <h3 className="text-gray-800 dark:text-white font-bold text-lg">My Requests</h3>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
              </div>
            ) : requests.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-white/40 py-6 text-center">No time-off requests yet.</p>
            ) : (
              <div className="space-y-3">
                {requests.map((r) => {
                  const range =
                    r.end_date && r.end_date !== r.date
                      ? `${formatDay(r.date)} – ${formatDay(r.end_date)}`
                      : formatDay(r.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                  const convertedToUnpaid = r.pay_override === 'unpaid';
                  return (
                    <div
                      key={r.id}
                      className="border border-gray-200 dark:border-white/10 rounded-xl p-4 bg-white dark:bg-white/[0.03]"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">{range}</span>
                        <span className="text-xs text-gray-400 dark:text-white/40">
                          ({countDays(r.date, r.end_date)} day{countDays(r.date, r.end_date) !== 1 ? 's' : ''})
                        </span>
                        <StatusBadge status={r.status} />
                        {r.edited_at && r.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-700 ring-1 ring-sky-300 dark:bg-sky-500/15 dark:text-sky-300">
                            <Pencil className="w-3 h-3" /> Edited
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-white/50">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 capitalize">
                          {typeLabel(r.type)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ring-1 ${
                            convertedToUnpaid
                              ? 'bg-orange-50 text-orange-700 ring-orange-300 dark:bg-orange-500/15 dark:text-orange-300'
                              : r.is_paid
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300'
                                : 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-white/10 dark:text-white/50'
                          }`}
                        >
                          <BadgeDollarSign className="w-3 h-3" />
                          {convertedToUnpaid ? 'Approved as UNPAID' : r.is_paid ? 'Paid' : 'Unpaid'}
                        </span>
                        {r.notes && <span className="truncate max-w-full">— {r.notes}</span>}
                      </div>

                      {convertedToUnpaid && (
                        <p className="mt-2 text-xs font-medium text-orange-700 dark:text-orange-300">
                          Your approver approved these dates but converted the request to unpaid time off.
                        </p>
                      )}

                      {r.status === 'pending' && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => startEdit(r)}
                            className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-lg bg-brand/10 hover:bg-brand/20 text-brand dark:bg-brand/15 dark:hover:bg-brand/25 dark:text-brand text-xs font-semibold transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => handleCancelRequest(r.id)}
                            disabled={cancelingId === r.id}
                            className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 dark:text-rose-300 text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            {cancelingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            Cancel Request
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info card */}
          <div className="bg-blue-50 dark:bg-blue-500/10 rounded-2xl border-2 border-blue-300 dark:border-blue-500/25 p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <Info className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
              <div>
                <h4 className="text-gray-800 dark:text-white font-bold mb-2">Time Off Request Guidelines</h4>
                <ul className="text-gray-700 dark:text-white/60 text-sm font-medium space-y-1">
                  <li>• <strong>Submit at least 4 weeks in advance</strong> — this is required, not a suggestion</li>
                  <li>• Choose the appropriate type: Vacation or PTO (paid) or Unpaid</li>
                  <li>• Vacation and PTO both draw from your paid time off balance shown above</li>
                  <li>• You can edit or cancel a request while it is still pending — edits restart approval</li>
                  <li>• You will receive a notification once your request is reviewed</li>
                  <li>• Contact your supervisor directly for urgent or emergency time off needs</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
