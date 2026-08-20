/**
 * lib/job-photo-append.ts — appending uploaded photo URLs to a job WITHOUT
 * counting the same photo twice.
 *
 * ── THE BUG ─────────────────────────────────────────────────────────────────
 * `POST /api/job-orders/[id]/photos` did `[...existing, ...photo_urls]`. That is
 * fine exactly once. Today's work-performed screen added a RETRY: if the POST
 * reaches the server but the response never makes it back — weak LTE in a
 * trench, or the 20 s client abort firing after the write already landed — the
 * operator taps Submit again and the identical URLs are appended a second time.
 *
 * The append is invisible where it happens and loud everywhere downstream:
 * day-complete told a crew "4 photos already added on this shift" for two
 * photos, and the printed ticket burned four photo pages on two. Production
 * carries this on 2 job rows today (4 surplus entries across 27 rows holding
 * photos, verified Aug 20 2026).
 *
 * ── WHY EXACT-MATCH DEDUPE IS ENOUGH ────────────────────────────────────────
 * This is not the naive comparison it looks like. Every URL in these arrays is
 * produced by one code path — `supabase.storage.getPublicUrl()` on an upload
 * this app performed — and the filenames it generates are
 * `${uuid}-${Date.now()}-${random}.${ext}`: lower-case hex, digits, hyphens and
 * a short extension. There is nothing in them to percent-encode, no case to
 * normalise, no query string, no trailing slash. The retry re-sends the byte-
 * identical string it sent the first time, so string equality catches it.
 *
 * It deliberately does NOT try to be clever about near-matches. Two genuinely
 * different photos of the same cut are two photos; a same-object-different-URL
 * case cannot arise from the writer above, and if one ever does, normalising
 * here would be guessing. `parseStorageRef`-based identity would be the answer
 * then — this is a note for that day, not a shortcoming today.
 */

/**
 * `existing` plus every entry of `incoming` that is not already present,
 * in order, with the incoming batch's own internal duplicates collapsed too.
 *
 * Order is load-bearing: the first photo on a job is the one the printed ticket
 * and the customer email lead with, so this only ever appends — it never
 * reorders or re-sorts what is already stored.
 */
export function appendUniquePhotoUrls(
  existing: unknown,
  incoming: unknown
): string[] {
  const asUrls = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && u !== '') : [];

  const kept = asUrls(existing);
  const seen = new Set(kept);
  const merged = [...kept];

  for (const url of asUrls(incoming)) {
    if (seen.has(url)) continue;
    seen.add(url);
    merged.push(url);
  }
  return merged;
}

/**
 * How many of `incoming` were already on the job — the number the retry would
 * otherwise have duplicated. Reported so a silent no-op append is visible in
 * the logs rather than looking like a successful upload of new work.
 */
export function countAlreadyPresent(existing: unknown, incoming: unknown): number {
  const before = Array.isArray(existing) ? existing.filter((u) => typeof u === 'string').length : 0;
  const incomingCount = Array.isArray(incoming)
    ? incoming.filter((u) => typeof u === 'string' && u !== '').length
    : 0;
  const after = appendUniquePhotoUrls(existing, incoming).length;
  return Math.max(0, before + incomingCount - after);
}
