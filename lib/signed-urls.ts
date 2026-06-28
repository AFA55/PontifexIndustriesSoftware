import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Mint a short-lived signed URL for a path in a PRIVATE Supabase Storage bucket,
 * using the service-role admin client (server-side only — bypasses RLS).
 *
 * Returns the signed URL string, or `null` if signing fails (the error is logged
 * fire-and-forget so callers can degrade gracefully instead of throwing).
 *
 * Centralizes the `supabaseAdmin.storage.from(bucket).createSignedUrl(...)`
 * boilerplate that was duplicated across timecard, voice-note, and office-document
 * routes. Call-site behavior is preserved by passing the same bucket + expiry.
 *
 * @param bucket            Storage bucket name (e.g. 'timecard-photos').
 * @param path              Object path within the bucket (NOT a full URL).
 * @param expiresInSeconds  URL validity window in seconds. Default 1 hour.
 */
export async function signStoragePath(
  bucket: string,
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.error(`signStoragePath failed for ${bucket}/${path}:`, error);
    return null;
  }

  return data.signedUrl;
}
