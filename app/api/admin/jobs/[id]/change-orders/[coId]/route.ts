export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/jobs/[id]/change-orders/[coId]
 * Approve, reject, or delete a specific change order.
 *
 * PATCH  — approve or reject the change order (admin)
 * DELETE — delete a pending change order (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string; coId: string }> };

// ─── PATCH ───────────────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId, coId } = await context.params;
    const tenantId = auth.tenantId;
    const body = await request.json();
    const { action, rejection_reason } = body;

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Fetch the change order to verify it exists and belongs to this job/tenant
    const { data: changeOrder, error: fetchError } = await supabaseAdmin
      .from('job_scope_additions')
      .select('*')
      .eq('id', coId)
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !changeOrder) {
      return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    }

    if (changeOrder.status !== 'pending') {
      return NextResponse.json(
        { error: `Change order is already ${changeOrder.status}` },
        { status: 409 }
      );
    }

    // ── APPROVE ────────────────────────────────────────────────────────────
    if (action === 'approve') {
      const now = new Date().toISOString();

      // Update the change order status
      const { data: updatedCO, error: updateError } = await supabaseAdmin
        .from('job_scope_additions')
        .update({
          status: 'approved',
          approved_by: auth.userId,
          approved_at: now,
          updated_at: now,
        })
        .eq('id', coId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (updateError) {
        console.error('Error approving change order:', updateError);
        return NextResponse.json({ error: 'Failed to approve change order' }, { status: 500 });
      }

      // Insert additional work items into job_scope_items
      const workItems: Array<{
        work_type: string;
        description?: string;
        quantity?: number;
        unit?: string;
      }> = Array.isArray(changeOrder.additional_work_items)
        ? changeOrder.additional_work_items
        : [];

      if (workItems.length > 0) {
        // Determine current max sort_order for this job
        const { data: maxSortRow } = await supabaseAdmin
          .from('job_scope_items')
          .select('sort_order')
          .eq('job_order_id', jobId)
          .eq('tenant_id', tenantId)
          .order('sort_order', { ascending: false })
          .limit(1)
          .single();

        const baseSortOrder = maxSortRow ? (maxSortRow.sort_order ?? 0) + 1 : 0;

        const itemsToInsert = workItems.map((item, idx) => ({
          job_order_id: jobId,
          tenant_id: tenantId,
          work_type: item.work_type,
          description: item.description ?? null,
          unit: item.unit ?? 'linear_ft',
          target_quantity: item.quantity != null ? Number(item.quantity) : 0,
          sort_order: baseSortOrder + idx,
          added_by: auth.userId,
          added_at: now,
        }));

        const { error: itemsError } = await supabaseAdmin
          .from('job_scope_items')
          .insert(itemsToInsert);

        if (itemsError) {
          console.error('Error inserting scope items from change order:', itemsError);
          // Non-fatal — change order is already approved; log but continue
        }
      }

      // Update job estimated_cost if additional_cost > 0
      if (Number(changeOrder.additional_cost) > 0) {
        const { error: costError } = await supabaseAdmin.rpc('increment_job_estimated_cost', {
          p_job_id: jobId,
          p_amount: Number(changeOrder.additional_cost),
        });

        if (costError) {
          // Fallback: manual fetch + update if RPC doesn't exist
          const { data: jobRow } = await supabaseAdmin
            .from('job_orders')
            .select('estimated_cost')
            .eq('id', jobId)
            .eq('tenant_id', tenantId)
            .single();

          if (jobRow) {
            const newCost = Number(jobRow.estimated_cost ?? 0) + Number(changeOrder.additional_cost);
            await supabaseAdmin
              .from('job_orders')
              .update({ estimated_cost: newCost, updated_at: now })
              .eq('id', jobId)
              .eq('tenant_id', tenantId);
          }
        }
      }

      // Fire-and-forget: notify assigned operator
      Promise.resolve(
        (async () => {
          const { data: jobRow } = await supabaseAdmin
            .from('job_orders')
            .select('assigned_to')
            .eq('id', jobId)
            .eq('tenant_id', tenantId)
            .single();

          if (jobRow?.assigned_to) {
            await supabaseAdmin.from('notifications').insert({
              tenant_id: tenantId,
              user_id: jobRow.assigned_to,
              type: 'scope_update',
              title: 'Scope Updated',
              message: 'New scope has been added to your job. Check the details.',
              job_order_id: jobId,
              read: false,
              created_at: now,
            });
          }
        })()
      ).catch(() => {});

      // Fire-and-forget audit log
      Promise.resolve(
        supabaseAdmin.from('job_orders_history').insert({
          job_order_id: jobId,
          changed_by: auth.userId,
          changed_by_name: auth.userEmail,
          changed_by_role: auth.role,
          change_type: 'change_order_approved',
          changes: {
            change_order_id: coId,
            additional_cost: changeOrder.additional_cost,
            items_added: workItems.length,
          },
        })
      ).catch(() => {});

      return NextResponse.json({ success: true, data: updatedCO });
    }

    // ── REJECT ─────────────────────────────────────────────────────────────
    const now = new Date().toISOString();
    const existingNotes = changeOrder.notes ?? '';
    const updatedNotes = rejection_reason
      ? existingNotes
        ? `${existingNotes}\nRejection reason: ${rejection_reason}`
        : `Rejection reason: ${rejection_reason}`
      : existingNotes;

    const { data: rejectedCO, error: rejectError } = await supabaseAdmin
      .from('job_scope_additions')
      .update({
        status: 'rejected',
        notes: updatedNotes,
        updated_at: now,
      })
      .eq('id', coId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (rejectError) {
      console.error('Error rejecting change order:', rejectError);
      return NextResponse.json({ error: 'Failed to reject change order' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('job_orders_history').insert({
        job_order_id: jobId,
        changed_by: auth.userId,
        changed_by_name: auth.userEmail,
        changed_by_role: auth.role,
        change_type: 'change_order_rejected',
        changes: {
          change_order_id: coId,
          rejection_reason: rejection_reason ?? null,
        },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data: rejectedCO });
  } catch (error: unknown) {
    console.error('Unexpected error in PATCH /change-orders/[coId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId, coId } = await context.params;
    const tenantId = auth.tenantId;

    // Verify the change order is pending before allowing delete
    const { data: changeOrder, error: fetchError } = await supabaseAdmin
      .from('job_scope_additions')
      .select('id, status')
      .eq('id', coId)
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !changeOrder) {
      return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    }

    if (changeOrder.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending change orders can be deleted' },
        { status: 409 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from('job_scope_additions')
      .delete()
      .eq('id', coId)
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId);

    if (deleteError) {
      console.error('Error deleting change order:', deleteError);
      return NextResponse.json({ error: 'Failed to delete change order' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { deleted: coId } });
  } catch (error: unknown) {
    console.error('Unexpected error in DELETE /change-orders/[coId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
