/**
 * Recover a `completion-pdfs` storage path from whatever got persisted on the
 * job row.
 *
 * WHY THIS EXISTS: `generate-completion-pdf` uploads to the PRIVATE
 * `completion-pdfs` bucket but saved `getPublicUrl()`, which only resolves on a
 * public bucket. Every archived completion PDF in production therefore has a
 * link that returns HTTP 400. The files are fine; the URL shape is wrong.
 *
 * Rather than migrate seven rows and hope no eighth arrives, the read path
 * recovers the object path and signs it at request time. That repairs old rows,
 * new rows, and anything written while the generator still saves a public URL.
 *
 * Lives in lib/ and not beside the route because a Next.js route file may only
 * export handlers and route config — exporting a helper from one fails the
 * build with a type error about the index signature.
 */

export const COMPLETION_PDF_BUCKET = 'completion-pdfs';

/**
 * @returns the object path inside the bucket, or null when the value points at
 *          some other host (nothing we can sign).
 */
export function completionStoragePath(saved: string | null | undefined): string | null {
  if (!saved) return null;
  const marker = `/${COMPLETION_PDF_BUCKET}/`;
  const at = saved.indexOf(marker);
  if (at >= 0) return decodeURIComponent(saved.slice(at + marker.length));
  // Already a bare path (what a corrected generator would write).
  if (saved.startsWith('http')) return null;
  return saved.replace(/^\/+/, '');
}
