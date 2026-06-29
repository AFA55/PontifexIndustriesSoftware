'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bug,
  Sparkles,
  Lightbulb,
  Send,
  MessageSquareWarning,
  Inbox,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { toLocalYMD, formatDay } from '@/lib/dates';
import {
  Button,
  Card,
  Alert,
  StatusBadge,
  EmptyState,
  PageHeader,
  Spinner,
} from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

// ─── Types ──────────────────────────────────────────────────────────────────
type FeedbackType = 'bug' | 'change_request' | 'idea';
type FeedbackStatus = 'open' | 'in_review' | 'planned' | 'done' | 'declined';

interface FeedbackItem {
  id: string;
  type: FeedbackType;
  title: string | null;
  body: string;
  status: FeedbackStatus;
  admin_response: string | null;
  page_url: string | null;
  created_at: string;
}

const ALLOWED_ROLES = ['admin', 'super_admin', 'operations_manager'];
const MAX_TITLE = 200;
const MAX_BODY = 5000;

// ─── Type selector config ─────────────────────────────────────────────────────
const TYPE_OPTIONS: {
  value: FeedbackType;
  label: string;
  emoji: string;
  icon: typeof Bug;
  hint: string;
}[] = [
  { value: 'bug', label: 'Bug', emoji: '🐛', icon: Bug, hint: 'Something is broken' },
  { value: 'change_request', label: 'Change request', emoji: '✨', icon: Sparkles, hint: 'Tweak how something works' },
  { value: 'idea', label: 'Idea', emoji: '💡', icon: Lightbulb, hint: 'A new feature or suggestion' },
];

// ─── Status display config ────────────────────────────────────────────────────
const STATUS_CONFIG: Record<FeedbackStatus, { label: string; variant: BadgeVariant }> = {
  open: { label: 'Open', variant: 'info' },
  in_review: { label: 'In review', variant: 'warning' },
  planned: { label: 'Planned', variant: 'brand' },
  done: { label: 'Done', variant: 'success' },
  declined: { label: 'Declined', variant: 'neutral' },
};

function typeMeta(type: FeedbackType) {
  return TYPE_OPTIONS.find((t) => t.value === type) ?? TYPE_OPTIONS[0];
}

