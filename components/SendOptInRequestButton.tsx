'use client';

/**
 * SendOptInRequestButton — admin/staff control that emails (and best-effort
 * texts) a contact a link to the public consent page (`/sms-opt-in`),
 * pre-filled with their phone + name, so they can confirm they want text/email
 * job updates.
 *
 * Reflects PERSISTED opt-in state (fetched on mount from
 * /api/admin/sms-opt-in-status): Send → Request sent (pending) → Opted in.
 * Previously the button was in-memory only, so a reload always looked un-sent.
 *
 * Calls POST /api/admin/sms-opt-in-request with the bearer-token pattern.
 * White-label: uses the `brand` Tailwind tokens. Disabled when there is no phone.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { MessageSquarePlus, Loader2, CheckCircle2, AlertCircle, Clock, XCircle } from 'lucide-react';

interface SendOptInRequestButtonProps {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  jobId?: string | null;
  className?: string;
}

// Persisted server state + the transient local action states.
type ServerState = 'loading' | 'none' | 'pending' | 'accepted' | 'revoked';
type Action = 'idle' | 'sending' | 'error';

function fmtSince(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function SendOptInRequestButton({
  name,
  phone,
  email,
  jobId,
  className = '',
}: SendOptInRequestButtonProps) {
  const [serverState, setServerState] = useState<ServerState>('loading');
  const [since, setSince] = useState<string | null>(null);
  const [action, setAction] = useState<Action>('idle');
  const [message, setMessage] = useState('');

  const fetchStatus = useCallback(async () => {
    if (!phone) { setServerState('none'); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/sms-opt-in-status?phone=${encodeURIComponent(phone)}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const json = await res.json().catch(() => ({}));
      setServerState((json.state as ServerState) || 'none');
      setSince(json.since || null);
    } catch {
      setServerState('none');
    }
  }, [phone]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleClick = async () => {
    if (!phone) return;
    setAction('sending');
    setMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/sms-opt-in-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          name: name || undefined,
          phone,
          email: email || undefined,
          jobId: jobId || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not send the opt-in request.');
      }
      setAction('idle');
      setServerState('pending');
      setSince(new Date().toISOString());
    } catch (err) {
      setAction('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const base =
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed';

  // Loading the persisted state — keep it quiet.
  if (serverState === 'loading') {
    return (
      <span className={`${base} bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-white/40 ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </span>
    );
  }

  // Already opted in — terminal green state.
  if (serverState === 'accepted') {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 ${className}`}>
        <CheckCircle2 className="w-3.5 h-3.5" />
        Opted in{since ? ` · ${fmtSince(since)}` : ''}
      </span>
    );
  }

  const isPending = serverState === 'pending';
  const isRevoked = serverState === 'revoked';

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      {isPending && (
        <span className={`${base} bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300`}>
          <Clock className="w-3.5 h-3.5" />
          Request sent{since ? ` · ${fmtSince(since)}` : ''} · awaiting reply
        </span>
      )}
      {isRevoked && (
        <span className={`${base} bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300`}>
          <XCircle className="w-3.5 h-3.5" />
          Opted out
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={!phone || action === 'sending'}
        title={!phone ? 'No phone number on file' : 'Send a text/email opt-in request'}
        className={`${base} ${isPending || isRevoked
          ? 'bg-white text-brand border border-brand/40 hover:bg-brand/5 dark:bg-white/5'
          : 'bg-brand text-white hover:bg-brand-dark'} disabled:opacity-50`}
      >
        {action === 'sending' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <MessageSquarePlus className="w-3.5 h-3.5" />
        )}
        {action === 'sending'
          ? 'Sending…'
          : isPending
            ? 'Resend request'
            : isRevoked
              ? 'Send opt-in request again'
              : 'Send opt-in request'}
      </button>
      {action === 'error' && (
        <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-3 h-3" />
          {message}
        </span>
      )}
    </div>
  );
}
