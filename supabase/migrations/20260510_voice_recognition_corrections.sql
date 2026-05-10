-- voice_recognition_corrections — learning loop for voice equipment checkout.
-- Every successful voice match (auto-confirmed or user-corrected) writes a
-- row. Future calls hit this cache first via fuzzy match on `normalized_phrase`
-- so the system gets faster + more accurate over time without manual alias
-- entry. After N successful matches of the same phrase, shop manager gets
-- prompted to add it as a permanent equipment.alias.

-- Enable pg_trgm for fuzzy text matching (trigram similarity).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.voice_recognition_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  spoken_text text NOT NULL,
  normalized_phrase text NOT NULL,
  resolved_kind text NOT NULL CHECK (resolved_kind IN ('equipment', 'truck', 'operator')),
  resolved_id uuid NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  was_corrected boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_corrections_lookup
  ON public.voice_recognition_corrections(tenant_id, normalized_phrase);

CREATE INDEX IF NOT EXISTS idx_voice_corrections_phrase_resolution
  ON public.voice_recognition_corrections(tenant_id, normalized_phrase, resolved_id);

CREATE INDEX IF NOT EXISTS idx_equipment_name_trgm
  ON public.equipment USING gin (name gin_trgm_ops)
  WHERE status NOT IN ('retired', 'out_of_service');

CREATE INDEX IF NOT EXISTS idx_equipment_short_name_trgm
  ON public.equipment USING gin (short_name gin_trgm_ops)
  WHERE short_name IS NOT NULL AND status NOT IN ('retired', 'out_of_service');

ALTER TABLE public.voice_recognition_corrections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "voice_corrections_tenant_read" ON public.voice_recognition_corrections
    FOR SELECT
    USING (tenant_id = public.current_user_tenant_id() OR public.current_user_role() = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "voice_corrections_admin_write" ON public.voice_recognition_corrections
    FOR INSERT
    WITH CHECK (
      public.current_user_has_role('admin','super_admin','operations_manager','shop_manager','supervisor')
      AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.voice_recognition_corrections IS
  'Learning loop for voice equipment checkout. Every successful voice match logs the spoken phrase + resolved entity, so future calls match faster. After N matches of the same phrase, shop_manager gets prompted to add it as an alias.';
