'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ClipboardCheck, User as UserIcon, Calendar, Briefcase,
  MessageSquare, AlertTriangle, Star, Loader2, CheckCircle, MapPin,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';

interface OperatorOpt {
  id: string;
  name: string;
}
interface JobRow {
  id: string;
  job_number: string | null;
  customer_name: string | null;
  status: string;
  scheduled_date: string | null;
  end_date: string | null;
  address: string | null;
  location: string | null;
  job_type: string | null;
}

const ALLOWED_ROLES = ['supervisor', 'admin', 'super_admin', 'operations_manager'];

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function NewSiteVisitPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Form state
  const [operatorId, setOperatorId] = useState('');
  const [visitDate, setVisitDate] = useState(todayStr());
  const [jobOrderId, setJobOrderId] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [observations, setObservations] = useState('');
  const [issues, setIssues] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [performance, setPerformance] = useState<number | null>(null);
  const [safety, setSafety] = useState<number | null>(null);
  const [cleanliness, setCleanliness] = useState<number | null>(null);

  // Lookup state
  const [operators, setOperators] = useState<OperatorOpt[]>([]);
  const [helpers, setHelpers] = useState<OperatorOpt[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    const cu = getCurrentUser();
    if (!cu) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(cu.role)) { router.push('/dashboard/admin'); return; }
    setUser(cu);
    setAuthLoading(false);
  }, [router]);

  // ── load operators + helpers (people the supervisor can visit) ──────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/schedule-board/operators', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setOperators(json.data?.operators ?? []);
        setHelpers(json.data?.helpers ?? []);
      }
    })();
  }, [user]);

  // ── load jobs when operator + date change ───────────────────────────────
  useEffect(() => {
    if (!operatorId || !visitDate) {
      setJobs([]);
      setJobOrderId('');
      return;
    }
    (async () => {
      setJobsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(
          `/api/admin/operators/${operatorId}/active-jobs?date=${visitDate}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        if (res.ok) {
          const json = await res.json();
          const list: JobRow[] = json.data?.jobs ?? [];
          setJobs(list);
          // Auto-select if exactly one job
          setJobOrderId(list.length === 1 ? list[0].id : '');
        } else {
          setJobs([]);
          setJobOrderId('');
        }
      } catch {
        setJobs([]);
        setJobOrderId('');
      } finally {
        setJobsLoading(false);
      }
    })();
  }, [operatorId, visitDate]);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === jobOrderId) || null,
    [jobs, jobOrderId]
  );

  const peopleOptions = useMemo(() => {
    const all = [
      ...operators.map((o) => ({ ...o, role: 'operator' as const })),
      ...helpers.map((h) => ({ ...h, role: 'apprentice' as const })),
    ];
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }, [operators, helpers]);

  function buildArrivalTimestamp(): string | null {
    if (!arrivalTime) return null;
    return new Date(`${visitDate}T${arrivalTime}:00`).toISOString();
  }
  function buildDepartureTimestamp(): string | null {
    if (!departureTime) return null;
    return new Date(`${visitDate}T${departureTime}:00`).toISOString();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!operatorId) { setError('Please select an operator.'); return; }
    if (!observations.trim() && !issues.trim()) {
      setError('Please add observations or flag at least one issue.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired. Please log in again.'); return; }

      const res = await fetch('/api/admin/supervisor-visits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          operator_id: operatorId,
          visit_date: visitDate,
          job_order_id: jobOrderId || null,
          arrival_time: buildArrivalTimestamp(),
          departure_time: buildDepartureTimestamp(),
          observations: observations.trim() || null,
          issues_flagged: issues.trim() || null,
          follow_up_required: followUp,
          follow_up_notes: followUp ? (followUpNotes.trim() || null) : null,
          performance_rating: performance,
          safety_rating: safety,
          cleanliness_rating: cleanliness,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || j.details || 'Failed to save visit.');
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/dashboard/admin/site-visits'), 800);
    } catch (err: any) {
      setError(err.message || 'Failed to save visit.');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-emerald-200 dark:border-emerald-900/40 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Visit report saved</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">Redirecting to your reports…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin/site-visits"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <ClipboardCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">New Site Visit Report</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">Record what you saw on your visit.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Operator + Date */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5">
                <UserIcon className="w-4 h-4 text-violet-500" /> Operator visited <span className="text-rose-500">*</span>
              </label>
              <select
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              >
                <option value="">Select operator…</option>
                {peopleOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.role === 'apprentice' ? '(Helper)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5">
                <Calendar className="w-4 h-4 text-violet-500" /> Date of visit
              </label>
              <input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
          </section>

          {/* Active jobs for that operator on that date */}
          {operatorId && (
            <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
                <Briefcase className="w-4 h-4 text-violet-500" /> Active job on that day
              </label>

              {jobsLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading jobs…
                </div>
              ) : jobs.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-slate-400 italic">
                  No active jobs found for this operator on {visitDate}. You can still file a report — it will be unlinked from a specific job.
                </p>
              ) : (
                <div className="space-y-2">
                  {jobs.map((j) => (
                    <button
                      type="button"
                      key={j.id}
                      onClick={() => setJobOrderId(j.id === jobOrderId ? '' : j.id)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition ${
                        j.id === jobOrderId
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                          : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:border-violet-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-0.5">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {j.job_number || 'Job'} — {j.customer_name || 'Customer'}
                        </span>
                        <span className="text-[10px] uppercase font-semibold tracking-wide text-violet-600 dark:text-violet-400">
                          {j.status}
                        </span>
                      </div>
                      {(j.address || j.location) && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{j.location || j.address}</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {selectedJob && (
                <p className="text-xs text-violet-700 dark:text-violet-300">
                  Linked to <strong>{selectedJob.job_number}</strong>
                </p>
              )}
            </section>
          )}

          {/* Times */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5 block">Arrival</label>
              <input
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5 block">Departure</label>
              <input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
          </section>

          {/* Observations */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5">
                <MessageSquare className="w-4 h-4 text-violet-500" /> Observations
              </label>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                rows={4}
                placeholder="What did you see? Crew working well, equipment status, customer interaction, etc."
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Issues / Concerns
              </label>
              <textarea
                value={issues}
                onChange={(e) => setIssues(e.target.value)}
                rows={3}
                placeholder="Safety issues, equipment problems, performance concerns…"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
          </section>

          {/* Ratings */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Ratings (optional)</h3>
            <RatingRow label="Performance" value={performance} onChange={setPerformance} />
            <RatingRow label="Safety" value={safety} onChange={setSafety} />
            <RatingRow label="Cleanliness" value={cleanliness} onChange={setCleanliness} />
          </section>

          {/* Follow-up */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={followUp}
                onChange={(e) => setFollowUp(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              Follow-up required
            </label>
            {followUp && (
              <textarea
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                rows={2}
                placeholder="What needs to happen next?"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            )}
          </section>

          {/* Submit */}
          {error && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 p-3 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <Link
              href="/dashboard/admin/site-visits"
              className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting || !operatorId}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-lg shadow-violet-500/30 transition"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <ClipboardCheck className="w-4 h-4" />
                  Submit Report
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RatingRow({
  label, value, onChange,
}: { label: string; value: number | null; onChange: (n: number | null) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-700 dark:text-slate-200">{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
              value && n <= value
                ? 'text-amber-500'
                : 'text-gray-300 dark:text-slate-600 hover:text-amber-300'
            }`}
            aria-label={`${label} ${n} star${n > 1 ? 's' : ''}`}
          >
            <Star className="w-5 h-5" fill={value && n <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </div>
  );
}
