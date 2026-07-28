'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import PhotoUploader from '@/components/PhotoUploader';
import { X, AlertTriangle, Loader2, CheckCircle2, Eraser } from 'lucide-react';

/**
 * JobNotReadyModal — operator documents "we arrived on-site but the contractor
 * wasn't ready": reason + GPS photos + an on-site signature from the contractor
 * rep (signed on the operator's phone). Posts to /api/job-orders/[id]/not-ready,
 * which parks the job to Pending Jobs and notifies the project manager.
 */
export default function JobNotReadyModal({
  jobId,
  jobNumber,
  onClose,
}: {
  jobId: string;
  jobNumber: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [signerName, setSignerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── On-site signature pad (hand the phone to the contractor's rep) ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasSig = useRef(false);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const t = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    return {
      x: (t.clientX - rect.left) * (canvas.width / rect.width),
      y: (t.clientY - rect.top) * (canvas.height / rect.height),
    };
  };
  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineTo(x, y);
    ctx.stroke();
    hasSig.current = true;
  };
  const stop = () => { drawing.current = false; };
  const clearSig = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    hasSig.current = false;
  };

  const submit = useCallback(async () => {
    if (!reason.trim()) { setError('Please say what was not ready.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const canvas = canvasRef.current;
      const signatureData = canvas && hasSig.current ? canvas.toDataURL('image/png') : null;

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/job-orders/${jobId}/not-ready`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          reason: reason.trim(),
          photo_urls: photos,
          signature_data: signatureData,
          signer_name: signerName.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not submit. Please try again.');
      }
      // Job is now parked to Pending — send the operator back to their list.
      router.push('/dashboard/my-jobs');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }, [reason, photos, signerName, jobId, router]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-red-500 to-orange-500 text-white px-5 py-4 flex items-center gap-3 rounded-t-3xl">
          <AlertTriangle className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold">Job Not Ready</h2>
            <p className="text-xs text-white/80">#{jobNumber} — document the site wasn&apos;t ready</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Reason */}
          <div>
            <label className="block text-sm font-bold text-slate-800 dark:text-white mb-1.5">
              What wasn&apos;t ready? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Contractor hadn't poured the slab yet; area was still full of rebar and forms."
              className="w-full px-3 py-2.5 text-base rounded-xl border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none resize-none"
            />
          </div>

          {/* Photos (GPS-stamped, camera) */}
          <div>
            <label className="block text-sm font-bold text-slate-800 dark:text-white mb-1.5">Photos of the site</label>
            <p className="text-xs text-slate-500 dark:text-white/50 mb-2">Proof you were on-site. Taken on the spot and GPS-stamped.</p>
            <PhotoUploader
              bucket="job-photos"
              pathPrefix={`${jobId}/not-ready`}
              photos={photos}
              onPhotosChange={setPhotos}
              maxPhotos={6}
              label="Add Photo"
              lightMode
              captureLocation
              jobId={jobId}
            />
          </div>

          {/* On-site signature */}
          <div>
            <label className="block text-sm font-bold text-slate-800 dark:text-white mb-1.5">Contractor signature (on-site)</label>
            <p className="text-xs text-slate-500 dark:text-white/50 mb-2">Have the contractor&apos;s rep sign here confirming the site wasn&apos;t ready.</p>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Name of person signing"
              className="w-full mb-2 px-3 py-2.5 text-base rounded-xl border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none"
            />
            <div className="relative rounded-xl border-2 border-dashed border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-white/5">
              <canvas
                ref={canvasRef}
                width={560}
                height={160}
                className="w-full h-40 touch-none rounded-xl"
                onMouseDown={start}
                onMouseMove={move}
                onMouseUp={stop}
                onMouseLeave={stop}
                onTouchStart={start}
                onTouchMove={move}
                onTouchEnd={stop}
              />
              <button
                type="button"
                onClick={clearSig}
                className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-white/70"
              >
                <Eraser className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
              <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={submit}
            disabled={submitting || !reason.trim()}
            className="w-full py-4 rounded-2xl font-bold text-base text-white bg-gradient-to-r from-red-500 to-orange-500 shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {submitting ? 'Submitting…' : 'Submit — Site Not Ready'}
          </button>
          <p className="text-center text-xs text-slate-400 dark:text-white/40">
            This parks the job in Pending Jobs and notifies your project manager.
          </p>
        </div>
      </div>
    </div>
  );
}
