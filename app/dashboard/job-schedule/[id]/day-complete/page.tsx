'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import {
  CheckCircle2,
  ArrowLeft,
  Clock,
  Loader2,
  AlertTriangle,
  Sun,
  Trophy,
  PenTool,
  Camera,
  Send,
  Phone,
  X,
  FileText,
  Download,
  User,
  MapPin,
  Wrench,
  ClipboardList,
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
  const [pdfSaved, setPdfSaved] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [workPerformedItems, setWorkPerformedItems] = useState<Array<{
    type?: string; description?: string; quantity?: string | number;
    unit?: string; depth?: string | number; notes?: string;
  }>>([]);

  // ─── Smart last-day detection ────────────────────────────────────────────
  const [isLastScheduledDay, setIsLastScheduledDay] = useState<boolean | null>(null);

  // ─── Completion request modal state ──────────────────────────────────────
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // ─── Remote signature (Option 3) state ───────────────────────────────────
  const [showRemotePanel, setShowRemotePanel] = useState(false);
  const [remotePhone, setRemotePhone] = useState('');
  const [remoteSending, setRemoteSending] = useState(false);
  const [remoteSent, setRemoteSent] = useState(false);
  const [remoteSentPhone, setRemoteSentPhone] = useState('');

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    fetchJob();
    fetchScheduleInfo();
    // Load work performed from localStorage
    const stored = localStorage.getItem(`work-performed-${jobId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setWorkPerformedItems(parsed.items || []);
      } catch { /* ignore */ }
    }
  }, [jobId]);

  const fetchJob = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const res = await fetch(`/api/job-orders/${jobId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const jobData = data.data || data;
        setJob(jobData);
        // Pre-fill phone from job data
        const phone = jobData.site_contact_phone || jobData.foreman_phone || '';
        setRemotePhone(phone);
      } else {
        console.error('Failed to fetch job details:', res.status);
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
        const isLast = endDate ? endDate === today : scheduledDate === today;
        setIsLastScheduledDay(isLast);
      } else {
        setIsLastScheduledDay(null);
      }
    } catch {
      setIsLastScheduledDay(null);
    }
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

  // ─── DONE FOR TODAY (Continue Tomorrow) ───────────────────────────────────
  const handleDoneForToday = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

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

  // ─── JOB FULLY COMPLETE (on-site signature path) ──────────────────────────
  const handleJobComplete = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const signatureUrl = await uploadSignature();

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

      const stored = localStorage.getItem(`work-performed-${jobId}`);
      const workPerformed = stored ? JSON.parse(stored).items : workPerformedItems;

      // ── Generate & upload completion PDF ──────────────────────────────────
      let generatedPdfUrl: string | null = null;
      try {
        const pdfRes = await fetch(`/api/job-orders/${jobId}/generate-completion-pdf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            signerName: signerName || null,
            signatureDataUrl: signatureData || null,
            workPerformed,
          }),
        });
        if (pdfRes.ok) {
          const pdfData = await pdfRes.json();
          generatedPdfUrl = pdfData.pdf_url || null;
          if (generatedPdfUrl) {
            setPdfUrl(generatedPdfUrl);
            setPdfSaved(true);
          }
        }
      } catch (pdfErr) {
        console.error('PDF generation error (non-fatal):', pdfErr);
      }

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
        showNotif(generatedPdfUrl ? 'Job completed! PDF saved.' : 'Job completed! Great work!', 'success');
        localStorage.removeItem(`work-performed-${jobId}`);
        setTimeout(() => router.push('/dashboard/my-jobs'), 2000);
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

  // ─── REMOTE SIGNATURE — Send link & finish ────────────────────────────────
  const handleSendRemoteLink = async () => {
    if (!remotePhone.trim()) {
      showNotif('Please enter a phone number', 'warning');
      return;
    }
    setRemoteSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 1. Create a signature request and get the sign URL
      const sigRes = await fetch(`/api/job-orders/${jobId}/request-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          request_type: 'completion',
          contact_name: job?.customer_name || undefined,
          contact_phone: remotePhone.trim(),
        }),
      });

      if (!sigRes.ok) {
        const err = await sigRes.json();
        showNotif(err.error || 'Failed to generate signature link', 'error');
        setRemoteSending(false);
        return;
      }

      const sigData = await sigRes.json();
      const signUrl: string = sigData.data?.sign_url;

      // 2. Send SMS
      await fetch(`/api/job-orders/${jobId}/send-completion-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          phoneNumber: remotePhone.trim(),
          signUrl,
          jobNumber: job?.job_number,
          customerName: job?.customer_name,
        }),
      });

      // 3. In dev: open the link in new tab so it can be tested
      if (process.env.NODE_ENV === 'development') {
        window.open(signUrl, '_blank');
      }

      // 4. Log the day and submit for completion
      const stored = localStorage.getItem(`work-performed-${jobId}`);
      const workPerformed = stored ? JSON.parse(stored).items : [];

      await fetch(`/api/job-orders/${jobId}/daily-log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          workPerformed,
          notes: `Job complete. Remote signature link sent to ${remotePhone.trim()}.`,
          continueNextDay: false,
          latitude: null,
          longitude: null,
        }),
      }).catch(() => {});

      await fetch(`/api/jobs/${jobId}/completion-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          operator_notes: `Remote signature link sent to customer at ${remotePhone.trim()}.`,
        }),
      }).catch(() => {});

      localStorage.removeItem(`work-performed-${jobId}`);
      setRemoteSentPhone(remotePhone.trim());
      setShowRemotePanel(false);
      setRemoteSent(true);
    } catch (err) {
      console.error('Error sending remote link:', err);
      showNotif('Failed to send. Please try again.', 'error');
    } finally {
      setRemoteSending(false);
    }
  };

  // ─── UPLOAD SIGNATURE TO STORAGE ─────────────────────────────────────────
  const uploadSignature = async (): Promise<string | null> => {
    if (!signatureData) return null;
    try {
      const res = await fetch(signatureData);
      const blob = await res.blob();
      const fileName = `${jobId}/signatures/completion-${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(fileName, blob, { contentType: 'image/png' });

      if (uploadError) {
        console.error('Signature upload error:', uploadError);
        return signatureData;
      }

      const { data } = supabase.storage
        .from('job-photos')
        .getPublicUrl(fileName);

      return data?.publicUrl || signatureData;
    } catch {
      return signatureData;
    }
  };

  // ─── SIGNATURE CANVAS HANDLERS ────────────────────────────────────────────
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
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!loading && !job) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-xl border border-red-100 dark:border-red-900/30 p-8 max-w-sm w-full text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Job Not Found</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            Could not load job details. Please go back and try again.
          </p>
          <button
            onClick={() => router.push('/dashboard/my-jobs')}
            className="w-full bg-gray-700 hover:bg-gray-800 text-white py-3 rounded-xl font-semibold"
          >
            Back to My Jobs
          </button>
        </div>
      </div>
    );
  }

  // ─── Already submitted for approval — show confirmation screen ───────────
  if (job?.status === 'pending_completion') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-xl border border-blue-100 dark:border-blue-900/30 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Already Submitted</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            This job has already been submitted for supervisor approval. You&apos;ll be notified once it&apos;s reviewed.
          </p>
          <button
            onClick={() => router.push('/dashboard/my-jobs')}
            className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 rounded-xl font-semibold"
          >
            Back to My Jobs
          </button>
        </div>
      </div>
    );
  }

  // ─── Remote link sent — success screen ────────────────────────────────────
  if (remoteSent) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-xl border border-indigo-100 dark:border-indigo-900/30 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <Send className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Link Sent!</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">
            A signature link was sent to
          </p>
          <p className="text-indigo-600 dark:text-indigo-400 font-semibold mb-4">{remoteSentPhone}</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            The customer will receive a text to review and sign the work. Your supervisor has been notified.
          </p>
          <button
            onClick={() => router.push('/dashboard/my-jobs')}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-3 rounded-xl font-semibold"
          >
            Back to My Jobs
          </button>
        </div>
      </div>
    );
  }

  // ─── Submitted success screen ─────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-xl border border-green-100 dark:border-green-900/30 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Submitted!</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
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
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618]">
      {/* Header */}
      <div className="bg-white dark:bg-white/[0.04] border-b border-gray-200 dark:border-white/10 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/job-schedule/${jobId}/work-performed`}
              className="p-2 bg-gray-100 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Day Complete</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">{job?.job_number} &bull; {job?.customer_name}</p>
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
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-xl">
              <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Hours Worked Today</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{getHoursWorked()} hrs</p>
            </div>
          </div>
          {job?.is_multi_day && (
            <div className="mt-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800/40">
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                Multi-day job &bull; Day {(job?.total_days_worked || 0) + 1}
              </p>
            </div>
          )}
        </div>

        {/* Completion Photos */}
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
              <Camera className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Completion Photos</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Before/after photos, site conditions</p>
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

        {/* ── Main Decision ─────────────────────────────────────────────────── */}
        {!showSignature ? (
          <div className="space-y-4">
            <h2 className="text-center text-lg font-semibold text-gray-800 dark:text-gray-100">
              {isLastScheduledDay === true
                ? 'This is the final scheduled day'
                : 'How would you like to wrap up?'}
            </h2>

            {/* Option 1 — Done for Today */}
            {isLastScheduledDay !== true && (
              <button
                onClick={handleDoneForToday}
                disabled={submitting}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 text-left transition-all hover:scale-[1.01] active:scale-[0.99] hover:border-amber-300 dark:hover:border-amber-700 disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-500/20">
                  <Sun className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 dark:text-white">Done for Today</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Job continues tomorrow. Progress saved.</p>
                </div>
                {submitting && <Loader2 className="w-5 h-5 animate-spin text-amber-500" />}
              </button>
            )}

            {/* Option 2 — Complete Job (on-site signature) */}
            <button
              onClick={() => setShowSignature(true)}
              disabled={submitting}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20 text-left transition-all hover:scale-[1.01] active:scale-[0.99] hover:border-emerald-300 dark:hover:border-emerald-700 disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-500/20">
                <Trophy className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 dark:text-white">Complete Job — Get Signature On Site</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Customer is here — get their signature to complete the job.</p>
              </div>
            </button>

            {/* Option 3 — Send remote link */}
            <button
              onClick={() => setShowRemotePanel(true)}
              disabled={submitting}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800/50 bg-indigo-50 dark:bg-indigo-900/20 text-left transition-all hover:scale-[1.01] active:scale-[0.99] hover:border-indigo-300 dark:hover:border-indigo-700 disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-500/20">
                <Send className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 dark:text-white">Send Completion Link &amp; Finish Job</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Customer isn&apos;t here — send them a signature link via SMS.</p>
              </div>
            </button>
          </div>
        ) : (
          /* ── On-site Sign-Off Document ────────────────────────────────────── */
          <div className="space-y-4">
            {/* Back button + title */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSignature(false)}
                className="p-2 bg-gray-100 dark:bg-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-all"
              >
                <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-gray-300" />
              </button>
              <div>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Job Completion Sign-Off</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Review work summary with customer, then sign below</p>
              </div>
            </div>

            {/* ── Company Header Card ──────────────────────────────────────── */}
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden">
              {/* Header stripe */}
              <div className="bg-slate-800 dark:bg-slate-900 px-5 py-4">
                <p className="text-white font-bold text-base tracking-wide">PATRIOT CONCRETE CUTTING</p>
                <p className="text-slate-300 text-xs mt-0.5">Job Completion Sign-Off</p>
              </div>

              {/* Job meta grid */}
              <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-white/5">
                <div className="bg-white dark:bg-[#0f0a1e] px-4 py-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Job #</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{job?.job_number || '—'}</p>
                </div>
                <div className="bg-white dark:bg-[#0f0a1e] px-4 py-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Date</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="bg-white dark:bg-[#0f0a1e] px-4 py-3 col-span-2">
                  <div className="flex items-start gap-1.5">
                    <User className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Customer</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{job?.customer_name || '—'}</p>
                    </div>
                  </div>
                </div>
                {(job?.address || job?.location) && (
                  <div className="bg-white dark:bg-[#0f0a1e] px-4 py-3 col-span-2">
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Location</p>
                        <p className="text-sm text-gray-700 dark:text-gray-200">{job?.address || job?.location}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Work Ordered ─────────────────────────────────────────────── */}
            {(job?.scope_of_work || job?.description) && (
              <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03]">
                  <ClipboardList className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Work Ordered</h3>
                </div>
                <div className="px-5 py-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {job?.scope_of_work || job?.description}
                  </p>
                </div>
              </div>
            )}

            {/* ── Work Performed ────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03]">
                <Wrench className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Work Performed</h3>
              </div>
              <div className="px-5 py-4">
                {workPerformedItems.length > 0 ? (
                  <ul className="space-y-2">
                    {workPerformedItems.map((item, idx) => {
                      const parts: string[] = [];
                      if (item.quantity) parts.push(String(item.quantity));
                      if (item.unit) parts.push(item.unit);
                      if (item.depth) parts.push(`${item.depth}" depth`);
                      const qtyStr = parts.join(' ');
                      const desc = [item.description, item.notes].filter(Boolean).join(' — ');
                      return (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-emerald-500 font-bold mt-0.5">•</span>
                          <span className="text-gray-700 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-white">{item.type || 'Work'}</span>
                            {qtyStr ? ` — ${qtyStr}` : ''}
                            {desc ? `, ${desc}` : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                    No individual work items recorded. Work was performed as described in the scope above.
                  </p>
                )}
              </div>
            </div>

            {/* ── Disclaimer ───────────────────────────────────────────────── */}
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800/50 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-200 dark:border-amber-800/50">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                  Acknowledgement &amp; Disclaimer
                </h3>
              </div>
              <div className="px-5 py-4 space-y-3">
                <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  Patriot Concrete Cutting assumes no responsibility for layout, water damage, embedments, or buried utilities. I agree that the work described above has been completed satisfactorily.
                </p>
                <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  Patriot Concrete Cutting will not be liable for any reinforcement, utilities, or other obstructions that are damaged and are outside the capabilities of our equipment to detect. This includes but is not limited to: obstructions below the concrete on a slab on grade; low voltage or low current power lines not currently under load; any obstruction in newly poured concrete.
                </p>
                <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  By signing below, the customer acknowledges that they have reviewed the scope of work and work performed above, and that the work has been completed to their satisfaction. Any claims or disputes must be reported within 48 hours of job completion. This signature authorizes Patriot Concrete Cutting to invoice for services rendered.
                </p>
              </div>
            </div>

            {/* ── Signature Form ────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <PenTool className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Customer Signature</h3>
              </div>

              {/* Signer Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Printed Name <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Name of person signing"
                  className="w-full px-4 py-3 border border-slate-300 dark:border-white/20 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 dark:text-white bg-white dark:bg-white/[0.07]"
                />
              </div>

              {/* Signature Pad */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1">
                    <PenTool className="w-3.5 h-3.5" />
                    Signature <span className="text-gray-400 font-normal ml-1">(draw below)</span>
                  </label>
                  {signatureData && (
                    <button
                      onClick={clearSignature}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="border-2 border-dashed border-slate-300 dark:border-white/20 rounded-xl overflow-hidden bg-gray-50 dark:bg-white/[0.03] relative">
                  {!signatureData && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className="text-xs text-gray-300 dark:text-gray-600 select-none">Sign here</p>
                    </div>
                  )}
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={160}
                    className="w-full touch-none cursor-crosshair"
                    style={{ height: '160px' }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
              </div>

              {/* E-Sign Consent */}
              <EsignConsentCheckbox
                onConsentChange={setEsignConsented}
                consented={esignConsented}
              />

              {/* PDF notice */}
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-800/40">
                <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  A PDF of this sign-off will be generated and saved to the job record automatically.
                </p>
              </div>

              {/* Submit button */}
              <button
                onClick={handleJobComplete}
                disabled={submitting}
                className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl py-4 font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Saving PDF &amp; Completing…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Complete Job &amp; Save Sign-Off</span>
                  </>
                )}
              </button>

              <button
                onClick={() => { setShowSignature(false); setShowCompletionModal(true); }}
                disabled={submitting}
                className="w-full text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-200 py-2 disabled:opacity-40"
              >
                Skip signature — submit for supervisor approval instead
              </button>
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4">
          <div className="flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Done for Today</strong> saves your progress and resets the job for tomorrow.{' '}
              <strong>Complete Job</strong> submits to your supervisor for approval.
            </p>
          </div>
        </div>
      </div>

      {/* ── Remote Signature Panel (modal) ─────────────────────────────────── */}
      {showRemotePanel && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                  <Send className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Send Signature Link</h2>
              </div>
              <button
                onClick={() => setShowRemotePanel(false)}
                className="p-2 bg-gray-100 dark:bg-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-all"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              We&apos;ll text the customer a link so they can review the work and sign remotely.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Contact&apos;s Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  value={remotePhone}
                  onChange={(e) => setRemotePhone(e.target.value)}
                  placeholder="(555) 867-5309"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-white/20 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 dark:text-white bg-white dark:bg-white/[0.07]"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSendRemoteLink}
                disabled={remoteSending || !remotePhone.trim()}
                className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {remoteSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {remoteSending ? 'Sending...' : 'Send Link & Complete Job'}
              </button>
              <button
                onClick={() => setShowRemotePanel(false)}
                disabled={remoteSending}
                className="px-4 py-3 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Completion Confirmation Modal ───────────────────────────────────── */}
      {showCompletionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Submit for Completion</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              This will send the job to your supervisor for final approval.
            </p>

            <textarea
              placeholder="Any final notes for the supervisor? (optional)"
              className="w-full border border-gray-300 dark:border-white/20 rounded-lg p-3 text-sm mb-4 h-24 focus:outline-none focus:border-emerald-500 text-gray-900 dark:text-white bg-white dark:bg-white/[0.07] resize-none"
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
                className="px-4 py-3 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-50"
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
