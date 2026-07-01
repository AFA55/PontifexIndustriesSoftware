-- SECURITY FIX (public_bucket_allows_listing, advisor-flagged, follow-up):
-- 20260701_storage_buckets_deny_anon_listing.sql narrowed the SELECT policies
-- on avatars, job-photos, jobsite-area-docs, scope-photos, and
-- site-compliance-docs from PUBLIC/anon-inclusive to `authenticated`-only.
-- Re-running the advisor afterward showed the WARN still fires: the linter's
-- own detail text is explicit that "Public buckets don't need this for object
-- URL access" — i.e. it flags ANY broad `bucket_id = 'x'` SELECT policy on a
-- public bucket, authenticated or not, because reads are served through the
-- unauthenticated CDN path (/storage/v1/object/public/<bucket>/<path>), which
-- never consults storage.objects RLS. A SELECT policy on a public bucket only
-- adds an unnecessary `.list()`/table-enumeration surface for ANY authenticated
-- user (still not tenant-scoped, since these buckets store objects under
-- non-tenant-namespaced paths).
--
-- Every real read in this codebase uses `getPublicUrl()` (lib/database.ts,
-- app/dashboard/my-jobs/[id]/page.tsx, app/dashboard/job-schedule/[id]/
-- day-complete/page.tsx, app/api/upload/avatar/route.ts,
-- app/api/profile/avatar/route.ts) which is unaffected by removing the SELECT
-- policy entirely. The one `.list()` call in the repo
-- (app/api/profile/avatar/route.ts, DELETE cleanup) runs on supabaseAdmin
-- (service_role), which bypasses RLS and needs no policy. No client-side code
-- calls `.list()` or `.download()` as `authenticated` on any of these 5
-- buckets. Dropping the SELECT policies is therefore additive-safe and is the
-- linter's own recommended remediation for public buckets.

DROP POLICY IF EXISTS "avatars_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "job_photos_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "jobsite_area_docs_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "scope_photos_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "site_compliance_docs_authenticated_read" ON storage.objects;
