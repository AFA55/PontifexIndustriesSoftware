/**
 * The customer-facing render contract for the completion thank-you.
 *
 * The bug this guards: the template rendered `<Img src={storedUrl}>` where the
 * stored URL is a `/storage/v1/object/public/job-photos/…` path against a
 * PRIVATE bucket. It answered 400 "Bucket not found", so every completion email
 * showed grey boxes — and nothing threw, nothing logged, no test failed. These
 * assertions are the missing alarm: the photo `src` must be a `cid:` reference
 * into an inline attachment, and a storage URL must never appear in the markup.
 */
import { renderCompletionThankYouEmail } from './renderers';

const BRANDING = {
  companyName: 'Patriot Concrete Cutting',
  brandColor: '#dc2626',
  accentColor: '#1e3a5f',
  logoUrl: null,
};

const cid = (n: number) => `cid:jobphoto${n}@pontifexindustries.com`;

const render = (referencePhotos: string[]) =>
  renderCompletionThankYouEmail({
    branding: BRANDING,
    variant: 'completion',
    jobNumber: 'JOB-2026-000123',
    customerName: 'Acme Builders',
    referencePhotos,
  });

describe('CompletionThankYouEmail — site photos', () => {
  it('renders each photo as a cid: reference, not a URL', async () => {
    const html = await render([cid(1), cid(2)]);
    expect(html).toContain(`src="${cid(1)}"`);
    expect(html).toContain(`src="${cid(2)}"`);
  });

  it('never emits a Supabase storage URL for a photo', async () => {
    const html = await render([cid(1)]);
    expect(html).not.toContain('/storage/v1/object/public/');
    expect(html).not.toContain('/storage/v1/object/sign/');
  });

  it('keeps the six-photo cap, and keeps the FIRST six', async () => {
    // The caller orders the completed-cut photo first precisely so the cap can
    // never truncate the thing the email exists to show.
    const html = await render(Array.from({ length: 9 }, (_, i) => cid(i + 1)));
    for (const n of [1, 2, 3, 4, 5, 6]) expect(html).toContain(`src="${cid(n)}"`);
    for (const n of [7, 8, 9]) expect(html).not.toContain(`src="${cid(n)}"`);
  });

  it('omits the photo section entirely when nothing resolved', async () => {
    // A job whose photos all failed to attach still gets a thank-you — with no
    // empty "Site photos" heading over a blank row.
    const html = await render([]);
    expect(html).not.toContain('Site photos');
    expect(html).toContain('Acme Builders');
  });

  it('still renders the rest of the email when only some photos attached', async () => {
    const html = await render([cid(1)]);
    expect(html).toContain('Site photos');
    expect(html).toContain('JOB-2026-000123');
  });
});
