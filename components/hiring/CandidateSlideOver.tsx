'use client';

/**
 * CandidateSlideOver — right-hand slide-over for reviewing a single
 * candidate (Hireline clone): Responses / Resume tabs, HISTORY timeline,
 * INTERNAL COMMENTS, sticky Reject / Shortlist footer, prev/next arrows.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  X, ChevronLeft, ChevronRight, FileText, MessageSquare, Clock,
  ThumbsDown, Star, ExternalLink, Phone, Mail, MapPin, Send, AlertTriangle,
} from 'lucide-react';
import type {
  HiringCandidate, HiringCandidateResponse, HiringComment, HiringEvent, CandidateStatus,
} from '@/lib/hiring/types';
import { Spinner } from '@/components/ui';
import { hiringFetch, CANDIDATE_STATUS_PILL, fmtDateTime } from './api';

interface CandidateDetail {
  /**
   * The detail API adds `resume_signed_url` — a short-lived (~10 min)
   * Supabase signed URL. The raw `resume_url` column is just a storage
   * path and will NOT work as a link; never href it directly.
   */
  candidate: HiringCandidate & { resume_signed_url?: string | null };
  responses: HiringCandidateResponse[];
  events: HiringEvent[];
  comments: HiringComment[];
}

const EVENT_LABELS: Record<string, string> = {
  clicked_ad: 'Clicked ad on social media',
  submitted_application: 'Submitted application',
  auto_rejected: 'Auto-rejected by a screener question',
  status_changed: 'Status changed',
  shortlisted: 'Shortlisted',
  rejected: 'Rejected',
  comment_added: 'Internal comment added',
};

