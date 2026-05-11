-- voice-checkouts storage bucket: audio recordings of voice-driven equipment
-- checkouts. Used for forensic replay when a voice parse went wrong (background
-- noise, mumbled phrase, etc). Non-public — only authenticated admin/shop_manager
-- roles can read; uploads are server-side via supabaseAdmin so RLS on insert
-- is intentionally permissive to authenticated users (the API gate is at
-- `/api/admin/equipment-checkouts/voice-note-upload`).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-checkouts',
  'voice-checkouts',
  false,
  10485760, -- 10 MB, well above what a 10-sec voice clip needs
  ARRAY['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav']
)
ON CONFLICT (id) DO NOTHING;

-- Upload + read policies: gated by `authenticated` role; the API endpoint is
-- where role + tenant scoping actually live (see api-auth.ts requireAuth).
DO $$
BEGIN
  CREATE POLICY "auth_upload_voice_checkouts" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'voice-checkouts');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  CREATE POLICY "auth_read_voice_checkouts" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'voice-checkouts');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  CREATE POLICY "auth_delete_voice_checkouts" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'voice-checkouts');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
