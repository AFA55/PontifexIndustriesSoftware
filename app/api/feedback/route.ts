export const dynamic = 'force-dynamic';

/**
 * Feedback API — reporter side (operators / helpers / anyone authenticated).
 *
 * POST  /api/feedback  — submit a new feedback item ("Report an issue /
 *                        suggest a change"). Any authenticated role.
 * GET   /api/feedback  — list the CALLER'S OWN submissions (for the
 *                        confirmation list on the submit page).
 *
 * Tenant + reporter identity are resolved server-side from the caller's
 * profile via supabaseAdmin — never trusted from the client body. RLS on
 * feedback_submissions still scopes reporter reads to their own rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const VALID_TYPES = ['bug', 'change_request', 'idea'] as const;
type FeedbackType = (typeof VALID_TYPES)[number];

const MAX_TITLE = 200;
const MAX_BODY = 5000;
const MAX_URL = 1000;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── Validate type ───────────────────────────────────────────────────────
  const type: string = (body.type ?? '').toString();
  if (!VALID_TYPES.includes(type as FeedbackType)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  // ── Validate body (required, non-empty) ─────────────────────────────────
  const text: string = (body.body ?? '').toString().trim();
  if (!text) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }

  const title: string | null =
    (body.title ?? '').toString().trim().slice(0, MAX_TITLE) || null;
  const pageUrl: string | null =
    (body.page_url ?? '').toString().trim().slice(0, MAX_URL) || null;

  // ── Resolve reporter tenant + role from THEIR profile (never client) ────
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', auth.userId)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json(
      { error: 'Could not resolve reporter profile' },
      { status: 403 }
    );
  }

  const insert = {
    tenant_id: profile.tenant_id ?? auth.tenantId,
    reporter_id: auth.userId,
    reporter_role: profile.role ?? auth.role,
    type: type as FeedbackType,
    title,
    body: text.slice(0, MAX_BODY),
    page_url: pageUrl,
    status: 'open' as const,
  };

  const { data, error } = await supabaseAdmin
    .from('feedback_submissions')
    .insert(insert)
    .select('id')
    .single();

  if (error) {
    console.error('feedback POST error:', error);
    return NextResponse.json(
      { error: 'Failed to submit feedback', details: error.message },
      { status: 500 }
    );
  }

  // ── Fire-and-forget: AUTO AI analysis (Rock-Solid batch 3 — founder:
  // submit -> agent analyzes -> founder just approves in the Hub). Runs the
  // same tenant-scoped ticket-analysis agent the Hub's manual button uses;
  // a failure leaves ai_analysis null and the Hub button remains a retry.
  Promise.resolve(
    (async () => {
      if (!insert.tenant_id) return;
      const { createTicketAnalysisAgent } = await import('@/lib/agents/ticket-analysis-agent');
      const agent = createTicketAnalysisAgent(insert.tenant_id);
      const result = await agent.generate({
        prompt: `Investigate this ticket and produce your diagnosis.\n\nTicket type: ${insert.type}\nTitle: ${insert.title ?? '(none)'}\nReported by role: ${insert.reporter_role ?? 'unknown'}\nPage URL: ${insert.page_url ?? 'unknown'}\n\nBody:\n${insert.body}`,
      });
      await supabaseAdmin
        .from('feedback_submissions')
        .update({ ai_analysis: result.output, ai_analyzed_at: new Date().toISOString() })
        .eq('id', data.id);
    })()
  ).catch((err) => console.warn('[feedback] auto-analysis failed (Hub can retry):', err?.message));

  // ── Fire-and-forget: notify tenant admins/ops (best-effort, optional) ───
  Promise.resolve(
    (async () => {
      const truncated = text.length > 60 ? text.slice(0, 57) + '...' : text;
      const typeLabel =
        type === 'bug' ? 'a bug' : type === 'change_request' ? 'a change request' : 'an idea';
      const notifTitle = 'New Feedback Submitted';
      const message = `${profile.role ?? 'A user'} reported ${typeLabel}: ${title || truncated}`;

      const { data: managers } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('tenant_id', insert.tenant_id)
        .in('role', ['admin', 'super_admin', 'operations_manager']);

      if (managers && managers.length > 0) {
        const rows = managers.map((m: { id: string }) => ({
          user_id: m.id,
          tenant_id: insert.tenant_id,
          type: 'info',
          title: notifTitle,
          message,
          notification_type: 'feedback',
          related_entity_type: 'feedback_submission',
          related_entity_id: data.id,
          action_url: '/dashboard/platform/feedback',
        }));
        await supabaseAdmin.from('notifications').insert(rows);
      }
    })()
  ).catch(() => {});

  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}

/**
 * GET /api/feedback — return the CALLER'S OWN submissions, newest first.
 * Used by the submit page to show "your past submissions".
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const { data, error } = await supabaseAdmin
    .from('feedback_submissions')
    .select('id, type, title, body, status, admin_response, page_url, created_at')
    .eq('reporter_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('feedback GET (own) error:', error);
    return NextResponse.json(
      { error: 'Failed to load your feedback', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}