function eventLabel(e: HiringEvent): string {
  if (EVENT_LABELS[e.event_type]) {
    const suffix = e.event_type === 'status_changed' && typeof e.meta?.status === 'string'
      ? ` to ${e.meta.status}` : '';
    return EVENT_LABELS[e.event_type] + suffix;
  }
  // Prettify unknown event types: "some_event_type" -> "Some event type"
  const words = e.event_type.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface CandidateSlideOverProps {
  open: boolean;
  candidate: HiringCandidate | null;
  jobTitle: string;
  onClose: () => void;
  /** Parent applies the optimistic status update to its list. */
  onStatusChange: (candidateId: string, status: CandidateStatus) => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export default function CandidateSlideOver({
  open, candidate, jobTitle, onClose, onStatusChange, onPrev, onNext, hasPrev, hasNext,
}: CandidateSlideOverProps) {
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'responses' | 'resume'>('responses');
  const [commentDraft, setCommentDraft] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<CandidateStatus | null>(null);

  const candidateId = candidate?.id ?? null;

  const loadDetail = useCallback(async () => {
    if (!candidateId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await hiringFetch<CandidateDetail>(`/api/hiring/candidates/${candidateId}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load candidate');
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    setDetail(null);
    setTab('responses');
    setCommentDraft('');
    setCommentError(null);
    if (open && candidateId) loadDetail();
  }, [open, candidateId, loadDetail]);

  // Esc closes; arrow keys walk the list
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev && onPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext && onNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onPrev, onNext, hasPrev, hasNext]);

  if (!open || !candidate) return null;

  const shown = detail?.candidate ?? candidate;
  const pill = CANDIDATE_STATUS_PILL[shown.status] ?? CANDIDATE_STATUS_PILL.unreviewed;

  const setStatus = async (status: CandidateStatus) => {
    if (savingStatus) return;
    setSavingStatus(status);
    const previous = shown.status;
    // Optimistic update — parent list + local detail
    onStatusChange(candidate.id, status);
    setDetail((d) => (d ? { ...d, candidate: { ...d.candidate, status } } : d));
    try {
      await hiringFetch(`/api/hiring/candidates/${candidate.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    } catch {
      // Revert on failure
      onStatusChange(candidate.id, previous);
      setDetail((d) => (d ? { ...d, candidate: { ...d.candidate, status: previous } } : d));
    } finally {
      setSavingStatus(null);
    }
  };

  const postComment = async () => {
    const body = commentDraft.trim();
    if (!body || postingComment) return;
    setPostingComment(true);
    setCommentError(null);
    try {
      const data = await hiringFetch<{ comment: HiringComment }>(
        `/api/hiring/candidates/${candidate.id}/comments`,
        { method: 'POST', body: JSON.stringify({ body }) },
      );
      setDetail((d) => (d ? { ...d, comments: [...d.comments, data.comment] } : d));
      setCommentDraft('');
    } catch (err) {
      // Keep the draft so nothing is lost — but tell the user it didn't post.
      setCommentError(err instanceof Error ? err.message : "Comment didn't post — try again.");
    } finally {
      setPostingComment(false);
    }
  };

  const events = [...(detail?.events ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white dark:bg-slate-900 shadow-2xl border-l border-gray-200 dark:border-white/10">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-white/10 px-4 sm:px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{shown.full_name}</h2>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${pill.className}`}>
                  {pill.label}
                </span>
                {shown.auto_rejected && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30">
                    <AlertTriangle className="w-3 h-3" /> Auto-rejected
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-white/60 truncate">for job: {jobTitle}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onPrev}
                disabled={!hasPrev}
                aria-label="Previous candidate"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-white/70 dark:hover:bg-white/10"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext}
                aria-label="Next candidate"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-white/70 dark:hover:bg-white/10"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:text-white/70 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          {/* Contact line */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-white/60">
            {shown.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{shown.phone}</span>}
            {shown.email && <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{shown.email}</span>}
            {shown.candidate_location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{shown.candidate_location}</span>}
          </div>
          {/* Tabs */}
          <div className="mt-3 flex gap-1 border-b border-transparent">
            {(['responses', 'resume'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`min-h-[44px] px-4 rounded-t-md border-b-2 text-sm font-semibold capitalize transition-colors ${
                  tab === t
                    ? 'border-brand text-brand'
                    : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-white/60 dark:hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
          {loading && (
            <div className="flex justify-center py-10"><Spinner size="lg" brand /></div>
          )}
          {error && !loading && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {!loading && !error && tab === 'responses' && (
            <div className="space-y-4">
              {(detail?.responses ?? []).length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-white/60">No screener responses recorded.</p>
              ) : (
                (detail?.responses ?? []).map((r) => (
                  <div key={r.id} className="rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-white/50">{r.question_text}</p>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-line">{r.answer || '—'}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading && !error && tab === 'resume' && (() => {
            // Only the short-lived signed URL is linkable; the raw
            // resume_url is a storage path. Defense-in-depth: require an
            // http(s) scheme before rendering an href.
            const signed = detail?.candidate?.resume_signed_url;
            const resumeHref = signed && /^https?:\/\//i.test(signed) ? signed : null;
            return (
            <div>
              {resumeHref ? (
                <a
                  href={resumeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[48px] inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-white/15 px-4 text-sm font-semibold text-gray-700 dark:text-white/90 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <FileText className="w-4 h-4" /> Open resume <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                    <FileText className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">No resume uploaded</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-white/60">
                    Candidates are asked for a resume by text + email after applying.
                  </p>
                </div>
              )}
            </div>
            );
          })()}

          {/* HISTORY */}
          {!loading && !error && (
            <div className="mt-8">
              <p className="text-[11px] font-bold tracking-widest text-gray-500 dark:text-white/50 uppercase flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> History
              </p>
              <ol className="mt-3 space-y-0">
                {/* Application submission is always in the timeline even if events are sparse */}
                {events.length === 0 && (
                  <li className="relative pl-5 pb-1 text-sm">
                    <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-brand" />
                    <p className="text-gray-900 dark:text-white">Submitted application</p>
                    <p className="text-xs text-gray-500 dark:text-white/50">{fmtDateTime(shown.applied_at)}</p>
                  </li>
                )}
                {events.map((e, i) => (
                  <li key={e.id} className="relative pl-5 pb-4 last:pb-0 text-sm">
                    {i < events.length - 1 && (
                      <span className="absolute left-[3px] top-4 bottom-0 w-px bg-gray-200 dark:bg-white/10" />
                    )}
                    <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-brand" />
                    <p className="text-gray-900 dark:text-white">{eventLabel(e)}</p>
                    <p className="text-xs text-gray-500 dark:text-white/50">{fmtDateTime(e.created_at)}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* INTERNAL COMMENTS */}
          {!loading && !error && (
            <div className="mt-8">
              <p className="text-[11px] font-bold tracking-widest text-gray-500 dark:text-white/50 uppercase flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Internal comments
              </p>
              <div className="mt-3 space-y-3">
                {(detail?.comments ?? []).map((c) => (
                  <div key={c.id} className="rounded-xl bg-gray-50 dark:bg-white/5 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-700 dark:text-white/80">{c.author_name || 'Team member'}</p>
                      <p className="text-[11px] text-gray-400 dark:text-white/40">{fmtDateTime(c.created_at)}</p>
                    </div>
                    <p className="mt-1 text-sm text-gray-800 dark:text-white/90 whitespace-pre-line">{c.body}</p>
                  </div>
                ))}
                {(detail?.comments ?? []).length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-white/60">No comments yet — only your team can see these.</p>
                )}
                {commentError && (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {commentError}
                  </p>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={commentDraft}
                    onChange={(e) => { setCommentDraft(e.target.value); if (commentError) setCommentError(null); }}
                    placeholder="Add an internal comment…"
                    rows={2}
                    className="flex-1 rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2.5 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand/40"
                  />
                  <button
                    type="button"
                    onClick={postComment}
                    disabled={!commentDraft.trim() || postingComment}
                    aria-label="Post comment"
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-brand text-white disabled:opacity-50"
                  >
                    {postingComment ? <Spinner size="sm" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="border-t border-gray-200 dark:border-white/10 px-4 sm:px-5 py-3 grid grid-cols-2 gap-3 bg-white dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setStatus('rejected')}
            disabled={savingStatus !== null || shown.status === 'rejected'}
            className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 font-bold text-sm hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {savingStatus === 'rejected' ? <Spinner size="sm" /> : <ThumbsDown className="w-4 h-4" />}
            Reject
          </button>
          <button
            type="button"
            onClick={() => setStatus('shortlisted')}
            disabled={savingStatus !== null || shown.status === 'shortlisted'}
            className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors disabled:opacity-50"
          >
            {savingStatus === 'shortlisted' ? <Spinner size="sm" /> : <Star className="w-4 h-4" />}
            Shortlist
          </button>
        </div>
      </div>
    </div>
  );
}
