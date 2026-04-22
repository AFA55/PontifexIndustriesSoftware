export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/jobs/[id]/billing-milestones
 * GET  — List all billing milestones for a job
 * POST — Create a new billing milestone checkpoint
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

    let query = supabaseAdmin
      .from('billing_milestones')
      .select('*')
      .eq('job_order_id', jobId);
    if (tenantId) query = query.eq('tenant_id', tenantId);

    const { data: milestones, error } = await query.order('milestone_percent', { ascending: true });

    if (error) {
      console.error('Error fetching billing milestones:', error);
      return NextResponse.json({ error: 'Failed to fetch billing milestones' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: milestones || [] });
  } catch (error: unknown) {
    console.error('Error in GET /billing-milestones:', error);
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
    const { milestone_percent, label } = body;

    if (typeof milestone_percent !== 'number' || milestone_percent < 0 || milestone_percent > 100) {
      return NextResponse.json(
        { error: 'milestone_percent must be a number between 0 and 100' },
        { status: 400 }
      );
    }
    if (!label?.trim()) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }

    // Verify the job exists and belongs to this tenant
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const { data: milestone, error: insertError } = await supabaseAdmin
      .from('billing_milestones')
      .insert({
        job_order_id: jobId,
        tenant_id: tenantId || null,
        milestone_percent,
        label: label.trim(),
        triggered_at: null,
        notification_sent: false,
        notified_at: null,
        invoice_id: null,
        created_by: auth.userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating billing milestone:', insertError);
      return NextResponse.json({ error: 'Failed to create billing milestone' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'billing_milestone_created',
        entity_type: 'billing_milestone',
        entity_id: milestone.id,
        details: { job_order_id: jobId, milestone_percent, label: label.trim() },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data: { milestone } }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error in POST /billing-milestones:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
