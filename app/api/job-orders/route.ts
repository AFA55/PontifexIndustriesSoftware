/**
 * API Route: GET /api/job-orders
 * Get job orders assigned to the current operator (or all if admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const isAdmin = auth.role === 'admin';

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const includeCompleted = searchParams.get('includeCompleted') === 'true';
    const scheduledDate = searchParams.get('scheduled_date');

    // If ID is provided, fetch that specific job
    if (id) {
      const { data: specificJob, error: jobError } = await supabaseAdmin
        .from('active_job_orders')
        .select('*')
        .eq('id', id)
        .single();

      if (jobError) {
        console.error('Error fetching specific job:', jobError);
        return NextResponse.json(
          { error: 'Failed to fetch job' },
          { status: 500 }
        );
      }

      if (!specificJob) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        );
      }

      // Check if user has access: admin, directly assigned, or in crew
      if (!isAdmin && specificJob.assigned_to !== auth.userId) {
        // Also check crew assignments
        const { data: crewCheck } = await supabaseAdmin
          .from('job_crew_assignments')
          .select('id')
          .eq('job_order_id', id)
          .eq('operator_id', auth.userId)
          .is('removed_at', null)
          .single();

        if (!crewCheck) {
          return NextResponse.json(
            { error: 'Unauthorized to view this job' },
            { status: 403 }
          );
        }
      }

      // Fetch operator profile data for autofilling forms
      const { data: operatorProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, phone_number, email')
        .eq('id', auth.userId)
        .single();

      let assignedOperatorProfile = null;
      if (specificJob.assigned_to) {
        const { data: assignedProfile } = await supabaseAdmin
          .from('profiles')
          .select('full_name, phone_number, email')
          .eq('id', specificJob.assigned_to)
          .single();
        assignedOperatorProfile = assignedProfile;
      }

      return NextResponse.json(
        {
          success: true,
          data: [specificJob],
          operator_profile: operatorProfile,
          assigned_operator_profile: assignedOperatorProfile
        },
        { status: 200 }
      );
    }

    // Build query from active_job_orders view
    let query = supabaseAdmin
      .from('active_job_orders')
      .select('*');

    // If not admin, show jobs assigned to this user (direct or crew)
    if (!isAdmin) {
      // Get job IDs where this operator is in the crew
      const { data: crewJobs } = await supabaseAdmin
        .from('job_crew_assignments')
        .select('job_order_id')
        .eq('operator_id', auth.userId)
        .is('removed_at', null);

      const crewJobIds = crewJobs?.map(c => c.job_order_id) || [];

      if (crewJobIds.length > 0) {
        // Show jobs where directly assigned OR in crew
        query = query.or(`assigned_to.eq.${auth.userId},id.in.(${crewJobIds.join(',')})`);
      } else {
        query = query.eq('assigned_to', auth.userId);
      }
    }

    // Filter by scheduled_date if provided
    if (scheduledDate) {
      query = query.eq('scheduled_date', scheduledDate);
    }

    query = query.order('scheduled_date', { ascending: true });

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Exclude completed jobs unless explicitly requested
    if (!includeCompleted) {
      query = query.neq('status', 'completed');
    }

    const { data: jobOrders, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching job orders:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch job orders' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: jobOrders || [],
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in job orders route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
