export const dynamic = 'force-dynamic';

/**
 * Single feedback item — triage actions.
 *
 * PATCH  /api/admin/feedback/[id]  — update status and/or admin_response.
 * DELETE /api/admin/feedback/[id]  — remove a feedback item.
 *
 * Tenant isolation: the target row's tenant_id must equal auth.tenantId
 * unless the caller is super_admin (who may act across all tenants).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

const VALID_STATUSES = ['open', 'in_review', 'planned', 'done', 'declined'];

/** Load the row and enforce tenant scope. Returns the row or a NextResponse. */
async function loadScoped(
  id: string,
  auth: { role: string; tenantId: string | null }
): Promise<{ row: { id: string; tenant_id: string | null } } | { response: NextResponse }> {
  const { data: row, error } = await supabaseAdmin
    .from('feedback_submissions')
    .select('id, tenant_id')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return {
      response: NextResponse.json(
        { error: 'Failed to load feedback item', details: error.message },
        { status: 500 }
      ),
    };
  }
  if (!row) {
    return { response: NextResponse.json({ error: 'Feedback item not found' }, { status: 404 }) };
  }
  if (auth.role !== 'super_admin' && row.tenant_id !== auth.tenantId) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { row };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const scoped = await loadScoped(id, auth);
  if ('response' in scoped) return scoped.response;

  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    update.status = body.status;
  }

  if (body.admin_response !== undefined) {
    update.admin_response = (body.admin_response ?? '').toString().trim() || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: 'Nothing to update — provide status and/or admin_response' },
      { status: 400 }
    );
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('feedback_submissions')
    .update(update)
    .eq('id', id)
    .select('id, status, admin_response, updated_at')
    .single();

  if (error) {
    console.error('admin feedback PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update feedback', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  const scoped = await loadScoped(id, auth);
  if ('response' in scoped) return scoped.response;

  const { error } = await supabaseAdmin
    .from('feedback_submissions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('admin feedback DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete feedback', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
