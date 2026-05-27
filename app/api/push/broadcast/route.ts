export const dynamic = 'force-dynamic';

/**
 * POST /api/push/broadcast
 *
 * Send a push notification to all users in the admin's tenant.
 * Optionally filter by role(s).
 *
 * Device tokens come from the `push_tokens` table (platform = 'ios').
 * Sends in parallel via Promise.allSettled — individual failures don't abort
 * the batch. Returns { success: true, sent: N, failed: M }.
 *
 * Body:
 *   title:   string  (required)
 *   body:    string  (required)
 *   roles?:  string[] — filter recipients by role (e.g. ['operator','apprentice'])
 *   data?:   object  — extra payload merged into the APNs body
 *
 * Auth: admin / operations_manager / super_admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { sendPushNotification } from '@/lib/apns';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  let body: {
    title?: unknown;
    body?: unknown;
    roles?: unknown;
    data?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, body: messageBody, roles, data } = body;

  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (typeof messageBody !== 'string' || !messageBody.trim()) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  if (roles !== undefined && !Array.isArray(roles)) {
    return NextResponse.json({ error: 'roles must be an array of strings' }, { status: 400 });
  }
  if (data !== undefined && (typeof data !== 'object' || Array.isArray(data) || data === null)) {
    return NextResponse.json({ error: 'data must be a plain object' }, { status: 400 });
  }

  const tenantId = auth.tenantId;

  // ── 1. Find iOS push tokens for users in this tenant ─────────────────────
  // push_tokens is keyed on user_id; join profiles for the role filter.
  // We select user_id from profiles matching tenant + optional roles,
  // then pull all ios tokens for those users.

  let profileQuery = supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('tenant_id', tenantId as string);

  if (Array.isArray(roles) && roles.length > 0) {
    const validRoles = (roles as unknown[]).filter((r) => typeof r === 'string') as string[];
    profileQuery = profileQuery.in('role', validRoles);
  }

  const { data: profiles, error: profilesError } = await profileQuery;
  if (profilesError) {
    console.error('[push/broadcast] profiles query error:', profilesError);
    return NextResponse.json({ error: 'Failed to look up recipients' }, { status: 500 });
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ success: true, sent: 0, failed: 0 });
  }

  const userIds = profiles.map((p) => p.id);

  const { data: tokens, error: tokensError } = await supabaseAdmin
    .from('push_tokens')
    .select('token, user_id')
    .in('user_id', userIds)
    .eq('platform', 'ios');

  if (tokensError) {
    console.error('[push/broadcast] push_tokens query error:', tokensError);
    return NextResponse.json({ error: 'Failed to look up device tokens' }, { status: 500 });
  }

  if (!tokens || tokens.length === 0) {
    return NextResponse.json({ success: true, sent: 0, failed: 0 });
  }

  // ── 2. Fan-out — fire all sends in parallel ───────────────────────────────
  const results = await Promise.allSettled(
    tokens.map(({ token }) =>
      sendPushNotification(token, {
        title: (title as string).trim(),
        body: (messageBody as string).trim(),
        data: data as Record<string, unknown> | undefined,
      })
    )
  );

  let sent = 0;
  let failed = 0;

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.success) {
      sent++;
    } else {
      failed++;
    }
  }

  // Fire-and-forget audit log
  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      action: 'push_broadcast',
      actor_id: auth.userId,
      resource_type: 'push_notification',
      resource_id: null,
      details: {
        title,
        roles: roles ?? 'all',
        total_tokens: tokens.length,
        sent,
        failed,
        tenant_id: tenantId,
      },
    })
  ).then(() => {}).catch(() => {});

  return NextResponse.json({ success: true, sent, failed });
}
