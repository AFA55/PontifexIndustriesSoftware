'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, Loader2, PenTool, Trash2,
  Shield, AlertTriangle, Building2, User,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function UtilityWaiverPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  // Job info
  const [job, setJob] = useState<{ customer_name: string; address: string; job_number: string } | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);

  // Form state
  const [signerName, setSignerName] = useState('');
  const [signerCompany, setSignerCompany] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Canvas state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const fetchJob = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const res = await fetch(
        `/api/job-orders?id=${jobId}&includeCompleted=true`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        const found = (json.data || [])[0];
        if (found) {
          setJob({
            customer_name: found.customer_name || '',
            address: found.address || found.location || '',
            job_number: found.job_number || '',
          });
          // Prefill signer name from contact if available
          if (found.foreman_name || found.customer_contact) {
            setSignerName(found.foreman_name || found.customer_contact || '');
          }
        }
      }
    } catch (e) {
      console.error('Error fetching job:', e);
    } finally {
      setLoadingJob(false);
    }
  }, [jobId, router]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // Canvas helpers — reuse the same pattern as /app/sign/[token]/page.tsx
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSubmit = async () => {
    if (!signerName.trim()) {
      setError('Signer name is required.');
      return;
    }
    if (!hasSignature) {
      setError('Please provide a signature before submitting.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const canvas = canvasRef.current;
      const signatureData = canvas ? canvas.toDataURL() : '';

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const res = await fetch(`/api/job-orders/${jobId}/utility-waiver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          signerName: signerName.trim(),
          signerCompany: signerCompany.trim() || undefined,
          signatureData,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to submit waiver');
      }

      setSubmitted(true);
      // Auto-redirect back after 2 seconds
      setTimeout(() => {
        router.push(`/dashboard/my-jobs/${jobId}`);
      }, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingJob) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-purple-600 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl border border-emerald-200 p-10 max-w-sm w-full text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Waiver Signed</h2>
          <p className="text-slate-600 mb-1">Thank you, <strong>{signerName}</strong>.</p>
          <p className="text-sm text-slate-400">Returning to job page...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-900 to-indigo-900 text-white sticky top-0 z-10 shadow-2xl">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/my-jobs/${jobId}`}
              className="p-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/20 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
              <Shield className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate">Utility Waiver</h1>
              {job && (
                <p className="text-purple-200 text-xs truncate">
                  Job #{job.job_number} — {job.customer_name}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-lg space-y-5 pb-12">

        {/* Job Info */}
        {job && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <Building2 className="w-4 h-4 text-purple-500" />
              <span className="font-semibold text-slate-700">{job.customer_name}</span>
            </div>
            {job.address && (
              <p className="text-sm text-slate-500 pl-6">{job.address}</p>
            )}
          </div>
        )}

        {/* Legal Waiver Statement */}
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <h2 className="font-bold text-amber-900 text-base">Utility Waiver Statement</h2>
          </div>
          <p className="text-sm text-amber-900 leading-relaxed">
            I, the undersigned, acknowledge that all underground utilities in the work area have been
            properly located and marked. I authorize Patriot Concrete Cutting to proceed with the
            specified concrete cutting work and release liability for any unmarked utilities.
          </p>
        </div>

        {/* Signer Info */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
            <User className="w-4 h-4 text-purple-500" />
            Signer Information
          </h3>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              placeholder="Enter full name"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Company <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={signerCompany}
              onChange={e => setSignerCompany(e.target.value)}
              placeholder="Enter company name"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base"
            />
          </div>
        </div>

        {/* Signature Canvas */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
              <PenTool className="w-4 h-4 text-purple-500" />
              Signature <span className="text-red-500 ml-0.5">*</span>
            </h3>
            {hasSignature && (
              <button
                onClick={clearSignature}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-semibold transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>

          <div className={`border-2 rounded-xl overflow-hidden transition-colors ${hasSignature ? 'border-purple-300' : 'border-dashed border-slate-300'}`}>
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              className="w-full touch-none bg-slate-50 cursor-crosshair"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">
            Sign above using your finger or stylus
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !signerName.trim() || !hasSignature}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all shadow-lg flex items-center justify-center gap-3 ${
            submitting || !signerName.trim() || !hasSignature
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white'
          }`}
        >
          {submitting ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</>
          ) : (
            <><CheckCircle2 className="w-5 h-5" /> Submit Waiver</>
          )}
        </button>

        <p className="text-xs text-slate-400 text-center leading-relaxed">
          By submitting, the signer acknowledges the above waiver statement and authorizes
          Patriot Concrete Cutting to proceed with the work.
        </p>
      </div>
    </div>
  );
}
