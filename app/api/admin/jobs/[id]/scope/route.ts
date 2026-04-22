export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/jobs/[id]/scope
 * Manage planned scope items for a job order.
 *
 * GET  — any authenticated user; returns scope items with progress totals
 * POST — admin only; add a new scope item
 * PUT  — admin only; update an existing scope item
 * DELETE — admin only; remove a scope item (?itemId=uuid)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff, requireAuth } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // Fetch scope items
    const { data: scopeItems, error: scopeError } = await supabaseAdmin
      .from('job_scope_items')
      .select('id, work_type, description, unit, target_quantity, sort_order')
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });

    if (scopeError) {
      console.error('Error fetching scope items:', scopeError);
      return NextResponse.json({ error: 'Failed to fetch scope items' }, { status: 500 });
    }

    if (!scopeItems || scopeItems.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          scope_items: [],
          overall_pct: 0,
          total_target: 0,
          total_completed: 0,
        },
      });
    }

    // Fetch progress sums grouped by scope_item_id for this job
    const { data: progressSums, error: progressError } = await supabaseAdmin
      .from('job_progress_entries')
      .select('scope_item_id, quantity_completed')
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId);

    if (progressError) {
      console.error('Error fetching progress sums:', progressError);
      return NextResponse.json({ error: 'Failed to fetch progress data' }, { status: 500 });
    }

    // Aggregate completed quantities per scope item
    const completedByScopeItem: Record<string, number> = {};
    for (const entry of progressSums || []) {
      if (entry.scope_item_id) {
        completedByScopeItem[entry.scope_item_id] =
          (completedByScopeItem[entry.scope_item_id] || 0) + Number(entry.quantity_completed);
      }
    }

    let totalTarget = 0;
    let totalCompleted = 0;

    const enrichedItems = scopeItems.map((item) => {
      const completed = completedByScopeItem[item.id] || 0;
      const target = Number(item.target_quantity);
      const pctComplete = target > 0 ? Math.min(100, (completed / target) * 100) : 0;
      totalTarget += target;
      totalCompleted += completed;
      return {
        id: item.id,
        work_type: item.work_type,
        description: item.description,
        unit: item.unit,
        target_quantity: target,
        completed_quantity: completed,
        pct_complete: parseFloat(pctComplete.toFixed(1)),
        sort_order: item.sort_order,
      };
    });

    const overallPct =
      totalTarget > 0 ? parseFloat(Math.min(100, (totalCompleted / totalTarget) * 100).toFixed(1)) : 0;

    return NextResponse.json({
      success: true,
      data: {
        scope_items: enrichedItems,
        overall_pct: overallPct,
        total_target: totalTarget,
        total_completed: totalCompleted,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /scope:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    const body = await request.json();

    const { work_type, description, unit, target_quantity } = body;

    if (!work_type) {
      return NextResponse.json({ error: 'work_type is required' }, { status: 400 });
    }
    if (target_quantity == null || isNaN(Number(target_quantity))) {
      return NextResponse.json({ error: 'target_quantity must be a number' }, { status: 400 });
    }

    // Get current max sort_order for this job
    const { data: existing } = await supabaseAdmin
      .from('job_scope_items')
      .select('sort_order')
      .eq('job_order_id', jobId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextSortOrder = existing ? (existing.sort_order ?? 0) + 1 : 0;

    const { data: newItem, error } = await supabaseAdmin
      .from('job_scope_items')
      .insert({
        tenant_id: tenantId,
        job_order_id: jobId,
        work_type,
        description: description || null,
        unit: unit || 'linear_ft',
        target_quantity: Number(target_quantity),
        sort_order: nextSortOrder,
        added_by: auth.userId,
        added_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating scope item:', error);
      return NextResponse.json({ error: 'Failed to create scope item' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: newItem }, { status: 201 });
  } catch (error: unknown) {
    console.error('Unexpected error in POST /scope:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PUT ─────────────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    const body = await request.json();

    const { id: itemId, work_type, description, unit, target_quantity } = body;

    if (!itemId) {
      return NextResponse.json({ error: 'id (scope item id) is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (work_type !== undefined) updates.work_type = work_type;
    if (description !== undefined) updates.description = description;
    if (unit !== undefined) updates.unit = unit;
    if (target_quantity !== undefined) updates.target_quantity = Number(target_quantity);

    const { data: updatedItem, error } = await supabaseAdmin
      .from('job_scope_items')
      .update(updates)
      .eq('id', itemId)
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating scope item:', error);
      return NextResponse.json({ error: 'Failed to update scope item' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updatedItem });
  } catch (error: unknown) {
    console.error('Unexpected error in PUT /scope:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    const itemId = request.nextUrl.searchParams.get('itemId');

    if (!itemId) {
      return NextResponse.json({ error: 'itemId query param is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('job_scope_items')
      .delete()
      .eq('id', itemId)
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error deleting scope item:', error);
      return NextResponse.json({ error: 'Failed to delete scope item' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { deleted: itemId } });
  } catch (error: unknown) {
    console.error('Unexpected error in DELETE /scope:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
