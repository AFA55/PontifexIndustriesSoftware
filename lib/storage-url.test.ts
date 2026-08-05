/**
 * Guards the private-bucket list.
 *
 * A private bucket missing from PRIVATE_DISPLAY_BUCKETS fails in the worst
 * possible way: the upload succeeds, the row stores a `/object/public/...` URL,
 * and every <img> pointing at it 403s. Nothing throws. The picture is simply
 * never there.
 *
 * That is what happened to David's supervisor site-visit photos on 5 Aug 2026 —
 * `maintenance-photos` had been made private but was never added to the list.
 */

import { needsSigning, PRIVATE_DISPLAY_BUCKETS } from './storage-url';

const publicUrl = (bucket: string, path = 'tenant/visits/site/abc.jpg') =>
  `https://klatddoyncxidgqtcjnu.supabase.co/storage/v1/object/public/${bucket}/${path}`;

describe('needsSigning', () => {
  it("signs David's real supervisor visit photo URL", () => {
    // Verbatim from supervisor_visits on 5 Aug 2026.
    const url =
      'https://klatddoyncxidgqtcjnu.supabase.co/storage/v1/object/public/maintenance-photos/ee3d8081-cec2-47f3-ac23-bdc0bb2d142d/visits/site/534cd273-d2fa-4973-a31b-78415150b454.jpg';
    expect(needsSigning(url)).toBe(true);
  });

  it('signs every bucket that is private in production', () => {
    // Checked against storage.buckets WHERE public = false (Aug 2026), limited
    // to the ones that hold DISPLAYED images. Documents are signed server-side.
    for (const bucket of [
      'job-photos',
      'scope-photos',
      'jobsite-area-docs',
      'maintenance-photos',
      'timecard-photos',
      'blade-checkout-photos',
      'review-photos',
    ]) {
      expect(PRIVATE_DISPLAY_BUCKETS.has(bucket)).toBe(true);
      expect(needsSigning(publicUrl(bucket))).toBe(true);
    }
  });

  it('leaves genuinely public buckets alone', () => {
    for (const bucket of ['avatars', 'branding', 'demo-images']) {
      expect(needsSigning(publicUrl(bucket))).toBe(false);
    }
  });

  it('ignores anything that is not a storage public URL', () => {
    expect(needsSigning('https://example.com/photo.jpg')).toBe(false);
    expect(needsSigning('')).toBe(false);
    expect(
      // Already signed — must not be re-signed.
      needsSigning(
        'https://klatddoyncxidgqtcjnu.supabase.co/storage/v1/object/sign/job-photos/a.jpg?token=x'
      )
    ).toBe(false);
  });
});
