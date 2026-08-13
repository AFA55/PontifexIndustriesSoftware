export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/jobs/[id]/documents
 *
 * Every signed document belonging to a job, with a URL that actually opens.
 *
 * FOUNDER (Aug 12): "in office documents in active jobs I would like to see the
 * PDFs of the signed waivers and job completion tickets — I haven't seen any of
 * that yet."
 *
 * He was right, and for two different reasons:
 *
 * 1. THE COMPLETION PDFs EXIST BUT THE LINKS ARE DEAD. Seven jobs carry a
 *    `completion_pdf_url` and the `completion-pdfs` bucket holds 12 files — but
 *    the bucket is PRIVATE and the generator saved `getPublicUrl()`, which only
 *    resolves on a public bucket. Fetching one returns **HTTP 400**. The
 *    documents were being archived correctly and were unreachable the whole
 *    time. We do NOT fix that by making the bucket public — these are
 *    customer-signed records — so this route mints a short-lived SIGNED url
 *    instead, and repairs old rows by path rather than by trusting the URL.
 *
 * 2. THE WAIVER PDF WAS NEVER GENERATED AT ALL. `utility_waiver_signed` is true
 *    on a live job and the signature image is stored, but nothing ever rendered
 *    a document from it — `/api/liability-release/pdf` is only reachable from a
 *    debug component. So the waiver is reported here from the signature we DO
 *    hold, and rendered on demand by the sibling `waiver-pdf` route. Nothing to
 *    backfill: every past job works the moment this ships.
 *
 * Returns: { success: true, data: { documents: [...] } }
 *   documents[]: { kind, title, signed_at, signer_name, url|null, note|null }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { COMPLETION_PDF_BUCKET, completionStoragePath } from '@/lib/completion-pdf-path';

type RouteContext = { params: Promise<{ id: string }> };

/** Signed links are short-lived on purpose — they are customer records. */
const SIGNED_URL_TTL_SECONDS = 60 * 30;

export interface JobDocument {
  kind: 'completion' | 'waiver' | 'liability_release';
  title: string;
  signed_at: string | null;
  signer_name: string | null;
  /** A URL that opens. Null when we hold a signature but no renderable file. */
  url: string | null;
  /** Why there is no url, in words the office can act on. */
  note: string | null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // READ-ONLY, so the guard matches who the PAGE already admits.
    // The job-detail page lets salesman + supervisor in, but every endpoint it
    // calls used requireAdmin (admin | super_admin | operations_manager) — so
    // Adam Ingalls (salesman, and the project manager on the job) opened his
    // own J. Davis job and got "Failed to load job details. HTTP 403". The UI
    // said yes and the API said no, which reads as the app being broken rather
    // than as a permission. Same shape as the approve-button bug.
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    let q = supabaseAdmin
      .from('job_orders')
      .select(
        `id, job_number, tenant_id,
         completion_pdf_url, completion_signed_at, completion_signer_name,
         completion_signature, customer_signature, customer_signed_at,
         require_waiver_signature, utility_waiver_signed, utility_waiver_signed_at,
         utility_waiver_signer_name, utility_waiver_signature_data,
         liability_release_signature, liability_release_signed_at`
      )
      .eq('id', jobId);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data: job, error } = await q.maybeSingle();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const documents: JobDocument[] = [];

    // ── Completion sign-off ────────────────────────────────────────────────
    const path = completionStoragePath(job.completion_pdf_url as string | null);
    if (path) {
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from(COMPLETION_PDF_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

      documents.push({
        kind: 'completion',
        title: 'Work completion sign-off',
        signed_at: (job.completion_signed_at as string) ?? (job.customer_signed_at as string) ?? null,
        signer_name: (job.completion_signer_name as string) ?? null,
        url: signed?.signedUrl ?? null,
        // A missing object is worth saying out loud: the row claims a PDF that
        // storage does not have, which is a real archival gap, not a UI glitch.
        note: signed?.signedUrl
          ? null
          : `The archived file could not be opened (${signErr?.message ?? 'not found in storage'}).`,
      });
    } else if (job.completion_signature || job.customer_signature) {
      // Signed, but no PDF was archived. Reported WITHOUT a link rather than
      // pointing at a render route: every one of the 7 signed jobs in
      // production does have an archived file, so this branch is empty today,
      // and a link to a route built for a case that never happens is a 404
      // waiting for someone to click it. If real jobs start landing here, that
      // is the signal to add the on-demand renderer (the waiver one next door
      // is the pattern).
      documents.push({
        kind: 'completion',
        title: 'Work completion sign-off',
        signed_at: (job.completion_signed_at as string) ?? (job.customer_signed_at as string) ?? null,
        signer_name: (job.completion_signer_name as string) ?? null,
        url: null,
        note: 'Signed, but no PDF was archived at the time.',
      });
    }

    // ── Utility / liability waiver ─────────────────────────────────────────
    if (job.utility_waiver_signed || job.utility_waiver_signature_data) {
      documents.push({
        kind: 'waiver',
        title: 'Utility damage waiver',
        signed_at: (job.utility_waiver_signed_at as string) ?? null,
        signer_name: (job.utility_waiver_signer_name as string) ?? null,
        url: `/api/admin/jobs/${jobId}/waiver-pdf`,
        note: null,
      });
    } else if (job.require_waiver_signature) {
      documents.push({
        kind: 'waiver',
        title: 'Utility damage waiver',
        signed_at: null,
        signer_name: null,
        url: null,
        note: 'Required for this job and not signed yet.',
      });
    }

    if (job.liability_release_signature) {
      documents.push({
        kind: 'liability_release',
        title: 'Liability release',
        signed_at: (job.liability_release_signed_at as string) ?? null,
        signer_name: null,
        url: `/api/admin/jobs/${jobId}/waiver-pdf?kind=liability`,
        note: null,
      });
    }

    return NextResponse.json({ success: true, data: { documents } });
  } catch (e: any) {
    console.error('[job-documents] error', e);
    return NextResponse.json({ error: 'Failed to load job documents' }, { status: 500 });
  }
}
