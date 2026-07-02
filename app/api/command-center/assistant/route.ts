export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/command-center/assistant
 *
 * Jarvis Command Center Phase 2 — the AI brain. Streams a chat response from
 * Artifex (see lib/agents/artifex-agent.ts), backed by tenant-scoped read-only
 * tools (see lib/tools/command-center-tools.ts).
 *
 * Auth: requireAuth + role ∈ COMMAND_CENTER_ROLES (management/office roles only —
 * matches the Phase 1 HUD's own access gate). Tenant resolved server-side; the
 * agent's tools are constructed fresh PER REQUEST from this resolved tenant+role,
 * so there is no way for one tenant's conversation to reach another's data.
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
import { createArtifexAgent } from '@/lib/agents/artifex-agent';

// Rough Haiku 4.5 gateway pricing for the usage log (USD per token). Approximate —
// this is for internal cost visibility, not billing; adjust if Vercel's gateway
// pricing page shows a different rate.
const COST_PER_INPUT_TOKEN = 1 / 1_000_000; // ~$1 / M input tokens
const COST_PER_OUTPUT_TOKEN = 5 / 1_000_000; // ~$5 / M output tokens

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

  const { messages } = await request.json();
  const agent = createArtifexAgent(tenantId, auth.role);

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    // Stash the stream's 'finish' part usage onto the response message's metadata
    // so onEnd (below) can read it back — the finish event itself carries no usage.
    messageMetadata: ({ part }) => {
      if (part.type === 'finish') {
        return { usage: part.totalUsage };
      }
      return undefined;
    },
    onEnd: ({ responseMessage }) => {
      // Fire-and-forget usage logging — never block/break the chat response on it.
      Promise.resolve(
        (async () => {
          const usage = (responseMessage as any)?.metadata?.usage;
          if (!usage) return;
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
        })()
      ).catch(() => {});
    },
  });
}
