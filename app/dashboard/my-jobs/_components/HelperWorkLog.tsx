'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  CheckCircle2, Send, FileText, ArrowRight, Wrench,
  Clock, Loader2, ChevronDown, ChevronUp, Building2
} from 'lucide-react';

interface HelperWorkLogProps {
  jobId: string;
  jobNumber: string;
  customerName: string;
  jobTitle?: string;
  /** Full job data for showing scope details */
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

type Step = 'work_log' | 'submitting' | 'transition' | 'completed';

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function HelperWorkLog({ jobId, jobNumber, customerName, jobTitle, job }: HelperWorkLogProps) {
  const router = useRouter();
  const [workDescription, setWorkDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingLog, setExistingLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('work_log');
  const [otherJobs, setOtherJobs] = useState<OtherJob[]>([]);
  const [loadingOtherJobs, setLoadingOtherJobs] = useState(false);
  const [showScopeDetails, setShowScopeDetails] = useState(false);
  const [startingShop, setStartingShop] = useState(false);
  const [hoursOnThisJob, setHoursOnThisJob] = useState<string | null>(null);

  useEffect(() => {
    checkExistingLog();
  }, [jobId]);

  const checkExistingLog = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/helper-work-log?job_order_id=${jobId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.has_log && result.data) {
          setExistingLog(result.data.work_description);
          setWorkDescription(result.data.work_description);
          // If already completed for today, show as done
          if (result.data.completed_at) {
            setSubmitted(true);
            setStep('completed');
            if (result.data.hours_worked) {
              setHoursOnThisJob(Number(result.data.hours_worked).toFixed(1));
            }
          } else {
            setSubmitted(!!result.data.work_description);
          }
        }
      }
    } catch (err) {
      console.error('Error checking existing log:', err);
    } finally {
      setLoading(false);
    }
  };

  // Submit work log AND complete the day for this job
  const handleCompleteDay = async () => {
    if (!workDescription.trim()) return;
    setSubmitting(true);
    setStep('submitting');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Submit work log with completed_at timestamp
      const response = await fetch('/api/helper-work-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          job_order_id: jobId,
          work_description: workDescription.trim(),
          complete: true, // Signal to set completed_at and calculate hours
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setSubmitted(true);
        setExistingLog(workDescription.trim());
        if (result.data?.hours_worked) {
          setHoursOnThisJob(Number(result.data.hours_worked).toFixed(1));
        }

        // Check for other jobs today
        await checkOtherJobs(session.access_token);
        setStep('transition');
      } else {
        setStep('work_log');
      }
    } catch (err) {
      console.error('Error completing day:', err);
      setStep('work_log');
    } finally {
      setSubmitting(false);
    }
  };

  // Just save the work log without completing
  const handleSaveOnly = async () => {
    if (!workDescription.trim()) return;
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/helper-work-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          job_order_id: jobId,
          work_description: workDescription.trim(),
          complete: false,
        }),
      });

      if (response.ok) {
        setSubmitted(true);
        setExistingLog(workDescription.trim());
      }
    } catch (err) {
      console.error('Error saving work log:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Check if helper has other jobs assigned today that aren't completed
  const checkOtherJobs = useCallback(async (token: string) => {
    setLoadingOtherJobs(true);
    try {
      const today = toDateString(new Date());
      const res = await fetch(
        `/api/job-orders?scheduled_date=${today}&include_helper_jobs=true&includeCompleted=false`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const json = await res.json();
        // Filter out the current job and find incomplete ones
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

  // Start a shop ticket
  const handleStartShopTicket = async () => {
    setStartingShop(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/helper-work-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          is_shop_ticket: true,
          work_description: '',
          start_now: true, // Signal to set started_at
        }),
      });

      if (res.ok) {
        router.push('/dashboard/my-jobs');
      }
    } catch (err) {
      console.error('Error creating shop ticket:', err);
    } finally {
      setStartingShop(false);
    }
  };

  // Navigate to next job (auto-starts time tracking on it)
  const handleStartNextJob = async (nextJobId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Create a started work log for the next job
      await fetch('/api/helper-work-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          job_order_id: nextJobId,
          work_description: '',
          start_now: true,
        }),
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

  // ── COMPLETED STATE ──
  if (step === 'completed') {
    return (
      <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-green-200 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900">Day Complete — #{jobNumber}</h3>
            <p className="text-sm text-gray-500">{customerName}</p>
          </div>
          {hoursOnThisJob && (
            <span className="text-xs px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full font-bold">
              {hoursOnThisJob}h
            </span>
          )}
        </div>

        {/* Collapsible work description */}
        <button
          onClick={() => setShowScopeDetails(!showScopeDetails)}
          className="w-full flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 py-2 transition-colors"
        >
          {showScopeDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showScopeDetails ? 'Hide' : 'Show'} work description
        </button>
        {showScopeDetails && existingLog && (
          <div className="bg-gray-50 rounded-xl p-3 mt-1 border border-gray-200">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{existingLog}</p>
          </div>
        )}
      </div>
    );
  }

  // ── TRANSITION STATE (after completing a job) ──
  if (step === 'transition') {
    return (
      <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-emerald-200 p-6">
        <div className="text-center mb-5">
          <div className="w-14 h-14 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-3">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Job Complete!</h3>
          <p className="text-sm text-gray-500">
            #{jobNumber} — {customerName}
            {hoursOnThisJob && <span className="ml-2 font-semibold text-blue-600">({hoursOnThisJob}h)</span>}
          </p>
        </div>

        {loadingOtherJobs ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
            <span className="text-sm text-gray-500">Checking your schedule...</span>
          </div>
        ) : otherJobs.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700 text-center">
              You have {otherJobs.length} more job{otherJobs.length > 1 ? 's' : ''} today:
            </p>
            {otherJobs.map((nextJob) => (
              <button
                key={nextJob.id}
                onClick={() => handleStartNextJob(nextJob.id)}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-all text-left"
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
                <span className="px-2 py-0.5 bg-blue-200 text-blue-800 text-[10px] font-bold rounded-full flex-shrink-0">
                  START
                </span>
              </button>
            ))}

            <div className="pt-2 border-t border-gray-200">
              <button
                onClick={handleStartShopTicket}
                disabled={startingShop}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 transition-all text-left"
              >
                <Building2 className="w-5 h-5 text-amber-600" />
                <span className="font-semibold text-sm text-gray-700">Work in Shop Instead</span>
              </button>
              <button
                onClick={() => router.push('/dashboard/my-jobs')}
                className="w-full mt-2 py-2.5 text-center text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
              >
                Done for Today
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 text-center">No more field jobs today.</p>

            <button
              onClick={handleStartShopTicket}
              disabled={startingShop}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300 transition-all font-semibold text-gray-800"
            >
              {startingShop ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Building2 className="w-5 h-5 text-amber-600" />
              )}
              Work in Shop
            </button>

            <button
              onClick={() => router.push('/dashboard/my-jobs')}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all"
            >
              All Done for Today ✓
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── SUBMITTING STATE ──
  if (step === 'submitting') {
    return (
      <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-8 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto mb-3" />
        <p className="text-gray-700 font-semibold">Saving your work log...</p>
        <p className="text-xs text-gray-400 mt-1">Calculating time on this job</p>
      </div>
    );
  }

  // ── WORK LOG ENTRY STATE (default) ──
  return (
    <div className="space-y-4">
      {/* Scope Details (collapsible, read-only) */}
      {job && (job.description || job.scope_details) && (
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden">
          <button
            onClick={() => setShowScopeDetails(!showScopeDetails)}
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="font-semibold text-gray-900 text-sm flex-1">Job Scope & Details</span>
            {showScopeDetails ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {showScopeDetails && (
            <div className="px-4 pb-4 space-y-3">
              {job.description && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 mb-1 uppercase">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.description}</p>
                </div>
              )}
              {job.job_type && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 mb-1 uppercase">Services</p>
                  <p className="text-sm text-gray-700">{job.job_type}</p>
                </div>
              )}
              {job.equipment_needed && job.equipment_needed.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase">Equipment</p>
                  <div className="flex flex-wrap gap-1.5">
                    {job.equipment_needed.map((eq: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded-full text-xs text-indigo-700 font-medium">
                        {eq}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {job.additional_info && (
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                  <p className="text-xs font-semibold text-amber-700 mb-1 uppercase">Notes</p>
                  <p className="text-sm text-amber-800">{job.additional_info}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Work Log Entry */}
      <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${submitted ? 'bg-green-100' : 'bg-orange-100'}`}>
            {submitted ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <Wrench className="w-5 h-5 text-orange-600" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900">Work Log — #{jobNumber}</h3>
            <p className="text-sm text-gray-500">{customerName}</p>
          </div>
          {submitted && (
            <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-semibold">
              Saved
            </span>
          )}
        </div>

        <textarea
          value={workDescription}
          onChange={(e) => {
            setWorkDescription(e.target.value);
            if (submitted && e.target.value !== existingLog) {
              setSubmitted(false);
            }
          }}
          placeholder="Describe the work you performed today..."
          rows={4}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
        />

        {/* Two buttons: Save Draft + Complete Day */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSaveOnly}
            disabled={submitting || !workDescription.trim() || (submitted && workDescription === existingLog)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all border-2 border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            Save Draft
          </button>
          <button
            onClick={handleCompleteDay}
            disabled={submitting || !workDescription.trim()}
            className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            Complete Day
          </button>
        </div>
      </div>
    </div>
  );
}
