export const dynamic = 'force-dynamic';

/**
 * POST /api/job-orders/[id]/comments/reply
 *
 * Insert a STAFF reply into the customer-comments thread for a job (Feature A:
 * 2-way comms). Body: `{ body: string }` (1..2000 chars).
 *
 * Auth: `requireScheduleBoardAccess` (admin / super_admin / operations_manager /
 * salesman) — same staff-side authz the GET thread route uses.
 *
 * Tenant scoping enforced IN CODE (supabaseAdmin bypasses RLS): the job is
 * verified to belong to the caller's tenant first (404 otherwise). The insert
 * sets author_kind='staff', author_user_id = caller, tenant_id = caller tenant.
 *
 * After insert, fire-and-forget: notify the CUSTOMER of the reply IF the job
 * has a customer_email — white-label email + portal magic-link. Never blocks the
 * response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import {
  sendEmail,
  getTenantEmailBranding,
  generateNotificationEmail,
  escapeHtml,
} from '@/lib/email';
import { getOrCreatePortalTokenForJob, buildPortalUrl } from '@/lib/portal-tokens';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { id: jobOrderId } = await params;

    const payload = await request.json().catch(() => null);
    const rawBody = typeof payload?.body === 'string' ? payload.body.trim() : '';

    if (rawBody.length < 1 || rawBody.length > 2000) {
      return NextResponse.json(
        { error: 'Comment body must be between 1 and 2000 characters' },
        { status: 400 }
      );
    }

    // Verify the job belongs to the caller's tenant (404 if not / not found).
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, tenant_id, customer_name, customer_email, job_number')
      .eq('id', jobOrderId)
      .maybeSingle();

    if (jobError) {
      console.error('Error loading job for comment reply:', jobError);
      return NextResponse.json({ error: 'Failed to load job' }, { status: 500 });
    }

    if (!job || (auth.tenantId && job.tenant_id !== auth.tenantId)) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Resolve the staff author's display name.
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    const authorName = profile?.full_name || auth.userEmail;

    const { data: comment, error } = await supabaseAdmin
      .from('customer_comments')
      .insert({
        // Use the job's tenant (always set + already verified above) — auth.tenantId is
        // null for super_admin, which would violate the NOT NULL constraint.
        tenant_id: job.tenant_id,
        job_order_id: jobOrderId,
        author_kind: 'staff',
        author_user_id: auth.userId,
        author_name: authorName,
        body: rawBody,
      })
      .select(
        'id, tenant_id, job_order_id, portal_token_id, author_kind, author_user_id, author_name, body, is_hidden, created_at'
      )
      .single();

    if (error) {
      console.error('Error creating staff comment reply:', error);
      return NextResponse.json({ error: 'Failed to create reply' }, { status: 500 });
    }

    // ── Fire-and-forget: notify the customer of the staff reply ───────────────
    // Only when the job has a customer email + a tenant to scope the portal token.
    Promise.resolve((async () => {
      try {
        const tenantId = job.tenant_id || auth.tenantId;
        const customerEmail =
          typeof job.customer_email === 'string' ? job.customer_email.trim() : '';
        if (!tenantId || !customerEmail) return;

        const customerName =
          (typeof job.customer_name === 'string' && job.customer_name.trim()) || 'there';
        const jobNumber =
          typeof job.job_number === 'string' && job.job_number.trim()
            ? job.job_number.trim()
            : null;

        const portalToken = await getOrCreatePortalTokenForJob({
          tenantId,
          jobOrderId,
          customerName,
          customerEmail,
          createdBy: auth.userId,
        });
        if (!portalToken) return;

        const portalUrl = buildPortalUrl(portalToken.token);
        const branding = await getTenantEmailBranding(tenantId);

        // Server-constant subject (no user input) — avoids header injection.
        const subject = `New reply on your job${
          jobNumber ? ` ${jobNumber}` : ''
        } — ${branding.companyName}`;

        // escapeHtml the staff body for the email body (stored raw, escaped on render).
        const message = `${escapeHtml(authorName)} replied${
          jobNumber ? ` regarding ${escapeHtml(jobNumber)}` : ''
        }:<br/><br/>"${escapeHtml(rawBody)}"`;

        const html = await generateNotificationEmail({
          title: 'You have a new reply',
          message,
          actionUrl: portalUrl,
          branding,
        });

        await sendEmail({ to: customerEmail, subject, html });
      } catch (err) {
        // Best-effort — never block the response.
        console.warn('[comments/reply] customer notify failed:', err);
      }
    })()).catch(() => {});

    return NextResponse.json(
      { success: true, message: 'Reply posted', data: comment },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/job-orders/[id]/comments/reply:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
