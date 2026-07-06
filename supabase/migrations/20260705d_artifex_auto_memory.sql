-- Artifex Phase A2: automatic memory extraction (applied to prod Jul 5 2026).
ALTER TABLE public.artifex_memory_notes
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto'));

-- Nearest existing note by cosine distance — the dedup gate for auto-extracted
-- notes (skip saving when a near-identical note already exists). Service-role only.
CREATE OR REPLACE FUNCTION public.artifex_nearest_note(
  p_tenant_id uuid,
  p_embedding extensions.vector(1536)
)
RETURNS TABLE (id uuid, note text, distance double precision)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT id, note, (embedding <=> p_embedding)::double precision AS distance
  FROM public.artifex_memory_notes
  WHERE tenant_id = p_tenant_id AND embedding IS NOT NULL
  ORDER BY embedding <=> p_embedding
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.artifex_nearest_note(uuid, extensions.vector(1536)) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.artifex_nearest_note(uuid, extensions.vector(1536)) FROM anon;
REVOKE EXECUTE ON FUNCTION public.artifex_nearest_note(uuid, extensions.vector(1536)) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.artifex_nearest_note(uuid, extensions.vector(1536)) TO service_role;
