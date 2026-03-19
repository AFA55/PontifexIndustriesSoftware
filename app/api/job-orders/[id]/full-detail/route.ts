/**
 * API Route: GET /api/job-orders/[id]/full-detail
 * Fetch complete job order record with resolved operator and helper names.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    // Fetch full job record
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Resolve operator name
    let operator_name: string | null = null;
    if (job.assigned_to) {
      const { data: opProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.assigned_to)
        .single();
      operator_name = opProfile?.full_name || null;
    }

    // Resolve helper name
    let helper_name: string | null = null;
    if (job.helper_assigned_to) {
      const { data: helpProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.helper_assigned_to)
        .single();
      helper_name = helpProfile?.full_name || null;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...job,
        operator_name,
        helper_name,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching job full detail:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
