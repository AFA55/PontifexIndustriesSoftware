'use client';

/**
 * ArtifexChat — the Command Center's chat surface (Jarvis Command Center Phase 2).
 *
 * Talks to POST /api/command-center/assistant via @ai-sdk/react's useChat, typed
 * end-to-end against ArtifexUIMessage (see lib/agents/artifex-agent.ts) so every
 * tool's input/output is fully typed in the renderer below — no `any`.
 *
 * Auth: this repo's convention is bearer-token auth (requireAuth reads the
 * Authorization header, not cookies), so the transport's `fetch` override reads
 * a FRESH Supabase session on every request rather than capturing one token at
 * mount (tokens rotate).
 *
 * Reactor wiring: `onStateChange` reports a derived ArcReactorState so the
 * parent page can drive the HUD's centerpiece from real chat activity —
 * 'submitted'/'streaming' -> thinking/speaking, tool-call in flight -> thinking
 * (with a labeled chip), 'ready'/'error' -> idle. See ArcReactor.tsx's own
 * state-wiring notes for the idle/listening/thinking/speaking contract.
 *
 * Conversation list: `conversations`/`activeConversationId`/`onSelectConversation`/
 * `onNewConversation` are optional so this component still works standing alone
 * (persistence lands from a parallel backend track) — omit them and the sidebar
 * just doesn't render.
 */
import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart } from 'ai';
import { Send, Search, CheckCircle2, MessageSquarePlus, PanelLeftClose, PanelLeftOpen, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ArtifexUIMessage } from '@/lib/agents/artifex-agent';
import type { ArcReactorState } from './ArcReactor';

const TOOL_LABELS: Record<string, string> = {
  'tool-get_clocked_in_status': 'Checking who’s clocked in',
  'tool-get_todays_jobs': 'Pulling today’s jobs',
  'tool-get_pending_approvals': 'Checking pending approvals',
  'tool-get_team_roster': 'Looking up the team roster',
  'tool-get_recent_activity': 'Checking recent activity',
  'tool-get_revenue_snapshot': 'Pulling revenue numbers',
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
  onStateChange?: (state: ArcReactorState) => void;
  /** Past conversations for the sidebar. Omit to render the standalone chat with no sidebar. */
  conversations?: ArtifexConversationSummary[];
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onNewConversation?: () => void;
}

export default function ArtifexChat({
  onStateChange,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: ArtifexChatProps) {
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [transport] = useState(
    () => new DefaultChatTransport<ArtifexUIMessage>({ api: '/api/command-center/assistant', fetch: authedFetch })
  );
  const { messages, sendMessage, status, error } = useChat<ArtifexUIMessage>({ transport });
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasHistory = Array.isArray(conversations);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  useEffect(() => {
    if (!onStateChange) return;
    if (status === 'submitted' || status === 'streaming') onStateChange('thinking');
    else onStateChange('idle');
  }, [status, onStateChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || status === 'submitted' || status === 'streaming') return;
    sendMessage({ text });
    setInput('');
  };

  return (
    <div className="flex w-full max-w-3xl overflow-hidden rounded-2xl border border-violet-400/15 bg-black/50 shadow-[0_0_60px_-15px_rgba(124,58,237,0.35)] backdrop-blur-xl">
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
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2">
            {hasHistory && (
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                aria-label={historyOpen ? 'Hide conversation history' : 'Show conversation history'}
                aria-expanded={historyOpen}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
              >
                {historyOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </button>
            )}
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Artifex</span>
          </div>
          {hasHistory && onNewConversation && (
            <button
              type="button"
              onClick={onNewConversation}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/90"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New chat
            </button>
          )}
        </div>

        <div ref={scrollRef} className="flex max-h-[42vh] min-h-[160px] flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.length === 0 && (
            <p className="text-center text-sm text-white/35">
              Ask Artifex about jobs, the team, approvals, or activity.
            </p>
          )}
          {messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  message.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-br from-[#7C3AED] to-[#DB2777] px-4 py-2.5 text-sm text-white shadow-[0_2px_20px_-4px_rgba(219,39,119,0.5)]'
                    : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-white/[0.08] bg-white/[0.035] px-4 py-2.5 text-sm text-white/90'
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
                      className="my-1 flex items-center gap-1.5 text-xs text-violet-200/70 first:mt-0"
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

        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-3 sm:px-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Artifex…"
            className="min-h-[44px] flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || status === 'submitted' || status === 'streaming'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#DB2777] text-white transition-opacity disabled:opacity-30"
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
      className={`shrink-0 overflow-hidden border-r border-white/[0.06] bg-white/[0.015] transition-[width] duration-200 ${
        open ? 'w-48 sm:w-56' : 'w-0'
      }`}
    >
      <div className="flex h-full w-48 flex-col sm:w-56">
        <div className="flex items-center justify-between px-3 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">History</span>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs leading-relaxed text-white/30">
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
                    ? 'bg-gradient-to-r from-[#7C3AED]/25 to-[#DB2777]/15 text-white'
                    : 'text-white/55 hover:bg-white/[0.05] hover:text-white/85'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="truncate">{c.title}</span>
              </button>
            );
          })}
        </div>
        {onNewConversation && (
          <div className="border-t border-white/[0.06] p-2">
            <button
              type="button"
              onClick={onNewConversation}
              className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] text-xs font-medium text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white/90"
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
