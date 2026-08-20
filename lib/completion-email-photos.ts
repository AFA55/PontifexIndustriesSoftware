/**
 * lib/completion-email-photos.ts — how the customer's completion thank-you
 * actually SHOWS the job photos.
 *
 * ── THE BUG THIS CLOSES ─────────────────────────────────────────────────────
 * `emails/CompletionThankYouEmail.tsx` rendered `<Img src={url}>` with the URL
 * stored on the job row. Those URLs are in the public-path shape
 * `/storage/v1/object/public/job-photos/…`, but `job-photos` and `scope-photos`
 * are PRIVATE buckets (`storage.buckets.public = false`). Fetching one returns
 *     400 {"statusCode":"404","error":"Bucket not found"}
 * (verified against production Aug 20 2026 — not inferred). Nothing threw and
 * nothing logged: every completion email Patriot has ever sent a customer showed
 * six grey boxes where the finished work was supposed to be.
 *
 * ── WHY INLINE PARTS AND NOT SIGNED URLs ────────────────────────────────────
 * A signed URL would render — but it is a BEARER TOKEN for our storage origin,
 * mailed to a customer who forwards it to a GC, an architect and an insurer.
 * Whoever holds the mail can read that object until the token expires, and the
 * expiry is the trap: an email is filed and re-opened months later, so any TTL
 * short enough to be safe re-breaks the photos, and any TTL long enough to be
 * useful is a years-live credential loose in a mail thread.
 *
 * Inline parts have no such dial. The bytes travel IN the message: they cannot
 * expire, they resolve offline, and nothing referencing our infrastructure
 * leaves with the forward. The customer was being sent these photos anyway —
 * this sends the photos rather than a key to the cabinet they live in.
 *
 * Sizing checked before choosing, against production storage:
 *   job-photos   95 objects, median 405 KB, mean 448 KB, max 2.67 MB
 *   scope-photos 22 objects, median 232 KB, mean 691 KB, max 2.16 MB
 * Six photos is ~2.4–2.7 MB typical, well inside Resend's 40 MB message ceiling
 * and Gmail's 25 MB receive limit even after base64 inflation. The caps below
 * only ever bite on input nobody intended.
 *
 * ── NEVER AT THE COST OF THE EMAIL ──────────────────────────────────────────
 * A customer who gets NO email is worse off than one who gets an email with
 * fewer photos. Nothing here throws: a photo that will not resolve is dropped,
 * counted, and reported to the caller so the failure is visible in the logs
 * instead of silently reproducing the original bug in a new shape.
 */
import type { EmailAttachment } from '@/lib/email';
import { fetchPhotoBytes } from '@/lib/job-ticket-photos-server';

/**
 * Per-photo ceiling. Generous on purpose — the largest real object is 2.67 MB,
 * so this rejects camera originals nobody meant to mail, not ordinary work.
 */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
/**
 * Ceiling on the TOTAL photo bytes in one message. The per-photo cap bounds
 * nothing in aggregate (6 × 4 MB = 24 MB, which Gmail would bounce once base64
 * inflates it). 8 MB keeps the worst case comfortably deliverable.
 */
const MAX_TOTAL_PHOTO_BYTES = 8 * 1024 * 1024;

/**
 * How many photos the email shows. Must stay in step with the `slice(0, 6)` in
 * `emails/CompletionThankYouEmail.tsx` — that cap is deliberate, and the list
 * handed in is deliberately ORDERED so the completed-cut photo is first
 * (see the `customerPhotoUrls` note in the day-complete page). Resolving in
 * order and stopping at six successes preserves both facts.
 */
export const MAX_EMAIL_PHOTOS = 6;

export interface CompletionEmailPhotos {
  /** `cid:` values, in order, to hand to the template as `referencePhotos`. */
  sources: string[];
  /** Inline attachments to append to the message. */
  attachments: EmailAttachment[];
  /** Photos that could not be resolved — logged, never fatal. */
  failedCount: number;
}

const EMPTY: CompletionEmailPhotos = { sources: [], attachments: [], failedCount: 0 };

/** RFC-legal, collision-free within one message; no PII from the storage path. */
function contentIdFor(index: number): string {
  return `jobphoto${index + 1}@pontifexindustries.com`;
}

/**
 * Resolve stored job-photo URLs into inline message parts.
 *
 * Sequential by design: it stops the moment it has `MAX_EMAIL_PHOTOS`, so on the
 * ordinary path it performs exactly six storage reads rather than downloading
 * every photo on a long multi-day job and discarding the tail.
 *
 * SECURITY: the URLs originate in a request body — `reference_photo_urls` is
 * posted by the operator's browser. `fetchPhotoBytes` reads them with the
 * service-role client, so it re-applies `parseStorageRef`'s gates (this
 * project's Supabase origin, an allow-listed photo bucket, no path traversal)
 * before any read. A crafted URL resolves to nothing; it does not become a
 * mailed copy of another tenant's file.
 */
export async function resolveCompletionEmailPhotos(
  urls: unknown,
  limit: number = MAX_EMAIL_PHOTOS
): Promise<CompletionEmailPhotos> {
  if (!Array.isArray(urls) || urls.length === 0 || limit <= 0) return EMPTY;

  const candidates = urls.filter(
    (u): u is string => typeof u === 'string' && u.trim() !== ''
  );
  if (candidates.length === 0) return EMPTY;

  const sources: string[] = [];
  const attachments: EmailAttachment[] = [];
  let failedCount = 0;
  let spentBytes = 0;

  for (const url of candidates) {
    if (sources.length >= limit) break;
    // Checked BEFORE the fetch so a run cannot overshoot the budget by a whole
    // photo. Remaining photos are simply not sent; the email still goes.
    if (spentBytes >= MAX_TOTAL_PHOTO_BYTES) break;

    // eslint-disable-next-line no-await-in-loop -- ordered, and capped at `limit`
    const photo = await fetchPhotoBytes(url.trim(), MAX_PHOTO_BYTES);
    if (!photo) {
      failedCount += 1;
      continue;
    }
    if (spentBytes + photo.buffer.length > MAX_TOTAL_PHOTO_BYTES) break;

    const index = sources.length;
    const cid = contentIdFor(index);
    const ext = photo.mime === 'image/png' ? 'png' : 'jpg';
    spentBytes += photo.buffer.length;
    sources.push(`cid:${cid}`);
    attachments.push({
      filename: `job-photo-${index + 1}.${ext}`,
      content: photo.buffer.toString('base64'),
      contentType: photo.mime,
      contentId: cid,
    });
  }

  return { sources, attachments, failedCount };
}
