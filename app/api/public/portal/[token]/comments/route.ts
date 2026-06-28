export const dynamic = 'force-dynamic';

/**
 * API Route: /api/public/portal/[token]/comments
 * PUBLIC — No auth required (customers have NO RLS path; uses the service-role client).
 *
 * POST: customer posts a message on a job they can access via their portal token.
 * GET:  list non-hidden comments for a job the token can access.
 *
 * The token + job authorization gate is copied VERBATIM from
 * app/api/public/portal/[token]/job/[jobId]/route.ts — validate token length,
 * look up the customer_portal_tokens row, check expires_at, then authorize the
 * requested jobId via isPinnedJob || emailMatch || nameMatch, scoping every
 * query by the token's tenant_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  sendEmail,
  generateNotificationEmail,
  getTenantEmailBranding,
  escapeHtml,
} from '@/lib/email';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PortalGateResult =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      portalToken: {
        id: string;
        tenant_id: string;
        customer_name: string | null;
        customer_email: string | null;
        expires_at: string;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jobRow: any;
    };

/**
 * Token + job authorization gate.
 * COPIED VERBATIM from app/api/public/portal/[token]/job/[jobId]/route.ts.
 */
async function authorizeTokenAndJob(
  token: string,
  jobId: string
): Promise<PortalGateResult> {
  if (!token || typeof token !== 'string' || token.length < 16) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid token' }, { status: 400 }) };
  }

  if (!jobId || typeof jobId !== 'string') {
    return { ok: false, response: NextResponse.json({ error: 'Invalid job ID' }, { status: 400 }) };
  }

  // Validate the portal token
  const { data: portalToken, error: tokenError } = await supabaseAdmin
    .from('customer_portal_tokens')
    .select('id, tenant_id, customer_name, customer_email, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (tokenError || !portalToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 }),
    };
  }

  if (new Date(portalToken.expires_at) < new Date()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'expired', message: 'This portal link has expired' },
        { status: 410 }
      ),
    };
  }

  // Fetch the job — must belong to the same tenant
  const { data: job, error: jobError } = await supabaseAdmin
    .from('job_orders')
    .select(
      'id, job_number, customer_name, customer_email, created_by, tenant_id'
    )
    .eq('id', jobId)
    .eq('tenant_id', portalToken.tenant_id)
    .maybeSingle();

  if (jobError || !job) {
    return { ok: false, response: NextResponse.json({ error: 'Job not found' }, { status: 404 }) };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobRow = job as any;

  // Verify this customer can access the job
  // Allow if: customer_email matches token OR customer_name matches token (case-insensitive)
  // OR the token itself was pinned to this job_order_id
  const { data: tokenRow } = await supabaseAdmin
    .from('customer_portal_tokens')
    .select('job_order_id')
    .eq('token', token)
    .maybeSingle();

  const isPinnedJob = tokenRow?.job_order_id === jobId;
  const emailMatch =
    portalToken.customer_email &&
    jobRow.customer_email &&
    portalToken.customer_email.toLowerCase() === jobRow.customer_email.toLowerCase();
  const nameMatch =
    portalToken.customer_name &&
    jobRow.customer_name &&
    portalToken.customer_name.toLowerCase() === (jobRow.customer_name as string).toLowerCase();

  if (!isPinnedJob && !emailMatch && !nameMatch) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Access denied to this job' }, { status: 403 }),
    };
  }

  return { ok: true, portalToken, jobRow };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    let payload: { jobId?: string; body?: string };
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const jobId = payload?.jobId;
    const rawBody = payload?.body;

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    // --- Token + job gate (copied verbatim) ---
    const gate = await authorizeTokenAndJob(token, jobId);
    if (!gate.ok) return gate.response;
    const { portalToken, jobRow } = gate;

    // --- Validate body ---
    if (typeof rawBody !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    const body = rawBody.trim();
    if (body.length === 0) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }
    if (body.length > 2000) {
      return NextResponse.json(
        { error: 'Message is too long (max 2000 characters)' },
        { status: 400 }
      );
    }

    // --- Spam guard: rate-limit by portal_token_id ---
    const now = Date.now();
    const sixtySecAgo = new Date(now - 60 * 1000).toISOString();
    const oneHourAgo = new Date(now - 3600 * 1000).toISOString();

    const { count: lastMinuteCount } = await supabaseAdmin
      .from('customer_comments')
      .select('id', { count: 'exact', head: true })
      .eq('portal_token_id', portalToken.id)
      .gte('created_at', sixtySecAgo);

    if ((lastMinuteCount ?? 0) >= 3) {
      return NextResponse.json(
        { error: 'You are sending messages too quickly. Please wait a moment.' },
        { status: 429 }
      );
    }

    const { count: lastHourCount } = await supabaseAdmin
      .from('customer_comments')
      .select('id', { count: 'exact', head: true })
      .eq('portal_token_id', portalToken.id)
      .gte('created_at', oneHourAgo);

    if ((lastHourCount ?? 0) >= 20) {
      return NextResponse.json(
        { error: 'Message limit reached. Please try again later.' },
        { status: 429 }
      );
    }

    // --- Insert ---
    const createdIp = request.headers.get('x-forwarded-for');
    const authorName = portalToken.customer_name || 'Customer';

    const { data: comment, error: insertError } = await supabaseAdmin
      .from('customer_comments')
      .insert({
        tenant_id: portalToken.tenant_id,
        job_order_id: jobId,
        portal_token_id: portalToken.id,
        author_kind: 'customer',
        author_name: authorName,
        body, // store RAW
        created_ip: createdIp,
      })
      .select('id, author_kind, author_name, body, created_at')
      .single();

    if (insertError || !comment) {
      console.error('Error inserting customer comment:', insertError);
      return NextResponse.json({ error: 'Failed to post message' }, { status: 500 });
    }

    // --- Fire-and-forget notify fan-out (cloned from job-orders/[id]/notes) ---
    Promise.resolve((async () => {
      try {
        const jobNumber = jobRow.job_number ?? jobId;
        const preview = body.length > 80 ? body.substring(0, 80) + '…' : body;
        const title = 'New customer message';
        const message = `${authorName} on ${jobNumber}: "${preview}"`;
        const actionUrl = `/dashboard/admin/jobs/${jobId}`;

        // Recipients: admins/ops/super in the job's tenant, PLUS the job's creator.
        const { data: admins } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .in('role', ['super_admin', 'operations_manager', 'admin'])
          .eq('tenant_id', portalToken.tenant_id);

        const recipientIds = new Set<string>();
        (admins || []).forEach((a: { id: string }) => recipientIds.add(a.id));
        if (jobRow.created_by) recipientIds.add(jobRow.created_by);

        if (recipientIds.size > 0) {
          const ids = Array.from(recipientIds);
          const notifications = ids.map((uid) => ({
            user_id: uid,
            type: 'customer_comment',
            notification_type: 'customer_comment',
            title,
            message,
            action_url: actionUrl,
            job_id: jobId,
            tenant_id: portalToken.tenant_id,
            related_entity_type: 'customer_comment',
            related_entity_id: comment.id,
            read: false,
            is_read: false,
          }));
          await supabaseAdmin.from('notifications').insert(notifications);

          // Best-effort email each recipient.
          try {
            const branding = await getTenantEmailBranding(portalToken.tenant_id);
            const html = await generateNotificationEmail({
              title,
              message: `${escapeHtml(authorName)} left a message on job ${escapeHtml(
                String(jobNumber)
              )}:<br/><br/>"${escapeHtml(body)}"`,
              actionUrl,
              branding,
            });

            const { data: profs } = await supabaseAdmin
              .from('profiles')
              .select('email')
              .in('id', ids);

            await Promise.all(
              (profs || [])
                .filter((p: { email: string | null }) => !!p.email)
                .map((p: { email: string }) =>
                  sendEmail({ to: p.email, subject: title, html }).catch(() => false)
                )
            );
          } catch {
            // Email is best-effort — never block.
          }
        }
      } catch {
        // Non-critical — never block the response.
      }
    })()).catch(() => {});

    // --- Return comment WITHOUT created_ip ---
    return NextResponse.json({
      success: true,
      data: {
        id: comment.id,
        author_kind: comment.author_kind,
        author_name: comment.author_name,
        body: comment.body,
        created_at: comment.created_at,
      },
    });
  } catch (error) {
    console.error('Error in public portal comments POST:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const jobId = request.nextUrl.searchParams.get('jobId') || '';

    // --- Token + job gate (copied verbatim) ---
    const gate = await authorizeTokenAndJob(token, jobId);
    if (!gate.ok) return gate.response;
    const { portalToken } = gate;

    const { data: comments, error } = await supabaseAdmin
      .from('customer_comments')
      .select('id, author_kind, author_name, body, created_at')
      .eq('job_order_id', jobId)
      .eq('tenant_id', portalToken.tenant_id)
      .eq('is_hidden', false)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching customer comments:', error);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: (comments || []).map((c) => ({
        id: c.id,
        author_kind: c.author_kind,
        author_name: c.author_name,
        body: c.body,
        created_at: c.created_at,
      })),
    });
  } catch (error) {
    console.error('Error in public portal comments GET:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
