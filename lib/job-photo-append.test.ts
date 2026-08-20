import { appendUniquePhotoUrls, countAlreadyPresent } from './job-photo-append';

const A = 'https://klatddoyncxidgqtcjnu.supabase.co/storage/v1/object/public/job-photos/j/a-1-x.jpg';
const B = 'https://klatddoyncxidgqtcjnu.supabase.co/storage/v1/object/public/job-photos/j/b-2-y.jpg';
const C = 'https://klatddoyncxidgqtcjnu.supabase.co/storage/v1/object/public/job-photos/j/c-3-z.jpg';

describe('appendUniquePhotoUrls', () => {
  it('appends genuinely new photos', () => {
    expect(appendUniquePhotoUrls([A], [B, C])).toEqual([A, B, C]);
  });

  it('is a no-op when the retry re-sends what already landed', () => {
    // The actual production bug: the POST succeeded, the response was lost, the
    // operator tapped Submit again with the identical URLs.
    expect(appendUniquePhotoUrls([A, B], [A, B])).toEqual([A, B]);
  });

  it('keeps only the new half of a partial retry', () => {
    expect(appendUniquePhotoUrls([A, B], [B, C])).toEqual([A, B, C]);
  });

  it('collapses duplicates inside the incoming batch itself', () => {
    expect(appendUniquePhotoUrls([], [A, A, B])).toEqual([A, B]);
  });

  it('never reorders what is already stored (photo #1 leads the ticket and email)', () => {
    expect(appendUniquePhotoUrls([C, A], [B])).toEqual([C, A, B]);
  });

  it('tolerates null/undefined/non-array columns and non-string entries', () => {
    expect(appendUniquePhotoUrls(null, [A])).toEqual([A]);
    expect(appendUniquePhotoUrls(undefined, undefined)).toEqual([]);
    expect(appendUniquePhotoUrls([A], null)).toEqual([A]);
    expect(appendUniquePhotoUrls([A, 42 as unknown as string], [B, '', null as unknown as string])).toEqual([A, B]);
  });

  it('treats different photos as different even when they share a prefix', () => {
    const near = A.replace('a-1-x.jpg', 'a-1-x2.jpg');
    expect(appendUniquePhotoUrls([A], [near])).toEqual([A, near]);
  });
});

describe('countAlreadyPresent', () => {
  it('counts a full retry', () => {
    expect(countAlreadyPresent([A, B], [A, B])).toBe(2);
  });

  it('counts a partial retry', () => {
    expect(countAlreadyPresent([A, B], [B, C])).toBe(1);
  });

  it('is zero for a genuine first upload', () => {
    expect(countAlreadyPresent([A], [B, C])).toBe(0);
    expect(countAlreadyPresent(null, [A])).toBe(0);
  });
});
