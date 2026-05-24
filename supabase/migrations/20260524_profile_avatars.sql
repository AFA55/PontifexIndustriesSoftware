-- Migration: Profile avatars
-- Date: 2026-05-24
--
-- Adds an avatar column to profiles and a PUBLIC `avatars` storage bucket.
-- Profile pictures are low-sensitivity and displayed across the UI, so public
-- read keeps display dead-simple (no signed-URL churn). Writes are still locked
-- down: an authenticated user may only write objects under a path prefixed by
-- their own user id (`<auth.uid()>/...`).
--
-- NOTE: the application standardized on `profile_picture_url` (already present in
-- production and wired through the API + UI). We add `avatar_url` here as the
-- spec'd canonical name AND keep `profile_picture_url` working. Both are kept in
-- sync by the API layer; either can be read.

-- ============================================================
-- 1. Avatar columns on profiles
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_picture_url text;

-- ============================================================
-- 2. Public `avatars` storage bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. RLS on storage.objects for the avatars bucket
--    - public SELECT (read)
--    - authenticated INSERT/UPDATE/DELETE only under "<own uid>/..."
-- (foldername(name))[1] is the first path segment, e.g. the "<uid>" in
-- "<uid>/1716500000.jpg".
-- ============================================================
DO $$
BEGIN
  CREATE POLICY "avatars public read"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "avatars owner insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "avatars owner update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "avatars owner delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
