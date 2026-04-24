export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/jobs/[id]/change-orders/[coId]
 * Update / approve / reject / delete a specific change order.
 *
 * PATCH  — approve/reject/edit (admin/sales staff)
 * DELETE — delete pending CO (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string; coId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId, coId } = await context.params;
    const tenantId = auth.tenantId;
    const body = await request.json();
    const { action } = body as { action?: string };

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (action === 'approve') {
      updates.status = 'approved';
      updates.approved_by = auth.userId;
      updates.approved_at = new Date().toISOString();
      updates.rejected_by = null;
      updates.rejected_at = null;
      updates.rejection_reason = null;
    } else if (action === 'reject') {
      updates.status = 'rejected';
      updates.rejected_by = auth.userId;
      updates.rejected_at = new Date().toISOString();
      updates.rejection_reason = body.rejection_reason || null;
      updates.approved_by = null;
      updates.approved_at = null;
    } else {
      // direct edit
      const editable = [
        'description', 'work_type', 'unit', 'target_quantity',
        'cost_amount', 'price_amount', 'notes', 'status',
      ];
      for (const key of editable) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from('change_orders')
      .update(updates)
      .eq('id', coId)
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating change order:', error);
      return NextResponse.json({ error: 'Failed to update change order' }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    console.error('Unexpected error in PATCH /change-orders/[coId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId, coId } = await context.params;
    const tenantId = auth.tenantId;

    const { error } = await supabaseAdmin
      .from('change_orders')
      .delete()
      .eq('id', coId)
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error deleting change order:', error);
      return NextResponse.json({ error: 'Failed to delete change order' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { deleted: coId } });
  } catch (error: unknown) {
    console.error('Unexpected error in DELETE /change-orders/[coId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
