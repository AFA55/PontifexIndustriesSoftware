export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/sign-urls — admin/staff (requireScheduleBoardAccess)
 * Takes an array of stored storage URLs and returns signed URLs for any that
 * point at a private bucket (job-photos, completion-pdfs, contracts, etc.), so
 * the client can display/download them. Public URLs pass through unchanged.
 *
 * Body: { urls: (string|null)[] }  →  { signed: (string|null)[] } (same order)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSalesStaff } from '@/lib/api-auth';
import { signStoredUrl } from '@/lib/storage-url-server';

export async function POST(request: NextRequest) {
  try {
    // Admin-only — it can mint signed URLs for contracts/completion PDFs.
    // READ-ONLY, widened to match the page that calls it.
    // Its OWN docstring already said requireScheduleBoardAccess — the code said
    // requireAdmin. A salesman opening Completed Jobs got 403 here, the client
    // fell back to raw /object/public/ URLs, and those 404 on private buckets:
    // every photo, completion PDF, signature and contract rendered broken.
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json().catch(() => ({}));
    const urls = Array.isArray(body?.urls) ? body.urls : [];
    // Cap to avoid abuse; sign each (nulls/publics pass through).
    const capped = urls.slice(0, 100);
    const signed = await Promise.all(capped.map((u: unknown) => signStoredUrl(typeof u === 'string' ? u : null)));

    return NextResponse.json({ success: true, signed });
  } catch (error) {
    console.error('Error in POST /api/admin/sign-urls:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
