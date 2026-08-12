'use client';

/**
 * The signed paperwork for a job — waiver, completion sign-off, liability
 * release — with links that open.
 *
 * FOUNDER (Aug 12): "in office documents in active jobs I would like to see the
 * PDFs of the signed waivers and job completion tickets — I haven't seen any of
 * that yet."
 *
 * He never had. Two separate reasons, both fixed behind
 * /api/admin/jobs/[id]/documents:
 *   • completion PDFs were archived to a PRIVATE bucket but saved as public
 *     URLs, so every link returned HTTP 400;
 *   • the waiver PDF was never generated at all.
 *
 * Deliberately shows a row for a document that is MISSING as well as one that is
 * present. "Required and not signed yet" is the thing the office most needs to
 * see, and an empty list cannot say it.
 */

import { useCallback, useEffect, useState } from 'react';
import { FileText, ExternalLink, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export interface JobDocumentRow {
  kind: 'completion' | 'waiver' | 'liability_release';
  title: string;
  signed_at: string | null;
  signer_name: string | null;
  url: string | null;
  note: string | null;
}

export default function JobDocuments({ jobId, className = '' }: { jobId: string; className?: string }) {
  const [docs, setDocs] = useState<JobDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired — refresh to see documents.'); return; }
      const res = await fetch(`/api/admin/jobs/${jobId}/documents`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error || 'Could not load documents.');
        return;
      }
      const json = await res.json();
      setDocs(json?.data?.documents ?? []);
    } catch {
      setError('Could not load documents.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  /**
   * The signed storage links expire (30 min), so a tab left open would hand the
   * office a dead link — exactly the failure we just fixed. Re-fetch at click
   * time and open the fresh one.
   */
  const openDoc = async (doc: JobDocumentRow) => {
    if (!doc.url) return;
    if (doc.url.startsWith('/api/')) {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(doc.url, {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) { setError('That document could not be opened.'); return; }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
      return;
    }
    window.open(doc.url, '_blank', 'noopener');
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand/10 text-brand">
          <ShieldCheck className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Signed Documents</h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-white/50">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading documents…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
      ) : docs.length === 0 ? (
        <p className="text-sm italic text-slate-500 dark:text-white/50">
          Nothing signed on this job yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => {
            const when = fmt(d.signed_at);
            const openable = !!d.url;
            return (
              <li
                key={d.kind}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-white ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10"
              >
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ${
                    openable
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
                  }`}
                >
                  {openable ? <FileText className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{d.title}</p>
                  <p className="text-xs text-slate-500 dark:text-white/55 truncate">
                    {[d.signer_name, when].filter(Boolean).join(' · ') || d.note || 'Not signed'}
                  </p>
                  {d.note && (d.signer_name || when) && (
                    <p className="text-xs text-amber-600 dark:text-amber-300 truncate">{d.note}</p>
                  )}
                </div>
                {openable ? (
                  <button
                    onClick={() => openDoc(d)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10 transition-colors flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-300 flex-shrink-0">
                    Outstanding
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
