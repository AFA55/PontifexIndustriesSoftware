/**
 * lib/job-ticket-photos.ts — WHICH photos belong on the printed job ticket, in
 * what order, and under what caption.
 *
 * WHY (founder, Aug 16 2026): "if I add photos allow me to print those off as
 * well along with the ticket, see how best to incorporate this — I know it will
 * be more than 1 page and that's fine." The ticket route printed page 1 only,
 * so the scope photo the office attached to explain the layout never reached
 * the crew holding the paper.
 *
 * WHERE THE PHOTOS ACTUALLY LIVE (verified against production, Aug 16 2026 —
 * `information_schema.columns`, not assumed):
 *   job_orders.scope_photo_urls  — the schedule form's "Scope Reference Photos"
 *   job_orders.photo_urls        — field photos the crew uploads, and the
 *                                  end-of-day completion photos (those carry
 *                                  '/completion/' in the storage path)
 * There is NO `jobsite_photo_urls` column. The schedule form has a "Jobsite Area
 * Photos / Documents" uploader that puts URLs in a form field of that name and
 * POSTs them, but neither the create route nor the column exists — so those
 * uploads are dropped on save and there is nothing here to print. Flagged
 * separately; do not "fix" it by inventing a column read here.
 *
 * NOT EVERY URL IS AN IMAGE: 3 of the 64 URLs in production today are PDFs the
 * office attached through the same picker. react-pdf's <Image> renders JPEG and
 * PNG only — a PDF or a HEIC handed to it throws and would take the whole
 * ticket download down with it. Extension screening happens here; the fetch
 * layer re-checks the real content type, because a URL without an extension
 * tells you nothing.
 *
 * AND THE STORED URLs DO NOT RESOLVE. `job-photos` and `scope-photos` are
 * PRIVATE buckets (`storage.buckets.public = false`, verified Aug 16 2026) but
 * every row stores a `/storage/v1/object/public/<bucket>/<path>` URL — the same
 * legacy shape lib/storage-url.ts signs at display time. Fetching one returns
 * `400 {"error":"Bucket not found"}`. `parseStorageRef` below pulls the bucket
 * and object path back out so the server can pull the bytes with the
 * service-role client (lib/job-ticket-photos-server.ts). Handing these URLs
 * straight to <Image> would have printed blank frames on every photo page.
 *
 * Everything in THIS file is pure and unit-tested (lib/job-ticket-photos.test.ts);
 * the fetching lives in the -server sibling so the tests need no Supabase.
 */

/** A photo we intend to print, before anything has been fetched. */
export interface TicketPhotoSource {
  url: string;
  /** 'Scope reference' | 'Jobsite photo' | 'Completion photo' */
  source: string;
  /** What prints under the image: 'Scope reference 1 of 2'. */
  caption: string;
}

/** react-pdf can only draw these. Anything else is skipped, not guessed at. */
const RENDERABLE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png']);

/**
 * Extensions we KNOW react-pdf cannot draw. Screened out early so a PDF
 * attachment never reaches the renderer. An unknown/absent extension is NOT
 * rejected here — the Content-Type check at fetch time is the real gate.
 */
