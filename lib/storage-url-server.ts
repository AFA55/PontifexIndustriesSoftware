/**
 * Server-side storage URL signer (security F1). Uses the service-role client,
 * which can always sign regardless of storage RLS. Use in API routes that
 * return stored image/doc URLs so the client receives ready-to-load signed
 * URLs for now-private buckets — no client-side signing needed.
 *
 * Mirrors lib/storage-url.ts (client) but server-only. Keep PRIVATE_BUCKETS in
 * sync with the buckets actually flipped private.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';

const PRIVATE_BUCKETS = new Set<string>([
  'scope-photos',
  'jobsite-area-docs',
  'job-photos',
  'contracts',
  'completion-pdfs',
  // Supervisor site-visit + equipment-issue photos. Uploads go through
  // /api/admin/supervisor-visits/photo-upload, which persists the PUBLIC-FORM
  // URL — it never resolves on its own (the bucket is private) and never
  // expires as a string, so every read path must re-sign it here.
  // (Historically the client stored a 30-day signed URL directly, which meant
  // photos silently 404ed a month after the visit.)
  'maintenance-photos',
]);

const PUBLIC_URL_RE = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;
/** Already-signed URL: /storage/v1/object/sign/<bucket>/<path>?token=… */
const SIGNED_URL_RE = /\/storage\/v1\/object\/sign\/([^/]+)\/([^?]+)/;
const TTL = 3600;

/**
 * Split a stored value into { bucket, path } when it points at a private
 * bucket (in either the public-URL or already-signed-URL form). Returns null
 * when the value needs no signing.
 */
function parsePrivateRef(stored: string): { bucket: string; path: string } | null {
  const m = stored.match(PUBLIC_URL_RE) ?? stored.match(SIGNED_URL_RE);
  if (!m || !PRIVATE_BUCKETS.has(m[1])) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

/** Resolve one stored value to a signed URL if it targets a private bucket. */
export async function signStoredUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return stored ?? null;
  const ref = parsePrivateRef(stored);
  if (!ref) return stored;
  try {
    const { data } = await supabaseAdmin.storage.from(ref.bucket).createSignedUrl(ref.path, TTL);
    return data?.signedUrl ?? stored;
  } catch {
    return stored;
  }
}

/**
 * Batch variant: signs many URLs with ONE storage round-trip per bucket instead
 * of one per URL. Use when returning a list (e.g. every photo across a job's
 * site-visit reports) so response time doesn't scale with photo count.
 * Order is preserved; anything that can't be signed falls back to the stored
 * value rather than disappearing.
 */
export async function signStoredUrlsBatch(
  urls: (string | null | undefined)[] | null | undefined
): Promise<string[]> {
  if (!Array.isArray(urls)) return [];
  const values = urls.filter((u): u is string => !!u);
  if (values.length === 0) return [];

  // bucket -> unique paths
  const byBucket = new Map<string, Set<string>>();
  for (const v of values) {
    const ref = parsePrivateRef(v);
    if (!ref) continue;
    const set = byBucket.get(ref.bucket) ?? new Set<string>();
    set.add(ref.path);
    byBucket.set(ref.bucket, set);
  }
  if (byBucket.size === 0) return values;

  // path key ("bucket::path") -> freshly signed URL
  const signed = new Map<string, string>();
  await Promise.all(
    [...byBucket.entries()].map(async ([bucket, pathSet]) => {
      const paths = [...pathSet];
      try {
        const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrls(paths, TTL);
        for (const row of data ?? []) {
          if (row?.signedUrl && row.path) signed.set(`${bucket}::${row.path}`, row.signedUrl);
        }
      } catch {
        /* fall through — originals are returned */
      }
    })
  );

  return values.map((v) => {
    const ref = parsePrivateRef(v);
    if (!ref) return v;
    return signed.get(`${ref.bucket}::${ref.path}`) ?? v;
  });
}

/** Resolve an array of stored values (nulls preserved). */
export async function signStoredUrls(urls: (string | null | undefined)[] | null | undefined): Promise<string[]> {
  if (!Array.isArray(urls)) return [];
  const out = await Promise.all(urls.map((u) => signStoredUrl(u)));
  return out.filter((u): u is string => !!u);
}
