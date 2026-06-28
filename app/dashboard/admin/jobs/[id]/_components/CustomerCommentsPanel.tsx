'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessagesSquare, Loader2, Send, User, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerComment {
  id: string;
  author_kind: 'customer' | 'staff';
  author_name: string | null;
  body: string;
  created_at: string;
}

// ─── Auth helper (Bearer token — same pattern as the rest of the admin page) ───

async function apiFetch(url: string, opts?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || '';
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...opts?.headers,
    },
  });
}

// ─── Relative time (lib/dates.ts has no relative helper; keep it local) ────────

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initialsOf(name: string | null, fallback: string): string {
  const src = (name || '').trim();
  if (!src) return fallback;
  return src
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

const MAX_LEN = 2000;

// ─── Component ─────────────────────────────────────────────────────────────────

export default function CustomerCommentsPanel({ jobId }: { jobId: string }) {
  const [comments, setComments] = useState<CustomerComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const fetchComments = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await apiFetch(`/api/job-orders/${jobId}/comments`);
      if (!res.ok) {
        setLoadError('Could not load messages.');
        return;
      }
      const json = await res.json().catch(() => ({}));
      const list: CustomerComment[] = Array.isArray(json)
        ? json
        : json.data || json.comments || [];
      setComments(list);
    } catch {
      setLoadError('Network error loading messages.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Auto-scroll thread to the newest message when the list grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await apiFetch(`/api/job-orders/${jobId}/comments/reply`, {
        method: 'POST',
        body: JSON.stringify({ body: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(json.error || 'Failed to send reply.');
        return;
      }
      // Optimistically append the staff reply the server returned (fall back to a local echo),
      // then re-fetch to reconcile with the canonical thread.
      const created: CustomerComment | null = json.data || json.comment || null;
      if (created && created.id) {
        setComments((prev) => [...prev, created]);
      } else {
        setComments((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            author_kind: 'staff',
            author_name: 'You',
            body: trimmed,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setBody('');
      fetchComments();
    } catch {
      setSendError('Network error sending reply.');
    } finally {
      setSending(false);
    }
  };

  const customerCount = comments.filter((c) => c.author_kind === 'customer').length;

  return (
    <div className="
      relative overflow-hidden rounded-2xl shadow-sm
      bg-white border border-slate-200
      dark:bg-gradient-to-br dark:from-[#180c2c]/80 dark:to-[#0e0720]/80
      dark:border-white/10 dark:backdrop-blur
    ">
      {/* Brand accent stripe — tenant-colored, NOT hardcoded purple */}
      <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand via-brand-secondary to-brand-accent" aria-hidden />

      <div className="p-5 pt-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-brand/10 text-brand dark:bg-brand/15">
            <MessagesSquare className="w-4 h-4" />
          </span>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Customer Messages</h2>
          <div className="ml-auto flex items-center gap-1.5">
            {customerCount > 0 && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand/10 text-brand dark:bg-brand/15"
                title={`${customerCount} message${customerCount === 1 ? '' : 's'} from the customer`}
              >
                {customerCount}
              </span>
            )}
            <button
              onClick={fetchComments}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              title="Refresh messages"
            >
              <Loader2 className={`w-3.5 h-3.5 text-slate-400 dark:text-white/40 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Thread */}
        {loading && comments.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300 dark:text-white/30" />
          </div>
        ) : loadError && comments.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-rose-500 dark:text-rose-300">{loadError}</p>
            <button
              onClick={fetchComments}
              className="mt-2 text-xs font-semibold text-brand hover:underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8">
            <MessagesSquare className="w-8 h-8 text-slate-200 dark:text-white/15 mx-auto mb-2" />
            <p className="text-sm text-slate-400 dark:text-white/45">No messages yet.</p>
            <p className="text-xs text-slate-300 dark:text-white/30 mt-0.5">
              Replies you send here are visible to the customer in their portal.
            </p>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="space-y-3 max-h-[420px] overflow-y-auto pr-1 -mr-1"
          >
            {comments.map((c) => {
              const isStaff = c.author_kind === 'staff';
              return (
                <div
                  key={c.id}
                  className={`flex items-end gap-2 ${isStaff ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold flex-shrink-0 ${
                      isStaff
                        ? 'text-white bg-brand'
                        : 'text-slate-600 bg-slate-200 dark:text-white/80 dark:bg-white/10'
                    }`}
                    aria-hidden
                  >
                    {isStaff ? (
                      initialsOf(c.author_name, 'ME')
                    ) : (
                      <User className="w-3.5 h-3.5" />
                    )}
                  </span>

                  {/* Bubble */}
                  <div className={`min-w-0 max-w-[80%] ${isStaff ? 'items-end text-right' : 'items-start text-left'} flex flex-col`}>
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-line ${
                        isStaff
                          ? 'bg-brand/10 text-slate-800 ring-1 ring-brand/20 rounded-br-sm dark:bg-brand/15 dark:text-white'
                          : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 rounded-bl-sm dark:bg-white/5 dark:text-white/80 dark:ring-white/10'
                      }`}
                    >
                      {c.body}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-slate-400 dark:text-white/40">
                      {isStaff ? (
                        <Building2 className="w-3 h-3" />
                      ) : (
                        <User className="w-3 h-3" />
                      )}
                      <span className="font-medium">
                        {c.author_name || (isStaff ? 'Staff' : 'Customer')}
                      </span>
                      <span>·</span>
                      <span title={new Date(c.created_at).toLocaleString()}>{relativeTime(c.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Reply box */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_LEN))}
            disabled={sending}
            rows={3}
            maxLength={MAX_LEN}
            placeholder="Reply to the customer…"
            className="
              w-full resize-none rounded-xl px-3 py-2 text-sm
              bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400
              focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/50
              disabled:opacity-60
              dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/30
            "
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          {sendError && (
            <p className="mt-1.5 text-xs text-rose-500 dark:text-rose-300">{sendError}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-slate-400 dark:text-white/35">
              {body.length}/{MAX_LEN}
            </span>
            <button
              onClick={handleSend}
              disabled={sending || body.trim().length === 0}
              className="
                ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold
                bg-brand text-white shadow-sm hover:bg-brand-dark transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {sending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