export function isRenderablePhotoUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return false;
  // Strip query/hash before looking at the extension — signed Supabase URLs
  // carry ?token=..., and '.jpg?token=abc' has no extension without this.
  const path = trimmed.split(/[?#]/)[0];
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  if (dot < 0 || dot < slash) return true; // no extension → let the fetch decide
  const ext = path.slice(dot + 1).toLowerCase();
  if (!/^[a-z0-9]{1,5}$/.test(ext)) return true;
  return RENDERABLE_EXTENSIONS.has(ext);
}

/**
 * A completion photo is stored under a '/completion/' path segment (the
 * day-complete flow writes it there). Captioning it as a plain jobsite photo
 * would tell the crew the wrong thing about what they are looking at.
 */
function jobPhotoSource(url: string): string {
  return /\/completion\//i.test(url) ? 'Completion photo' : 'Jobsite photo';
}

export interface TicketPhotoInput {
  scope_photo_urls?: unknown;
  photo_urls?: unknown;
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

/**
 * Every printable photo on the job, scope references first (they explain the
 * work the crew is about to do, so they belong on the first photo page), then
 * jobsite photos, then completion photos.
 *
 * Deduplicated by URL: the same file has been observed in both arrays, and
 * printing it twice wastes a half page of a sheet somebody carries in a truck.
 *
 * `limit` caps the output. It exists because this document is generated on
 * request and each photo is fetched and base64'd into the file — 60 photos
 * would be a slow download and a fat PDF. Anything beyond the cap is reported
 * by the caller rather than silently vanishing.
 */
export function collectTicketPhotos(job: TicketPhotoInput, limit = 24): TicketPhotoSource[] {
  const buckets: { urls: string[]; source: (u: string) => string }[] = [
    { urls: asStringArray(job.scope_photo_urls), source: () => 'Scope reference' },
    { urls: asStringArray(job.photo_urls), source: jobPhotoSource },
  ];

  const seen = new Set<string>();
  const picked: { url: string; source: string }[] = [];
  for (const bucket of buckets) {
    for (const url of bucket.urls) {
      const trimmed = url.trim();
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      if (!isRenderablePhotoUrl(trimmed)) continue;
      picked.push({ url: trimmed, source: bucket.source(trimmed) });
    }
  }

  // Group order: scope references, then jobsite, then completion.
  const ORDER = ['Scope reference', 'Jobsite photo', 'Completion photo'];
  picked.sort((a, b) => ORDER.indexOf(a.source) - ORDER.indexOf(b.source));

  const capped = limit > 0 ? picked.slice(0, limit) : picked;
  const totals = new Map<string, number>();
  for (const p of capped) totals.set(p.source, (totals.get(p.source) ?? 0) + 1);

  const running = new Map<string, number>();
  return capped.map((p) => {
    const n = (running.get(p.source) ?? 0) + 1;
    running.set(p.source, n);
    const total = totals.get(p.source) ?? 1;
    return { url: p.url, source: p.source, caption: total > 1 ? `${p.source} ${n} of ${total}` : p.source };
  });
}

// ── Where the bytes really are ──────────────────────────────────────────────

/** One printable page photo, image bytes inlined for react-pdf's <Image>. */
export interface TicketPhoto {
  /** `data:image/jpeg;base64,…` */
  dataUri: string;
  caption: string;
}

/** A stored URL resolved back to the object it names. */
export interface StorageRef {
  bucket: string;
  path: string;
}

const PUBLIC_URL_RE = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;
/** Already-signed: /storage/v1/object/sign/<bucket>/<path>?token=… */
const SIGNED_URL_RE = /\/storage\/v1\/object\/sign\/([^/]+)\/([^?]+)/;
/** Authenticated form, occasionally stored by older upload helpers. */
const AUTH_URL_RE = /\/storage\/v1\/object\/authenticated\/([^/]+)\/([^?]+)/;

/**
 * Pull `{ bucket, path }` out of any Supabase Storage URL shape this codebase
 * has ever stored, or null for a genuinely external URL.
 *
 * The path is percent-DECODED, because that is the key the storage API wants;
 * a job whose photo filename contains a space round-trips as `%20` in the URL
 * and would otherwise 404 on download.
 */
/**
 * The ONLY buckets a printed job ticket may read from.
 *
 * Verified against production: all 64 stored photo URLs live in exactly these
 * two. Anything else is either a mistake or an attack, and there is no case
 * where a dispatch ticket legitimately needs `contracts`, `hiring-resumes`,
 * `timecard-photos` or another tenant's anything.
 */
export const TICKET_PHOTO_BUCKETS = new Set(['job-photos', 'scope-photos']);

/**
 * Pull `{ bucket, path }` out of a Supabase Storage URL belonging to THIS
 * project, or null.
 *
 * ── WHY THIS IS PARANOID ────────────────────────────────────────────────────
 * Whatever comes back from here is handed to `supabaseAdmin.storage`, which
 * runs as service-role and therefore ignores every storage RLS policy. The
 * bucket and path are taken from a URL STRING, and those strings are attacker-
 * controllable: `POST /api/job-orders/[id]/photos` appends whatever array of
 * strings it is given, and any operator assigned to a job may call it. The
 * dispatch ticket then renders the bytes and hands the caller a PDF — and
 * operators are allowed to print dispatch tickets.
 *
 * So without the checks below, an operator could write
 *     https://anything/storage/v1/object/public/timecard-photos/<other tenant>/x.jpg
 * and print another company's files. The regexes were unanchored, so the HOST
 * was never even looked at.
 *
 * Three gates, all of which must pass:
 *   1. Same origin as this project's Supabase URL — not merely "looks like a
 *      Supabase path", which any host can produce.
 *   2. Bucket on the allow-list above.
 *   3. Path cannot traverse (`..`), cannot be absolute, no backslashes —
 *      checked AFTER percent-decoding, because `..%2F..%2F` decodes into a
 *      traversal that a pre-decode check would wave through.
 */
export function parseStorageRef(url: string): StorageRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null; // relative or malformed — never fetched
  }

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!projectUrl) return null;
  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(projectUrl).origin;
  } catch {
    return null;
  }
  if (parsed.origin !== expectedOrigin) return null;

  const m =
    parsed.pathname.match(PUBLIC_URL_RE) ??
    parsed.pathname.match(SIGNED_URL_RE) ??
    parsed.pathname.match(AUTH_URL_RE);
  if (!m) return null;

  const bucket = m[1];
  if (!TICKET_PHOTO_BUCKETS.has(bucket)) return null;

  let path: string;
  try {
    path = decodeURIComponent(m[2]);
  } catch {
    path = m[2];
  }

  if (
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((seg) => seg === '..')
  ) {
    return null;
  }

  return { bucket, path };
}

/** Photos per printed page — a 2 × 2 grid. See DispatchTicketPDF for the sizing. */
export const PHOTOS_PER_PAGE = 4;

/** Splits into per-page chunks, then into rows of 2 (no flexWrap in react-pdf). */
export function chunkPhotoPages<T>(photos: T[], perPage = PHOTOS_PER_PAGE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < photos.length; i += perPage) pages.push(photos.slice(i, i + perPage));
  return pages;
}
