-- SECURITY FIX (public_bucket_allows_listing, advisor-flagged, 5 hits):
-- avatars, job-photos, jobsite-area-docs, scope-photos, and site-compliance-docs
-- each had a SELECT policy on storage.objects granted to the PUBLIC/anon role
-- with no predicate beyond `bucket_id = '<bucket>'`. In Supabase Storage, the
-- SELECT policy on storage.objects gates BOTH "download a known path" AND the
-- `.list()` / direct-table enumeration API — so an anonymous, unauthenticated
-- caller could list every object (all filenames/paths, across ALL tenants) in
-- these buckets, not just fetch a URL they already knew.
--
-- These buckets are legitimately `public: true` (files are served over the
-- unauthenticated CDN-style endpoint /storage/v1/object/public/<bucket>/<path>,
-- which does NOT consult storage.objects RLS at all — that's the point of a
-- public bucket). Every read path in this codebase uses
-- `supabase.storage.from(bucket).getPublicUrl(path)` (lib/database.ts,
-- app/dashboard/my-jobs/[id]/page.tsx, app/dashboard/job-schedule/[id]/
-- day-complete/page.tsx, app/api/upload/avatar/route.ts,
-- app/api/profile/avatar/route.ts) — never `.list()` or `.download()` from the
-- browser. The one `.list()` call in the repo (app/api/profile/avatar/route.ts,
-- DELETE cleanup) runs on supabaseAdmin (service_role), which bypasses RLS
-- entirely and is unaffected by tightening these policies.
--
-- Fix: replace the anon-inclusive SELECT policies with `authenticated`-only
-- SELECT policies (still bucket-scoped, no tenant predicate available — these
-- buckets store objects under non-tenant-namespaced paths like
-- `scope/scope-<ts>-<rand>.png`, so true tenant-scoped storage RLS would
-- require a path-structure migration, which is out of scope for this
-- additive fix). This closes the anonymous cross-tenant enumeration vector
-- (the actual risk the advisor flagged) while leaving every existing
-- getPublicUrl()-based read, and every authenticated upload/delete path,
-- working exactly as before.
--
-- avatars are intentionally left fully public-readable (profile photos are not
-- sensitive) but anon listing is still removed since no legitimate flow needs it.

-- ── avatars ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
DO $$ BEGIN
  CREATE POLICY "avatars_authenticated_read" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── job-photos ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_job_photos" ON storage.objects;
DO $$ BEGIN
  CREATE POLICY "job_photos_authenticated_read" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'job-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── jobsite-area-docs ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_jobsite_area_docs" ON storage.objects;
DO $$ BEGIN
  CREATE POLICY "jobsite_area_docs_authenticated_read" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'jobsite-area-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── scope-photos ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_scope_photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read from scope-photos" ON storage.objects;
DO $$ BEGIN
  CREATE POLICY "scope_photos_authenticated_read" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'scope-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── site-compliance-docs ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_site_compliance_docs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read from site-compliance-docs" ON storage.objects;
DO $$ BEGIN
  CREATE POLICY "site_compliance_docs_authenticated_read" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'site-compliance-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
