import { completionStoragePath } from './completion-pdf-path';

describe('completionStoragePath', () => {
  // The exact shape sitting on all 7 signed jobs in production: a public-style
  // URL against a PRIVATE bucket, which returns HTTP 400 when opened.
  it('recovers the object path from the broken public URL we saved', () => {
    const saved =
      'https://klatddoyncxidgqtcjnu.supabase.co/storage/v1/object/public/completion-pdfs/' +
      'ee3d8081-cec2-47f3-ac23-bdc0bb2d142d/7dc77ea1-c63e-41a7-be58-5f8697ed0811/completion-1786460675363.pdf';
    expect(completionStoragePath(saved)).toBe(
      'ee3d8081-cec2-47f3-ac23-bdc0bb2d142d/7dc77ea1-c63e-41a7-be58-5f8697ed0811/completion-1786460675363.pdf'
    );
  });

  it('also handles an already-signed URL (query string stays out of the path)', () => {
    const signed =
      'https://x.supabase.co/storage/v1/object/sign/completion-pdfs/t/j/completion-1.pdf?token=abc';
    expect(completionStoragePath(signed)).toBe('t/j/completion-1.pdf?token=abc');
  });

  it('passes a bare path through, which is what a corrected generator writes', () => {
    expect(completionStoragePath('tenant/job/completion-9.pdf')).toBe('tenant/job/completion-9.pdf');
    expect(completionStoragePath('/tenant/job/completion-9.pdf')).toBe('tenant/job/completion-9.pdf');
  });

  it('decodes percent-encoding so a signed path matches the stored object', () => {
    expect(completionStoragePath('/completion-pdfs/t/j/completion%20final.pdf')).toBe(
      't/j/completion final.pdf'
    );
  });

  it('refuses a URL on some other host — there is nothing for us to sign', () => {
    expect(completionStoragePath('https://example.com/some/other/file.pdf')).toBeNull();
  });

  it('is null-safe', () => {
    expect(completionStoragePath(null)).toBeNull();
    expect(completionStoragePath(undefined)).toBeNull();
    expect(completionStoragePath('')).toBeNull();
  });
});
