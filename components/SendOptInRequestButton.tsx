'use client';

/**
 * SendOptInRequestButton — admin/staff control that emails (and best-effort
 * texts) a contact a link to the public consent page (`/sms-opt-in`),
 * pre-filled with their phone + name, so they can confirm they want text/email
 * job updates.
 *
 * Calls POST /api/admin/sms-opt-in-request with the bearer-token pattern
 * (Authorization: Bearer <access_token> from supabase.auth.getSession()).
 *
 * White-label: uses the `brand` Tailwind tokens — no hardcoded purple.
 * Disabled when there is no phone number.
 */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MessageSquarePlus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface SendOptInRequestButtonProps {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  jobId?: string | null;
  className?: string;
}

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function SendOptInRequestButton({
  name,
  phone,
  email,
  jobId,
  className = '',
}: SendOptInRequestButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  const disabled = !phone || status === 'sending' || status === 'sent';

  const handleClick = async () => {
    if (!phone) return;
    setStatus('sending');
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
      const sentEmail = Array.isArray(json.channels) && json.channels.includes('email');
      setStatus('sent');
      setMessage(sentEmail ? 'Opt-in request sent' : 'Opt-in request queued');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const base =
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed';

  if (status === 'sent') {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 ${className}`}>
        <CheckCircle2 className="w-3.5 h-3.5" />
        {message || 'Opt-in request sent'}
      </span>
    );
  }

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={!phone ? 'No phone number on file' : 'Send a text/email opt-in request'}
        className={`${base} bg-brand text-white hover:bg-brand-dark disabled:opacity-50`}
      >
        {status === 'sending' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <MessageSquarePlus className="w-3.5 h-3.5" />
        )}
        {status === 'sending' ? 'Sending…' : 'Send opt-in request'}
      </button>
      {status === 'error' && (
        <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-3 h-3" />
          {message}
        </span>
      )}
    </div>
  );
}