/** ISO timestamp → "Mon, Jun 23, 2026" using the shared local-date helpers. */
function formatCreated(iso: string): string {
  return formatDay(toLocalYMD(new Date(iso)), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function FeedbackPage() {
  const router = useRouter();

  // form state
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [area, setArea] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // list state
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  // ── Auth guard (match the Settings page) ────────────────────────────────────
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    if (!ALLOWED_ROLES.includes(user.role)) {
      router.push('/dashboard');
    }
  }, [router]);

  // ── Load the caller's own submissions ───────────────────────────────────────
  const fetchSubmissions = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch('/api/feedback', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setListError(json?.error || 'Failed to load your submissions.');
        return;
      }
      setItems((json?.data ?? []) as FeedbackItem[]);
    } catch {
      setListError('Network error loading your submissions.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitted(false);

    const trimmedBody = bodyText.trim();
    if (!trimmedBody) {
      setSubmitError('Please describe the issue or request.');
      return;
    }

    setSubmitting(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const trimmedArea = area.trim();
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type,
          title: title.trim() || undefined,
          body: trimmedBody,
          page_url: trimmedArea || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json?.error || 'Failed to submit. Please try again.');
        return;
      }

      // success — clear form, surface confirmation, refresh the list
      setSubmitted(true);
      setTitle('');
      setArea('');
      setBodyText('');
      setType('bug');
      fetchSubmissions();
      setTimeout(() => setSubmitted(false), 5000);
    } catch {
      setSubmitError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClasses =
    'w-full rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 ' +
    'px-3.5 py-3 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 ' +
    'focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
      <div className="container mx-auto px-4 md:px-6 py-6 max-w-3xl">
        <PageHeader
          title="Report an Issue / Request a Change"
          subtitle="Tell us what's broken, what you'd tweak, or what you'd love to see. The Pontifex team reviews every submission."
          backHref="/dashboard/admin/settings"
          backLabel="Back to Settings"
        />

        {/* ── Submit form ─────────────────────────────────────────────────── */}
        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            {submitted && (
              <Alert variant="success" title="Thanks — your submission was received!">
                We&apos;ve logged it for the Pontifex team. You&apos;ll see it in your list below, and we&apos;ll update its status as we work through it.
              </Alert>
            )}
            {submitError && <Alert variant="danger" title="Couldn&apos;t submit">{submitError}</Alert>}

            {/* Type selector */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                What kind of feedback is this?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {TYPE_OPTIONS.map((opt) => {
                  const selected = type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      aria-pressed={selected}
                      className={
                        'flex flex-col items-start gap-1 rounded-xl border p-4 text-left min-h-[44px] transition ' +
                        (selected
                          ? 'border-brand ring-2 ring-brand/30 bg-brand/5 dark:bg-brand/10'
                          : 'border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 hover:border-brand/50')
                      }
                    >
                      <span className="text-xl" aria-hidden="true">{opt.emoji}</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{opt.label}</span>
                      <span className="text-xs text-gray-500 dark:text-white/50">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title (optional) */}
            <div>
              <label htmlFor="fb-title" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Title <span className="font-normal text-gray-400 dark:text-white/40">(optional)</span>
              </label>
              <input
                id="fb-title"
                type="text"
                value={title}
                maxLength={MAX_TITLE}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary, e.g. “Clock-in button is greyed out”"
                className={inputClasses}
              />
            </div>

            {/* Which page/area (optional → page_url) */}
            <div>
              <label htmlFor="fb-area" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Which page or area? <span className="font-normal text-gray-400 dark:text-white/40">(optional)</span>
              </label>
              <input
                id="fb-area"
                type="text"
                value={area}
                maxLength={500}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Schedule Board, My Jobs, Invoices…"
                className={inputClasses}
              />
            </div>

            {/* Description (required) */}
            <div>
              <label htmlFor="fb-body" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="fb-body"
                value={bodyText}
                maxLength={MAX_BODY}
                rows={6}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="What happened, what you expected, and any steps to reproduce. The more detail, the faster we can act."
                className={inputClasses + ' resize-y'}
                required
              />
              <div className="mt-1 text-right text-xs text-gray-400 dark:text-white/40">
                {bodyText.length} / {MAX_BODY}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                loading={submitting}
                leftIcon={<Send className="h-4 w-4" />}
              >
                {submitting ? 'Submitting…' : 'Submit feedback'}
              </Button>
            </div>
          </form>
        </Card>

        {/* ── Your submissions ────────────────────────────────────────────── */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Inbox className="h-5 w-5 text-gray-500 dark:text-white/50" />
            Your submissions
          </h2>

          {listLoading ? (
            <Card>
              <div className="flex items-center justify-center gap-3 py-8 text-gray-500 dark:text-white/60">
                <Spinner size="md" brand />
                <span className="text-sm font-medium">Loading your submissions…</span>
              </div>
            </Card>
          ) : listError ? (
            <Alert variant="danger" title="Couldn&apos;t load your submissions">{listError}</Alert>
          ) : items.length === 0 ? (
            <Card noPadding>
              <EmptyState
                icon={MessageSquareWarning}
                title="No submissions yet"
                description="When you report an issue or request a change above, it'll show up here so you can track its status."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const meta = typeMeta(item.type);
                const status = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.open;
                return (
                  <Card key={item.id}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">{meta.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-white">
                              {item.title || meta.label}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">
                              {meta.label} · {formatCreated(item.created_at)}
                            </p>
                          </div>
                          <StatusBadge variant={status.variant} className="shrink-0">
                            {status.label}
                          </StatusBadge>
                        </div>

                        <p className="mt-2 text-sm text-gray-600 dark:text-white/70 line-clamp-3">
                          {item.body}
                        </p>

                        {item.page_url && (
                          <p className="mt-1.5 text-xs text-gray-400 dark:text-white/40">
                            Area: {item.page_url}
                          </p>
                        )}

                        {item.admin_response && (
                          <div className="mt-3 rounded-xl border border-brand/20 bg-brand/5 dark:bg-brand/10 px-3 py-2.5">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-brand mb-0.5">
                              Response from the team
                            </p>
                            <p className="text-sm text-gray-700 dark:text-white/80">
                              {item.admin_response}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
