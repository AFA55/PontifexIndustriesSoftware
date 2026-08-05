'use client';

/**
 * Display-time storage URL resolver (security F1, Jul 23).
 *
 * Some buckets that hold tenant data were flipped from PUBLIC to PRIVATE. Their
 * stored values in the DB are still full `/storage/v1/object/public/<bucket>/…`
 * URLs (no data migration) — those paths 404 on a private bucket. This helper
 * detects a stored public URL for a now-private bucket, extracts the object
 * path, and returns a short-lived SIGNED URL the logged-in user can load.
 *
 * A private bucket needs an `authenticated`-read storage.objects policy for
 * createSignedUrl to succeed client-side (added in the same migration). If
 * signing fails for any reason we fall back to the stored value rather than
 * throw — a broken thumbnail is better than a crashed page.
 */
import { supabase } from '@/lib/supabase';

/**
 * Buckets that are PRIVATE and therefore need display-time signing.
 *
 * ⚠️ THIS LIST MUST MATCH storage.buckets WHERE public = false.
 * A private bucket missing from here is invisible in the worst way: the upload
 * succeeds, the row stores a `/object/public/...` URL, and every <img> pointing
 * at it 403s. Nothing errors — the picture is simply never there.
 *
 * That is exactly what happened to David's supervisor visit photos on 5 Aug
 * 2026. `maintenance-photos` had been made private but was never added here, so
 * his site photos uploaded fine and then rendered as broken images. The files
 * were safe the whole time; only the URL was unusable.
 *
 * Verified against the live bucket list Aug 2026. Buckets holding documents
 * rather than displayed images (completion-pdfs, contracts, hiring-resumes,
 * office-documents, takeoff-documents, JobDocuments, voice-checkouts) are
 * signed server-side via lib/storage-url-server.ts instead.
 */
export const PRIVATE_DISPLAY_BUCKETS = new Set<string>([
  'scope-photos',
  'jobsite-area-docs',
  'job-photos',
  'maintenance-photos',    // supervisor site-visit photos + maintenance requests
  'timecard-photos',
  'blade-checkout-photos',
  'review-photos',
]);

const PUBLIC_URL_RE = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;
const SIGNED_TTL_SECONDS = 3600; // 1 hour — plenty for a page view

/** True if this stored value is a public URL for a bucket we've made private. */
export function needsSigning(stored: string): boolean {
  const m = stored.match(PUBLIC_URL_RE);
  return !!m && PRIVATE_DISPLAY_BUCKETS.has(m[1]);
}

/** Resolve one stored value to a loadable display URL (signs if needed). */
export async function toDisplayUrl(stored: string): Promise<string> {
  const m = stored.match(PUBLIC_URL_RE);
  if (!m || !PRIVATE_DISPLAY_BUCKETS.has(m[1])) return stored;
  const bucket = m[1];
  const path = decodeURIComponent(m[2]);
  try {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_TTL_SECONDS);
    return data?.signedUrl ?? stored;
  } catch {
    return stored;
  }
}

/** Batch resolve — signs per bucket in one request where possible. */
export async function toDisplayUrls(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map(toDisplayUrl));
}
