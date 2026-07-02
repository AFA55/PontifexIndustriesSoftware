/**
 * Ticket-analysis agent — investigates a single customer feedback/bug ticket and
 * drafts a diagnosis for the founder to review. Platform Hub feature, super_admin
 * only (see app/api/admin/feedback/[id]/analyze/route.ts).
 *
 * DRAFT-ONLY, by design (deliberate founder decision — do not add write/auto-apply
 * capability): this agent's tools (lib/tools/ticket-analysis-tools.ts) are strictly
 * read-only, and its own output is plain analysis text, never an action. The result
 * is stored in feedback_submissions.ai_analysis for a human to read and act on.
 *
 * Per-request ToolLoopAgent, same construction pattern as createArtifexAgent —
 * tools are a tenant-scoped closure, so a fresh agent is built on every call rather
 * than a shared module-level instance. Unlike Artifex (a streaming chat agent),
 * this is a one-shot structured investigation: `output: Output.object({ schema })`
 * makes `.generate()` return a typed `.output` after the model has used its
 * tools across up to stopWhen's step count — `generateObject` in this installed
 * `ai` version is deprecated in favor of exactly this generateText/ToolLoopAgent
 * + Output.object shape (verified against node_modules/ai/dist/index.d.ts and
 * node_modules/ai/docs/03-agents/02-building-agents.mdx).
 *
 * Model: Sonnet 5 (stronger than Artifex's Haiku) — a full cross-tenant ticket
 * investigation warrants it; this only runs on-demand (super_admin click), not
 * on every chat turn, so the cost profile is fine.
 */
import { ToolLoopAgent, Output, stepCountIs } from 'ai';
import { z } from 'zod';
import { createTicketAnalysisTools, ticketAnalysisToolsForTypes } from '@/lib/tools/ticket-analysis-tools';

const TICKET_ANALYSIS_INSTRUCTIONS = `You are a platform investigator for Pontifex Industries, a multi-tenant SaaS for construction-services operations (job scheduling, timecards, invoicing). A customer (tenant) has filed a support ticket. Your job is to investigate using the read-only tools available and produce a grounded draft diagnosis for a human platform operator to review — you are NOT the one who fixes anything or talks to the customer.

INVESTIGATE FIRST: call get_tenant_profile for context, then get_tenant_recent_activity and/or search_related_records to look for evidence related to what the ticket describes (a job number, a date, a customer name, a workflow step). Cite what you actually found — don't speculate about data you didn't look up.

YOU CANNOT TAKE ANY ACTION. You have no write access, cannot change any record, and cannot contact the customer. Your only output is analysis text for a human to act on manually.

If the evidence is inconclusive or you'd need more information from the customer to be confident, say so honestly in "confidence" and use "followUpQuestion" to suggest what to ask them — do not guess to sound more certain than you are.

Produce exactly this output shape:
- diagnosis: plain-English explanation of what's likely happening, grounded in what you found (or honestly noting what's unclear)
- proposedFix: a plain-English description of how a human should fix this — NOT code, just what needs to happen
- confidence: 'low' | 'medium' | 'high'
- followUpQuestion: optional — a specific question to ask the customer if you need more info to be confident`;

export const ticketAnalysisOutputSchema = z.object({
  diagnosis: z.string().describe('Plain-English diagnosis grounded in investigated evidence.'),
  proposedFix: z.string().describe('Plain-English description of the proposed fix — no code.'),
  confidence: z.enum(['low', 'medium', 'high']),
  followUpQuestion: z
    .string()
    .optional()
    .describe('A specific follow-up question to ask the customer, if more info is needed.'),
});

export type TicketAnalysisResult = z.infer<typeof ticketAnalysisOutputSchema>;

export function createTicketAnalysisAgent(tenantId: string) {
  return new ToolLoopAgent({
    model: 'anthropic/claude-sonnet-5',
    instructions: TICKET_ANALYSIS_INSTRUCTIONS,
    tools: createTicketAnalysisTools(tenantId),
    output: Output.object({ schema: ticketAnalysisOutputSchema }),
    stopWhen: stepCountIs(6),
  });
}

/** Static reference agent (dummy tenant id) — type export only, never executed. */
const ticketAnalysisAgentForTypes = new ToolLoopAgent({
  model: 'anthropic/claude-sonnet-5',
  instructions: TICKET_ANALYSIS_INSTRUCTIONS,
  tools: ticketAnalysisToolsForTypes,
  output: Output.object({ schema: ticketAnalysisOutputSchema }),
  stopWhen: stepCountIs(6),
});

export type TicketAnalysisAgent = typeof ticketAnalysisAgentForTypes;
