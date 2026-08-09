'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import {
  CheckCircle2, Send, ArrowRight, Wrench,
  Loader2, ChevronDown, ChevronUp, Building2, Mic, Square, Star
} from 'lucide-react';

interface HelperWorkLogProps {
  jobId: string;
  jobNumber: string;
  customerName: string;
  jobTitle?: string;
  /** Full job data (used only for the optional operator rating). */
  job?: any;
}

interface OtherJob {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  location: string;
  status: string;
}

/**
 * THE HELPER TICKET (founder spec): "theirs is simple — just what they did,
 * submit, done." One free-text field, one Submit button. No work-item builder,
 * no day-complete, no job-status transitions — those are the OPERATOR's ticket.
 * Address + equipment live on the job page around this card, so they are not
 * duplicated here.
 *
 * Submitting is never gated: the optional helper→operator rating is offered
 * AFTER the log is already saved, so a helper can always finish in one tap.
 */
type Step = 'work_log' | 'submitting' | 'done';

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function HelperWorkLog({ jobId, jobNumber, customerName, job }: HelperWorkLogProps) {
  const router = useRouter();
  const [workDescription, setWorkDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingLog, setExistingLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('work_log');
  const [otherJobs, setOtherJobs] = useState<OtherJob[]>([]);
  const [loadingOtherJobs, setLoadingOtherJobs] = useState(false);
  const [showSubmitted, setShowSubmitted] = useState(false);
  const [startingShop, setStartingShop] = useState(false);
  const [hoursOnThisJob, setHoursOnThisJob] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Optional helper → operator rating. Shown only AFTER submitting, never
  // blocks finishing the ticket.
  const operatorName: string | null = job?.operator_name || null;
  const canRateOperator = Boolean(operatorName && job?.assigned_to);
  const [operatorRating, setOperatorRating] = useState<number | null>(null);
  const [operatorComment, setOperatorComment] = useState('');
  const [ratingSaved, setRatingSaved] = useState(false);
  const [savingRating, setSavingRating] = useState(false);

  // Voice-to-text: dictate what you did; transcript is appended to the log.
  const handleVoiceResult = useCallback((transcript: string) => {
    setWorkDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
  }, []);
  const { isListening, isSupported: voiceSupported, start: startVoice, stop: stopVoice } = useVoiceInput({
    onResult: handleVoiceResult,
    onError: () => {},
    continuous: true,
    accumulateResults: true,
    silenceTimeout: 4000,
    language: 'en-US',
  });

  useEffect(() => {
    const checkExistingLog = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`/api/helper-work-log?job_order_id=${jobId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (response.ok) {
          const result = await response.json();
          if (result.has_log && result.data) {
            setExistingLog(result.data.work_description);
            setWorkDescription(result.data.work_description || '');
            if (result.data.completed_at) {
              setStep('done');
              if (result.data.hours_worked) {
                setHoursOnThisJob(Number(result.data.hours_worked).toFixed(1));
              }
            }
          }
        }
      } catch (err) {
        console.error('Error checking existing log:', err);
      } finally {
        setLoading(false);
      }
    };
    checkExistingLog();
  }, [jobId]);

  // Check if the helper has other jobs today that aren't done yet.
  const checkOtherJobs = useCallback(async (token: string) => {
    setLoadingOtherJobs(true);
    try {
      const today = toDateString(new Date());
      const res = await fetch(
        `/api/job-orders?scheduled_date=${today}&include_helper_jobs=true&includeCompleted=false&as=operator`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const json = await res.json();
        const remaining = (json.data || []).filter(
          (j: any) => j.id !== jobId && j.status !== 'completed'
        );
        setOtherJobs(remaining);
      }
    } catch (err) {
      console.error('Error checking other jobs:', err);
    } finally {
      setLoadingOtherJobs(false);
    }
  }, [jobId]);

  // ONE action: save the log + close out this job for the helper. No rating
  // gate, no draft/complete split — "what they did, submit, done".
  const handleSubmit = async () => {
    if (!workDescription.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    setStep('submitting');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStep('work_log');
        setError('Your session expired. Please sign in again.');
        return;
      }

      const response = await fetch('/api/helper-work-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          job_order_id: jobId,
          work_description: workDescription.trim(),
          complete: true,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setExistingLog(workDescription.trim());
        if (result.data?.hours_worked) {
          setHoursOnThisJob(Number(result.data.hours_worked).toFixed(1));
        }
        await checkOtherJobs(session.access_token);
        setStep('done');
      } else {
        setStep('work_log');
        setError("Couldn't submit — check your signal and try again.");
      }
    } catch (err) {
      console.error('Error submitting work log:', err);
      setStep('work_log');
      setError("Couldn't submit — check your signal and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Optional, post-submit. Recorded against the already-completed log.
  const handleSaveRating = async () => {
    if (!operatorRating || savingRating) return;
    setSavingRating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/helper-work-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          job_order_id: jobId,
          work_description: (existingLog || workDescription).trim(),
          complete: true,
          operator_rating: operatorRating,
          operator_review_comment: operatorComment.trim() || undefined,
        }),
      });
      if (res.ok) setRatingSaved(true);
    } catch (err) {
      console.error('Error saving rating:', err);
    } finally {
      setSavingRating(false);
    }
  };

  const handleStartShopTicket = async () => {
    setStartingShop(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/helper-work-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ is_shop_ticket: true, work_description: '', start_now: true }),
      });

      if (res.ok) router.push('/dashboard/my-jobs');
    } catch (err) {
      console.error('Error creating shop ticket:', err);
    } finally {
      setStartingShop(false);
    }
  };

  const handleStartNextJob = async (nextJobId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/helper-work-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ job_order_id: nextJobId, work_description: '', start_now: true }),
      });

      router.push(`/dashboard/my-jobs/${nextJobId}`);
    } catch (err) {
      console.error('Error starting next job:', err);
      router.push(`/dashboard/my-jobs/${nextJobId}`);
    }
  };

  if (loading) {
    return (
      <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-24 bg-gray-200 rounded" />
      </div>
    );
  }

  // ── SUBMITTING ──
  if (step === 'submitting') {
    return (
      <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-8 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto mb-3" />
        <p className="text-gray-700 font-semibold">Submitting your work log…</p>
      </div>
    );
  }

  // ── DONE — unmistakable confirmation ──
  if (step === 'done') {
    return (
      <div className="space-y-4">
        <div className="bg-emerald-50 rounded-2xl shadow-xl border-2 border-emerald-300 p-6 text-center">
          <div className="w-16 h-16 mx-auto bg-emerald-500 rounded-full flex items-center justify-center mb-3 shadow-lg">
            <CheckCircle2 className="w-9 h-9 text-white" />
          </div>
          <h3 className="text-xl font-bold text-emerald-900">Work log submitted ✓</h3>
          <p className="text-sm text-emerald-700 mt-1">
            #{jobNumber} — {customerName}
            {hoursOnThisJob && <span className="ml-1 font-bold">({hoursOnThisJob}h)</span>}
          </p>
          <p className="text-xs text-emerald-600 mt-2">The office can see this. You&apos;re done with this job.</p>

          <button
            onClick={() => setShowSubmitted(!showSubmitted)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 py-2 px-3"
          >
            {showSubmitted ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showSubmitted ? 'Hide' : 'Show'} what you submitted
          </button>
          {showSubmitted && existingLog && (
            <div className="bg-white rounded-xl p-3 mt-1 border border-emerald-200 text-left">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{existingLog}</p>
            </div>
          )}
        </div>

        {/* Optional rating — never blocks finishing. */}
        {canRateOperator && !ratingSaved && (
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 p-5">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-amber-400" />
              <h4 className="font-bold text-gray-900 text-sm">How was working with {operatorName}?</h4>
            </div>
            <p className="text-xs text-gray-500 mb-3">Optional — private to management.</p>

            <div className="flex items-center justify-center gap-1.5 mb-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setOperatorRating(n)}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  className="p-1.5"
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      operatorRating && n <= operatorRating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>

            {operatorRating && (
              <>
                <textarea
                  value={operatorComment}
                  onChange={(e) => setOperatorComment(e.target.value)}
                  placeholder="Anything to add? (optional)"
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 text-base text-gray-900 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:outline-none resize-none"
                />
                <button
                  type="button"
                  onClick={handleSaveRating}
                  disabled={savingRating}
                  className="mt-2 w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-sm bg-amber-500 text-white shadow disabled:opacity-40"
                >
                  {savingRating ? 'Saving…' : 'Send rating'}
                </button>
              </>
            )}
          </div>
        )}
        {ratingSaved && (
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 text-center">
            <p className="text-sm font-semibold text-amber-800">Thanks — rating sent ✓</p>
          </div>
        )}

        {/* Where to next */}
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 p-5 space-y-3">
          {loadingOtherJobs ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400 mr-2" />
              <span className="text-sm text-gray-500">Checking your schedule…</span>
            </div>
          ) : otherJobs.length > 0 ? (
            <>
              <p className="text-sm font-semibold text-gray-700">
                You have {otherJobs.length} more job{otherJobs.length > 1 ? 's' : ''} today:
              </p>
              {otherJobs.map((nextJob) => (
                <button
                  key={nextJob.id}
                  onClick={() => handleStartNextJob(nextJob.id)}
                  className="w-full min-h-[44px] flex items-center gap-3 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <ArrowRight className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">
                      Start: {nextJob.title || nextJob.customer_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      #{nextJob.job_number} — {nextJob.location || nextJob.customer_name}
                    </p>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <p className="text-sm text-gray-600 text-center">No more field jobs today.</p>
          )}

          <button
            onClick={handleStartShopTicket}
            disabled={startingShop}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 transition-all font-semibold text-sm text-gray-700"
          >
            {startingShop ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-5 h-5 text-amber-600" />}
            Work in Shop
          </button>
          <button
            onClick={() => router.push('/dashboard/my-jobs')}
            className="w-full min-h-[44px] py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold shadow-lg transition-all"
          >
            Back to My Jobs
          </button>
        </div>
      </div>
    );
  }

  // ── WORK LOG ENTRY (default) — the whole helper ticket ──
  return (
    <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border-2 border-orange-300 p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
          <Wrench className="w-5 h-5 text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900">Your work log — #{jobNumber}</h3>
          <p className="text-sm text-gray-500 truncate">{customerName}</p>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-3 font-medium">
        What did you help with today? Type it, or tap the mic to talk.
      </p>

      <textarea
        value={workDescription}
        onChange={(e) => setWorkDescription(e.target.value)}
        placeholder="e.g. Helped set up the wall saw, hauled slurry, moved cores to the truck…"
        rows={4}
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
      />

      {voiceSupported && (
        <div className="mt-2">
          {!isListening ? (
            <button
              type="button"
              onClick={startVoice}
              className="min-h-[44px] flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-md"
            >
              <Mic className="w-4 h-4" /> Dictate
            </button>
          ) : (
            <button
              type="button"
              onClick={stopVoice}
              className="min-h-[44px] flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm transition-all shadow-md animate-pulse"
            >
              <Square className="w-4 h-4" /> Stop &amp; add
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {/* ONE button. Submit = done. */}
      <button
        onClick={handleSubmit}
        disabled={submitting || !workDescription.trim()}
        className="mt-4 w-full min-h-[52px] flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold text-base transition-all bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Send className="w-5 h-5" />
        Submit
      </button>
      {!workDescription.trim() && (
        <p className="mt-2 text-xs text-gray-400 text-center">Add a few words above, then tap Submit.</p>
      )}
    </div>
  );
}
