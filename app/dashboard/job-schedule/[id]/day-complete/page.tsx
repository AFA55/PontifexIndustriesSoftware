'use client';

export const dynamic = 'force-dynamic';

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
  Send,
  Copy,
  Link2,
  ClipboardCheck,
} from 'lucide-react';
import PhotoUploader from '@/components/PhotoUploader';

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
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning';
  } | null>(null);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
  const [confirmSkipSignature, setConfirmSkipSignature] = useState(false);

  // C4: Work performed check
  const [hasWorkPerformed, setHasWorkPerformed] = useState<boolean | null>(null);
  const [checkingWork, setCheckingWork] = useState(true);

  // C1: Remote signature request
  const [showRemoteSignature, setShowRemoteSignature] = useState(false);
  const [remoteContactName, setRemoteContactName] = useState('');
  const [remoteContactPhone, setRemoteContactPhone] = useState('');
  const [requestingSignature, setRequestingSignature] = useState(false);
  const [signatureLink, setSignatureLink] = useState('');
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = () => {
    fetchJob();
    checkWorkPerformed();
    fetchPendingRequests();
  };

  const fetchJob = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const res = await fetch(`/api/job-orders/${jobId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const jobData = data.data || data;
        setJob(jobData);
        if (jobData?.customer_contact) setRemoteContactName(jobData.customer_contact);
        if (jobData?.site_contact_phone || jobData?.foreman_phone) {
          setRemoteContactPhone(jobData.site_contact_phone || jobData.foreman_phone || '');
        }
      } else {
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

  const checkWorkPerformed = async () => {
    try {
      const stored = localStorage.getItem(`work-performed-${jobId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.items && parsed.items.length > 0) {
          setHasWorkPerformed(true);
          setCheckingWork(false);
          return;
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const res = await fetch(`/api/job-orders/${jobId}/work-items`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const items = data.data || data || [];
          if (Array.isArray(items) && items.length > 0) {
            setHasWorkPerformed(true);
            setCheckingWork(false);
            return;
          }
        }
      }
      setHasWorkPerformed(false);
    } catch {
      setHasWorkPerformed(true);
    } finally {
      setCheckingWork(false);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/job-orders/${jobId}/request-signature`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(
          (data.data || []).filter((r: any) => ['pending', 'sent', 'opened'].includes(r.status))
        );
      }
    } catch { /* ignore */ }
  };

  const showNotif = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const getHoursWorked = () => {
    if (!job) return 0;
    const start = job.work_started_at ? new Date(job.work_started_at)
      : job.route_started_at ? new Date(job.route_started_at) : null;
    if (!start) return 0;
    return ((Date.now() - start.getTime()) / (1000 * 60 * 60)).toFixed(1);
  };

  const handleRequestRemoteSignature = async () => {
    setRequestingSignature(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/job-orders/${jobId}/request-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          contact_name: remoteContactName || undefined,
          contact_phone: remoteContactPhone || undefined,
          request_type: 'completion',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSignatureLink(data.data.sign_url);
        showNotif('Signature link generated!', 'success');
        fetchPendingRequests();
      } else {
        const data = await res.json();
        showNotif(data.error || 'Failed to create link', 'error');
      }
    } catch {
      showNotif('Failed to generate link', 'error');
    } finally {
      setRequestingSignature(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(signatureLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const handleDoneForToday = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      if (completionPhotos.length > 0) {
        fetch(`/api/job-orders/${jobId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ photo_urls: completionPhotos }),
        }).catch((err) => console.error('Photo save error:', err));
      }
      const stored = localStorage.getItem(`work-performed-${jobId}`);
      const workPerformed = stored ? JSON.parse(stored).items : [];
      const res = await fetch(`/api/job-orders/${jobId}/daily-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ workPerformed, notes: 'Day complete. Continuing tomorrow.', continueNextDay: true, latitude: null, longitude: null }),
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

  const handleJobComplete = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const signatureUrl = await uploadSignature();
      if (completionPhotos.length > 0) {
        fetch(`/api/job-orders/${jobId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ photo_urls: completionPhotos }),
        }).catch((err) => console.error('Photo save error:', err));
      }
      const stored = localStorage.getItem(`work-performed-${jobId}`);
      const workPerformed = stored ? JSON.parse(stored).items : [];
      await fetch(`/api/job-orders/${jobId}/daily-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ workPerformed, notes: 'Final day. Job complete.', signerName: signerName || undefined, signatureData: signatureUrl || undefined, continueNextDay: false, latitude: null, longitude: null }),
      }).catch(() => {});
      const statusRes = await fetch(`/api/job-orders/${jobId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status: 'completed', work_completed_at: new Date().toISOString(), completion_signer_name: signerName || undefined, completion_signature: signatureUrl || undefined }),
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

  const uploadSignature = async (): Promise<string | null> => {
    if (!signatureData) return null;
    try {
      const res = await fetch(signatureData);
      const blob = await res.blob();
      const fileName = `${jobId}/signatures/completion-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from('job-photos').upload(fileName, blob, { contentType: 'image/png' });
      if (uploadError) { console.error('Signature upload error:', uploadError); return signatureData; }
      const { data } = supabase.storage.from('job-photos').getPublicUrl(fileName);
      return data?.publicUrl || signatureData;
    } catch { return signatureData; }
  };

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
    if (canvas) { setSignatureData(canvas.toDataURL()); }
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

  const workCheckBlocked = !checkingWork && hasWorkPerformed === false;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white sticky top-0 z-50 shadow-2xl">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/job-schedule/${jobId}/work-performed`} className="p-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/20 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold">Day Complete</h1>
              <p className="text-xs text-blue-200">{job?.job_number} &bull; {job?.customer_name}</p>
            </div>
          </div>
        </div>
      </div>

      {notification && (
        <div className={`fixed top-20 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium text-center ${notification.type === 'success' ? 'bg-emerald-500' : notification.type === 'error' ? 'bg-red-500' : 'bg-amber-500'}`}>
          {notification.message}
        </div>
      )}

      <div className="container mx-auto px-4 py-6 pb-24 max-w-lg space-y-6">
        {workCheckBlocked && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 rounded-xl"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div>
                <h3 className="text-sm font-bold text-red-800">Work Performed Required</h3>
                <p className="text-xs text-red-600 mt-1">Please log work performed before completing the day.</p>
                <Link href={`/dashboard/job-schedule/${jobId}/work-performed`} className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-all">
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  Log Work Performed
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-xl"><Clock className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-slate-500">Hours Worked Today</p>
              <p className="text-2xl font-bold text-slate-900">{getHoursWorked()} hrs</p>
            </div>
          </div>
          {job?.is_multi_day && (
            <div className="mt-3 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs text-amber-700 font-medium">Multi-day job &bull; Day {(job?.total_days_worked || 0) + 1}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-100 rounded-xl"><Camera className="w-5 h-5 text-indigo-600" /></div>
            <div>
              <h3 className="text-sm font-bold text-slate-700">Completion Photos</h3>
              <p className="text-xs text-slate-500">Before/after photos, site conditions</p>
            </div>
          </div>
          <PhotoUploader bucket="job-photos" pathPrefix={`${jobId}/completion`} photos={completionPhotos} onPhotosChange={setCompletionPhotos} maxPhotos={10} label="Add Completion Photos" lightMode={true} />
        </div>

        {pendingRequests.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-blue-700 mb-2">Pending Signature Requests</p>
            {pendingRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between py-1.5">
                <div>
                  <p className="text-xs text-blue-800 font-medium">{req.contact_name || 'Unknown'}</p>
                  <p className="text-[10px] text-blue-500">{req.status} &bull; {req.request_type}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${req.status === 'opened' ? 'bg-amber-100 text-amber-700' : req.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {!showSignature ? (
          <div className="space-y-4">
            <h2 className="text-center text-lg font-semibold text-slate-800">Are you done with this job?</h2>
            <button onClick={handleDoneForToday} disabled={submitting || workCheckBlocked} className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-xl"><Sun className="w-7 h-7" /></div>
                <div className="text-left flex-1">
                  <p className="text-lg font-bold">Done for Today</p>
                  <p className="text-sm text-amber-100">Job continues tomorrow. Progress saved.</p>
                </div>
                {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
              </div>
            </button>
            <button onClick={() => setShowSignature(true)} disabled={submitting || workCheckBlocked} className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-xl"><Trophy className="w-7 h-7" /></div>
                <div className="text-left flex-1">
                  <p className="text-lg font-bold">Job Fully Complete</p>
                  <p className="text-sm text-emerald-100">All work finished. Get customer signature.</p>
                </div>
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => { setShowSignature(false); setShowRemoteSignature(false); }} className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all">
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
              <h2 className="text-lg font-semibold text-slate-800">Customer Signature</h2>
            </div>

            {!showRemoteSignature ? (
              <button onClick={() => setShowRemoteSignature(true)} className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-all">
                <Send className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-700">Request Remote Signature</span>
                <span className="text-xs text-blue-500 ml-auto">Send a link</span>
              </button>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-bold text-blue-800">Send Signature Link</p>
                <div>
                  <label className="block text-xs font-medium text-blue-700 mb-1">Contact Name</label>
                  <input type="text" value={remoteContactName} onChange={(e) => setRemoteContactName(e.target.value)} placeholder="Site contact name" className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-blue-700 mb-1">Phone</label>
                  <input type="tel" value={remoteContactPhone} onChange={(e) => setRemoteContactPhone(e.target.value)} placeholder="Phone number" className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500" />
                </div>
                {signatureLink ? (
                  <div className="space-y-2">
                    <p className="text-xs text-emerald-700 font-semibold">Link generated!</p>
                    <div className="flex gap-2">
                      <input type="text" value={signatureLink} readOnly className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-600 truncate" />
                      <button onClick={copyLink} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 flex items-center gap-1">
                        {linkCopied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {linkCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[10px] text-blue-500">Send this link to the site contact. It expires in 7 days.</p>
                  </div>
                ) : (
                  <button onClick={handleRequestRemoteSignature} disabled={requestingSignature} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                    {requestingSignature ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    {requestingSignature ? 'Generating...' : 'Generate Link'}
                  </button>
                )}
                <button onClick={() => { setShowRemoteSignature(false); setSignatureLink(''); }} className="w-full text-xs text-blue-500 hover:text-blue-700 py-1">Cancel</button>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name (optional)</label>
                <input type="text" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Name of person signing" className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-900" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                    <PenTool className="w-3.5 h-3.5" />
                    Customer Signature <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  {signatureData && (<button onClick={clearSignature} className="text-xs text-red-500 hover:text-red-700">Clear</button>)}
                </div>
                <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-slate-50">
                  <canvas ref={canvasRef} width={320} height={140} className="w-full touch-none cursor-crosshair" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                </div>
                <p className="text-xs text-slate-400 mt-1 text-center">{signatureData ? 'Signature captured' : 'Have customer sign above to complete job'}</p>
              </div>
              <button onClick={handleJobComplete} disabled={submitting || !signatureData} className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl py-4 font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                {submitting ? 'Completing...' : 'Complete Job'}
              </button>
              {!signatureData && (<p className="text-center text-xs text-slate-400">Signature required to complete job</p>)}
              {!confirmSkipSignature ? (
                <button onClick={() => setConfirmSkipSignature(true)} disabled={submitting} className="w-full text-slate-400 text-xs hover:text-slate-600 py-1">Customer not available to sign?</button>
              ) : (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-amber-700 font-medium text-center">Completing without a signature may delay invoicing. Are you sure?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmSkipSignature(false)} className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 text-xs rounded-lg hover:bg-slate-200">Cancel</button>
                    <button onClick={handleJobComplete} disabled={submitting} className="flex-1 px-3 py-2 bg-amber-500 text-white text-xs rounded-lg hover:bg-amber-600 disabled:opacity-50">Complete Anyway</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              <strong>Done for Today</strong> saves your progress and resets the job for tomorrow.
              <strong> Job Fully Complete</strong> marks the job as finished and sends it to billing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
