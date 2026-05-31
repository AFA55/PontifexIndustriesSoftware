export const dynamic = 'force-dynamic';

/**
 * POST /api/maintenance-requests
 * Operator-side: submit a new maintenance request.
 * Auth: any authenticated user with a valid tenant (requireAuth).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { sendPushToUser } from '@/lib/send-push';

const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
type Priority = typeof VALID_PRIORITIES[number];

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const description: string = (body.description ?? '').trim();
  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }

  const priority: Priority = VALID_PRIORITIES.includes(body.priority) ? body.priority : 'medium';

  const insert: Record<string, unknown> = {
    tenant_id: auth.tenantId,
    submitted_by: auth.userId,
    description,
    priority,
    request_type: body.request_type === 'replace' ? 'replace' : 'repair',
    status: 'open',
    equipment_id: body.equipment_id ?? null,
    equipment_name: (body.equipment_name ?? '').trim() || null,
    photo_urls: Array.isArray(body.photo_urls) ? body.photo_urls.filter((u: unknown) => typeof u === 'string') : [],
  };

  const { data, error } = await supabaseAdmin
    .from('maintenance_requests')
    .insert(insert)
    .select('id, status')
    .single();

  if (error) {
    console.error('maintenance-requests POST error:', error);
    return NextResponse.json({ error: 'Failed to submit request', details: error.message }, { status: 500 });
  }

  // Fire-and-forget: notify shop_managers + admins in tenant
  Promise.resolve((async () => {
    const { data: submitter } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    const submitterName = submitter?.full_name ?? auth.userEmail ?? 'Someone';
    const truncDesc = description.length > 60 ? description.slice(0, 57) + '...' : description;
    const title = 'New Maintenance Request';
    const message = `${submitterName} filed a ${priority} issue: ${truncDesc}`;

    const { data: managers } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('tenant_id', auth.tenantId)
      .in('role', ['shop_manager', 'admin', 'super_admin', 'operations_manager']);

    if (managers && managers.length > 0) {
      const notifRows = managers.map((m: { id: string }) => ({
        user_id: m.id,
        tenant_id: auth.tenantId,
        type: 'info',
        title,
        message,
        notification_type: 'maintenance_request',
        related_entity_type: 'maintenance_request',
        related_entity_id: data.id,
        action_url: '/dashboard/admin/maintenance',
      }));
      await supabaseAdmin.from('notifications').insert(notifRows);

      // Parallel native push to each notified manager — fire-and-forget.
      for (const m of managers as { id: string }[]) {
        sendPushToUser(m.id, {
          title,
          body: message,
          data: { route: '/dashboard/admin/maintenance' },
        }).catch(() => {});
      }
    }
  })()).catch(() => {});

  return NextResponse.json({ success: true, data: { id: data.id, status: 'open' } }, { status: 201 });
}
