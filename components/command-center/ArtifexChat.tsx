'use client';

/**
 * ArtifexChat — the Command Center's conversation engine + two skins.
 *
 * Voice-first redesign (Jul 9, founder-directed): the ORB is the interface —
 * "it should look like the center is talking" — so this component now renders
 * one of two variants while keeping a single useChat instance alive:
 *
 *   variant="hud"   (default surface) — no chat card. Just a caption of the
 *                   latest exchange under the orb, a status line, and a big
 *                   round mic. The full transcript stays in the background.
 *   variant="panel" — the full transcript panel (history sidebar, input row),
 *                   for reading back or typing instead of talking.
 *
 * The VOICE lives in the parent (useArtifexVoice) and is passed down, so the
 * page can feed the orb the live ElevenLabs amplitude. Conversation mode:
 * when a turn was started by mic and voice is on, the reply is spoken and,
 * when playback ends, the mic re-opens automatically — you talk THROUGH a
 * process (e.g. creating a job ticket) hands-free.
 *
 * Auth: bearer-token fetch (requireAuth reads the Authorization header);
 * fresh session read per request (tokens rotate).
 */
import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart } from 'ai';
import { supabase } from '@/lib/supabase';
import {
  Send,
  Search,
  CheckCircle2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ArtifexVoice } from '@/lib/use-artifex-voice';
import type { ArtifexUIMessage } from '@/lib/agents/artifex-agent';
import type { NeuralBrainState } from './NeuralBrain';

const TOOL_LABELS: Record<string, string> = {
  'tool-get_clocked_in_status': 'Checking who’s clocked in',
  'tool-get_todays_jobs': 'Pulling today’s jobs',
  'tool-get_pending_approvals': 'Checking pending approvals',
  'tool-get_team_roster': 'Looking up the team roster',
  'tool-get_recent_activity': 'Checking recent activity',
  'tool-get_revenue_snapshot': 'Pulling revenue numbers',
  'tool-search_job_history': 'Searching schedule history',
  'tool-get_hours_summary': 'Crunching hours',
  'tool-create_job_ticket': 'Creating the job ticket',
  'tool-save_memory_note': 'Saving to memory',
  'tool-recall_memory_notes': 'Recalling memory',
};

