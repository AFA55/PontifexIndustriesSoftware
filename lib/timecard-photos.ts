import { signStoragePath } from '@/lib/signed-urls';

/**
 * Mint a viewable signed URL for a timecard photo column value.
 *
 * `timecard-photos` is a PRIVATE Supabase Storage bucket, so the
 * `remote_photo_url` / `clock_out_photo_url` columns on `timecards` hold
 * storage PATHS (e.g. "<tenant>/<user>/<ts>.jpg"), not viewable URLs. This
 * mints a short-lived signed URL for each real path.
 *
 * Legacy rows may hold the 'photo-upload-failed' sentinel or a full http(s)
 * public URL — both are left alone (returns null) so the UI can harden the
 * sentinel/null to a "No photo" placeholder instead of trying to sign a
 * non-path value.
 *
 * Extracted from duplicated `signTimecardPhoto`/`signPath` closures in
 * `app/api/admin/timecards/remote-verify/route.ts` and
 * `app/api/admin/timecards/operator/[id]/route.ts` — no behavior change.
 *
 * @param val               The stored column value (path, sentinel, URL, or null).
 * @param expiresInSeconds  URL validity window in seconds. Default 1 hour.
 */
export async function signTimecardPhoto(
  val: string | null | undefined,
  expiresInSeconds = 3600
): Promise<string | null> {
  if (!val) return null;
  if (val === 'photo-upload-failed') return null;
  if (val.startsWith('http://') || val.startsWith('https://')) return null;
  return signStoragePath('timecard-photos', val, expiresInSeconds);
}
