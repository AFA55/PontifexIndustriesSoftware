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
import { loadJobProgress } from '@/lib/job-progress-server';

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });

    // Progress is DERIVED from the operator's work items — the actual record.
    // This used to read `job_progress_entries`, which nothing in the codebase
    // ever writes, so every job reported 0% no matter how much work was logged.
    const loaded = await loadJobProgress(jobId, tenantId);

    if (loaded.scope_items.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: {
          scope_items: [],
          overall_pct: 0,
          total_target: 0,
          total_completed: 0,
          unmatched_work: loaded.unmatched_work,
        },
      });
    }

    const sortOrderById = new Map(loaded.scope_items.map((s) => [s.id, s.sort_order ?? 0]));

    let totalTarget = 0;
    let totalCompleted = 0;

    const enrichedItems = loaded.scope_progress.map((row) => {
      // Percent-unit targets are excluded from the totals — there is no
      // quantity behind them, so folding them in would skew the overall figure.
      if (row.derivable) {
        totalTarget += row.target_quantity;
        totalCompleted += row.completed_quantity;
      }
      return {
        id: row.scope_item_id,
        work_type: row.work_type,
        description: row.description,
        unit: row.unit,
        target_quantity: row.target_quantity,
        completed_quantity: row.completed_quantity,
        pct_complete: row.pct_complete,
        derivable: row.derivable,
        entry_count: row.entry_count,
        ambiguous: row.ambiguous,
        sort_order: sortOrderById.get(row.scope_item_id) ?? 0,
      };
    });

    const overallPct =
      totalTarget > 0 ? parseFloat(Math.min(100, (totalCompleted / totalTarget) * 100).toFixed(1)) : 0;

    // Return scope items as `data` array for components that expect a list,
    // and also include `meta.scope_items` / totals for pages that use the
    // richer shape. This keeps both callers happy.
    return NextResponse.json({
      success: true,
      data: enrichedItems,
      meta: {
        scope_items: enrichedItems,
        overall_pct: overallPct,
        total_target: totalTarget,
        total_completed: totalCompleted,
        // Work the crew logged that no scope item accounts for — the office
        // should see this rather than wonder why the bar didn't move.
        unmatched_work: loaded.unmatched_work,
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
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const body = await request.json();

    const { work_type, description, unit, target_quantity } = body;

    if (!work_type) {
      return NextResponse.json({ error: 'work_type is required' }, { status: 400 });
    }
    if (target_quantity == null || isNaN(Number(target_quantity))) {
      return NextResponse.json({ error: 'target_quantity must be a number' }, { status: 400 });
    }

    // P0-3: verify parent job belongs to caller's tenant
    {
      const { data: jobCheck } = await supabaseAdmin
        .from('job_orders')
        .select('id')
        .eq('id', jobId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (!jobCheck) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
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
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const body = await request.json();

    const itemId = body.itemId || body.id;
    const { work_type, description, unit, target_quantity } = body;

    if (!itemId) {
      return NextResponse.json({ error: 'itemId (scope item id) is required' }, { status: 400 });
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
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
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
