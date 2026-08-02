export const dynamic = 'force-dynamic';
// The response returns in <2s; the budget is for the after() auto-analysis
// agent (Sonnet, up to 6 tool steps ≈ 20-90s). Without this, Vercel's 25s
// default killed the analysis mid-run (Jul 21 E2E: "Task timed out after 25s").
export const maxDuration = 120;

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

import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { sendNotification } from '@/lib/send-reminder';

// 'message' = the open "Message Management" channel (operators can tell the
// office anything — not just bugs/ideas).
const VALID_TYPES = ['bug', 'change_request', 'idea', 'message'] as const;
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
    .select('tenant_id, role, full_name')
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

  // ── Post-response: AUTO AI analysis (Rock-Solid batch 3 — founder:
  // submit -> agent analyzes -> founder just approves in the Hub). Runs the
  // same tenant-scoped ticket-analysis agent the Hub's manual button uses;
  // a failure leaves ai_analysis null and the Hub button remains a retry.
  // after() (not bare fire-and-forget) — Vercel freezes the function once the
  // response returns, killing pending promises; after() keeps it alive.
  // (Jul 21 E2E: bare promise version never completed on prod.)
  after(async () => {
    try {
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
    } catch (err: any) {
      console.warn('[feedback] auto-analysis failed (Hub can retry):', err?.message);
    }
  });

  // ── Post-response: notify tenant admins/ops (best-effort) ───────────────
  // Goes through sendNotification() so each manager's push/email preferences
  // are honored (the old raw insert was bell-only). The FULL text lives in
  // feedback_submissions; non-message types notify with a ~140-char preview,
  // 'message' notifies with the full text (see below).
  after(async () => {
    try {
      const PREVIEW_MAX = 140;
      const reporterName = profile.full_name || profile.role || 'A team member';
      const isMessage = type === 'message';
      // 'message' carries the FULL text: the settings/feedback page a manager
      // lands on lists only their OWN submissions, so the notification body is
      // the only place a tenant admin can read the operator's words. The inbox
      // renders full messages; sendPushToUser caps its own payload at ~1500.
      const preview = isMessage
        ? text
        : text.length > PREVIEW_MAX ? text.slice(0, PREVIEW_MAX - 1) + '…' : text;
      const typeLabel =
        type === 'bug' ? 'a bug'
        : type === 'change_request' ? 'a change request'
        : type === 'idea' ? 'an idea'
        : 'a message';
      const notifTitle = isMessage
        ? `💬 New message from ${reporterName}`
        : 'New Feedback Submitted';
      const message = isMessage
        ? (title ? `${title} — ${preview}` : preview)
        : `${reporterName} reported ${typeLabel}: ${title ? `${title} — ${preview}` : preview}`;

      const { data: managers } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('tenant_id', insert.tenant_id)
        .in('role', ['admin', 'super_admin', 'operations_manager']);

      if (managers && managers.length > 0) {
        await Promise.allSettled(
          managers.map((m: { id: string }) =>
            sendNotification({
              userId: m.id,
              tenantId: insert.tenant_id,
              category: 'general',
              title: notifTitle,
              message,
              inAppType: 'info',
              notificationType: 'feedback',
              relatedEntityType: 'feedback_submission',
              relatedEntityId: data.id,
              // Tenant admin inbox — /dashboard/platform/feedback is
              // super-admin-only and bounced tenant admins.
              actionUrl: '/dashboard/admin/settings/feedback',
            })
          )
        );
      }
    } catch {
      /* best-effort */
    }
  });

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
