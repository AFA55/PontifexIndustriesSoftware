export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/command-center/assistant
 *
 * Jarvis Command Center Phase 2 — the AI brain. Streams a chat response from
 * Artifex (see lib/agents/artifex-agent.ts), backed by tenant-scoped tools
 * (see lib/tools/command-center-tools.ts).
 *
 * Auth: requireAuth + role ∈ COMMAND_CENTER_ROLES (management/office roles only —
 * matches the Phase 1 HUD's own access gate). Tenant resolved server-side; the
 * agent's tools are constructed fresh PER REQUEST from this resolved tenant+role,
 * so there is no way for one tenant's conversation to reach another's data.
 *
 * Conversation persistence (the "2nd brain"): the client passes an optional
 * `conversationId` in the body. Absent/null means "start a new conversation" —
 * we create the artifex_conversations row up front (title filled in after the
 * first turn) so its id can ride along on the stream's `start` event via
 * messageMetadata, and the client picks it up from the response message. When
 * a conversationId IS provided we re-verify tenant+user ownership ourselves
 * before touching it — supabaseAdmin bypasses RLS, so this check is the actual
 * security boundary, not a redundant belt-and-suspenders one — then hydrate
 * prior turns from artifex_messages so the agent resumes with full context.
 *
 * Cost logging: every call's token usage is written to ai_usage (fire-and-forget,
 * matches this repo's established fire-and-forget logging convention — a logging
 * failure must never break the chat response).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAgentUIStreamResponse } from 'ai';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { COMMAND_CENTER_ROLES } from '@/lib/rbac';
import { createArtifexAgent, type ArtifexUIMessage } from '@/lib/agents/artifex-agent';

// Rough Haiku 4.5 gateway pricing for the usage log (USD per token). Approximate —
// this is for internal cost visibility, not billing; adjust if Vercel's gateway
// pricing page shows a different rate.
const COST_PER_INPUT_TOKEN = 1 / 1_000_000; // ~$1 / M input tokens
const COST_PER_OUTPUT_TOKEN = 5 / 1_000_000; // ~$5 / M output tokens

const TITLE_WORD_COUNT = 6;

function titleFromMessage(message: ArtifexUIMessage | undefined): string | null {
  const textPart = (message?.parts as any[] | undefined)?.find((p) => p.type === 'text');
  const text: string | undefined = textPart?.text;
  if (!text) return null;
  const words = text.trim().split(/\s+/).slice(0, TITLE_WORD_COUNT);
  if (words.length === 0) return null;
  return words.join(' ') + (text.trim().split(/\s+/).length > TITLE_WORD_COUNT ? '…' : '');
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (!COMMAND_CENTER_ROLES.includes(auth.role)) {
    return NextResponse.json(
      { error: 'Forbidden. Command Center access required.' },
      { status: 403 }
    );
  }

  const tenantId = auth.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: 'Forbidden. Tenant not set for this user.' }, { status: 403 });
  }

  const { messages, conversationId: requestedConversationId } = await request.json();
  const incomingMessages: ArtifexUIMessage[] = messages ?? [];

  let conversationId: string = requestedConversationId ?? '';
  let isNewConversation = false;
  let priorMessages: ArtifexUIMessage[] = [];

  if (conversationId) {
    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from('artifex_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (conversationError) {
      return NextResponse.json({ error: 'Failed to load conversation.' }, { status: 500 });
    }
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    }

    const { data: priorRows, error: priorError } = await supabaseAdmin
      .from('artifex_messages')
      .select('role, parts')
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });
    if (priorError) {
      return NextResponse.json({ error: 'Failed to load conversation history.' }, { status: 500 });
    }
    priorMessages = (priorRows ?? []).map((row: any, i: number) => ({
      id: `history-${i}`,
      role: row.role,
      parts: row.parts,
    }));
  } else {
    const { data: created, error: createError } = await supabaseAdmin
      .from('artifex_conversations')
      .insert({ tenant_id: tenantId, user_id: auth.userId, title: null })
      .select('id')
      .single();
    if (createError || !created) {
      return NextResponse.json({ error: 'Failed to start conversation.' }, { status: 500 });
    }
    conversationId = created.id;
    isNewConversation = true;
  }

  const uiMessages = [...priorMessages, ...incomingMessages];
  const agent = createArtifexAgent(tenantId, auth.role, auth.userId);

  return createAgentUIStreamResponse({
    agent,
    uiMessages,
    // Called on 'start' and 'finish' — stash the conversationId on 'start' so the
    // client can read it back immediately, and usage on 'finish' for onEnd below.
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return { conversationId };
      }
      if (part.type === 'finish') {
        return { usage: part.totalUsage };
      }
      return undefined;
    },
    onEnd: ({ responseMessage }) => {
      // Fire-and-forget: persistence + usage logging must never block/break the chat response.
      Promise.resolve(
        (async () => {
          const usage = (responseMessage as any)?.metadata?.usage;
          if (usage) {
            const inputTokens = usage.inputTokens ?? 0;
            const outputTokens = usage.outputTokens ?? 0;
            const cachedTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
            await supabaseAdmin.from('ai_usage').insert({
              tenant_id: tenantId,
              user_id: auth.userId,
              model: 'anthropic/claude-haiku-4.5',
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cached_tokens: cachedTokens,
              cost_usd: inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN,
            });
          }

          const lastUserMessage = [...incomingMessages].reverse().find((m) => m.role === 'user');
          const rowsToInsert = [
            ...(lastUserMessage
              ? [{ conversation_id: conversationId, tenant_id: tenantId, role: 'user', parts: lastUserMessage.parts }]
              : []),
            { conversation_id: conversationId, tenant_id: tenantId, role: 'assistant', parts: responseMessage.parts },
          ];
          await supabaseAdmin.from('artifex_messages').insert(rowsToInsert);

          const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (isNewConversation) {
            update.title = titleFromMessage(lastUserMessage);
          }
          await supabaseAdmin.from('artifex_conversations').update(update).eq('id', conversationId);
        })()
      ).catch(() => {});
    },
  });
}
