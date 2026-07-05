-- ============================================================================
-- Artifex 2nd-brain Phase A1: hybrid semantic recall
-- (docs/plans/ARTIFEX_2ND_BRAIN_ROADMAP.md §3 — Supabase hybrid-search pattern:
-- keyword tsvector + pgvector embeddings merged with Reciprocal Rank Fusion.)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE public.artifex_memory_notes
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536);

-- Generated keyword-search column (note + category).
DO $$
BEGIN
  ALTER TABLE public.artifex_memory_notes
    ADD COLUMN fts tsvector GENERATED ALWAYS AS
      (to_tsvector('english', coalesce(note, '') || ' ' || coalesce(category, ''))) STORED;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_artifex_notes_fts
  ON public.artifex_memory_notes USING gin(fts);
CREATE INDEX IF NOT EXISTS idx_artifex_notes_embedding
  ON public.artifex_memory_notes USING hnsw (embedding extensions.vector_cosine_ops);

-- Hybrid recall: RRF merge of keyword + semantic ranks (k=50 per the Supabase
-- guide), ALWAYS tenant-scoped. Service-role only — called from the Artifex
-- tool layer, never from clients.
CREATE OR REPLACE FUNCTION public.artifex_hybrid_recall(
  p_tenant_id uuid,
  p_query text,
  p_query_embedding extensions.vector(1536),
  p_match_count int DEFAULT 20,
  p_full_text_weight double precision DEFAULT 1,
  p_semantic_weight double precision DEFAULT 1,
  p_rrf_k int DEFAULT 50
)
RETURNS TABLE (note text, category text, created_at timestamptz, score double precision)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH full_text AS (
    SELECT id,
           row_number() OVER (
             ORDER BY ts_rank_cd(fts, websearch_to_tsquery('english', p_query)) DESC
           ) AS rank_ix
    FROM public.artifex_memory_notes
    WHERE tenant_id = p_tenant_id
      AND p_query IS NOT NULL AND length(trim(p_query)) > 0
      AND fts @@ websearch_to_tsquery('english', p_query)
    ORDER BY rank_ix
    LIMIT greatest(p_match_count, 10) * 2
  ),
  semantic AS (
    SELECT id,
           row_number() OVER (ORDER BY embedding <=> p_query_embedding) AS rank_ix
    FROM public.artifex_memory_notes
    WHERE tenant_id = p_tenant_id
      AND embedding IS NOT NULL
      AND p_query_embedding IS NOT NULL
    ORDER BY rank_ix
    LIMIT greatest(p_match_count, 10) * 2
  )
  SELECT n.note, n.category, n.created_at,
         (coalesce(1.0 / (p_rrf_k + ft.rank_ix), 0.0) * p_full_text_weight +
          coalesce(1.0 / (p_rrf_k + s.rank_ix), 0.0) * p_semantic_weight) AS score
  FROM full_text ft
  FULL OUTER JOIN semantic s USING (id)
  JOIN public.artifex_memory_notes n ON n.id = coalesce(ft.id, s.id)
  ORDER BY score DESC
  LIMIT p_match_count;
$$;

REVOKE EXECUTE ON FUNCTION public.artifex_hybrid_recall(uuid, text, extensions.vector(1536), int, double precision, double precision, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.artifex_hybrid_recall(uuid, text, extensions.vector(1536), int, double precision, double precision, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.artifex_hybrid_recall(uuid, text, extensions.vector(1536), int, double precision, double precision, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.artifex_hybrid_recall(uuid, text, extensions.vector(1536), int, double precision, double precision, int) TO service_role;
