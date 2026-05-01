'use client';

/**
 * CustomerSatisfactionSurvey
 *
 * Shared, self-contained survey form used by both:
 *   - On-site flow (operator-facing day-complete page) — variant="light"
 *   - Remote flow  (public /sign/[token] page)         — variant="public"
 *
 * Business rule: results are delivered to the job's site-contact phone by
 * default — NEVER through the operator's device. The customer can optionally
 * choose to receive results at their own email instead. This protects the
 * integrity of feedback against operator tampering.
 */

import { useState } from 'react';
import { Star, Heart, Send, Lock, Mail, Phone, Loader2 } from 'lucide-react';

export type SurveyData = {
  cleanliness_rating: number;       // 1-5
  communication_rating: number;     // 1-5
  operator_feedback_notes?: string; // free text, optional
  likely_to_use_again_rating: number; // 1-10 NPS
  send_to_email?: string;           // if set, customer chose email delivery
};

interface Props {
  initialEmail?: string;
  contactPhoneOnSite?: string | null;
  onSubmit: (data: SurveyData) => Promise<void>;
  submitting: boolean;
  variant?: 'light' | 'public';
}

/* ─── Star Rating (1-5) ─────────────────────────────────── */
function StarRating({
  value,
  onChange,
  label,
  hint,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-800 mb-1">{label}</p>
      {hint && <p className="text-xs text-slate-500 mb-2">{hint}</p>}
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            className="p-1 transition-transform hover:scale-110 active:scale-95"
          >
            <Star
              className={`w-8 h-8 transition-colors ${
                n <= value
                  ? 'fill-amber-400 text-amber-400 drop-shadow'
                  : 'text-slate-300'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── NPS-style 1-10 Chip Selector ──────────────────────── */
function NpsChips({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  // NPS coloring: 1-6 detractor (rose), 7-8 passive (amber), 9-10 promoter (emerald)
  const colorFor = (n: number, selected: boolean) => {
    if (!selected) return 'bg-white border-slate-300 text-slate-600 hover:border-slate-400';
    if (n >= 9) return 'bg-emerald-500 border-emerald-600 text-white shadow';
    if (n >= 7) return 'bg-amber-500 border-amber-600 text-white shadow';
    return 'bg-rose-500 border-rose-600 text-white shadow';
  };

  return (
    <div>
      <p className="text-sm font-semibold text-slate-800 mb-1">
        How likely are you to use Patriot Concrete Cutting again?
      </p>
      <p className="text-xs text-slate-500 mb-2">1 = not likely &nbsp;·&nbsp; 10 = absolutely</p>
      <div className="grid grid-cols-10 gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`h-10 rounded-lg border-2 text-sm font-bold transition-all ${colorFor(
                n,
                selected
              )}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-400 px-0.5">
        <span>not likely</span>
        <span>absolutely</span>
      </div>
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────── */
export default function CustomerSatisfactionSurvey({
  initialEmail = '',
  contactPhoneOnSite = null,
  onSubmit,
  submitting,
  variant = 'light',
}: Props) {
  const [cleanliness, setCleanliness] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [likelyAgain, setLikelyAgain] = useState(0);
  const [notes, setNotes] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'phone' | 'email'>('phone');
  const [email, setEmail] = useState(initialEmail);
  const [touched, setTouched] = useState(false);

  // Disable submit until at least one rating is set
  const hasAnyRating = cleanliness > 0 || communication > 0 || likelyAgain > 0;
  const emailValid =
    deliveryMode !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = hasAnyRating && emailValid && !submitting;

  const handleSubmit = async () => {
    setTouched(true);
    if (!canSubmit) return;

    const data: SurveyData = {
      cleanliness_rating: cleanliness,
      communication_rating: communication,
      likely_to_use_again_rating: likelyAgain,
      operator_feedback_notes: notes.trim() || undefined,
      send_to_email:
        deliveryMode === 'email' && email.trim() ? email.trim() : undefined,
    };

    await onSubmit(data);
  };

  // Theming hooks
  const shellClass =
    variant === 'public'
      ? 'bg-white rounded-2xl shadow-lg p-6 space-y-6'
      : 'bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6';

  const formatPhone = (raw: string | null | undefined) => {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return raw;
  };
  const prettyPhone = formatPhone(contactPhoneOnSite);

  return (
    <div className={shellClass}>
      {/* Encouraging intro */}
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-lg">
          <Heart className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">
          We value your feedback
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Your comments help us improve every day. This will only take a minute.
        </p>
      </div>

      {/* Ratings */}
      <div className="space-y-5">
        <StarRating
          label="Cleanliness"
          value={cleanliness}
          onChange={setCleanliness}
          hint="Did the crew leave the worksite tidy?"
        />
        <StarRating
          label="Communication"
          value={communication}
          onChange={setCommunication}
          hint="Were we clear, prompt, and professional?"
        />
        <NpsChips value={likelyAgain} onChange={setLikelyAgain} />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-semibold text-slate-800 mb-1">
          Notes about your operator (optional)
        </label>
        <p className="text-xs text-slate-500 mb-2">
          Tell us how they did, what stood out, or anything else.
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="They were super professional, cleaned up after themselves..."
          rows={4}
          className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-slate-900 resize-none placeholder:text-slate-400"
        />
      </div>

      {/* Delivery mode */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-800">
          How would you like to receive your results?
        </p>

        {/* Phone option (default) */}
        <label
          className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
            deliveryMode === 'phone'
              ? 'bg-purple-50 border-purple-500'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <input
            type="radio"
            name="delivery"
            checked={deliveryMode === 'phone'}
            onChange={() => setDeliveryMode('phone')}
            className="mt-0.5 w-4 h-4 text-purple-600 focus:ring-purple-500"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Phone className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Send to my contact-on-site phone</span>
              <span className="text-[10px] uppercase tracking-wide font-bold text-purple-600 bg-purple-100 rounded px-1.5 py-0.5 ml-1">
                Default
              </span>
            </div>
            {prettyPhone && (
              <p className="text-xs text-slate-600 mt-0.5 font-mono">{prettyPhone}</p>
            )}
          </div>
        </label>

        {/* Disclaimer pill — always visible */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
          <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-800 leading-relaxed">
            Results go directly to the contact phone on file — they will not pass
            through your operator. This protects the integrity of your feedback.
          </p>
        </div>

        {/* Email option */}
        <label
          className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
            deliveryMode === 'email'
              ? 'bg-purple-50 border-purple-500'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <input
            type="radio"
            name="delivery"
            checked={deliveryMode === 'email'}
            onChange={() => setDeliveryMode('email')}
            className="mt-0.5 w-4 h-4 text-purple-600 focus:ring-purple-500"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Mail className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Send to my email instead</span>
            </div>
            {deliveryMode === 'email' && (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                className={`mt-2 w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-slate-900 ${
                  touched && !emailValid ? 'border-rose-400' : 'border-slate-300'
                }`}
              />
            )}
          </div>
        </label>
        {touched && deliveryMode === 'email' && !emailValid && (
          <p className="text-xs text-rose-600">
            Please enter a valid email address.
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl py-4 font-bold text-base shadow-lg hover:shadow-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            Submit Feedback
          </>
        )}
      </button>

      {!hasAnyRating && (
        <p className="text-center text-xs text-slate-400 -mt-2">
          Tap at least one rating to submit.
        </p>
      )}
    </div>
  );
}
