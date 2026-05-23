'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import { MessageSquare, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

const COMPANY = 'Pontifex Industries';

// The exact disclosure the user agrees to — stored with the consent record.
const CONSENT_TEXT =
  `I agree to receive text messages from ${COMPANY} about job scheduling, dispatch ` +
  `updates, arrival notifications, and work-completion signature requests. Message ` +
  `frequency varies. Message & data rates may apply. Reply STOP to unsubscribe, ` +
  `HELP for help. Consent is not a condition of any purchase.`;

export default function SmsOptInPage() {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!agreed) { setError('Please check the box to agree before submitting.'); return; }
    if (!phone.trim()) { setError('Please enter your mobile phone number.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/sms-opt-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          contact_name: name.trim() || undefined,
          consent: true,
          consent_text: CONSENT_TEXT,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) setDone(true);
      else setError(data.error || 'Something went wrong. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-700 to-indigo-600 px-8 py-7 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/15 mb-3">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">{COMPANY} Text Alerts</h1>
            <p className="text-white/80 text-sm mt-1">Opt in to receive job updates by text</p>
          </div>

          {done ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-slate-900">You&apos;re signed up</h2>
              <p className="text-slate-500 text-sm mt-2">
                Thanks — you&apos;ll now receive text updates from {COMPANY}. Reply <strong>STOP</strong> at
                any time to unsubscribe, or <strong>HELP</strong> for assistance.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Name (optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Contractor"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Mobile Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none"
                />
              </div>

              {/* Consent — NOT pre-checked (required by carriers) */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-slate-300 text-violet-600 focus:ring-violet-400 shrink-0"
                />
                <span className="text-sm text-slate-600 leading-relaxed">
                  Yes, I agree to receive text messages from {COMPANY} about job scheduling, dispatch
                  updates, arrival notifications, and work-completion signature requests.
                  Message frequency varies. <strong>Message &amp; data rates may apply.</strong> Reply
                  <strong> STOP</strong> to unsubscribe, <strong>HELP</strong> for help. Consent is not a
                  condition of any purchase.
                </span>
              </label>

              {error && (
                <div className="text-sm text-rose-600 bg-rose-50 ring-1 ring-rose-200 rounded-lg px-3 py-2">{error}</div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl py-3.5 font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {submitting ? 'Submitting…' : 'Yes, sign me up'}
              </button>

              <p className="text-xs text-slate-400 text-center leading-relaxed">
                By submitting you agree to our{' '}
                <Link href="/terms" className="text-violet-600 underline">Terms of Service</Link> and{' '}
                <Link href="/privacy" className="text-violet-600 underline">Privacy Policy</Link>.
                We never sell your information. Standard message &amp; data rates may apply.
              </p>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">
          {COMPANY} · Text alerts for active job sites
        </p>
      </div>
    </div>
  );
}
