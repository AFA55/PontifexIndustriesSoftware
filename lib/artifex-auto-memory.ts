/**
 * Artifex Phase A2 — automatic memory extraction
 * (docs/plans/ARTIFEX_2ND_BRAIN_ROADMAP.md §4-A2).
 *
 * After each chat exchange, a cheap Haiku pass decides whether the user said
 * anything DURABLE (a preference, decision, commitment, recurring issue,
 * vendor/person fact). Usually the answer is "nothing" — the extractor is
 * instructed to return an empty list by default. Candidates are deduped
 * against existing memory by embedding distance before saving, and stored
 * with source='auto' so the memory browser can distinguish them.
 *
 * INVARIANTS:
 *  - Fail-soft everywhere: this runs fire-and-forget after the response has
 *    streamed; no failure here may ever surface to the user.
 *  - NEVER extract live operational data (covered by tools), secrets, or
 *    anything about the assistant itself. The prompt enforces; the cap guards.
 *  - Tenant-scoped writes only (tenantId is the caller's resolved tenant).
 */
import { generateObject } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { embedText } from '@/lib/artifex-embeddings';

const EXTRACTION_MODEL = 'anthropic/claude-haiku-4.5';
const MAX_NOTES_PER_EXCHANGE = 2;
/** Cosine distance below which a candidate is considered a duplicate.
 * text-embedding-3-small: near-duplicates/paraphrases sit well under this. */
const DUPLICATE_DISTANCE = 0.15;

const extractionSchema = z.object({
  notes: z
    .array(
      z.object({
        note: z.string().describe('The durable fact as ONE standalone sentence with enough context to make sense months later.'),
        category: z.enum(['preference', 'decision', 'commitment', 'recurring_issue', 'person', 'vendor', 'fact']),
      })
    )
    .max(MAX_NOTES_PER_EXCHANGE)
    .describe('Durable facts worth remembering across future conversations. USUALLY EMPTY.'),
});

const SYSTEM = `You extract durable company memory from one chat exchange between a staff member and Artifex (an operations assistant for a field-services company).

Extract a note ONLY for information with lasting value across future conversations:
- stated preferences ("I want invoices sent on Fridays")
- decisions ("we switched diesel suppliers to X")
- commitments with dates ("inspection is on the 15th")
- recurring issues, vendor facts, people facts.

DO NOT extract:
- live operational data (who is clocked in, today's jobs, revenue numbers) — the assistant has tools for those;
- anything the user explicitly asked the assistant to remember (a separate tool already saved it);
- questions, small talk, the assistant's own suggestions, or speculation;
- credentials, tokens, or personal data beyond names/roles.

Return an EMPTY list unless something clearly qualifies. Most exchanges contain nothing durable.`;

export async function extractAndStoreMemories(args: {
  tenantId: string;
  userId: string;
  userText: string;
  assistantText: string;
}): Promise<void> {
  const { tenantId, userId, userText, assistantText } = args;
  if (!userText.trim()) return;

  try {
    const { object, usage } = await generateObject({
      model: gateway(EXTRACTION_MODEL),
      schema: extractionSchema,
      system: SYSTEM,
      prompt: `USER SAID:\n${userText.slice(0, 4000)}\n\nASSISTANT REPLIED:\n${assistantText.slice(0, 2000)}`,
    });

    // Usage logging (fire-and-forget, same table as the chat itself).
    Promise.resolve(
      supabaseAdmin.from('ai_usage').insert({
        tenant_id: tenantId,
        user_id: userId,
        model: EXTRACTION_MODEL,
        input_tokens: usage?.inputTokens ?? 0,
        output_tokens: usage?.outputTokens ?? 0,
        cost_usd:
          (usage?.inputTokens ?? 0) * (1 / 1_000_000) +
          (usage?.outputTokens ?? 0) * (5 / 1_000_000),
        source: 'artifex_auto_memory',
      })
    ).then(() => {}).catch(() => {});

    for (const candidate of object.notes.slice(0, MAX_NOTES_PER_EXCHANGE)) {
      const embedding = await embedText(`${candidate.note} ${candidate.category}`);

      // Dedup: skip when a near-identical note already exists.
      if (embedding) {
        const { data: nearest } = await supabaseAdmin.rpc('artifex_nearest_note', {
          p_tenant_id: tenantId,
          p_embedding: JSON.stringify(embedding),
        });
        const top = Array.isArray(nearest) ? nearest[0] : nearest;
        if (top && typeof top.distance === 'number' && top.distance < DUPLICATE_DISTANCE) {
          continue; // already known
        }
      }

      const { data: inserted, error } = await supabaseAdmin
        .from('artifex_memory_notes')
        .insert({
          tenant_id: tenantId,
          created_by: userId,
          note: candidate.note,
          category: candidate.category,
          source: 'auto',
          ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
        })
        .select('id')
        .single();
      if (error) {
        console.error('[artifex] auto-memory insert failed (fail-soft):', error.message);
      } else if (inserted) {
        console.log(`[artifex] auto-memory saved (${candidate.category}): ${candidate.note.slice(0, 80)}`);
      }
    }
  } catch (err) {
    console.error('[artifex] auto-memory extraction failed (fail-soft):', err instanceof Error ? err.message : err);
  }
}
