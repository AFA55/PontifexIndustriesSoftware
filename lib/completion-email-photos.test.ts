/**
 * The storage read is mocked; what is under test is the part that decides what
 * the customer actually receives — order, the six cap, the byte budget, and the
 * rule that a photo which will not resolve costs that photo and nothing else.
 */
const mockFetchPhotoBytes = jest.fn();
jest.mock('@/lib/job-ticket-photos-server', () => ({
  fetchPhotoBytes: (...args: unknown[]) => mockFetchPhotoBytes(...args),
}));

import { resolveCompletionEmailPhotos, MAX_EMAIL_PHOTOS } from './completion-email-photos';

const url = (n: number) =>
  `https://klatddoyncxidgqtcjnu.supabase.co/storage/v1/object/public/job-photos/j/p${n}-1-x.jpg`;

const jpeg = (bytes = 1024) => ({ buffer: Buffer.alloc(bytes, 1), mime: 'image/jpeg' });
const png = (bytes = 1024) => ({ buffer: Buffer.alloc(bytes, 1), mime: 'image/png' });

beforeEach(() => {
  mockFetchPhotoBytes.mockReset();
});

describe('resolveCompletionEmailPhotos', () => {
  it('returns cid: sources paired with inline attachments', async () => {
    mockFetchPhotoBytes.mockResolvedValue(jpeg());
    const res = await resolveCompletionEmailPhotos([url(1), url(2)]);

    expect(res.sources).toEqual(['cid:jobphoto1@pontifexindustries.com', 'cid:jobphoto2@pontifexindustries.com']);
    expect(res.attachments).toHaveLength(2);
    expect(res.attachments[0]).toMatchObject({
      filename: 'job-photo-1.jpg',
      contentType: 'image/jpeg',
      contentId: 'jobphoto1@pontifexindustries.com',
    });
    // Each src must reference the cid of its own attachment, or the customer
    // sees a broken image again — just a different flavour of it.
    res.sources.forEach((src, i) => {
      expect(src).toBe(`cid:${res.attachments[i].contentId}`);
    });
    expect(res.failedCount).toBe(0);
  });

  it('base64-encodes the bytes for Resend', async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    mockFetchPhotoBytes.mockResolvedValue({ buffer, mime: 'image/jpeg' });
    const res = await resolveCompletionEmailPhotos([url(1)]);
    expect(res.attachments[0].content).toBe(buffer.toString('base64'));
  });

  it('names PNGs .png', async () => {
    mockFetchPhotoBytes.mockResolvedValue(png());
    const res = await resolveCompletionEmailPhotos([url(1)]);
    expect(res.attachments[0].filename).toBe('job-photo-1.png');
    expect(res.attachments[0].contentType).toBe('image/png');
  });

  it('preserves order — the completed-cut photo stays first', async () => {
    mockFetchPhotoBytes.mockResolvedValue(jpeg());
    const urls = [url(1), url(2), url(3)];
    await resolveCompletionEmailPhotos(urls);
    expect(mockFetchPhotoBytes.mock.calls.map((c) => c[0])).toEqual(urls);
  });

  it('stops at six and does not download the tail it would discard', async () => {
    mockFetchPhotoBytes.mockResolvedValue(jpeg());
    const urls = Array.from({ length: 12 }, (_, i) => url(i));
    const res = await resolveCompletionEmailPhotos(urls);

    expect(res.sources).toHaveLength(MAX_EMAIL_PHOTOS);
    expect(mockFetchPhotoBytes).toHaveBeenCalledTimes(MAX_EMAIL_PHOTOS);
  });

  it('skips over an unresolvable photo and still fills six', async () => {
    // A dead photo must cost that photo, not the five behind it.
    mockFetchPhotoBytes.mockImplementation(async (u: string) =>
      u.includes('p2-') ? null : jpeg()
    );
    const urls = Array.from({ length: 8 }, (_, i) => url(i + 1));
    const res = await resolveCompletionEmailPhotos(urls);

    expect(res.sources).toHaveLength(6);
    expect(res.failedCount).toBe(1);
  });

  it('reports failures rather than swallowing them, and still sends the rest', async () => {
    mockFetchPhotoBytes
      .mockResolvedValueOnce(jpeg())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const res = await resolveCompletionEmailPhotos([url(1), url(2), url(3)]);

    expect(res.sources).toHaveLength(1);
    expect(res.failedCount).toBe(2);
  });

  it('returns an empty set — never throws — when nothing resolves', async () => {
    mockFetchPhotoBytes.mockResolvedValue(null);
    const res = await resolveCompletionEmailPhotos([url(1), url(2)]);
    expect(res).toEqual({ sources: [], attachments: [], failedCount: 2 });
  });

  it('stops adding photos once the message byte budget is spent', async () => {
    // 3 MB apiece: the fourth would push the message past 8 MB.
    mockFetchPhotoBytes.mockResolvedValue(jpeg(3 * 1024 * 1024));
    const urls = Array.from({ length: 6 }, (_, i) => url(i));
    const res = await resolveCompletionEmailPhotos(urls);

    expect(res.sources.length).toBeLessThan(6);
    expect(
      res.attachments.reduce((n, a) => n + Buffer.from(a.content as string, 'base64').length, 0)
    ).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it('handles empty / non-array / junk input without touching storage', async () => {
    for (const input of [undefined, null, [], 'nope', 42, [null, '', 7]]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await resolveCompletionEmailPhotos(input);
      expect(res.sources).toEqual([]);
      expect(res.attachments).toEqual([]);
    }
    expect(mockFetchPhotoBytes).not.toHaveBeenCalled();
  });

  it('passes a per-photo size ceiling down to the storage read', async () => {
    mockFetchPhotoBytes.mockResolvedValue(jpeg());
    await resolveCompletionEmailPhotos([url(1)]);
    expect(mockFetchPhotoBytes).toHaveBeenCalledWith(url(1), 4 * 1024 * 1024);
  });
});
