export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/jobs/[id]/change-orders
 * Manage change orders (extra/out-of-scope work) for a job.
 *
 * GET  — list change orders for the job (admin/sales staff)
 * POST — create a new change order (admin/sales staff)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    const { data, error } = await supabaseAdmin
      .from('change_orders')
      .select(`
        id,
        co_number,
        description,
        work_type,
        unit,
        target_quantity,
        cost_amount,
        price_amount,
        status,
        notes,
        customer_signature,
        customer_signed_at,
        created_by,
        created_at,
        approved_by,
        approved_at,
        rejected_by,
        rejected_at,
        rejection_reason,
        creator:created_by(full_name),
        approver:approved_by(full_name)
      `)
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching change orders:', error);
      return NextResponse.json({ error: 'Failed to fetch change orders' }, { status: 500 });
    }

    const totals = (data || []).reduce(
      (acc, co) => {
        const price = Number(co.price_amount || 0);
        const cost = Number(co.cost_amount || 0);
        if (co.status === 'approved' || co.status === 'invoiced') {
          acc.approved_price += price;
          acc.approved_cost += cost;
        }
        if (co.status === 'pending') {
          acc.pending_price += price;
        }
        return acc;
      },
      { approved_price: 0, approved_cost: 0, pending_price: 0 }
    );

    return NextResponse.json({
      success: true,
      data: {
        change_orders: data || [],
        totals,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /change-orders:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    const body = await request.json();

    const { description, work_type, unit, target_quantity, cost_amount, price_amount, notes } = body;

    if (!description || !String(description).trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    // Verify job exists and belongs to tenant
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('id')
      .eq('id', jobId)
      .eq('tenant_id', tenantId)
      .single();
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const { data: newCo, error } = await supabaseAdmin
      .from('change_orders')
      .insert({
        tenant_id: tenantId,
        job_order_id: jobId,
        description: String(description).trim(),
        work_type: work_type || null,
        unit: unit || null,
        target_quantity: target_quantity != null && !isNaN(Number(target_quantity)) ? Number(target_quantity) : null,
        cost_amount: cost_amount != null && !isNaN(Number(cost_amount)) ? Number(cost_amount) : 0,
        price_amount: price_amount != null && !isNaN(Number(price_amount)) ? Number(price_amount) : 0,
        notes: notes || null,
        status: 'pending',
        created_by: auth.userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating change order:', error);
      return NextResponse.json({ error: 'Failed to create change order' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: newCo }, { status: 201 });
  } catch (error: unknown) {
    console.error('Unexpected error in POST /change-orders:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
