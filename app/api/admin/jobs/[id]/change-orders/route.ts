export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/jobs/[id]/change-orders
 * Manage change orders (scope additions) for an in-progress job.
 *
 * GET  — list all change orders for a job (admin)
 * POST — create a new pending change order (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    const { data, error } = await supabaseAdmin
      .from('job_scope_additions')
      .select('*')
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching change orders:', error);
      return NextResponse.json({ error: 'Failed to fetch change orders' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /change-orders:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    const body = await request.json();

    const {
      scope_description,
      additional_work_items,
      additional_cost,
      additional_hours,
      notes,
      requires_schedule_update,
    } = body;

    if (!scope_description || typeof scope_description !== 'string' || !scope_description.trim()) {
      return NextResponse.json({ error: 'scope_description is required' }, { status: 400 });
    }
    if (additional_cost == null || isNaN(Number(additional_cost))) {
      return NextResponse.json({ error: 'additional_cost must be a number' }, { status: 400 });
    }

    // Determine next version number
    const { count, error: countError } = await supabaseAdmin
      .from('job_scope_additions')
      .select('id', { count: 'exact', head: true })
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId);

    if (countError) {
      console.error('Error counting change orders:', countError);
      return NextResponse.json({ error: 'Failed to determine version number' }, { status: 500 });
    }

    const version = (count ?? 0) + 1;

    const { data: created, error: insertError } = await supabaseAdmin
      .from('job_scope_additions')
      .insert({
        job_order_id: jobId,
        tenant_id: tenantId,
        version,
        scope_description: scope_description.trim(),
        additional_work_items: additional_work_items ?? [],
        additional_cost: Number(additional_cost),
        additional_hours: additional_hours != null ? Number(additional_hours) : null,
        notes: notes ?? null,
        requires_schedule_update: requires_schedule_update ?? false,
        status: 'pending',
        requested_by: auth.userId,
        requested_by_name: auth.userEmail,
        customer_notified: false,
        customer_approved: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating change order:', insertError);
      return NextResponse.json({ error: 'Failed to create change order' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('job_orders_history').insert({
        job_order_id: jobId,
        changed_by: auth.userId,
        changed_by_name: auth.userEmail,
        changed_by_role: auth.role,
        change_type: 'change_order_created',
        changes: {
          change_order_id: created.id,
          version,
          scope_description: created.scope_description,
          additional_cost: created.additional_cost,
        },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    console.error('Unexpected error in POST /change-orders:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
