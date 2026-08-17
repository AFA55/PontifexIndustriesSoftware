/**
 * lib/job-ticket-photos.test.ts
 *
 * The URLs marked PROD are literal `job_orders.photo_urls` /
 * `scope_photo_urls` values from production (Aug 16 2026). Two things about
 * them are load-bearing and easy to get wrong:
 *
 *   - they are `/storage/v1/object/public/...` URLs for buckets that are
 *     PRIVATE, so they cannot be fetched as-is — `parseStorageRef` has to get
 *     the bucket and object path back out, and
 *   - 3 of the 64 are PDFs the office attached through the photo picker, which
 *     react-pdf cannot draw and which must never reach the renderer.
 */

import {
  isRenderablePhotoUrl,
  collectTicketPhotos,
  chunkPhotoPages,
  parseStorageRef,
  PHOTOS_PER_PAGE,
} from './job-ticket-photos';

const PROJECT_ORIGIN = 'https://klatddoyncxidgqtcjnu.supabase.co';
// parseStorageRef is origin-locked (it feeds the service-role storage client),
// and jest.setup.js points NEXT_PUBLIC_SUPABASE_URL at localhost. Align the env
// with the production fixtures below so these exercise the real URLs.
process.env.NEXT_PUBLIC_SUPABASE_URL = PROJECT_ORIGIN;
const BASE = `${PROJECT_ORIGIN}/storage/v1/object`;

// PROD — JOB-2026-877412 (the job with the most attachments)
const PROD_SCOPE_PHOTOS = [
  `${BASE}/public/scope-photos/scope/scope-1786027995919-r53g3.jpg`,
  `${BASE}/public/scope-photos/scope/scope-1786028011528-vc14ui.jpg`,
];
const PROD_JOB_PHOTOS = [
  `${BASE}/public/job-photos/5e64d564/5e64d564-1786123364953-z2hol6.jpg`,
  `${BASE}/public/job-photos/5e64d564/completion/5e64d564/completion-1786123455225-psfued.jpg`,
];
// PROD — JOB-2026-793440: a PDF sitting in scope_photo_urls.
const PROD_SCOPE_PDF = `${BASE}/public/scope-photos/scope/scope-1786738562289-bycior.pdf`;

describe('isRenderablePhotoUrl', () => {
  it('PROD: accepts the jpgs and rejects the pdf attachment', () => {
    for (const url of [...PROD_SCOPE_PHOTOS, ...PROD_JOB_PHOTOS]) {
      expect(isRenderablePhotoUrl(url)).toBe(true);
    }
    // react-pdf's <Image> throws on a PDF — it would take the whole ticket down.
    expect(isRenderablePhotoUrl(PROD_SCOPE_PDF)).toBe(false);
  });

  it('rejects formats react-pdf cannot draw', () => {
    expect(isRenderablePhotoUrl('https://x.test/a.heic')).toBe(false);
    expect(isRenderablePhotoUrl('https://x.test/a.svg')).toBe(false);
    expect(isRenderablePhotoUrl('https://x.test/a.webp')).toBe(false);
    expect(isRenderablePhotoUrl('https://x.test/a.docx')).toBe(false);
  });

  it('ignores the query string when reading the extension', () => {
    // A signed Supabase URL carries ?token=…; without stripping it, a perfectly
    // good photo looks like it has no extension.
    expect(isRenderablePhotoUrl('https://x.test/a.jpg?token=abc.def')).toBe(true);
    expect(isRenderablePhotoUrl('https://x.test/a.pdf?token=abc')).toBe(false);
    expect(isRenderablePhotoUrl('https://x.test/a.jpg#frag')).toBe(true);
  });

  it('lets an extensionless URL through for the content-type check to judge', () => {
    expect(isRenderablePhotoUrl('https://x.test/photos/abc123')).toBe(true);
    expect(isRenderablePhotoUrl('https://x.test/photos/abc123?token=z')).toBe(true);
  });

  it('rejects anything that is not an http(s) string', () => {
    expect(isRenderablePhotoUrl('')).toBe(false);
    expect(isRenderablePhotoUrl('   ')).toBe(false);
    expect(isRenderablePhotoUrl(null)).toBe(false);
    expect(isRenderablePhotoUrl(undefined)).toBe(false);
    expect(isRenderablePhotoUrl(42)).toBe(false);
    expect(isRenderablePhotoUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isRenderablePhotoUrl('/local/a.jpg')).toBe(false);
  });
});

