'use client';

/**
 * Public contract signing page — /contract/[token].
 * Customer reviews the contract / change order, draws a signature, types their
 * name, signs. Success screen offers the signed PDF download + a customer
 * portal login link. Branded with the SENDING company's color + logo
 * (white-label — same rule as the apply page). Mobile-first: this is opened
 * from an email on a phone.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText, CheckCircle2, Download, ExternalLink, Loader2, Eraser } from 'lucide-react';

interface PublicContract {
  doc_type: 'contract' | 'change_order';
  title: string;
  work_description: string | null;
  terms: string | null;
  amount: number | null;
  customer_name: string;
  status: string;
  signed_at: string | null;
  pdf_url: string | null;
  job_number: string | null;
  company: { name: string; color: string; logo: string | null };
}

export default function ContractSignPage() {
  const params = useParams();
  const token = params.token as string;

  const [contract, setContract] = useState<PublicContract | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ pdfUrl: string | null; portalUrl: string | null } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/contract/${token}`);
        const json = await res.json();
        if (!res.ok) {
          setLoadError(json?.error || 'This link is invalid or expired.');
          return;
        }
        setContract(json.data);
      } catch {
        setLoadError('Could not load the document. Check your connection and refresh.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // ── Signature canvas (pointer events cover mouse + touch) ────────────────
  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };
  const onPointerUp = () => {
    drawing.current = false;
  };
  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }, []);

  const submit = async () => {
    if (!hasDrawn || !signerName.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/public/contract/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName: signerName.trim(),
          signatureDataUrl: canvasRef.current!.toDataURL('image/png'),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json?.error || 'Signing failed. Please try again.');
        return;
      }
      setDone(json.data);
    } catch {
      setSubmitError('Signing failed. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const accent = contract?.company.color || '#1E3A5F';
  const docLabel = contract?.doc_type === 'change_order' ? 'Change Order' : 'Contract';

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </main>
    );
  }

  if (loadError || !contract) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
          <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-slate-700">{loadError || 'Document unavailable.'}</p>
        </div>
      </main>
    );
  }

  // ── Signed success screen (also shown when re-opening a signed link) ─────
  if (done || contract.status === 'signed') {
    const pdfUrl = done?.pdfUrl ?? contract.pdf_url;
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10" style={{ ['--c' as string]: accent }}>
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
          <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">{docLabel} signed</h1>
          <p className="mt-2 text-sm text-slate-600">
            {contract.title} — a copy was emailed to you for your records.
          </p>
          <div className="mt-6 space-y-3">
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white"
                style={{ background: accent }}
              >
                <Download className="h-4 w-4" /> Download signed PDF
              </a>
            )}
            {done?.portalUrl && (
              <a
                href={done.portalUrl}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border text-[15px] font-semibold"
                style={{ borderColor: accent, color: accent }}
              >
                <ExternalLink className="h-4 w-4" /> Open your customer portal
              </a>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50" style={{ ['--c' as string]: accent }}>
      <div className="mx-auto w-full max-w-lg px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
          {contract.company.logo && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={contract.company.logo} alt={contract.company.name} className="mb-3 h-10 w-auto" />
          )}
          <p className="text-sm font-medium" style={{ color: accent }}>{contract.company.name}</p>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">{docLabel}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{contract.title}</h1>
          {contract.job_number && <p className="mt-1 text-sm text-slate-500">Job {contract.job_number}</p>}
          {contract.amount != null && (
            <p className="mt-3 inline-block rounded-lg bg-slate-100 px-3 py-1.5 text-lg font-bold text-slate-900">
              ${Number(contract.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          )}
        </header>

        {/* Body */}
        {contract.work_description && (
          <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
            <h2 className="text-sm font-bold text-slate-900">Description of Work</h2>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">{contract.work_description}</p>
          </section>
        )}
        {contract.terms && (
          <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
            <h2 className="text-sm font-bold text-slate-900">Terms & Conditions</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{contract.terms}</p>
          </section>
        )}

        {/* Sign */}
        <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
          <h2 className="text-sm font-bold text-slate-900">Sign to accept</h2>
          <p className="mt-1 text-xs text-slate-500">Draw your signature below, then type your full name.</p>
          <div className="relative mt-3">
            <canvas
              ref={canvasRef}
              width={640}
              height={220}
              className="h-40 w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-slate-50"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
            {!hasDrawn && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                Sign here
              </span>
            )}
            <button
              type="button"
              onClick={clearSignature}
              className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-400 shadow ring-1 ring-slate-200 hover:text-slate-700"
              aria-label="Clear signature"
            >
              <Eraser className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Type your full legal name"
            autoComplete="name"
            className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-[var(--c)] focus:ring-2 focus:ring-[var(--c)]"
          />
          {submitError && <p className="mt-3 text-sm font-medium text-rose-600">{submitError}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={!hasDrawn || !signerName.trim() || submitting}
            className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white transition disabled:opacity-40"
            style={{ background: accent }}
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            {submitting ? 'Signing…' : `Sign ${docLabel}`}
          </button>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
            By signing you agree this electronic signature is as valid as a handwritten one.
          </p>
        </section>
      </div>
    </main>
  );
}
