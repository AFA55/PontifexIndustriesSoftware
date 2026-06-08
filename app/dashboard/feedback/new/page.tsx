'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Bug, Wand2, Lightbulb, CheckCircle2, Loader2, Home,
  AlertTriangle, MessageSquarePlus, Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

// ─── Types ──────────────────────────────────────────────────────────────────

type FeedbackType = 'bug' | 'change_request' | 'idea';

interface MyFeedback {
  id: string;
  type: FeedbackType;
  title: string | null;
  body: string;
  status: string;
  admin_response: string | null;
  created_at: string;
}

const TYPE_OPTIONS: {
  key: FeedbackType;
  label: string;
  hint: string;
  icon: React.ElementType;
  active: string;
  iconColor: string;
}[] = [
  {
    key: 'bug',
    label: 'Something broke',
    hint: 'Report a bug or error',
    icon: Bug,
    active: 'border-rose-500 bg-rose-50 dark:bg-rose-900/30 ring-2 ring-rose-500/40',
    iconColor: 'text-rose-600 dark:text-rose-400',
  },
  {
    key: 'change_request',
    label: 'Change something',
    hint: 'Suggest a change',
    icon: Wand2,
    active: 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 ring-2 ring-violet-500/40',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    key: 'idea',
    label: 'I have an idea',
    hint: 'Suggest a new feature',
    icon: Lightbulb,
    active: 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 ring-2 ring-amber-500/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
];

const STATUS_CHIP: Record<string, string> = {
  open: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  in_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  planned: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  declined: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

const TYPE_META: Record<FeedbackType, { label: string; icon: React.ElementType }> = {
  bug: { label: 'Bug', icon: Bug },
  change_request: { label: 'Change', icon: Wand2 },
  idea: { label: 'Idea', icon: Lightbulb },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Page ───────────────────────────────────────────────────────────────────

function FeedbackForm() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  const [type, setType] = useState<FeedbackType | null>(null);
  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [pageUrl, setPageUrl] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [toast, setToast] = useState('');

  const [mine, setMine] = useState<MyFeedback[]>([]);
  const [mineLoading, setMineLoading] = useState(true);

  // ── Auth: any authenticated user may submit ──────────────────────────────
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  // ── Capture the page they came from ──────────────────────────────────────
  useEffect(() => {
    if (typeof document !== 'undefined' && document.referrer) {
      try {
        const ref = new URL(document.referrer);
        // Only keep same-origin referrers (the page in our app they came from)
        if (ref.origin === window.location.origin) {
          setPageUrl(ref.pathname + ref.search);
        }
      } catch {
        /* ignore malformed referrer */
      }
    }
  }, []);

  // ── Load the caller's own past submissions ───────────────────────────────
  const loadMine = useCallback(async () => {
    setMineLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/feedback', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const j = await res.json();
        setMine(j.data ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setMineLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) loadMine();
  }, [authChecked, loadMine]);

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!type || !bodyText.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired. Please log in again.');

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type,
          title: title.trim() || undefined,
          body: bodyText.trim(),
          page_url: pageUrl || undefined,
        }),
      });

      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Submission failed');

      setToast('Thanks — we got it!');
      setSubmitted(true);
      loadMine();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForAnother() {
    setType(null);
    setTitle('');
    setBodyText('');
    setSubmitted(false);
    setSubmitError('');
  }

  const canSubmit = !!type && bodyText.trim().length > 0;

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-4 sm:p-6 pb-12">
      <div className="max-w-lg mx-auto space-y-5">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white shadow-lg text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            {toast}
          </div>
        )}

        {/* Back nav */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        {/* Header card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 p-5 sm:p-6 shadow-xl shadow-violet-500/30 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 flex-shrink-0">
              <MessageSquarePlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Report an issue or suggest a change</h1>
              <p className="text-sm text-white/75 mt-0.5">Help us make the app better</p>
            </div>
          </div>
        </div>

        {/* ── Submit form (hidden after success) ───────────────────────────── */}
        {!submitted ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 space-y-5">
            {/* Type picker — big tap targets */}
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                What's this about?
              </h2>
              <div className="grid grid-cols-1 gap-2.5">
                {TYPE_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const isActive = type === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setType(opt.key)}
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all min-h-[56px] ${
                        isActive
                          ? opt.active
                          : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 hover:border-violet-300 dark:hover:border-violet-700'
                      }`}
                    >
                      <Icon className={`w-6 h-6 flex-shrink-0 ${opt.iconColor}`} />
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{opt.label}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{opt.hint}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                Short title <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="One line summary…"
                maxLength={200}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                {type === 'bug'
                  ? 'What happened?'
                  : type === 'change_request' || type === 'idea'
                  ? 'What would you change?'
                  : 'Tell us more'}
                <span className="text-rose-500"> *</span>
              </label>
              <textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                placeholder={
                  type === 'bug'
                    ? "Describe what went wrong, and what you were trying to do…"
                    : "Describe what you'd change and why it would help…"
                }
                rows={5}
                maxLength={5000}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
            </div>

            {/* Captured page (informational) */}
            {pageUrl && (
              <p className="text-xs text-gray-400 dark:text-slate-500">
                Linked to page: <span className="font-mono">{pageUrl}</span>
              </p>
            )}

            {submitError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 text-sm text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {submitError}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors min-h-[44px]"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
              ) : (
                'Submit'
              )}
            </button>
          </div>
        ) : (
          /* ── Success confirmation ─────────────────────────────────────────── */
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">We got it!</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1.5">
                Thanks for the feedback. The team will review it and you can track its status below.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                onClick={resetForAnother}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 text-sm font-semibold text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors min-h-[44px]"
              >
                <MessageSquarePlus className="w-4 h-4" />
                Submit another
              </button>
              <Link
                href="/dashboard"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors min-h-[44px]"
              >
                <Home className="w-4 h-4" />
                Done
              </Link>
            </div>
          </div>
        )}

        {/* ── Your past submissions ────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400 flex items-center gap-1.5 mb-3">
            <Clock className="w-4 h-4" /> Your submissions
          </h2>

          {mineLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
            </div>
          ) : mine.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-6">
              You haven't submitted any feedback yet.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {mine.map(item => {
                const meta = TYPE_META[item.type] ?? TYPE_META.idea;
                const Icon = meta.icon;
                const status = (item.status || 'open').toLowerCase();
                return (
                  <li
                    key={item.id}
                    className="p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {item.title || item.body.slice(0, 60)}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {meta.label} · {formatDate(item.created_at)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full flex-shrink-0 capitalize ${
                          STATUS_CHIP[status] || 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {status.replace('_', ' ')}
                      </span>
                    </div>
                    {item.admin_response && (
                      <div className="mt-2 ml-6 p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/40">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500 mb-0.5">
                          Team response
                        </p>
                        <p className="text-xs text-gray-700 dark:text-slate-300">{item.admin_response}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FeedbackNewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        </div>
      }
    >
      <FeedbackForm />
    </Suspense>
  );
}
