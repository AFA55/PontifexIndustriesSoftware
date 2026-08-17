/**
 * lib/job-ticket-photos-server.ts — turning the job's stored photo URLs into
 * bytes react-pdf can draw. Server-only (uses the service-role client); the
 * pure selection/caption/parse logic is the -photos sibling.
 *
 * TWO REASONS THIS IS NOT JUST `<Image src={url} />`:
 *
 *  1. THE STORED URLs DO NOT RESOLVE. `job-photos` and `scope-photos` are
 *     PRIVATE buckets, but every row holds a legacy
 *     `/storage/v1/object/public/<bucket>/<path>` URL (the same mismatch
 *     lib/storage-url.ts papers over at display time). Fetching one gives
 *     `400 {"error":"Bucket not found"}`. Verified against production Aug 16
 *     2026 — with a raw <Image src>, every photo page would have printed an
 *     empty frame and nothing would have errored.
 *
 *  2. A REMOTE URL IS A LIABILITY INSIDE `renderToBuffer`. A slow host stalls
 *     the render and a 404 throws mid-document, which would cost the crew the
 *     whole job ticket over a decorative photo. Signing and then re-fetching
 *     over HTTP would add the same failure mode back (plus an expiry window),
 *     so we pull the object directly with the service-role client instead.
 *
 * Nothing here throws. A photo that cannot be resolved is simply not printed.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseStorageRef, type TicketPhoto, type TicketPhotoSource } from '@/lib/job-ticket-photos';

/** ~8MB. Above this it is a camera original nobody needs at 5 inches wide. */
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
/**
 * Ceiling on the TOTAL bytes inlined into one ticket. The per-photo cap alone
 * bounds nothing in aggregate: 24 photos × 8MB is 192MB of buffers plus ~256MB
 * of base64 held at once, then handed to react-pdf. Real data is nowhere near
 * this (largest object 2.67MB, average 0.50MB), so the budget only ever bites
 * on input nobody intended.
 */
const MAX_TOTAL_PHOTO_BYTES = 20 * 1024 * 1024;
/** A few at a time — 24 parallel storage reads is a good way to get throttled. */
const CONCURRENCY = 4;

/** react-pdf draws JPEG and PNG. Anything else is skipped, never guessed at. */
function normalizeImageMime(raw: string | null | undefined): string | null {
  const mime = (raw || '').split(';')[0].trim().toLowerCase();
  if (mime === 'image/jpg' || mime === 'image/jpeg') return 'image/jpeg';
  if (mime === 'image/png') return 'image/png';
  return null;
}

/**
 * JPEG starts FF D8 FF, PNG with the 8-byte signature. Used when storage
 * reports no content type (older uploads have empty mimetype metadata) — the
 * bytes are the only trustworthy answer, and handing react-pdf a PDF that a
 * filename claimed was a .jpg is precisely how a whole ticket 500s.
 */
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  return null;
}

function toDataUri(buf: Buffer, declaredMime: string | null): string | null {
  if (buf.length === 0 || buf.length > MAX_PHOTO_BYTES) return null;
  const mime = normalizeImageMime(declaredMime) ?? sniffImageMime(buf);
  if (!mime) return null;
  // Trust the bytes over the label when they disagree.
  const sniffed = sniffImageMime(buf);
  return `data:${sniffed ?? mime};base64,${buf.toString('base64')}`;
}

/** Pull an object straight out of Storage with the service-role client. */
async function downloadFromStorage(bucket: string, path: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    return toDataUri(buf, (data as Blob).type);
  } catch {
    return null;
  }
}

/** A genuinely external https image (not one of our buckets). */
// `downloadExternal` DELETED (Aug 17). It fetched any https URL the job row
// happened to contain and returned the bytes to the caller — a server-side
// request forgery primitive with output, reachable by any operator who can
// append a photo URL. Production stores zero external photo URLs (all 64 are
// this project's Storage), so it existed only as an attack surface.

/** One photo → inline bytes, or null when it cannot be printed. */
export async function fetchPhotoDataUri(url: string): Promise<string | null> {
  // A URL that is not one of THIS project's allow-listed photo buckets is not
  // fetched at all. See parseStorageRef for why that matters: these bytes are
  // read with the service-role client, which bypasses storage RLS entirely.
  const ref = parseStorageRef(url);
  if (!ref) return null;
  return downloadFromStorage(ref.bucket, ref.path);
}

/**
 * Resolve every collected photo to inline bytes, dropping the ones that cannot
 * be fetched or are not really images. Order is preserved, so the captions
 * ("Scope reference 1 of 2") still describe what actually prints.
 */
export async function resolveTicketPhotos(sources: TicketPhotoSource[]): Promise<TicketPhoto[]> {
  if (sources.length === 0) return [];
  const resolved: (TicketPhoto | null)[] = new Array(sources.length).fill(null);
  let spentBytes = 0;
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= sources.length) return;
      // Stop collecting once the ticket has spent its byte budget. Checked
      // before the fetch so a run cannot overshoot by a whole photo, and shared
      // across workers so concurrency cannot multiply it.
      if (spentBytes >= MAX_TOTAL_PHOTO_BYTES) return;
      // eslint-disable-next-line no-await-in-loop
      const dataUri = await fetchPhotoDataUri(sources[i].url);
      if (dataUri) {
        spentBytes += dataUri.length;
        resolved[i] = { dataUri, caption: sources[i].caption };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sources.length) }, worker));
  return resolved.filter((p): p is TicketPhoto => p !== null);
}
