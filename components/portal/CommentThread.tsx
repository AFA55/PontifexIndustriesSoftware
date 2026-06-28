'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Send, MessageSquare, Loader2, AlertCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Comment {
  id: string;
  author_kind: 'customer' | 'staff';
  author_name: string | null;
  body: string;
  created_at: string;
}

interface CommentThreadProps {
  token: string;
  jobId: string;
  /** Tenant primary color (hex) for the customer bubble + send button accent. */
  primaryColor?: string | null;
}

const MAX_LEN = 2000;

// ─── Relative time (no external dep — keeps the public bundle lean) ─────────────

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min !== 1 ? 's' : ''} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr !== 1 ? 's' : ''} ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day !== 1 ? 's' : ''} ago`;
  // Fall back to an absolute date for older messages.
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CommentThread({ token, jobId, primaryColor }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const scrollAnchor = useRef<HTMLDivElement | null>(null);

  const accent = primaryColor || undefined;

  // ── Load thread ────────────────────────────────────────────────────────────
  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/public/portal/${token}/comments?jobId=${encodeURIComponent(jobId)}`
      );
      if (!res.ok) {
        setLoadError('Unable to load messages.');
        setLoading(false);
        return;
      }
      const json = await res.json();
      // API returns { success, data: [...] }. Stay tolerant of a {comments} shape too.
      const list: Comment[] = Array.isArray(json.data)
        ? json.data
        : (json.data?.comments ?? json.comments ?? []);
      setComments(Array.isArray(list) ? list : []);
      setLoadError('');
    } catch {
      setLoadError('Unable to load messages.');
    } finally {
      setLoading(false);
    }
  }, [token, jobId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (body.length > MAX_LEN) {
      setSendError(`Messages are limited to ${MAX_LEN} characters.`);
      return;
    }

    setSending(true);
    setSendError('');

    // Optimistic append.
    const optimistic: Comment = {
      id: `optimistic-${Date.now()}`,
      author_kind: 'customer',
      author_name: 'You',
      body,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimistic]);
    setDraft('');

    try {
      const res = await fetch(`/api/public/portal/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, body }),
      });

      if (res.status === 429) {
        // Roll back the optimistic message and tell the customer to slow down.
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
        setDraft(body);
        setSendError('You are sending messages too quickly — please wait a moment and try again.');
        return;
      }

      if (!res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
        setDraft(body);
        const errData = await res.json().catch(() => ({}));
        setSendError(errData.error || 'Could not send your message. Please try again.');
        return;
      }

      // Reconcile with the server copy so we get the real id + timestamp.
      const json = await res.json();
      // API returns { success, data: <comment> }. Stay tolerant of a {comment} shape too.
      const saved: Comment | undefined =
        json.data && json.data.id ? json.data : (json.data?.comment ?? json.comment);
      if (saved) {
        setComments((prev) => prev.map((c) => (c.id === optimistic.id ? saved : c)));
      } else {
        // No echo from the server — refetch to stay consistent.
        fetchComments();
      }
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      setDraft(body);
      setSendError('Could not send your message. Please check your connection.');
    } finally {
      setSending(false);
    }
  };

  // Keep the newest message in view after the list changes.
  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [comments.length]);

  const remaining = MAX_LEN - draft.length;
  const overLimit = draft.length > MAX_LEN;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
      {/* ── Thread ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-12 bg-white/10 rounded-2xl w-3/4" />
          <div className="h-12 bg-white/10 rounded-2xl w-2/3 ml-auto" />
        </div>
      ) : loadError ? (
        <div className="flex items-center gap-2 text-sm text-rose-300 py-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{loadError}</span>
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-6">
          <MessageSquare className="w-9 h-9 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No messages yet.</p>
          <p className="text-xs text-slate-500 mt-1">
            Have a question about this job? Send us a message below.
          </p>
        </div>
      ) : (
        <ul className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
          {comments.map((c) => {
            const isCustomer = c.author_kind === 'customer';
            return (
              <li key={c.id} className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${isCustomer ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      isCustomer
                        ? 'bg-brand text-white rounded-br-md'
                        : 'bg-white/10 text-slate-100 rounded-bl-md border border-white/10'
                    }`}
                    style={isCustomer && accent ? { backgroundColor: accent } : undefined}
                  >
                    {/* Auto-escaped React text node — NEVER dangerouslySetInnerHTML */}
                    {c.body}
                  </div>
                  <div
                    className={`flex items-center gap-1.5 mt-1 px-1 text-[11px] text-slate-500 ${
                      isCustomer ? 'flex-row-reverse' : ''
                    }`}
                  >
                    <span className="font-medium text-slate-400">
                      {isCustomer ? c.author_name || 'You' : c.author_name || 'Team'}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{relativeTime(c.created_at)}</span>
                  </div>
                </div>
              </li>
            );
          })}
          <div ref={scrollAnchor} />
        </ul>
      )}

      {/* ── Composer ────────────────────────────────────────────────────────── */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <label htmlFor="comment-body" className="sr-only">
          Write a message
        </label>
        <textarea
          id="comment-body"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending}
          rows={3}
          maxLength={MAX_LEN + 200 /* allow over-typing so the counter can warn before we block send */}
          placeholder="Write a message to the team…"
          className="w-full resize-none rounded-xl bg-black/30 border border-white/10 text-white text-base placeholder:text-slate-500 px-3.5 py-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
          style={
            accent
              ? ({ ['--tw-ring-color' as string]: accent } as React.CSSProperties)
              : undefined
          }
        />

        {sendError && (
          <div className="flex items-center gap-2 text-xs text-rose-300 mt-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{sendError}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-3">
          <span className={`text-xs ${overLimit ? 'text-rose-400' : 'text-slate-500'}`}>
            {remaining < 0 ? `${Math.abs(remaining)} over limit` : `${remaining} characters left`}
          </span>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || draft.trim().length === 0 || overLimit}
            className="inline-flex items-center justify-center gap-2 bg-brand hover:opacity-90 text-white font-semibold text-sm px-5 py-3 rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] min-w-[44px]"
            style={accent ? { backgroundColor: accent } : undefined}
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
