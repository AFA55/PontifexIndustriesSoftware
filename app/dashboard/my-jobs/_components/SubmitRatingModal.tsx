'use client';

import { useState, useCallback } from 'react';
import { X, Star, Loader2, CheckCircle2, BarChart2, CheckSquare, AlignLeft, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Question {
  id: string;
  text: string;
  type: 'rating_5' | 'rating_10' | 'yes_no' | 'text';
  required: boolean;
}

interface PendingRating {
  ratee: { id: string; name: string; role: string };
  job: { id: string; job_number: string; scheduled_date: string; customer_name: string };
  form_id: string;
  form_title: string;
}

interface Props {
  pending: PendingRating;
  questions: Question[];
  onClose: () => void;
  onSubmitted: (formId: string, rateeId: string, jobId: string) => void;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Owner',
  operations_manager: 'Ops Manager',
  admin: 'Admin',
  supervisor: 'Supervisor',
  salesman: 'Project Mgr',
  shop_manager: 'Shop Manager',
  shop_help: 'Shop Helper',
  operator: 'Operator',
  apprentice: 'Team Member',
};

// Star rating component (1–5)
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold border-2 transition-all ${
            n <= (hover || value)
              ? 'bg-amber-100 border-amber-400 text-amber-700 scale-110'
              : 'bg-gray-50 border-gray-200 text-gray-400'
          }`}
          aria-label={`Rate ${n} out of 5`}
        >
          <Star className={`w-5 h-5 ${n <= (hover || value) ? 'fill-amber-500 text-amber-500' : ''}`} />
        </button>
      ))}
    </div>
  );
}

// Numeric rating component (1–10)
function NumericRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold border-2 transition-all ${
            n === value
              ? 'bg-purple-600 border-purple-600 text-white scale-110 shadow-md'
              : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-purple-300'
          }`}
          aria-label={`Rate ${n} out of 10`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function SubmitRatingModal({ pending, questions, onClose, onSubmitted }: Props) {
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const setResponse = (qId: string, value: any) => {
    setResponses((prev) => ({ ...prev, [qId]: value }));
    setValidationErrors((prev) => { const n = { ...prev }; delete n[qId]; return n; });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (const q of questions) {
      if (!q.required) continue;
      const val = responses[q.id];
      if (val === undefined || val === null || val === '') {
        errs[q.id] = 'This question is required';
      }
      if ((q.type === 'rating_5' || q.type === 'rating_10') && !val) {
        errs[q.id] = 'Please select a rating';
      }
    }
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Session expired. Please refresh the page.');
        return;
      }

      const res = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          form_id: pending.form_id,
          ratee_id: pending.ratee.id,
          job_order_id: pending.job.id,
          responses,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setSubmitted(true); // Already submitted — show success
          return;
        }
        setError(json.error || 'Failed to submit rating');
        return;
      }

      setSubmitted(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses, pending]);

  const handleDone = () => {
    onSubmitted(pending.form_id, pending.ratee.id, pending.job.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">Rate a Coworker</h2>
            <p className="text-xs text-gray-500 truncate">
              {pending.ratee.name} &bull; {ROLE_LABELS[pending.ratee.role] || pending.ratee.role}
            </p>
            <p className="text-xs text-blue-600 font-medium mt-0.5">
              {pending.job.job_number} &bull; {pending.job.customer_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {submitted ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Rating Submitted!</h3>
              <p className="text-gray-500 text-sm mb-6">
                Thanks for the feedback. Your review helps the team improve.
              </p>
              <button
                onClick={handleDone}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-all min-h-[48px]"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2 leading-relaxed">
                <strong className="text-gray-700">{pending.form_title}</strong> — Your response is anonymous and helps us build a stronger team.
              </p>

              {questions.map((q, i) => (
                <div key={q.id}>
                  <p className="text-sm font-semibold text-gray-800 mb-3">
                    {i + 1}. {q.text}
                    {q.required && <span className="text-red-500 ml-1">*</span>}
                  </p>

                  {q.type === 'rating_5' && (
                    <StarRating value={responses[q.id] || 0} onChange={(v) => setResponse(q.id, v)} />
                  )}

                  {q.type === 'rating_10' && (
                    <NumericRating value={responses[q.id] || 0} onChange={(v) => setResponse(q.id, v)} />
                  )}

                  {q.type === 'yes_no' && (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setResponse(q.id, true)}
                        className={`flex-1 py-3.5 rounded-xl font-semibold text-sm border-2 transition-all min-h-[52px] ${
                          responses[q.id] === true
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setResponse(q.id, false)}
                        className={`flex-1 py-3.5 rounded-xl font-semibold text-sm border-2 transition-all min-h-[52px] ${
                          responses[q.id] === false
                            ? 'bg-red-500 border-red-500 text-white shadow-md'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-red-300'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  )}

                  {q.type === 'text' && (
                    <textarea
                      value={responses[q.id] || ''}
                      onChange={(e) => setResponse(q.id, e.target.value)}
                      placeholder="Type your response..."
                      rows={3}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 resize-none"
                    />
                  )}

                  {validationErrors[q.id] && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors[q.id]}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!submitted && (
          <div className="px-5 py-4 border-t border-gray-100">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 min-h-[52px]"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
