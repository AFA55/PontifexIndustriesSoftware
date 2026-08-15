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
 *
 * FOUNDER (Aug 15): "Once job is complete and the utility waiver wasn't signed,
 * just say NOT SIGNED instead of Outstanding, because there's no point getting
 * it now. But create a button where, if the job is ACTIVE and they haven't
 * gotten it signed, admin or PMs and supervisors can send notifications to them
 * to get that waiver signed."
 *
 * So the unsigned waiver row is two different things depending on the job:
 *   • job closed → a neutral "Not signed" fact. An alarm nobody can act on is
 *     how people learn to ignore the alarms that matter.
 *   • job live   → the amber "Outstanding" warning PLUS a button that nudges
 *     the crew. The tone stays only where the tone can still change something.
 */

import { useCallback, useEffect, useState } from 'react';
import { FileText, ExternalLink, AlertTriangle, Loader2, ShieldCheck, BellRing } from 'lucide-react';
import { authedFetch, isSessionExpired } from '@/lib/authed-fetch';
import { canNudgeWaiver, isWaiverChaseClosed, WAIVER_STATE_LABEL } from '@/lib/waiver-nudge';

/** Who may press "Remind crew" — the roles the founder named. */
const WAIVER_NUDGE_ROLES = ['admin', 'super_admin', 'operations_manager', 'salesman', 'supervisor'];

export interface JobDocumentRow {
  kind: 'completion' | 'waiver' | 'liability_release';
  title: string;
  signed_at: string | null;
  signer_name: string | null;
  url: string | null;
  note: string | null;
}

export default function JobDocuments({
  jobId,
  className = '',
  jobStatus,
  userRole,
}: {
  jobId: string;
  className?: string;
  /** Drives whether an unsigned waiver is a warning or just a recorded fact. */
  jobStatus?: string | null;
  /** Gates the "Remind crew" button; the API enforces the same set. */
  userRole?: string | null;
}) {
  const [docs, setDocs] = useState<JobDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // "Remind crew to get it signed" — one press per job per hour, and the result
  // is always said out loud. A button that appears to do nothing is the exact
  // failure this panel exists to stop.
  const [nudging, setNudging] = useState(false);
  const [nudgeResult, setNudgeResult] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const jobClosed = isWaiverChaseClosed(jobStatus);
  const mayNudge = !!userRole && WAIVER_NUDGE_ROLES.includes(userRole);

  const sendNudge = async () => {
    setNudging(true);
    setNudgeResult(null);
    try {
      // authedFetch, not a raw getSession + fetch: this is the same call shape
      // that left the founder staring at "Unauthorized. Invalid or expired
      // session." on the print page. It refreshes and retries once before it
      // gives up. See lib/authed-fetch.ts.
      const res = await authedFetch(`/api/admin/jobs/${jobId}/waiver-nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNudgeResult({ kind: 'err', msg: json?.error || 'Could not send the reminder.' });
        return;
      }
      setNudgeResult({ kind: 'ok', msg: json?.data?.message || 'Reminder sent.' });
    } catch (e) {
      setNudgeResult({
        kind: 'err',
        msg: isSessionExpired(e)
          ? 'Your session expired — sign in again and the reminder will send.'
          : 'Network error — the reminder was not sent.',
      });
    } finally {
      setNudging(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/jobs/${jobId}/documents`);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error || 'Could not load documents.');
        return;
      }
      const json = await res.json();
      setDocs(json?.data?.documents ?? []);
    } catch (e) {
      setError(
        isSessionExpired(e)
          ? 'Your session expired — sign in again to see the documents.'
          : 'Could not load documents.'
      );
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
      let res: Response;
      try {
        res = await authedFetch(doc.url);
      } catch (e) {
        setError(
          isSessionExpired(e)
            ? 'Your session expired — sign in again to open this document.'
            : 'That document could not be opened.'
        );
        return;
      }
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
            // An unsigned waiver on a job that is over is a fact, not a task —
            // it goes grey and drops the warning triangle. Every other missing
            // document keeps the amber it always had.
            const settled = !openable && d.kind === 'waiver' && jobClosed;
            const showNudge =
              !openable &&
              d.kind === 'waiver' &&
              mayNudge &&
              canNudgeWaiver({ requireWaiver: true, signed: false, jobStatus });
            return (
              <li
                key={d.kind}
                className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 bg-white ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10"
              >
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ${
                    openable
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : settled
                        ? 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50'
                        : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
                  }`}
                >
                  {openable || settled ? <FileText className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{d.title}</p>
                  <p className="text-xs text-slate-500 dark:text-white/55 truncate">
                    {settled
                      ? 'Never signed — the job is closed.'
                      : [d.signer_name, when].filter(Boolean).join(' · ') || d.note || 'Not signed'}
                  </p>
                  {!settled && d.note && (d.signer_name || when) && (
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
                ) : settled ? (
                  <span className="text-xs font-semibold text-slate-500 dark:text-white/50 flex-shrink-0">
                    {WAIVER_STATE_LABEL.not_signed_closed}
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-300 flex-shrink-0">
                    {WAIVER_STATE_LABEL.outstanding}
                  </span>
                )}

                {showNudge && (
                  <div className="w-full">
                    <button
                      onClick={sendNudge}
                      disabled={nudging}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-bold transition-colors disabled:opacity-60 bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-900"
                    >
                      {nudging ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <BellRing className="w-3.5 h-3.5" />
                      )}
                      Remind crew to get it signed
                    </button>
                    {nudgeResult && (
                      <p
                        role="status"
                        className={`mt-1.5 text-xs ${
                          nudgeResult.kind === 'ok'
                            ? 'text-emerald-600 dark:text-emerald-300'
                            : 'text-rose-600 dark:text-rose-300'
                        }`}
                      >
                        {nudgeResult.msg}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
