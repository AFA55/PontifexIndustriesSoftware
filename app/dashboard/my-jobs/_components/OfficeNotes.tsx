'use client';

/**
 * "Notes from the Office" — the crew-facing half of the two-audience note
 * system (founder, Aug 15: "notes for operator, so operators can see notes
 * within certain jobs. Create an area where they can see these"), and now the
 * crew's half of the conversation too (founder, Aug 17: "operators can see the
 * notes and reply back to them").
 *
 * It is a THREAD, not an inbox: the office's notes and the crew's replies sit
 * in one chronological column with the reply box under them, because the
 * question and the answer are the same conversation and a crew that cannot see
 * what its own operator already told the office asks the office twice.
 *
 * VISIBILITY: the server (`filterVisibleNotes`, service-role, RLS bypassed) is
 * the real boundary. The filter below is a second, honest pass over the same
 * shared rule — it must never be the only protection, and it must never be
 * looser than the server's.
 *
 * Mobile: 375px in gloves. Full-width rows, 16px body text, nothing under 14px,
 * ≥44px targets, no horizontal scroll, attachments open at tap-target size via
 * the shared PhotoViewer.
 */

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, ChevronDown, Loader2, Send, HardHat } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { authedFetchQuiet } from '@/lib/authed-fetch';
import { PhotoViewer } from '@/components/PhotoUploader';
import {
  CREW_REPLY_NOTE_TYPE,
  isCrewReply,
  normalizeNoteAudience,
} from '@/lib/job-note-audience';

interface CrewNote {
  id: string;
  content: string;
  author_name: string;
  author_id?: string | null;
  audience?: string | null;
  note_type?: string | null;
  photo_urls?: string[] | null;
  created_at: string;
}

/**
 * The two things that belong in the crew's thread: a note the office addressed
 * TO the crew, and a reply the crew wrote back. Everything else — the office
 * talking to itself, the operator's own day-complete/amendment workflow notes —
 * stays out, even though the same endpoint returns some of them.
 */
export function belongsInCrewThread(note: CrewNote): boolean {
  if (isCrewReply(note)) return true;
  return normalizeNoteAudience(note.audience) === 'operator';
}

/** `created_at` is a timestamptz ISO string, not a bare date — safe to parse. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function byOldestFirst(a: CrewNote, b: CrewNote): number {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

export default function OfficeNotes({ jobId }: { jobId: string }) {
  const [notes, setNotes] = useState<CrewNote[] | null>(null);
  const [open, setOpen] = useState(true);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setViewerId(session.user?.id ?? null);
      const res = await authedFetchQuiet(`/api/job-orders/${jobId}/notes`);
      if (!res.ok) {
        setNotes([]);
        return;
      }
      const json = await res.json();
      setNotes(
        ((json.data || []) as CrewNote[]).filter(belongsInCrewThread).sort(byOldestFirst),
      );
    } catch {
      setNotes([]);
    }
  }, [jobId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const sendReply = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await authedFetchQuiet(`/api/job-orders/${jobId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The KIND is what makes this readable by the rest of the crew (and
        // what routes the notification back to the office). The server refuses
        // it from an office author, so it can only ever mean "the crew spoke".
        body: JSON.stringify({ content, noteType: CREW_REPLY_NOTE_TYPE }),
      });
      if (!res.ok) throw new Error('send failed');
      const json = await res.json().catch(() => null);
      const saved = json?.data as CrewNote | undefined;
      const appended: CrewNote = saved?.id
        ? saved
        : {
            id: `local-${Date.now()}`,
            content,
            author_name: 'You',
            author_id: viewerId,
            audience: 'internal',
            note_type: CREW_REPLY_NOTE_TYPE,
            created_at: new Date().toISOString(),
          };
      setNotes((prev) => [...(prev ?? []), appended]);
      // Cleared ONLY on success — see the catch.
      setDraft('');
      setOpen(true);
    } catch {
      // KEEP THE TEXT. Somebody typed this standing on a slab with gloves on;
      // wiping it because the truck lost signal is unforgivable, and they will
      // not type it a second time.
      setError('That reply did not send. Your message is still here — check your signal and tap Send again.');
    } finally {
      setSending(false);
    }
  }, [draft, sending, jobId, viewerId]);

  // Still loading, or this job has no conversation at all = no empty card
  // taking up a screen the operator has to scroll past in the truck.
  if (notes === null || notes.length === 0) return null;

  const canSend = !!draft.trim() && !sending;

  return (
    <div className="bg-white/90 dark:bg-white/[0.05] backdrop-blur-lg rounded-2xl shadow-xl border-2 border-amber-400/70 dark:border-amber-400/40 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-5 py-4 min-h-[56px] text-left hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Megaphone className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-base font-bold text-gray-800 dark:text-white truncate">
            Notes from the Office
          </span>
          <span className="flex-shrink-0 text-sm font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
            {notes.length}
          </span>
        </div>
        <ChevronDown className={`w-5 h-5 flex-shrink-0 text-gray-400 dark:text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          {notes.map((note) => {
            const reply = isCrewReply(note);
            const mine = !!viewerId && note.author_id === viewerId;
            return (
              <div
                key={note.id}
                className={
                  reply
                    ? 'p-4 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/25 space-y-2'
                    : 'p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 space-y-2'
                }
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {reply && (
                    <HardHat className="w-4 h-4 flex-shrink-0 text-sky-600 dark:text-sky-300" />
                  )}
                  <span
                    className={`text-sm font-bold uppercase tracking-wide ${
                      reply
                        ? 'text-sky-700 dark:text-sky-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {mine ? 'You' : note.author_name}
                  </span>
                  <span
                    className={`text-sm ${
                      reply
                        ? 'text-sky-700/70 dark:text-sky-300/60'
                        : 'text-amber-700/70 dark:text-amber-300/60'
                    }`}
                  >
                    {reply ? `replied ${formatWhen(note.created_at)}` : formatWhen(note.created_at)}
                  </span>
                </div>
                <p className="text-base leading-relaxed text-gray-800 dark:text-white/85 whitespace-pre-wrap break-words">
                  {note.content}
                </p>
                {!!note.photo_urls?.length && (
                  <PhotoViewer photos={note.photo_urls} label="Attached" />
                )}
              </div>
            );
          })}

          {/* ── Reply ─────────────────────────────────────────────────────── */}
          <div className="pt-1 space-y-2">
            <label
              htmlFor={`office-notes-reply-${jobId}`}
              className="block text-sm font-bold uppercase tracking-wide text-gray-600 dark:text-white/60"
            >
              Reply to the office
            </label>
            <textarea
              id={`office-notes-reply-${jobId}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              disabled={sending}
              placeholder="Type your answer…"
              className="w-full min-h-[96px] px-4 py-3 rounded-xl text-base leading-relaxed text-gray-900 dark:text-white bg-white dark:bg-white/[0.06] border-2 border-gray-300 dark:border-white/15 placeholder-gray-400 dark:placeholder-white/35 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400 disabled:opacity-60"
            />
            {error && (
              <p
                role="alert"
                className="text-sm font-semibold text-red-700 dark:text-red-300 leading-relaxed"
              >
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={sendReply}
              disabled={!canSend}
              className="w-full min-h-[52px] flex items-center justify-center gap-2 px-4 rounded-xl text-base font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:bg-gray-300 dark:disabled:bg-white/10 disabled:text-gray-500 dark:disabled:text-white/40 transition-colors"
            >
              {sending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Reply
                </>
              )}
            </button>
            <p className="text-sm text-gray-500 dark:text-white/45 leading-relaxed">
              The office is notified. Your crew on this job can see your reply.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
