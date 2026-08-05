'use client';

/**
 * Waiver status for the crew, on the job ticket.
 *
 * WHY: the office ticks "requires waiver signature" on the schedule form, but
 * until now nothing told the CREW whether the site contact had actually signed.
 * Production had 4 jobs requiring a waiver and zero signed. The crew could be
 * standing on the slab with no signature and no way to know.
 *
 * This banner answers three questions before the saw starts:
 *   • Does this job need a waiver?
 *   • Has the site contact signed it?
 *   • If not — was it even sent, and can I send it again right now?
 *
 * It NEVER claims a send succeeded when it didn't: the API reports what was
 * actually delivered, and a failed delivery shows the link so the crew can hand
 * the phone to the contact instead.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileSignature, Send, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface WaiverStatus {
  required: boolean;
  signed: boolean;
  signed_at: string | null;
  signer_name: string | null;
  request_sent: boolean;
  sent_at: string | null;
  url: string | null;
}

export default function WaiverBanner({
  jobId,
  readOnly = false,
}: {
  jobId: string;
  readOnly?: boolean;
}) {
  const [status, setStatus] = useState<WaiverStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/job-orders/${jobId}/waiver`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (res.ok && json?.data) setStatus(json.data as WaiverStatus);
    } catch {
      // A status read failing must not break the ticket — the banner just
      // stays hidden rather than showing a wrong state.
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const resend = async () => {
    setSending(true);
    setFeedback(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/job-orders/${jobId}/waiver`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      setFeedback({
        ok: !!json?.success,
        text: json?.message || json?.error || 'Could not send the waiver.',
      });
      await load();
    } catch {
      setFeedback({ ok: false, text: 'Could not send the waiver. Check your signal and try again.' });
    } finally {
      setSending(false);
    }
  };

  if (loading || !status?.required) return null;

  // ── Signed ────────────────────────────────────────────────────────────────
  if (status.signed) {
    const when = status.signed_at
      ? new Date(status.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/30 rounded-xl">
        <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          Waiver signed
          {status.signer_name ? ` by ${status.signer_name}` : ''}
          {when ? ` · ${when}` : ''}
        </span>
      </div>
    );
  }

  // ── Not signed ────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
            Waiver not signed yet
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
            {status.request_sent
              ? 'The site contact has been sent the waiver but has not signed it.'
              : 'The site contact has not been sent the waiver yet.'}{' '}
            Get it signed before you start cutting.
          </p>
        </div>
      </div>

      {feedback && (
        <p
          className={`text-xs font-medium rounded-lg px-3 py-2 ${
            feedback.ok
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </p>
      )}

      {!readOnly && (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={resend}
            disabled={sending}
            className="flex-1 flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold rounded-xl shadow-sm transition-colors"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {status.request_sent ? 'Resend waiver' : 'Send waiver'}
          </button>
          <Link
            href={`/dashboard/job-schedule/${jobId}/utility-waiver`}
            className="flex-1 flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 bg-white dark:bg-slate-800 border border-amber-400 dark:border-amber-500/50 text-amber-800 dark:text-amber-300 font-bold rounded-xl transition-colors hover:bg-amber-100 dark:hover:bg-slate-700"
          >
            <FileSignature size={18} />
            Sign in person
          </Link>
        </div>
      )}
    </div>
  );
}
