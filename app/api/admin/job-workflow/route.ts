/**
 * API Route: GET /api/admin/job-workflow
 * Fetch workflow progress for a job (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
    }

    // Fetch all workflow records for this job with operator info
    const { data: workflows, error } = await supabaseAdmin
      .from('workflow_steps')
      .select(`
        *,
        operator:profiles!workflow_steps_operator_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq('job_order_id', jobId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching workflows:', error);

      // Try without the join if the relationship doesn't exist
      const { data: simpleWorkflows, error: simpleError } = await supabaseAdmin
        .from('workflow_steps')
        .select('*')
        .eq('job_order_id', jobId)
        .order('created_at', { ascending: false });

      if (simpleError) {
        return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 });
      }

      // Fetch operator info separately
      const workflowsWithOperators = await Promise.all(
        (simpleWorkflows || []).map(async (workflow) => {
          const { data: operator } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', workflow.operator_id)
            .single();

          return {
            ...workflow,
            operator: operator || null
          };
        })
      );

      return NextResponse.json({ success: true, data: workflowsWithOperators }, { status: 200 });
    }

    return NextResponse.json({ success: true, data: workflows || [] }, { status: 200 });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