describe('parseStorageRef', () => {
  it('PROD: recovers bucket + path from the stored public-form URL', () => {
    expect(parseStorageRef(PROD_SCOPE_PHOTOS[0])).toEqual({
      bucket: 'scope-photos',
      path: 'scope/scope-1786027995919-r53g3.jpg',
    });
    expect(parseStorageRef(PROD_JOB_PHOTOS[1])).toEqual({
      bucket: 'job-photos',
      path: '5e64d564/completion/5e64d564/completion-1786123455225-psfued.jpg',
    });
  });

  it('handles the signed and authenticated URL shapes too', () => {
    expect(parseStorageRef(`${BASE}/sign/job-photos/a/b.jpg?token=xyz`)).toEqual({
      bucket: 'job-photos',
      path: 'a/b.jpg',
    });
    expect(parseStorageRef(`${BASE}/authenticated/job-photos/a/b.jpg`)).toEqual({
      bucket: 'job-photos',
      path: 'a/b.jpg',
    });
  });

  it('percent-decodes the path, because that is the key storage wants', () => {
    expect(parseStorageRef(`${BASE}/public/job-photos/a/my%20photo.jpg`)).toEqual({
      bucket: 'job-photos',
      path: 'a/my photo.jpg',
    });
  });

  it('returns null for a genuinely external URL', () => {
    expect(parseStorageRef('https://example.com/a.jpg')).toBeNull();
    expect(parseStorageRef('')).toBeNull();
  });

  // ── Security. Whatever this returns is handed to the SERVICE-ROLE storage
  // client, which ignores storage RLS. The URLs are row data, and any operator
  // assigned to a job can append one via POST /api/job-orders/[id]/photos —
  // then print the dispatch ticket and receive the bytes. Before these gates,
  // that was a cross-tenant read of any private bucket.
  it('refuses a Supabase-shaped path on somebody ELSE’s host', () => {
    expect(
      parseStorageRef('https://evil.example.com/storage/v1/object/public/job-photos/a.jpg')
    ).toBeNull();
    expect(
      parseStorageRef('https://klatddoyncxidgqtcjnu.supabase.co.evil.test/storage/v1/object/public/job-photos/a.jpg')
    ).toBeNull();
  });

  it('refuses buckets a job ticket has no business reading', () => {
    for (const bucket of [
      'contracts', 'hiring-resumes', 'office-documents', 'takeoff-documents',
      'timecard-photos', 'avatars', 'review-photos', 'maintenance-photos',
    ]) {
      expect(parseStorageRef(`${BASE}/public/${bucket}/x.png`)).toBeNull();
    }
  });

  it('refuses a path that tries to climb out of its bucket', () => {
    expect(parseStorageRef(`${BASE}/public/job-photos/../avatars/a.png`)).toBeNull();
    // Encoded traversal: a pre-decode check would wave this straight through.
    expect(parseStorageRef(`${BASE}/public/job-photos/..%2F..%2Favatars/a.png`)).toBeNull();
    expect(parseStorageRef(`${BASE}/public/job-photos//etc/passwd`)).toBeNull();
  });

  it('refuses anything that is not a URL at all', () => {
    expect(parseStorageRef('/storage/v1/object/public/job-photos/a.jpg')).toBeNull();
    expect(parseStorageRef('not a url')).toBeNull();
  });
});

describe('collectTicketPhotos', () => {
  it('PROD: orders scope references first, then jobsite, then completion', () => {
    const photos = collectTicketPhotos({
      scope_photo_urls: PROD_SCOPE_PHOTOS,
      photo_urls: PROD_JOB_PHOTOS,
    });
    expect(photos.map((p) => p.source)).toEqual([
      'Scope reference',
      'Scope reference',
      'Jobsite photo',
      'Completion photo',
    ]);
    // The scope photos explain the work; they belong on the first photo page.
    expect(photos[0].url).toBe(PROD_SCOPE_PHOTOS[0]);
  });

  it('captions with the source, numbered only when there is more than one', () => {
    const photos = collectTicketPhotos({
      scope_photo_urls: PROD_SCOPE_PHOTOS,
      photo_urls: PROD_JOB_PHOTOS,
    });
    expect(photos.map((p) => p.caption)).toEqual([
      'Scope reference 1 of 2',
      'Scope reference 2 of 2',
      'Jobsite photo',
      'Completion photo',
    ]);
  });

  it('tells a completion photo apart from a jobsite photo by its storage path', () => {
    const photos = collectTicketPhotos({ photo_urls: PROD_JOB_PHOTOS });
    expect(photos.map((p) => p.source)).toEqual(['Jobsite photo', 'Completion photo']);
  });

  it('PROD: drops the pdf attachment rather than crashing the render', () => {
    const photos = collectTicketPhotos({
      scope_photo_urls: [PROD_SCOPE_PDF, ...PROD_SCOPE_PHOTOS],
    });
    expect(photos).toHaveLength(2);
    expect(photos.every((p) => p.url.endsWith('.jpg'))).toBe(true);
  });

  it('deduplicates a file that appears in both arrays', () => {
    const dupe = PROD_SCOPE_PHOTOS[0];
    const photos = collectTicketPhotos({ scope_photo_urls: [dupe], photo_urls: [dupe] });
    expect(photos).toHaveLength(1);
    expect(photos[0].source).toBe('Scope reference');
  });

  it('caps the count so a 60-photo job is not a 60-page download', () => {
    const many = Array.from({ length: 40 }, (_, i) => `${BASE}/public/job-photos/x/${i}.jpg`);
    expect(collectTicketPhotos({ photo_urls: many })).toHaveLength(24);
    expect(collectTicketPhotos({ photo_urls: many }, 6)).toHaveLength(6);
    expect(collectTicketPhotos({ photo_urls: many }, 0)).toHaveLength(40);
  });

  it('is empty — never throwing — for the jobs that have no photos', () => {
    expect(collectTicketPhotos({})).toEqual([]);
    expect(collectTicketPhotos({ photo_urls: null, scope_photo_urls: null })).toEqual([]);
    expect(collectTicketPhotos({ photo_urls: [], scope_photo_urls: [] })).toEqual([]);
    // Postgres text[] round-trips have handed us these before.
    expect(collectTicketPhotos({ photo_urls: ['', '  ', null] as unknown as string[] })).toEqual([]);
    expect(collectTicketPhotos({ photo_urls: 'not-an-array' })).toEqual([]);
  });
});

describe('chunkPhotoPages', () => {
  it('fills a 2 × 2 grid per page and leaves the last page short', () => {
    expect(chunkPhotoPages([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([[1, 2, 3, 4], [5, 6, 7, 8]]);
    expect(chunkPhotoPages([1, 2, 3, 4, 5])).toEqual([[1, 2, 3, 4], [5]]);
    expect(PHOTOS_PER_PAGE).toBe(4);
  });

  it('produces NO pages for a job with no photos, so the ticket stays one page', () => {
    expect(chunkPhotoPages([])).toEqual([]);
  });
});
