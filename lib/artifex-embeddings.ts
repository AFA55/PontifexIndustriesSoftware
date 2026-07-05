/**
 * Artifex memory embeddings — Phase A1 of the 2nd-brain roadmap
 * (docs/plans/ARTIFEX_2ND_BRAIN_ROADMAP.md).
 *
 * One tiny wrapper so save + recall + backfill all embed identically.
 * Model: openai/text-embedding-3-small via the Vercel AI Gateway (1536 dims —
 * must match artifex_memory_notes.embedding vector(1536) and
 * artifex_hybrid_recall()'s parameter type).
 *
 * Fail-soft by design: embedding is an ENHANCEMENT to memory, never a gate.
 * A save must succeed even if the embedding call fails (the note just stays
 * keyword-only until backfilled); recall falls back to keyword search.
 */
import { embed } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const ARTIFEX_EMBEDDING_MODEL = 'openai/text-embedding-3-small';

export async function embedText(text: string): Promise<number[] | null> {
  try {
    const { embedding } = await embed({
      model: gateway.embedding(ARTIFEX_EMBEDDING_MODEL),
      value: text.slice(0, 8000),
    });
    return embedding;
  } catch (err) {
    console.error('[artifex] embedding failed (fail-soft):', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Embed a saved note and store it. Await-able but safe to fire-and-forget —
 * all failures are swallowed after logging.
 */
export async function embedAndStoreNote(noteId: string, text: string): Promise<void> {
  const embedding = await embedText(text);
  if (!embedding) return;
  const { error } = await supabaseAdmin
    .from('artifex_memory_notes')
    .update({ embedding: JSON.stringify(embedding) })
    .eq('id', noteId);
  if (error) console.error('[artifex] embedding store failed (fail-soft):', error.message);
}
