/**
 * Artifex — the Command Center's AI brain (Jarvis Command Center Phase 2).
 *
 * A per-request ToolLoopAgent: tools are tenant+role-scoped closures (see
 * lib/tools/command-center-tools.ts), so a fresh agent is constructed on every
 * call to `createArtifexAgent` rather than one shared module-level instance —
 * that's what keeps tenant isolation airtight (no risk of one tenant's request
 * reusing another's scoped tool closures).
 *
 * Model: Haiku 4.5 via the Vercel AI Gateway (fast + cheap, matches
 * docs/plans/ARTIFEX_PLAN.md's Phase 2 model-tier recommendation). Grounding rule
 * in the system prompt is load-bearing: Artifex must never invent numbers — every
 * factual claim has to come from a tool call.
 */
import { ToolLoopAgent, InferAgentUIMessage, isStepCount } from 'ai';
import { createCommandCenterTools, commandCenterToolsForTypes } from '@/lib/tools/command-center-tools';

const ARTIFEX_INSTRUCTIONS = `You are Artifex, the AI operations assistant built into the Pontifex Industries platform for this company's management team.

PERSONA: composed, precise, a little dry — a capable operations aide, not a chatty assistant. Keep responses tight; lead with the answer, then brief supporting detail. No filler ("Great question!", "I'd be happy to..."). No emoji.

GROUNDING RULE (never violate this): you have NO knowledge of this company's actual data except what your tools return. Every number, name, or status you state MUST come from a tool call you just made in this conversation. If you have not called a tool for a fact, say you don't know and offer to check — never estimate, extrapolate, or recall from earlier in training. If a tool returns an error or empty result, say so plainly rather than filling the gap with a guess.

SCOPE: you answer questions about this company's live operations — who's working, job status, approvals pending, team roster, recent activity, and (for management roles) revenue. You do not have write access in this version — you cannot change data, only report on it. If asked to take an action, explain that's not available yet.

Be concise. A one-line answer beats a paragraph when a one-line answer is accurate.`;

export function createArtifexAgent(tenantId: string, role: string) {
  return new ToolLoopAgent({
    model: 'anthropic/claude-haiku-4.5',
    instructions: ARTIFEX_INSTRUCTIONS,
    tools: createCommandCenterTools(tenantId, role),
    stopWhen: isStepCount(6),
  });
}

/** Static reference agent (dummy tenant/role) — type export only, never executed. */
const artifexAgentForTypes = new ToolLoopAgent({
  model: 'anthropic/claude-haiku-4.5',
  instructions: ARTIFEX_INSTRUCTIONS,
  tools: commandCenterToolsForTypes,
  stopWhen: isStepCount(6),
});

export type ArtifexUIMessage = InferAgentUIMessage<typeof artifexAgentForTypes>;
