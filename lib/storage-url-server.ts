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
]);

const PUBLIC_URL_RE = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;
const TTL = 3600;

/** Resolve one stored value to a signed URL if it targets a private bucket. */
export async function signStoredUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return stored ?? null;
  const m = stored.match(PUBLIC_URL_RE);
  if (!m || !PRIVATE_BUCKETS.has(m[1])) return stored;
  const bucket = m[1];
  const path = decodeURIComponent(m[2]);
  try {
    const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, TTL);
    return data?.signedUrl ?? stored;
  } catch {
    return stored;
  }
}

/** Resolve an array of stored values (nulls preserved). */
export async function signStoredUrls(urls: (string | null | undefined)[] | null | undefined): Promise<string[]> {
  if (!Array.isArray(urls)) return [];
  const out = await Promise.all(urls.map((u) => signStoredUrl(u)));
  return out.filter((u): u is string => !!u);
}
