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
 */
import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart } from 'ai';
import { Send, Search, CheckCircle2 } from 'lucide-react';
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

export default function ArtifexChat({
  onStateChange,
}: {
  onStateChange?: (state: ArcReactorState) => void;
}) {
  const [input, setInput] = useState('');
  const [transport] = useState(
    () => new DefaultChatTransport<ArtifexUIMessage>({ api: '/api/command-center/assistant', fetch: authedFetch })
  );
  const { messages, sendMessage, status, error } = useChat<ArtifexUIMessage>({ transport });
  const scrollRef = useRef<HTMLDivElement>(null);

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
    <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
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
                  ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-br from-[#7C3AED]/40 to-[#DB2777]/40 px-4 py-2.5 text-sm text-white'
                  : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/90'
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

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/10 px-3 py-3 sm:px-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Artifex…"
          className="min-h-[44px] flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
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
  );
}
