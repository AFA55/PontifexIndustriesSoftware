'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import {
  CheckCircle2,
  CalendarPlus,
  ArrowLeft,
  FileSignature,
  Clock,
  Loader2,
  AlertTriangle,
  Sun,
  Trophy,
  PenTool,
  Camera,
} from 'lucide-react';
import PhotoUploader from '@/components/PhotoUploader';
import EsignConsentCheckbox from '@/components/EsignConsentCheckbox';

export default function DayCompletePage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
  const [esignConsented, setEsignConsented] = useState(false);

  // ─── Smart last-day detection ────────────────────────────────────────────
  const [isLastScheduledDay, setIsLastScheduledDay] = useState<boolean | null>(null);

  // ─── Scope progress summary for the completion modal ─────────────────────
  const [progressSummary, setProgressSummary] = useState<{ overall_pct: number; total_completed: number; total_target: number } | null>(null);

  // ─── Completion request modal state ──────────────────────────────────────
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    fetchJob();
    fetchScheduleInfo();
    fetchScopeProgress();
  }, []);

  const fetchJob = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const res = await fetch(`/api/job-orders/${jobId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setJob(data.data || data);
      } else {
        // Fallback: fetch directly from supabase
        const { data } = await supabase
          .from('job_orders')
          .select('*, profiles!job_orders_assigned_to_fkey(full_name)')
          .eq('id', jobId)
          .single();
        setJob(data);
      }
    } catch (err) {
      console.error('Error fetching job:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchScheduleInfo = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/jobs/${jobId}/schedule-info`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const today = new Date().toISOString().split('T')[0];
        const endDate = json.data?.scheduled_end_date;
        const scheduledDate = json.data?.scheduled_date;
        // It's the last day if end_date === today, or (no end_date and scheduled_date === today)
        const isLast = endDate ? endDate === today : scheduledDate === today;
        setIsLastScheduledDay(isLast);
      } else {
        // If we can't determine, don't restrict the UI — show both options
        setIsLastScheduledDay(null);
      }
    } catch {
      setIsLastScheduledDay(null);
    }
  };

  const fetchScopeProgress = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/jobs/${jobId}/scope`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.scope_items?.length > 0) {
          setProgressSummary({
            overall_pct: json.data.overall_pct,
            total_completed: json.data.total_completed,
            total_target: json.data.total_target,
          });
        }
      }
    } catch { /* non-critical */ }
  };

  const handleSubmitCompletion = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/jobs/${jobId}/completion-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ operator_notes: completionNotes || null }),
      });
      if (res.ok) {
        setShowCompletionModal(false);
        setSubmitted(true);
        localStorage.removeItem(`work-performed-${jobId}`);
      } else {
        const data = await res.json();
        showNotif(data.error || 'Failed to submit completion request', 'error');
      }
    } catch (err) {
      console.error('Error submitting completion request:', err);
      showNotif('Failed to submit. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const showNotif = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Calculate hours worked today
  const getHoursWorked = () => {
    if (!job) return 0;
    const start = job.work_started_at ? new Date(job.work_started_at) :
                  job.route_started_at ? new Date(job.route_started_at) : null;
    if (!start) return 0;
    return ((Date.now() - start.getTime()) / (1000 * 60 * 60)).toFixed(1);
  };

  // ─── DONE FOR TODAY (Continue Tomorrow) ───────────────────
  const handleDoneForToday = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Save completion photos (await to ensure saved)
      if (completionPhotos.length > 0) {
        try {
          await fetch(`/api/job-orders/${jobId}/photos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ photo_urls: completionPhotos })
          });
        } catch (err) {
          console.error('Photo save error:', err);
        }
      }

      // Get work performed from localStorage
      const stored = localStorage.getItem(`work-performed-${jobId}`);
      const workPerformed = stored ? JSON.parse(stored).items : [];

      const res = await fetch(`/api/job-orders/${jobId}/daily-log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          workPerformed,
          notes: `Day complete. Continuing tomorrow.`,
          continueNextDay: true,
          latitude: null,
          longitude: null,
        })
      });

      if (res.ok) {
        showNotif('Day logged! Job will continue tomorrow.', 'success');
        // Clear localStorage work data for this job
        localStorage.removeItem(`work-performed-${jobId}`);
        setTimeout(() => router.push('/dashboard/my-jobs'), 1500);
      } else {
        const data = await res.json();
        showNotif(data.error || 'Failed to save daily log', 'error');
      }
    } catch (err) {
      console.error('Error saving daily log:', err);
      showNotif('Failed to save. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── JOB FULLY COMPLETE ──────────────────────────────────
  const handleJobComplete = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Upload signature to storage
      const signatureUrl = await uploadSignature();

      // Save completion photos (await to ensure they're saved before completing)
      if (completionPhotos.length > 0) {
        try {
          await fetch(`/api/job-orders/${jobId}/photos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ photo_urls: completionPhotos })
          });
        } catch (err) {
          console.error('Photo save error:', err);
          // Continue even if photos fail — don't block job completion
        }
      }

      // Get work performed from localStorage
      const stored = localStorage.getItem(`work-performed-${jobId}`);
      const workPerformed = stored ? JSON.parse(stored).items : [];

      // Create final daily log entry (also saves work items to DB)
      await fetch(`/api/job-orders/${jobId}/daily-log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          workPerformed,
          notes: 'Final day. Job complete.',
          signerName: signerName || undefined,
          signatureData: signatureUrl || undefined,
          continueNextDay: false,
          latitude: null,
          longitude: null,
        })
      }).catch(() => {});

      // Mark job as completed via status API
      const statusRes = await fetch(`/api/job-orders/${jobId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          status: 'completed',
          work_completed_at: new Date().toISOString(),
          completion_signer_name: signerName || undefined,
          completion_signature: signatureUrl || undefined,
        })
      });

      if (statusRes.ok) {
        showNotif('Job completed! Great work!', 'success');
        localStorage.removeItem(`work-performed-${jobId}`);
        setTimeout(() => router.push('/dashboard/my-jobs'), 1500);
      } else {
        const data = await statusRes.json();
        showNotif(data.error || 'Failed to complete job', 'error');
      }
    } catch (err) {
      console.error('Error completing job:', err);
      showNotif('Failed to complete. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── UPLOAD SIGNATURE TO STORAGE ─────────────────────────
  const uploadSignature = async (): Promise<string | null> => {
    if (!signatureData) return null;
    try {
      // Convert base64 to blob
      const res = await fetch(signatureData);
      const blob = await res.blob();
      const fileName = `${jobId}/signatures/completion-${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(fileName, blob, { contentType: 'image/png' });

      if (uploadError) {
        console.error('Signature upload error:', uploadError);
        return signatureData; // Fallback to base64
      }

      const { data } = supabase.storage
        .from('job-photos')
        .getPublicUrl(fileName);

      return data?.publicUrl || signatureData;
    } catch {
      return signatureData; // Fallback to base64
    }
  };

  // ─── SIGNATURE CANVAS HANDLERS ────────────────────────────
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // ─── Submitted success screen ────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-green-100 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Submitted!</h2>
          <p className="text-gray-500 text-sm mb-6">
            Your supervisor has been notified and will review shortly.
          </p>
          <button
            onClick={() => router.push('/dashboard/my-jobs')}
            className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white py-3 rounded-xl font-semibold"
          >
            Back to My Jobs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white sticky top-0 z-50 shadow-2xl">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/job-schedule/${jobId}/work-performed`}
              className="p-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/20 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold">Day Complete</h1>
              <p className="text-xs text-blue-200">{job?.job_number} &bull; {job?.customer_name}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${
          notification.type === 'success' ? 'bg-emerald-500' :
          notification.type === 'error' ? 'bg-red-500' : 'bg-amber-500'
        }`}>
          {notification.message}
        </div>
      )}

      <div className="container mx-auto px-4 py-6 max-w-lg space-y-6">
        {/* Hours Worked Today */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-xl">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Hours Worked Today</p>
              <p className="text-2xl font-bold text-slate-900">{getHoursWorked()} hrs</p>
            </div>
          </div>
          {job?.is_multi_day && (
            <div className="mt-3 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs text-amber-700 font-medium">
                Multi-day job &bull; Day {(job?.total_days_worked || 0) + 1}
              </p>
            </div>
          )}
        </div>

        {/* Completion Photos */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <Camera className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-700">Completion Photos</h3>
              <p className="text-xs text-slate-500">Before/after photos, site conditions</p>
            </div>
          </div>
          <PhotoUploader
            bucket="job-photos"
            pathPrefix={`${jobId}/completion`}
            photos={completionPhotos}
            onPhotosChange={setCompletionPhotos}
            maxPhotos={10}
            label="Add Completion Photos"
            lightMode={true}
          />
        </div>

        {/* Main Decision */}
        {!showSignature ? (
          <div className="space-y-4">
            <h2 className="text-center text-lg font-semibold text-slate-800">
              {isLastScheduledDay === true
                ? 'This is the final scheduled day'
                : 'Are you done with this job?'}
            </h2>

            {/* Done for Today — hidden on last scheduled day */}
            {isLastScheduledDay !== true && (
              <button
                onClick={handleDoneForToday}
                disabled={submitting}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-xl">
                    <Sun className="w-7 h-7" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-lg font-bold">Done for Today</p>
                    <p className="text-sm text-amber-100">
                      Job continues tomorrow. Progress saved.
                    </p>
                  </div>
                  {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
                </div>
              </button>
            )}

            {/* Complete Job — opens confirmation modal */}
            <button
              onClick={() => setShowCompletionModal(true)}
              disabled={submitting}
              className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-xl">
                  <Trophy className="w-7 h-7" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-lg font-bold">Complete Job</p>
                  <p className="text-sm text-emerald-100">
                    Submit to supervisor for final approval.
                  </p>
                </div>
              </div>
            </button>

            {/* Legacy: still allow customer signature for same-day completions */}
            <button
              onClick={() => setShowSignature(true)}
              className="w-full text-slate-500 text-xs text-center py-2 hover:text-slate-700"
            >
              Add customer signature first
            </button>
          </div>
        ) : (
          /* Customer Signature Section */
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setShowSignature(false)}
                className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"
              >
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
              <h2 className="text-lg font-semibold text-slate-800">
                Customer Signature
              </h2>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              {/* Signer Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Customer Name (optional)
                </label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Name of person signing"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-900"
                />
              </div>

              {/* Signature Pad */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                    <PenTool className="w-3.5 h-3.5" />
                    Signature (optional)
                  </label>
                  {signatureData && (
                    <button
                      onClick={clearSignature}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-slate-50">
                  <canvas
                    ref={canvasRef}
                    width={350}
                    height={150}
                    className="w-full touch-none cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1 text-center">
                  Draw signature above or skip
                </p>
              </div>

              {/* E-Sign Consent */}
              <EsignConsentCheckbox
                onConsentChange={setEsignConsented}
                consented={esignConsented}
              />

              {/* Complete Button */}
              <button
                onClick={handleJobComplete}
                disabled={submitting || !esignConsented}
                className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl py-4 font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                {submitting ? 'Completing...' : 'Complete Job'}
              </button>

              {/* Skip signature option */}
              <button
                onClick={handleJobComplete}
                disabled={submitting || !esignConsented}
                className="w-full text-slate-500 text-sm hover:text-slate-700 py-2 disabled:opacity-40"
              >
                Skip signature and complete
              </button>
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              <strong>Done for Today</strong> saves your progress and resets the job for tomorrow.
              <strong> Complete Job</strong> submits to your supervisor for approval.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Completion Confirmation Modal ──────────────────────────────── */}
      {showCompletionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Submit for Completion</h2>
            <p className="text-gray-600 text-sm mb-4">
              This will send the job to your supervisor for final approval.
            </p>

            {/* Progress summary if available */}
            {progressSummary && progressSummary.total_target > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <p className="text-sm font-medium text-gray-700 mb-1">Progress Summary</p>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${Math.min(100, progressSummary.overall_pct)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  {progressSummary.overall_pct.toFixed(0)}% of scope complete
                  ({progressSummary.total_completed} / {progressSummary.total_target} units)
                </p>
              </div>
            )}

            <textarea
              placeholder="Any final notes for the supervisor? (optional)"
              className="w-full border border-gray-300 rounded-lg p-3 text-sm mb-4 h-24 focus:outline-none focus:border-emerald-500 text-gray-900 resize-none"
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
            />

            <div className="flex gap-3">
              <button
                onClick={handleSubmitCompletion}
                disabled={submitting}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {submitting ? 'Submitting…' : 'Submit for Approval'}
              </button>
              <button
                onClick={() => setShowCompletionModal(false)}
                disabled={submitting}
                className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