async function authedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(input, {
    ...init,
    headers: { ...(init?.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

export interface ArtifexConversationSummary {
  id: string;
  title: string;
  updatedAt?: string;
}

interface ArtifexChatProps {
  voice: ArtifexVoice;
  variant?: 'hud' | 'panel';
  onStateChange?: (state: NeuralBrainState) => void;
  onOpenTranscript?: () => void;
  /** Past conversations for the sidebar (panel variant). */
  conversations?: ArtifexConversationSummary[];
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onNewConversation?: () => void;
  /** Fires once when the backend assigns a fresh conversation id (first turn of a new chat). */
  onConversationStarted?: (id: string) => void;
}

export default function ArtifexChat({
  voice,
  variant = 'panel',
  onStateChange,
  onOpenTranscript,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onConversationStarted,
}: ArtifexChatProps) {
  const [input, setInput] = useState('');
  const [voiceOn, setVoiceOn] = useState(() => {
    try { return localStorage.getItem('artifex.voice') !== 'off'; } catch { return true; }
  });
  const toggleVoice = () => {
    voice.unlockAudio(); // gesture moment — arm the audio pipeline
    setVoiceOn((v) => {
      const next = !v;
      try { localStorage.setItem('artifex.voice', next ? 'on' : 'off'); } catch { /* ignore */ }
      if (!next) voice.stopSpeaking();
      return next;
    });
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(!!activeConversationId);

  // Conversation mode: the last turn came from the mic → after the spoken
  // reply finishes, re-open the mic automatically so the user talks through
  // multi-step flows (job-ticket creation) hands-free.
  const lastTurnWasVoiceRef = useRef(false);

  const conversationIdRef = useRef<string | null>(activeConversationId ?? null);
  useEffect(() => {
    conversationIdRef.current = activeConversationId ?? null;
  }, [activeConversationId]);

  const [transport] = useState(
    () =>
      new DefaultChatTransport<ArtifexUIMessage>({
        api: '/api/command-center/assistant',
        fetch: authedFetch,
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: { id, messages, conversationId: conversationIdRef.current },
        }),
      })
  );
  const { messages, sendMessage, setMessages, status, error } = useChat<ArtifexUIMessage>({ transport });
  const scrollRef = useRef<HTMLDivElement>(null);

  const busy = status === 'submitted' || status === 'streaming';
  const hasHistory = Array.isArray(conversations);

  const startMic = () => {
    voice.unlockAudio(); // gesture moment — arm the audio pipeline
    if (voice.listening) { voice.stopListening(); return; }
    voice.stopSpeaking();
    voice.startListening((transcript) => {
      if (busy || historyLoading) return;
      lastTurnWasVoiceRef.current = true;
      sendMessage({ text: transcript });
    });
  };

  // Resume a past conversation: fetch its prior turns and seed them before
  // the transport ever fires. Runs once per mount — the parent keys this
  // component by activeConversationId so a switch remounts it fresh.
  useEffect(() => {
    if (!activeConversationId) return;
    let cancelled = false;
    setHistoryLoading(true);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`/api/command-center/conversations/${activeConversationId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.success && Array.isArray(json.data)) {
          setMessages(json.data as ArtifexUIMessage[]);
        }
      } catch {
        // fail-soft: worst case the resumed chat just starts empty
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick up a freshly-assigned conversation id off the streamed 'start' metadata.
  useEffect(() => {
    const last = messages[messages.length - 1] as (ArtifexUIMessage & { metadata?: { conversationId?: string } }) | undefined;
    const newId = last?.metadata?.conversationId;
    if (newId && newId !== conversationIdRef.current) {
      conversationIdRef.current = newId;
      onConversationStarted?.(newId);
    }
  }, [messages, onConversationStarted]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  // Drive the orb: listening > speaking > thinking > idle.
  useEffect(() => {
    if (!onStateChange) return;
    if (voice.listening) onStateChange('listening');
    else if (voice.speaking) onStateChange('speaking');
    else if (busy) onStateChange('thinking');
    else onStateChange('idle');
  }, [busy, voice.listening, voice.speaking, onStateChange]);

  // Turn completion: refresh the sidebar title + speak the reply. If the turn
  // came in by voice, re-open the mic when playback ends (conversation mode).
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (wasStreamingRef.current && !busy) {
      if (conversationIdRef.current) onConversationStarted?.(conversationIdRef.current);
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      const text = (lastAssistant?.parts ?? [])
        .filter((pt): pt is { type: 'text'; text: string } => (pt as any).type === 'text')
        .map((pt) => pt.text)
        .join(' ');
      if (voiceOn && text) {
        const cameFromVoice = lastTurnWasVoiceRef.current;
        voice.speak(text, {
          onEnd: () => {
            if (cameFromVoice && document.visibilityState === 'visible') startMic();
          },
        });
      }
    }
    wasStreamingRef.current = busy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, onConversationStarted, voiceOn, messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || historyLoading) return;
    voice.unlockAudio(); // typing+send is a gesture too — arm audio for the reply
    lastTurnWasVoiceRef.current = false;
    sendMessage({ text });
    setInput('');
  };

  // ── HUD variant — the orb talks; this is just caption + status + mic ─────
  if (variant === 'hud') {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const assistantText = (lastAssistant?.parts ?? [])
      .filter((pt): pt is { type: 'text'; text: string } => (pt as any).type === 'text')
      .map((pt) => pt.text)
      .join(' ')
      .replace(/[*_#`]+/g, '') // captions are plain speech — strip markdown
      .trim();
    const userText = (lastUser?.parts ?? [])
      .filter((pt): pt is { type: 'text'; text: string } => (pt as any).type === 'text')
      .map((pt) => pt.text)
      .join(' ')
      .trim();
    const runningTool = busy
      ? messages
          .flatMap((m) => m.parts as any[])
          .filter((p) => isToolUIPart(p) && p.state !== 'output-available' && p.state !== 'output-error')
          .map((p) => TOOL_LABELS[p.type] ?? 'Working')
          .pop()
      : null;

    const statusLine = voice.listening
      ? 'LISTENING'
      : voice.speaking
        ? 'SPEAKING'
        : busy
          ? (runningTool ?? 'THINKING').toUpperCase()
          : 'STANDING BY';

    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-4">
        {/* Status line — the HUD readout under the orb */}
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-sky-700/80 dark:text-sky-300/60" aria-live="polite">
          {statusLine}
          {(voice.listening || busy) && <span className="animate-pulse">…</span>}
        </p>

        {/* Caption — what was said / the spoken reply, so the orb "talks" visibly */}
        <div className="min-h-[3.5rem] w-full text-center">
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-300/90">Artifex hit an error. Try again in a moment.</p>
          ) : assistantText ? (
            <>
              {userText && (
                <p className="mb-1 truncate text-xs text-slate-500 dark:text-slate-400/80">“{userText}”</p>
              )}
              <p className="mx-auto max-w-lg text-[15px] leading-relaxed text-slate-800 dark:text-slate-100/95 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4] overflow-hidden">
                {assistantText}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400/70">
              {voice.micSupported ? 'Tap the mic and talk to Artifex.' : 'Open the transcript to type to Artifex.'}
            </p>
          )}
        </div>

        {voice.pendingAudio && (
          <button
            type="button"
            onClick={voice.playPendingAudio}
            className="flex min-h-[44px] items-center gap-2 rounded-full border border-sky-400/50 bg-sky-500/10 px-5 text-sm font-semibold text-sky-700 shadow-sm transition-colors hover:bg-sky-500/20 dark:text-sky-200 animate-pulse"
          >
            <Volume2 className="h-4 w-4" /> Tap to hear the reply
          </button>
        )}

        {/* Controls: transcript · MIC (hero) · voice toggle */}
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={onOpenTranscript}
            aria-label="Open transcript"
            title="Transcript & typing"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition-colors hover:border-sky-500/60 hover:text-sky-700 dark:border-slate-500/25 dark:bg-slate-500/[0.08] dark:text-slate-300/70 dark:shadow-none dark:hover:border-sky-400/40 dark:hover:text-sky-200"
          >
            <MessageSquare className="h-4 w-4" />
          </button>

          {voice.micSupported ? (
            <button
              type="button"
              onClick={startMic}
              disabled={busy || historyLoading}
              aria-label={voice.listening ? 'Stop listening' : 'Talk to Artifex'}
              className={`relative flex h-16 w-16 items-center justify-center rounded-full border transition-all disabled:opacity-40 ${
                voice.listening
                  ? 'border-sky-300/70 bg-sky-400/15 text-sky-200 shadow-[0_0_35px_rgba(56,189,248,0.45)]'
                  : 'border-red-500/50 bg-gradient-to-br from-red-600/25 to-red-900/30 text-red-100 shadow-[0_0_30px_rgba(220,38,38,0.35)] hover:shadow-[0_0_40px_rgba(220,38,38,0.55)]'
              }`}
            >
              {voice.listening && (
                <span className="absolute inset-0 animate-ping rounded-full border border-sky-300/40" />
              )}
              <Mic className="h-6 w-6" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenTranscript}
              aria-label="Type to Artifex"
              className="flex h-16 w-16 items-center justify-center rounded-full border border-red-500/50 bg-gradient-to-br from-red-600/25 to-red-900/30 text-red-100 shadow-[0_0_30px_rgba(220,38,38,0.35)]"
            >
              <MicOff className="h-6 w-6" />
            </button>
          )}

          {voice.ttsAvailable !== false ? (
            <button
              type="button"
              onClick={toggleVoice}
              aria-label={voiceOn ? 'Turn voice off' : 'Turn voice on'}
              title={voiceOn ? 'Voice on (ElevenLabs)' : 'Voice off'}
              className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
                voiceOn
                  ? 'border-red-400/40 bg-red-500/10 text-red-300'
                  : 'border-slate-300 bg-white text-slate-400 shadow-sm hover:text-slate-700 dark:border-slate-500/25 dark:bg-slate-500/[0.08] dark:text-slate-400/70 dark:shadow-none dark:hover:text-slate-200'
              } ${voice.speaking ? 'animate-pulse' : ''}`}
            >
              {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          ) : (
            <span className="h-11 w-11" aria-hidden />
          )}
        </div>
      </div>
    );
  }

  // ── PANEL variant — full transcript ──────────────────────────────────────
  return (
    <div className="flex w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-xl dark:border-sky-400/15 dark:bg-[#050B16]/80 dark:shadow-[0_0_60px_-15px_rgba(56,189,248,0.25)]">
      {hasHistory && (
        <ConversationSidebar
          open={historyOpen}
          conversations={conversations!}
          activeConversationId={activeConversationId ?? null}
          onSelectConversation={onSelectConversation}
          onNewConversation={onNewConversation}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-white/[0.06] px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2">
            {hasHistory && (
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                aria-label={historyOpen ? 'Hide conversation history' : 'Show conversation history'}
                aria-expanded={historyOpen}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/80"
              >
                {historyOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </button>
            )}
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700/60 dark:text-sky-200/40">Artifex Transcript</span>
            {voice.ttsAvailable !== false && (
              <button
                type="button"
                onClick={toggleVoice}
                aria-label={voiceOn ? 'Turn voice off' : 'Turn voice on'}
                title={voiceOn ? 'Voice on (ElevenLabs)' : 'Voice off'}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  voiceOn ? 'text-red-300 bg-red-500/10' : 'text-white/35 hover:bg-white/[0.06] hover:text-white/70'
                } ${voice.speaking ? 'animate-pulse' : ''}`}
              >
                {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            )}
          </div>
          {hasHistory && onNewConversation && (
            <button
              type="button"
              onClick={onNewConversation}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/50 dark:hover:bg-white/[0.06] dark:hover:text-white/90"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New chat
            </button>
          )}
        </div>

        <div ref={scrollRef} className="flex max-h-[42vh] min-h-[160px] flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-5">
          {historyLoading && (
            <p className="text-center text-sm text-slate-400 dark:text-white/35">Loading conversation…</p>
          )}
          {!historyLoading && messages.length === 0 && (
            <p className="text-center text-sm text-slate-400 dark:text-white/35">
              Ask Artifex about jobs, the team, hours, approvals — or have it create a job ticket.
            </p>
          )}
          {messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  message.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-br from-[#DC2626] to-[#7F1D1D] px-4 py-2.5 text-sm text-white shadow-[0_2px_20px_-4px_rgba(220,38,38,0.5)]'
                    : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-800 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-white/90'
                }
              >
                {message.parts.map((part, i) => {
                  if (part.type === 'text') {
                    return (
                      <span key={i} className="whitespace-pre-wrap leading-relaxed">
                        {part.text}
                      </span>
                    );
                  }
                  if (!isToolUIPart(part)) return null;
                  const label = TOOL_LABELS[part.type] ?? part.type.replace(/^tool-/, '');
                  const done = part.state === 'output-available' || part.state === 'output-error';
                  return (
                    <div
                      key={i}
                      className="my-1 flex items-center gap-1.5 text-xs text-sky-700/80 dark:text-sky-200/70 first:mt-0"
                    >
                      {done ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400/80" />
                      ) : (
                        <Search className="h-3 w-3 animate-pulse" />
                      )}
                      <span>{label}{done ? '' : '…'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {error && (
            <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-center text-xs text-red-200/90">
              Artifex hit an error. Try again in a moment.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-200 dark:border-white/[0.06] px-3 py-3 sm:px-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Artifex…"
            className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/30 dark:focus:border-sky-400/50 focus:outline-none"
          />
          {voice.micSupported && (
            <button
              type="button"
              onClick={startMic}
              aria-label={voice.listening ? 'Stop listening' : 'Speak to Artifex'}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                voice.listening
                  ? 'border-sky-400/50 bg-sky-500/15 text-sky-300 animate-pulse'
                  : 'border-slate-300 bg-white text-slate-400 hover:text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/50 dark:hover:text-white/85'
              }`}
            >
              <Mic className="h-4 w-4" />
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || busy || historyLoading}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#DC2626] to-[#991B1B] text-white transition-opacity disabled:opacity-30"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Conversation sidebar ────────────────────────────────────────────────

function ConversationSidebar({
  open,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: {
  open: boolean;
  conversations: ArtifexConversationSummary[];
  activeConversationId: string | null;
  onSelectConversation?: (id: string) => void;
  onNewConversation?: () => void;
}) {
  return (
    <div
      className={`shrink-0 overflow-hidden border-r border-slate-200 bg-slate-50 dark:border-white/[0.06] dark:bg-white/[0.015] transition-[width] duration-200 ${
        open ? 'w-48 sm:w-56' : 'w-0'
      }`}
    >
      <div className="flex h-full w-48 flex-col sm:w-56">
        <div className="flex items-center justify-between px-3 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">History</span>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs leading-relaxed text-slate-400 dark:text-white/30">
              No conversations yet. Start one below.
            </p>
          )}
          {conversations.map((c) => {
            const active = c.id === activeConversationId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectConversation?.(c.id)}
                className={`flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  active
                    ? 'bg-gradient-to-r from-[#DC2626]/25 to-[#38BDF8]/10 text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-white/55 dark:hover:bg-white/[0.05] dark:hover:text-white/85'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="truncate">{c.title}</span>
              </button>
            );
          })}
        </div>
        {onNewConversation && (
          <div className="border-t border-slate-200 dark:border-white/[0.06] p-2">
            <button
              type="button"
              onClick={onNewConversation}
              className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.05] dark:hover:text-white/90"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
